import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {DatabaseSync} from "node:sqlite";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){
  const srv=net.createServer();
  await new Promise((ok,fail)=>srv.once("error",fail).listen(0,"127.0.0.1",ok));
  const port=srv.address().port;
  await new Promise(ok=>srv.close(ok));
  return port;
}
async function mockWaha(){
  const received=[];const sessions=new Map([["qa-only",{status:"WORKING"}],["qa-second",{status:"WORKING"}]]);
  const server=createServer(async(req,res)=>{
    let body="";for await(const c of req)body+=c.toString();
    const url=new URL(req.url,"http://127.0.0.1");
    const respond=(status,j)=>{res.writeHead(status,{"content-type":"application/json"});res.end(JSON.stringify(j))};
    if(req.headers["x-api-key"]!=="qa-waha-key")return respond(401,{error:"unauthorized_mock"});
    if(req.method==="GET"&&url.pathname.startsWith("/api/sessions/")){
      const name=decodeURIComponent(url.pathname.slice("/api/sessions/".length));
      return sessions.has(name)?respond(200,{name,...sessions.get(name)}):respond(404,{error:"missing"});
    }
    if(req.method==="POST"&&url.pathname==="/api/sendText"){
      const request=JSON.parse(body||"{}");received.push(request);
      return respond(200,{id:"sent-qa-"+received.length});
    }
    if(req.method==="POST"&&url.pathname==="/api/sessions"){
      const p=JSON.parse(body||"{}");sessions.set(p.name,{status:"WORKING",config:p.config});return respond(201,{name:p.name,status:"WORKING"});
    }
    if(req.method==="PUT"&&url.pathname.startsWith("/api/sessions/")){
      const p=JSON.parse(body||"{}");sessions.set(p.name,{status:"WORKING",config:p.config});return respond(200,{name:p.name,status:"WORKING"});
    }
    return respond(404,{error:"mock_not_implemented",path:url.pathname});
  });
  await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
  return {server,received,base:"http://127.0.0.1:"+server.address().port};
}
async function environment(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ne-waha-qa-")),dbPath=path.join(dir,"qa.sqlite"),port=await freePort();
  const waha=await mockWaha(),secret="qa-hmac-secret-not-production";
  const child=spawn(process.execPath,["server.mjs"],{cwd:root,env:{
    ...process.env,PORT:String(port),HOST:"127.0.0.1",SALON_DB:dbPath,
    JEV_CONTROL_PLANE_URL:"http://127.0.0.1:1",
    NOVAGENTE_ENABLE_RECEPTIONIST_AI:"false",
    WAHA_BASE_URL:waha.base,WAHA_API_KEY:"qa-waha-key",WAHA_SESSION:"qa-only",
    WAHA_WEBHOOK_HMAC_SECRET:secret,WAHA_WEBHOOK_URL:"http://127.0.0.1:"+port+"/api/whatsapp/waha/webhook"
  },stdio:["ignore","pipe","pipe"]});
  let logs="";for(const stream of [child.stdout,child.stderr])stream.on("data",c=>{logs=(logs+c.toString()).slice(-6500)});
  const base="http://127.0.0.1:"+port;
  async function api(pathname,{method="GET",body=null,cookie="",headers={}}={}){
    const h={...headers};if(cookie)h.cookie=cookie;
    let value;
    if(body!==null){h["content-type"]="application/json";value=JSON.stringify(body)}
    const response=await fetch(base+pathname,{method,headers:h,body:value});
    const json=await response.json().catch(()=>({}));
    return {status:response.status,data:json,cookie:response.headers.get("set-cookie")?.split(";")[0]};
  }
  async function webhook(event,{sign=true,algorithm="sha512"}={}){
    const raw=JSON.stringify(event);
    const signature=crypto.createHmac("sha512",secret).update(raw).digest("hex");
    const headers={"content-type":"application/json","x-webhook-hmac-algorithm":algorithm};
    if(sign)headers["x-webhook-hmac"]=signature;
    const r=await fetch(base+"/api/whatsapp/waha/webhook",{method:"POST",headers,body:raw});
    return {status:r.status,data:await r.json()};
  }
  let ready=false;
  for(let n=0;n<100;n++){
    if(child.exitCode!==null)break;
    try{const r=await api("/api/auth/state");if(r.status===200){ready=true;break}}catch{}
    await sleep(100);
  }
  async function close(){
    if(child.exitCode===null){
      child.kill("SIGTERM");
      await Promise.race([new Promise(r=>child.once("exit",r)),sleep(800)]);
    }
    if(child.exitCode===null)child.kill("SIGKILL");
    await new Promise(r=>waha.server.close(r));
    fs.rmSync(dir,{recursive:true,force:true});
  }
  if(!ready){await close();throw Error("server_not_ready "+logs)}
  return {api,webhook,close,dbPath,waha,logs:()=>logs};
}
const expect=async(req,path,status,opts={})=>{
  const out=await req(path,opts);
  assert.equal(out.status,status,path+" "+JSON.stringify(out.data).slice(0,600));
  return out.data;
};
test("WAHA simulado: HMAC, mensagem, cliente CRM, conversa, agenda, resposta, ACK, privacidade e deduplicação",{timeout:70000},async()=>{
  const app=await environment();
  try{
    await expect(app.api,"/api/auth/setup",201,{method:"POST",body:{
      email:"owner@qa.example",name:"Proprietária QA",password:"senha-qa-somente-teste-123"
    }});
    const login=await app.api("/api/auth/login",{method:"POST",body:{
      email:"owner@qa.example",password:"senha-qa-somente-teste-123"
    }});
    assert.equal(login.status,200);
    const owner=(p,o={})=>app.api(p,{...o,cookie:login.cookie});
    const boot=await expect(owner,"/api/bootstrap",200);
    const status=await expect(owner,"/api/whatsapp/status",200);
    assert.equal(status.session,"qa-only");
    assert.equal(status.connected,true);
    assert.equal(status.ai_enabled,false);
    const text={event:"message",session:"qa-only",payload:{
      id:"qa-received-001",from:"556999988776@c.us",fromMe:false,body:"Olá, quanto custa uma coloração?",pushName:"Cliente Piloto",hasMedia:false
    }};
    assert.equal((await app.webhook(text,{sign:false})).status,401);
    assert.equal((await app.webhook(text,{algorithm:"sha256"})).status,401);
    const unknown=await app.webhook({...text,session:"unassigned"});
    assert.equal(unknown.status,200);
    assert.equal(unknown.data.accepted,false);
    const incoming=await app.webhook(text);
    assert.equal(incoming.status,200,JSON.stringify(incoming.data));
    assert.equal(incoming.data.type,"message");
    assert.equal(incoming.data.automaticReply,false);
    assert.ok(incoming.data.clientId);
    assert.ok(incoming.data.conversationId);
    assert.equal(app.waha.received.length,0,"modo humano não responde automaticamente");
    const duplicate=await app.webhook(text);
    assert.equal(duplicate.status,200);
    assert.equal(duplicate.data.type,"duplicate");
    const clients=await expect(owner,"/api/clients",200);
    const client=clients.find(x=>x.id===incoming.data.clientId);
    assert.equal(client.name,"Cliente Piloto");
    assert.equal(client.phone,"556999988776");
    const conversations=await expect(owner,"/api/conversations",200);
    const co=conversations.find(x=>x.id===incoming.data.conversationId);
    assert.ok(co);
    assert.equal(co.unread_count,1);
    assert.equal(co.handling_mode,"human");
    assert.equal(co.last_message,"Olá, quanto custa uma coloração?");
    const msgs=await expect(owner,"/api/conversations/"+co.id+"/messages",200);
    assert.equal(msgs.length,1);
    assert.equal(msgs[0].direction,"in");
    assert.equal((await expect(owner,"/api/conversations",200)).find(x=>x.id===co.id).unread_count,0);
    const wrongAssignee=await owner("/api/conversations/"+co.id+"/meta",{method:"PATCH",body:{assigned_user_id:"unknown"}});
    assert.equal(wrongAssignee.status,400);
    const ownerId=boot.user.id;
    await expect(owner,"/api/conversations/"+co.id+"/meta",200,{method:"PATCH",body:{
      status:"open",category:"appointment",priority:"high",assigned_user_id:ownerId,labels:["Solicitou cor"]
    }});
    const startAt=new Date(Date.now()+16*86400000).toISOString();
    const appt=await expect(owner,"/api/appointments",201,{method:"POST",body:{
      client_id:client.id,professional_id:boot.professionals[0].id,
      service_id:boot.services[0].id,start_at:startAt,source:"whatsapp"
    }});
    const context=await expect(owner,"/api/conversations/"+co.id+"/client-context",200);
    assert.equal(context.client.id,client.id);
    assert.ok(context.appointments.some(a=>a.id===appt.id));
    const response=await expect(owner,"/api/conversations/"+co.id+"/messages",201,{method:"POST",body:{
      text:"Olá! Já reservei um horário para você."
    }});
    assert.equal(response.externalMessageId,"sent-qa-1");
    assert.equal(app.waha.received.length,1);
    assert.equal(app.waha.received[0].session,"qa-only");
    assert.equal(app.waha.received[0].chatId,"556999988776@c.us");
    const ack=await app.webhook({event:"message.ack",session:"qa-only",
      payload:{id:"sent-qa-1",ackName:"READ"}});
    assert.equal(ack.status,200);
    const messages=await expect(owner,"/api/conversations/"+co.id+"/messages",200);
    assert.equal(messages.length,2);
    assert.equal(messages[1].delivery_status,"read");
    // Webhook de áudio ou imagem: não entrega resposta automática e exige humano.
    const media=await app.webhook({event:"message",session:"qa-only",payload:{
      id:"qa-received-media-001",from:"556999988776@c.us",
      fromMe:false,hasMedia:true,body:"",pushName:"Cliente Piloto"
    }});
    assert.equal(media.status,200);
    assert.equal(media.data.automaticReply,false);
    assert.equal(app.waha.received.length,1);
    // Nova empresa usa nova sessão e não pode misturar dados: webhook mapeia o tenant da sessão.
    const db=new DatabaseSync(app.dbPath);
    try{
      const t="qa-other-tenant";
      db.prepare("insert into tenants(id,name,slug,timezone,created_at) values(?,?,?,?,?)")
        .run(t,"Outro salão","outro-salao","America/Porto_Velho",new Date().toISOString());
      db.prepare("insert into whatsapp_tenant_sessions(tenant_id,session,active,created_at,updated_at) values(?,?,1,?,?)")
        .run(t,"qa-second",new Date().toISOString(),new Date().toISOString());
      const distinct=await app.webhook({event:"message",session:"qa-second",payload:{
        id:"qa-other-tenant-message",from:"556999988776@c.us",fromMe:false,body:"Salão B",pushName:"Outra Cliente"
      }});
      assert.equal(distinct.status,200);
      assert.equal(distinct.data.type,"message");
      assert.notEqual(distinct.data.clientId,incoming.data.clientId);
      assert.equal(db.prepare("select tenant_id from clients where id=?").get(distinct.data.clientId).tenant_id,t);
      assert.equal(db.prepare("select count(*) n from clients where tenant_id=? and phone=?").get(boot.tenant.id,"556999988776").n,1);
      assert.equal(db.prepare("select count(*) n from messages where tenant_id=?").get(t).n,1);
      const spoof=await owner("/api/conversations",{headers:{"x-tenant-id":t}});
      assert.equal(spoof.status,200);
      assert.ok(spoof.data.every(c=>c.tenant_id===boot.tenant.id));
    }finally{db.close()}
  }catch(error){error.message+="\nServidor:\n"+app.logs().slice(-1800);throw error}
  finally{await app.close()}
});
