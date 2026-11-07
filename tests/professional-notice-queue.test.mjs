import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {
  installProfessionalNoticeQueue,queueProfessionalNotices,
  dueProfessionalNotices,previewProfessionalNotice,simulateProfessionalNotice
} from "../professional-notice-queue.mjs";

const clock="2026-11-07T12:00:00.000Z";
const start="2026-11-20T14:00:00.000Z";
const end="2026-11-20T15:00:00.000Z";
const appointment={id:"qa-booking-1",professional_id:"prof-1",start_at:start,end_at:end,
  client_name:"Cliente de Teste",service_name:"Limpeza de Pele",status:"confirmed"};
const professional={id:"prof-1",name:"Júlia",phone:"69 99999-8888"};
function fixture(){const db=new DatabaseSync(":memory:");installProfessionalNoticeQueue(db);return db}
function count(db,tenant,status){return db.prepare("select count(*) n from professional_notice_queue where tenant_id=? and status=?").get(tenant,status).n}

test("fila de 24h, 2h e 30min, com aviso imediato e deduplicação",()=>{
 const db=fixture();
 try{
  const args={tenantId:"sala-a",appointment,professional,now:clock};
  const first=queueProfessionalNotices(db,args);
  assert.equal(first.scheduled,4);assert.equal(first.external_messages_sent,0);
  assert.equal(queueProfessionalNotices(db,args).scheduled,0);
  assert.equal(count(db,"sala-a","pending"),4);
  const due=dueProfessionalNotices(db,{tenantId:"sala-a",now:clock});
  assert.equal(due.length,1);assert.equal(due[0].kind,"agenda_created");
  assert.equal(due[0].recipient_phone,"69999998888");
  assert.match(previewProfessionalNotice(due[0],{at:clock}),/Júlia/);
  assert.match(previewProfessionalNotice(due[0],{at:clock}),/Cliente de Teste/);
  assert.equal(simulateProfessionalNotice(db,{tenantId:"sala-a",id:due[0].id}).real_delivery,false);
  assert.equal(simulateProfessionalNotice(db,{tenantId:"sala-a",id:due[0].id}).simulated,false);
  const reminders=db.prepare("select kind,scheduled_at from professional_notice_queue where tenant_id=? and kind like 'agenda_%' order by scheduled_at").all("sala-a");
  assert.equal(reminders.length,4);
  const twoHours=db.prepare("select * from professional_notice_queue where tenant_id=? and kind='agenda_2h'").get("sala-a");
  assert.match(previewProfessionalNotice(twoHours,{at:twoHours.scheduled_at}),/Faltam 2h/);
 }finally{db.close()}
});

test("remarcação substitui avisos futuros sem duplicar e cancelamento encerra fila",()=>{
 const db=fixture();
 try{
  queueProfessionalNotices(db,{tenantId:"sala-a",appointment,professional,now:clock});
  const changed={...appointment,start_at:"2026-11-21T14:00:00.000Z",end_at:"2026-11-21T15:00:00.000Z"};
  const details={tenantId:"sala-a",appointment:changed,professional,event:"rescheduled",previousStartAt:start,now:clock};
  assert.equal(queueProfessionalNotices(db,details).scheduled,4);
  assert.equal(queueProfessionalNotices(db,details).scheduled,0);
  assert.equal(count(db,"sala-a","pending"),4);
  assert.equal(count(db,"sala-a","superseded"),4);
  const event=dueProfessionalNotices(db,{tenantId:"sala-a",now:clock}).find(n=>n.kind==="rescheduled");
  assert.ok(event);
  assert.match(previewProfessionalNotice(event,{at:clock}),/Anterior/);
  assert.equal(queueProfessionalNotices(db,{...details,event:"cancelled"}).scheduled,1);
  assert.equal(count(db,"sala-a","pending"),1);
  const cancelled=dueProfessionalNotices(db,{tenantId:"sala-a",now:clock});
  assert.equal(cancelled.length,1);assert.equal(cancelled[0].kind,"cancelled");
  assert.match(previewProfessionalNotice(cancelled[0],{at:clock}),/cancelado/);
 }finally{db.close()}
});

test("não envia para número ausente e mantém isolamento entre salões",()=>{
 const db=fixture();
 try{
  const noPhone=queueProfessionalNotices(db,{tenantId:"sala-a",appointment,professional:{...professional,phone:""},now:clock});
  assert.equal(noPhone.blocked_missing_phone,4);
  assert.equal(dueProfessionalNotices(db,{tenantId:"sala-a",now:"2026-11-22T00:00:00.000Z"}).length,0);
  assert.equal(count(db,"sala-a","blocked_missing_phone"),4);
  queueProfessionalNotices(db,{tenantId:"sala-b",appointment,professional,now:clock});
  assert.equal(dueProfessionalNotices(db,{tenantId:"sala-b",now:clock}).length,1);
  assert.equal(dueProfessionalNotices(db,{tenantId:"sala-a",now:clock}).length,0);
  assert.throws(()=>queueProfessionalNotices(db,{tenantId:"sala-a",appointment,professional:{id:"outro",phone:"69999998888"},now:clock}));
 }finally{db.close()}
});
