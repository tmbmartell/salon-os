import crypto from "node:crypto";

const uid=()=>crypto.randomUUID();
const iso=()=>new Date().toISOString();
const read=(db,sql,params=[])=>db.prepare(sql).get(...params);
const list=(db,sql,params=[])=>db.prepare(sql).all(...params);
const run=(db,sql,params=[])=>db.prepare(sql).run(...params);
const clip=(v,n=700)=>String(v??"").trim().slice(0,n);
const parse=(v,fallback)=>{try{return JSON.parse(v)}catch{return fallback}};
const stageList=["novo_contato","respondeu","orcamento_enviado","agendou","sinal_pago","atendido","voltou"];
export const FUNNEL_STAGES=Object.freeze(stageList);
export const AUTOMATION_SWITCHES=Object.freeze([
  "assistant_reply","assistant_booking","appointment_confirmation_24h","appointment_reminder_2h",
  "deposit_receivable","waitlist_offer","quote_followups","lead_recovery_7d",
  "return_cycle","birthday","inactive_60d","review_invitation",
  "high_value_alert","owner_digest","stock_replenishment","commission_reports",
  "fiscal_invoice"
]);
const marketingKinds=new Set(["quote_followup_2h","quote_followup_24h","quote_followup_3d","lead_recovery_7d","return_cycle","birthday","inactive_60d","review_invitation"]);
const switches=new Set(AUTOMATION_SWITCHES);
const intents=["human","discount","medical","complaint","price","schedule","service","general"];
const human=/\b(humano|humana|atendente|pessoa real|falar com algu[eé]m|gerente)\b/i;
const discount=/\b(desconto|descontinho|abaixa(?:r)?|mais barato|negocia(?:r|ção)|promoção especial)\b/i;
const medical=/\b(diagn[oó]stico|infec[çc][aã]o|alergia|tratamento m[eé]dico|doen[çc]a|dermatite)\b/i;
const complaint=/\b(reclama[çc][aã]o|machucou|queimou|decep[çc][aã]o|insatisfeit|preju[ií]zo)\b/i;
const price=/\b(pre[çc]o|quanto custa|valor|or[çc]amento|quanto fica)\b/i;
const schedule=/\b(hor[aá]rio|agenda|agendar|marcar|dispon[ií]vel|vaga|encaixe)\b/i;
const service=/\b(corte|color[aiç]|hidrata|unha|manicure|sobrancelha|escova|procedimento|servi[çc]o)\b/i;
export function classifyMessage(text){
  const t=clip(text,3000);
  if(human.test(t))return "human";
  if(discount.test(t))return "discount";
  if(medical.test(t))return "medical";
  if(complaint.test(t))return "complaint";
  if(price.test(t))return "price";
  if(schedule.test(t))return "schedule";
  if(service.test(t))return "service";
  return "general";
}
export function receptionistDraft({text,clientName="",services=[],slots=[],lastGreeting=""}={}){
  const intent=classifyMessage(text);
  if(intent==="human")return {intent,handoff:true,reason:"human_requested",text:"Claro! Vou chamar alguém da equipe e encaminhar a conversa inteira."};
  if(intent==="discount")return {intent,handoff:true,reason:"discount_requires_manager",text:"Ahh, desconto quem libera é a gerente! Vou chamar ela pra te ajudar 😉"};
  if(intent==="medical"||intent==="complaint")return {intent,handoff:true,reason:intent==="medical"?"medical_question":"sensitive_complaint",text:"Essa questão merece atenção da equipe. Vou encaminhar para uma pessoa avaliar com você."};
  const catalog=services.filter(s=>s&&s.active!==false&&Number.isFinite(Number(s.price_cents))&&Number(s.price_cents)>=0);
  const normalize=t=>String(t).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const mentioned=catalog.filter(s=>normalize(text).includes(normalize(s.name)));
  const known=mentioned.length===1?mentioned[0]:null;
  const validSlots=slots.filter(s=>s&&typeof s.local_time==="string"&&/^\d\d:\d\d$/.test(s.local_time)&&s.start_at);
  if((intent==="price"||intent==="service")&&known){
    const price=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(known.price_cents)/100);
    return {intent,handoff:false,text:known.name+" está por "+price+". Quer que eu procure um horário pra você?"};
  }
  if((intent==="schedule"||intent==="service")&&known&&validSlots.length>=2){
    return {intent,handoff:false,text:"Tenho "+validSlots[0].local_time+" ou "+validSlots[1].local_time+" no dia consultado. Qual fica melhor?",slot_ids:validSlots.slice(0,2).map(s=>s.start_at)};
  }
  if(intent==="price"||intent==="schedule"||intent==="service"){
    return {intent,handoff:false,text:known?"Vou conferir os horários disponíveis para "+known.name+". Qual dia você prefere?":"Me conta qual serviço você quer fazer que eu consulto os preços e os horários cadastrados."};
  }
  const openers=["Que bom te ver por aqui! Me conta qual serviço você está pensando em fazer?","Que legal você ter vindo! O que a gente pode preparar pra você hoje?"];
  const selected=openers.find(v=>v!==lastGreeting)||openers[0];
  return {intent,handoff:false,text:selected};
}
export function installCommercialAutomation(db){
  db.exec([
    "CREATE TABLE IF NOT EXISTS automation_policies(tenant_id TEXT NOT NULL, key TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, updated_by TEXT, PRIMARY KEY(tenant_id,key))",
    "CREATE TABLE IF NOT EXISTS client_contact_permissions(tenant_id TEXT NOT NULL, client_id TEXT NOT NULL, purpose TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL DEFAULT 'unknown', evidence TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL, PRIMARY KEY(tenant_id,client_id,purpose))",
    "CREATE TABLE IF NOT EXISTS commercial_leads(id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, client_id TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'novo_contato', source TEXT NOT NULL DEFAULT 'unknown', intent TEXT NOT NULL DEFAULT 'general', estimated_value_cents INTEGER NOT NULL DEFAULT 0, last_inbound_at TEXT, last_outbound_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(tenant_id,client_id))",
    "CREATE INDEX IF NOT EXISTS idx_commercial_leads_tenant_stage ON commercial_leads(tenant_id,stage,updated_at)",
    "CREATE TABLE IF NOT EXISTS commercial_events(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT NOT NULL,lead_id TEXT,event TEXT NOT NULL,entity_id TEXT,note TEXT NOT NULL DEFAULT '',dedupe_key TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(tenant_id,dedupe_key))",
    "CREATE INDEX IF NOT EXISTS idx_commercial_events_client ON commercial_events(tenant_id,client_id,created_at)",
    "CREATE TABLE IF NOT EXISTS commercial_jobs(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT NOT NULL,kind TEXT NOT NULL,appointment_id TEXT,message TEXT NOT NULL DEFAULT '',scheduled_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'held',reason TEXT NOT NULL DEFAULT '',dedupe_key TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(tenant_id,dedupe_key))",
    "CREATE INDEX IF NOT EXISTS idx_commercial_jobs_due ON commercial_jobs(tenant_id,status,scheduled_at)",
    "CREATE TABLE IF NOT EXISTS service_automation_rules(tenant_id TEXT NOT NULL,service_id TEXT NOT NULL,return_days INTEGER NOT NULL DEFAULT 0,deposit_cents INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,service_id))"
  ].join(";")+";");
}
export function policy(db,tenant,key){
  if(!switches.has(key))throw new Error("unknown_automation");
  return Number(read(db,"select enabled from automation_policies where tenant_id=? and key=?",[tenant,key])?.enabled||0)===1;
}
export function policies(db,tenant){
  return Object.fromEntries(AUTOMATION_SWITCHES.map(k=>[k,policy(db,tenant,k)]));
}
export function setPolicy(db,tenant,key,enabled,actorId=null){
  if(!switches.has(key)||typeof enabled!=="boolean")throw Object.assign(new Error("invalid_automation_policy"),{status:400});
  run(db,"insert into automation_policies(tenant_id,key,enabled,updated_at,updated_by) values(?,?,?,?,?) on conflict(tenant_id,key) do update set enabled=excluded.enabled,updated_at=excluded.updated_at,updated_by=excluded.updated_by",[tenant,key,Number(enabled),iso(),actorId]);
  if(!enabled){
    const matching={quote_followups:["quote_followup_2h","quote_followup_24h","quote_followup_3d"],high_value_alert:["owner_high_value_escalation"]}[key]||[key];
    for(const kind of matching)run(db,"update commercial_jobs set status='held',reason='disabled_by_owner' where tenant_id=? and kind=? and status='pending'",[tenant,kind]);
  }
  return {key,enabled};
}
export function setContactPermission(db,tenant,clientId,purpose,allowed,source="explicit",evidence=""){
  if(!["transactional","marketing"].includes(purpose)||typeof allowed!=="boolean")throw Object.assign(new Error("invalid_consent"),{status:400});
  if(!read(db,"select id from clients where tenant_id=? and id=?",[tenant,clientId]))throw Object.assign(new Error("client_not_found"),{status:404});
  if(allowed&&clip(evidence,500).length<8)throw Object.assign(new Error("consent_evidence_required"),{status:400});
  run(db,"insert into client_contact_permissions(tenant_id,client_id,purpose,allowed,source,evidence,updated_at) values(?,?,?,?,?,?,?) on conflict(tenant_id,client_id,purpose) do update set allowed=excluded.allowed,source=excluded.source,evidence=excluded.evidence,updated_at=excluded.updated_at",[tenant,clientId,purpose,Number(allowed),clip(source,80),clip(evidence,500),iso()]);
  if(!allowed)run(db,"update commercial_jobs set status='held',reason='consent_revoked' where tenant_id=? and client_id=? and status='pending' and kind "+(purpose==="marketing"?"in ('quote_followup_2h','quote_followup_24h','quote_followup_3d','lead_recovery_7d','return_cycle','birthday','inactive_60d','review_invitation')":"not in ('quote_followup_2h','quote_followup_24h','quote_followup_3d','lead_recovery_7d','return_cycle','birthday','inactive_60d','review_invitation')"),[tenant,clientId]);
  return {client_id:clientId,purpose,allowed};
}
export function hasConsent(db,tenant,clientId,purpose){
  return Number(read(db,"select allowed from client_contact_permissions where tenant_id=? and client_id=? and purpose=?",[tenant,clientId,purpose])?.allowed||0)===1;
}
function event(db,tenant,clientId,leadId,eventName,key,note="",entityId=null){
  const done=run(db,"insert into commercial_events(id,tenant_id,client_id,lead_id,event,entity_id,note,dedupe_key,created_at) values(?,?,?,?,?,?,?,?,?) on conflict(tenant_id,dedupe_key) do nothing",[uid(),tenant,clientId,leadId,eventName,entityId,clip(note,500),key,iso()]);
  return done.changes>0;
}
export function leadFor(db,tenant,clientId){
  return read(db,"select * from commercial_leads where tenant_id=? and client_id=?",[tenant,clientId])||null;
}
export function registerIncoming(db,tenant,clientId,text,{messageId=null,source=null,at=null}={}){
  const client=read(db,"select id,source from clients where tenant_id=? and id=?",[tenant,clientId]);
  if(!client)throw Object.assign(new Error("client_not_found"),{status:404});
  const eventKey=messageId?"inbound:"+clip(messageId,140):"inbound:demo:"+uid();
  const old=leadFor(db,tenant,clientId);
  const intent=classifyMessage(text),atTime=at||iso();
  const leadId=old?.id||uid();
  if(!event(db,tenant,clientId,leadId,"message_received",eventKey,intent)){
    return {...leadFor(db,tenant,clientId),duplicate:true};
  }
  const src=clip(source||client.source||"unknown",50);
  if(!old){
    run(db,"insert into commercial_leads(id,tenant_id,client_id,stage,source,intent,last_inbound_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)",[leadId,tenant,clientId,"novo_contato",src,intent,atTime,atTime,atTime]);
  }else{
    run(db,"update commercial_leads set intent=?,last_inbound_at=?,updated_at=? where id=? and tenant_id=?",[intent,atTime,atTime,old.id,tenant]);
  }
  if(["price","schedule","service"].includes(intent))scheduleAction(db,tenant,clientId,{kind:"lead_recovery_7d",scheduledAt:addHours(atTime,7*24),message:"Ainda quer marcar seu atendimento? Posso consultar os horários atuais.",dedupeKey:leadId+":recovery7d"});
  return {...leadFor(db,tenant,clientId),duplicate:false};
}
export function advanceLead(db,tenant,clientId,next,{actor="system",eventKey=null,estimatedValueCents=null}={}){
  if(!stageList.includes(next))throw Object.assign(new Error("invalid_funnel_stage"),{status:400});
  let existing=leadFor(db,tenant,clientId);
  if(!existing)existing=registerIncoming(db,tenant,clientId,"",{messageId:"lead-created:"+clientId});
  if(stageList.indexOf(next)<stageList.indexOf(existing.stage))throw Object.assign(new Error("stage_regression_requires_new_cycle"),{status:409});
  if(estimatedValueCents!=null&&(!Number.isInteger(estimatedValueCents)||estimatedValueCents<0))throw Object.assign(new Error("invalid_estimated_value"),{status:400});
  const key=eventKey||"stage:"+existing.id+":"+next;
  const recorded=event(db,tenant,clientId,existing.id,"stage_changed",key,next+":"+clip(actor,70));
  if(recorded){
    run(db,"update commercial_leads set stage=?,estimated_value_cents=coalesce(?,estimated_value_cents),updated_at=? where id=? and tenant_id=?",[next,estimatedValueCents,iso(),existing.id,tenant]);
  }
  if(recorded&&next==="orcamento_enviado")planQuoteFollowups(db,tenant,clientId,existing.id);
  return {...leadFor(db,tenant,clientId),unchanged:!recorded};
}
export function scheduleAction(db,tenant,clientId,{kind,scheduledAt,appointmentId=null,message="",dedupeKey}){
  if(!switches.has(kind)&&!["quote_followup_2h","quote_followup_24h","quote_followup_3d","lead_recovery_7d","owner_high_value_escalation"].includes(kind))throw new Error("invalid_job_kind");
  if(Number.isNaN(new Date(scheduledAt).valueOf()))throw new Error("invalid_scheduled_time");
  const configKey=kind.startsWith("quote_followup_")?"quote_followups":kind==="owner_high_value_escalation"?"high_value_alert":kind;
  const enabled=policy(db,tenant,configKey);
  const marketing=marketingKinds.has(kind),consent=hasConsent(db,tenant,clientId,marketing?"marketing":"transactional");
  const status=enabled&&consent?"pending":"held";
  const reason=!enabled?"disabled_by_owner":!consent?"consent_required":"delivery_not_configured";
  run(db,"insert into commercial_jobs(id,tenant_id,client_id,kind,appointment_id,message,scheduled_at,status,reason,dedupe_key,created_at) values(?,?,?,?,?,?,?,?,?,?,?) on conflict(tenant_id,dedupe_key) do nothing",[uid(),tenant,clientId,kind,appointmentId,clip(message,1200),new Date(scheduledAt).toISOString(),status,reason,clip(dedupeKey,180),iso()]);
  return read(db,"select * from commercial_jobs where tenant_id=? and dedupe_key=?",[tenant,clip(dedupeKey,180)]);
}
function addHours(date,h){return new Date(new Date(date).getTime()+h*3600000).toISOString()}
export function planQuoteFollowups(db,tenant,clientId,leadId,at=iso()){
  const content=[
    ["quote_followup_2h",2,"Posso conferir os horários disponíveis para o serviço que você consultou. Quer que eu veja?"],
    ["quote_followup_24h",24,"Se ainda estiver planejando sua visita, me diga o melhor dia que consulto as vagas atuais."],
    ["quote_followup_3d",72,"Ainda quer agendar? Posso verificar os horários atualizados. Sem compromisso."]
  ];
  return content.map(([kind,h,message])=>scheduleAction(db,tenant,clientId,{kind,scheduledAt:addHours(at,h),message,dedupeKey:leadId+":"+kind}));
}
export function afterAppointmentCreated(db,tenant,appointment){
  const a=read(db,"select a.*,s.name service_name,s.price_cents from appointments a join services s on s.id=a.service_id and s.tenant_id=a.tenant_id where a.tenant_id=? and a.id=?",[tenant,appointment.id||appointment]);
  if(!a)return null;
  const previous=leadFor(db,tenant,a.client_id);
  const desired=previous&&stageList.indexOf(previous.stage)>=stageList.indexOf("atendido")?"voltou":"agendou";
  const lead=advanceLead(db,tenant,a.client_id,desired,{eventKey:"appointment:"+a.id+":booked"});
  run(db,"update commercial_jobs set status='cancelled',reason='booked' where tenant_id=? and client_id=? and status in ('held','pending') and kind in ('quote_followup_2h','quote_followup_24h','quote_followup_3d','lead_recovery_7d')",[tenant,a.client_id]);
  const notices=[];
  for(const [kind,h] of [["appointment_confirmation_24h",24],["appointment_reminder_2h",2]]){
    const at=new Date(a.start_at).getTime()-h*3600000;
    if(at>Date.now())notices.push(scheduleAction(db,tenant,a.client_id,{kind,scheduledAt:new Date(at).toISOString(),appointmentId:a.id,message:"Lembrete do horário de "+a.service_name+".",dedupeKey:a.id+":"+kind}));
  }
  const rule=read(db,"select deposit_cents from service_automation_rules where tenant_id=? and service_id=?",[tenant,a.service_id]);
  const deposit=Number(rule?.deposit_cents||0);
  if(policy(db,tenant,"deposit_receivable")&&deposit>0&&deposit<=Number(a.price_cents)){
    const duplicate=read(db,"select id from financial_entries where tenant_id=? and reference_type='booking_deposit' and reference_id=?",[tenant,a.id]);
    if(!duplicate)run(db,"insert into financial_entries(id,tenant_id,kind,category,description,amount_cents,status,due_date,appointment_id,reference_type,reference_id,created_at,metadata) values(?,?,?,?,?,?,?,?,?,?,?,?,?)",[uid(),tenant,"income","deposit","Sinal pendente de "+a.service_name,deposit,"pending",a.start_at.slice(0,10),a.id,"booking_deposit",a.id,iso(),JSON.stringify({autogenerated:true})]);
  }
  return {lead,notices};
}
export function afterAppointmentStatus(db,tenant,appointmentId,status){
  const a=read(db,"select a.*,s.name service_name from appointments a join services s on s.id=a.service_id and s.tenant_id=a.tenant_id where a.tenant_id=? and a.id=?",[tenant,appointmentId]);
  if(!a)return null;
  if(status==="cancelled"||status==="no_show"){
    run(db,"update commercial_jobs set status='cancelled',reason='appointment_cancelled' where tenant_id=? and appointment_id=? and status in ('held','pending')",[tenant,appointmentId]);
    run(db,"update financial_entries set status='cancelled' where tenant_id=? and reference_type='booking_deposit' and reference_id=? and status='pending'",[tenant,appointmentId]);
    let offered=null;
    if(status==="cancelled"){
      try{
        const waiting=read(db,"select client_id from waitlist where tenant_id=? and service_id=? and status='waiting' and (professional_id IS NULL OR professional_id=?) order by created_at,id limit 1",[tenant,a.service_id,a.professional_id]);
        if(waiting)offered=scheduleAction(db,tenant,waiting.client_id,{kind:"waitlist_offer",scheduledAt:iso(),appointmentId, message:"Abriu um horário para o serviço solicitado. A disponibilidade será reconfirmada antes de reservar.",dedupeKey:"waitlist:"+appointmentId+":"+waiting.client_id});
      }catch{}
    }
    return {cancelled:true,waitlist_offer:offered};
  }
  if(status!=="completed")return {unchanged:true};
  const lead=leadFor(db,tenant,a.client_id);
  if(lead&&stageList.indexOf(lead.stage)<stageList.indexOf("atendido"))advanceLead(db,tenant,a.client_id,"atendido",{eventKey:"appointment:"+appointmentId+":completed"});
  const review=scheduleAction(db,tenant,a.client_id,{kind:"review_invitation",scheduledAt:addHours(iso(),2),appointmentId,message:"Obrigada pela visita! Se quiser, compartilhe sua experiência sincera na nossa página de avaliações.",dedupeKey:appointmentId+":review"});
  const rule=read(db,"select return_days from service_automation_rules where tenant_id=? and service_id=?",[tenant,a.service_id]);
  const days=Number(rule?.return_days||0);
  const next=days>0?scheduleAction(db,tenant,a.client_id,{kind:"return_cycle",scheduledAt:addHours(iso(),days*24),appointmentId,message:"Já está na época do seu retorno de "+a.service_name+". Quer consultar os horários?",dedupeKey:appointmentId+":return"}):null;
  return {review,returnAction:next};
}
export function updateServiceRule(db,tenant,serviceId,{return_days,deposit_cents}){
  if(!read(db,"select id from services where tenant_id=? and id=?",[tenant,serviceId]))throw Object.assign(new Error("service_not_found"),{status:404});
  if(!Number.isInteger(return_days)||return_days<0||return_days>730||!Number.isInteger(deposit_cents)||deposit_cents<0||deposit_cents>100000000)throw Object.assign(new Error("invalid_service_rule"),{status:400});
  run(db,"insert into service_automation_rules(tenant_id,service_id,return_days,deposit_cents,updated_at) values(?,?,?,?,?) on conflict(tenant_id,service_id) do update set return_days=excluded.return_days,deposit_cents=excluded.deposit_cents,updated_at=excluded.updated_at",[tenant,serviceId,return_days,deposit_cents,iso()]);
  return {service_id:serviceId,return_days,deposit_cents};
}
export function commercialOverview(db,tenant){
  const leadRows=list(db,"select l.*,c.name client_name,c.phone client_phone from commercial_leads l join clients c on c.id=l.client_id and c.tenant_id=l.tenant_id where l.tenant_id=? order by l.updated_at desc limit 200",[tenant]);
  const counts=Object.fromEntries(stageList.map(s=>[s,0]));
  const sources={};
  for(const l of leadRows){counts[l.stage]++;sources[l.source]=(sources[l.source]||0)+1}
  const transitions=stageList.slice(0,-1).map((from,i)=>({from,to:stageList[i+1],at_least_from:leadRows.filter(l=>stageList.indexOf(l.stage)>=i).length,at_least_to:leadRows.filter(l=>stageList.indexOf(l.stage)>=i+1).length}));
  const jobs=list(db,"select id,client_id,kind,status,scheduled_at,reason from commercial_jobs where tenant_id=? order by scheduled_at asc limit 120",[tenant]);
  const openQuoteCents=leadRows.filter(l=>stageList.indexOf(l.stage)<=2).reduce((n,l)=>n+Number(l.estimated_value_cents||0),0);
  return {stages:counts,transitions:transitions.map(t=>({...t,rate:t.at_least_from?Number((100*t.at_least_to/t.at_least_from).toFixed(1)):null})),sources,open_quote_cents:openQuoteCents,leads:leadRows,jobs,settings:policies(db,tenant),sending_enabled:false,stage:"phase24_safely_queued"};
}