import { runReceptionistBrain, brainHealth, buildReceptionistPrompt } from "./receptionist_brain.mjs";
import { installLlmConfig, getLlmConfig, saveLlmConfig, testLlmConfig, callConfiguredLlm } from "./llm_config.mjs";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { installAuth, authenticate, handleAuthApi, requirePermission, audit } from "./auth.mjs";
import { isFreePreview, provisionFreePreview } from "./free-preview.mjs";
import { browserMutationAllowed, requestIp } from "./request-security.mjs";
import { installWhatsAppBackfill, handleWhatsAppBackfillApi } from "./whatsapp-backfill.mjs";
import { installWhatsApp, wahaConfigured, wahaStatus, ensureWahaSession, wahaQr, verifyWebhook, listConversations, conversationMessages, markConversationRead, sendConversationMessage, ingestWahaEvent, sendText, registerTenantSession, sessionForTenant, tenantForWahaEvent, syncWahaHistory } from "./whatsapp.mjs";
import { installPhase2, handlePhase2Api } from "./phase2.mjs";
import { installPhase3, handlePhase3Api } from "./phase3.mjs";
import { handleOwnerEyeApi } from "./owner-eye.mjs";
import { installPhase4, ensureAgentProfiles, handlePhase4Api, getAgentConfig } from "./phase4.mjs";
import { installPhase5, handlePhase5Api } from "./phase5.mjs";
import { installTenantAdministration, handleTenantAdministrationApi } from "./tenant-admin.mjs";
import { installPhase6, handlePhase6Api } from "./phase6.mjs";
import { installMarketing, handleMarketingApi } from "./marketing.mjs";
import { installPhase7, handlePhase7Api } from "./phase7.mjs";
import { installPhase8, handlePhase8Api } from "./phase8.mjs";
import { installPhase9, handlePhase9Api, staffWindowForDate } from "./phase9.mjs";
import { installPhase10, handlePhase10Api } from "./phase10.mjs";
import { installPhase11, handlePhase11Api } from "./phase11.mjs";
import { checkManualStatusTransition } from "./appointment-status.mjs";
import { installCommercialAutomation, policy as commercialPolicy, registerIncoming, afterAppointmentCreated, afterAppointmentStatus, receptionistDraft } from "./commercial-automation.mjs";
import { handleCommercialApi } from "./commercial-api.mjs";
import { installBookingFlow, bookingTurn, bookingState, handoffBooking, isBookingRequest } from "./booking-flow.mjs";
import { localTimeToUtc } from "./slot-time.mjs";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||9331);
const HOST=process.env.HOST||"127.0.0.1";
const DB_PATH=process.env.SALON_DB||path.join(__dirname,"data","salon.sqlite");
const JEV_BASE=String(process.env.JEV_CONTROL_PLANE_URL||"http://100.68.82.8:9320").replace(/\/+$/,"");
const DEFAULT_TENANT="11111111-1111-4111-8111-111111111111";
// O atendimento automático exige habilitação operacional, política ativa e recepcionista ligada.
const WAHA_AGENT_ENABLED=process.env.NOVAGENTE_ENABLE_RECEPTIONIST_AI==="true";
function liveReceptionistEnabled(tenantId){
  const enabled=one("select enabled from agent_profiles where tenant_id=? and agent_key='receptionist'",[tenantId]);
  return WAHA_AGENT_ENABLED
    && process.env.NOVAGENTE_AUTOMATION_V2_APPROVED==="true"
    && Number(enabled?.enabled)===1
    && commercialPolicy(db,tenantId,"assistant_reply");
}

fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
const db=new DatabaseSync(DB_PATH);
db.exec("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");

function id(){return crypto.randomUUID()}
function now(){return new Date().toISOString()}
function normalizePhone(v=""){return String(v).replace(/\D/g,"").replace(/^0+/,"")}
function jparse(v,fallback={}){try{return JSON.parse(v)}catch{return fallback}}
function baseSecurityHeaders(){
  return {
    "x-content-type-options":"nosniff",
    "x-frame-options":"DENY",
    "referrer-policy":"no-referrer",
    "permissions-policy":"camera=(), microphone=(self), geolocation=()",
    "cross-origin-opener-policy":"same-origin",
    "content-security-policy":"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
  };
}
function send(res,status,data,headers={}){
  const body=typeof data==="string"?data:JSON.stringify(data);
  res.writeHead(status,{...baseSecurityHeaders(),"content-type":typeof data==="string"?"text/plain; charset=utf-8":"application/json; charset=utf-8","cache-control":"no-store",...headers});
  res.end(body);
}
function parseBody(req,maxBytes=1_000_000){
  return new Promise((resolve,reject)=>{
    let body="";
    req.on("data",c=>{body+=c;if(body.length>maxBytes){reject(Object.assign(new Error("payload_too_large"),{status:413}));req.destroy()}});
    req.on("end",()=>{if(!body)return resolve({});try{resolve(JSON.parse(body))}catch{reject(new Error("invalid_json"))}});
    req.on("error",reject);
  });
}
function safeText(v,max=500){return String(v??"").trim().slice(0,max)}
function csvCell(v){let s=String(v??"").replace(/[\r\n]/g," ");if(/^[\s]*[=+@\-\t]/.test(s))s="\u0027"+s;return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
const trafficBuckets=new Map();
function clientIp(req){return requestIp(req)}
function trafficLimit(req,url){
  const publicAuth=url.pathname.startsWith("/api/auth/");
  const windowMs=publicAuth?15*60*1000:60*1000,limit=publicAuth?60:600,nowMs=Date.now();
  const key=(publicAuth?"public":"api")+"|"+clientIp(req),prev=trafficBuckets.get(key);
  const b=!prev||nowMs-prev.started>=windowMs?{started:nowMs,count:0}:prev;
  b.count++;trafficBuckets.set(key,b);
  if(trafficBuckets.size>5000)for(const [k,v] of trafficBuckets)if(nowMs-v.started>30*60*1000)trafficBuckets.delete(k);
  return b.count>limit?Math.max(1,Math.ceil((windowMs-(nowMs-b.started))/1000)):0;
}
function tenantFrom(req){return safeText(req.headers["x-tenant-id"]||DEFAULT_TENANT,64)}
function routeMatch(url,pattern){
  const a=url.split("/").filter(Boolean),b=pattern.split("/").filter(Boolean);
  if(a.length!==b.length)return null;
  const p={};
  for(let i=0;i<a.length;i++){
    if(b[i].startsWith(":"))p[b[i].slice(1)]=decodeURIComponent(a[i]);
    else if(a[i]!==b[i])return null;
  }
  return p;
}
function all(sql,params=[]){return db.prepare(sql).all(...params)}
function one(sql,params=[]){return db.prepare(sql).get(...params)}
function run(sql,params=[]){return db.prepare(sql).run(...params)}

db.exec(`
CREATE TABLE IF NOT EXISTS tenants(
 id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT UNIQUE NOT NULL,timezone TEXT NOT NULL DEFAULT 'America/Porto_Velho',created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,
 UNIQUE(tenant_id,email),FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
CREATE TABLE IF NOT EXISTS clients(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,phone TEXT,email TEXT,birthday TEXT,instagram TEXT,facebook TEXT,referral_reference TEXT,tags TEXT NOT NULL DEFAULT '[]',notes TEXT NOT NULL DEFAULT '',
 preferred_professional_id TEXT,allergies TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT 'manual',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_clients_tenant_phone ON clients(tenant_id,phone);
CREATE TABLE IF NOT EXISTS professionals(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,phone TEXT,role TEXT NOT NULL DEFAULT 'professional',specialties TEXT NOT NULL DEFAULT '[]',
 active INTEGER NOT NULL DEFAULT 1,work_start TEXT NOT NULL DEFAULT '09:00',work_end TEXT NOT NULL DEFAULT '18:00',created_at TEXT NOT NULL,
 FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
CREATE TABLE IF NOT EXISTS services(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,category TEXT,duration_min INTEGER NOT NULL DEFAULT 60,price_cents INTEGER NOT NULL DEFAULT 0,
 commission_pct REAL NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,FOREIGN KEY(tenant_id) REFERENCES tenants(id)
);
CREATE TABLE IF NOT EXISTS professional_services(
 professional_id TEXT NOT NULL,service_id TEXT NOT NULL,PRIMARY KEY(professional_id,service_id),
 FOREIGN KEY(professional_id) REFERENCES professionals(id),FOREIGN KEY(service_id) REFERENCES services(id)
);
CREATE TABLE IF NOT EXISTS resources(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,type TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS appointments(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT NOT NULL,professional_id TEXT NOT NULL,service_id TEXT NOT NULL,resource_id TEXT,
 start_at TEXT NOT NULL,end_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'scheduled',notes TEXT NOT NULL DEFAULT '',source TEXT NOT NULL DEFAULT 'manual',
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 FOREIGN KEY(client_id) REFERENCES clients(id),FOREIGN KEY(professional_id) REFERENCES professionals(id),
 FOREIGN KEY(service_id) REFERENCES services(id),FOREIGN KEY(resource_id) REFERENCES resources(id)
);
CREATE INDEX IF NOT EXISTS idx_appointments_tenant_start ON appointments(tenant_id,start_at);
CREATE TABLE IF NOT EXISTS appointment_items(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,appointment_id TEXT NOT NULL,service_id TEXT NOT NULL,professional_id TEXT NOT NULL,
 qty INTEGER NOT NULL DEFAULT 1,unit_price_cents INTEGER NOT NULL DEFAULT 0,duration_min INTEGER NOT NULL DEFAULT 60,sequence INTEGER NOT NULL DEFAULT 0,
 start_at TEXT NOT NULL,end_at TEXT NOT NULL,created_at TEXT NOT NULL,
 FOREIGN KEY(appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,FOREIGN KEY(service_id) REFERENCES services(id),FOREIGN KEY(professional_id) REFERENCES professionals(id)
);
CREATE INDEX IF NOT EXISTS idx_appointment_items_prof_time ON appointment_items(tenant_id,professional_id,start_at,end_at);
CREATE INDEX IF NOT EXISTS idx_appointment_items_appointment ON appointment_items(appointment_id,sequence);
CREATE TABLE IF NOT EXISTS conversations(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT,channel TEXT NOT NULL DEFAULT 'whatsapp',external_id TEXT,status TEXT NOT NULL DEFAULT 'open',
 assigned_user_id TEXT,last_message_at TEXT,created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jev_receipts(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,purpose TEXT NOT NULL,input_excerpt TEXT,local_route TEXT,jev_trace_id TEXT,jev_decision TEXT,
 probability REAL,source TEXT,fallback_used INTEGER NOT NULL DEFAULT 0,latency_ms INTEGER,created_at TEXT NOT NULL
);
`);
const appointmentCols=all("pragma table_info(appointments)").map(x=>x.name);
if(!appointmentCols.includes("tags"))run("alter table appointments add column tags TEXT NOT NULL DEFAULT '[]'");
const clientCols=all("pragma table_info(clients)").map(x=>x.name);
if(!clientCols.includes("instagram"))run("alter table clients add column instagram TEXT");
if(!clientCols.includes("facebook"))run("alter table clients add column facebook TEXT");
if(!clientCols.includes("referral_reference"))run("alter table clients add column referral_reference TEXT");

function ensureSeed(){
  if(one("select id from tenants where id=?",[DEFAULT_TENANT]))return;
  run("insert into tenants(id,name,slug,timezone,created_at) values(?,?,?,?,?)",[DEFAULT_TENANT,"Studio Aurora","studio-aurora","America/Porto_Velho",now()]);
  run("insert into users(id,tenant_id,name,email,role,created_at) values(?,?,?,?,?,?)",[id(),DEFAULT_TENANT,"Dona do Salão","dona@studio.local","owner",now()]);
  if(process.env.NOVAGENTE_EMPTY_INITIAL_TENANT==="true")return; // ambiente de pareamento sem clientes/horários fictícios
  const profs=[
    ["Ana Ribeiro","Cabeleireira",["Coloração","Corte","Tratamentos"],"09:00","18:00"],
    ["Bia Costa","Nail Designer",["Manicure","Gel"],"09:00","19:00"],
    ["Lara Melo","Esteticista",["Sobrancelha","Cílios"],"10:00","18:00"]
  ].map(([name,role,spec,start,end])=>({id:id(),name,role,spec,start,end}));
  for(const p of profs)run("insert into professionals(id,tenant_id,name,role,specialties,work_start,work_end,created_at) values(?,?,?,?,?,?,?,?)",[p.id,DEFAULT_TENANT,p.name,p.role,JSON.stringify(p.spec),p.start,p.end,now()]);
  const svcs=[
    ["Coloração","Cabelo",120,28000,35],["Corte feminino","Cabelo",60,12000,40],["Hidratação","Cabelo",45,9000,35],
    ["Manicure","Unhas",50,5500,50],["Banho de gel","Unhas",90,12000,45],["Design de sobrancelha","Estética",40,7000,45]
  ].map(([name,cat,dur,price,comm])=>({id:id(),name,cat,dur,price,comm}));
  for(const s of svcs)run("insert into services(id,tenant_id,name,category,duration_min,price_cents,commission_pct,created_at) values(?,?,?,?,?,?,?,?)",[s.id,DEFAULT_TENANT,s.name,s.cat,s.dur,s.price,s.comm,now()]);
  for(const s of svcs)for(const p of profs){
    const ok=(p.role==="Cabeleireira"&&s.cat==="Cabelo")||(p.role==="Nail Designer"&&s.cat==="Unhas")||(p.role==="Esteticista"&&s.cat==="Estética");
    if(ok)run("insert or ignore into professional_services(professional_id,service_id) values(?,?)",[p.id,s.id]);
  }
  const clients=[
    ["Juliana Oliveira","69999990001",["VIP","Coloração"],"Prefere café sem açúcar."],
    ["Marina Souza","69999990002",["Recorrente"],"Gosta de horários no fim da tarde."],
    ["Camila Santos","69999990003",["Nova"],""],["Patrícia Lima","69999990004",["Unhas"],"Prefere atendimento com Bia."]
  ].map(([name,phone,tags,notes])=>({id:id(),name,phone,tags,notes}));
  for(const c of clients)run("insert into clients(id,tenant_id,name,phone,tags,notes,created_at,updated_at) values(?,?,?,?,?,?,?,?)",[c.id,DEFAULT_TENANT,c.name,c.phone,JSON.stringify(c.tags),c.notes,now(),now()]);
  const tomorrow=new Date(Date.now()+86400000);tomorrow.setHours(10,0,0,0);
  run("insert into appointments(id,tenant_id,client_id,professional_id,service_id,start_at,end_at,status,source,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)",
      [id(),DEFAULT_TENANT,clients[0].id,profs[0].id,svcs[0].id,tomorrow.toISOString(),new Date(tomorrow.getTime()+120*60000).toISOString(),"confirmed","seed",now(),now()]);
}
ensureSeed();
installAuth(db);
provisionFreePreview(db,DEFAULT_TENANT);
installWhatsApp(db);
installWhatsAppBackfill(db);
installLlmConfig(db);
if(!sessionForTenant(db,DEFAULT_TENANT))registerTenantSession(db,DEFAULT_TENANT);
installPhase2(db);
installPhase3(db);
installPhase4(db);
installPhase5(db);
installTenantAdministration(db);
installPhase6(db);
installMarketing(db);
installCommercialAutomation(db);
installBookingFlow(db);
installPhase7(db);
installPhase8(db);
installPhase9(db);
installPhase10(db);
installPhase11(db);
ensureAgentProfiles(db,DEFAULT_TENANT);
db.exec(`
CREATE TABLE IF NOT EXISTS waitlist(
 id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT NOT NULL,service_id TEXT NOT NULL,professional_id TEXT,
 preferred_date TEXT,period TEXT NOT NULL DEFAULT 'any',notes TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'waiting',
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 FOREIGN KEY(client_id) REFERENCES clients(id),FOREIGN KEY(service_id) REFERENCES services(id),FOREIGN KEY(professional_id) REFERENCES professionals(id)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_tenant_status ON waitlist(tenant_id,status,preferred_date);
`);
if(!one("select id from resources where tenant_id=? limit 1",[DEFAULT_TENANT])){
  for(const [name,type] of [["Cadeira 1","chair"],["Cadeira 2","chair"],["Lavatório 1","washbasin"],["Sala Estética","room"]])
    run("insert into resources(id,tenant_id,name,type,active) values(?,?,?,?,1)",[id(),DEFAULT_TENANT,name,type]);
}

function clientView(r){return {...r,tags:jparse(r.tags,[])}}
function professionalView(r){return {...r,specialties:jparse(r.specialties,[]),active:!!r.active}}
function serviceView(r){return {...r,price:Number(r.price_cents)/100,active:!!r.active}}
function dashboard(tenant){
  const d=new Date(),start=new Date(d);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
  const apps=all(`select a.*,c.name client_name,p.name professional_name,s.name service_name,s.price_cents
    from appointments a join clients c on c.id=a.client_id join professionals p on p.id=a.professional_id join services s on s.id=a.service_id
    where a.tenant_id=? and a.start_at>=? and a.start_at<? order by a.start_at`,[tenant,start.toISOString(),end.toISOString()]);
  const forecast=apps.filter(a=>!["cancelled","no_show"].includes(a.status)).reduce((n,a)=>n+Number(a.price_cents||0),0);
  return {
    todayAppointments:apps.length,forecast:forecast/100,
    openConversations:Number(one("select count(*) n from conversations where tenant_id=? and status='open'",[tenant])?.n||0),
    clientCount:Number(one("select count(*) n from clients where tenant_id=?",[tenant])?.n||0),
    profCount:Number(one("select count(*) n from professionals where tenant_id=? and active=1",[tenant])?.n||0),appointments:apps
  };
}
function localIntent(text){
  const t=text.toLowerCase();
  const rules=[
    ["appointment_cancel",/(cancel|desmarc|não vou|nao vou)/],
    ["appointment_reschedule",/(reagend|remarc|trocar.*hor|mudar.*hor)/],
    ["appointment_book",/(agend|marcar|marca[r ]|hor[aá]rio|vaga|tem.*amanh|tem.*hoje)/],
    ["price",/(pre[cç]o|quanto custa|valor)/],
    ["service",/(servi[cç]o|fazem|voc[eê]s fazem)/],
    ["human",/(atendente|pessoa|humano|recep[cç][aã]o)/]
  ];
  for(const [route,re] of rules)if(re.test(t))return {route,confidence:.97,source:"local_rule"};
  return {route:"ambiguous",confidence:.35,source:"local_rule"};
}
async function jevDecision(text,context={}){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),2500);
  try{
    const r=await fetch(JEV_BASE+"/jev/decision",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({reflex:"route",text,context:{domain:"salon",...context}}),signal:ctrl.signal});
    if(!r.ok)throw new Error("jev_http_"+r.status);
    return await r.json();
  }catch(e){
    return {decision:"general",probability:null,trace_id:null,source:"fallback",fallback_used:true,latency_ms:null,error:String(e.message||e)};
  }finally{clearTimeout(timer)}
}
async function interpret(tenant,text){
  const local=localIntent(text);
  let j=null;
  if(local.route==="ambiguous"){const rc=getAgentConfig(db,tenant,"receptionist");j=await jevDecision(text,{tenant_id:tenant,agent:"receptionist",tone:rc.voice?.tone||"warm",formality:rc.voice?.formality??3,directness:rc.voice?.directness??7,custom_instructions:String(rc.custom_instructions||"").slice(0,2000)});}
  run(`insert into jev_receipts(id,tenant_id,purpose,input_excerpt,local_route,jev_trace_id,jev_decision,probability,source,fallback_used,latency_ms,created_at)
       values(?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id(),tenant,"salon.intent.route",text.slice(0,240),local.route,j?.trace_id||null,j?.decision||null,j?.probability??null,j?.source||local.source,j?.fallback_used?1:0,j?.latency_ms??null,now()]);
  const allowed=new Set(["general","appointment_book","appointment_cancel","appointment_reschedule","price","service","human"]);const resolved=local.route==="ambiguous"&&allowed.has(String(j?.decision||""))?String(j.decision):local.route;
  return {route:resolved,confidence:resolved!==local.route?(j?.probability??local.confidence):local.confidence,source:resolved!==local.route?(j?.source||"jev"):local.source,jev:j};
}


function normText(v=""){return String(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
function todayInTimezone(timeZone="America/Porto_Velho"){
  const parts=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const m=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return m.year+"-"+m.month+"-"+m.day;
}
function addDaysDate(date,days){const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function dateFromText(text,timeZone="America/Porto_Velho"){
  const n=normText(text),today=todayInTimezone(timeZone);
  if(/\bdepois de amanha\b/.test(n))return addDaysDate(today,2);
  if(/\bamanha\b/.test(n))return addDaysDate(today,1);
  if(/\bhoje\b/.test(n))return today;
  const m=String(text).match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if(m){const y=m[3]?(m[3].length===2?"20"+m[3]:m[3]):today.slice(0,4);return y+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0")}
  return null;
}
function localIso(date,time,timeZone="America/Porto_Velho"){
  return localTimeToUtc(date,time,timeZone);
}
function appointmentItemsFor(appointmentId){
  return all("select ai.*,s.name service_name,p.name professional_name from appointment_items ai join services s on s.id=ai.service_id join professionals p on p.id=ai.professional_id where ai.appointment_id=? order by ai.sequence",[appointmentId]);
}
function appointmentApiView(x){
  const items=appointmentItemsFor(x.id);
  const totalCents=items.length?items.reduce((sum,i)=>sum+Number(i.unit_price_cents||0)*Number(i.qty||1),0):Number(x.price_cents||0);
  let tags=[];try{tags=JSON.parse(x.tags||"[]")}catch{}
  return Object.assign({},x,{price:totalCents/100,tags,items,service_summary:items.length?items.map(i=>i.service_name+(Number(i.qty||1)>1?" ×"+i.qty:"")).join(" + "):x.service_name,professional_summary:items.length?[...new Set(items.map(i=>i.professional_name))].join(", "):x.professional_name});
}

function createAppointmentRecord(tenant,user,b){
  const client=one("select * from clients where id=? and tenant_id=?",[safeText(b.client_id,64),tenant]);
  const resource=b.resource_id?one("select * from resources where id=? and tenant_id=? and active=1",[safeText(b.resource_id,64),tenant]):null;
  if(!client||(b.resource_id&&!resource)){const e=new Error("invalid_client_or_resource");e.status=400;throw e}
  const start=new Date(b.start_at);if(Number.isNaN(start.getTime())){const e=new Error("invalid_start_at");e.status=400;throw e}
  const rawItems=[{service_id:b.service_id,professional_id:b.professional_id,qty:b.primary_qty||1},...(Array.isArray(b.items)?b.items.slice(0,20):[])];
  if(!rawItems.length){const e=new Error("appointment_items_required");e.status=400;throw e}
  db.exec("BEGIN IMMEDIATE");
  try{
    const resolved=[],createdAt=now();
    for(let i=0;i<rawItems.length;i++){
      const raw=rawItems[i]||{},professional=one("select * from professionals where id=? and tenant_id=? and active=1",[safeText(raw.professional_id,64),tenant]);
      if(!professional){const e=new Error("invalid_professional");e.status=400;throw e}
      let service=raw.service_id?one("select * from services where id=? and tenant_id=? and active=1",[safeText(raw.service_id,64),tenant]):null;
      if(!service){
        const customName=safeText(raw.custom_name,120),duration=Math.max(5,Math.min(480,Number(raw.custom_duration||0))),priceCents=Math.max(0,Math.round(Number(raw.custom_price||0)*100));
        if(!customName||!Number.isFinite(duration)||duration<5||!Number.isFinite(priceCents)){const e=new Error("invalid_custom_service");e.status=400;throw e}
        service=one("select * from services where tenant_id=? and active=1 and lower(name)=lower(?) order by created_at desc limit 1",[tenant,customName]);
        if(!service){
          const sid=id();run("insert into services(id,tenant_id,name,category,duration_min,price_cents,commission_pct,active,created_at) values(?,?,?,?,?,?,?,?,?)",[sid,tenant,customName,"Avulso",duration,priceCents,0,1,createdAt]);
          service=one("select * from services where id=?",[sid]);
        }
        run("insert or ignore into professional_services(professional_id,service_id) values(?,?)",[professional.id,service.id]);
      }
      const qty=Math.max(1,Math.min(20,Math.round(Number(raw.qty||1))));
      resolved.push({service,professional,qty});
    }
    let cursor=new Date(start),seq=0;
    const segments=[];
    for(const item of resolved){
      const itemStart=new Date(cursor),minutes=Number(item.service.duration_min||60)*item.qty,itemEnd=new Date(itemStart.getTime()+minutes*60000);
      if(professionalHasConflict(tenant,item.professional.id,itemStart.toISOString(),itemEnd.toISOString())){const e=new Error("professional_time_conflict");e.status=409;e.professional=item.professional.name;throw e}
      segments.push({...item,sequence:seq++,start_at:itemStart.toISOString(),end_at:itemEnd.toISOString()});
      cursor=itemEnd;
    }
    if(resource){
      const rc=one("select id from appointments where tenant_id=? and resource_id=? and status not in ('cancelled','no_show') and start_at<? and end_at>? limit 1",[tenant,resource.id,cursor.toISOString(),start.toISOString()]);
      if(rc){const e=new Error("resource_time_conflict");e.status=409;e.resource=resource.name;throw e}
    }
    if(b.source==="assistant"){
      if(segments.length!==1){const e=new Error("assistant_single_service_only");e.status=400;throw e}
      const zone=one("select timezone from tenants where id=?",[tenant])?.timezone||"America/Porto_Velho";
      const dateParts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(start).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
      const localDate=dateParts.year+"-"+dateParts.month+"-"+dateParts.day;
      const verified=availabilityFor(tenant,{date:localDate,serviceId:segments[0].service.id,professionalId:segments[0].professional.id,resourceId:resource?.id||null,limit:100});
      if(!verified.some(slot=>slot.start_at===start.toISOString()&&slot.professional_id===segments[0].professional.id)){
        const e=new Error("assistant_slot_no_longer_available");e.status=409;throw e;
      }
    }
    const selected=(Array.isArray(b.tags)?b.tags:[]).map(x=>safeText(x,40)).filter(Boolean),tagSet=new Set(selected);
    const prior=Number(one("select count(*) n from appointments where tenant_id=? and client_id=? and status='completed'",[tenant,client.id])?.n||0);
    tagSet.add(prior?"Retorno":"Primeira visita");
    if(safeText(client.allergies,400))tagSet.add("Alergia");
    const chemistry=resolved.some(x=>/quim|color|progress|descolor|alis/i.test((x.service.name||"")+" "+(x.service.category||"")));
    if(chemistry)tagSet.add("Química");
    const tags=[...tagSet].slice(0,20),aid=id(),primary=segments[0];
    run("insert into appointments(id,tenant_id,client_id,professional_id,service_id,resource_id,start_at,end_at,status,notes,source,tags,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[aid,tenant,client.id,primary.professional.id,primary.service.id,resource?.id||null,start.toISOString(),cursor.toISOString(),safeText(b.status||"scheduled",32),safeText(b.notes,1000),safeText(b.source||"manual",32),JSON.stringify(tags),createdAt,createdAt]);
    for(const item of segments)run("insert into appointment_items(id,tenant_id,appointment_id,service_id,professional_id,qty,unit_price_cents,duration_min,sequence,start_at,end_at,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",[id(),tenant,aid,item.service.id,item.professional.id,item.qty,Number(item.service.price_cents||0),Number(item.service.duration_min||60),item.sequence,item.start_at,item.end_at,createdAt]);
    audit(db,user,"appointment.create","appointment",aid,{clientId:client.id,itemCount:segments.length,tags,resourceId:resource?.id||null});
    db.exec("COMMIT");
    return {id:aid,start_at:start.toISOString(),end_at:cursor.toISOString(),status:b.status||"scheduled",tags,items:segments.map(x=>({service_id:x.service.id,service_name:x.service.name,professional_id:x.professional.id,professional_name:x.professional.name,qty:x.qty,start_at:x.start_at,end_at:x.end_at,price:Number(x.service.price_cents||0)/100}))};
  }catch(e){try{db.exec("ROLLBACK")}catch{}throw e}
}

function professionalHasConflict(tenant,professionalId,start,end){
  const legacy=one("select a.id from appointments a where a.tenant_id=? and a.professional_id=? and a.status not in ('cancelled','no_show') and not exists(select 1 from appointment_items ai where ai.appointment_id=a.id) and a.start_at<? and a.end_at>? limit 1",[tenant,professionalId,end,start]);
  if(legacy)return legacy;
  return one("select ai.id from appointment_items ai join appointments a on a.id=ai.appointment_id where ai.tenant_id=? and ai.professional_id=? and a.status not in ('cancelled','no_show') and ai.start_at<? and ai.end_at>? limit 1",[tenant,professionalId,end,start]);
}
function availabilityFor(tenant,{date,serviceId,professionalId=null,resourceId=null,limit=40}){
  const service=one("select * from services where id=? and tenant_id=? and active=1",[serviceId,tenant]);if(!service)return [];
  const tz=one("select timezone from tenants where id=?",[tenant])?.timezone||"America/Porto_Velho";
  let pros;
  if(professionalId)pros=all("select p.* from professionals p where p.id=? and p.tenant_id=? and p.active=1 and (exists(select 1 from professional_services ps where ps.professional_id=p.id and ps.service_id=?) or not exists(select 1 from professional_services px where px.service_id=?))",[professionalId,tenant,serviceId,serviceId]);
  else pros=all("select p.* from professionals p where p.tenant_id=? and p.active=1 and (exists(select 1 from professional_services ps where ps.professional_id=p.id and ps.service_id=?) or not exists(select 1 from professional_services px where px.service_id=?)) order by p.name",[tenant,serviceId,serviceId]);
  const resource=resourceId?one("select * from resources where id=? and tenant_id=? and active=1",[resourceId,tenant]):null;
  const out=[],step=30,dur=Number(service.duration_min);
  for(const p of pros){
    const window=staffWindowForDate(db,tenant,p.id,date);if(!window)continue;
    const sh=Number(window.start.slice(0,2))*60+Number(window.start.slice(3,5)),eh=Number(window.end.slice(0,2))*60+Number(window.end.slice(3,5));
    for(let min=sh;min+dur<=eh;min+=step){
      const hh=String(Math.floor(min/60)).padStart(2,"0"),mm=String(min%60).padStart(2,"0");
      let start;try{start=localIso(date,hh+":"+mm,tz)}catch{continue}
      const end=new Date(new Date(start).getTime()+dur*60000).toISOString();
      const pc=professionalHasConflict(tenant,p.id,start,end);
      if(pc)continue;
      if(resource){
        const rc=one("select id from appointments where tenant_id=? and resource_id=? and status not in ('cancelled','no_show') and start_at<? and end_at>? limit 1",[tenant,resource.id,end,start]);
        if(rc)continue;
      }
      out.push({professional_id:p.id,professional_name:p.name,service_id:service.id,service_name:service.name,resource_id:resource?.id||null,resource_name:resource?.name||null,start_at:start,end_at:end,local_time:hh+":"+mm});
      if(out.length>=limit)return out;
    }
  }
  return out;
}
function bookingSuggestion(tenant,text){
  const n=normText(text),services=all("select * from services where tenant_id=? and active=1",[tenant]),pros=all("select * from professionals where tenant_id=? and active=1",[tenant]);
  const service=services.sort((a,b)=>b.name.length-a.name.length).find(s=>n.includes(normText(s.name)))||null;
  const professional=pros.find(p=>{const full=normText(p.name),first=full.split(/\s+/)[0];return n.includes(full)||new RegExp("\\b"+first+"\\b").test(n)})||null;
  const date=dateFromText(text,one("select timezone from tenants where id=?",[tenant])?.timezone||"America/Porto_Velho");
  const missing=[];if(!service)missing.push("service");if(!date)missing.push("date");
  const slots=!missing.length?availabilityFor(tenant,{date,serviceId:service.id,professionalId:professional?.id||null,limit:8}):[];
  return {service:service?{id:service.id,name:service.name,duration_min:service.duration_min,price:Number(service.price_cents)/100}:null,professional:professional?{id:professional.id,name:professional.name}:null,date,missing,slots};
}

function serviceMention(tenant,text){
  const n=normText(text),services=all("select * from services where tenant_id=? and active=1 order by length(name) desc,name",[tenant]);
  return services.find(s=>n.includes(normText(s.name)))||null;
}
function moneyText(cents){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(cents||0)/100)}
function parseExternalReceptionist(text,meta={}){
  const raw=String(text||"").trim(),a=raw.indexOf("{"),b=raw.lastIndexOf("}");
  let p=null;try{p=JSON.parse(raw)}catch{if(a>=0&&b>a)try{p=JSON.parse(raw.slice(a,b+1))}catch{}}
  if(!p||typeof p.reply!=="string")throw new Error("llm_output_invalid");
  const intents=new Set(["general","price","service","appointment_book","appointment_cancel","appointment_reschedule","complaint","human","other"]);
  return {text:String(p.reply).trim().slice(0,3500),intent:intents.has(p.intent)?p.intent:"other",handoff:!!p.handoff,reason:String(p.reason||"").slice(0,200),confidence:Math.max(0,Math.min(1,Number(p.confidence||0))),entities:p.entities&&typeof p.entities==="object"?p.entities:{},meta};
}
async function receptionistAgentReply({tenantId,client,conversation,text,intent}){
  const safety=receptionistDraft({text});
  if(safety.handoff){
    handoffBooking(db,tenantId,conversation.id);
    return {handoff:true,reason:safety.reason,meta:{source:"commercial_safety_guard",intent:safety.intent}};
  }
  const profile=one("select enabled from agent_profiles where tenant_id=? and agent_key='receptionist'",[tenantId]);
  if(Number(profile?.enabled)===0)return {handoff:true,reason:"receptionist_paused",meta:{source:"paused"}};
  const cfg=getAgentConfig(db,tenantId,"receptionist"),svc=cfg.service||{},llm=getLlmConfig(db,tenantId);
  if(svc.allow_booking_flow!==false&&commercialPolicy(db,tenantId,"assistant_booking")){
    const booking=bookingTurn({db,tenant:tenantId,client,conversation,message:text,availability:availabilityFor,
      createAppointment:createAppointmentRecord,afterCreate:afterAppointmentCreated,
      onAudit:(action,aid,extra)=>audit(db,{tenantId,id:null},action,"appointment",aid,extra)});
    if(booking.handoff)return {handoff:true,reason:booking.reason||"booking_handoff",meta:{source:"booking_flow"}};
    if(booking.handled)return {text:booking.text,meta:{source:"booking_flow",appointment_id:booking.appointment_id||null,booked:!!booking.booked}};
  }else if(isBookingRequest(text)||bookingState(db,tenantId,conversation.id)?.status==="offered"){
    handoffBooking(db,tenantId,conversation.id);
    return {handoff:true,reason:"booking_disabled",meta:{source:"booking_flow"}};
  }

  let brain=null,externalError="";
  if(llm.enabled&&llm.provider!=="internal"){
    try{
      const prompt=buildReceptionistPrompt({db,tenantId,client,conversation,text,cfg});
      const out=await callConfiguredLlm(db,tenantId,prompt,{maxTokens:800});
      brain=parseExternalReceptionist(out.text,{provider:out.provider,model:out.model,response_id:out.id||null,source:"configured_llm"});
    }catch(e){externalError=String(e.message||e).slice(0,180)}
  }
  if(!brain){
    try{brain=await runReceptionistBrain({db,tenantId,client,conversation,text,cfg});brain.meta={...(brain.meta||{}),source:"internal_brain",external_error:externalError||null}}
    catch(e){
      const fallback=await deterministicReceptionReply({tenantId,text,intent});
      return {...fallback,meta:{source:"fallback_rules",external_error:externalError||null,brain_error:String(e.message||e).slice(0,160)}};
    }
  }
  const source=brain.meta?.source||"brain";
  if(brain.intent==="human"&&svc.transfer_on_human_request!==false)return {handoff:true,reason:"human_request",text:brain.text,meta:{source,...brain.meta}};
  if(brain.intent==="complaint"&&svc.transfer_on_complaint!==false)return {handoff:true,reason:"complaint",text:brain.text,meta:{source,...brain.meta}};
  if(brain.intent==="price"&&svc.answer_prices===false)return {handoff:true,reason:"price_disabled",text:brain.text,meta:{source,...brain.meta}};
  if(brain.intent==="appointment_book"&&(svc.allow_booking_flow===false||svc.suggest_appointments===false))return {handoff:true,reason:"booking_disabled",text:brain.text,meta:{source,...brain.meta}};
  if(brain.intent==="appointment_cancel"&&!svc.allow_cancel)return {handoff:true,reason:"cancel_requires_human",text:brain.text,meta:{source,...brain.meta}};
  if(brain.intent==="appointment_reschedule"&&!svc.allow_reschedule)return {handoff:true,reason:"reschedule_requires_human",text:brain.text,meta:{source,...brain.meta}};
  if(brain.handoff)return {handoff:true,reason:brain.reason||brain.intent||"brain_handoff",text:brain.text,meta:{source,intent:brain.intent,confidence:brain.confidence,...brain.meta}};
  return {text:brain.text,meta:{source,intent:brain.intent,confidence:brain.confidence,entities:brain.entities,...brain.meta}};
}

async function deterministicReceptionReply({tenantId,text,intent}){
  const profile=one("select enabled from agent_profiles where tenant_id=? and agent_key='receptionist'",[tenantId]);
  if(Number(profile?.enabled)===0)return {handoff:true,reason:"receptionist_paused"};
  const cfg=getAgentConfig(db,tenantId,"receptionist"),route=intent?.route||localIntent(text).route,svc=cfg.service||{},sales=cfg.sales||{},schedule=cfg.schedule||{};
  const signature=cfg.identity?.signature?("\n\n"+cfg.identity.signature):"";
  const emoji=Number(cfg.voice?.emoji_level||0)>0?" 💛":"";
  const finish=s=>String(s||"")+signature;
  if(route==="human"&&svc.transfer_on_human_request!==false)return {handoff:true,reason:route};
  if(route==="appointment_cancel"&&!svc.allow_cancel)return {handoff:true,reason:route};
  if(route==="appointment_reschedule"&&!svc.allow_reschedule)return {handoff:true,reason:route};
  if(route==="ambiguous"&&svc.transfer_on_ambiguity!==false)return {handoff:true,reason:route};
  if(route==="price"){
    if(svc.answer_prices===false)return {handoff:true,reason:"price_disabled"};
    const service=serviceMention(tenantId,text),next=svc.suggest_appointments!==false&&sales.offer_next_step!==false?" Se quiser, eu também posso verificar os próximos horários disponíveis.":"";
    if(service)return {text:finish("O "+service.name+" está por "+moneyText(service.price_cents)+" e dura em média "+service.duration_min+" minutos."+next)};
    const services=all("select name,price_cents,duration_min from services where tenant_id=? and active=1 order by name limit 8",[tenantId]);
    if(!services.length)return {handoff:true,reason:"no_services"};
    return {text:finish("Claro! Estes são alguns valores:\n"+services.map(s=>"• "+s.name+": "+moneyText(s.price_cents)).join("\n")+(svc.suggest_appointments!==false?"\n\nSe me disser qual serviço você quer, eu verifico os horários também.":""))};
  }
  if(route==="service"){
    if(svc.list_services===false)return {handoff:true,reason:"service_list_disabled"};
    const services=all("select name,price_cents,duration_min from services where tenant_id=? and active=1 order by name limit 10",[tenantId]);
    if(!services.length)return {handoff:true,reason:"no_services"};
    return {text:finish("Hoje temos:\n"+services.map(s=>"• "+s.name+" · "+moneyText(s.price_cents)+" · cerca de "+s.duration_min+" min").join("\n")+(sales.offer_next_step!==false?"\n\nQual deles você quer fazer?":""))};
  }
  if(route==="appointment_book"){
    if(svc.allow_booking_flow===false||svc.suggest_appointments===false)return {handoff:true,reason:"booking_disabled"};
    const b=bookingSuggestion(tenantId,text);
    if(b.missing.includes("service"))return {text:finish("Claro"+emoji+" Qual serviço você quer agendar?")};
    if(b.missing.includes("date"))return {text:finish("Perfeito. Para qual dia você gostaria de marcar "+b.service.name+"?")};
    if(!b.slots.length)return {text:finish("Não encontrei horário livre para "+b.service.name+" nesse dia. Posso tentar outra data ou deixar a equipe procurar um encaixe para você?")};
    const max=Math.max(1,Math.min(8,Number(schedule.max_slots_to_offer||3))),slots=b.slots.slice(0,max),tz=one("select timezone from tenants where id=?",[tenantId])?.timezone||"America/Porto_Velho";
    const lines=slots.map((s,i)=>{
      const d=new Intl.DateTimeFormat("pt-BR",{timeZone:tz,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(s.start_at));
      return (i+1)+") "+d+" com "+s.professional_name;
    });
    return {text:finish("Encontrei estes horários para "+b.service.name+":\n"+lines.join("\n")+"\n\nMe diga o número da opção que você prefere.")};
  }
  if(route==="general"&&cfg.identity?.introduction)return {text:finish(cfg.identity.introduction)};
  return {handoff:true,reason:"unsupported_route"};
}

async function readRawJson(req){
  return new Promise((resolve,reject)=>{
    const chunks=[];let size=0;
    req.on("data",c=>{size+=c.length;if(size>1_000_000){reject(Object.assign(new Error("payload_too_large"),{status:413}));req.destroy();return}chunks.push(c)});
    req.on("end",()=>{const raw=Buffer.concat(chunks);try{resolve({raw,body:raw.length?JSON.parse(raw.toString("utf8")):{}})}catch{reject(Object.assign(new Error("invalid_json"),{status:400}))}});
    req.on("error",reject);
  });
}

async function api(req,res,url){
  if(req.method==="GET"&&url.pathname==="/api/health"){
    let jev=false;
    // No piloto offline, não consultar instâncias opcionais não configuradas.
    if(process.env.JEV_CONTROL_PLANE_URL){
      try{const r=await fetch(JEV_BASE+"/health",{signal:AbortSignal.timeout(1500)});const j=await r.json();jev=!!j.jev_enabled}catch{}
    }
    const wa=await wahaStatus();
    const databaseOk=!!db.prepare("select 1 ok").get()?.ok;
    return send(res,databaseOk?200:503,{
      ok:databaseOk,service:"NOVAGENTE Estética",version:"pilot-qa",
      mode:isFreePreview()?"free_preview_disposable":wa.connected?"whatsapp_connected":"offline_without_whatsapp",
      disposable_demo:isFreePreview(),
      database:{connected:databaseOk},
      optional_integrations:{jev_connected:jev,whatsapp:{configured:wa.configured,connected:wa.connected,status:wa.status}}
    });
  }

  if(url.pathname.startsWith("/api/auth/")){
    const handled=await handleAuthApi({req,res,url,db,send,parseBody,defaultTenant:DEFAULT_TENANT});
    if(handled.handled)return handled.result;
  }

  if(req.method==="POST"&&url.pathname==="/api/whatsapp/waha/webhook"){
    // Não consultar o provedor externo antes de autenticar o pedido de entrada.
    if(!wahaConfigured())return send(res,503,{ok:false,error:"waha_not_configured"});
    const parsed=await readRawJson(req),raw=parsed.raw,body=parsed.body;
    const signature=req.headers["x-webhook-hmac"],algorithm=req.headers["x-webhook-hmac-algorithm"];
    if(!verifyWebhook(raw,signature,algorithm))return send(res,401,{error:"invalid_webhook_signature"});
    const targetTenant=tenantForWahaEvent(db,body);if(!targetTenant)return send(res,200,{ok:true,accepted:false,reason:"unmapped_session"});
    const receptionConfig=getAgentConfig(db,targetTenant,"receptionist");
    const commercialAiEnabled=liveReceptionistEnabled(targetTenant);
    const defaultHandlingMode=commercialAiEnabled&&receptionConfig.service?.auto_activate_new_conversations!==false?"ai":"human";
    const out=await ingestWahaEvent({db,tenantId:targetTenant,event:body,interpret,autoReply:commercialAiEnabled?receptionistAgentReply:null,allowAi:commercialAiEnabled,defaultHandlingMode});
    if(out.accepted&&out.type==="message"&&out.clientId){try{registerIncoming(db,targetTenant,out.clientId,String(body?.payload?.body||""),{messageId:body?.payload?.id?.id||body?.payload?.id?._serialized||null,source:"whatsapp"});}catch(e){console.error("commercial_ingest_failed",String(e.message||e).slice(0,140))}}
    return send(res,200,{ok:true,...out});
  }

  const user=authenticate(req,db);
  if(!user)return send(res,401,{error:"unauthorized"});
  const tenant=user.tenantId;
  const guard=p=>requirePermission(user,p);
  const commercialResult=await handleCommercialApi({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit,isDemo:isFreePreview(),
    bookingPreview:({clientId,text})=>{
      const c=one("select * from clients where tenant_id=? and id=?",[tenant,clientId]);
      if(!c){const e=new Error("client_not_found");e.status=404;throw e}
      let conv=one("select * from conversations where tenant_id=? and client_id=? and channel='demo_booking' order by created_at desc limit 1",[tenant,c.id]);
      if(!conv){
        const cid=id(),ts=now();
        run("insert into conversations(id,tenant_id,client_id,channel,status,created_at,last_message_at,handling_mode,updated_at) values(?,?,?,?,?,?,?,?,?)",[cid,tenant,c.id,"demo_booking","open",ts,ts,"human",ts]);
        conv=one("select * from conversations where id=? and tenant_id=?",[cid,tenant]);
      }
      const request=String(text||"").slice(0,1000),ts=now();
      run("insert into messages(id,tenant_id,conversation_id,direction,sender_type,body,message_type,created_at) values(?,?,?,?,?,?,?,?)",[id(),tenant,conv.id,"in","client",request,"text",ts]);
      const safety=receptionistDraft({text:request});
      const result=safety.handoff?(handoffBooking(db,tenant,conv.id),{handoff:true,reason:safety.reason,text:safety.text}):
        bookingTurn({db,tenant,client:c,conversation:conv,message:request,availability:availabilityFor,
          createAppointment:createAppointmentRecord,afterCreate:afterAppointmentCreated,
          onAudit:(action,aid,extra)=>audit(db,user,action,"appointment",aid,extra)});
      if(result?.text)run("insert into messages(id,tenant_id,conversation_id,direction,sender_type,body,message_type,created_at) values(?,?,?,?,?,?,?,?)",[id(),tenant,conv.id,"out","assistant",result.text,"text",now()]);
      return {...result,booking_state:bookingState(db,tenant,conv.id)?.status||null,conversation_id:conv.id,simulation:true,sending_enabled:false};
    }});

  if(commercialResult!==false)return commercialResult;
  if(req.method==="GET"&&url.pathname==="/api/agents/receptionist/llm"){
    guard("agents.read");
    const cfg=getLlmConfig(db,tenant);
    return send(res,200,{...cfg,providers:[
      {id:"internal",name:"Margot / OpenCLAW interno",example:""},
      {id:"openai",name:"OpenAI",example:"gpt-5.6"},
      {id:"deepseek",name:"DeepSeek",example:"deepseek-chat"},
      {id:"openrouter",name:"OpenRouter",example:"openai/gpt-5.6"},
      {id:"anthropic",name:"Anthropic",example:"claude-sonnet-4-5"},
      {id:"gemini",name:"Google Gemini",example:"gemini-2.5-flash"}
    ]});
  }
  if(req.method==="PUT"&&url.pathname==="/api/agents/receptionist/llm"){
    guard("agents.write");
    try{
      const b=await parseBody(req),cfg=saveLlmConfig(db,tenant,b);
      audit(db,user,"agent.llm.update","agent_profile","receptionist",{provider:cfg.provider,model:cfg.model,enabled:cfg.enabled,has_api_key:cfg.has_api_key});
      return send(res,200,{ok:true,...cfg});
    }catch(e){return send(res,e.status||400,{error:String(e.message||"llm_config_failed")})}
  }
  if(req.method==="POST"&&url.pathname==="/api/agents/receptionist/llm/test"){
    guard("agents.write");
    try{
      const b=await parseBody(req),out=await testLlmConfig(db,tenant,b);
      audit(db,user,"agent.llm.test","agent_profile","receptionist",{provider:out.provider,model:out.model,ok:true});
      return send(res,200,out);
    }catch(e){return send(res,e.status||503,{ok:false,error:String(e.message||"llm_test_failed").slice(0,300)})}
  }
  const phase2Result=await handlePhase2Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(phase2Result!==false)return phase2Result;
  const ownerResult=await handleOwnerEyeApi({req,res,url,db,user,tenant,send,requirePermission});
  if(ownerResult!==false)return ownerResult;
  const phase3Result=await handlePhase3Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(phase3Result!==false)return phase3Result;
  const phase4Result=await handlePhase4Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit,sendText:(phone,text)=>sendText(phone,text,sessionForTenant(db,tenant)),routeAmbiguous:jevDecision});
  if(phase4Result!==false)return phase4Result;
  const tenantAdmin=await handleTenantAdministrationApi({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(tenantAdmin!==false)return tenantAdmin;
  const phase5Result=await handlePhase5Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(phase5Result!==false)return phase5Result;
  const phase6Result=await handlePhase6Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(phase6Result!==false)return phase6Result;
  const marketingResult=await handleMarketingApi({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit,
    storageDir:path.join(path.dirname(DB_PATH),"marketing-assets"),
    sendImage:(response,buffer,mime)=>{
      response.writeHead(200,{...baseSecurityHeaders(),"content-type":mime,"content-length":buffer.length,
        "content-disposition":"inline","cache-control":"private, no-store"});
      response.end(buffer);
    }});
  if(marketingResult!==false)return marketingResult;
  const phase7Result=await handlePhase7Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(phase7Result!==false)return phase7Result;
  const phase8Result=await handlePhase8Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(phase8Result!==false)return phase8Result;
  const phase9Result=await handlePhase9Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(phase9Result!==false)return phase9Result;
  const phase10Result=await handlePhase10Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(phase10Result!==false)return phase10Result;
  const phase11Result=await handlePhase11Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(phase11Result!==false)return phase11Result;

  if(req.method==="GET"&&url.pathname==="/api/bootstrap"){
    guard("dashboard.read");
    return send(res,200,{
      tenant:one("select * from tenants where id=?",[tenant]),user,
      professionals:all("select * from professionals where tenant_id=? order by name",[tenant]).map(professionalView),
      services:all("select * from services where tenant_id=? order by category,name",[tenant]).map(serviceView),
      resources:all("select * from resources where tenant_id=? and active=1 order by type,name",[tenant]),
      dashboard:dashboard(tenant),whatsapp:await wahaStatus(sessionForTenant(db,tenant))
    });
  }
  if(req.method==="GET"&&url.pathname==="/api/dashboard"){guard("dashboard.read");return send(res,200,dashboard(tenant))}

  if(req.method==="GET"&&url.pathname==="/api/clients/export"){
    guard("clients.export");
    const rows=all(`select c.*,
      count(distinct case when a.status='completed' then a.id end) visits,
      max(case when a.status='completed' then a.start_at end) last_visit,
      coalesce(sum(case when cr.id is not null then cr.total_cents else 0 end),0) lifetime_cents
      from clients c
      left join appointments a on a.client_id=c.id and a.tenant_id=c.tenant_id
      left join checkout_records cr on cr.appointment_id=a.id and cr.tenant_id=c.tenant_id
      where c.tenant_id=?
      group by c.id
      order by c.name`,[tenant]);
    const head=["Nome","WhatsApp","E-mail","Aniversário","Instagram","Facebook","Referência / Quem indicou","Origem","Tags","Observações","Atendimentos concluídos","Última visita","Valor movimentado (R$)","Cadastro"];
    const body="\ufeff"+[head.map(csvCell).join(";"),...rows.map(c=>[
      c.name,c.phone||"",c.email||"",c.birthday||"",c.instagram||"",c.facebook||"",c.referral_reference||"",c.source||"",
      (()=>{try{return JSON.parse(c.tags||"[]").join(", ")}catch{return ""}})(),c.notes||"",Number(c.visits||0),c.last_visit||"",(Number(c.lifetime_cents||0)/100).toFixed(2),c.created_at
    ].map(csvCell).join(";"))].join("\r\n");
    audit(db,user,"clients.export","clients",null,{count:rows.length});
    return send(res,200,body,{"content-type":"text/csv; charset=utf-8","content-disposition":'attachment; filename="novagente-clientes-'+new Date().toISOString().slice(0,10)+'.csv"',"cache-control":"no-store","x-content-type-options":"nosniff"});
  }
  if(req.method==="GET"&&url.pathname==="/api/clients"){
    guard("clients.read");
    const q=safeText(url.searchParams.get("q")||"",100);
    const rows=q?all("select * from clients where tenant_id=? and (name like ? or phone like ? or instagram like ? or facebook like ? or referral_reference like ?) order by name limit 100",[tenant,"%"+q+"%","%"+normalizePhone(q)+"%","%"+q+"%","%"+q+"%","%"+q+"%"]):all("select * from clients where tenant_id=? order by updated_at desc limit 100",[tenant]);
    return send(res,200,rows.map(clientView));
  }
  if(req.method==="POST"&&url.pathname==="/api/clients"){
    guard("clients.write");
    const b=await parseBody(req),name=safeText(b.name,120),phone=normalizePhone(b.phone);
    if(!name)return send(res,400,{error:"name_required"});
    // Checagem e INSERT sob o mesmo lock: evita dois cadastros de telefone
    // idêntico quando recepção e gerência usam instâncias diferentes.
    let created,duplicate;
    db.exec("BEGIN IMMEDIATE");
    try{
      duplicate=phone?one("select * from clients where tenant_id=? and phone=?",[tenant,phone]):null;
      if(!duplicate){
        const cid=id();
        run("insert into clients(id,tenant_id,name,phone,email,birthday,instagram,facebook,referral_reference,tags,notes,source,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[cid,tenant,name,phone,safeText(b.email,160),safeText(b.birthday,20),safeText(b.instagram,160),safeText(b.facebook,160),safeText(b.referral_reference,180),JSON.stringify(Array.isArray(b.tags)?b.tags.slice(0,20):[]),safeText(b.notes,1000),safeText(b.source||"manual",40)||"manual",now(),now()]);
        created=one("select * from clients where id=? and tenant_id=?",[cid,tenant]);
      }
      db.exec("COMMIT");
    }catch(error){db.exec("ROLLBACK");throw error}
    if(duplicate)return send(res,409,{error:"phone_already_exists",client:clientView(duplicate)});
    audit(db,user,"client.create","client",created.id,{});
    return send(res,201,clientView(created));
  }

  if(req.method==="GET"&&url.pathname==="/api/professionals"){guard("team.read");return send(res,200,all("select * from professionals where tenant_id=? order by name",[tenant]).map(professionalView))}
  if(req.method==="POST"&&url.pathname==="/api/professionals"){
    guard("team.write");
    const b=await parseBody(req),name=safeText(b.name,120);if(!name)return send(res,400,{error:"name_required"});
    const pid=id();
    run("insert into professionals(id,tenant_id,name,phone,role,specialties,work_start,work_end,created_at) values(?,?,?,?,?,?,?,?,?)",[pid,tenant,name,normalizePhone(b.phone),safeText(b.role||"Profissional",80),JSON.stringify(Array.isArray(b.specialties)?b.specialties:[]),safeText(b.work_start||"09:00",5),safeText(b.work_end||"18:00",5),now()]);
    audit(db,user,"professional.create","professional",pid,{});
    return send(res,201,professionalView(one("select * from professionals where id=?",[pid])));
  }

  if(req.method==="GET"&&url.pathname==="/api/services"){guard("services.read");return send(res,200,all("select * from services where tenant_id=? order by category,name",[tenant]).map(serviceView))}
  if(req.method==="POST"&&url.pathname==="/api/services"){
    guard("services.write");
    const b=await parseBody(req),name=safeText(b.name,120);if(!name)return send(res,400,{error:"name_required"});
    const sid=id(),price=Math.max(0,Math.round(Number(b.price||0)*100)),dur=Math.max(5,Math.round(Number(b.duration_min||60)));
    run("insert into services(id,tenant_id,name,category,duration_min,price_cents,commission_pct,created_at) values(?,?,?,?,?,?,?,?)",[sid,tenant,name,safeText(b.category,80),dur,price,Math.max(0,Number(b.commission_pct||0)),now()]);
    audit(db,user,"service.create","service",sid,{});
    return send(res,201,serviceView(one("select * from services where id=?",[sid])));
  }

  if(req.method==="GET"&&url.pathname==="/api/resources"){guard("resources.read");return send(res,200,all("select * from resources where tenant_id=? order by type,name",[tenant]))}
  if(req.method==="POST"&&url.pathname==="/api/resources"){
    guard("resources.write");
    const b=await parseBody(req),name=safeText(b.name,120),type=safeText(b.type||"other",40);
    if(!name)return send(res,400,{error:"name_required"});
    const rid=id();run("insert into resources(id,tenant_id,name,type,active) values(?,?,?,?,1)",[rid,tenant,name,type]);
    audit(db,user,"resource.create","resource",rid,{type});
    return send(res,201,one("select * from resources where id=?",[rid]));
  }

  if(req.method==="GET"&&url.pathname==="/api/availability"){
    guard("appointments.read");
    const date=safeText(url.searchParams.get("date")||"",10),serviceId=safeText(url.searchParams.get("service_id")||"",64);
    const professionalId=safeText(url.searchParams.get("professional_id")||"",64)||null,resourceId=safeText(url.searchParams.get("resource_id")||"",64)||null;
    if(!date||!serviceId)return send(res,400,{error:"date_and_service_required"});
    return send(res,200,{date,slots:availabilityFor(tenant,{date,serviceId,professionalId,resourceId,limit:60})});
  }
  if(req.method==="GET"&&url.pathname==="/api/waitlist"){
    guard("appointments.read");
    const rows=all("select w.*,c.name client_name,c.phone client_phone,s.name service_name,p.name professional_name from waitlist w join clients c on c.id=w.client_id join services s on s.id=w.service_id left join professionals p on p.id=w.professional_id where w.tenant_id=? and w.status='waiting' order by coalesce(w.preferred_date,'9999-12-31'),w.created_at",[tenant]);
    return send(res,200,rows);
  }
  if(req.method==="POST"&&url.pathname==="/api/waitlist"){
    guard("appointments.write");
    const b=await parseBody(req),client=one("select id from clients where id=? and tenant_id=?",[safeText(b.client_id,64),tenant]),service=one("select id from services where id=? and tenant_id=?",[safeText(b.service_id,64),tenant]);
    const professional=b.professional_id?one("select id from professionals where id=? and tenant_id=?",[safeText(b.professional_id,64),tenant]):null;
    if(!client||!service||(b.professional_id&&!professional))return send(res,400,{error:"invalid_waitlist_reference"});
    const wid=id();run("insert into waitlist(id,tenant_id,client_id,service_id,professional_id,preferred_date,period,notes,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)",[wid,tenant,client.id,service.id,professional?.id||null,safeText(b.preferred_date,10)||null,safeText(b.period||"any",20),safeText(b.notes,500),"waiting",now(),now()]);
    audit(db,user,"waitlist.create","waitlist",wid,{});
    return send(res,201,{id:wid,status:"waiting"});
  }

  if(req.method==="GET"&&url.pathname==="/api/appointments/tag-suggestions"){
    guard("appointments.read");
    const clientId=safeText(url.searchParams.get("client_id"),64),serviceId=safeText(url.searchParams.get("service_id"),64),tags=[];
    const client=clientId?one("select * from clients where id=? and tenant_id=?",[clientId,tenant]):null;
    const service=serviceId?one("select * from services where id=? and tenant_id=?",[serviceId,tenant]):null;
    if(client){
      const prior=Number(one("select count(*) n from appointments where tenant_id=? and client_id=? and status='completed'",[tenant,client.id])?.n||0);
      tags.push(prior?"Retorno":"Primeira visita");
      if(safeText(client.allergies,400))tags.push("Alergia");
    }
    if(service&&/quim|color|progress|descolor|alis/i.test((service.name||"")+" "+(service.category||"")))tags.push("Química");
    return send(res,200,{tags:[...new Set(tags)]});
  }
  if(req.method==="GET"&&url.pathname==="/api/appointments"){
    guard("appointments.read");
    const from=url.searchParams.get("from")||new Date(Date.now()-86400000).toISOString(),to=url.searchParams.get("to")||new Date(Date.now()+14*86400000).toISOString();
    const sql="select a.*,c.name client_name,c.phone client_phone,p.name professional_name,s.name service_name,s.duration_min,s.price_cents,r.name resource_name from appointments a join clients c on c.id=a.client_id and c.tenant_id=a.tenant_id join professionals p on p.id=a.professional_id and p.tenant_id=a.tenant_id join services s on s.id=a.service_id and s.tenant_id=a.tenant_id left join resources r on r.id=a.resource_id and r.tenant_id=a.tenant_id where a.tenant_id=? and a.start_at>=? and a.start_at<=? order by a.start_at";
    const rows=all(sql,[tenant,from,to]);
    return send(res,200,rows.map(appointmentApiView));
  }
  if(req.method==="POST"&&url.pathname==="/api/appointments"){
    guard("appointments.write");
    const b=await parseBody(req);
    try{const created=createAppointmentRecord(tenant,user,b);try{afterAppointmentCreated(db,tenant,created)}catch(e){console.error("commercial_booking_hook_failed",String(e.message||e).slice(0,140))}return send(res,201,created)}
    catch(e){return send(res,e.status||500,{error:String(e.message||"appointment_create_failed"),professional:e.professional||null,resource:e.resource||null})}
  }
  const ap=routeMatch(url.pathname,"/api/appointments/:id/status");
  if(req.method==="PATCH"&&ap){
    guard("appointments.write");
    const b=await parseBody(req),status=safeText(b.status,32);
    const current=one("select status from appointments where id=? and tenant_id=?",[ap.id,tenant]);
    if(!current)return send(res,404,{error:"not_found"});
    const transition=checkManualStatusTransition(current.status,status);
    if(!transition.ok)return send(res,transition.code==="invalid_status"?400:409,{error:transition.code,current_status:current.status});
    if(transition.unchanged)return send(res,200,{ok:true,status,unchanged:true});
    const info=run("update appointments set status=?,updated_at=? where id=? and tenant_id=? and status=?",[status,now(),ap.id,tenant,current.status]);
    if(!info.changes)return send(res,409,{error:"status_changed_reload"});
    audit(db,user,"appointment.status","appointment",ap.id,{from:current.status,to:status});
    try{afterAppointmentStatus(db,tenant,ap.id,status)}catch(e){console.error("commercial_status_hook_failed",String(e.message||e).slice(0,140))}
    return send(res,200,{ok:true,status});
  }

  if(req.method==="GET"&&url.pathname==="/api/conversations"){guard("conversations.read");return send(res,200,listConversations(db,tenant))}
  const clientContextRoute=routeMatch(url.pathname,"/api/conversations/:id/client-context");
  if(req.method==="GET"&&clientContextRoute){
    guard("conversations.read");guard("clients.read");
    const co=one("select id,client_id from conversations where id=? and tenant_id=?",[clientContextRoute.id,tenant]);
    if(!co)return send(res,404,{error:"conversation_not_found"});
    if(!co.client_id)return send(res,200,{client:null,appointments:[]});
    const client=one("select id,name,phone,tags,source from clients where id=? and tenant_id=?",[co.client_id,tenant]);
    if(!client)return send(res,200,{client:null,appointments:[]});
    const visits=all(`select a.id,a.start_at,a.status,s.name service_name,p.name professional_name
      from appointments a left join services s on s.id=a.service_id and s.tenant_id=a.tenant_id
      left join professionals p on p.id=a.professional_id and p.tenant_id=a.tenant_id
      where a.tenant_id=? and a.client_id=? order by a.start_at desc limit 5`,[tenant,co.client_id]);
    return send(res,200,{client:{...client,tags:jparse(client.tags,[])},appointments:visits});
  }
  if(req.method==="GET"&&url.pathname==="/api/conversations/options"){
    guard("conversations.read");
    const users=all("select id,name,role from users where tenant_id=? and active=1 order by name",[tenant]);
    return send(res,200,{users,statuses:["open","pending","resolved"],priorities:["normal","high","urgent"],categories:["general","lead","appointment","waiting","finance","complaint","post_sale","vip","other"]});
  }
  const metaRoute=routeMatch(url.pathname,"/api/conversations/:id/meta");
  if(req.method==="PATCH"&&metaRoute){
    guard("conversations.write");
    const co=one("select * from conversations where id=? and tenant_id=?",[metaRoute.id,tenant]);if(!co)return send(res,404,{error:"conversation_not_found"});
    const b=await parseBody(req),allowedStatus=["open","pending","resolved"],allowedPriority=["normal","high","urgent"],allowedCategory=["general","lead","appointment","waiting","finance","complaint","post_sale","vip","other"];
    const status=b.status===undefined?co.status:safeText(b.status,20),priority=b.priority===undefined?(co.priority||"normal"):safeText(b.priority,20),category=b.category===undefined?(co.category||"general"):safeText(b.category,32);
    if(!allowedStatus.includes(status)||!allowedPriority.includes(priority)||!allowedCategory.includes(category))return send(res,400,{error:"invalid_conversation_meta"});
    let assigned=b.assigned_user_id===undefined?co.assigned_user_id:(safeText(b.assigned_user_id,64)||null);
    if(assigned&&!one("select id from users where id=? and tenant_id=? and active=1",[assigned,tenant]))return send(res,400,{error:"invalid_assignee"});
    let labels=co.labels||"[]";
    if(Array.isArray(b.labels))labels=JSON.stringify([...new Set(b.labels.map(x=>safeText(x,32)).filter(Boolean))].slice(0,12));
    run("update conversations set status=?,priority=?,category=?,assigned_user_id=?,labels=?,updated_at=? where id=? and tenant_id=?",[status,priority,category,assigned,labels,now(),metaRoute.id,tenant]);
    audit(db,user,"conversation.classify","conversation",metaRoute.id,{status,priority,category,assigned_user_id:assigned,labels:JSON.parse(labels)});
    return send(res,200,{ok:true,status,priority,category,assigned_user_id:assigned,labels:JSON.parse(labels)});
  }
  const modeRoute=routeMatch(url.pathname,"/api/conversations/:id/mode");
  if(req.method==="PATCH"&&modeRoute){
    guard("conversations.write");
    const b=await parseBody(req),mode=safeText(b.mode,16);
    if(!["human","ai"].includes(mode))return send(res,400,{error:"invalid_mode"});
    if(mode==="ai"&&!liveReceptionistEnabled(tenant))return send(res,403,{error:"ai_not_enabled"});
    const info=run("update conversations set handling_mode=?,handling_mode_source='manual',updated_at=? where id=? and tenant_id=?",[mode,now(),modeRoute.id,tenant]);
    if(!info.changes)return send(res,404,{error:"conversation_not_found"});
    audit(db,user,"conversation.mode","conversation",modeRoute.id,{mode});
    return send(res,200,{ok:true,mode});
  }
    const cm=routeMatch(url.pathname,"/api/conversations/:id/messages");
  if(req.method==="GET"&&cm){guard("conversations.read");markConversationRead(db,tenant,cm.id);return send(res,200,conversationMessages(db,tenant,cm.id))}
  if(req.method==="POST"&&cm){
    guard("whatsapp.send");const b=await parseBody(req);
    try{const msg=await sendConversationMessage(db,tenant,cm.id,b.text,user.id);audit(db,user,"whatsapp.send","conversation",cm.id,{messageId:msg.externalMessageId||null});return send(res,201,msg)}
    catch(e){return send(res,e.status||503,{error:String(e.message||"whatsapp_send_failed")})}
  }

  const backfillResult=await handleWhatsAppBackfillApi({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit});
  if(backfillResult!==false)return backfillResult;
  if(req.method==="POST"&&url.pathname==="/api/whatsapp/sync"){
    guard("conversations.write");
    try{
      const b=await parseBody(req),out=await syncWahaHistory(db,tenant,{chatLimit:Number(b.chat_limit||40),messageLimit:Number(b.message_limit||80)});
      audit(db,user,"whatsapp.sync","whatsapp",null,out);
      return send(res,200,{ok:true,...out});
    }catch(e){return send(res,503,{error:"whatsapp_sync_failed",detail:String(e.message||e).slice(0,180)})}
  }
  if(req.method==="GET"&&url.pathname==="/api/whatsapp/status"){
    guard("conversations.read");
    const activeSession=sessionForTenant(db,tenant);
    const active=liveReceptionistEnabled(tenant),llm=getLlmConfig(db,tenant);
    return send(res,200,{...await wahaStatus(activeSession),session:activeSession,
      ai_enabled:active,auto_reply_ready:active,reply_engine:active&&(llm.enabled&&llm.provider!=="internal"&&llm.has_api_key?"configured_llm":"internal_or_rules_fallback")||"disabled"});
  }
  if(req.method==="POST"&&url.pathname==="/api/whatsapp/session/link"){
    if(user.role!=="owner")return send(res,403,{error:"owner_only"});
    const b=await parseBody(req),session=safeText(b.session,64);
    try{
      const linked=registerTenantSession(db,tenant,session);
      audit(db,user,"whatsapp.session.link","whatsapp",null,{session:linked});
      return send(res,200,{ok:true,session:linked,...await wahaStatus(linked),ai_enabled:WAHA_AGENT_ENABLED});
    }catch(e){return send(res,e.status||400,{error:String(e.message||"session_link_failed")})}
  }
  if(req.method==="POST"&&url.pathname==="/api/whatsapp/session/prepare"){
    if(!["owner","manager"].includes(user.role))return send(res,403,{error:"forbidden"});
    try{const session=sessionForTenant(db,tenant),out=await ensureWahaSession(session);audit(db,user,"whatsapp.session.prepare","whatsapp",null,{status:out.status,session});return send(res,200,out)}
    catch(e){return send(res,503,{error:String(e.message||"waha_prepare_failed")})}
  }
  if(req.method==="GET"&&url.pathname==="/api/whatsapp/session/qr"){
    if(!["owner","manager"].includes(user.role))return send(res,403,{error:"forbidden"});
    try{const q=await wahaQr(sessionForTenant(db,tenant));res.writeHead(200,{"content-type":q.mimetype,"cache-control":"no-store"});return res.end(q.bytes)}
    catch(e){return send(res,409,{error:String(e.message||"qr_unavailable")})}
  }

  if(req.method==="POST"&&url.pathname==="/api/assistant/interpret"){
    guard("dashboard.read");const b=await parseBody(req),text=safeText(b.text,1200);if(!text)return send(res,400,{error:"text_required"});
    const routed=await interpret(tenant,text);
    const booking=routed.route==="appointment_book"?bookingSuggestion(tenant,text):null;
    return send(res,200,{...routed,booking});
  }
  if(req.method==="GET"&&url.pathname==="/api/jev/receipts"){guard("jev.read");return send(res,200,all("select * from jev_receipts where tenant_id=? order by created_at desc limit 50",[tenant]))}
  return send(res,404,{error:"not_found"});
}

const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".json":"application/json; charset=utf-8",".webmanifest":"application/manifest+json; charset=utf-8"};
// Proteção de origem em operações mutáveis de navegadores.
// O webhook WAHA usa autenticação HMAC própria e é tratado separadamente.
function sameOriginMutation(req,url){return browserMutationAllowed(req,url)}

const handler=async(req,res)=>{
  try{
    const url=new URL(req.url||"/","http://localhost");
    if(url.pathname.startsWith("/api/")){if(!sameOriginMutation(req,url))return send(res,403,{error:"cross_origin_request_denied"});const retry=trafficLimit(req,url);if(retry)return send(res,429,{error:"rate_limited",retry_after:retry},{"retry-after":String(retry)});return await api(req,res,url)}
    let rel=url.pathname==="/"?"index.html":url.pathname.slice(1);
    rel=path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
    const publicRoot=path.join(__dirname,"public"),file=path.join(publicRoot,rel);
    if(!file.startsWith(publicRoot))return send(res,403,"forbidden");
    if(fs.existsSync(file)&&fs.statSync(file).isFile()){
      res.writeHead(200,{...baseSecurityHeaders(),"content-type":MIME[path.extname(file)]||"application/octet-stream","cache-control":"no-cache"});
      return fs.createReadStream(file).pipe(res);
    }
    const index=path.join(publicRoot,"index.html");
    res.writeHead(200,{...baseSecurityHeaders(),"content-type":"text/html; charset=utf-8","cache-control":"no-cache"});fs.createReadStream(index).pipe(res);
  }catch(e){console.error(e);const status=Number(e.status||500);send(res,status,{error:status===401?"unauthorized":status===403?"forbidden":status===400?"bad_request":"internal_error",message:status<500?String(e.message||e):"internal_error"})}
};
const listenHosts=[HOST==="0.0.0.0"||HOST==="::"?HOST:"127.0.0.1",...(HOST==="0.0.0.0"||HOST==="::"?[]:[HOST]),...String(process.env.EXTRA_HOSTS||"").split(",").map(x=>x.trim()).filter(Boolean)].filter((x,i,a)=>a.indexOf(x)===i);
for(const bindHost of listenHosts){
  const server=http.createServer(handler);
  server.listen(PORT,bindHost,()=>console.log(`Salon OS listening on http://${bindHost}:${PORT}`));
}