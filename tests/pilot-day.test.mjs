// Etapa 13 — Simulação de um dia de salão com dados sintéticos e servidor HTTP REAL.
// Não expõe a simulação como botão no ambiente dos clientes e não usa dados reais.
import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {fileURLToPath} from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
  const server=createServer();
  await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
async function start(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ne-day-pilot-"));
  const base="http://127.0.0.1:"+(await freePort());
  const child=spawn(process.execPath,["server.mjs"],{
    cwd:root,env:{...process.env,PORT:new URL(base).port,HOST:"127.0.0.1",
      SALON_DB:path.join(dir,"synthetic.sqlite"),
      NOVAGENTE_ENABLE_RECEPTIONIST_AI:"false",WAHA_BASE_URL:"",WAHA_API_KEY:"",
      JEV_CONTROL_PLANE_URL:"http://127.0.0.1:1"},stdio:["ignore","pipe","pipe"]
  });
  let logs="";
  for(const stream of [child.stdout,child.stderr])stream.on("data",x=>{logs=(logs+x.toString()).slice(-6000)});
  async function cleanup(){
    if(child.exitCode===null){
      child.kill("SIGTERM");
      await Promise.race([new Promise(r=>child.once("exit",r)),wait(800)]);
    }
    if(child.exitCode===null)child.kill("SIGKILL");
    fs.rmSync(dir,{recursive:true,force:true});
  }
  async function request(route,{method="GET",body,cookie,headers={}}={}){
    const h={...headers};if(cookie)h.cookie=cookie;
    const opts={method,headers:h};
    if(body!==undefined){opts.body=JSON.stringify(body);h["content-type"]="application/json"}
    const res=await fetch(base+route,opts);
    const contentType=res.headers.get("content-type")||"";
    const data=contentType.includes("json")?await res.json():await res.text();
    return {status:res.status,data,cookie:res.headers.get("set-cookie")?.split(";")[0]};
  }
  let ready=false;
  for(let i=0;i<110;i++){
    if(child.exitCode!==null)break;
    try{const a=await request("/api/auth/state");if(a.status===200){ready=true;break}}catch{}
    await wait(110);
  }
  if(!ready){await cleanup();throw Error("Falha ao iniciar: "+logs)}
  return {request,cleanup,getLogs:()=>logs};
}
async function expect(request,route,status,opts){
  const out=await request(route,opts);
  assert.equal(out.status,status,route+" "+JSON.stringify(out.data).slice(0,800));
  return out.data;
}
const cents=n=>Math.round(n*100);
const sum=(rows,selector)=>rows.reduce((v,row)=>v+selector(row),0);
function nextWorkingDate(){
  // Data futura, horário em UTC equivalente a 9:00–17:00 em Porto Velho.
  const d=new Date(Date.now()+11*86400000);
  return d.toISOString().slice(0,10);
}
function reportArtifacts(result){
  if(process.env.NOVAGENTE_PILOT_REPORT!=="1")return;
  const dir=path.join(root,"artifacts","pilot-day");
  fs.mkdirSync(dir,{recursive:true});
  const json=path.join(dir,"report.json");
  fs.writeFileSync(json,JSON.stringify(result,null,2)+"\n");
  const x=result;
  const markdown=`# Simulação de um dia — NOVAGENTE Estética

> Tudo abaixo foi produzido com **dados sintéticos e banco descartável**. Não é relatório de uma empresa real.

**Cenário:** ${x.scenario.date}, com ${x.scenario.clients} clientes fictícias, ${x.scenario.professionals} profissionais e ${x.scenario.services} serviços.

| Indicador | Resultado esperado | Resultado apurado |
|---|---:|---:|
| Atendimentos concluídos | ${x.expected.checkouts} | ${x.actual.checkouts} |
| Não comparecimentos | ${x.expected.no_show} | ${x.actual.no_show} |
| Cancelamentos | ${x.expected.cancelled} | ${x.actual.cancelled} |
| Entradas recebidas | R$ ${x.expected.income.toFixed(2)} | R$ ${x.actual.income.toFixed(2)} |
| Despesas pagas | R$ ${x.expected.expenses.toFixed(2)} | R$ ${x.actual.expenses.toFixed(2)} |
| Saldo financeiro | R$ ${x.expected.net.toFixed(2)} | R$ ${x.actual.net.toFixed(2)} |
| Comissões geradas | R$ ${x.expected.commissions.toFixed(2)} | R$ ${x.actual.commissions.toFixed(2)} |
| Caixa físico esperado | R$ ${x.expected.cash_closing.toFixed(2)} | R$ ${x.actual.cash_closing.toFixed(2)} |
| Pigmento em estoque | ${x.expected.pigment_stock} g | ${x.actual.pigment_stock} g |
| Finalizador em estoque | ${x.expected.finisher_stock} ml | ${x.actual.finisher_stock} ml |
| Tarefas pós-atendimento | ${x.expected.postcare} | ${x.actual.postcare} |

**Permissões:** recepção criou cliente e agenda, mas acesso a financeiro, comissões e Olho do Dono foi recusado.

**WhatsApp:** adiado, nenhum envio externo realizado.

**Limites:** cenário único e automatizado; não substitui validação em celulares físicos, concorrência de múltiplos usuários, LGPD, segurança de produção nem integrações bancárias reais.
`;
  fs.writeFileSync(path.join(dir,"report.md"),markdown);
}
test("Etapa 13: um dia inteiro de salão em API real, sem WAHA",{timeout:95000},async()=>{
  const app=await start();const publicApi=app.request;const report={scenario:{date:nextWorkingDate(),clients:5,professionals:2,services:2}};
  try{
    const state=await expect(publicApi,"/api/health",200);
    assert.equal(state.mode,"offline_without_whatsapp");
    await expect(publicApi,"/api/auth/setup",201,{method:"POST",body:{
      name:"Proprietária de Teste",email:"dona-piloto@example.invalid",password:"senha-exclusiva-piloto-123456789"
    }});
    const login=await publicApi("/api/auth/login",{method:"POST",body:{
      email:"dona-piloto@example.invalid",password:"senha-exclusiva-piloto-123456789"
    }});
    assert.equal(login.status,200);
    const owner=(url,options={})=>publicApi(url,{...options,cookie:login.cookie});
    const boot=await expect(owner,"/api/bootstrap",200);
    assert.equal(boot.whatsapp.connected,false);

    const invite=await expect(owner,"/api/admin/invitations",201,{method:"POST",body:{
      name:"Recepção QA",email:"recepcao-piloto@example.invalid",role:"reception"
    }});
    await expect(publicApi,"/api/auth/invitations/accept",201,{method:"POST",body:{
      token:invite.token,password:"senha-para-recepcao-123456789"
    }});
    const receptionLogin=await publicApi("/api/auth/login",{method:"POST",body:{
      email:"recepcao-piloto@example.invalid",password:"senha-para-recepcao-123456789"
    }});
    assert.equal(receptionLogin.status,200);
    const reception=(url,options={})=>publicApi(url,{...options,cookie:receptionLogin.cookie});

    const proA=await expect(owner,"/api/professionals",201,{method:"POST",body:{
      name:"Profissional QA 1",role:"Colorista",work_start:"09:00",work_end:"18:00"
    }});
    const proB=await expect(owner,"/api/professionals",201,{method:"POST",body:{
      name:"Profissional QA 2",role:"Cabeleireira",work_start:"09:00",work_end:"18:00"
    }});
    const color=await expect(owner,"/api/services",201,{method:"POST",body:{
      name:"Coloração QA",category:"Cabelo",duration_min:60,price:150,commission_pct:20
    }});
    const styling=await expect(owner,"/api/services",201,{method:"POST",body:{
      name:"Escova QA",category:"Cabelo",duration_min:60,price:80,commission_pct:15
    }});
    const pigment=await expect(owner,"/api/products",201,{method:"POST",body:{
      name:"Pigmento QA",unit:"g",stock_qty:400,min_qty:50,avg_cost:0.20
    }});
    const finisher=await expect(owner,"/api/products",201,{method:"POST",body:{
      name:"Finalizador QA",unit:"ml",stock_qty:200,min_qty:130,avg_cost:0.15
    }});
    await expect(owner,"/api/services/"+color.id+"/recipe",200,{method:"PUT",
      body:{items:[{product_id:pigment.id,qty_standard:30}]}});
    await expect(owner,"/api/services/"+styling.id+"/recipe",200,{method:"PUT",
      body:{items:[{product_id:finisher.id,qty_standard:20}]}});
    await expect(owner,"/api/marketing/followup-rules",200,{method:"PUT",body:{
      service_id:color.id,delay_hours:24,
      template:"Olá {nome}! Como ficou o resultado de {servico}?",enabled:true
    }});

    const clientNames=["Cliente QA A","Cliente QA B","Cliente QA C","Cliente QA D","Cliente QA E"];
    const clients=[];
    for(let i=0;i<clientNames.length;i++){
      const item=await expect(reception,"/api/clients",201,{method:"POST",body:{
        name:clientNames[i],phone:"6999900"+String(100+i),source:"simulacao"
      }});
      clients.push(item);
    }
    const date=report.scenario.date;
    async function appointment({client,professional,service,hour,minute="00"}){
      const start_at=`${date}T${hour}:${minute}:00.000Z`;
      return expect(reception,"/api/appointments",201,{method:"POST",body:{
        client_id:clients[client].id,professional_id:professional.id,service_id:service.id,
        start_at,source:"simulacao",notes:"Agenda fictícia de homologação"
      }});
    }
    const a1=await appointment({client:0,professional:proA,service:color,hour:"13"});
    const a2=await appointment({client:1,professional:proB,service:styling,hour:"13"});
    const a3=await appointment({client:2,professional:proA,service:color,hour:"15"});
    const a4=await appointment({client:3,professional:proB,service:styling,hour:"15"});
    const a5=await appointment({client:0,professional:proA,service:styling,hour:"18"});
    const a6=await appointment({client:4,professional:proB,service:color,hour:"18"});
    const a7=await appointment({client:1,professional:proA,service:styling,hour:"20"});
    // Não reservar mesmo profissional no mesmo horário.
    const conflict=await reception("/api/appointments",{method:"POST",body:{
      client_id:clients[3].id,professional_id:proA.id,service_id:styling.id,
      start_at:`${date}T13:20:00.000Z`
    }});
    assert.equal(conflict.status,409,"agenda bloqueia sobreposição no mesmo profissional");

    const booked=await expect(reception,`/api/appointments?from=${date}T00:00:00.000Z&to=${date}T23:59:59.999Z`,200);
    assert.equal(booked.filter(x=>[a1.id,a2.id,a3.id,a4.id,a5.id,a6.id,a7.id].includes(x.id)).length,7);

    const cash=await expect(owner,"/api/cash/open",201,{method:"POST",body:{opening:50}});
    assert.equal(cash.status,"open");
    const completed=[];
    for(const [appt,method,consumption,discount] of [
      [a1,"pix",[{product_id:pigment.id,actual_qty:35}],0],
      [a2,"cash",[{product_id:finisher.id,actual_qty:25}],0],
      [a3,"debit_card",[{product_id:pigment.id,actual_qty:35}],10],
      [a4,"credit_card",[{product_id:finisher.id,actual_qty:25}],0],
      [a5,"cash",[{product_id:finisher.id,actual_qty:25}],0]
    ]){
      await expect(reception,"/api/appointments/"+appt.id+"/status",200,{
        method:"PATCH",body:{status:"confirmed"}
      });
      const checkout=await expect(owner,"/api/checkout",201,{
        method:"POST",body:{appointment_id:appt.id,payment_method:method,
          consumption,discount}
      });
      completed.push(checkout);
      assert.equal((await owner("/api/checkout",{method:"POST",body:{
        appointment_id:appt.id,payment_method:method
      }})).status,409,"checkout não pode duplicar");
    }
    assert.deepEqual(completed.map(x=>x.total),[150,80,140,80,80]);
    await expect(reception,"/api/appointments/"+a6.id+"/status",200,{
      method:"PATCH",body:{status:"no_show"}
    });
    await expect(reception,"/api/appointments/"+a7.id+"/status",200,{
      method:"PATCH",body:{status:"cancelled"}
    });
    for(const unbillable of [a6,a7])
      assert.equal((await owner("/api/checkout",{method:"POST",body:{
        appointment_id:unbillable.id,payment_method:"pix"
      }})).status,409,"cancelamento e ausência não faturam");

    // Uma despesa real fictícia é subtraída do saldo e do numerário esperado.
    const expense=await expect(owner,"/api/finance/entries",201,{
      method:"POST",body:{kind:"expense",category:"supplies",description:"Compra emergencial QA",
        amount:20,payment_method:"cash",status:"paid"}
    });
    assert.equal(expense.amount,20);
    const open=await expect(owner,"/api/cash/overview",200);
    assert.equal(open.expected,190); // R$ 50 de fundo + R$ 160 em espécie - R$ 20 de despesa.
    const final=await expect(owner,"/api/cash/close",200,{
      method:"POST",body:{actual:open.expected,notes:"Conferência do dia de homologação"}
    });
    assert.equal(final.difference,0);
    assert.equal((await expect(owner,"/api/cash/overview",200)).status,"closed");

    const finance=await expect(owner,"/api/finance/entries",200);
    const paidIncome=finance.filter(x=>x.kind==="income"&&x.status==="paid");
    const paidExpense=finance.filter(x=>x.kind==="expense"&&x.status==="paid");
    assert.equal(paidIncome.length,5);
    assert.equal(sum(paidIncome,x=>cents(x.amount)),53000);
    assert.equal(sum(paidExpense,x=>cents(x.amount)),2000);
    assert.deepEqual(Object.fromEntries(["pix","cash","debit_card","credit_card"].map(method=>[
      method,sum(paidIncome.filter(x=>x.payment_method===method),x=>cents(x.amount))/100
    ])),{pix:150,cash:160,debit_card:140,credit_card:80});
    const commissions=await expect(owner,"/api/commissions",200);
    assert.equal(commissions.filter(x=>completed.some(c=>c.appointment_id===x.appointment_id)).length,5);
    const actualCommissions=sum(commissions.filter(x=>completed.some(c=>c.appointment_id===x.appointment_id)),
      x=>Math.round(Number(x.amount_cents??cents(x.amount))));
    assert.equal(actualCommissions,9400);
    const products=await expect(owner,"/api/products",200);
    const pigStock=products.find(x=>x.id===pigment.id).stock_qty;
    const finStock=products.find(x=>x.id===finisher.id).stock_qty;
    assert.equal(pigStock,330);
    assert.equal(finStock,125);
    const tasks=await expect(owner,"/api/retention/tasks?status=pending",200);
    const postcare=tasks.filter(x=>completed.some(c=>c.appointment_id===x.appointment_id)&&x.kind==="postcare");
    assert.equal(postcare.length,5);
    assert.equal(new Set(postcare.map(t=>t.appointment_id)).size,5);
    const ownerEye=await expect(owner,"/api/owner-eye/summary",200);
    assert.equal(ownerEye.money.income,530);
    assert.equal(ownerEye.money.expenses,20);
    assert.equal(ownerEye.money.cash_net,510);
    assert.equal(ownerEye.operations.completed_services,5);
    assert.equal(ownerEye.operations.average_checkout,106);
    assert.equal(ownerEye.operations.repeat_clients,1);
    assert.equal(ownerEye.operations.clients_with_checkout,4);
    assert.equal(ownerEye.operations.repeat_rate,25);
    assert.ok(ownerEye.alerts.some(a=>a.id==="stock"));
    const reports=await expect(owner,"/api/reports/summary",200);
    assert.equal(reports.services.count,5);
    assert.equal(reports.income,530);
    assert.equal(reports.expenses,20);
    assert.equal(reports.net,510);
    assert.equal(reports.commissions,94);
    const cashSessions=await expect(owner,"/api/cash/history",200);
    assert.equal(cashSessions[0].difference,0);
    assert.equal((await reception("/api/finance/entries")).status,403);
    assert.equal((await reception("/api/commissions")).status,403);
    assert.equal((await reception("/api/owner-eye/summary")).status,403);
    assert.equal((await reception("/api/reports/summary")).status,403);
    assert.equal((await expect(publicApi,"/api/health",200)).mode,"offline_without_whatsapp");

    const expected={checkouts:5,no_show:1,cancelled:1,income:530,expenses:20,net:510,
      commissions:94,cash_closing:190,pigment_stock:330,finisher_stock:125,postcare:5};
    const actual={checkouts:ownerEye.operations.completed_services,
      no_show:ownerEye.operations.absence_count,cancelled:1,income:ownerEye.money.income,
      expenses:ownerEye.money.expenses,net:ownerEye.money.cash_net,commissions:actualCommissions/100,
      cash_closing:open.expected,pigment_stock:pigStock,finisher_stock:finStock,postcare:postcare.length};
    for(const key of Object.keys(expected))assert.equal(actual[key],expected[key],key);
    reportArtifacts({...report,expected,actual,access:{reception_can_create_clients:true,
      reception_can_create_appointments:true,financial_data_blocked:true},
      mode:"offline_without_whatsapp",result:"passed",synthetic_only:true});
    console.log("DIA PILOTO APROVADO:",JSON.stringify({checkouts:5,total:530,net:510,
      commissions:94,stock:[pigStock,finStock],cash_difference:final.difference,
      postcare:postcare.length,whatsapp:"not_connected"}));
  }catch(error){error.message+="\nLogs da simulação:\n"+app.getLogs();throw error}
  finally{await app.cleanup()}
});
