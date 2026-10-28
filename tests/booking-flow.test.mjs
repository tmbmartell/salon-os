import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {installBookingFlow,bookingTurn,bookingState,handoffBooking,choiceFromText,dateFromBookingText} from "../booking-flow.mjs";
import {localTimeToUtc} from "../slot-time.mjs";
import {installCommercialAutomation,policies} from "../commercial-automation.mjs";

const nowMs=Date.parse("2026-10-27T16:00:00.000Z");
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec(
 "CREATE TABLE tenants(id TEXT PRIMARY KEY,timezone TEXT);"+
 "CREATE TABLE clients(id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT);"+
 "CREATE TABLE conversations(id TEXT PRIMARY KEY,tenant_id TEXT,client_id TEXT);"+
 "CREATE TABLE services(id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT,active INTEGER,price_cents INTEGER,duration_min INTEGER);"+
 "CREATE TABLE professionals(id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT,active INTEGER);"+
 "CREATE TABLE professional_services(professional_id TEXT,service_id TEXT);"+
 "CREATE TABLE appointments(id TEXT PRIMARY KEY,tenant_id TEXT,client_id TEXT,service_id TEXT,professional_id TEXT,start_at TEXT,status TEXT);"
 );
 db.prepare("insert into tenants values(?,?)").run("t1","America/Porto_Velho");
 db.prepare("insert into tenants values(?,?)").run("t2","America/Sao_Paulo");
 db.prepare("insert into clients values(?,?,?)").run("c1","t1","Camila");
 db.prepare("insert into clients values(?,?,?)").run("c2","t2","Outra");
 db.prepare("insert into conversations values(?,?,?)").run("co1","t1","c1");
 db.prepare("insert into conversations values(?,?,?)").run("co2","t2","c2");
 db.prepare("insert into services values(?,?,?,?,?,?)").run("s1","t1","Coloração",1,28000,60);
 db.prepare("insert into professionals values(?,?,?,?)").run("p1","t1","Ana Ribeiro",1);
 db.prepare("insert into professional_services values(?,?)").run("p1","s1");
 installBookingFlow(db);installCommercialAutomation(db);
 const slots=[
  {start_at:"2026-10-28T13:00:00.000Z",local_time:"09:00",professional_id:"p1",professional_name:"Ana Ribeiro",resource_id:null},
  {start_at:"2026-10-28T14:00:00.000Z",local_time:"10:00",professional_id:"p1",professional_name:"Ana Ribeiro",resource_id:null}
 ];
 let next=0,calls=0;
 const availability=()=>slots.filter(s=>!db.prepare("select id from appointments where start_at=?").get(s.start_at));
 const createAppointment=(tenant,user,b)=>{
  calls++;
  const taken=db.prepare("select id from appointments where tenant_id=? and start_at=?").get(tenant,b.start_at);
  if(taken)throw Object.assign(Error("busy"),{status:409});
  const record={id:"a"+(++next),start_at:b.start_at,...b};
  db.prepare("insert into appointments values(?,?,?,?,?,?,?)").run(record.id,tenant,b.client_id,b.service_id,b.professional_id,b.start_at,"scheduled");
  return record;
 };
 const process=(msg,{tenant="t1",client={id:"c1"},conversation={id:"co1"},now=nowMs,create=createAppointment,available=availability}={})=>
   bookingTurn({db,tenant,client,conversation,message:msg,availability:available,createAppointment:create,nowMs:now});
 return {db,process,slots,availability,get calls(){return calls}};
}
test("accepts explicit local dates, ignores invalid/past dates and stays in tenant timezone",()=>{
 assert.equal(dateFromBookingText("amanhã","America/Porto_Velho",nowMs),"2026-10-28");
 assert.equal(dateFromBookingText("quinta","America/Porto_Velho",nowMs),"2026-10-29");
 assert.equal(dateFromBookingText("dia 28/10","America/Porto_Velho",nowMs),"2026-10-28");
 assert.equal(dateFromBookingText("31/02/2026","America/Porto_Velho",nowMs),null);
 assert.equal(dateFromBookingText("2025-10-31","America/Porto_Velho",nowMs),null);
 assert.equal(dateFromBookingText("2040-10-27","America/Porto_Velho",nowMs),null);
});
test("IANA time zones yield real UTC times rather than silent Z fallback",()=>{
 assert.equal(localTimeToUtc("2026-10-28","09:00","America/Porto_Velho"),"2026-10-28T13:00:00.000Z");
 assert.equal(localTimeToUtc("2026-10-28","09:00","America/Sao_Paulo"),"2026-10-28T12:00:00.000Z");
 assert.equal(localTimeToUtc("2026-07-28","09:00","America/New_York"),"2026-07-28T13:00:00.000Z");
 assert.throws(()=>localTimeToUtc("2026-03-08","02:30","America/New_York"),/nonexistent_local_time/);
});
test("choices need explicit 1 or 2, never treat vague approval as booking",()=>{
 assert.equal(choiceFromText("sim"),null);
 assert.equal(choiceFromText("1"),0);
 assert.equal(choiceFromText("2"),1);
 assert.equal(choiceFromText("primeira"),0);
 assert.equal(choiceFromText("opção 2"),1);
});
test("booking progresses through service, date, two verified offers and explicit confirmation",()=>{
 const x=fixture();
 assert.equal(x.process("Quero agendar").text.includes("Qual serviço"),true);
 assert.equal(bookingState(x.db,"t1","co1").status,"await_service");
 const dateQuestion=x.process("Coloração");
 assert.match(dateQuestion.text,/qual dia/i);
 assert.equal(bookingState(x.db,"t1","co1").status,"await_date");
 const offer=x.process("amanhã");
 assert.equal(offer.offered,2);
 assert.equal(x.process("2").booked,true);
 x.db.close();
});
test("direct request proposes two slots and creates exactly one appointment on confirmed choice",()=>{
 const x=fixture();
 const offer=x.process("Quero agendar coloração amanhã");
 assert.equal(offer.offered,2);
 assert.match(offer.text,/R\$\s?280,00/);
 assert.equal(x.db.prepare("select count(*) n from appointments").get().n,0);
 assert.match(x.process("sim").text,/1 ou 2/);
 assert.equal(x.db.prepare("select count(*) n from appointments").get().n,0);
 const booked=x.process("1");
 assert.equal(booked.booked,true);
 assert.equal(bookingState(x.db,"t1","co1").status,"confirmed");
 assert.equal(x.db.prepare("select count(*) n from appointments").get().n,1);
 assert.equal(x.process("1").booked,undefined);
 assert.equal(x.db.prepare("select count(*) n from appointments").get().n,1);
 x.db.close();
});
test("slot is rechecked before write; taken slot never receives a false confirmation",()=>{
 const x=fixture();
 x.process("Quero agendar coloração amanhã");
 x.db.prepare("insert into appointments values(?,?,?,?,?,?,?)").run("manual","t1","c1","s1","p1",x.slots[0].start_at,"scheduled");
 const result=x.process("1");
 assert.equal(result.booked,undefined);
 assert.equal(x.db.prepare("select count(*) n from appointments").get().n,1);
 assert.equal(bookingState(x.db,"t1","co1").status,"offered");
 assert.match(result.text,/2\)|1\)/);
 x.db.close();
});
test("transactional 409 results in another offer rather than duplicate booking",()=>{
 const x=fixture();
 x.process("Quero agendar coloração amanhã");
 const r=x.process("1",{create:()=>{throw Object.assign(Error("conflict"),{status:409})}});
 assert.equal(r.booked,undefined);
 assert.equal(x.db.prepare("select count(*) n from appointments").get().n,0);
 x.db.close();
});
test("offer expiry blocks old selections",()=>{
 const x=fixture();x.process("Quero agendar coloração amanhã");
 const r=x.process("1",{now:nowMs+11*60000});
 assert.match(r.text,/expiraram/i);
 assert.equal(x.db.prepare("select count(*) n from appointments").get().n,0);
 x.db.close();
});
test("human handoff invalidates offered options",()=>{
 const x=fixture();x.process("Quero agendar coloração amanhã");
 handoffBooking(x.db,"t1","co1");
 const r=x.process("1");
 assert.equal(r.handoff,true);
 assert.equal(x.db.prepare("select count(*) n from appointments").get().n,0);
 x.db.close();
});
test("tenant ownership and conversation-client relation are verified before any offer",()=>{
 const x=fixture();
 assert.equal(x.process("Quero agendar coloração amanhã",{tenant:"t2"}).handoff,true);
 assert.equal(x.process("Quero agendar coloração amanhã",{client:{id:"c2"}}).handoff,true);
 assert.equal(x.db.prepare("select count(*) n from receptionist_booking_flows").get().n,0);
 x.db.close();
});
test("all switches, including assistant booking, begin disabled",()=>{
 const x=fixture(),cfg=policies(x.db,"t1");
 assert.equal(cfg.assistant_reply,false);
 assert.equal(cfg.assistant_booking,false);
 x.db.close();
});

test("price changes invalidate the old quote and require renewed confirmation",()=>{
 const x=fixture();x.process("Quero agendar coloração amanhã");
 x.db.prepare("update services set price_cents=30000 where id='s1'").run();
 const r=x.process("1");
 assert.equal(r.booked,undefined);
 assert.match(r.text,/mudou no cadastro/);
 assert.match(r.text,/R\$\s?300,00/);
 assert.equal(x.db.prepare("select count(*) n from appointments").get().n,0);
 x.db.close();
});
test("second booking can begin a new cycle after a confirmed appointment",()=>{
 const x=fixture();x.process("Quero agendar coloração amanhã");
 x.process("1");
 const next=x.process("Quero agendar coloração amanhã");
 assert.equal(next.offered,1);
 assert.equal(bookingState(x.db,"t1","co1").status,"offered");
 x.db.close();
});
test("no availability produces an alternative-date question and no appointment",()=>{
 const x=fixture();
 const r=x.process("Quero agendar coloração amanhã",{available:()=>[]});
 assert.match(r.text,/outro dia/);
 assert.equal(bookingState(x.db,"t1","co1").status,"await_date");
 assert.equal(x.db.prepare("select count(*) n from appointments").get().n,0);
 x.db.close();
});