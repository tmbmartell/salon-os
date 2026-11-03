// R8.1 — lotes: entrada por compra, consumo FEFO, saldo e histórico por lote.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"..");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port=server.address().port;await new Promise(r=>server.close(r));return port;
}
async function start(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"novagente-lotes-"));
  const port=await freePort(),base="http://127.0.0.1:"+port,dbPath=path.join(directory,"qa.sqlite");
  const child=spawn(process.execPath,["server.mjs"],{cwd:root,
    env:{...process.env,PORT:String(port),HOST:"127.0.0.1",SALON_DB:dbPath,
      NOVAGENTE_ENABLE_RECEPTIONIST_AI:"false",JEV_CONTROL_PLANE_URL:"http://127.0.0.1:1"},
    stdio:["ignore","pipe","pipe"]});
  let logs="";
  child.stderr.on("data",c=>{logs=(logs+c.toString()).slice(-6000)});
  child.stdout.on("data",c=>{logs=(logs+c.toString()).slice(-6000)});
  const cleanup=async()=>{
    if(child.exitCode===null){child.kill("SIGTERM");await Promise.race([new Promise(r=>child.once("exit",r)),sleep(1000)])}
    if(child.exitCode===null)child.kill("SIGKILL");
    fs.rmSync(directory,{recursive:true,force:true});
  };
  for(let i=0;i<100;i++){
    if(child.exitCode!==null){await cleanup();throw Error("servidor não subiu: "+logs)}
    try{const r=await fetch(base+"/api/auth/state");if(r.ok)return {base,dbPath,cleanup,logs:()=>logs}}catch{}
    await sleep(120);
  }
  await cleanup();throw Error("timeout: "+logs);
}
function client(base,cookie=""){
  return async function(pathname,{method="GET",body=null}={}){
    const headers={};if(cookie)headers.cookie=cookie;
    const request={method,headers};
    if(body!==null){headers["content-type"]="application/json";request.body=JSON.stringify(body)}
    const response=await fetch(base+pathname,request);
    const type=response.headers.get("content-type")||"";
    const data=type.includes("application/json")?await response.json():await response.text();
    return {status:response.status,headers:response.headers,data};
  };
}
function futureIso(days,hourZ){
  const d=new Date();d.setUTCDate(d.getUTCDate()+days);d.setUTCHours(hourZ,0,0,0);
  return d.toISOString();
}

test("lote: compra gera lotes, consumo segue a validade e o saldo global acompanha",{timeout:120000},async()=>{
  const app=await start();
  try{
    const anon=client(app.base);
    assert.equal((await anon("/api/auth/setup",{method:"POST",body:{email:"owner@qa.invalid",name:"QA",password:"QA-senha-123456789"}})).status,201);
    const login=await anon("/api/auth/login",{method:"POST",body:{email:"owner@qa.invalid",password:"QA-senha-123456789"}});
    const api=client(app.base,login.headers.get("set-cookie")?.split(";")[0]);
    const boot=(await api("/api/bootstrap")).data;
    const professional=boot.professionals[0];

    const supplier=(await api("/api/suppliers",{method:"POST",body:{name:"Fornecedor Lotes QA"}})).data;
    const product=(await api("/api/products",{method:"POST",body:{name:"Óleo de Massagem QA",unit:"ml",stock_qty:0,min_qty:5,ideal_qty:100,avg_cost:0.1}})).data;
    assert.equal(product.stock_qty,0);

    // Duas entradas do mesmo produto, com validades diferentes.
    const purchase=(await api("/api/purchases",{method:"POST",body:{supplier_id:supplier.id,items:[
      {product_id:product.id,qty:10,unit_cost:0.2,lot_code:"LOTE-A",expiry_date:"2026-12-31"},
      {product_id:product.id,qty:10,unit_cost:0.25,lot_code:"LOTE-B",expiry_date:"2027-06-30"}
    ]}})).data;
    const received=await api("/api/purchases/"+purchase.id+"/receive",{method:"POST",body:{}});
    assert.equal(received.status,200,JSON.stringify(received.data));

    let lots=(await api("/api/stock/lots")).data.filter(l=>l.product_id===product.id);
    assert.equal(lots.length,2,"dois lotes do mesmo produto");
    const lotA=lots.find(l=>l.lot_code==="LOTE-A"),lotB=lots.find(l=>l.lot_code==="LOTE-B");
    assert.ok(lotA&&lotB);
    assert.equal(lotA.qty_remaining,10);assert.equal(lotB.qty_remaining,10);
    assert.equal(lots[0].lot_code,"LOTE-A","ordem por validade (FEFO)");
    let prod=(await api("/api/products")).data.find(p=>p.id===product.id);
    assert.equal(prod.stock_qty,20,"saldo global soma as entradas");

    // Serviço com receita de 8 ml por atendimento.
    const service=(await api("/api/services",{method:"POST",body:{name:"Massagem QA",category:"QA",duration_min:30,price:100,commission_pct:10}})).data;
    assert.equal((await api("/api/services/"+service.id+"/recipe",{method:"PUT",body:{items:[{product_id:product.id,qty_standard:8}]}})).status,200);

    const customer=(await api("/api/clients",{method:"POST",body:{name:"Cliente Lotes QA",phone:"69999990031"}})).data;
    const checkout=async qty=>{
      const ap=(await api("/api/appointments",{method:"POST",body:{client_id:customer.id,service_id:service.id,professional_id:professional.id,start_at:futureIso(2+qty%3,13)}})).data;
      const r=await api("/api/checkout",{method:"POST",body:{appointment_id:ap.id,payment_method:"pix",consumption:[{product_id:product.id,actual_qty:qty}]}});
      return {status:r.status,data:r.data};
    };

    // 1º consumo: 8 ml sai inteiro do lote A (validade mais próxima).
    const first=await checkout(8);
    assert.equal(first.status,201,JSON.stringify(first.data));
    lots=(await api("/api/stock/lots")).data.filter(l=>l.product_id===product.id);
    assert.equal(lots.find(l=>l.lot_code==="LOTE-A").qty_remaining,2);
    assert.equal(lots.find(l=>l.lot_code==="LOTE-B").qty_remaining,10);
    prod=(await api("/api/products")).data.find(p=>p.id===product.id);
    assert.equal(prod.stock_qty,12);

    const movements=(await api("/api/stock/movements?product_id="+product.id)).data;
    const consumption=movements.filter(m=>m.type==="consumption");
    assert.equal(consumption.length,1);
    assert.equal(consumption[0].lot_id,lotA.id,"movimento aponta o lote consumido");
    assert.match(consumption[0].reason,/LOTE-A/);

    // 2º consumo: 6 ml cruza A (2) e B (4).
    const second=await checkout(6);
    assert.equal(second.status,201,JSON.stringify(second.data));
    lots=(await api("/api/stock/lots")).data.filter(l=>l.product_id===product.id);
    // Lote esgotado sai da lista de lotes com saldo; o que importa é não ter saldo.
    const afterA=lots.find(l=>l.lot_code==="LOTE-A");
    assert.equal(afterA?afterA.qty_remaining:0,0,"LOTE-A esgotado");
    assert.equal(lots.find(l=>l.lot_code==="LOTE-B").qty_remaining,6);
    prod=(await api("/api/products")).data.find(p=>p.id===product.id);
    assert.equal(prod.stock_qty,6);
    const moves2=(await api("/api/stock/movements?product_id="+product.id)).data.filter(m=>m.type==="consumption");
    assert.equal(moves2.length,2);
    assert.match(moves2[0].reason,/LOTE-A/);
    assert.match(moves2[0].reason,/LOTE-B/);

    // Consumo acima do saldo é bloqueado e não altera nada.
    const over=await checkout(7);
    assert.equal(over.status,409);
    assert.equal(over.data.error,"insufficient_stock");
    prod=(await api("/api/products")).data.find(p=>p.id===product.id);
    assert.equal(prod.stock_qty,6,"tentativa negada não baixa estoque");

    // Produto sem lote continua funcionando (movimento sem lot_id).
    const bulk=(await api("/api/products",{method:"POST",body:{name:"Algodão QA",unit:"g",stock_qty:50,min_qty:5,ideal_qty:100,avg_cost:0.02}})).data;
    const service2=(await api("/api/services",{method:"POST",body:{name:"Limpeza QA",category:"QA",duration_min:30,price:80,commission_pct:10}})).data;
    await api("/api/services/"+service2.id+"/recipe",{method:"PUT",body:{items:[{product_id:bulk.id,qty_standard:5}]}});
    const ap2=(await api("/api/appointments",{method:"POST",body:{client_id:customer.id,service_id:service2.id,professional_id:professional.id,start_at:futureIso(6,13)}})).data;
    const noLot=await api("/api/checkout",{method:"POST",body:{appointment_id:ap2.id,payment_method:"pix",consumption:[{product_id:bulk.id,actual_qty:5}]}});
    assert.equal(noLot.status,201,JSON.stringify(noLot.data));
    const bulkAfter=(await api("/api/products")).data.find(p=>p.id===bulk.id);
    assert.equal(bulkAfter.stock_qty,45);
    const bulkMove=(await api("/api/stock/movements?product_id="+bulk.id)).data.find(m=>m.type==="consumption");
    assert.equal(bulkMove.lot_id,null,"produto sem lote não inventa lote");
  }finally{await app.cleanup()}
});
