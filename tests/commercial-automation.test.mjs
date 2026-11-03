import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {
 installCommercialAutomation, classifyMessage, receptionistDraft, policies, policy, setPolicy,
 setContactPermission, registerIncoming, leadFor, advanceLead, planQuoteFollowups,
 updateServiceRule, scheduleAction, afterAppointmentCreated, afterAppointmentStatus,
 commercialOverview
} from "../commercial-automation.mjs";
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec([
 "CREATE TABLE clients(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT,source TEXT,phone TEXT)",
 "CREATE TABLE services(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT,price_cents INTEGER,active INTEGER)",
 "CREATE TABLE appointments(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT,service_id TEXT,start_at TEXT,status TEXT)",
 "CREATE TABLE financial_entries(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,kind TEXT,category TEXT,description TEXT,amount_cents INTEGER,status TEXT,due_date TEXT,appointment_id TEXT,reference_type TEXT,reference_id TEXT,created_at TEXT,metadata TEXT)"
 ].join(";")+";");
 installCommercialAutomation(db);
 db.prepare("INSERT INTO clients(id,tenant_id,name,source) values(?,?,?,?)").run("c1","t1","Camila Santos","instagram");
 db.prepare("INSERT INTO clients(id,tenant_id,name,source) values(?,?,?,?)").run("c2","t2","Outra pessoa","google");
 db.prepare("INSERT INTO services(id,tenant_id,name,price_cents,active) values(?,?,?,?,?)").run("s1","t1","Coloração",28000,1);
 return db;
}
test("intent detection prioritizes human, discount and sensitive requests",()=>{
 assert.equal(classifyMessage("quero falar com uma atendente"),"human");
 assert.equal(classifyMessage("tem desconto na coloração?"),"discount");
 assert.equal(classifyMessage("tenho infecção, pode diagnosticar?"),"medical");
 assert.equal(classifyMessage("quanto custa?"),"price");
 assert.equal(classifyMessage("tem horário para agendar?"),"schedule");
});
test("discount never promises or grants discounts, forces human handoff",()=>{
 const v=receptionistDraft({text:"faz desconto na unha?"});
 assert.equal(v.handoff,true);assert.match(v.text,/gerente/i);assert.doesNotMatch(v.text,/\d+%/);
});
test("unknown prices and slots are never made up",()=>{
 const v=receptionistDraft({text:"quanto custa coloração?"});
 assert.equal(v.handoff,false);assert.doesNotMatch(v.text,/R\$/);assert.doesNotMatch(v.text,/\b\d\d:\d\d\b/);
});
test("known price from catalog is formatted and asks a booking question",()=>{
 const v=receptionistDraft({text:"quanto custa coloração?",services:[{name:"Coloração",price_cents:28000,active:1}]});
 assert.match(v.text,/R\$\s?280,00/);assert.match(v.text,/\?/);
});
test("general opening does not repeat the immediately previous opening",()=>{
 const a=receptionistDraft({text:"oi"});
 const b=receptionistDraft({text:"oi",lastGreeting:a.text});
 assert.notEqual(a.text,b.text);
});
test("all automation switches start OFF for new tenants",()=>{
 const db=fixture();const p=policies(db,"t1");assert.ok(Object.keys(p).length>=15);assert.ok(Object.values(p).every(v=>v===false));db.close();
});
test("only explicit owner-selected settings enable policy",()=>{
 const db=fixture();setPolicy(db,"t1","appointment_reminder_2h",true,"owner");assert.equal(policy(db,"t1","appointment_reminder_2h"),true);assert.equal(policy(db,"t2","appointment_reminder_2h"),false);db.close();
});
test("incoming message creates lead exactly once per provider message id",()=>{
 const db=fixture();
 const a=registerIncoming(db,"t1","c1","preço da coloração",{messageId:"provider-001"});
 const b=registerIncoming(db,"t1","c1","preço da coloração",{messageId:"provider-001"});
 assert.equal(a.stage,"novo_contato");assert.equal(a.intent,"price");assert.equal(b.duplicate,true);
 assert.equal(db.prepare("select count(*) n from commercial_events").get().n,1);
 db.close();
});
test("commercial leads remain segregated by tenant",()=>{
 const db=fixture();registerIncoming(db,"t1","c1","horário");
 assert.equal(leadFor(db,"t2","c1"),null);
 assert.throws(()=>registerIncoming(db,"t2","c1","oi"),/client_not_found/);
 db.close();
});
test("funnel progresses and rejects accidental regression",()=>{
 const db=fixture();registerIncoming(db,"t1","c1","oi");
 advanceLead(db,"t1","c1","respondeu");
 const q=advanceLead(db,"t1","c1","orcamento_enviado",{estimatedValueCents:28000});
 assert.equal(q.estimated_value_cents,28000);
 assert.throws(()=>advanceLead(db,"t1","c1","novo_contato"),/stage_regression/);
 assert.equal(commercialOverview(db,"t1").open_quote_cents,28000);
 db.close();
});
test("follow-up planning is idempotent, OFF by default and waits for opt-in",()=>{
 const db=fixture();registerIncoming(db,"t1","c1","preço");
 const lead=advanceLead(db,"t1","c1","orcamento_enviado");
 planQuoteFollowups(db,"t1","c1",lead.id);
 assert.equal(db.prepare("select count(*) n from commercial_jobs").get().n,4);
 assert.equal(db.prepare("select count(*) n from commercial_jobs where status='held'").get().n,4);
 db.close();
});
test("consent is independent for transactional and marketing messages",()=>{
 const db=fixture();
 setPolicy(db,"t1","return_cycle",true);
 setContactPermission(db,"t1","c1","transactional",true,"explicit","Formulário de autorização 2026-10-27");
 const a=scheduleAction(db,"t1","c1",{kind:"return_cycle",scheduledAt:new Date(Date.now()+86400000).toISOString(),dedupeKey:"return1"});
 assert.equal(a.status,"held");assert.equal(a.reason,"consent_required");
 setContactPermission(db,"t1","c1","marketing",true,"explicit","Formulário de autorização 2026-10-27");
 const b=scheduleAction(db,"t1","c1",{kind:"return_cycle",scheduledAt:new Date(Date.now()+86400000).toISOString(),dedupeKey:"return2"});
 assert.equal(b.status,"pending");
 setContactPermission(db,"t1","c1","marketing",false,"revoked_by_client");
 assert.equal(db.prepare("select status from commercial_jobs where dedupe_key='return2'").get().status,"held");
 db.close();
});
test("booking queues reminders and at most one configured deposit, without collecting payment",()=>{
 const db=fixture();const start=new Date(Date.now()+3*86400000).toISOString();
 db.prepare("insert into appointments(id,tenant_id,client_id,service_id,start_at,status) values(?,?,?,?,?,?)").run("a1","t1","c1","s1",start,"scheduled");
 setPolicy(db,"t1","appointment_confirmation_24h",true);setPolicy(db,"t1","appointment_reminder_2h",true);setPolicy(db,"t1","deposit_receivable",true);
 setContactPermission(db,"t1","c1","transactional",true,"explicit","Formulário de autorização 2026-10-27");
 updateServiceRule(db,"t1","s1",{return_days:30,deposit_cents:5000});
 afterAppointmentCreated(db,"t1",{id:"a1"});
 afterAppointmentCreated(db,"t1",{id:"a1"});
 assert.equal(db.prepare("select count(*) n from commercial_jobs").get().n,2);
 assert.equal(db.prepare("select count(*) n from financial_entries").get().n,1);
 assert.equal(db.prepare("select status from financial_entries").get().status,"pending");
 assert.equal(leadFor(db,"t1","c1").stage,"agendou");
 db.close();
});
test("complete appointment plans review invitation and configured return without sending",()=>{
 const db=fixture();
 const at=new Date(Date.now()+3*86400000).toISOString();
 db.prepare("insert into appointments(id,tenant_id,client_id,service_id,start_at,status) values(?,?,?,?,?,?)").run("a1","t1","c1","s1",at,"completed");
 setPolicy(db,"t1","review_invitation",true);setPolicy(db,"t1","return_cycle",true);
 setContactPermission(db,"t1","c1","transactional",true,"explicit","Formulário de autorização 2026-10-27");
 updateServiceRule(db,"t1","s1",{return_days:30,deposit_cents:0});
 afterAppointmentStatus(db,"t1","a1","completed");
 afterAppointmentStatus(db,"t1","a1","completed");
 assert.equal(db.prepare("select count(*) n from commercial_jobs").get().n,2);
 assert.equal(db.prepare("select count(*) n from commercial_jobs where status='pending'").get().n,0);
 db.close();
});
test("cancellation holds pending reminder jobs",()=>{
 const db=fixture();
 const at=new Date(Date.now()+3*86400000).toISOString();
 db.prepare("insert into appointments(id,tenant_id,client_id,service_id,start_at,status) values(?,?,?,?,?,?)").run("a1","t1","c1","s1",at,"cancelled");
 setPolicy(db,"t1","appointment_reminder_2h",true);setContactPermission(db,"t1","c1","transactional",true,"explicit","Formulário de autorização 2026-10-27");
 scheduleAction(db,"t1","c1",{kind:"appointment_reminder_2h",appointmentId:"a1",scheduledAt:at,dedupeKey:"a1:reminder"});
 afterAppointmentStatus(db,"t1","a1","cancelled");
 assert.equal(db.prepare("select status from commercial_jobs where appointment_id='a1'").get().status,"cancelled");
 db.close();
});
test("high-value discount intent does not invent a promotion",()=>{
 const v=receptionistDraft({text:"Me oferece um preço especial e desconto? Quero agendar"});
 assert.equal(v.handoff,true);assert.doesNotMatch(v.text,/\b\d+(?:,\d+)?%/);
});

test("disabling an automation immediately holds already planned pending jobs",()=>{
 const db=fixture();
 setPolicy(db,"t1","appointment_reminder_2h",true);
 setContactPermission(db,"t1","c1","transactional",true,"explicit","Registro de aceite em formulário");
 scheduleAction(db,"t1","c1",{kind:"appointment_reminder_2h",scheduledAt:new Date(Date.now()+3600000).toISOString(),dedupeKey:"switch-off"});
 assert.equal(db.prepare("select status from commercial_jobs where dedupe_key='switch-off'").get().status,"pending");
 setPolicy(db,"t1","appointment_reminder_2h",false);
 assert.equal(db.prepare("select status from commercial_jobs where dedupe_key='switch-off'").get().status,"held");
 db.close();
});
test("granting consent requires a recorded source of evidence",()=>{
 const db=fixture();
 assert.throws(()=>setContactPermission(db,"t1","c1","marketing",true,"explicit"),/consent_evidence_required/);
 const out=setContactPermission(db,"t1","c1","marketing",true,"documented_form","Aceite expresso registrado em 27/10/2026");
 assert.equal(out.allowed,true);
 db.close();
});
test("review requests require marketing consent and cannot filter negative feedback",()=>{
 const db=fixture(),start=new Date(Date.now()+86400000).toISOString();
 db.prepare("insert into appointments(id,tenant_id,client_id,service_id,start_at,status) values(?,?,?,?,?,?)").run("a2","t1","c1","s1",start,"completed");
 setPolicy(db,"t1","review_invitation",true);
 setContactPermission(db,"t1","c1","transactional",true,"explicit","Aceite transacional documentado");
 afterAppointmentStatus(db,"t1","a2","completed");
 const row=db.prepare("select * from commercial_jobs where kind='review_invitation'").get();
 assert.equal(row.status,"held");
 assert.match(row.message,/experiência sincera/);
 db.close();
});