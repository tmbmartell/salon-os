import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {installPhase7,handlePhase7Api} from "../phase7.mjs";

function setup(){
  const db=new DatabaseSync(":memory:");
  db.exec(`
    create table clients(id text primary key,tenant_id text,name text,allergies text);
    create table professionals(id text primary key,tenant_id text,name text);
    create table services(id text primary key,tenant_id text,name text);
    create table appointments(id text primary key,tenant_id text,client_id text,professional_id text,service_id text);
    create table appointment_items(id text primary key,appointment_id text,tenant_id text,professional_id text,service_id text);
  `);
  installPhase7(db);
  for(const [id,tenant,name] of [["ca","a","Ana"],["cb","a","Beatriz"],["cc","b","Outra empresa"]])
    db.prepare("insert into clients(id,tenant_id,name,allergies) values(?,?,?,?)").run(id,tenant,name,"");
  db.prepare("insert into professionals(id,tenant_id,name) values('pa','a','Cabeleireira'),('pb','b','Profissional externo')").run();
  db.prepare("insert into services(id,tenant_id,name) values('sa','a','Coloração'),('s2','a','Corte'),('sb','b','Serviço externo')").run();
  db.prepare("insert into appointments(id,tenant_id,client_id,professional_id,service_id) values('aa','a','ca','pa','sa')").run();
  return db;
}
async function call(db,method,path,body={}){
  const v=await handlePhase7Api({
    req:{method},res:{},url:new URL(path,"http://test.local"),
    db,user:{id:"owner",tenantId:"a"},tenant:"a",
    parseBody:async()=>body,requirePermission:()=>{},audit:()=>{},
    send:(_res,status,data)=>({status,data})
  });
  return v;
}

test("ficha técnica vinculada ao atendimento da mesma cliente e empresa",async()=>{
  const db=setup();
  try{
    const done=await call(db,"POST","/api/clients/ca/technical",
      {title:"Fórmula da coloração",appointment_id:"aa",formula:"45 g + 20 ml"});
    assert.equal(done.status,201);
    const saved=db.prepare("select * from technical_records where id=?").get(done.data.id);
    assert.equal(saved.appointment_id,"aa");
    assert.equal(saved.service_id,"sa");
    assert.equal(saved.professional_id,"pa");
    const read=await call(db,"GET","/api/clients/ca/technical");
    assert.equal(read.status,200);
    assert.equal(read.data.length,1);
    assert.equal(read.data[0].service_name,"Coloração");
  }finally{db.close()}
});

test("impede cruzar agendamento de outra cliente, serviço ou salão",async()=>{
  const db=setup();
  try{
    assert.equal((await call(db,"POST","/api/clients/cb/technical",
      {title:"Incorreta",appointment_id:"aa"})).data.error,"invalid_appointment_reference");
    assert.equal((await call(db,"POST","/api/clients/ca/technical",
      {title:"Incorreta",appointment_id:"aa",service_id:"s2",professional_id:"pa"})).data.error,"appointment_service_mismatch");
    assert.equal((await call(db,"POST","/api/clients/ca/technical",
      {title:"Incorreta",service_id:"sb"})).data.error,"invalid_reference");
    assert.equal((await call(db,"GET","/api/clients/cc/technical")).status,404);
    assert.equal(db.prepare("select count(*) n from technical_records").get().n,0);
  }finally{db.close()}
});
