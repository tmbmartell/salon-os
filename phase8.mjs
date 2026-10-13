import crypto from "node:crypto";

const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const all=(db,s,p=[])=>db.prepare(s).all(...p);
const run=(db,s,p=[])=>db.prepare(s).run(...p);
const txt=(v,n=800)=>String(v??"").trim().slice(0,n);
const cents=v=>Math.round(Number(v||0)*100);

export function installPhase8(db){
  db.exec([
    "CREATE TABLE IF NOT EXISTS service_packages(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',price_cents INTEGER NOT NULL,validity_days INTEGER NOT NULL DEFAULT 90,active INTEGER NOT NULL DEFAULT 1,created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS package_items(package_id TEXT NOT NULL,service_id TEXT NOT NULL,qty INTEGER NOT NULL,PRIMARY KEY(package_id,service_id))",
    "CREATE TABLE IF NOT EXISTS client_packages(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT NOT NULL,package_id TEXT NOT NULL,purchased_at TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',amount_cents INTEGER NOT NULL,payment_method TEXT NOT NULL,financial_entry_id TEXT,created_by TEXT,created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_client_packages ON client_packages(tenant_id,client_id,status,expires_at)",
    "CREATE TABLE IF NOT EXISTS client_package_credits(id TEXT PRIMARY KEY,client_package_id TEXT NOT NULL,service_id TEXT NOT NULL,total_qty INTEGER NOT NULL,used_qty INTEGER NOT NULL DEFAULT 0,allocated_unit_cents INTEGER NOT NULL DEFAULT 0)",
    "CREATE INDEX IF NOT EXISTS idx_package_credits ON client_package_credits(client_package_id,service_id)"
  ].join(";"));
  const cols=db.prepare("pragma table_info(financial_entries)").all().map(x=>x.name);
  if(!cols.includes("client_id"))db.exec("alter table financial_entries add column client_id TEXT");
  try{
    db.exec("update financial_entries set client_id=(select a.client_id from appointments a where a.id=financial_entries.appointment_id) where client_id is null and appointment_id is not null");
  }catch{}
}

function packageRows(db,tenant){
  const packs=all(db,"select * from service_packages where tenant_id=? order by active desc,name",[tenant]);
  return packs.map(p=>({...p,price:Number(p.price_cents)/100,items:all(db,"select i.service_id,i.qty,s.name service_name,s.price_cents from package_items i join services s on s.id=i.service_id where i.package_id=? order by s.name",[p.id]).map(x=>({...x,service_price:Number(x.price_cents)/100}))}));
}
function clientPackageRows(db,tenant,clientId=null){
  const sql="select cp.*,c.name client_name,sp.name package_name from client_packages cp join clients c on c.id=cp.client_id join service_packages sp on sp.id=cp.package_id where cp.tenant_id=?"+(clientId?" and cp.client_id=?":"")+" order by cp.purchased_at desc";
  const rows=clientId?all(db,sql,[tenant,clientId]):all(db,sql,[tenant]);
  const today=new Date();
  return rows.map(p=>{
    let status=p.status;if(status==="active"&&new Date(p.expires_at)<today)status="expired";
    const credits=all(db,"select cc.*,s.name service_name from client_package_credits cc join services s on s.id=cc.service_id where cc.client_package_id=? order by s.name",[p.id]);
    return {...p,status,amount:Number(p.amount_cents)/100,credits:credits.map(x=>({...x,remaining:Number(x.total_qty)-Number(x.used_qty),allocated_unit:Number(x.allocated_unit_cents)/100}))};
  });
}
function openCash(db,tenant){return one(db,"select id from cash_sessions where tenant_id=? and status='open' order by opened_at desc limit 1",[tenant])||null}
function allocateItems(db,tenant,packId,priceCents){
  const items=all(db,"select i.service_id,i.qty,s.price_cents from package_items i join services s on s.id=i.service_id where i.package_id=? and s.tenant_id=?",[packId,tenant]);
  const weight=items.reduce((n,x)=>n+Number(x.qty)*Number(x.price_cents||0),0);
  if(!items.length||weight<=0)throw Object.assign(new Error("package_items_invalid"),{status:400});
  let allocated=0;
  return items.map((x,idx)=>{
    let itemTotal=idx===items.length-1?priceCents-allocated:Math.round(priceCents*(Number(x.qty)*Number(x.price_cents))/weight);
    allocated+=itemTotal;
    const unit=Math.max(0,Math.round(itemTotal/Number(x.qty)));
    return {service_id:x.service_id,qty:Number(x.qty),allocated_unit_cents:unit};
  });
}
export function availablePackageCredits(db,tenant,clientId,serviceId){
  return all(db,"select cc.*,cp.id client_package_id,cp.expires_at,sp.name package_name from client_package_credits cc join client_packages cp on cp.id=cc.client_package_id join service_packages sp on sp.id=cp.package_id where cp.tenant_id=? and cp.client_id=? and cc.service_id=? and cp.status='active' and date(cp.expires_at)>=date('now') and cc.used_qty<cc.total_qty order by cp.expires_at asc,cp.purchased_at asc",[tenant,clientId,serviceId]).map(x=>({...x,remaining:Number(x.total_qty)-Number(x.used_qty),allocated_unit:Number(x.allocated_unit_cents)/100}));
}
export function consumePackageCredit(db,tenant,clientId,serviceId,preferredId=null){
  const credits=availablePackageCredits(db,tenant,clientId,serviceId);
  const c=preferredId?credits.find(x=>x.client_package_id===preferredId):credits[0];
  if(!c)throw Object.assign(new Error("package_credit_required"),{status:409});
  run(db,"update client_package_credits set used_qty=used_qty+1 where id=? and used_qty<total_qty",[c.id]);
  const remaining=Number(one(db,"select coalesce(sum(total_qty-used_qty),0) n from client_package_credits where client_package_id=?",[c.client_package_id])?.n||0);
  if(remaining<=0)run(db,"update client_packages set status='used' where id=?",[c.client_package_id]);
  return {client_package_id:c.client_package_id,package_name:c.package_name,credit_id:c.id,allocated_unit_cents:Number(c.allocated_unit_cents||0),remaining_after:Math.max(0,c.remaining-1)};
}

export async function handlePhase8Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit}){
  const guard=p=>requirePermission(user,p);
  if(req.method==="GET"&&url.pathname==="/api/packages"){guard("packages.read");return send(res,200,packageRows(db,tenant))}
  if(req.method==="POST"&&url.pathname==="/api/packages"){
    guard("packages.manage");const b=await parseBody(req),name=txt(b.name,140),price=cents(b.price),days=Math.max(1,Math.min(3650,Number(b.validity_days||90))),items=Array.isArray(b.items)?b.items:[];
    if(!name||price<=0||!items.length)return send(res,400,{error:"invalid_package"});
    const id=uid(),valid=[];
    for(const x of items){const svc=one(db,"select id from services where id=? and tenant_id=? and active=1",[txt(x.service_id,64),tenant]),qty=Math.max(1,Math.min(100,Math.trunc(Number(x.qty||1))));if(!svc)return send(res,400,{error:"invalid_service"});valid.push({service_id:svc.id,qty})}
    db.exec("BEGIN IMMEDIATE");try{
      run(db,"insert into service_packages(id,tenant_id,name,description,price_cents,validity_days,active,created_by,created_at,updated_at) values(?,?,?,?,?,?,1,?,?,?)",[id,tenant,name,txt(b.description,1000),price,days,user.id,now(),now()]);
      for(const x of valid)run(db,"insert into package_items(package_id,service_id,qty) values(?,?,?)",[id,x.service_id,x.qty]);
      db.exec("COMMIT");
    }catch(e){db.exec("ROLLBACK");throw e}
    audit(db,user,"package.create","service_package",id,{price_cents:price,items:valid.length});return send(res,201,{id,name,price:price/100,validity_days:days});
  }
  const sell=url.pathname.match(/^\/api\/packages\/([^/]+)\/sell$/);
  if(req.method==="POST"&&sell){
    guard("packages.sell");const id=decodeURIComponent(sell[1]),pack=one(db,"select * from service_packages where id=? and tenant_id=? and active=1",[id,tenant]);if(!pack)return send(res,404,{error:"package_not_found"});
    const b=await parseBody(req),client=one(db,"select id,name from clients where id=? and tenant_id=?",[txt(b.client_id,64),tenant]);if(!client)return send(res,404,{error:"client_not_found"});
    const method=txt(b.payment_method||"pix",32),allowed=["pix","credit_card","debit_card","cash","other"];if(!allowed.includes(method))return send(res,400,{error:"invalid_payment_method"});
    const cash=method==="cash"?openCash(db,tenant):null;if(method==="cash"&&!cash)return send(res,409,{error:"cash_session_required"});
    const allocation=allocateItems(db,tenant,id,Number(pack.price_cents)),cpid=uid(),fid=uid(),purchased=now(),expires=new Date(Date.now()+Number(pack.validity_days)*86400000).toISOString();
    db.exec("BEGIN IMMEDIATE");try{
      run(db,"insert into financial_entries(id,tenant_id,kind,category,description,amount_cents,payment_method,status,paid_at,cash_session_id,client_id,reference_type,reference_id,created_by,created_at,metadata) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [fid,tenant,"income","packages","Pacote "+pack.name+" · "+client.name,pack.price_cents,method,"paid",purchased,cash?.id||null,client.id,"client_package",cpid,user.id,purchased,JSON.stringify({package_id:id})]);
      run(db,"insert into client_packages(id,tenant_id,client_id,package_id,purchased_at,expires_at,status,amount_cents,payment_method,financial_entry_id,created_by,created_at) values(?,?,?,?,?,?,'active',?,?,?,?,?)",
        [cpid,tenant,client.id,id,purchased,expires,pack.price_cents,method,fid,user.id,purchased]);
      for(const x of allocation)run(db,"insert into client_package_credits(id,client_package_id,service_id,total_qty,used_qty,allocated_unit_cents) values(?,?,?,?,0,?)",[uid(),cpid,x.service_id,x.qty,x.allocated_unit_cents]);
      db.exec("COMMIT");
    }catch(e){db.exec("ROLLBACK");throw e}
    audit(db,user,"package.sell","client_package",cpid,{client_id:client.id,package_id:id,amount_cents:pack.price_cents});return send(res,201,{id:cpid,package_id:id,client_id:client.id,amount:Number(pack.price_cents)/100,expires_at:expires,credits:allocation});
  }
  if(req.method==="GET"&&url.pathname==="/api/client-packages"){guard("packages.read");const cid=txt(url.searchParams.get("client_id")||"",64)||null;return send(res,200,clientPackageRows(db,tenant,cid))}
  if(req.method==="GET"&&url.pathname==="/api/packages/overview"){
    guard("packages.read");const active=one(db,"select count(*) n,coalesce(sum(amount_cents),0) total from client_packages where tenant_id=? and status='active' and date(expires_at)>=date('now')",[tenant])||{};
    const credits=one(db,"select coalesce(sum(cc.total_qty-cc.used_qty),0) n from client_package_credits cc join client_packages cp on cp.id=cc.client_package_id where cp.tenant_id=? and cp.status='active' and date(cp.expires_at)>=date('now')",[tenant])||{};
    return send(res,200,{active_packages:Number(active.n||0),active_value:Number(active.total||0)/100,remaining_credits:Number(credits.n||0)});
  }
  return false;
}
