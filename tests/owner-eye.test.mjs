import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {makeOwnerEyeSnapshot,handleOwnerEyeApi} from "../owner-eye.mjs";

function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE tenants(id text primary key,timezone text);
    CREATE TABLE financial_entries(id text primary key,tenant_id text,kind text,amount_cents integer,status text,paid_at text,due_date text);
    CREATE TABLE clients(id text primary key,tenant_id text,name text);
    CREATE TABLE professionals(id text primary key,tenant_id text,name text);
    CREATE TABLE services(id text primary key,tenant_id text,name text);
    CREATE TABLE appointments(id text primary key,tenant_id text,client_id text,professional_id text,service_id text,start_at text,status text);
    CREATE TABLE checkout_records(id text primary key,tenant_id text,appointment_id text,total_cents integer,created_at text);
    CREATE TABLE products(id text primary key,tenant_id text,name text,unit text,stock_qty real,min_qty real,ideal_qty real,active integer);
    CREATE TABLE engagement_tasks(id text primary key,tenant_id text,status text,due_at text);
  `);
  db.prepare("insert into tenants(id,timezone) values(?,?)").run("a","America/Porto_Velho");
  db.prepare("insert into tenants(id,timezone) values(?,?)").run("b","America/Sao_Paulo");
  db.prepare("insert into clients(id,tenant_id,name) values('cl','a','Juliana'),('private','b','Cliente privado')").run();
  db.prepare("insert into professionals(id,tenant_id,name) values('p','a','Bia'),('pprivate','b','Outra')").run();
  db.prepare("insert into services(id,tenant_id,name) values('s','a','Coloração'),('sprivate','b','Privado')").run();
  for(const [id,tenant,kind,cents,status,paid,due] of [
    ["i1","a","income",10000,"paid","2026-10-26T14:00:00Z",null],
    ["i2","a","income",5000,"paid","2026-10-25T12:00:00Z",null],
    ["ex","a","expense",3000,"paid","2026-10-25T12:00:00Z",null],
    ["prev","a","income",7000,"paid","2026-09-20T12:00:00Z",null],
    ["pend","a","expense",10000,"pending",null,"2026-10-15"],
    ["bigpending","a","income",200000,"pending",null,null],
    ["bprivate","b","income",999999,"paid","2026-10-26T14:00:00Z",null]
  ])db.prepare("insert into financial_entries(id,tenant_id,kind,amount_cents,status,paid_at,due_date) values(?,?,?,?,?,?,?)").run(id,tenant,kind,cents,status,paid,due);
  for(const [id,tenant,cl,pro,sv,start,status]of[
    ["a1","a","cl","p","s","2026-10-25T12:00:00Z","completed"],
    ["a2","a","cl","p","s","2026-10-24T12:00:00Z","no_show"],
    ["a0","a","cl","p","s","2026-08-25T12:00:00Z","completed"],
    ["b1","b","private","pprivate","sprivate","2026-10-25T12:00:00Z","completed"]
  ])db.prepare("insert into appointments(id,tenant_id,client_id,professional_id,service_id,start_at,status) values(?,?,?,?,?,?,?)").run(id,tenant,cl,pro,sv,start,status);
  for(const [id,tenant,appt,value,created]of[
    ["c1","a","a1",12000,"2026-10-25T15:00:00Z"],
    ["c0","a","a0",9000,"2026-08-25T15:00:00Z"],
    ["cb","b","b1",500000,"2026-10-25T15:00:00Z"]
  ])db.prepare("insert into checkout_records(id,tenant_id,appointment_id,total_cents,created_at) values(?,?,?,?,?)").run(id,tenant,appt,value,created);
  for(const [id,tenant,qty,min,active]of[
    ["stock-low","a",3,5,1],["stock-normal","a",20,5,1],["stock-other","b",0,10,1]
  ])db.prepare("insert into products(id,tenant_id,name,unit,stock_qty,min_qty,ideal_qty,active) values(?,?,?,?,?,?,?,?)").run(id,tenant,id,"g",qty,min,25,active);
  db.prepare("insert into engagement_tasks(id,tenant_id,status,due_at) values(?,?,?,?)").run("task","a","pending","2026-10-25T08:00:00Z");
  return db;
}
const clock=new Date("2026-10-26T15:00:00Z");
test("KPIs não duplicam checkout e usam data local e período anterior correto",()=>{
  const db=fixture();
  try{
    const r=makeOwnerEyeSnapshot(db,"a",{now:clock});
    assert.equal(r.period.time_zone,"America/Porto_Velho");
    assert.equal(r.period.to,"2026-10-26");
    assert.equal(r.period.from,"2026-09-27");
    assert.equal(r.period.previous_to,"2026-09-26");
    assert.equal(r.money.income,150);
    assert.equal(r.money.income_previous,70);
    assert.equal(r.money.income_change_pct,114.29);
    assert.equal(r.money.expenses,30);
    assert.equal(r.money.cash_net,120);
    assert.equal(r.operations.completed_services,1);
    assert.equal(r.operations.checkout_volume,120);
    assert.equal(r.operations.average_checkout,120);
    assert.equal(r.operations.repeat_rate,100);
    assert.equal(r.operations.repeat_clients,1);
    assert.equal(r.operations.no_show_rate,50);
    assert.equal(r.lists.professionals[0].name,"Bia");
    assert.equal(r.lists.services[0].name,"Coloração");
    assert.equal(r.attention.critical_stock,1);
    assert.equal(r.attention.overdue_bills,1);
    assert.equal(r.attention.overdue_followups,1);
    assert.equal(r.alerts.length,3);
    assert.equal(r.charts.cashflow14.length,14);
    assert.equal(r.charts.cashflow14.find(x=>x.date==="2026-10-26").income,100);
  }finally{db.close()}
});
test("rotas protegem visão da proprietária e não misturam dados de outros salões",async()=>{
  const db=fixture();
  try{
    const summary=makeOwnerEyeSnapshot(db,"b",{now:clock});
    assert.equal(summary.money.income,9999.99);
    assert.equal(summary.operations.completed_services,1);
    assert.equal(summary.lists.professionals[0].name,"Outra");
    assert.equal(summary.attention.critical_stock,1);
    assert.equal(summary.alerts.some(x=>x.id==="bills"),false);
    const route=async role=>handleOwnerEyeApi({
      req:{method:"GET"},res:{},db,tenant:"a",user:{id:"user",role},
      url:new URL("/api/owner-eye/summary","http://localhost"),
      send:(_res,status,data)=>({status,data}),
      requirePermission:(_user,perm)=>assert.equal(perm,"analytics.read")
    });
    assert.equal((await route("reception")).status,403);
    assert.equal((await route("professional")).status,403);
    assert.equal((await route("owner")).status,200);
    assert.equal((await route("manager")).status,200);
  }finally{db.close()}
});
test("timezone local determina o dia de referência, não o dia UTC",()=>{
  const db=fixture();
  try{
    const at=new Date("2026-10-26T02:00:00Z");
    const summary=makeOwnerEyeSnapshot(db,"a",{now:at});
    assert.equal(summary.period.to,"2026-10-25");
    assert.equal(summary.period.from,"2026-09-26");
    assert.equal(summary.money.income,50);
  }finally{db.close()}
});
