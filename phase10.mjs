import crypto from "node:crypto";

const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const all=(db,s,p=[])=>db.prepare(s).all(...p);
const run=(db,s,p=[])=>db.prepare(s).run(...p);
const txt=(v,n=500)=>String(v??"").trim().slice(0,n);
const cents=v=>Math.round(Number(v||0)*100);
function tx(db,fn){db.exec("BEGIN IMMEDIATE");try{const x=fn();db.exec("COMMIT");return x}catch(e){try{db.exec("ROLLBACK")}catch{}throw e}}

export function installPhase10(db){
  const cols=db.prepare("pragma table_info(products)").all().map(x=>x.name);
  if(!cols.includes("sale_commission_pct"))db.exec("alter table products add column sale_commission_pct REAL NOT NULL DEFAULT 0");
  db.exec([
    "CREATE TABLE IF NOT EXISTS retail_sales(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT,professional_id TEXT,subtotal_cents INTEGER NOT NULL,discount_cents INTEGER NOT NULL DEFAULT 0,total_cents INTEGER NOT NULL,payment_method TEXT NOT NULL,financial_entry_id TEXT,cash_session_id TEXT,created_by TEXT,created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_retail_sales_tenant ON retail_sales(tenant_id,created_at)",
    "CREATE TABLE IF NOT EXISTS retail_sale_items(id TEXT PRIMARY KEY,sale_id TEXT NOT NULL,product_id TEXT NOT NULL,qty REAL NOT NULL,unit_price_cents INTEGER NOT NULL,gross_cents INTEGER NOT NULL,net_cents INTEGER NOT NULL,cost_cents INTEGER NOT NULL,commission_pct REAL NOT NULL DEFAULT 0,commission_cents INTEGER NOT NULL DEFAULT 0)",
    "CREATE INDEX IF NOT EXISTS idx_retail_items_sale ON retail_sale_items(sale_id)",
    "CREATE TABLE IF NOT EXISTS retail_commissions(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,retail_sale_id TEXT NOT NULL,professional_id TEXT NOT NULL,amount_cents INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',paid_at TEXT,created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_retail_commissions ON retail_commissions(tenant_id,professional_id,status,created_at)"
  ].join(";"));
}

function openCash(db,tenant){return one(db,"select id from cash_sessions where tenant_id=? and status='open' order by opened_at desc limit 1",[tenant])||null}
function retailSales(db,tenant,limit=150){
  const sql="select r.*,c.name client_name,p.name professional_name,(select count(*) from retail_sale_items i where i.sale_id=r.id) item_count from retail_sales r left join clients c on c.id=r.client_id left join professionals p on p.id=r.professional_id where r.tenant_id=? order by r.created_at desc limit ?";
  return all(db,sql,[tenant,limit]).map(x=>({...x,subtotal:Number(x.subtotal_cents)/100,discount:Number(x.discount_cents)/100,total:Number(x.total_cents)/100}));
}
function overview(db,tenant){
  const start=new Date();start.setDate(1);start.setHours(0,0,0,0);
  const sql="select count(*) sales,coalesce(sum(total_cents),0) revenue,coalesce(sum((select sum(cost_cents) from retail_sale_items i where i.sale_id=retail_sales.id)),0) cost from retail_sales where tenant_id=? and created_at>=?";
  const r=one(db,sql,[tenant,start.toISOString()])||{};
  const units=one(db,"select coalesce(sum(i.qty),0) n from retail_sale_items i join retail_sales s on s.id=i.sale_id where s.tenant_id=? and s.created_at>=?",[tenant,start.toISOString()])||{};
  const comm=one(db,"select coalesce(sum(amount_cents),0) n from retail_commissions where tenant_id=? and status='pending'",[tenant])||{};
  const revenue=Number(r.revenue||0),cost=Number(r.cost||0);
  return {sales:Number(r.sales||0),revenue:revenue/100,cost:cost/100,gross_margin:(revenue-cost)/100,gross_margin_pct:revenue?((revenue-cost)/revenue)*100:0,units:Number(units.n||0),pending_commissions:Number(comm.n||0)/100};
}
function productsForRetail(db,tenant){
  return all(db,"select id,name,sku,unit,stock_qty,avg_cost_cents,sale_price_cents,sale_commission_pct from products where tenant_id=? and active=1 and sale_price_cents>0 order by name",[tenant]).map(x=>({...x,avg_cost:Number(x.avg_cost_cents||0)/100,sale_price:Number(x.sale_price_cents||0)/100}));
}

export async function handlePhase10Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit}){
  const guard=p=>requirePermission(user,p);
  if(req.method==="GET"&&url.pathname==="/api/retail/overview"){guard("retail.read");return send(res,200,overview(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/retail/products"){guard("retail.read");return send(res,200,productsForRetail(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/retail/sales"){guard("retail.read");return send(res,200,retailSales(db,tenant))}

  const config=url.pathname.match(/^\/api\/products\/([^/]+)\/retail$/);
  if(config&&req.method==="PATCH"){
    guard("retail.manage");const pid=decodeURIComponent(config[1]),p=one(db,"select id from products where id=? and tenant_id=?",[pid,tenant]);
    if(!p)return send(res,404,{error:"product_not_found"});
    const b=await parseBody(req),price=cents(b.sale_price),pct=Math.max(0,Math.min(100,Number(b.sale_commission_pct||0)));
    run(db,"update products set sale_price_cents=?,sale_commission_pct=?,updated_at=? where id=? and tenant_id=?",[price,pct,now(),pid,tenant]);
    audit(db,user,"retail.product.config","product",pid,{sale_price_cents:price,sale_commission_pct:pct});
    return send(res,200,{ok:true,sale_price:price/100,sale_commission_pct:pct});
  }

  if(req.method==="POST"&&url.pathname==="/api/retail/sales"){
    guard("retail.sell");const b=await parseBody(req),items=Array.isArray(b.items)?b.items:[],method=txt(b.payment_method||"pix",32);
    if(!items.length)return send(res,400,{error:"items_required"});
    if(!["pix","credit_card","debit_card","cash","other"].includes(method))return send(res,400,{error:"invalid_payment_method"});
    const clientId=txt(b.client_id,64)||null,professionalId=txt(b.professional_id,64)||null;
    if(clientId&&!one(db,"select id from clients where id=? and tenant_id=?",[clientId,tenant]))return send(res,404,{error:"client_not_found"});
    if(professionalId&&!one(db,"select id from professionals where id=? and tenant_id=? and active=1",[professionalId,tenant]))return send(res,404,{error:"professional_not_found"});

    const prepared=[];let subtotal=0,totalCost=0,totalCommission=0;
    for(const x of items){
      const p=one(db,"select * from products where id=? and tenant_id=? and active=1",[txt(x.product_id,64),tenant]);
      if(!p)return send(res,404,{error:"product_not_found"});
      const qty=Number(x.qty||0);if(!(qty>0))return send(res,400,{error:"invalid_qty"});
      if(Number(p.stock_qty)<qty)return send(res,409,{error:"insufficient_stock",product_id:p.id,available:Number(p.stock_qty)});
      const price=cents(x.unit_price??Number(p.sale_price_cents||0)/100);
      if(price<=0)return send(res,400,{error:"sale_price_required",product_id:p.id});
      const gross=Math.round(qty*price),cost=Math.round(qty*Number(p.avg_cost_cents||0));
      subtotal+=gross;totalCost+=cost;prepared.push({product:p,qty,unit_price_cents:price,gross_cents:gross,cost_cents:cost});
    }

    const discount=Math.max(0,Math.min(subtotal,cents(b.discount||0))),total=subtotal-discount,cash=method==="cash"?openCash(db,tenant):null;
    if(method==="cash"&&!cash)return send(res,409,{error:"cash_session_required"});
    const saleId=uid(),financeId=uid(),ts=now();

    tx(db,()=>{
      let allocatedDiscount=0;
      prepared.forEach((x,idx)=>{
        const disc=idx===prepared.length-1?discount-allocatedDiscount:Math.round(discount*(x.gross_cents/subtotal));allocatedDiscount+=disc;
        const net=Math.max(0,x.gross_cents-disc),commission=professionalId?Math.round(net*Number(x.product.sale_commission_pct||0)/100):0;
        totalCommission+=commission;
        run(db,"insert into retail_sale_items(id,sale_id,product_id,qty,unit_price_cents,gross_cents,net_cents,cost_cents,commission_pct,commission_cents) values(?,?,?,?,?,?,?,?,?,?)",[uid(),saleId,x.product.id,x.qty,x.unit_price_cents,x.gross_cents,net,x.cost_cents,Number(x.product.sale_commission_pct||0),commission]);
        run(db,"update products set stock_qty=stock_qty-?,updated_at=? where id=? and tenant_id=?",[x.qty,ts,x.product.id,tenant]);
        run(db,"insert into stock_movements(id,tenant_id,product_id,type,qty,unit_cost_cents,reason,created_by,created_at) values(?,?,?,?,?,?,?,?,?)",[uid(),tenant,x.product.id,"retail_sale",-x.qty,Number(x.product.avg_cost_cents||0),"Venda de produto "+saleId,user.id,ts]);
      });
      run(db,"insert into financial_entries(id,tenant_id,kind,category,description,amount_cents,payment_method,status,paid_at,cash_session_id,client_id,reference_type,reference_id,created_by,created_at,metadata) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[financeId,tenant,"income","retail","Venda de produtos",total,method,"paid",ts,cash?.id||null,clientId,"retail_sale",saleId,user.id,ts,JSON.stringify({subtotal,discount})]);
      run(db,"insert into retail_sales(id,tenant_id,client_id,professional_id,subtotal_cents,discount_cents,total_cents,payment_method,financial_entry_id,cash_session_id,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?)",[saleId,tenant,clientId,professionalId,subtotal,discount,total,method,financeId,cash?.id||null,user.id,ts]);
      if(professionalId&&totalCommission>0)run(db,"insert into retail_commissions(id,tenant_id,retail_sale_id,professional_id,amount_cents,status,created_at) values(?,?,?,?,?,'pending',?)",[uid(),tenant,saleId,professionalId,totalCommission,ts]);
    });

    audit(db,user,"retail.sale","retail_sale",saleId,{total_cents:total,items:prepared.length,commission_cents:totalCommission});
    return send(res,201,{id:saleId,total:total/100,subtotal:subtotal/100,discount:discount/100,cost:totalCost/100,gross_margin:(total-totalCost-totalCommission)/100,commission:totalCommission/100});
  }

  if(req.method==="GET"&&url.pathname==="/api/retail/commissions"){
    guard("retail.read");
    const sql="select c.*,p.name professional_name from retail_commissions c join professionals p on p.id=c.professional_id where c.tenant_id=? order by c.created_at desc";
    return send(res,200,all(db,sql,[tenant]).map(x=>({...x,amount:Number(x.amount_cents)/100})));
  }

  if(req.method==="POST"&&url.pathname==="/api/retail/commissions/pay"){
    guard("retail.manage");const b=await parseBody(req),ids=Array.isArray(b.ids)?b.ids.map(x=>txt(x,64)):[];
    if(!ids.length)return send(res,400,{error:"ids_required"});
    let paid=0,total=0;
    tx(db,()=>{for(const id of ids){const c=one(db,"select * from retail_commissions where id=? and tenant_id=? and status='pending'",[id,tenant]);if(!c)continue;const ts=now();run(db,"update retail_commissions set status='paid',paid_at=? where id=?",[ts,id]);run(db,"insert into financial_entries(id,tenant_id,kind,category,description,amount_cents,status,paid_at,reference_type,reference_id,created_by,created_at) values(?,?,?,?,?,? ,'paid',?,?,?,?,?)",[uid(),tenant,"expense","commissions","Comissão revenda · "+id,c.amount_cents,ts,"retail_commission",id,user.id,ts]);paid++;total+=Number(c.amount_cents||0)}});
    audit(db,user,"retail.commissions.pay","retail_commission",null,{count:paid,total_cents:total});
    return send(res,200,{paid,total:total/100});
  }
  return false;
}
