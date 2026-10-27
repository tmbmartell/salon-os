// Homologação integrada por HTTP REAL, sem WhatsApp externo e SEM dados de produção.
// O teste inicia server.mjs em processo separado, com SQLite novo num diretório temporário.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";
import {DatabaseSync} from "node:sqlite";

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"..");
async function freePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function start(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"novagente-homolog-"));
  const port=await freePort(),base="http://127.0.0.1:"+port,dbPath=path.join(directory,"qa.sqlite");
  const child=spawn(process.execPath,["server.mjs"],{
    cwd:root,env:{...process.env,PORT:String(port),HOST:"127.0.0.1",
      SALON_DB:dbPath,NOVAGENTE_ENABLE_RECEPTIONIST_AI:"false",
      JEV_CONTROL_PLANE_URL:"http://127.0.0.1:1"},stdio:["ignore","pipe","pipe"]
  });
  let logs="";
  child.stderr.on("data",chunk=>{logs=(logs+chunk.toString()).slice(-9000)});
  child.stdout.on("data",chunk=>{logs=(logs+chunk.toString()).slice(-9000)});
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
  await cleanup();throw Error("Servidor não abriu porta temporária: "+logs);
}
function client(base,cookie=""){
  return async function(pathname,{method="GET",body=null,headers={}}={}){
    const request={method,headers:{...headers}};
    if(cookie)request.headers.cookie=cookie;
    if(body!==null){request.headers["content-type"]="application/json";request.body=JSON.stringify(body)}
    const response=await fetch(base+pathname,request);
    const contentType=response.headers.get("content-type")||"";
    const data=contentType.includes("application/json")?await response.json():await response.text();
    return {status:response.status,headers:response.headers,data};
  }
}
async function expectStatus(request,pathname,expected,options={}){
  const result=await request(pathname,options);
  assert.equal(result.status,expected,pathname+" -> "+JSON.stringify(result.data).slice(0,700));
  return result.data;
}

test("E2E: servidor + login + CRM + agenda + ficha + estoque + caixa + pós-venda + indicadores + perfis",{timeout:80000},async()=>{
  const app=await start(),publicApi=client(app.base);
  try{
    const offline=await expectStatus(publicApi,"/api/health",200);
    assert.equal(offline.ok,true);
    assert.equal(offline.mode,"offline_without_whatsapp");
    assert.equal(offline.database.connected,true);
    assert.equal(offline.service,"NOVAGENTE Estética");
    const state=await expectStatus(publicApi,"/api/auth/state",200);
    assert.equal(state.claimed,false);
    assert.equal((await publicApi("/api/bootstrap")).status,401);
    const index=await expectStatus(publicApi,"/",200);
    assert.match(index,/NOVAGENTE Estética/i);
    const setup=await expectStatus(publicApi,"/api/auth/setup",201,{
      method:"POST",body:{email:"qa-owner@example.invalid",name:"QA Proprietária",password:"QA-senha-123456789"}
    });
    assert.equal(setup.ok,true);
    const login=await publicApi("/api/auth/login",{
      method:"POST",body:{email:"qa-owner@example.invalid",password:"QA-senha-123456789"}
    });
    assert.equal(login.status,200,JSON.stringify(login.data));
    const cookie=login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie?.startsWith("salon_session="));
    const owner=client(app.base,cookie);
    const boot=await expectStatus(owner,"/api/bootstrap",200);
    const pilot=await expectStatus(owner,"/api/admin/pilot-checks",200);
    assert.equal(pilot.mode,"pilot_offline");
    assert.equal(pilot.production_ready,false);
    assert.equal(pilot.checks.find(c=>c.id==="sqlite").status,"passed");
    assert.equal(pilot.checks.find(c=>c.id==="whatsapp").status,"deferred");
    assert.equal(pilot.checks.find(c=>c.id==="restore").status,"needs_attention");

    assert.ok(boot.services.length>0);
    assert.ok(boot.professionals.length>0);
    const service=boot.services[0],professional=boot.professionals[0];
    const customer=await expectStatus(owner,"/api/clients",201,{
      method:"POST",body:{name:"Cliente Homologação QA",phone:"69912348765",source:"qa-test"}
    });
    assert.ok(customer.id);
    // Consumo padrão e regra de retorno associados ao MESMO serviço da agenda.
    const item=await expectStatus(owner,"/api/products",201,{
      method:"POST",body:{name:"Pigmento QA",unit:"g",stock_qty:200,min_qty:10,avg_cost:0.5}
    });
    assert.equal(item.stock_qty,200);
    await expectStatus(owner,"/api/services/"+service.id+"/recipe",200,{
      method:"PUT",body:{items:[{product_id:item.id,qty_standard:60}]}
    });
    const rule=await expectStatus(owner,"/api/marketing/followup-rules",200,{
      method:"PUT",body:{service_id:service.id,delay_hours:48,
        template:"Olá {nome}, como ficou seu atendimento de {servico}?",enabled:true}
    });
    assert.equal(rule.enabled,true);
    const campaign=await expectStatus(owner,"/api/marketing/campaigns",201,{
      method:"POST",body:{title:"Campanha piloto QA",category:"promotion",message:"Somente rascunho",status:"draft"}
    });
    assert.equal(campaign.status,"draft");
    const startAt=new Date(Date.now()+8*86400000).toISOString();
    const appointment=await expectStatus(owner,"/api/appointments",201,{
      method:"POST",body:{client_id:customer.id,professional_id:professional.id,
        service_id:service.id,start_at:startAt,source:"homologacao"}
    });
    assert.ok(appointment.id);
    const record=await expectStatus(owner,"/api/clients/"+customer.id+"/technical",201,{
      method:"POST",body:{appointment_id:appointment.id,title:"Ficha teste",
        formula:"60 g pigmento",observations:"Registro em ambiente de QA"}
    });
    assert.ok(record.id);
    const records=await expectStatus(owner,"/api/clients/"+customer.id+"/technical",200);
    assert.equal(records.length,1);
    assert.equal(records[0].appointment_id,appointment.id);
    await expectStatus(owner,"/api/appointments/"+appointment.id+"/status",200,{
      method:"PATCH",body:{status:"confirmed"}
    });
    const forbiddenComplete=await owner("/api/appointments/"+appointment.id+"/status",{
      method:"PATCH",body:{status:"completed"}
    });
    assert.equal(forbiddenComplete.status,409);
    const prep=await expectStatus(owner,"/api/checkout/"+appointment.id+"/prep",200);
    assert.equal(prep.recipe.find(x=>x.product_id===item.id).qty_standard,60);
    // Transação NÃO pode registrar recebimento nem debitar parcialmente caso falte material.
    const blocked=await owner("/api/checkout",{method:"POST",body:{
      appointment_id:appointment.id,payment_method:"pix",
      consumption:[{product_id:item.id,actual_qty:300}]
    }});
    assert.equal(blocked.status,409,JSON.stringify(blocked.data));
    const before=await expectStatus(owner,"/api/products",200);
    assert.equal(before.find(x=>x.id===item.id).stock_qty,200);
    const done=await expectStatus(owner,"/api/checkout",201,{method:"POST",body:{
      appointment_id:appointment.id,payment_method:"pix",discount:0,
      consumption:[{product_id:item.id,actual_qty:65}]
    }});
    assert.equal(done.consumption.find(x=>x.product_id===item.id).actual_qty,65);
    const products=await expectStatus(owner,"/api/products",200);
    assert.equal(products.find(x=>x.id===item.id).stock_qty,135);
    assert.equal((await owner("/api/checkout",{method:"POST",body:{
      appointment_id:appointment.id,payment_method:"pix"
    }})).status,409);
    // Segundo atendimento com dois serviços usando o mesmo pigmento: 60 + 40 g padrão,
    // consumo real de 125 g, sem baixa duplicada. Também valida o caixa físico.
    const otherService=boot.services.find(x=>x.id!==service.id);
    assert.ok(otherService,"Dados de demonstração precisam conter ao menos dois serviços");
    await expectStatus(owner,"/api/services/"+otherService.id+"/recipe",200,{
      method:"PUT",body:{items:[{product_id:item.id,qty_standard:40}]}
    });
    const combined=await expectStatus(owner,"/api/appointments",201,{
      method:"POST",body:{client_id:customer.id,professional_id:professional.id,service_id:service.id,
        start_at:new Date(Date.now()+12*86400000).toISOString(),
        items:[{service_id:otherService.id,professional_id:professional.id,qty:1}]}
    });
    const multiPrep=await expectStatus(owner,"/api/checkout/"+combined.id+"/prep",200);
    assert.equal(multiPrep.recipe.find(x=>x.product_id===item.id).qty_standard,100);
    const cashDenied=await owner("/api/checkout",{method:"POST",body:{
      appointment_id:combined.id,payment_method:"cash",
      consumption:[{product_id:item.id,actual_qty:125}]
    }});
    assert.equal(cashDenied.status,409,"dinheiro exige caixa aberto");
    const opened=await expectStatus(owner,"/api/cash/open",201,{
      method:"POST",body:{opening:20}
    });
    assert.equal(opened.status,"open");
    const multiCheckout=await expectStatus(owner,"/api/checkout",201,{method:"POST",body:{
      appointment_id:combined.id,payment_method:"cash",
      consumption:[{product_id:item.id,actual_qty:125}]
    }});
    assert.equal(multiCheckout.consumption.reduce((sum,x)=>sum+x.actual_qty,0),125);
    assert.equal(multiCheckout.consumption.length,2);
    const afterCombined=await expectStatus(owner,"/api/products",200);
    assert.equal(afterCombined.find(x=>x.id===item.id).stock_qty,10);
    const cashView=await expectStatus(owner,"/api/cash/overview",200);
    assert.equal(cashView.expected,20+multiCheckout.total);
    const closed=await expectStatus(owner,"/api/cash/close",200,{
      method:"POST",body:{actual:cashView.expected}
    });
    assert.equal(closed.difference,0);
    const finance=await expectStatus(owner,"/api/finance/entries",200);
    assert.equal(finance.filter(x=>x.appointment_id===appointment.id&&x.kind==="income").length,1);
    assert.equal(finance.filter(x=>x.appointment_id===combined.id&&x.kind==="income").length,1);
    const commissions=await expectStatus(owner,"/api/commissions",200);
    assert.ok(commissions.some(x=>x.appointment_id===appointment.id));
    const tasks=await expectStatus(owner,"/api/retention/tasks?status=pending",200);
    const postcare=tasks.filter(x=>x.appointment_id===appointment.id&&x.kind==="postcare");
    assert.equal(postcare.length,1,"somente uma tarefa de pós-atendimento, sem envio");
    assert.match(postcare[0].message,/Cliente/);
    const ownerEye=await expectStatus(owner,"/api/owner-eye/summary",200);
    assert.ok(ownerEye.money.income>=done.total);
    assert.ok(ownerEye.operations.completed_services>=2);
    assert.ok(ownerEye.attention.critical_stock>=1);
    assert.ok(ownerEye.charts.cashflow14.length===14);
    assert.equal((await expectStatus(owner,"/api/marketing/campaigns",200)).length,1);
    // Sem escalar privilégios: convite de recepcionista cria acesso limitado.
    const invited=await expectStatus(owner,"/api/admin/invitations",201,{
      method:"POST",body:{email:"qa-reception@example.invalid",name:"Recepção QA",role:"reception"}
    });
    assert.ok(invited.token.length>30);
    await expectStatus(publicApi,"/api/auth/invitations/accept",201,{
      method:"POST",body:{token:invited.token,password:"Recepcao-senha-123456789"}
    });
    const rlogin=await publicApi("/api/auth/login",{
      method:"POST",body:{email:"qa-reception@example.invalid",password:"Recepcao-senha-123456789"}
    });
    assert.equal(rlogin.status,200);
    const reception=client(app.base,rlogin.headers.get("set-cookie").split(";")[0]);
    assert.equal((await reception("/api/finance/entries")).status,403);
    assert.equal((await reception("/api/owner-eye/summary")).status,403);
    assert.equal((await reception("/api/admin/pilot-checks")).status,403);
    assert.equal((await reception("/api/staff/time-off")).status,403);
    const staff=await expectStatus(reception,"/api/staff/overview",200);
    assert.equal(staff.limited,true);
    assert.equal(staff.metrics.some(x=>"commission_total" in x),false);
    assert.equal((await reception("/api/admin/invitations",{method:"POST",body:{
      name:"Intruso",email:"intruso@example.invalid",role:"manager"
    }})).status,403);
    // Cabeçalhos forjados não permitem mudar tenant da sessão autenticada.
    const spoof=await owner("/api/admin/business-profile",{headers:{"x-tenant-id":"tenant-forged"}});
    assert.equal(spoof.status,200);
    assert.equal(spoof.data.name,boot.tenant.name);
    // Exportação integral exige privilégio especial e mantém trilha de auditoria.
    const exportForbidden=await reception("/api/clients/export");
    assert.equal(exportForbidden.status,403);
    const injection=await expectStatus(owner,"/api/clients",201,{method:"POST",body:{
      name:"=2+3",
      phone:"69977001122",notes:"+SUM(A1:A9)",source:"imported-test"
    }});
    assert.ok(injection.id);
    const foreignClient="qa-client-foreign";
    const db=new DatabaseSync(app.dbPath);
    try{
      const at=new Date().toISOString();
      db.prepare("insert into tenants(id,name,slug,timezone,created_at) values(?,?,?,?,?)")
        .run("qa-tenant-other","Salão Externo QA","qa-externo","America/Porto_Velho",at);
      db.prepare("insert into clients(id,tenant_id,name,phone,created_at,updated_at) values(?,?,?,?,?,?)")
        .run(foreignClient,"qa-tenant-other","CLIENTE_DO_OUTRO_SALAO","69955544411",at,at);
      db.prepare("insert into technical_records(id,tenant_id,client_id,title,formula,created_at) values(?,?,?,?,?,?)")
        .run("qa-foreign-record","qa-tenant-other",foreignClient,"Registro confidencial","SEGREDO_OUTRO_SALAO",at);
    }finally{db.close()}
    assert.equal((await owner("/api/clients/"+foreignClient+"/technical")).status,404);
    assert.equal((await reception("/api/clients/"+foreignClient+"/technical")).status,404);
    const visibleClients=await expectStatus(owner,"/api/clients",200);
    const exported=await owner("/api/clients/export");
    assert.equal(exported.status,200);
    assert.ok(exported.headers.get("content-type").includes("text/csv"));
    assert.equal(exported.headers.get("cache-control"),"no-store");
    assert.equal(exported.headers.get("x-content-type-options"),"nosniff");
    assert.match(exported.data,/novagente|Cliente Homologação QA/);
    assert.doesNotMatch(exported.data,/CLIENTE_DO_OUTRO_SALAO|SEGREDO_OUTRO_SALAO/);
    assert.ok(exported.data.includes("'=2+3"),"CSV neutraliza fórmulas em nomes");
    assert.ok(exported.data.includes("'+SUM"),"CSV neutraliza fórmulas nas observações");
    const dbAudit=new DatabaseSync(app.dbPath,{readOnly:true});
    try{
      const row=dbAudit.prepare("select tenant_id,action,metadata from audit_log where action='clients.export' order by created_at desc limit 1").get();
      assert.equal(row.tenant_id,boot.tenant.id);
      assert.equal(JSON.parse(row.metadata).count,visibleClients.length);
    }finally{dbAudit.close()}

  }catch(err){err.message+="\nLogs finais do servidor de teste:\n"+app.logs().slice(-2500);throw err}
  finally{await app.cleanup()}
});
