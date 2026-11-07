import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function freePort(){
 const server=createServer();await new Promise((ok,no)=>server.once('error',no).listen(0,'127.0.0.1',ok));
 const port=server.address().port;await new Promise(ok=>server.close(ok));return port;
}
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('diagnóstico de WhatsApp é privado, mostra contadores e não divulga conteúdo', {timeout:45000},async()=>{
 const dir=mkdtempSync(path.join(os.tmpdir(),'ne-whatsapp-monitor-')),port=await freePort();
 const origin='http://127.0.0.1:'+port,app=spawn(process.execPath,['server.mjs'],{cwd:path.resolve('.'),env:{
  ...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),SALON_DB:path.join(dir,'test.sqlite'),
  WAHA_BASE_URL:'',WAHA_API_KEY:'',WAHA_SESSION:'qa-sandbox',WAHA_WEBHOOK_URL:'',WAHA_WEBHOOK_HMAC_SECRET:'',
  NOVAGENTE_ENABLE_RECEPTIONIST_AI:'false',NOVAGENTE_ENABLE_WHATSAPP_AI:'false',
  JEV_CONTROL_PLANE_URL:'http://127.0.0.1:1',NOVAGENTE_PLATFORM_ADMIN_USERS:''
 },stdio:'ignore'});
 try{
  let ready=false;
  for(let i=0;i<90;i++){try{const r=await fetch(origin+'/api/health');if(r.ok){ready=true;break}}catch{}await pause(120)}
  assert.ok(ready,'sandbox unavailable');
  async function api(route,{method='GET',body,cookie}={}){
    const headers={};if(body!==undefined)headers['Content-Type']='application/json';if(cookie)headers.Cookie=cookie;
    const r=await fetch(origin+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
    return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
  }
  assert.equal((await api('/api/whatsapp/diagnostics')).status,401);
  const setup=await api('/api/auth/setup',{method:'POST',body:{name:'Proprietária QA',email:'qa-owner@example.invalid',password:'SenhaForteSomenteQA2026!'}});
  assert.equal(setup.status,201);
  const login=await api('/api/auth/login',{method:'POST',body:{email:'qa-owner@example.invalid',password:'SenhaForteSomenteQA2026!'}});
  assert.equal(login.status,200);
  const diag=await api('/api/whatsapp/diagnostics',{cookie:login.cookie});
  assert.equal(diag.status,200,JSON.stringify(diag.data));
  assert.equal(diag.data.session_connected,false);
  assert.equal(diag.data.webhook.official,false);
  assert.equal(typeof diag.data.inbound.past_24h,'number');
  assert.equal(typeof diag.data.outbound.total,'number');
  assert.equal(diag.data.professional_notices.external_delivery_enabled,false);
  assert.equal('messages' in diag.data,false);
  assert.equal('phone' in diag.data,false);
  assert.equal('secret' in diag.data,false);
  assert.ok(Array.isArray(diag.data.outbound.delivery_statuses));
  const invite=await api('/api/admin/invitations',{method:'POST',cookie:login.cookie,body:{name:'Recepção QA',email:'qa-recepcao@example.invalid',role:'reception'}});
  assert.equal(invite.status,201);
  const accepted=await api('/api/auth/invitations/accept',{method:'POST',body:{token:invite.data.token,passwordless:true}});
  assert.equal(accepted.status,201);
  assert.equal((await api('/api/whatsapp/diagnostics',{cookie:accepted.cookie})).status,403);
 }finally{if(app.exitCode===null)app.kill('SIGTERM');await pause(250);if(app.exitCode===null)app.kill('SIGKILL');rmSync(dir,{recursive:true,force:true})}
});
