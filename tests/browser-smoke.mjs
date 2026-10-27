// Browser QA da NOVAGENTE Estética em SQLite temporário, sem usar produção/WAHA.
// Executar apenas no workflow visual com playwright instalado.
import {chromium} from "playwright";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
const sleep=t=>new Promise(r=>setTimeout(r,t));
const root=process.cwd(),artifact=path.join(root,"artifacts","browser");
fs.mkdirSync(artifact,{recursive:true});
async function availablePort(){
  const server=createServer();
  await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),"novagente-browser-")),port=await availablePort();
const base="http://127.0.0.1:"+port,server=spawn(process.execPath,["server.mjs"],{
  cwd:root,env:{...process.env,HOST:"127.0.0.1",PORT:String(port),SALON_DB:path.join(temp,"qa.sqlite"),
    NOVAGENTE_ENABLE_RECEPTIONIST_AI:"false",JEV_CONTROL_PLANE_URL:"http://127.0.0.1:1"},stdio:["ignore","pipe","pipe"]
});
let output="",browser=null,page=null;
for(const stream of [server.stdout,server.stderr])stream.on("data",c=>{output=(output+c.toString()).slice(-8000)});
async function close(){
  try{await browser?.close()}catch{}
  if(server.exitCode===null){server.kill("SIGTERM");await Promise.race([new Promise(r=>server.once("exit",r)),sleep(1000)])}
  if(server.exitCode===null)server.kill("SIGKILL");
  fs.rmSync(temp,{recursive:true,force:true});
}
const errors=[];
try{
  let ready=false;
  for(let i=0;i<100;i++){
    if(server.exitCode!==null)throw Error("Servidor encerrou antes do teste: "+output);
    try{const r=await fetch(base+"/api/auth/state");if(r.status===200){ready=true;break}}catch{}
    await sleep(120);
  }
  assert.ok(ready,"O servidor não ficou disponível: "+output);
  browser=await chromium.launch({headless:true,...(process.env.QA_CHROME?{executablePath:process.env.QA_CHROME}:{}),args:["--no-sandbox"]});
  const context=await browser.newContext({viewport:{width:1440,height:900},locale:"pt-BR",timezoneId:"America/Porto_Velho"});
  page=await context.newPage();
  page.on("pageerror",error=>errors.push(error.stack||error.message));
  await page.goto(base,{waitUntil:"domcontentloaded"});
  await page.locator("#setupPanel:not(.hidden)").waitFor({timeout:15000});
  await page.screenshot({path:path.join(artifact,"01-primeiro-acesso.png"),fullPage:true});
  await page.locator("#setupForm [name=name]").fill("Proprietária QA");
  await page.locator("#setupForm [name=email]").fill("qa-browser@example.invalid");
  await page.locator("#setupForm [name=password]").fill("QA-browser-senha-123456!");
  await page.locator("#setupForm button[type=submit],#setupForm button").click();
  await page.locator("#loginPanel:not(.hidden)").waitFor({timeout:10000});
  await page.locator("#loginForm [name=password]").fill("QA-browser-senha-123456!");
  await page.locator("#loginForm button").click();
  await page.locator("#authGate").waitFor({state:"hidden",timeout:25000});
  await page.waitForFunction(()=>{
    const node=document.querySelector("#mPros");
    return node&&node.textContent.trim()!=="—";
  },{timeout:25000});
  assert.equal(errors.length,0,"Erros JS no login/primeira tela: "+errors.join(" | "));
  await page.screenshot({path:path.join(artifact,"02-visao-geral-desktop.png"),fullPage:true});
  async function open(view){
    const button=page.locator('.sidebar [data-view="'+view+'"]');
    const group=button.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " bw-nav-group ")]');
    if(await group.count()){
      const trigger=group.locator(".bw-nav-trigger");
      if(await trigger.getAttribute("aria-expanded")==="false")await trigger.click();
    }
    await button.click();
    await page.locator("#"+view+".view.active").waitFor({timeout:12000});
    await sleep(300);
    assert.equal(errors.length,0,"Erro JS após abrir "+view+": "+errors.join(" | "));
  }
  await open("agenda");
  assert.ok(await page.locator("#agendaList").count()>0);
  await open("inventory");
  await page.locator('[data-ne-stock-tab="recipes"]').click();
  await page.locator('[data-ne-stock-panel="recipes"]:not(.hidden)').waitFor();
  await page.screenshot({path:path.join(artifact,"03-estoque-desktop.png"),fullPage:true});
  await open("finance");
  assert.ok(await page.locator(".ne-finance-actions").isVisible());
  await page.locator('[data-ne-finance-tab="entries"]').click();
  await page.locator('[data-ne-finance-panel="entries"]:not(.hidden)').waitFor();
  await open("marketing");
  await page.locator("#neCampaignList").waitFor({timeout:14000});
  await page.locator("#neNewCampaign").click();
  await page.locator("#neCampaignModal[open]").waitFor();
  await page.locator("#neCampaignForm [name=title]").fill("Campanha de teste visual");
  await page.locator("#neCampaignForm [name=message]").fill("Rascunho privado para QA");
  await page.locator("#neCampaignForm button[type=submit]").click();
  await page.locator("#neCampaignModal").waitFor({state:"hidden",timeout:12000});
  await page.getByText("Campanha de teste visual").first().waitFor();
  await open("ownerEye");
  await page.waitForFunction(()=>document.querySelector("#oiRevenue")?.textContent?.trim()!=="—",{timeout:15000});
  await page.screenshot({path:path.join(artifact,"04-olho-do-dono-desktop.png"),fullPage:true});
  await open("admin");
  await page.locator(".ne-stage8-grid").first().waitFor();
  await page.screenshot({path:path.join(artifact,"05-administracao-desktop.png"),fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(artifact,"06-administracao-mobile.png"),fullPage:true});
  assert.equal(errors.length,0,"Erros não tratados no navegador: "+errors.join(" | "));
  console.log("QA VISUAL APROVADA: primeiro acesso, login, dashboard, agenda, estoque, financeiro, marketing, gerência e admin.");
  console.log("Capturas de tela: "+artifact);
}catch(e){
  if(page)await page.screenshot({path:path.join(artifact,"ERRO-interface.png"),fullPage:true}).catch(()=>{});
  console.error("QA VISUAL FALHOU:",e.message);
  console.error("Falhas JavaScript:",errors);
  console.error("Logs servidor:",output.slice(-3500));
  process.exitCode=1;
}finally{await close()}
