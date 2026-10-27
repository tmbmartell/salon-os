import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {handlePhase9Api} from "../phase9.mjs";
import {requirePermission} from "../auth.mjs";

test("recepção e profissional consultam equipe sem números pessoais ou motivos de afastamento",async()=>{
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("CREATE TABLE professionals(id text primary key,tenant_id text,name text,role text,specialties text,active integer);");
    db.prepare("insert into professionals(id,tenant_id,name,role,specialties,active) values(?,?,?,?,?,?)")
      .run("p","a","Profissional A","Esteticista",'["Unhas"]',1);
    db.prepare("insert into professionals(id,tenant_id,name,role,specialties,active) values(?,?,?,?,?,?)")
      .run("private","b","Outra empresa","Profissional",'["Cabelo"]',1);
    for(const role of ["reception","professional"]){
      const user={id:"x",role,tenantId:"a"};
      const route=async path=>handlePhase9Api({db,req:{method:"GET"},res:{},url:new URL(path,"http://localhost"),
        tenant:"a",user,send:(_res,status,data)=>({status,data}),requirePermission,audit:()=>{},parseBody:async()=>({})});
      const response=await route("/api/staff/overview");
      assert.equal(response.status,200);
      assert.equal(response.data.limited,true);
      assert.equal(response.data.metrics.length,1);
      assert.equal(response.data.metrics[0].name,"Profissional A");
      assert.equal("commission_total" in response.data.metrics[0],false);
      assert.equal("revenue" in response.data.metrics[0],false);
      assert.equal("goal" in response.data.metrics[0],false);
      assert.deepEqual(response.data.time_off,[]);
      assert.equal((await route("/api/staff/time-off")).status,403);
    }
  }finally{db.close()}
});
