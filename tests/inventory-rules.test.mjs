import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {quantity,allocateConsumption} from "../inventory-rules.mjs";
import {installPhase2,handlePhase2Api} from "../phase2.mjs";

test("gramas e ml: aceita quantidades decimais precisas, recusa negativas/NaN",()=>{
  assert.equal(quantity("65.125","g"),65.125);
  assert.equal(quantity("12.5","ml"),12.5);
  assert.equal(quantity(0,"g"),0);
  for(const invalid of ["",null,"Infinity","NaN",-1,0.0001]){
    assert.throws(()=>quantity(invalid,"g"),/invalid_stock_quantity/);
  }
  assert.throws(()=>quantity(1.25,"un"),/invalid_stock_quantity/);
  assert.equal(quantity(3,"un"),3);
  assert.equal(quantity(-25,"g",{signed:true}),-25);
});

test("consumo combinado distribui a quantidade real entre serviços sem duplicação",()=>{
  const lines=[
    {item_index:0,service_id:"coloracao",product_id:"tinta",unit:"g",standard_qty:60},
    {item_index:1,service_id:"retoque",product_id:"tinta",unit:"g",standard_qty:40},
    {item_index:1,service_id:"retoque",product_id:"luvas",unit:"un",standard_qty:2}
  ];
  const plan=allocateConsumption(lines,[{product_id:"tinta",actual_qty:125},{product_id:"luvas",actual_qty:1}]);
  const tinta=plan.filter(x=>x.product_id==="tinta");
  assert.equal(tinta.reduce((a,x)=>a+x.actual_qty,0),125);
  assert.deepEqual(tinta.map(x=>x.actual_qty),[75,50]);
  assert.equal(plan.find(x=>x.product_id==="luvas").actual_qty,1);
  assert.throws(()=>allocateConsumption(lines,[{product_id:"outro",actual_qty:2}]),/invalid_consumption_product/);
  assert.throws(()=>allocateConsumption(lines,[{product_id:"tinta",actual_qty:2},{product_id:"tinta",actual_qty:3}]),/invalid_consumption_product/);
  assert.throws(()=>allocateConsumption(lines,[{product_id:"luvas",actual_qty:0.5}]),/invalid_stock_quantity/);
  const zero=allocateConsumption(lines,[{product_id:"tinta",actual_qty:0}]);
  assert.equal(zero.filter(x=>x.product_id==="tinta").reduce((a,x)=>a+x.actual_qty,0),0);
});

test("unidades não se dividem em frações entre vários procedimentos",()=>{
  const result=allocateConsumption([
    {item_index:0,product_id:"luvas",unit:"un",standard_qty:1},
    {item_index:1,product_id:"luvas",unit:"un",standard_qty:1}
  ],[{product_id:"luvas",actual_qty:1}]);
  assert.deepEqual(result.map(x=>x.actual_qty),[1,0]);
});

function dbFixture(){
  const db=new DatabaseSync(":memory:");
  db.exec("create table services(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,category TEXT,active INTEGER NOT NULL DEFAULT 1);");
  installPhase2(db);
  db.prepare("insert into services(id,tenant_id,name,category) values(?,?,?,?)").run("color","sala","Coloração","Cabelo");
  db.prepare("insert into services(id,tenant_id,name,category) values(?,?,?,?)").run("other","outro","Tratamento","Cabelo");
  return db;
}
async function route(db,method,path,body={}){
  return handlePhase2Api({
    db,req:{method},res:{},url:new URL(path,"http://localhost"),user:{id:"owner",role:"owner"},tenant:"sala",
    send:(_res,status,data)=>({status,data}),parseBody:async()=>body,
    requirePermission:()=>{},audit:()=>{}
  });
}

test("cadastrar produto e receita de consumo com unidade correta e isolamento",async()=>{
  const db=dbFixture();
  try{
    const bad=await route(db,"POST","/api/products",{name:"Luvas",unit:"un",stock_qty:1.5});
    assert.equal(bad.status,400);
    const created=await route(db,"POST","/api/products",{name:"Coloração",unit:"g",stock_qty:200,min_qty:30,avg_cost:0.25});
    assert.equal(created.status,201);
    const product=created.data;
    assert.equal(product.stock_qty,200);
    assert.equal(product.unit,"g");
    const missing=await route(db,"PUT","/api/services/other/recipe",{items:[{product_id:product.id,qty_standard:60}]});
    assert.equal(missing.status,404);
    const invalid=await route(db,"PUT","/api/services/color/recipe",{items:[{product_id:"other-tenant",qty_standard:60}]});
    assert.equal(invalid.status,400);
    const saved=await route(db,"PUT","/api/services/color/recipe",{items:[{product_id:product.id,qty_standard:60.25}]});
    assert.equal(saved.status,200);
    const summary=await route(db,"GET","/api/stock/recipes-overview");
    assert.equal(summary.status,200);
    assert.equal(summary.data[0].product_count,1);
    assert.equal(summary.data[0].product_cost,15.0625);
    const invalidAdjust=await route(db,"POST","/api/stock/adjust",{product_id:product.id,qty:-300,reason:"Perda"});
    assert.equal(invalidAdjust.status,409);
    assert.equal(db.prepare("select stock_qty from products where id=?").get(product.id).stock_qty,200);
    const adjust=await route(db,"POST","/api/stock/adjust",{product_id:product.id,qty:-65.25,reason:"Consumo manual com conferência"});
    assert.equal(adjust.status,200);
    assert.equal(adjust.data.stock_qty,134.75);
    assert.equal(db.prepare("select count(*) n from stock_movements where tenant_id='sala'").get().n,1);
  }finally{db.close()}
});
