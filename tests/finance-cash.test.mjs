import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {cents,validPaymentMethod,cashCloseResult} from "../finance-rules.mjs";
import {installPhase2,handlePhase2Api} from "../phase2.mjs";

test("valores financeiros usam centavos e rejeitam valores inválidos",()=>{
  assert.equal(cents("35.40"),3540);
  assert.equal(cents(0,{allowZero:true}),0);
  for(const value of [-2,"NaN","Infinity","",null,"12.345"]){
    assert.throws(()=>cents(value),/invalid_amount/);
  }
  assert.throws(()=>cents(0),/invalid_amount/);
  assert.equal(validPaymentMethod("cash"),"cash");
  assert.throws(()=>validPaymentMethod("bancario"),/invalid_payment_method/);
});

test("diferença no caixa exige justificativa; dinheiro contado jamais presumido",()=>{
  assert.deepEqual(cashCloseResult(9500,95),{expected_cents:9500,actual_cents:9500,difference_cents:0,notes:""});
  assert.throws(()=>cashCloseResult(9500,94.50,""),/cash_difference_reason_required/);
  assert.deepEqual(cashCloseResult(9500,94.50,"Divergência anotada").difference_cents,-50);
  assert.throws(()=>cashCloseResult(9500,-4),/invalid_amount/);
});
function fixture(){
  const db=new DatabaseSync(":memory:");
  installPhase2(db);
  return db;
}
async function call(db,method,path,body={},tenant="a"){
  return handlePhase2Api({
    db,req:{method},res:{},url:new URL(path,"http://test.local"),user:{id:"owner-a",role:"owner"},tenant,
    parseBody:async()=>body,send:(_res,status,data)=>({status,data}),requirePermission:()=>{},audit:()=>{}
  });
}
test("abertura, sangria e fechamento separam dinheiro físico de despesa",async()=>{
  const db=fixture();
  try{
    const opening=await call(db,"POST","/api/cash/open",{opening:100});
    assert.equal(opening.status,201);
    assert.equal((await call(db,"POST","/api/cash/open",{opening:5})).status,409);
    const pix=await call(db,"POST","/api/finance/entries",{kind:"income",status:"paid",description:"Recebimento no Pix",payment_method:"pix",amount:75});
    assert.equal(pix.status,201);
    const cashIn=await call(db,"POST","/api/finance/entries",{kind:"income",status:"paid",description:"Venda em dinheiro",payment_method:"cash",amount:50});
    assert.equal(cashIn.status,201);
    const cashOut=await call(db,"POST","/api/finance/entries",{kind:"expense",status:"paid",description:"Compra pequena",payment_method:"cash",amount:25});
    assert.equal(cashOut.status,201);
    const start=await call(db,"GET","/api/cash/overview");
    assert.equal(start.data.expected,125);
    assert.equal(start.data.by_method.find(x=>x.payment_method==="pix").total,75);
    const w=await call(db,"POST","/api/cash/withdraw",{amount:30,reason:"Transferência ao cofre"});
    assert.equal(w.status,201);
    assert.equal(w.data.expected,95);
    assert.equal((await call(db,"POST","/api/cash/withdraw",{amount:200,reason:"Transferência ao cofre"})).status,409);
    assert.equal((await call(db,"POST","/api/cash/withdraw",{amount:1,reason:"curto"})).status,400);
    const failed=await call(db,"POST","/api/cash/close",{actual:94});
    assert.equal(failed.status,400);
    assert.equal(failed.data.error,"cash_difference_reason_required");
    const cash=await call(db,"GET","/api/cash/current");
    assert.equal(cash.data.status,"open");
    const closed=await call(db,"POST","/api/cash/close",{actual:94,notes:"Diferença identificada na conferência"});
    assert.equal(closed.status,200);
    assert.equal(closed.data.expected,95);
    assert.equal(closed.data.difference,-1);
    assert.equal((await call(db,"POST","/api/cash/close",{actual:94,notes:"Repetição de fechamento"})).status,409);
    const history=await call(db,"GET","/api/cash/history");
    assert.equal(history.data[0].status,"closed");
    assert.equal(history.data[0].difference,-1);
    assert.equal(db.prepare("select count(*) n from financial_entries").get().n,3);
    assert.equal(db.prepare("select count(*) n from cash_movements").get().n,1);
    assert.equal((await call(db,"GET","/api/cash/overview","", "b")).data.status,"closed");
  }finally{db.close()}
});
test("pendência só recebe baixa com forma escolhida, sem duplicidade",async()=>{
  const db=fixture();
  try{
    const entry=await call(db,"POST","/api/finance/entries",{kind:"expense",description:"Energia elétrica",status:"pending",amount:"189.90"});
    assert.equal(entry.status,201);
    const id=entry.data.id;
    assert.equal((await call(db,"POST","/api/finance/entries/"+id+"/pay",{})).status,400);
    assert.equal((await call(db,"POST","/api/finance/entries/"+id+"/pay",{payment_method:"cash"})).status,409);
    const paid=await call(db,"POST","/api/finance/entries/"+id+"/pay",{payment_method:"pix"});
    assert.equal(paid.status,200);
    assert.equal(paid.data.amount,189.9);
    assert.equal((await call(db,"POST","/api/finance/entries/"+id+"/pay",{payment_method:"pix"})).status,409);
    const again=await call(db,"POST","/api/finance/entries/"+id+"/pay",{payment_method:"pix"},"b");
    assert.equal(again.status,404);
    assert.equal(db.prepare("select count(*) n from financial_entries where status='paid'").get().n,1);
  }finally{db.close()}
});

test("comissões são registradas com método correto, sem caixa negativo ou dupla baixa",async()=>{
  const db=fixture();
  try{
    assert.equal((await call(db,"POST","/api/cash/open",{opening:80})).status,201);
    const sql="insert into commissions(id,tenant_id,appointment_id,professional_id,service_id,gross_cents,pct,amount_cents,status,created_at) values(?,?,?,?,?,?,?,?,?,?)";
    for(const [id,value] of [["com1",6000],["com2",3000]]){
      db.prepare(sql).run(id,"a","ap1","prof1","serv1",20000,30,value,"pending",new Date().toISOString());
    }
    const invalid=await call(db,"POST","/api/commissions/pay",{ids:["com1"],payment_method:""});
    assert.equal(invalid.status,400);
    const tooMuch=await call(db,"POST","/api/commissions/pay",{ids:["com1","com2"],payment_method:"cash"});
    assert.equal(tooMuch.status,409);
    assert.equal(db.prepare("select count(*) n from commissions where status='paid'").get().n,0);
    const first=await call(db,"POST","/api/commissions/pay",{ids:["com1"],payment_method:"cash"});
    assert.equal(first.status,200);
    assert.equal(first.data.total,60);
    assert.equal((await call(db,"GET","/api/cash/overview")).data.expected,20);
    assert.equal((await call(db,"POST","/api/commissions/pay",{ids:["com2"],payment_method:"cash"})).status,409);
    const second=await call(db,"POST","/api/commissions/pay",{ids:["com2"],payment_method:"pix"});
    assert.equal(second.status,200);
    assert.equal((await call(db,"GET","/api/cash/overview")).data.expected,20);
    assert.equal((await call(db,"POST","/api/commissions/pay",{ids:["com1"],payment_method:"pix"})).status,409);
    assert.equal((await call(db,"POST","/api/commissions/pay",{ids:["com1"],payment_method:"pix"},"b")).status,409);
    assert.equal(db.prepare("select count(*) n from financial_entries where category='commissions'").get().n,2);
    assert.equal(db.prepare("select coalesce(sum(amount_cents),0) n from financial_entries where category='commissions' and payment_method='cash'").get().n,6000);
  }finally{db.close()}
});
