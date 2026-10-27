import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {verifyFreePreviewEnvironment} from "../free-preview.mjs";
import {fileURLToPath} from "node:url";

const cwd=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
  const server=net.createServer();
  await new Promise((ok,reject)=>server.once("error",reject).listen(0,"127.0.0.1",ok));
  const number=server.address().port;
  await new Promise(ok=>server.close(ok));
  return number;
}
const sampleEnv={
  NODE_ENV:"production",NOVAGENTE_FREE_PREVIEW:"yes",NOVAGENTE_FREE_PREVIEW_ACTIVE:"true",
  SALON_DB:path.join(os.tmpdir(),"novagente-free-preview-fixture","salon.sqlite"),
  NOVAGENTE_DEMO_OWNER_EMAIL:"demo-test@example.invalid",
  NOVAGENTE_DEMO_OWNER_PASSWORD:"Test-Demo-Senha-Forte-123456"
};
test("demonstração só usa banco temporário e não aceita provedor ou credenciais inexistentes",()=>{
  assert.equal(verifyFreePreviewEnvironment(sampleEnv).email,"demo-test@example.invalid");
  assert.throws(()=>verifyFreePreviewEnvironment({...sampleEnv,SALON_DB:"/srv/clientes-reais/salon.sqlite"}),/disposable_database/);
  assert.throws(()=>verifyFreePreviewEnvironment({...sampleEnv,NODE_ENV:"development"}),/explicit_production_isolation/);
  assert.throws(()=>verifyFreePreviewEnvironment({...sampleEnv,WAHA_API_KEY:"chave-real"}),/external_integration_forbidden/);
  assert.throws(()=>verifyFreePreviewEnvironment({...sampleEnv,NOVAGENTE_ENABLE_RECEPTIONIST_AI:"true"}),/ai_must_remain_disabled/);
  assert.throws(()=>verifyFreePreviewEnvironment({...sampleEnv,NOVAGENTE_DEMO_OWNER_PASSWORD:"curta"}),/credentials_missing/);
});
test("preview gratuita cria conta fictícia automaticamente, exige login e reinicia base descartável",
  {timeout:90000},async()=>{
  const port=await freePort(),base="http://127.0.0.1:"+port,processes=[];
  const vars={...process.env,PORT:String(port),HOST:"127.0.0.1",NODE_ENV:"production",
    NOVAGENTE_FREE_PREVIEW:"yes",NOVAGENTE_DEMO_OWNER_EMAIL:sampleEnv.NOVAGENTE_DEMO_OWNER_EMAIL,
    NOVAGENTE_DEMO_OWNER_PASSWORD:sampleEnv.NOVAGENTE_DEMO_OWNER_PASSWORD,
    WAHA_API_KEY:"",WAHA_BASE_URL:"",WAHA_WEBHOOK_HMAC_SECRET:"",
    JEV_CONTROL_PLANE_URL:"",OPENAI_API_KEY:"",ANTHROPIC_API_KEY:"",DATABASE_URL:"",
    NOVAGENTE_ENABLE_RECEPTIONIST_AI:"false"};
  delete vars.SALON_DB;
  let log="";
  async function request(route,{method="GET",body,cookie}={}){
    const headers={};if(cookie)headers.cookie=cookie;
    const opts={method,headers};
    if(body!==undefined){headers["content-type"]="application/json";opts.body=JSON.stringify(body)}
    const r=await fetch(base+route,opts);
    const ct=r.headers.get("content-type")||"";
    return {status:r.status,data:ct.includes("json")?await r.json():await r.text(),
      cookie:r.headers.get("set-cookie")?.split(";")[0]};
  }
  async function start(){
    const child=spawn(process.execPath,["scripts/start-free-preview.mjs"],{
      cwd,env:vars,stdio:["ignore","pipe","pipe"]
    });
    processes.push(child);for(const output of [child.stdout,child.stderr])output.on("data",b=>{log=(log+b.toString()).slice(-6500)});
    for(let i=0;i<150;i++){
      if(child.exitCode!==null)break;
      try{if((await request("/api/health")).status===200)return child}catch{}
      await sleep(110);
    }
    throw Error("Serviço demo não iniciou: "+log);
  }
  async function stop(child){
    if(child.exitCode!==null)return;
    child.kill("SIGTERM");
    await Promise.race([new Promise(resolve=>child.once("exit",resolve)),sleep(1200)]);
    if(child.exitCode===null)child.kill("SIGKILL");
    await sleep(200);
  }
  try{
    const first=await start();
    const health=await request("/api/health");
    assert.equal(health.data.disposable_demo,true);
    assert.equal(health.data.mode,"free_preview_disposable");
    const state=await request("/api/auth/state");
    assert.equal(state.status,200);
    assert.equal(state.data.claimed,true);
    const setup=await request("/api/auth/setup",{method:"POST",body:{
      email:"attacker@example.invalid",name:"Attacker",password:"bad-password-long-enough"
    }});
    assert.equal(setup.status,503,"não permitir assumir conta pública inicial");
    const login=await request("/api/auth/login",{method:"POST",body:{
      email:sampleEnv.NOVAGENTE_DEMO_OWNER_EMAIL,password:sampleEnv.NOVAGENTE_DEMO_OWNER_PASSWORD
    }});
    assert.equal(login.status,200,JSON.stringify(login.data));
    const boot=await request("/api/bootstrap",{cookie:login.cookie});
    assert.equal(boot.status,200);
    assert.equal(boot.data.user.role,"owner");
    assert.equal(boot.data.whatsapp.connected,false);
    const html=await request("/");
    assert.equal(html.status,200);
    assert.ok(html.data.includes("freePreviewNotice"));
    const initial=await request("/api/clients",{cookie:login.cookie});
    const created=await request("/api/clients",{method:"POST",cookie:login.cookie,
      body:{name:"CLIENTE DESCARTÁVEL DE QA",phone:"69977770001"}});
    assert.equal(created.status,201);
    assert.equal((await request("/api/clients",{cookie:login.cookie})).data.length,initial.data.length+1);
    await stop(first);
    await start();
    const loginAgain=await request("/api/auth/login",{method:"POST",body:{
      email:sampleEnv.NOVAGENTE_DEMO_OWNER_EMAIL,password:sampleEnv.NOVAGENTE_DEMO_OWNER_PASSWORD
    }});
    assert.equal(loginAgain.status,200);
    const after=await request("/api/clients",{cookie:loginAgain.cookie});
    assert.equal(after.status,200);
    assert.equal(after.data.some(x=>x.name==="CLIENTE DESCARTÁVEL DE QA"),false,
      "novo processo não reaproveita base da execução anterior");
  }catch(error){error.message+="\nLogs demo:\n"+log;throw error}
  finally{for(const process of processes)await stop(process)}
});
