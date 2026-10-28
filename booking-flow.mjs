import crypto from "node:crypto";

const uid=()=>crypto.randomUUID();
const one=(db,q,a=[])=>db.prepare(q).get(...a);
const many=(db,q,a=[])=>db.prepare(q).all(...a);
const run=(db,q,a=[])=>db.prepare(q).run(...a);
const clean=(v,n=900)=>String(v??"").trim().slice(0,n);
const norm=v=>clean(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const OFFER_MS=10*60000;
const MAX_DAYS=90;
const BOOKING=/\b(agend\w*|marc\w*|horario\w*|disponivel\w*|vaga\w*|reserv\w*|encaix\w*|quero fazer|amanha|hoje)\b/i;
const CANCEL=/\b(cancelar|desistir|deixa pra la|nao quero mais)\b/i;
const euroMoney=c=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(c/100);
const dayLabel=v=>v.slice(8,10)+"/"+v.slice(5,7);
const yyyyMMdd=d=>d.toISOString().slice(0,10);
const safeDate=v=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return null;
 const d=new Date(v+"T12:00:00.000Z");
 return Number.isFinite(d.getTime())&&yyyyMMdd(d)===v?d:null;
};
function localDay(nowMs,tz){
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(nowMs));
 const obj=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
 return obj.year+"-"+obj.month+"-"+obj.day;
}
export function dateFromBookingText(message,tz="America/Porto_Velho",nowMs=Date.now()){
 const t=norm(message),today=localDay(nowMs,tz),base=safeDate(today);
 if(!base)return null;
 const plus=n=>yyyyMMdd(new Date(base.getTime()+n*86400000));
 let date=null;
 if(/\bdepois de amanha\b/.test(t))date=plus(2);
 else if(/\bamanha\b/.test(t))date=plus(1);
 else if(/\bhoje\b/.test(t))date=today;
 else if(/\b\d{4}-\d{2}-\d{2}\b/.test(t))date=t.match(/\b\d{4}-\d{2}-\d{2}\b/)[0];
 else{
  const short=t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if(short){
   const month=String(Number(short[2])).padStart(2,"0"),day=String(Number(short[1])).padStart(2,"0");
   let year=short[3]?Number(short[3]):Number(today.slice(0,4));
   date=year+"-"+month+"-"+day;
   if(!short[3]&&safeDate(date)&&date<today)date=(++year)+"-"+month+"-"+day;
  }else{
   const names=["domingo","segunda","terca","quarta","quinta","sexta","sabado"];
   const w=names.findIndex(name=>new RegExp("\\b"+name+"(?:-feira)?\\b").test(t));
   if(w>=0){
    let d=(w-base.getUTCDay()+7)%7;
    if(d===0)d=7;
    date=plus(d);
   }
  }
 }
 if(!date||!safeDate(date))return null;
 const n=Math.round((safeDate(date).getTime()-base.getTime())/86400000);
 return n>=0&&n<=MAX_DAYS?date:null;
}
export function choiceFromText(message){
 const t=norm(message).replace(/[.!?]+$/,"").trim();
 if(["1","opcao 1","a primeira","primeira","primeiro"].includes(t))return 0;
 if(["2","opcao 2","a segunda","segunda","segundo"].includes(t))return 1;
 return null;
}
export function isBookingRequest(message){return BOOKING.test(norm(message))}
export function installBookingFlow(db){
 db.exec(
 "CREATE TABLE IF NOT EXISTS receptionist_booking_flows("+
 "id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,conversation_id TEXT NOT NULL,client_id TEXT NOT NULL,"+
 "service_id TEXT,professional_id TEXT,day TEXT,slots_json TEXT NOT NULL DEFAULT '[]',"+
 "status TEXT NOT NULL DEFAULT 'await_service',expires_at TEXT NOT NULL,"+
 "appointment_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,"+
 "UNIQUE(tenant_id,conversation_id));"+
 "CREATE INDEX IF NOT EXISTS idx_receptionist_booking_tenant ON receptionist_booking_flows(tenant_id,client_id,status);"
 );
}
export function bookingState(db,tenant,conversationId){
 const row=one(db,"SELECT * FROM receptionist_booking_flows WHERE tenant_id=? AND conversation_id=?",[tenant,conversationId]);
 if(!row)return null;
 try{return {...row,slots:JSON.parse(row.slots_json)}}catch{return {...row,slots:[]}}
}
function save(db,tenant,conversationId,clientId,v,nowMs){
 const previous=bookingState(db,tenant,conversationId);
 const stamp=new Date(nowMs).toISOString();
 const exp=new Date(nowMs+(v.status==="offered"?OFFER_MS:24*3600000)).toISOString();
 run(db,"INSERT INTO receptionist_booking_flows(id,tenant_id,conversation_id,client_id,service_id,professional_id,day,slots_json,status,expires_at,appointment_id,created_at,updated_at) "+
  "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) "+
  "ON CONFLICT(tenant_id,conversation_id) DO UPDATE SET client_id=excluded.client_id,service_id=excluded.service_id,professional_id=excluded.professional_id,day=excluded.day,slots_json=excluded.slots_json,status=excluded.status,expires_at=excluded.expires_at,appointment_id=excluded.appointment_id,updated_at=excluded.updated_at",
  [previous?.id||uid(),tenant,conversationId,clientId,v.service_id||null,v.professional_id||null,v.day||null,JSON.stringify(v.slots||[]),v.status,exp,v.appointment_id||null,previous?.created_at||stamp,stamp]);
 return bookingState(db,tenant,conversationId);
}
export function handoffBooking(db,tenant,conversationId){
 const current=bookingState(db,tenant,conversationId);
 if(!current||current.status==="confirmed")return;
 run(db,"UPDATE receptionist_booking_flows SET status='handoff',slots_json='[]',updated_at=? WHERE tenant_id=? AND conversation_id=?",[new Date().toISOString(),tenant,conversationId]);
}
const response=message=>({handled:true,handoff:false,text:message});
const human=(message,reason)=>({handled:true,handoff:true,reason,text:message});
function matchedService(db,tenant,message){
 const options=many(db,"SELECT id,name,price_cents,duration_min FROM services WHERE tenant_id=? AND active=1 ORDER BY length(name) DESC,name",[tenant]);
 const found=options.filter(s=>norm(message).includes(norm(s.name)));
 const maximal=found.filter(s=>!found.some(x=>x.id!==s.id&&norm(x.name).includes(norm(s.name))));
 return maximal.length===1?maximal[0]:null;
}
function matchedProfessional(db,tenant,message,serviceId){
 const people=many(db,"SELECT p.id,p.name FROM professionals p WHERE p.tenant_id=? AND p.active=1 AND EXISTS(SELECT 1 FROM professional_services ps WHERE ps.professional_id=p.id AND ps.service_id=?)",[tenant,serviceId]);
 const n=norm(message);
 const found=people.filter(p=>n.includes(norm(p.name))||new RegExp("\\b"+norm(p.name.split(/\s+/)[0])+"\\b").test(n));
 return found.length===1?found[0]:null;
}
function newOffer({db,tenant,clientId,conversationId,service,professionalId=null,day,nowMs,availability}){
 const found=availability(tenant,{date:day,serviceId:service.id,professionalId,limit:100});
 const sorted=found.filter(s=>new Date(s.start_at).getTime()>nowMs+60000).sort((a,b)=>a.start_at.localeCompare(b.start_at)||a.professional_name.localeCompare(b.professional_name));
 const chosen=[],unique=new Set();
 for(const slot of sorted){
  if(unique.has(slot.start_at))continue;
  unique.add(slot.start_at);
  chosen.push({start_at:slot.start_at,professional_id:slot.professional_id,professional_name:slot.professional_name,resource_id:slot.resource_id||null,local_time:slot.local_time,price_cents:Number(service.price_cents)});
  if(chosen.length>=2)break;
 }
 if(!chosen.length){
  save(db,tenant,conversationId,clientId,{status:"await_date",service_id:service.id,professional_id:professionalId},nowMs);
  return response("Não encontrei horário livre para "+service.name+" em "+dayLabel(day)+". Qual outro dia você prefere?");
 }
 save(db,tenant,conversationId,clientId,{status:"offered",service_id:service.id,professional_id:professionalId,day,slots:chosen},nowMs);
 const details=chosen.map((s,i)=>(i+1)+") "+dayLabel(day)+" às "+s.local_time+" com "+s.professional_name).join("\n");
 return {...response("Encontrei "+service.name+" por "+euroMoney(service.price_cents)+". Os horários livres agora são:\n"+details+"\nQual opção fica melhor? Responda "+(chosen.length===2?"1 ou 2":"1")+" para confirmar."),offered:chosen.length};
}
export function bookingTurn({db,tenant,client,conversation,message,availability,createAppointment,afterCreate=()=>{},onAudit=()=>{},nowMs=Date.now()}){
 const clientId=client?.id,conversationId=conversation?.id,raw=clean(message),n=norm(raw);
 const reference=clientId&&conversationId?one(db,"SELECT client_id FROM conversations WHERE id=? AND tenant_id=?",[conversationId,tenant]):null;
 if(!reference||reference.client_id!==clientId||!one(db,"SELECT id FROM clients WHERE tenant_id=? AND id=?",[tenant,clientId])){
  return human("Vou chamar a equipe para confirmar com segurança.","invalid_conversation");
 }
 let state=bookingState(db,tenant,conversationId);
 if(state?.status==="confirmed"){
  if(CANCEL.test(n))return human("Vou chamar alguém da equipe para conferir o cancelamento do agendamento existente.","existing_booking_cancel");
  if(isBookingRequest(raw)){
   save(db,tenant,conversationId,clientId,{status:"await_service"},nowMs);
   state=bookingState(db,tenant,conversationId);
  }else return response("Esse agendamento já foi registrado: "+state.appointment_id+". Se quiser outro, diga qual serviço e dia.");
 }
 if(state?.status==="handoff")return human("A equipe está cuidando desta conversa. Vou manter o atendimento com uma pessoa.","handoff_active");
 if(!state&&!isBookingRequest(raw))return {handled:false};
 if(state&&Date.parse(state.expires_at)<=nowMs){
  state=null;
  save(db,tenant,conversationId,clientId,{status:"await_service"},nowMs);
  if(choiceFromText(raw)!==null)return response("Essas opções expiraram. Me diga novamente o serviço e o dia para consultar horários.");
 }
 if(CANCEL.test(n)){
  handoffBooking(db,tenant,conversationId);
  return response("Tudo bem! Não fiz nenhum agendamento. Caso precise, a equipe pode ajudar.");
 }
 const picked=choiceFromText(raw);
 if(state?.status==="offered"&&picked!==null){
  const slot=state.slots[picked];
  if(!slot)return response("Essa opção não existe nesta oferta. Escolha um dos números que apareceram.");
  const service=one(db,"SELECT id,name,price_cents FROM services WHERE tenant_id=? AND id=? AND active=1",[tenant,state.service_id]);
  if(!service){handoffBooking(db,tenant,conversationId);return human("O serviço foi alterado. Vou chamar a equipe para conferir.","service_changed")}
  if(Number(service.price_cents)!==Number(slot.price_cents)){
    const newResult=newOffer({db,tenant,clientId,conversationId,service,professionalId:state.professional_id,day:state.day,nowMs,availability});
    return {...newResult,text:"O valor desse serviço mudou no cadastro. Confere as novas opções antes de confirmar:\n"+newResult.text};
  }
  const fresh=availability(tenant,{date:state.day,serviceId:state.service_id,professionalId:slot.professional_id,resourceId:slot.resource_id,limit:100});
  const stillFree=fresh.some(s=>s.start_at===slot.start_at&&s.professional_id===slot.professional_id&&(s.resource_id||null)===slot.resource_id&&Date.parse(s.start_at)>nowMs+60000);
  if(!stillFree)return newOffer({db,tenant,clientId,conversationId,service,professionalId:state.professional_id,day:state.day,nowMs,availability});
  let record;
  try{
   record=createAppointment(tenant,{id:null,tenantId:tenant,role:"system",name:"Recepcionista IA"},{client_id:clientId,service_id:service.id,professional_id:slot.professional_id,resource_id:slot.resource_id,start_at:slot.start_at,status:"scheduled",source:"assistant",notes:"Agendamento confirmado pela recepcionista automatizada"});
  }catch(e){
   if(e.status===409)return newOffer({db,tenant,clientId,conversationId,service,professionalId:state.professional_id,day:state.day,nowMs,availability});
   handoffBooking(db,tenant,conversationId);
   return human("Não consegui salvar na agenda. Vou chamar a equipe para confirmar.","booking_failed");
  }
  save(db,tenant,conversationId,clientId,{status:"confirmed",service_id:service.id,day:state.day,appointment_id:record.id},nowMs);
  try{afterCreate(db,tenant,record)}catch(e){console.error("booking_postcreate_failed",String(e.message||e).slice(0,120))}
  try{onAudit("receptionist.booking",record.id,{client_id:clientId,conversation_id:conversationId})}catch{}
  return {...response("Prontinho! Seu horário para "+service.name+" está confirmado em "+dayLabel(state.day)+" às "+slot.local_time+" com "+slot.professional_name+". Código: "+record.id+"."),booked:true,appointment_id:record.id};
 }
 if(state?.status==="offered"){
  if(/\b(outro dia|outra data|outra semana)\b/.test(n)){
   save(db,tenant,conversationId,clientId,{status:"await_date",service_id:state.service_id,professional_id:state.professional_id},nowMs);
   return response("Claro! Qual outro dia você prefere?");
  }
  return response("Para confirmar o horário responda 1 ou 2. Se preferir outro dia, é só me dizer.");
 }
 let service=matchedService(db,tenant,raw);
 if(!service&&state?.service_id)service=one(db,"SELECT id,name,price_cents,duration_min FROM services WHERE tenant_id=? AND id=? AND active=1",[tenant,state.service_id]);
 if(!service){
  save(db,tenant,conversationId,clientId,{status:"await_service"},nowMs);
  return response("Vamos agendar! Qual serviço você quer fazer?");
 }
 const zone=one(db,"SELECT timezone FROM tenants WHERE id=?",[tenant])?.timezone||"America/Porto_Velho";
 const date=dateFromBookingText(raw,zone,nowMs);
 const professional=matchedProfessional(db,tenant,raw,service.id);
 const professionalId=professional?.id||state?.professional_id||null;
 if(!date){
  save(db,tenant,conversationId,clientId,{status:"await_date",service_id:service.id,professional_id:professionalId},nowMs);
  return response(service.name+" custa "+euroMoney(service.price_cents)+". Para qual dia você quer marcar? Pode dizer amanhã ou 30/10.");
 }
 return newOffer({db,tenant,clientId,conversationId,service,professionalId,day:date,nowMs,availability});
}