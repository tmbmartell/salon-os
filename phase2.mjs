import crypto from "node:crypto";
import {quantity,allocateConsumption} from "./inventory-rules.mjs";
import { afterCheckoutRetention } from "./phase6.mjs";
import { consumePackageCredit, availablePackageCredits } from "./phase8.mjs";

const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const money=v=>Math.round(Number(v||0)*100);
const txt=(v,n=300)=>String(v??"").trim().slice(0,n);
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const all=(db,s,p=[])=>db.prepare(s).all(...p);
const run=(db,s,p=[])=>db.prepare(s).run(...p);
function transaction(db,fn){db.exec("BEGIN IMMEDIATE");try{const x=fn();db.exec("COMMIT");return x}catch(e){try{db.exec("ROLLBACK")}catch{}throw e}}

export function installPhase2(db){
  db.exec([
    "CREATE TABLE IF NOT EXISTS cash_sessions(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,opened_by TEXT NOT NULL,opened_at TEXT NOT NULL,opening_cents INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'open',closed_by TEXT,closed_at TEXT,expected_cents INTEGER,actual_cents INTEGER,difference_cents INTEGER,notes TEXT NOT NULL DEFAULT '')",
    "CREATE INDEX IF NOT EXISTS idx_cash_open ON cash_sessions(tenant_id,status,opened_at)",
    "CREATE TABLE IF NOT EXISTS financial_entries(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,kind TEXT NOT NULL,category TEXT NOT NULL,description TEXT NOT NULL,amount_cents INTEGER NOT NULL,payment_method TEXT,status TEXT NOT NULL DEFAULT 'paid',due_date TEXT,paid_at TEXT,cash_session_id TEXT,appointment_id TEXT,supplier_id TEXT,reference_type TEXT,reference_id TEXT,created_by TEXT,created_at TEXT NOT NULL,metadata TEXT NOT NULL DEFAULT '{}')",
    "CREATE INDEX IF NOT EXISTS idx_finance_date ON financial_entries(tenant_id,created_at)",
    "CREATE TABLE IF NOT EXISTS suppliers(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,contact_name TEXT,phone TEXT,email TEXT,lead_days INTEGER NOT NULL DEFAULT 0,payment_terms TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,sku TEXT,unit TEXT NOT NULL DEFAULT 'ml',stock_qty REAL NOT NULL DEFAULT 0,min_qty REAL NOT NULL DEFAULT 0,ideal_qty REAL NOT NULL DEFAULT 0,avg_cost_cents REAL NOT NULL DEFAULT 0,sale_price_cents INTEGER NOT NULL DEFAULT 0,supplier_id TEXT,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id,name)",
    "CREATE TABLE IF NOT EXISTS stock_movements(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,product_id TEXT NOT NULL,type TEXT NOT NULL,qty REAL NOT NULL,unit_cost_cents REAL NOT NULL DEFAULT 0,appointment_id TEXT,reason TEXT NOT NULL DEFAULT '',created_by TEXT,created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS service_recipes(tenant_id TEXT NOT NULL,service_id TEXT NOT NULL,product_id TEXT NOT NULL,qty_standard REAL NOT NULL,PRIMARY KEY(tenant_id,service_id,product_id))",
    "CREATE TABLE IF NOT EXISTS commissions(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,appointment_id TEXT NOT NULL,professional_id TEXT NOT NULL,service_id TEXT NOT NULL,gross_cents INTEGER NOT NULL,pct REAL NOT NULL,amount_cents INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',paid_at TEXT,created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS checkout_records(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,appointment_id TEXT NOT NULL UNIQUE,subtotal_cents INTEGER NOT NULL,discount_cents INTEGER NOT NULL DEFAULT 0,total_cents INTEGER NOT NULL,payment_method TEXT NOT NULL,cash_session_id TEXT,financial_entry_id TEXT,commission_id TEXT,created_by TEXT,created_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS appointment_consumption(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,appointment_id TEXT NOT NULL,client_id TEXT NOT NULL,service_id TEXT NOT NULL,product_id TEXT NOT NULL,standard_qty REAL NOT NULL DEFAULT 0,actual_qty REAL NOT NULL,unit_cost_cents REAL NOT NULL DEFAULT 0,variance_qty REAL NOT NULL DEFAULT 0,created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_consumption_client ON appointment_consumption(tenant_id,client_id,product_id,created_at)",
    "CREATE TABLE IF NOT EXISTS purchases(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,supplier_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'draft',ordered_at TEXT,expected_at TEXT,received_at TEXT,total_cents INTEGER NOT NULL DEFAULT 0,notes TEXT NOT NULL DEFAULT '',created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS purchase_items(id TEXT PRIMARY KEY,purchase_id TEXT NOT NULL,product_id TEXT NOT NULL,qty REAL NOT NULL,unit_cost_cents REAL NOT NULL,total_cents INTEGER NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_purchases_tenant ON purchases(tenant_id,status,created_at)"
  ].join(";"));
  const purchaseCols=db.prepare("pragma table_info(purchase_items)").all().map(x=>x.name);
  if(!purchaseCols.includes("lot_code"))db.exec("alter table purchase_items add column lot_code TEXT");
  if(!purchaseCols.includes("expiry_date"))db.exec("alter table purchase_items add column expiry_date TEXT");
  const movementCols=db.prepare("pragma table_info(stock_movements)").all().map(x=>x.name);
  if(!movementCols.includes("lot_id"))db.exec("alter table stock_movements add column lot_id TEXT");
  const commissionSql=String(db.prepare("select sql from sqlite_master where type='table' and name='commissions'").get()?.sql||"");
  if(/UNIQUE\s*\(tenant_id\s*,\s*appointment_id\)/i.test(commissionSql))db.exec("ALTER TABLE commissions RENAME TO commissions_legacy;CREATE TABLE commissions(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,appointment_id TEXT NOT NULL,professional_id TEXT NOT NULL,service_id TEXT NOT NULL,gross_cents INTEGER NOT NULL,pct REAL NOT NULL,amount_cents INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',paid_at TEXT,created_at TEXT NOT NULL);INSERT INTO commissions SELECT * FROM commissions_legacy;DROP TABLE commissions_legacy;");
  db.exec("CREATE INDEX IF NOT EXISTS idx_commissions_appointment ON commissions(tenant_id,appointment_id)");
  db.exec([
    "CREATE TABLE IF NOT EXISTS product_lots(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,product_id TEXT NOT NULL,supplier_id TEXT,purchase_id TEXT,lot_code TEXT,expiry_date TEXT,qty_received REAL NOT NULL,qty_remaining REAL NOT NULL,unit_cost_cents REAL NOT NULL DEFAULT 0,received_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_product_lots_expiry ON product_lots(tenant_id,product_id,expiry_date,qty_remaining)",
    "CREATE TABLE IF NOT EXISTS supplier_price_history(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,supplier_id TEXT NOT NULL,product_id TEXT NOT NULL,purchase_id TEXT,unit_cost_cents REAL NOT NULL,recorded_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_supplier_price_product ON supplier_price_history(tenant_id,product_id,supplier_id,recorded_at)"
  ].join(";"));
}

function openCash(db,tenant){return one(db,"select * from cash_sessions where tenant_id=? and status='open' order by opened_at desc limit 1",[tenant])||null}
function expectedCash(db,tenant,cashId){
  const c=one(db,"select opening_cents from cash_sessions where id=? and tenant_id=?",[cashId,tenant]);if(!c)return 0;
  const f=one(db,"select coalesce(sum(case when kind='income' then amount_cents else -amount_cents end),0) n from financial_entries where tenant_id=? and cash_session_id=? and status='paid' and payment_method='cash'",[tenant,cashId]);
  return Number(c.opening_cents||0)+Number(f?.n||0);
}
function dashboard(db,tenant){
  const since=new Date();since.setHours(0,0,0,0);
  const r=one(db,"select coalesce(sum(case when kind='income' and status='paid' then amount_cents else 0 end),0) income,coalesce(sum(case when kind='expense' and status='paid' then amount_cents else 0 end),0) expense from financial_entries where tenant_id=? and created_at>=?",[tenant,since.toISOString()])||{};
  const cp=one(db,"select coalesce(sum(amount_cents),0) n,count(*) c from commissions where tenant_id=? and status='pending'",[tenant])||{};
  let rp={n:0,c:0};try{rp=one(db,"select coalesce(sum(amount_cents),0) n,count(*) c from retail_commissions where tenant_id=? and status='pending'",[tenant])||rp}catch{}
  const low=one(db,"select count(*) c from products where tenant_id=? and active=1 and stock_qty<=min_qty",[tenant])||{};
  const pay=one(db,"select coalesce(sum(amount_cents),0) n,count(*) c from financial_entries where tenant_id=? and kind='expense' and status='pending'",[tenant])||{};
  const cash=openCash(db,tenant),commissionTotal=Number(cp.n||0)+Number(rp.n||0),commissionCount=Number(cp.c||0)+Number(rp.c||0);
  return {todayIncome:Number(r.income||0)/100,todayExpense:Number(r.expense||0)/100,todayNet:(Number(r.income||0)-Number(r.expense||0))/100,pendingCommissions:commissionTotal/100,pendingCommissionsCount:commissionCount,accountsPayable:Number(pay.n||0)/100,accountsPayableCount:Number(pay.c||0),lowStockCount:Number(low.c||0),cash:cash?{...cash,expected:expectedCash(db,tenant,cash.id)/100}:null};
}
function products(db,tenant){
  return all(db,"select p.*,s.name supplier_name from products p left join suppliers s on s.id=p.supplier_id where p.tenant_id=? order by p.active desc,p.name",[tenant]).map(p=>({...p,avg_cost:Number(p.avg_cost_cents||0)/100,sale_price:Number(p.sale_price_cents||0)/100,low_stock:Number(p.stock_qty)<=Number(p.min_qty)}));
}
function suppliers(db,tenant){return all(db,"select * from suppliers where tenant_id=? order by active desc,name",[tenant])}
function commissions(db,tenant){
  const service=all(db,"select c.*,p.name professional_name,s.name service_name,cl.name client_name from commissions c join professionals p on p.id=c.professional_id join services s on s.id=c.service_id join appointments a on a.id=c.appointment_id join clients cl on cl.id=a.client_id where c.tenant_id=?",[tenant]).map(x=>({...x,commission_type:"service",amount:Number(x.amount_cents)/100,gross:Number(x.gross_cents)/100}));
  let retail=[];try{retail=all(db,"select c.*,p.name professional_name,'Revenda de produtos' service_name,coalesce(cl.name,'Venda balcão') client_name,rs.total_cents gross_cents from retail_commissions c join professionals p on p.id=c.professional_id join retail_sales rs on rs.id=c.retail_sale_id left join clients cl on cl.id=rs.client_id where c.tenant_id=?",[tenant]).map(x=>({...x,commission_type:"retail",amount:Number(x.amount_cents)/100,gross:Number(x.gross_cents)/100}))}catch{}
  return [...service,...retail].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
}
function serviceCosts(db,tenant){
  return all(db,"select * from services where tenant_id=? and active=1 order by category,name",[tenant]).map(s=>{
    const recipe=all(db,"select r.qty_standard,p.name,p.unit,p.avg_cost_cents from service_recipes r join products p on p.id=r.product_id where r.tenant_id=? and r.service_id=?",[tenant,s.id]);
    const productCost=recipe.reduce((n,x)=>n+Number(x.qty_standard)*Number(x.avg_cost_cents||0),0);
    const commission=Math.round(Number(s.price_cents||0)*Number(s.commission_pct||0)/100);
    const direct=productCost+commission;
    return {service_id:s.id,service_name:s.name,price:Number(s.price_cents||0)/100,product_cost:productCost/100,commission:commission/100,direct_cost:direct/100,gross_margin:(Number(s.price_cents||0)-direct)/100,gross_margin_pct:Number(s.price_cents)>0?(Number(s.price_cents)-direct)/Number(s.price_cents)*100:0};
  });
}

function consumeLots(db,tenant,productId,qty){
  let remaining=Math.max(0,Number(qty||0)),allocations=[];
  const lots=all(db,"select * from product_lots where tenant_id=? and product_id=? and qty_remaining>0 order by case when expiry_date is null or expiry_date='' then 1 else 0 end,expiry_date asc,received_at asc",[tenant,productId]);
  for(const lot of lots){
    if(remaining<=0)break;
    const take=Math.min(remaining,Number(lot.qty_remaining||0));
    if(!(take>0))continue;
    run(db,"update product_lots set qty_remaining=? where id=?",[Number(lot.qty_remaining)-take,lot.id]);
    allocations.push({lot_id:lot.id,lot_code:lot.lot_code||null,expiry_date:lot.expiry_date||null,qty:take});
    remaining-=take;
  }
  return {allocations,unallocated:Math.max(0,remaining)};
}
function stockLots(db,tenant){
  const rows=all(db,"select l.*,p.name product_name,p.unit,s.name supplier_name from product_lots l join products p on p.id=l.product_id left join suppliers s on s.id=l.supplier_id where l.tenant_id=? and l.qty_remaining>0 order by case when l.expiry_date is null or l.expiry_date='' then 1 else 0 end,l.expiry_date asc,l.received_at desc",[tenant]);
  const today=new Date();today.setHours(0,0,0,0);
  return rows.map(x=>{
    let days_to_expiry=null,status="no_expiry";
    if(x.expiry_date){
      const d=new Date(x.expiry_date+"T12:00:00Z"),diff=Math.ceil((d-today)/86400000);
      days_to_expiry=diff;status=diff<0?"expired":diff<=30?"soon":"ok";
    }
    return {...x,unit_cost:Number(x.unit_cost_cents||0)/100,days_to_expiry,expiry_status:status};
  });
}
function supplierPriceHistory(db,tenant){
  const rows=all(db,"select h.*,s.name supplier_name,p.name product_name,p.unit from supplier_price_history h join suppliers s on s.id=h.supplier_id join products p on p.id=h.product_id where h.tenant_id=? order by h.recorded_at desc limit 200",[tenant]);
  return rows.map((x,i)=>{
    const older=rows.slice(i+1).find(y=>y.supplier_id===x.supplier_id&&y.product_id===x.product_id);
    const current=Number(x.unit_cost_cents||0)/100,previous=older?Number(older.unit_cost_cents||0)/100:null;
    const change=previous&&previous!==0?((current-previous)/previous)*100:null;
    return {...x,unit_cost:current,previous_unit_cost:previous,change_pct:change};
  });
}

function plannedConsumption(db,tenant,items,submitted=[],{checkStock=true}={}){
  const rows=[];
  items.forEach((item,itemIndex)=>{
    const recipe=all(db,"select r.product_id,r.qty_standard,p.name product_name,p.unit,p.stock_qty,p.avg_cost_cents from service_recipes r join products p on p.id=r.product_id and p.tenant_id=r.tenant_id where r.tenant_id=? and r.service_id=?",[tenant,item.service_id]);
    for(const row of recipe)rows.push({...row,item_index:itemIndex,service_id:item.service_id,
      standard_qty:quantity(Number(row.qty_standard)*Math.max(1,Number(item.qty||1)),row.unit,{zero:false})});
  });
  const allocated=allocateConsumption(rows,submitted);
  const totals=new Map();
  for(const line of allocated)totals.set(line.product_id,(totals.get(line.product_id)||0)+line.actual_qty);
  for(const [productId,total] of totals){
    const product=rows.find(x=>x.product_id===productId);
    if(checkStock&&total>Number(product.stock_qty)+0.000001)
      throw Object.assign(new Error("insufficient_stock"),{status:409,product_id:productId,product_name:product.product_name});
  }
  return allocated;
}
function consumePlanned(db,tenant,a,userId,lines){
  const used=[];
  for(const x of lines){
    const actual=x.actual_qty,standard=x.standard_qty,variance=x.variance_qty;
    if(actual>0){
      const updated=run(db,"update products set stock_qty=round(stock_qty-?,3),updated_at=? where id=? and tenant_id=? and stock_qty>=?",[actual,now(),x.product_id,tenant,actual-0.000001]);
      if(!updated.changes)throw Object.assign(new Error("insufficient_stock"),{status:409,product_id:x.product_id});
    }
    const lotUse=actual>0?consumeLots(db,tenant,x.product_id,actual):{allocations:[],unallocated:0};
    const lotId=lotUse.allocations.length===1?lotUse.allocations[0].lot_id:null;
    const lotNote=lotUse.allocations.length?" · lote(s) "+lotUse.allocations.map(z=>z.lot_code||z.lot_id.slice(0,8)).join(", "):"";
    if(actual>0)run(db,"insert into stock_movements(id,tenant_id,product_id,type,qty,unit_cost_cents,appointment_id,reason,created_by,created_at,lot_id) values(?,?,?,?,?,?,?,?,?,?,?)",[uid(),tenant,x.product_id,"consumption",-actual,Number(x.avg_cost_cents||0),a.id,(Math.abs(variance)<0.0001?"Consumo padrão do serviço":"Consumo real informado")+lotNote,userId,now(),lotId]);
    run(db,"insert into appointment_consumption(id,tenant_id,appointment_id,client_id,service_id,product_id,standard_qty,actual_qty,unit_cost_cents,variance_qty,created_at) values(?,?,?,?,?,?,?,?,?,?,?)",[uid(),tenant,a.id,a.client_id,x.service_id,x.product_id,standard,actual,Number(x.avg_cost_cents||0),variance,now()]);
    used.push({product_id:x.product_id,product_name:x.product_name,service_id:x.service_id,unit:x.unit,standard_qty:standard,actual_qty:actual,variance_qty:variance,lots:lotUse.allocations,unallocated_qty:lotUse.unallocated});
  }
  return used;
}
function appointmentCheckoutItems(db,tenant,a){
  const items=all(db,"select ai.*,s.name service_name,s.commission_pct,p.name professional_name from appointment_items ai join services s on s.id=ai.service_id join professionals p on p.id=ai.professional_id where ai.tenant_id=? and ai.appointment_id=? order by ai.sequence",[tenant,a.id]);
  if(items.length)return items;
  return [{service_id:a.service_id,professional_id:a.professional_id,qty:1,unit_price_cents:Number(a.price_cents||0),duration_min:Number(a.duration_min||60),sequence:0,service_name:a.service_name,commission_pct:Number(a.commission_pct||0)}];
}

function checkout(db,tenant,user,b){
  const a=one(db,"select a.*,s.price_cents,s.commission_pct,s.duration_min,s.name service_name,c.name client_name from appointments a join services s on s.id=a.service_id and s.tenant_id=a.tenant_id join clients c on c.id=a.client_id and c.tenant_id=a.tenant_id where a.id=? and a.tenant_id=?",[txt(b.appointment_id,64),tenant]);if(!a){const e=new Error("appointment_not_found");e.status=404;throw e}
  if(["cancelled","no_show"].includes(a.status))throw Object.assign(new Error("appointment_not_billable"),{status:409});
  if(one(db,"select id from checkout_records where tenant_id=? and appointment_id=?",[tenant,a.id])){const e=new Error("appointment_already_checked_out");e.status=409;throw e}
  const items=appointmentCheckoutItems(db,tenant,a),subtotal=items.reduce((sum,x)=>sum+Number(x.unit_price_cents||0)*Math.max(1,Number(x.qty||1)),0),method=txt(b.payment_method||"pix",32),discount=method==="package"?0:Math.min(subtotal,Math.max(0,money(b.discount||0)));
  if(!["pix","credit_card","debit_card","cash","voucher","package","other"].includes(method)){const e=new Error("invalid_payment_method");e.status=400;throw e}
  if(method==="package"&&(items.length>1||Number(items[0]?.qty||1)!==1)){const e=new Error("package_multi_service_not_supported");e.status=409;throw e}
  const cash=openCash(db,tenant);if(method==="cash"&&!cash){const e=new Error("cash_session_required");e.status=409;throw e}
  return transaction(db,()=>{
    const stockPlan=plannedConsumption(db,tenant,items,b.consumption||[]);
    let packageUse=null,total=Math.max(0,subtotal-discount),financialId=null;
    if(method==="package"){packageUse=consumePackageCredit(db,tenant,a.client_id,items[0].service_id,txt(b.client_package_id,64)||null);total=Number(packageUse.allocated_unit_cents||0)}
    const checkoutId=uid(),description=items.map(x=>x.service_name+(Number(x.qty||1)>1?" ×"+x.qty:"")).join(" + ");
    if(method!=="package"){
      financialId=uid();
      run(db,"insert into financial_entries(id,tenant_id,kind,category,description,amount_cents,payment_method,status,paid_at,cash_session_id,appointment_id,client_id,reference_type,reference_id,created_by,created_at,metadata) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[financialId,tenant,"income","services",description+" · "+a.client_name,total,method,"paid",now(),cash?.id||null,a.id,a.client_id,"appointment",a.id,user.id,now(),JSON.stringify({subtotal,discount,item_count:items.length})]);
    }
    const commissionIds=[],consumption=[];let commissionTotal=0,allocated=0;
    for(let i=0;i<items.length;i++){
      const item=items[i],list=Number(item.unit_price_cents||0)*Math.max(1,Number(item.qty||1));
      const gross=i===items.length-1?Math.max(0,total-allocated):(subtotal>0?Math.round(total*list/subtotal):0);allocated+=gross;
      const pct=Number(item.commission_pct||0),amount=Math.round(gross*pct/100),commissionId=uid();commissionTotal+=amount;commissionIds.push(commissionId);
      run(db,"insert into commissions(id,tenant_id,appointment_id,professional_id,service_id,gross_cents,pct,amount_cents,status,created_at) values(?,?,?,?,?,?,?,?,?,?)",[commissionId,tenant,a.id,item.professional_id,item.service_id,gross,pct,amount,"pending",now()]);
      const used=consumePlanned(db,tenant,a,user.id,stockPlan.filter(x=>x.item_index===i));consumption.push(...used);
    }
    run(db,"update appointments set status='completed',updated_at=? where id=?",[now(),a.id]);
    run(db,"insert into checkout_records(id,tenant_id,appointment_id,subtotal_cents,discount_cents,total_cents,payment_method,cash_session_id,financial_entry_id,commission_id,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",[checkoutId,tenant,a.id,subtotal,discount,total,method,cash?.id||null,financialId,commissionIds[0]||null,user.id,now()]);
    const retention=afterCheckoutRetention(db,tenant,a,user.id,{total_cents:total,checkout_id:checkoutId});
    return {id:checkoutId,total:total/100,list_price:subtotal/100,commission:commissionTotal/100,commissions:commissionIds.length,appointment_id:a.id,payment_method:method,package:packageUse,consumption,retention};
  });
}


function checkoutPrep(db,tenant,appointmentId){
  const a=one(db,"select a.*,c.name client_name,c.id client_id,s.name service_name,s.price_cents,p.name professional_name from appointments a join clients c on c.id=a.client_id and c.tenant_id=a.tenant_id join services s on s.id=a.service_id and s.tenant_id=a.tenant_id join professionals p on p.id=a.professional_id and p.tenant_id=a.tenant_id where a.id=? and a.tenant_id=?",[appointmentId,tenant]);
  if(!a)return null;
  const items=appointmentCheckoutItems(db,tenant,a),subtotal=items.reduce((sum,x)=>sum+Number(x.unit_price_cents||0)*Math.max(1,Number(x.qty||1)),0),packages=items.length===1?availablePackageCredits(db,tenant,a.client_id,items[0].service_id):[];
  const planned=plannedConsumption(db,tenant,items,[],{checkStock:false});
  const grouped=new Map();
  for(const row of planned){
    const existing=grouped.get(row.product_id)||{product_id:row.product_id,product_name:row.product_name,unit:row.unit,stock_qty:row.stock_qty,qty_standard:0,client_avg_qty:null,client_samples:0};
    existing.qty_standard=Math.round((existing.qty_standard+row.standard_qty)*1000)/1000;
    grouped.set(row.product_id,existing);
  }
  const recipe=[...grouped.values()];
  if(items.length===1){
    for(const row of recipe){
      const avg=one(db,"select avg(actual_qty) avg_qty,count(*) n from appointment_consumption where tenant_id=? and client_id=? and service_id=? and product_id=?",[tenant,a.client_id,items[0].service_id,row.product_id])||{};
      if(avg.n){row.client_avg_qty=Math.round(Number(avg.avg_qty)*Math.max(1,Number(items[0].qty||1))*1000)/1000;row.client_samples=Number(avg.n)}
    }
  }
  return {appointment_id:a.id,client_id:a.client_id,client_name:a.client_name,service_id:a.service_id,service_name:items.map(x=>x.service_name+(Number(x.qty||1)>1?" ×"+x.qty:"")).join(" + "),professional_name:[...new Set(items.map(x=>x.professional_name||a.professional_name))].join(", "),price:subtotal/100,recipe,packages,items};
}
function clientConsumption(db,tenant,clientId){
  return all(db,"select ac.product_id,p.name product_name,p.unit,ac.service_id,s.name service_name,avg(ac.actual_qty) avg_qty,avg(ac.standard_qty) avg_standard,sum(ac.actual_qty) total_qty,count(*) samples,max(ac.created_at) last_used_at from appointment_consumption ac join products p on p.id=ac.product_id join services s on s.id=ac.service_id where ac.tenant_id=? and ac.client_id=? group by ac.product_id,ac.service_id order by samples desc,product_name",[tenant,clientId]).map(x=>({...x,avg_qty:Number(x.avg_qty||0),avg_standard:Number(x.avg_standard||0),total_qty:Number(x.total_qty||0),samples:Number(x.samples||0)}));
}
function purchaseSuggestions(db,tenant){
  return all(db,"select p.*,s.name supplier_name,s.lead_days from products p left join suppliers s on s.id=p.supplier_id where p.tenant_id=? and p.active=1 and p.stock_qty<=p.min_qty order by (p.min_qty-p.stock_qty) desc,p.name",[tenant]).map(p=>{
    const avgDaily=one(db,"select abs(coalesce(sum(qty),0))/30 avg_daily from stock_movements where tenant_id=? and product_id=? and type='consumption' and created_at>=datetime('now','-30 day')",[tenant,p.id])?.avg_daily||0;
    const suggested=Math.max(0,Number(p.ideal_qty||p.min_qty)-Number(p.stock_qty||0));
    const daysLeft=Number(avgDaily)>0?Math.max(0,Number(p.stock_qty||0)/Number(avgDaily)):null;
    return {product_id:p.id,product_name:p.name,unit:p.unit,stock_qty:Number(p.stock_qty),min_qty:Number(p.min_qty),ideal_qty:Number(p.ideal_qty),suggested_qty:suggested,supplier_id:p.supplier_id,supplier_name:p.supplier_name,lead_days:Number(p.lead_days||0),avg_daily:Number(avgDaily),days_left:daysLeft};
  });
}
function purchases(db,tenant){
  return all(db,"select p.*,s.name supplier_name,(select count(*) from purchase_items i where i.purchase_id=p.id) item_count from purchases p join suppliers s on s.id=p.supplier_id where p.tenant_id=? order by p.created_at desc",[tenant]).map(x=>({...x,total:Number(x.total_cents||0)/100}));
}
function dre(db,tenant,month){
  const m=/^\d{4}-\d{2}$/.test(month||"")?month:new Date().toISOString().slice(0,7),start=m+"-01T00:00:00.000Z";
  const d=new Date(start);d.setUTCMonth(d.getUTCMonth()+1);const end=d.toISOString();
  const rows=all(db,"select kind,category,sum(amount_cents) total from financial_entries where tenant_id=? and status='paid' and paid_at>=? and paid_at<? group by kind,category order by kind,category",[tenant,start,end]);
  const income=rows.filter(x=>x.kind==="income").reduce((n,x)=>n+Number(x.total||0),0),expense=rows.filter(x=>x.kind==="expense").reduce((n,x)=>n+Number(x.total||0),0);
  return {month:m,income:income/100,expense:expense/100,result:(income-expense)/100,categories:rows.map(x=>({...x,total:Number(x.total||0)/100}))};
}

export async function handlePhase2Api(ctx){
  const {req,res,url,db,user,tenant,send,parseBody,requirePermission,audit}=ctx,guard=p=>requirePermission(user,p);
  if(req.method==="GET"&&url.pathname==="/api/phase2/dashboard"){guard("finance.read");return send(res,200,dashboard(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/cash/current"){guard("cash.read");const c=openCash(db,tenant);return send(res,200,c?{...c,expected:expectedCash(db,tenant,c.id)/100}:null)}
  if(req.method==="POST"&&url.pathname==="/api/cash/open"){guard("cash.write");if(openCash(db,tenant))return send(res,409,{error:"cash_already_open"});const b=await parseBody(req),cid=uid(),opening=money(b.opening||0);run(db,"insert into cash_sessions(id,tenant_id,opened_by,opened_at,opening_cents,status,notes) values(?,?,?,?,?,'open',?)",[cid,tenant,user.id,now(),opening,txt(b.notes,500)]);audit(db,user,"cash.open","cash_session",cid,{opening_cents:opening});return send(res,201,{id:cid,opening:opening/100,status:"open"})}
  if(req.method==="POST"&&url.pathname==="/api/cash/close"){guard("cash.write");const c=openCash(db,tenant);if(!c)return send(res,409,{error:"cash_not_open"});const b=await parseBody(req),actual=money(b.actual||0),expected=expectedCash(db,tenant,c.id),difference=actual-expected;run(db,"update cash_sessions set status='closed',closed_by=?,closed_at=?,expected_cents=?,actual_cents=?,difference_cents=?,notes=? where id=?",[user.id,now(),expected,actual,difference,txt(b.notes||c.notes,500),c.id]);audit(db,user,"cash.close","cash_session",c.id,{expected,actual,difference});return send(res,200,{status:"closed",expected:expected/100,actual:actual/100,difference:difference/100})}
  if(req.method==="GET"&&url.pathname==="/api/finance/entries"){guard("finance.read");return send(res,200,all(db,"select * from financial_entries where tenant_id=? order by created_at desc limit 300",[tenant]).map(x=>({...x,amount:Number(x.amount_cents)/100})))}
  if(req.method==="POST"&&url.pathname==="/api/finance/entries"){guard("finance.write");const b=await parseBody(req),kind=txt(b.kind,20),status=txt(b.status||"paid",20),amount=money(b.amount);if(!["income","expense"].includes(kind)||!["paid","pending"].includes(status)||amount<=0)return send(res,400,{error:"invalid_finance_entry"});const cash=openCash(db,tenant),method=txt(b.payment_method||"",32);if(status==="paid"&&method==="cash"&&!cash)return send(res,409,{error:"cash_session_required"});const fid=uid();run(db,"insert into financial_entries(id,tenant_id,kind,category,description,amount_cents,payment_method,status,due_date,paid_at,cash_session_id,supplier_id,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[fid,tenant,kind,txt(b.category||"other",80),txt(b.description,240),amount,method||null,status,txt(b.due_date,10)||null,status==="paid"?now():null,status==="paid"?cash?.id||null:null,txt(b.supplier_id,64)||null,user.id,now()]);audit(db,user,"finance.entry.create","financial_entry",fid,{kind,status,amount});return send(res,201,{id:fid,amount:amount/100,status})}
  if(req.method==="GET"&&url.pathname==="/api/suppliers"){guard("suppliers.read");return send(res,200,suppliers(db,tenant))}
  if(req.method==="POST"&&url.pathname==="/api/suppliers"){guard("suppliers.write");const b=await parseBody(req),name=txt(b.name,120);if(!name)return send(res,400,{error:"name_required"});const sid=uid();run(db,"insert into suppliers(id,tenant_id,name,contact_name,phone,email,lead_days,payment_terms,notes,active,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,1,?,?)",[sid,tenant,name,txt(b.contact_name,120),txt(b.phone,40),txt(b.email,160),Math.max(0,Number(b.lead_days||0)),txt(b.payment_terms,200),txt(b.notes,500),now(),now()]);audit(db,user,"supplier.create","supplier",sid,{});return send(res,201,one(db,"select * from suppliers where id=?",[sid]))}
  if(req.method==="GET"&&url.pathname==="/api/products"){guard("inventory.read");return send(res,200,products(db,tenant))}
  if(req.method==="POST"&&url.pathname==="/api/products"){
    guard("inventory.write");
    const b=await parseBody(req),name=txt(b.name,140),unit=txt(b.unit||"ml",20).toLowerCase();
    if(!name)return send(res,400,{error:"name_required"});
    if(!["g","kg","ml","l","un"].includes(unit))return send(res,400,{error:"invalid_unit"});
    const supplierId=txt(b.supplier_id,64)||null;
    if(supplierId&&!one(db,"select id from suppliers where id=? and tenant_id=?",[supplierId,tenant]))return send(res,400,{error:"invalid_supplier"});
    let stock,min,ideal;
    try{
      stock=quantity(b.stock_qty??0,unit);
      min=quantity(b.min_qty??0,unit);
      ideal=quantity(b.ideal_qty??0,unit);
    }catch(e){return send(res,e.status||400,{error:e.message})}
    const pid=uid();
    run(db,"insert into products(id,tenant_id,name,sku,unit,stock_qty,min_qty,ideal_qty,avg_cost_cents,sale_price_cents,sale_commission_pct,supplier_id,active,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
      [pid,tenant,name,txt(b.sku,80),unit,stock,min,ideal,money(b.avg_cost||0),money(b.sale_price||0),Math.max(0,Math.min(100,Number(b.sale_commission_pct||0))),supplierId,now(),now()]);
    audit(db,user,"product.create","product",pid,{unit,stock_qty:stock});
    return send(res,201,products(db,tenant).find(x=>x.id===pid));
  }
  if(req.method==="GET"&&url.pathname==="/api/stock/movements"){guard("inventory.read");const pid=txt(url.searchParams.get("product_id")||"",64);const rows=pid?all(db,"select m.*,p.name product_name,p.unit from stock_movements m join products p on p.id=m.product_id where m.tenant_id=? and m.product_id=? order by m.created_at desc limit 300",[tenant,pid]):all(db,"select m.*,p.name product_name,p.unit from stock_movements m join products p on p.id=m.product_id where m.tenant_id=? order by m.created_at desc limit 300",[tenant]);return send(res,200,rows.map(x=>({...x,unit_cost:Number(x.unit_cost_cents||0)/100})))}
  if(req.method==="POST"&&url.pathname==="/api/stock/adjust"){
    guard("inventory.write");
    const b=await parseBody(req),pid=txt(b.product_id,64);
    const p=one(db,"select * from products where id=? and tenant_id=?",[pid,tenant]);
    if(!p)return send(res,404,{error:"product_not_found"});
    const reason=txt(b.reason,200);
    if(!reason)return send(res,400,{error:"reason_required"});
    let q;
    try{q=quantity(b.qty,p.unit,{zero:false,signed:true})}
    catch(e){return send(res,e.status||400,{error:e.message})}
    const next=Math.round((Number(p.stock_qty)+q)*1000)/1000;
    if(next<0)return send(res,409,{error:"insufficient_stock"});
    transaction(db,()=>{
      run(db,"update products set stock_qty=?,updated_at=? where id=? and tenant_id=?",[next,now(),pid,tenant]);
      if(q<0)consumeLots(db,tenant,pid,-q);
      run(db,"insert into stock_movements(id,tenant_id,product_id,type,qty,unit_cost_cents,reason,created_by,created_at) values(?,?,?,?,?,?,?,?,?)",
        [uid(),tenant,pid,q>0?"adjust_in":"adjust_out",q,Number(p.avg_cost_cents||0),reason,user.id,now()]);
    });
    audit(db,user,"stock.adjust","product",pid,{qty:q,next,reason});
    return send(res,200,{stock_qty:next});
  }
  const recipe=url.pathname.match(/^\/api\/services\/([^/]+)\/recipe$/);
  if(recipe&&req.method==="GET"){guard("inventory.read");return send(res,200,all(db,"select r.*,p.name product_name,p.unit,p.avg_cost_cents from service_recipes r join products p on p.id=r.product_id where r.tenant_id=? and r.service_id=?",[tenant,decodeURIComponent(recipe[1])]))}
  if(recipe&&req.method==="PUT"){
    guard("inventory.write");
    const sid=decodeURIComponent(recipe[1]),service=one(db,"select id from services where id=? and tenant_id=?",[sid,tenant]);
    if(!service)return send(res,404,{error:"service_not_found"});
    const b=await parseBody(req),items=b.items;
    if(!Array.isArray(items)||items.length>50)return send(res,400,{error:"invalid_recipe"});
    const chosen=new Set(),normalized=[];
    try{
      for(const x of items){
        const pid=txt(x.product_id,64),product=one(db,"select id,unit from products where id=? and tenant_id=? and active=1",[pid,tenant]);
        if(!product||chosen.has(pid))throw Object.assign(new Error("invalid_recipe_product"),{status:400});
        chosen.add(pid);
        normalized.push({product_id:pid,qty:quantity(x.qty_standard,product.unit,{zero:false})});
      }
    }catch(e){return send(res,e.status||400,{error:e.message})}
    transaction(db,()=>{
      run(db,"delete from service_recipes where tenant_id=? and service_id=?",[tenant,sid]);
      for(const x of normalized)run(db,"insert into service_recipes(tenant_id,service_id,product_id,qty_standard) values(?,?,?,?)",[tenant,sid,x.product_id,x.qty]);
    });
    audit(db,user,"service.recipe.update","service",sid,{items:normalized.length});
    return send(res,200,{ok:true,items:normalized.length});
  }
  if(req.method==="GET"&&url.pathname==="/api/services/costs"){guard("finance.read");return send(res,200,serviceCosts(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/commissions"){guard("commissions.read");return send(res,200,commissions(db,tenant))}
  if(req.method==="POST"&&url.pathname==="/api/commissions/pay"){
    guard("commissions.write");const b=await parseBody(req),ids=Array.isArray(b.ids)?b.ids.map(x=>txt(x,64)).filter(Boolean):[];if(!ids.length)return send(res,400,{error:"ids_required"});
    let count=0,total=0;
    transaction(db,()=>{for(const cid of ids){
      let c=one(db,"select * from commissions where id=? and tenant_id=? and status='pending'",[cid,tenant]),type="service";
      if(!c){try{c=one(db,"select * from retail_commissions where id=? and tenant_id=? and status='pending'",[cid,tenant]);type="retail"}catch{}}
      if(!c)continue;
      if(type==="service")run(db,"update commissions set status='paid',paid_at=? where id=?",[now(),cid]);
      else run(db,"update retail_commissions set status='paid',paid_at=? where id=?",[now(),cid]);
      run(db,"insert into financial_entries(id,tenant_id,kind,category,description,amount_cents,status,paid_at,reference_type,reference_id,created_by,created_at) values(?,?,?,?,?,?,'paid',?,?,?,?,?)",[uid(),tenant,"expense","commissions",(type==="retail"?"Comissão revenda · ":"Comissão serviço · ")+cid,c.amount_cents,now(),type==="retail"?"retail_commission":"commission",cid,user.id,now()]);
      count++;total+=Number(c.amount_cents);
    }});
    audit(db,user,"commissions.pay","commission",null,{count,total});return send(res,200,{count,total:total/100});
  }

  const pay=url.pathname.match(/^\/api\/finance\/entries\/([^/]+)\/pay$/);
  if(req.method==="POST"&&pay){
    guard("finance.write");const fid=decodeURIComponent(pay[1]),entry=one(db,"select * from financial_entries where id=? and tenant_id=?",[fid,tenant]);if(!entry)return send(res,404,{error:"not_found"});if(entry.status==="paid")return send(res,409,{error:"already_paid"});
    const b=await parseBody(req),method=txt(b.payment_method||entry.payment_method||"pix",32),cash=openCash(db,tenant);if(method==="cash"&&!cash)return send(res,409,{error:"cash_session_required"});
    run(db,"update financial_entries set status='paid',payment_method=?,paid_at=?,cash_session_id=? where id=?",[method,now(),cash?.id||null,fid]);audit(db,user,"finance.entry.pay","financial_entry",fid,{payment_method:method});return send(res,200,{ok:true})
  }

  const prep=url.pathname.match(/^\/api\/checkout\/([^/]+)\/prep$/);
  if(req.method==="GET"&&prep){guard("checkout.write");const data=checkoutPrep(db,tenant,decodeURIComponent(prep[1]));return data?send(res,200,data):send(res,404,{error:"appointment_not_found"})}
  const cc=url.pathname.match(/^\/api\/clients\/([^/]+)\/consumption$/);
  if(req.method==="GET"&&cc){guard("inventory.read");return send(res,200,clientConsumption(db,tenant,decodeURIComponent(cc[1])))}

  if(req.method==="GET"&&url.pathname==="/api/stock/lots"){guard("inventory.read");return send(res,200,stockLots(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/suppliers/price-history"){guard("suppliers.read");return send(res,200,supplierPriceHistory(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/purchases/suggestions"){guard("inventory.read");return send(res,200,purchaseSuggestions(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/purchases"){guard("suppliers.read");return send(res,200,purchases(db,tenant))}
  if(req.method==="POST"&&url.pathname==="/api/purchases"){
    guard("suppliers.write");const b=await parseBody(req),supplier=one(db,"select * from suppliers where id=? and tenant_id=?",[txt(b.supplier_id,64),tenant]);if(!supplier)return send(res,404,{error:"supplier_not_found"});
    const items=Array.isArray(b.items)?b.items:[];if(!items.length)return send(res,400,{error:"items_required"});const purchaseId=uid();let total=0;
    try{transaction(db,()=>{for(const x of items){const p=one(db,"select id from products where id=? and tenant_id=?",[txt(x.product_id,64),tenant]);const q=Number(x.qty||0),unit=money(x.unit_cost||0);if(!p||!(q>0)||unit<0)throw Object.assign(new Error("invalid_purchase_item"),{status:400});const line=Math.round(q*unit);total+=line;run(db,"insert into purchase_items(id,purchase_id,product_id,qty,unit_cost_cents,total_cents,lot_code,expiry_date) values(?,?,?,?,?,?,?,?)",[uid(),purchaseId,p.id,q,unit,line,txt(x.lot_code,80)||null,txt(x.expiry_date,10)||null]);run(db,"insert into supplier_price_history(id,tenant_id,supplier_id,product_id,purchase_id,unit_cost_cents,recorded_at) values(?,?,?,?,?,?,?)",[uid(),tenant,supplier.id,p.id,purchaseId,unit,now()])}run(db,"insert into purchases(id,tenant_id,supplier_id,status,ordered_at,expected_at,total_cents,notes,created_by,created_at,updated_at) values(?,?,?,'ordered',?,?,?,?,?,?,?)",[purchaseId,tenant,supplier.id,now(),txt(b.expected_at,10)||null,total,txt(b.notes,500),user.id,now(),now()]);run(db,"insert into financial_entries(id,tenant_id,kind,category,description,amount_cents,status,due_date,supplier_id,reference_type,reference_id,created_by,created_at) values(?,?,?,?,?,?,'pending',?,?,?,?,?,?)",[uid(),tenant,"expense","purchases","Compra · "+supplier.name,total,txt(b.due_date,10)||null,supplier.id,"purchase",purchaseId,user.id,now()])})}catch(e){return send(res,e.status||400,{error:e.message})}
    audit(db,user,"purchase.create","purchase",purchaseId,{total});return send(res,201,{id:purchaseId,total:total/100,status:"ordered"})
  }
  const receive=url.pathname.match(/^\/api\/purchases\/([^/]+)\/receive$/);
  if(req.method==="POST"&&receive){
    guard("inventory.write");const pid=decodeURIComponent(receive[1]),purchase=one(db,"select * from purchases where id=? and tenant_id=?",[pid,tenant]);if(!purchase)return send(res,404,{error:"not_found"});if(purchase.status==="received")return send(res,409,{error:"already_received"});
    const items=all(db,"select * from purchase_items where purchase_id=?",[pid]);transaction(db,()=>{for(const i of items){const p=one(db,"select * from products where id=? and tenant_id=?",[i.product_id,tenant]);if(!p)continue;const oldQty=Number(p.stock_qty||0),inQty=Number(i.qty),oldCost=Number(p.avg_cost_cents||0),newCost=Number(i.unit_cost_cents||0),den=oldQty+inQty,avg=den>0?((oldQty*oldCost)+(inQty*newCost))/den:newCost;run(db,"update products set stock_qty=?,avg_cost_cents=?,updated_at=? where id=?",[oldQty+inQty,avg,now(),p.id]);const lotId=uid();run(db,"insert into product_lots(id,tenant_id,product_id,supplier_id,purchase_id,lot_code,expiry_date,qty_received,qty_remaining,unit_cost_cents,received_at) values(?,?,?,?,?,?,?,?,?,?,?)",[lotId,tenant,p.id,purchase.supplier_id,pid,i.lot_code||null,i.expiry_date||null,inQty,inQty,newCost,now()]);run(db,"insert into stock_movements(id,tenant_id,product_id,type,qty,unit_cost_cents,reason,created_by,created_at,lot_id) values(?,?,?,?,?,?,?,?,?,?)",[uid(),tenant,p.id,"purchase",inQty,newCost,"Recebimento da compra "+pid,user.id,now(),lotId])}run(db,"update purchases set status='received',received_at=?,updated_at=? where id=?",[now(),now(),pid])});audit(db,user,"purchase.receive","purchase",pid,{items:items.length});return send(res,200,{ok:true,status:"received"})
  }

  if(req.method==="GET"&&url.pathname==="/api/reports/dre"){guard("finance.read");return send(res,200,dre(db,tenant,txt(url.searchParams.get("month")||"",7)))}

  if(req.method==="POST"&&url.pathname==="/api/checkout"){guard("checkout.write");const b=await parseBody(req);try{const out=checkout(db,tenant,user,b);audit(db,user,"checkout.create","appointment",out.appointment_id,{total:out.total});return send(res,201,out)}catch(e){return send(res,e.status||400,{error:e.message,product_id:e.product_id||null,product_name:e.product_name||null})}}
  return false;
}
