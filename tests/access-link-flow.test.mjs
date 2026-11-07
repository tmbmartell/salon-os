import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
const wait=ms=>new Promise(done=>setTimeout(done,ms));
async function freePort(){const s=net.createServer();await new Promise((ok,no)=>s.once('error',no).listen(0,'127.0.0.1',ok));const p=s.address().port;await new Promise(ok=>s.close(ok));return p}
async function harness(){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ne-qa-access-')),port=await freePort(),url='http://127.0.0.1:'+port;
 const env={...process.env,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),SALON_DB:path.join(temp,'db.sqlite'),WAHA_BASE_URL:'',WAHA_API_KEY:'',NOVAGENTE_PLATFORM_ADMIN_USERS:'',JEV_CONTROL_PLANE_URL:'http://127.0.0.1:1'};
 const child=spawn(process.execPath,['server.mjs'],{cwd:path.resolve('.'),env,stdio:'ignore'});
 let ok=false;for(let i=0;i<90;i++){try{if((await fetch(url+'/api/auth/state')).ok){ok=true;break}}catch{}await wait(120)}
 assert.ok(ok,'server unavailable');
 const req=async(route,opts={})=>{const headers={};if(opts.cookie)headers.cookie=opts.cookie;if(opts.body)headers['content-type']='application/json';const r=await fetch(url+route,{method:opts.method||'GET',headers,body:opts.body?JSON.stringify(opts.body):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}};
 const close=async()=>{child.kill('SIGTERM');await wait(150);if(child.exitCode===null)child.kill('SIGKILL');fs.rmSync(temp,{recursive:true,force:true})};
 return {req,close,dbPath:path.join(temp,'db.sqlite')};
}
test('convite sem senha e link de acesso único', {timeout:50000},async()=>{
 const app=await harness(),api=app.req;
 try{
  const setup=await api('/api/auth/setup',{method:'POST',body:{name:'Proprietária QA',email:'gestora@example.invalid',password:'AcessoSegura2026!'}});assert.equal(setup.status,201);
  const login=await api('/api/auth/login',{method:'POST',body:{email:'gestora@example.invalid',password:'AcessoSegura2026!'}});assert.equal(login.status,200);
  const ownerCookie=login.cookie,ownerId=login.data.user.id;
  assert.equal(login.data.user.platform_admin,false);
  const invalidPhone=await api('/api/professionals',{method:'POST',cookie:ownerCookie,body:{name:'Profissional Inválida',phone:'123'}});
  assert.equal(invalidPhone.status,400);
  const savedPhone=await api('/api/professionals',{method:'POST',cookie:ownerCookie,body:{name:'Profissional Teste',phone:'69 99999-9999'}});
  assert.equal(savedPhone.status,201);assert.equal(savedPhone.data.phone,'69999999999');
  assert.equal((await api('/api/agents/receptionist/explain',{cookie:ownerCookie})).status,403);
  const profiles=await api('/api/agents',{cookie:ownerCookie});assert.ok(profiles.data.profiles.every(x=>x.config===null));
  const invitation=await api('/api/admin/invitations',{method:'POST',cookie:ownerCookie,body:{name:'Profissional QA',email:'prof@example.invalid',role:'professional'}});assert.equal(invitation.status,201);
  const inspect=await api('/api/auth/invitations/inspect',{method:'POST',body:{token:invitation.data.token}});assert.equal(inspect.data.role,'professional');
  const accepted=await api('/api/auth/invitations/accept',{method:'POST',body:{token:invitation.data.token,passwordless:true}});assert.equal(accepted.status,201);assert.ok(accepted.cookie);
  assert.equal((await api('/api/auth/me',{cookie:accepted.cookie})).status,200);
  const target=accepted.data.user.id;
  const a=await api('/api/admin/users/'+target+'/access-link',{method:'POST',cookie:ownerCookie,body:{}});assert.equal(a.status,201);
  const b=await api('/api/admin/users/'+target+'/access-link',{method:'POST',cookie:ownerCookie,body:{}});assert.equal(b.status,201);
  assert.equal((await api('/api/auth/access-link',{method:'POST',body:{token:a.data.token}})).status,410);
  const quick=await api('/api/auth/access-link',{method:'POST',body:{token:b.data.token}});assert.equal(quick.status,200);assert.equal(quick.data.user.id,target);
  assert.equal((await api('/api/auth/access-link',{method:'POST',body:{token:b.data.token}})).status,410);
  assert.equal((await api('/api/admin/users/'+ownerId+'/access-link',{method:'POST',cookie:ownerCookie,body:{}})).status,403);
  assert.equal((await api('/api/admin/users/'+ownerId+'/password-reset',{method:'POST',cookie:ownerCookie,body:{}})).status,403);
  assert.equal((await api('/api/admin/users/'+target+'/access-link',{method:'POST',cookie:accepted.cookie,body:{}})).status,403);
 }finally{await app.close()}
});

test('redefinição segura, expiração de links e mudança de função', {timeout:60000},async()=>{
 const app=await harness(),api=app.req;
 try{
  await api('/api/auth/setup',{method:'POST',body:{name:'Dona QA',email:'dona@example.invalid',password:'SenhaProprietaria2026!'}});
  const login=await api('/api/auth/login',{method:'POST',body:{email:'dona@example.invalid',password:'SenhaProprietaria2026!'}});
  assert.equal(login.status,200);
  const ownerCookie=login.cookie;
  const invitation=await api('/api/admin/invitations',{method:'POST',cookie:ownerCookie,body:{name:'Recepção QA',email:'recepcao@example.invalid',role:'reception'}});
  assert.equal(invitation.status,201);
  const accepted=await api('/api/auth/invitations/accept',{method:'POST',body:{token:invitation.data.token,passwordless:true}});
  assert.equal(accepted.status,201);
  const staffId=accepted.data.user.id;

  const reset=await api('/api/admin/users/'+staffId+'/password-reset',{method:'POST',cookie:ownerCookie,body:{}});
  assert.equal(reset.status,201);
  assert.equal((await api('/api/auth/reset?token='+encodeURIComponent(reset.data.token))).status,200);
  assert.equal((await api('/api/auth/reset',{method:'POST',body:{token:reset.data.token,password:'curta'}})).status,400);
  assert.equal((await api('/api/auth/reset',{method:'POST',body:{token:reset.data.token,password:'SenhaNovaForte2026!'}})).status,200);
  assert.equal((await api('/api/auth/reset',{method:'POST',body:{token:reset.data.token,password:'SenhaNovaForte2026!'}})).status,410);
  assert.equal((await api('/api/auth/me',{cookie:accepted.cookie})).status,401,'redefinir senha revoga sessões antigas');
  const staffLogin=await api('/api/auth/login',{method:'POST',body:{email:'recepcao@example.invalid',password:'SenhaNovaForte2026!'}});
  assert.equal(staffLogin.status,200);

  const expired=await api('/api/admin/users/'+staffId+'/access-link',{method:'POST',cookie:ownerCookie,body:{}});
  assert.equal(expired.status,201);
  const db=new DatabaseSync(app.dbPath);
  try{db.prepare('update staff_access_links set expires_at=? where tenant_id=? and user_id=?').run('2000-01-01T00:00:00.000Z',staffLogin.data.user.tenantId,staffId)}
  finally{db.close()}
  assert.equal((await api('/api/auth/access-link',{method:'POST',body:{token:expired.data.token}})).status,410);

  const issued=await api('/api/admin/users/'+staffId+'/access-link',{method:'POST',cookie:ownerCookie,body:{}});
  assert.equal(issued.status,201);
  assert.equal((await api('/api/admin/users/'+staffId+'/role',{method:'PATCH',cookie:ownerCookie,body:{role:'manager'}})).status,200);
  assert.equal((await api('/api/auth/access-link',{method:'POST',body:{token:issued.data.token}})).status,410,
    'promover a gerente deve impedir autenticação pelo link de equipe');
  const manager=await api('/api/auth/login',{method:'POST',body:{email:'recepcao@example.invalid',password:'SenhaNovaForte2026!'}});
  assert.equal(manager.status,200);
  assert.equal((await api('/api/agents/receptionist/explain',{cookie:manager.cookie})).status,403);
 }finally{await app.close()}
});
