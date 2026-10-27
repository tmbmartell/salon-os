// Etapa 14: concorrência de usuários e duas instâncias Node sobre SQLite temporário.
// Sem rede externa, sem WhatsApp, sem dados reais e sem deploy.
import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function port(){
  const srv=net.createServer();
  await new Promise((ok,bad)=>srv.once("error",bad).listen(0,"127.0.0.1",ok));
  const p=srv.address().port;await new Promise(r=>srv.close(r));return p;
}
async function harness(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"ne-concurrency-")),database=path.join(directory,"simulado.sqlite");
  const children=[],servers=[];
  async function runServer(){
    const address="http://127.0.0.1:"+(await port()),logs=[];
    const child=spawn(process.execPath,["server.mjs"],{cwd:root,
      env:{...process.env,PORT:new URL(address).port,HOST:"127.0.0.1",SALON_DB:database,
        WAHA_BASE_URL:"",WAHA_API_KEY:"",JEV_CONTROL_PLANE_URL:"http://127.0.0.1:1",
        NOVAGENTE_ENABLE_RECEPTIONIST_AI:"false"},stdio:["ignore","pipe","pipe"]});
    children.push(child);
    for(const stream of [child.stdout,child.stderr])stream.on("data",x=>{
      logs.push(String(x));if(logs.length>70)logs.shift();
    });
    for(let n=0;n<120;n++){
      if(child.exitCode!==null)break;
      try{const response=await fetch(address+"/api/auth/state");if(response.ok){servers.push(address);return address}}catch{}
      await sleep(100);
    }
    throw Error("Servidor de concorrência falhou: "+logs.join("").slice(-1600));
  }
  const close=async()=>{
    for(const child of children)if(child.exitCode===null){
      child.kill("SIGTERM");
      await Promise.race([new Promise(ok=>child.once("exit",ok)),sleep(700)]);
      if(child.exitCode===null)child.kill("SIGKILL");
    }
    fs.rmSync(directory,{recursive:true,force:true});
  };
  async function api(server,route,{method="GET",body,cookie,headers={}}={}){
    const h={...headers};if(cookie)h.cookie=cookie;
    const init={method,headers:h};
    if(body!==undefined){init.body=JSON.stringify(body);h["content-type"]="application/json"}
    const response=await fetch(server+route,init);
    const data=await response.json().catch(()=>({}));
    return {status:response.status,data,cookie:response.headers.get("set-cookie")?.split(";")[0]};
  }
  return {runServer,api,close,servers};
}
async function expect(api,server,route,status,options){
  const r=await api(server,route,options);
  assert.equal(r.status,status,route+" "+JSON.stringify(r.data).slice(0,450));
  return r.data;
}
function checkExactlyOnce(results,status,rest){
  assert.equal(results.filter(r=>r.status===status).length,1,
    "esperado exatamente um resultado "+status+": "+JSON.stringify(results.map(r=>[r.status,r.data?.error])));
  assert.equal(results.filter(r=>r.status===rest).length,results.length-1,
    "demais requisições devem retornar "+rest+": "+JSON.stringify(results.map(r=>[r.status,r.data?.error])));
}
function report(data){
  if(process.env.NOVAGENTE_PILOT_REPORT!=="1")return;
  const directory=path.join(root,"artifacts","multiuser");
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,"report.json"),JSON.stringify(data,null,2)+"\n");
  fs.writeFileSync(path.join(directory,"report.md"),[
    "# Concorrência — NOVAGENTE Estética",
    "",
    "**Teste fictício**: duas instâncias locais, SQLite temporário e dois usuários autenticados.",
    "Nenhuma conexão bancária ou WhatsApp real.",
    "",
    "| Cenário | Resultado |",
    "|---|---|",
    "| Cadastro simultâneo com mesmo telefone | "+data.duplicate_client+" |",
    "| Mesmo horário e profissional | "+data.booking_collision+" |",
    "| Checkout simultâneo | "+data.checkout_once+" |",
    "| Ajuste concorrente de estoque | "+data.stock_consistency+" |",
    "| Duas despesas em espécie acima do caixa | "+data.cash_overdraft+" |",
    "| Fechamento do mesmo caixa em paralelo | "+data.cash_close+" |",
    "| Tentativa de acessar relatórios pela recepção | "+data.roles+" |",
    "",
    "Não representa teste de carga sustentada ou homologação para produção."
  ].join("\n")+"\n");
}
test("Etapa 14: dois terminais/servidores e requisições simultâneas preservam caixa, agenda, CRM e estoque",
  {timeout:100000},async()=>{
  const h=await harness();
  try{
    const a=await h.runServer();
    await expect(h.api,a,"/api/auth/setup",201,{method:"POST",body:{
      email:"owner-concurrent@example.invalid",name:"Dona QA",password:"qa-owner-password-1234567"
    }});
    const login=await h.api(a,"/api/auth/login",{method:"POST",body:{
      email:"owner-concurrent@example.invalid",password:"qa-owner-password-1234567"
    }});
    assert.equal(login.status,200);const ownerCookie=login.cookie;
    const owner=(server,route,options={})=>h.api(server,route,{...options,cookie:ownerCookie});
    const invite=await expect(owner,a,"/api/admin/invitations",201,{method:"POST",body:{
      email:"reception-concurrent@example.invalid",name:"Recepção QA",role:"reception"
    }});
    await expect(h.api,a,"/api/auth/invitations/accept",201,{method:"POST",body:{
      token:invite.token,password:"qa-reception-password-1234567"
    }});
    const loginReception=await h.api(a,"/api/auth/login",{method:"POST",body:{
      email:"reception-concurrent@example.invalid",password:"qa-reception-password-1234567"
    }});
    assert.equal(loginReception.status,200);const receptionCookie=loginReception.cookie;
    const reception=(server,route,options={})=>h.api(server,route,{...options,cookie:receptionCookie});
    // Só iniciar segunda instância DEPOIS das migrações e criação inicial do salão.
    const b=await h.runServer();
    assert.equal((await expect(owner,b,"/api/health",200)).mode,"offline_without_whatsapp");
    const boot=await expect(owner,a,"/api/bootstrap",200);
    const professional=boot.professionals[0],service=boot.services[0];
    assert.ok(professional&&service);
    const baseDate=new Date(Date.now()+15*86400000).toISOString().slice(0,10);
    const phone="69900099999",payload={name:"Cliente QA única",phone,source:"simulacao"};
    const clientAttempts=await Promise.all(Array.from({length:14},(_,i)=>
      reception(i%2?a:b,"/api/clients",{method:"POST",body:payload})));
    checkExactlyOnce(clientAttempts,201,409);
    const client=clientAttempts.find(x=>x.status===201).data;
    const allClients=await expect(owner,a,"/api/clients",200);
    assert.equal(allClients.filter(c=>c.phone===phone).length,1);
    assert.equal((await expect(reception,b,"/api/clients",200)).filter(c=>c.phone===phone).length,1);

    const slot=baseDate+"T14:00:00.000Z";
    const appointments=await Promise.all(Array.from({length:16},(_,i)=>
      reception(i%2?a:b,"/api/appointments",{method:"POST",body:{
        client_id:client.id,professional_id:professional.id,service_id:service.id,start_at:slot
      }})));
    checkExactlyOnce(appointments,201,409);
    const appointment=appointments.find(x=>x.status===201).data;
    const schedules=await expect(reception,b,
      "/api/appointments?from="+baseDate+"T00:00:00.000Z&to="+baseDate+"T23:59:59.999Z",200);
    assert.equal(schedules.filter(x=>x.id===appointment.id).length,1);

    const product=await expect(owner,a,"/api/products",201,{method:"POST",body:{
      name:"Produto QA concorrente",unit:"g",stock_qty:150,min_qty:15,avg_cost:0.25
    }});
    await expect(owner,a,"/api/services/"+service.id+"/recipe",200,{method:"PUT",
      body:{items:[{product_id:product.id,qty_standard:10}]}});
    const checkouts=await Promise.all(Array.from({length:14},(_,i)=>
      owner(i%2?a:b,"/api/checkout",{method:"POST",body:{
        appointment_id:appointment.id,payment_method:"pix",
        consumption:[{product_id:product.id,actual_qty:10}]
      }})));
    checkExactlyOnce(checkouts,201,409);
    const afterCheckout=await expect(owner,a,"/api/products",200);
    assert.equal(afterCheckout.find(x=>x.id===product.id).stock_qty,140);
    const income=await expect(owner,b,"/api/finance/entries",200);
    assert.equal(income.filter(x=>x.appointment_id===appointment.id&&x.kind==="income").length,1);
    const commissions=await expect(owner,a,"/api/commissions",200);
    assert.equal(commissions.filter(x=>x.appointment_id===appointment.id).length,1);

    const stockResults=await Promise.all(Array.from({length:40},(_,i)=>owner(i%2?a:b,
      "/api/stock/adjust",{method:"POST",body:{
        product_id:product.id,qty:i<20?1:-1,reason:"Ajuste concorrente controlado QA"
      }})));
    assert.ok(stockResults.every(x=>x.status===200),"todos ajustes válidos: "+
      JSON.stringify(stockResults.filter(x=>x.status!==200).slice(0,4)));
    const stockAfter=await expect(owner,b,"/api/products",200);
    assert.equal(stockAfter.find(x=>x.id===product.id).stock_qty,140);
    const movements=await expect(owner,a,"/api/stock/movements?product_id="+product.id,200);
    assert.equal(movements.filter(x=>x.type==="adjust_in"||x.type==="adjust_out").length,40);
    assert.equal(Math.round(movements.filter(x=>x.type==="adjust_in"||x.type==="adjust_out")
      .reduce((n,x)=>n+Number(x.qty),0)),0);

    const opened=await expect(owner,a,"/api/cash/open",201,{method:"POST",body:{opening:100}});
    assert.equal(opened.status,"open");
    const costs=await Promise.all([a,b].map((server,i)=>owner(server,"/api/finance/entries",{
      method:"POST",body:{kind:"expense",category:"supplies",description:"Compra simultânea QA "+i,
        amount:80,payment_method:"cash",status:"paid"}
    })));
    checkExactlyOnce(costs,201,409);
    const current=await expect(owner,b,"/api/cash/overview",200);
    assert.equal(current.expected,20);
    const final=await Promise.all([a,b].map(server=>owner(server,"/api/cash/close",{
      method:"POST",body:{actual:20}
    })));
    checkExactlyOnce(final,200,409);
    const cash=await expect(owner,a,"/api/cash/overview",200);
    assert.equal(cash.status,"closed");
    const history=await expect(owner,b,"/api/cash/history",200);
    assert.equal(history.length,1);
    assert.equal(history[0].difference,0);
    for(const route of ["/api/finance/entries","/api/commissions","/api/owner-eye/summary"])
      assert.equal((await reception(b,route)).status,403,route);
    const eye=await expect(owner,a,"/api/owner-eye/summary",200);
    assert.equal(eye.operations.completed_services,1);
    assert.ok(eye.money.income>0);
    assert.equal(eye.money.expenses,80);
    const result={synthetic:true,shared_database:true,server_processes:2,
      duplicate_client:"1 criado, 13 recusados",booking_collision:"1 reservado, 15 recusados",
      checkout_once:"1 confirmado, 13 recusados",
      stock_consistency:"40 ajustes aceitos; saldo sem divergência; 40 movimentos",
      cash_overdraft:"1 despesa autorizada, 1 negada; caixa esperado R$ 20",
      cash_close:"1 fechamento aceito, 1 recusado",
      roles:"acesso financeiro/gerencial negado à recepção",production_ready:false};
    report(result);
    console.log("CONCORRENCIA APROVADA:",JSON.stringify(result));
  }finally{await h.close()}
});
