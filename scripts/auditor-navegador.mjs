// Homologação humana simulada em SQLite e navegador ISOLADOS. Nenhum WhatsApp real.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const root = process.env.NE_SOURCE || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const { chromium } = require('playwright');
const out = process.env.NE_EVIDENCE;
if (!out) throw Error('NE_EVIDENCE é obrigatório');
await fs.mkdir(out, { recursive: true, mode: 0o700 });
const checks=[];const startedAt=new Date().toISOString();
const save=async()=>fs.writeFile(path.join(out,'navegador.json'), JSON.stringify({startedAt,finishedAt:new Date().toISOString(),source:root,scope:'sandbox_local_sem_WhatsApp',checks},null,2));
async function check(id, description, fn) {
 const time=Date.now();
 try {const evidence=await fn();checks.push({id,description,status:'PASSOU',durationMs:Date.now()-time,evidence:evidence||''});console.log('PASSOU',id,description)}
 catch(e) {checks.push({id,description,status:'FALHOU',durationMs:Date.now()-time,error:String(e.stack||e.message||e).slice(0,1100)});console.log('FALHOU',id,String(e.message||e).slice(0,350))}
 await save();
}
async function port(){const s=createServer();await new Promise((res,rej)=>s.once('error',rej).listen(0,'127.0.0.1',res));const p=s.address().port;await new Promise(res=>s.close(res));return p}
const p=await port();const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ne-agente-auditoria-'));
const appEnv={...process.env, NODE_ENV:'test', HOST:'127.0.0.1', PORT:String(p),SALON_DB:path.join(temp,'auditoria.sqlite'),WAHA_BASE_URL:'',WAHA_API_KEY:'',WAHA_SESSION:'qa-isolado',WAHA_WEBHOOK_URL:'',WAHA_WEBHOOK_HMAC_SECRET:'',NOVAGENTE_ENABLE_RECEPTIONIST_AI:'false',NOVAGENTE_ENABLE_WHATSAPP_AI:'false', NOVAGENTE_MFA_KEY:crypto.createHash('sha256').update('ne-mfa-auditor-sandbox').digest('base64'),JEV_CONTROL_PLANE_URL:'http://127.0.0.1:1',NOVAGENTE_PUBLIC_ORIGIN:''};
const processApp=spawn(process.execPath,['server.mjs'],{cwd:root,env:appEnv,stdio:['ignore','pipe','pipe']});
let appLog='';for(const s of [processApp.stdout,processApp.stderr])s.on('data',v=>{appLog=(appLog+v.toString()).slice(-14000)});
let browser=null,ctx=null,page=null;
const errors=[];
try{
 await check('QA-001','Inicialização de servidor e banco independentes',async()=>{for(let i=0;i<100;i++){if(processApp.exitCode!==null)throw Error('App terminou: '+appLog);try{const r=await fetch('http://127.0.0.1:'+p+'/api/health');if(r.ok){const h=await r.json();assert.equal(h.ok,true);assert.equal(h.optional_integrations?.whatsapp?.configured,false);return 'API 200; WhatsApp não configurado; banco temporário'}}catch{}await new Promise(r=>setTimeout(r,120))}throw Error('API não iniciou: '+appLog)});
 browser=await chromium.launch({headless:true,executablePath:process.env.QA_CHROME||'/usr/bin/google-chrome',args:['--no-sandbox']});
 ctx=await browser.newContext({viewport:{width:1440,height:900},locale:'pt-BR',timezoneId:'America/Porto_Velho'});page=await ctx.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await check('A01','Primeiro acesso, criação da administradora fictícia e login',async()=>{
  await page.goto('http://127.0.0.1:'+p+'/',{waitUntil:'domcontentloaded',timeout:17000});
  await page.locator('#setupPanel:not(.hidden)').waitFor({timeout:12000});
  await page.locator('#setupForm [name=name]').fill('Administradora de Homologação');
  await page.locator('#setupForm [name=email]').fill('auditoria@example.invalid');
  await page.locator('#setupForm [name=password]').fill('Sandbox-Interno-2026-123!');
  await page.locator('#setupForm button[type=submit],#setupForm button').first().click();
  await page.locator('#loginPanel:not(.hidden)').waitFor({timeout:15000});
  await page.locator('#loginForm [name=email]').fill('auditoria@example.invalid');
  await page.locator('#loginForm [name=password]').fill('Sandbox-Interno-2026-123!');
  await page.locator('#loginForm button').click();await page.locator('#authGate').waitFor({state:'hidden',timeout:20000});
  assert.equal(errors.length,0,errors.join(' | '));
  await page.screenshot({path:path.join(out,'00-login-administradora.png')});return 'Login concluído; sem erros JavaScript';
 });
 const views=['dashboard','inbox','agenda','clients','people','team','technical','services','resources','finance','inventory','suppliers','retail','packages','productsHub','marketing','retention','reports','ownerEye','agents','intelligence','admin'];
 let passedViews=0;
 for(const [i,view] of views.entries()){
  await check('NAV-'+String(i+1).padStart(2,'0'),'Abrir tela '+view,async()=>{
   const button=page.locator('.sidebar [data-view="'+view+'"]');
   if(!await button.count())throw Error('Item não encontrado');
   const group=button.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " navGroup ")]');
   if(await group.count()&&!(await group.getAttribute('class')).split(/\s+/).includes('open'))await group.locator('.navGroupBtn').click();
   await button.click();await page.locator('#'+view+'.view.active').waitFor({timeout:12000});
   await page.waitForTimeout(170);if(errors.length)throw Error(errors.join(' | '));
   await page.screenshot({path:path.join(out,'tela-'+String(i+1).padStart(2,'0')+'-'+view+'.png')});passedViews++;return 'Tela ativa e print salvo';
  });
 }
 await check('U02','Verificação agregada das 22 visualizações',async()=>{assert.equal(passedViews,22,passedViews+'/22 telas');return '22/22 telas acessíveis'});
 for(const width of [390,768]){
  await check('U03-'+width,'Fluxo responsivo em largura '+width,async()=>{
   await page.setViewportSize({width,height:844});
   const info=await page.evaluate(()=>({view:window.innerWidth,documentWidth:document.documentElement.scrollWidth,loginVisible:!!document.querySelector('#authGate'),menu:document.querySelector('.mobileNav')?.childElementCount||0}));
   assert.ok(info.documentWidth<=info.view+6,'Rolagem lateral inesperada '+JSON.stringify(info));
   await page.screenshot({path:path.join(out,'responsivo-'+width+'.png')});return JSON.stringify(info);
  });
 }
 await check('A01-LOGOUT','Encerrar sessão e bloquear dados após logout',async()=>{
   await page.setViewportSize({width:1440,height:900});
   await page.locator('#logoutBtn').click();
   await page.locator('#loginPanel:not(.hidden)').waitFor({timeout:12000});
   const resp=await page.evaluate(async()=>{const r=await fetch('/api/clients');return r.status});
   assert.equal(resp,401);return 'Logout aplicado; consulta de clientes sem login retorna 401';
 });
 checks.push({id:'G21-G24',description:'Avisos à profissional por WhatsApp, tempo restante e remarcação/cancelamento',status:'PENDENTE',evidence:'Mensagens-modelo e calendário de avisos validados por testes unitários, mas sem fila, envio WAHA simulado ou confirmação de entrega integrados.'});
 await save();
}finally{
 await save();try{await ctx?.close()}catch{}try{await browser?.close()}catch{}
 if(processApp.exitCode===null){processApp.kill('SIGTERM');await new Promise(r=>setTimeout(r,550));if(processApp.exitCode===null)processApp.kill('SIGKILL')}
 await fs.writeFile(path.join(out,'app-redacted-log.txt'),appLog.replace(/(password|token|secret|api_key)\s*[=:]\s*[^\s]+/ig,'$1=[REDACTED]'));
 await fs.rm(temp,{recursive:true,force:true});
 console.log('AUDITOR_SUMMARY',JSON.stringify({passed:checks.filter(x=>x.status==='PASSOU').length,pending:checks.filter(x=>x.status==='PENDENTE').length,failed:checks.filter(x=>x.status==='FALHOU').length,total:checks.length,output:out}));
}