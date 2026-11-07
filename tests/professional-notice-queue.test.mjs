import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {
  installProfessionalNoticeQueue,queueProfessionalNotices,
  dueProfessionalNotices,previewProfessionalNotice,simulateProfessionalNotice,queueNoticesForAppointment
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

test("integra agendamento com dois profissionais, sem usar telefone da cliente",()=>{
 const db=fixture();
 try{
  db.exec(`create table clients(id text,tenant_id text,name text,phone text);
    create table appointments(id text,tenant_id text,client_id text,professional_id text,service_id text,start_at text,end_at text,status text);
    create table appointment_items(id text,tenant_id text,appointment_id text,professional_id text,service_id text,sequence integer,start_at text,end_at text);
    create table professionals(id text,tenant_id text,name text,phone text);
    create table services(id text,tenant_id text,name text);`);
  db.prepare("insert into clients values(?,?,?,?)").run("c1","sala-a","Cliente de Teste","69911112222");
  db.prepare("insert into professionals values(?,?,?,?)").run("p1","sala-a","Júlia","69999998888");
  db.prepare("insert into professionals values(?,?,?,?)").run("p2","sala-a","Carla","69999997777");
  db.prepare("insert into services values(?,?,?)").run("s1","sala-a","Limpeza de Pele");
  db.prepare("insert into services values(?,?,?)").run("s2","sala-a","Massagem");
  db.prepare("insert into appointments values(?,?,?,?,?,?,?,?)").run(
    "a1","sala-a","c1","p1","s1",start,"2026-11-20T17:00:00.000Z","confirmed");
  db.prepare("insert into appointment_items values(?,?,?,?,?,?,?,?)").run(
    "item1","sala-a","a1","p1","s1",0,start,end);
  db.prepare("insert into appointment_items values(?,?,?,?,?,?,?,?)").run(
    "item2","sala-a","a1","p2","s2",1,"2026-11-20T15:00:00.000Z","2026-11-20T16:30:00.000Z");
  const first=queueNoticesForAppointment(db,{tenantId:"sala-a",appointmentId:"a1",now:clock});
  assert.equal(first.professionals,2);assert.equal(first.scheduled,8);assert.equal(first.external_messages_sent,0);
  const due=dueProfessionalNotices(db,{tenantId:"sala-a",now:clock});
  assert.equal(due.length,2);
  assert.deepEqual(new Set(due.map(x=>x.recipient_phone)),new Set(["69999998888","69999997777"]));
  assert.ok(due.every(x=>x.recipient_phone!=="69911112222"));
  assert.equal(queueNoticesForAppointment(db,{tenantId:"sala-a",appointmentId:"a1",now:clock}).scheduled,0);
  db.prepare("update appointments set status='cancelled' where id=?").run("a1");
  const cancel=queueNoticesForAppointment(db,{tenantId:"sala-a",appointmentId:"a1",event:"cancelled",now:clock});
  assert.equal(cancel.scheduled,2);
  assert.equal(dueProfessionalNotices(db,{tenantId:"sala-a",now:clock}).length,2);
  assert.equal(count(db,"sala-a","superseded"),8);
 }finally{db.close()}
});
