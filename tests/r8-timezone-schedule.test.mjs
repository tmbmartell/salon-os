// R8 — fuso horário de Porto Velho, bloqueios de agenda e período local dos relatórios.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {localTimeToUtc, localStamp, localDateOf, localMinutesOf} from "../slot-time.mjs";

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"..");
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function freePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
async function start(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"novagente-r8-"));
  const port=await freePort(),base="http://127.0.0.1:"+port,dbPath=path.join(directory,"qa.sqlite");
  const child=spawn(process.execPath,["server.mjs"],{cwd:root,
    env:{...process.env,PORT:String(port),HOST:"127.0.0.1",SALON_DB:dbPath,
      NOVAGENTE_ENABLE_RECEPTIONIST_AI:"false",JEV_CONTROL_PLANE_URL:"http://127.0.0.1:1"},
    stdio:["ignore","pipe","pipe"]});
  let logs="";
  child.stderr.on("data",c=>{logs=(logs+c.toString()).slice(-6000)});
  child.stdout.on("data",c=>{logs=(logs+c.toString()).slice(-6000)});
  const cleanup=async()=>{
    if(child.exitCode===null){child.kill("SIGTERM");await Promise.race([new Promise(r=>child.once("exit",r)),sleep(1000)])}
    if(child.exitCode===null)child.kill("SIGKILL");
    fs.rmSync(directory,{recursive:true,force:true});
  };
  for(let i=0;i<100;i++){
    if(child.exitCode!==null){await cleanup();throw Error("Falha ao iniciar servidor: "+logs)}
    try{const r=await fetch(base+"/api/auth/state");if(r.ok)return {base,dbPath,cleanup,logs:()=>logs}}catch{}
    await sleep(120);
  }
  await cleanup();throw Error("Servidor não abriu porta: "+logs);
}
function client(base,cookie=""){
  return async function(pathname,{method="GET",body=null}={}){
    const headers={};if(cookie)headers.cookie=cookie;
    const request={method,headers};
    if(body!==null){headers["content-type"]="application/json";request.body=JSON.stringify(body)}
    const response=await fetch(base+pathname,request);
    const type=response.headers.get("content-type")||"";
    const data=type.includes("application/json")?await response.json():await response.text();
    return {status:response.status,headers:response.headers,data};
  };
}

test("fuso do salão: 10:00 local equivale a 14:00Z e datas de relatório são locais",()=>{
  assert.equal(localTimeToUtc("2026-11-06","10:00"),"2026-11-06T14:00:00.000Z");
  assert.equal(localTimeToUtc("2026-11-06","00:00"),"2026-11-06T04:00:00.000Z");
  assert.equal(localStamp("2026-11-06T14:00:00.000Z"),"06/11/2026 10:00");
  assert.equal(localDateOf("2026-11-04T02:30:00.000Z"),"2026-11-03");
  assert.equal(localMinutesOf("2026-11-06T14:30:00.000Z"),630);
  assert.throws(()=>localTimeToUtc("2026-13-01","10:00"));
});

test("agenda bloqueia passado, folga, fora da jornada e conflito; relatório usa dia local",{timeout:80000},async()=>{
  const app=await start(),anon=client(app.base);
  try{
    const setup=await anon("/api/auth/setup",{method:"POST",body:{email:"qa-owner@example.invalid",name:"QA",password:"QA-senha-123456789"}});
    assert.equal(setup.status,201);
    const login=await anon("/api/auth/login",{method:"POST",body:{email:"qa-owner@example.invalid",password:"QA-senha-123456789"}});
    assert.equal(login.status,200);
    const cookie=login.headers.get("set-cookie")?.split(";")[0];
    const owner=client(app.base,cookie);
    const boot=(await owner("/api/bootstrap")).data;
    const service=boot.services[0],professional=boot.professionals[0];
    const customer=await owner("/api/clients",{method:"POST",body:{name:"Cliente R8",phone:"69999990010"}});
    assert.equal(customer.status,201);

    const base={client_id:customer.data.id,service_id:service.id,professional_id:professional.id};
    const at=iso=>owner("/api/appointments",{method:"POST",body:{...base,start_at:iso}});

    // Data relativa: nunca usar agendamento fixo que vire passado após a publicação.
    // Preferir quarta-feira (dia útil) para evitar false positives de domingo/folga.
    const future=new Date(Date.now()+14*86400000);
    const extraDays=(3-future.getUTCDay()+7)%7;
    future.setUTCDate(future.getUTCDate()+extraDays);
    const date=future.toISOString().slice(0,10);
    const offDate=new Date(Date.parse(date+"T12:00:00Z")+7*86400000).toISOString().slice(0,10);
    const local=(day,time)=>localTimeToUtc(day,time);
    const ok=await at(local(date,"10:00"));
    assert.equal(ok.status,201,JSON.stringify(ok.data));
    assert.equal(ok.data.start_at,local(date,"10:00"));

    assert.equal((await at("2026-10-01T14:00:00.000Z")).status,400);
    assert.equal((await at(local(date,"10:30"))).status,409);
    const early=await at(local(date,"08:00"));
    assert.equal(early.status,409);assert.equal(early.data.error,"professional_outside_schedule");
    assert.equal(early.data.window_start,"09:00");
    const late=await at(local(date,"19:00"));
    assert.equal(late.status,409);assert.equal(late.data.error,"professional_outside_schedule");

    const off=await owner("/api/staff/time-off",{method:"POST",body:{professional_id:professional.id,type:"day_off",start_date:offDate}});
    assert.equal(off.status,201,JSON.stringify(off.data));
    const blocked=await at(local(offDate,"10:00"));
    assert.equal(blocked.status,409);assert.equal(blocked.data.error,"professional_time_off");

    // Dia local começa às 04:00Z em Porto Velho; termina 03:59:59.999Z.
    const nextDate=new Date(Date.parse(date+"T12:00:00Z")+86400000).toISOString().slice(0,10);
    const report=await owner(`/api/reports/summary?from=${date}&to=${date}`);
    assert.equal(report.status,200);
    assert.equal(report.data.range.from,local(date,"00:00"));
    assert.equal(report.data.range.to,new Date(Date.parse(local(nextDate,"00:00"))-1).toISOString());

    // Profissional não exporta nem consulta financeiro.
    const invitation=await owner("/api/admin/invitations",{method:"POST",body:{email:"prof@example.invalid",name:"Prof QA",role:"professional"}});
    assert.equal(invitation.status,201,JSON.stringify(invitation.data));
    const accept=await anon("/api/auth/invitations/accept",{method:"POST",body:{token:invitation.data.token,password:"Prof-senha-123456"}});
    assert.equal(accept.status,201,JSON.stringify(accept.data));
    const profLogin=await anon("/api/auth/login",{method:"POST",body:{email:"prof@example.invalid",password:"Prof-senha-123456"}});
    assert.equal(profLogin.status,200);
    const prof=client(app.base,profLogin.headers.get("set-cookie")?.split(";")[0]);
    assert.equal((await prof("/api/finance/entries")).status,403);
    assert.equal((await prof("/api/reports/export?type=commissions")).status,403);
    assert.equal((await prof("/api/products")).status,403);
  }finally{await app.cleanup()}
});