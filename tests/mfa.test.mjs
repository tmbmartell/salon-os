import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {totpAt,base32Encode,verifyTotp} from "../mfa.mjs";
import {DatabaseSync} from "node:sqlite";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){
  const s=createServer();await new Promise((ok,bad)=>s.once("error",bad).listen(0,"127.0.0.1",ok));
  const p=s.address().port;await new Promise(ok=>s.close(ok));return p;
}
async function start(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ne-mfa-")),p=await port(),base="http://127.0.0.1:"+p;
  const key=crypto.createHash("sha256").update("test-only-encryption-key-not-for-production").digest("base64");
  const child=spawn(process.execPath,["server.mjs"],{cwd:root,env:{...process.env,
    HOST:"127.0.0.1",PORT:String(p),SALON_DB:path.join(dir,"qa.sqlite"),
    NOVAGENTE_MFA_KEY:key,WAHA_API_KEY:"",WAHA_BASE_URL:"",
    JEV_CONTROL_PLANE_URL:"http://127.0.0.1:1"},stdio:["ignore","pipe","pipe"]});
  let logs="";for(const stream of [child.stdout,child.stderr])stream.on("data",b=>{logs=(logs+b.toString()).slice(-4000)});
  async function call(route,{method="GET",body,cookie}={}){
    const headers={};if(cookie)headers.cookie=cookie;
    const init={method,headers};
    if(body!==undefined){headers["content-type"]="application/json";init.body=JSON.stringify(body)}
    const r=await fetch(base+route,init);
    return {status:r.status,data:await r.json().catch(()=>({})),
      cookie:r.headers.get("set-cookie")?.split(";")[0]};
  }
  async function close(){
    if(child.exitCode===null){child.kill("SIGTERM");await Promise.race([new Promise(r=>child.once("exit",r)),sleep(900)])}
    if(child.exitCode===null)child.kill("SIGKILL");
    fs.rmSync(dir,{recursive:true,force:true});
  }
  for(let i=0;i<90;i++){
    if(child.exitCode!==null)break;
    try{if((await call("/api/auth/state")).status===200)return {call,close,dbPath:path.join(dir,"qa.sqlite")}}catch{}
    await sleep(110);
  }
  await close();throw Error("Servidor MFA não iniciou: "+logs);
}
test("TOTP segue código RFC com valor de 6 dígitos, tolerância e bloqueio de reuso",()=>{
  const secret=base32Encode(crypto.randomBytes(20));
  const time=1782579600000;
  const value=totpAt(secret,time);
  assert.match(value,/^\d{6}$/);
  const counter=Math.floor(time/30000);
  assert.equal(verifyTotp(secret,value,{time}),counter);
  assert.equal(verifyTotp(secret,value,{time,lastCounter:counter}),null);
  assert.equal(verifyTotp(secret,"123foo",{time}),null);
});
test("HTTP MFA: configuração cifrada, segundo fator antes do cookie, recuperação única e desativação",
  {timeout:65000},async()=>{
  const app=await start();
  try{
    const send=app.call;
    const pass="qa-mfa-password-12345678";
    const setup=await send("/api/auth/setup",{method:"POST",body:{
      name:"Gestora MFA",email:"gestora-mfa@example.invalid",password:pass
    }});
    assert.equal(setup.status,201);
    const login=()=>send("/api/auth/login",{method:"POST",body:{
      email:"gestora-mfa@example.invalid",password:pass
    }});
    const first=await login();assert.equal(first.status,200);assert.ok(first.cookie);
    const owner=(route,opts={})=>send(route,{...opts,cookie:first.cookie});
    const status=await owner("/api/auth/mfa/status");
    assert.equal(status.status,200);assert.equal(status.data.enabled,false);assert.equal(status.data.configured,true);
    const notPermitted=await owner("/api/auth/mfa/enroll",{method:"POST",body:{password:"errada"}});
    assert.equal(notPermitted.status,403);
    const enrolled=await owner("/api/auth/mfa/enroll",{method:"POST",body:{password:pass}});
    assert.equal(enrolled.status,200);
    assert.match(enrolled.data.secret,/^[A-Z2-7]{32}$/);
    assert.match(enrolled.data.otpauth_url,/^otpauth:\/\/totp\//);
    const db=new DatabaseSync(app.dbPath,{readOnly:true});
    try{
      const row=db.prepare("select encrypted_secret from user_mfa").get();
      assert.match(row.encrypted_secret,/^v1:/);
      assert.equal(row.encrypted_secret.includes(enrolled.data.secret),false);
    }finally{db.close()}
    const invalid=await owner("/api/auth/mfa/confirm",{method:"POST",body:{code:"000"}});
    assert.equal(invalid.status,401);
    const correct=totpAt(enrolled.data.secret);
    const confirmed=await owner("/api/auth/mfa/confirm",{method:"POST",body:{code:correct}});
    assert.equal(confirmed.status,200);
    assert.equal(confirmed.data.recovery_codes.length,8);
    assert.equal(new Set(confirmed.data.recovery_codes).size,8);
    assert.equal((await owner("/api/auth/mfa/status")).data.recovery_remaining,8);
    const challenge=await login();assert.equal(challenge.status,202);
    assert.equal(challenge.cookie,undefined,"não emitir sessão antes de validar código");
    assert.equal(challenge.data.mfa_required,true);
    assert.equal((await send("/api/auth/me")).status,401);
    const wrong=await send("/api/auth/mfa/verify",{method:"POST",body:{
      challenge:challenge.data.challenge,code:"000000"
    }});
    assert.equal(wrong.status,401);
    const recovery=confirmed.data.recovery_codes;
    const verify=await send("/api/auth/mfa/verify",{method:"POST",body:{
      challenge:challenge.data.challenge,code:recovery[0]
    }});
    assert.equal(verify.status,200);assert.ok(verify.cookie);
    assert.equal((await send("/api/auth/me",{cookie:verify.cookie})).status,200);
    assert.equal((await send("/api/auth/mfa/verify",{method:"POST",body:{
      challenge:challenge.data.challenge,code:recovery[0]
    }})).status,401,"challenge só pode ser consumido uma vez");
    const second=await login();assert.equal(second.status,202);
    assert.equal((await send("/api/auth/mfa/verify",{method:"POST",body:{
      challenge:second.data.challenge,code:recovery[0]
    }})).status,401,"código de recuperação não pode ser reutilizado");
    assert.equal((await send("/api/auth/mfa/verify",{method:"POST",body:{
      challenge:second.data.challenge,code:recovery[1]
    }})).status,200);
    const statusAfter=await send("/api/auth/mfa/status",{cookie:verify.cookie});
    assert.equal(statusAfter.data.recovery_remaining,6);
    const disabled=await send("/api/auth/mfa/disable",{method:"POST",cookie:verify.cookie,
      body:{password:pass,code:recovery[2]}});
    assert.equal(disabled.status,200);
    assert.equal((await send("/api/auth/mfa/status",{cookie:verify.cookie})).data.enabled,false);
    assert.equal((await login()).status,200);
    // Mesmo solicitando um novo desafio, erros do MFA somam no bloqueio da conta.
    const secondEnroll=await owner("/api/auth/mfa/enroll",{method:"POST",body:{password:pass}});
    assert.equal(secondEnroll.status,200);
    assert.equal((await owner("/api/auth/mfa/confirm",{method:"POST",body:{
      code:totpAt(secondEnroll.data.secret)
    }})).status,200);
    const challengeA=await login();assert.equal(challengeA.status,202);
    for(let i=0;i<5;i++){
      const bad=await send("/api/auth/mfa/verify",{method:"POST",body:{
        challenge:challengeA.data.challenge,code:"INVALID"
      }});
      assert.equal(bad.status,i===4?429:401);
    }
    const challengeB=await login();assert.equal(challengeB.status,202);
    for(let i=0;i<3;i++){
      const bad=await send("/api/auth/mfa/verify",{method:"POST",body:{
        challenge:challengeB.data.challenge,code:"INVALID"
      }});
      assert.equal(bad.status,i===2?429:401);
    }
    assert.equal((await login()).status,429,"novos desafios não anulam bloqueio de conta");
    assert.equal((await send("/api/auth/mfa/confirm",{method:"POST",cookie:verify.cookie,body:{code:correct}})).status,409);
  }finally{await app.close()}
});
