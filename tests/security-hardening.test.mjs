import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";
import {installAuth,handleAuthApi} from "../auth.mjs";
import {browserMutationAllowed,requestIp,requestIsSecure} from "../request-security.mjs";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function unusedPort(){
  const s=createServer();
  await new Promise((ok,err)=>s.once("error",err).listen(0,"127.0.0.1",ok));
  const p=s.address().port;await new Promise(r=>s.close(r));return p;
}
async function app(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"ne-sec-")),p=await unusedPort();
  const base="http://127.0.0.1:"+p,child=spawn(process.execPath,["server.mjs"],{
    cwd:root,env:{...process.env,PORT:String(p),HOST:"127.0.0.1",SALON_DB:path.join(temp,"security.sqlite"),
      WAHA_BASE_URL:"",WAHA_API_KEY:"",JEV_CONTROL_PLANE_URL:"http://127.0.0.1:1"},
    stdio:["ignore","pipe","pipe"]
  });let log="";
  for(const stream of [child.stdout,child.stderr])stream.on("data",c=>{log=(log+c.toString()).slice(-4000)});
  const close=async()=>{
    if(child.exitCode===null){
      child.kill("SIGTERM");
      await Promise.race([new Promise(r=>child.once("exit",r)),sleep(900)]);
    }
    if(child.exitCode===null)child.kill("SIGKILL");
    fs.rmSync(temp,{recursive:true,force:true});
  };
  async function request(url,{method="GET",body,cookie,headers={}}={}){
    const h={...headers};if(cookie)h.cookie=cookie;
    const init={method,headers:h};
    if(body!==undefined){init.body=typeof body==="string"?body:JSON.stringify(body);
      if(!h["content-type"])h["content-type"]="application/json"}
    const res=await fetch(base+url,init);
    return {status:res.status,data:await res.json().catch(()=>({})),cookie:res.headers.get("set-cookie")?.split(";")[0],
      retry:res.headers.get("retry-after")};
  }
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)break;
    try{if((await request("/api/auth/state")).status===200)return {request,close,base}}catch{}
    await sleep(110);
  }
  await close();throw Error("Servidor falhou: "+log);
}
test("HTTP: bloqueia formulários cross-site, JSON de origem externa, spoof IP, login repetido e escalada de cargo",
  {timeout:65000},async()=>{
  const h=await app();
  try{
    const call=h.request;
    const setup=await call("/api/auth/setup",{method:"POST",body:{
      name:"Proprietária de Teste",email:"owner-security@example.invalid",password:"segredo-local-123456789"
    }});
    assert.equal(setup.status,201);
    const badOrigin=await call("/api/auth/login",{method:"POST",
      headers:{origin:"https://site-malicioso.example"},
      body:{email:"owner-security@example.invalid",password:"segredo-local-123456789"}});
    assert.equal(badOrigin.status,403);
    const badFetchSite=await call("/api/auth/login",{method:"POST",
      headers:{"sec-fetch-site":"same-site"},
      body:{email:"owner-security@example.invalid",password:"segredo-local-123456789"}});
    assert.equal(badFetchSite.status,403);
    const form=await call("/api/auth/login",{method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded"},body:"email=x&password=y"});
    assert.equal(form.status,403);
    const correctOrigin=await call("/api/auth/login",{method:"POST",headers:{origin:h.base},
      body:{email:"owner-security@example.invalid",password:"segredo-local-123456789"}});
    assert.equal(correctOrigin.status,200);
    const ownCookie=correctOrigin.cookie;assert.ok(ownCookie?.startsWith("salon_session="));
    const owner=(url,options={})=>call(url,{...options,cookie:ownCookie});
    const invite=await owner("/api/admin/invitations",{method:"POST",body:{
      name:"Gerência QA",email:"manager-security@example.invalid",role:"manager"
    }});
    assert.equal(invite.status,201);
    const accept=await call("/api/auth/invitations/accept",{method:"POST",body:{
      token:invite.data.token,password:"senha-gerente-security-123456"
    }});
    assert.equal(accept.status,201);
    const loginManager=await call("/api/auth/login",{method:"POST",body:{
      email:"manager-security@example.invalid",password:"senha-gerente-security-123456"
    }});
    assert.equal(loginManager.status,200);
    const manager=(url,options={})=>call(url,{...options,cookie:loginManager.cookie});
    const profiles=await owner("/api/admin/users");
    const person=profiles.data.find(u=>u.email==="manager-security@example.invalid");
    assert.ok(person);
    const elevate=await manager("/api/admin/users/"+person.id+"/role",{method:"PATCH",body:{role:"owner"}});
    assert.equal(elevate.status,403);
    const ownRole=await owner("/api/admin/users/"+person.id+"/role",{method:"PATCH",body:{role:"reception"}});
    assert.equal(ownRole.status,200);
    assert.equal((await manager("/api/auth/me")).status,401,"sessão anterior não permanece ativa");
    const relog=await call("/api/auth/login",{method:"POST",body:{
      email:"manager-security@example.invalid",password:"senha-gerente-security-123456"
    }});
    assert.equal(relog.status,200);
    const downgraded=(url,options={})=>call(url,{...options,cookie:relog.cookie});
    assert.equal((await downgraded("/api/owner-eye/summary")).status,403);
    assert.equal((await downgraded("/api/admin/users")).status,403);
    const deniedForm=await owner("/api/admin/business-profile",{method:"PUT",
      body:'{"name":"Alterado"}',headers:{"content-type":"text/plain"}});
    assert.equal(deniedForm.status,403);
    const stillOwner=await owner("/api/auth/me");
    assert.equal(stillOwner.status,200);
    // Teste login persistente por e-mail, independente de x-forwarded-for.
    for(let i=0;i<7;i++){
      const bad=await call("/api/auth/login",{method:"POST",
        headers:{"x-forwarded-for":"8.8.8."+(i+1)},
        body:{email:"manager-security@example.invalid",password:"incorrect-"+i}});
      assert.equal(bad.status,401);
    }
    const lock=await call("/api/auth/login",{method:"POST",body:{
      email:"manager-security@example.invalid",password:"incorreta-8"}});
    assert.equal(lock.status,429);
    assert.equal(lock.retry,"900");
    const correctButLocked=await call("/api/auth/login",{method:"POST",body:{
      email:"manager-security@example.invalid",password:"senha-gerente-security-123456"}});
    assert.equal(correctButLocked.status,429);
  }finally{await h.close()}
});
test("Origem confiável e cabeçalho de proxy não são controlados por cliente externo",()=>{
  const req={method:"POST",headers:{
    host:"salon.example",origin:"https://salon.example", "content-type":"application/json",
    "x-forwarded-for":"8.8.8.8","x-forwarded-proto":"https"
  },socket:{remoteAddress:"198.51.100.8"}};
  assert.equal(requestIp(req),"198.51.100.8");
  assert.equal(requestIsSecure(req),false);
  assert.equal(browserMutationAllowed(req,new URL("/api/finance/entries","https://salon.example")),false);
  assert.equal(browserMutationAllowed({...req,headers:{...req.headers,origin:"http://salon.example"}},
    new URL("/api/finance/entries","http://salon.example")),true);
});
test("Produção exige token inicial configurado e rejeita tokens errados",async()=>{
  const db=new DatabaseSync(":memory:");
  const previousNode=process.env.NODE_ENV,previousToken=process.env.NOVAGENTE_SETUP_TOKEN;
  try{
    db.exec("CREATE TABLE tenants(id text primary key,name text,slug text); CREATE TABLE users(id text primary key,tenant_id text,name text,email text,role text,active integer,created_at text)");
    db.prepare("insert into tenants values(?,?,?)").run("qa","Salão QA","qa");
    db.prepare("insert into users values(?,?,?,?,?,?,?)").run("owner","qa","Dona","dona@qa.invalid","owner",1,new Date().toISOString());
    installAuth(db);
    process.env.NODE_ENV="production";
    delete process.env.NOVAGENTE_SETUP_TOKEN;
    const submit=async token=>{
      const result=await handleAuthApi({db,req:{method:"POST",headers:token?{"x-novagente-setup-token":token}:{}},res:{},
        url:new URL("/api/auth/setup","http://localhost"),defaultTenant:"qa",
        send:(_res,status,data)=>({status,data}),parseBody:async()=>({
          name:"Dona",email:"dona@qa.invalid",password:"senha-forte-para-piloto"
        })});
      return result.result;
    };
    assert.equal((await submit()).status,503);
    const secret="qa-secret-integration-token-very-long";
    process.env.NOVAGENTE_SETUP_TOKEN=secret;
    assert.equal((await submit("token-errado")).status,503);
    assert.equal((await submit(secret)).status,201);
    assert.equal((await submit(secret)).status,409);
  }finally{
    if(previousNode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNode;
    if(previousToken===undefined)delete process.env.NOVAGENTE_SETUP_TOKEN;else process.env.NOVAGENTE_SETUP_TOKEN=previousToken;
    db.close();
  }
});
