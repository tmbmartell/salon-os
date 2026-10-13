import crypto from "node:crypto";

const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const all=(db,s,p=[])=>db.prepare(s).all(...p);
const run=(db,s,p=[])=>db.prepare(s).run(...p);
const txt=(v,n=500)=>String(v??"").trim().slice(0,n);
const days=(a,b)=>Math.round((new Date(b)-new Date(a))/86400000);

export function installPhase3(db){
  db.exec([
    "CREATE TABLE IF NOT EXISTS recovery_actions(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT NOT NULL,channel TEXT NOT NULL DEFAULT 'whatsapp',reason TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'queued',estimated_value_cents INTEGER NOT NULL DEFAULT 0,created_by TEXT,created_at TEXT NOT NULL,sent_at TEXT,completed_at TEXT,metadata TEXT NOT NULL DEFAULT '{}')",
    "CREATE INDEX IF NOT EXISTS idx_recovery_status ON recovery_actions(tenant_id,status,created_at)",
    "CREATE TABLE IF NOT EXISTS intelligence_notes(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,kind TEXT NOT NULL,severity TEXT NOT NULL DEFAULT 'info',title TEXT NOT NULL,body TEXT NOT NULL,entity_type TEXT,entity_id TEXT,status TEXT NOT NULL DEFAULT 'open',fingerprint TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_intel_fingerprint ON intelligence_notes(tenant_id,fingerprint)"
  ].join(";"));
}

function checkoutRows(db,tenant){
  return all(db,"select cr.*,a.client_id,a.professional_id,a.service_id,a.start_at,c.name client_name,p.name professional_name,s.name service_name,s.duration_min,s.price_cents,s.commission_pct from checkout_records cr join appointments a on a.id=cr.appointment_id join clients c on c.id=a.client_id join professionals p on p.id=a.professional_id join services s on s.id=a.service_id where cr.tenant_id=? order by a.start_at",[tenant]);
}

function clientIntelligence(db,tenant){
  const clients=all(db,"select * from clients where tenant_id=? order by name",[tenant]);
  const rows=checkoutRows(db,tenant),by=new Map();
  for(const r of rows){if(!by.has(r.client_id))by.set(r.client_id,[]);by.get(r.client_id).push(r)}
  const today=new Date();
  return clients.map(c=>{
    const visits=by.get(c.id)||[],count=visits.length,total=visits.reduce((n,x)=>n+Number(x.total_cents||0),0);
    const avg=count?total/count:0,last=count?visits[visits.length-1]:null,first=count?visits[0]:null;
    const intervals=[];for(let i=1;i<visits.length;i++)intervals.push(days(visits[i-1].start_at,visits[i].start_at));
    const avgInterval=intervals.length?intervals.reduce((a,b)=>a+b,0)/intervals.length:null;
    const fallbackInterval=last?Math.max(21,Math.min(120,Number(last.duration_min||60)>=90?45:30)):30;
    const interval=avgInterval||fallbackInterval;
    const predicted=last?new Date(new Date(last.start_at).getTime()+interval*86400000):null;
    const daysLate=predicted?Math.floor((today-predicted)/86400000):null;
    let status=count===0?"never":count===1?"new":"active";
    if(predicted){if(daysLate>60)status="lost";else if(daysLate>14)status="late";else if(daysLate>=0)status="due";else status="active"}
    const futureValue=count?Math.round(avg*Math.max(1,Math.min(12,365/interval))):0;
    return {id:c.id,name:c.name,phone:c.phone,tags:c.tags,visits:count,lifetime_value:total/100,avg_ticket:avg/100,annualized_value:futureValue/100,first_visit:first?.start_at||null,last_visit:last?.start_at||null,last_service:last?.service_name||null,avg_interval_days:avgInterval?Number(avgInterval.toFixed(1)):null,predicted_return:predicted?.toISOString()||null,days_late:daysLate,status};
  }).sort((a,b)=>(b.lifetime_value-a.lifetime_value)||a.name.localeCompare(b.name));
}

function overview(db,tenant){
  const rows=checkoutRows(db,tenant),clients=clientIntelligence(db,tenant),cut=new Date(Date.now()-30*86400000);
  const recent=rows.filter(x=>new Date(x.created_at)>=cut),revenue=recent.reduce((n,x)=>n+Number(x.total_cents||0),0);
  const avgTicket=recent.length?revenue/recent.length:0;
  const repeat=clients.filter(c=>c.visits>=2).length,withVisit=clients.filter(c=>c.visits>0).length;
  const apps=all(db,"select status from appointments where tenant_id=? and start_at>=?",[tenant,cut.toISOString()]);
  const noShow=apps.filter(x=>x.status==="no_show").length,cancel=apps.filter(x=>x.status==="cancelled").length;
  const recoverable=clients.filter(c=>["due","late","lost"].includes(c.status));
  return {revenue30:revenue/100,appointments30:recent.length,avgTicket:avgTicket/100,repeatRate:withVisit?repeat/withVisit*100:0,noShowRate:apps.length?noShow/apps.length*100:0,cancellationRate:apps.length?cancel/apps.length*100:0,activeClients:clients.filter(c=>c.status==="active").length,dueClients:clients.filter(c=>c.status==="due").length,lateClients:clients.filter(c=>c.status==="late").length,lostClients:clients.filter(c=>c.status==="lost").length,recoverableValue:recoverable.reduce((n,c)=>n+c.avg_ticket,0)};
}

function professionals(db,tenant){
  const profs=all(db,"select * from professionals where tenant_id=? and active=1 order by name",[tenant]),cut=new Date(Date.now()-30*86400000).toISOString();
  return profs.map(p=>{
    const closed=all(db,"select cr.total_cents,a.start_at,s.duration_min from checkout_records cr join appointments a on a.id=cr.appointment_id join services s on s.id=a.service_id where cr.tenant_id=? and a.professional_id=? and a.start_at>=?",[tenant,p.id,cut]);
    const apps=all(db,"select status,start_at,end_at from appointments where tenant_id=? and professional_id=? and start_at>=?",[tenant,p.id,cut]);
    const revenue=closed.reduce((n,x)=>n+Number(x.total_cents||0),0),minutes=closed.reduce((n,x)=>n+Number(x.duration_min||0),0);
    const noShow=apps.filter(x=>x.status==="no_show").length,cancel=apps.filter(x=>x.status==="cancelled").length;
    return {id:p.id,name:p.name,role:p.role,appointments:closed.length,revenue:revenue/100,avg_ticket:closed.length?revenue/closed.length/100:0,productive_hours:Number((minutes/60).toFixed(1)),revenue_per_hour:minutes?revenue/(minutes/60)/100:0,no_show_rate:apps.length?noShow/apps.length*100:0,cancellation_rate:apps.length?cancel/apps.length*100:0};
  }).sort((a,b)=>b.revenue-a.revenue);
}

function services(db,tenant){
  const list=all(db,"select * from services where tenant_id=? and active=1 order by name",[tenant]);
  return list.map(s=>{
    const rows=all(db,"select cr.total_cents from checkout_records cr join appointments a on a.id=cr.appointment_id where cr.tenant_id=? and a.service_id=?",[tenant,s.id]);
    const revenue=rows.reduce((n,x)=>n+Number(x.total_cents||0),0);
    const recipe=all(db,"select r.qty_standard,p.avg_cost_cents from service_recipes r join products p on p.id=r.product_id where r.tenant_id=? and r.service_id=?",[tenant,s.id]);
    const productCost=recipe.reduce((n,x)=>n+Number(x.qty_standard)*Number(x.avg_cost_cents||0),0);
    const commission=Math.round(Number(s.price_cents||0)*Number(s.commission_pct||0)/100),direct=productCost+commission,margin=Number(s.price_cents||0)-direct;
    return {id:s.id,name:s.name,category:s.category,count:rows.length,revenue:revenue/100,avg_ticket:rows.length?revenue/rows.length/100:0,price:Number(s.price_cents||0)/100,product_cost:productCost/100,commission:commission/100,direct_margin:margin/100,direct_margin_pct:Number(s.price_cents)>0?margin/Number(s.price_cents)*100:0};
  }).sort((a,b)=>b.revenue-a.revenue);
}

function stockForecast(db,tenant){
  const ps=all(db,"select p.*,s.name supplier_name,s.lead_days from products p left join suppliers s on s.id=p.supplier_id where p.tenant_id=? and p.active=1",[tenant]);
  return ps.map(p=>{
    const d30=one(db,"select abs(coalesce(sum(qty),0)) q from stock_movements where tenant_id=? and product_id=? and type='consumption' and created_at>=datetime('now','-30 day')",[tenant,p.id])?.q||0;
    const d90=one(db,"select abs(coalesce(sum(qty),0)) q from stock_movements where tenant_id=? and product_id=? and type='consumption' and created_at>=datetime('now','-90 day')",[tenant,p.id])?.q||0;
    const daily30=Number(d30)/30,daily90=Number(d90)/90,daily=daily30>0&&daily90>0?(daily30*.7+daily90*.3):Math.max(daily30,daily90);
    const cover=daily>0?Number(p.stock_qty)/daily:null,lead=Number(p.lead_days||0),safety=Math.max(3,Math.ceil(lead*.5));
    const reorderIn=cover==null?null:Math.max(0,Math.floor(cover-lead-safety));
    const suggested=Math.max(0,Number(p.ideal_qty||p.min_qty)-Number(p.stock_qty||0));
    return {product_id:p.id,product_name:p.name,unit:p.unit,stock_qty:Number(p.stock_qty),min_qty:Number(p.min_qty),ideal_qty:Number(p.ideal_qty),supplier_name:p.supplier_name,lead_days:lead,daily_consumption:Number(daily.toFixed(3)),days_cover:cover==null?null:Number(cover.toFixed(1)),reorder_in_days:reorderIn,suggested_qty:suggested,risk:Number(p.stock_qty)<=Number(p.min_qty)?"critical":cover!=null&&cover<=lead+safety?"critical":cover!=null&&cover<=lead+safety+7?"warning":"ok"};
  }).sort((a,b)=>({critical:0,warning:1,ok:2}[a.risk]-({critical:0,warning:1,ok:2}[b.risk]))||(a.days_cover??9999)-(b.days_cover??9999));
}

function recoveryList(db,tenant){
  return clientIntelligence(db,tenant).filter(c=>["due","late","lost"].includes(c.status)).map(c=>{
    const reason=c.status==="lost"?"Cliente sumida há bastante tempo":c.status==="late"?"Retorno está atrasado":"Chegou a janela provável de retorno";
    const first=c.name.split(" ")[0];
    const message=c.last_service?"Oi, "+first+"! Já faz um tempinho desde seu último "+c.last_service+". Quer que eu veja alguns horários para você?":"Oi, "+first+"! Quer que eu veja alguns horários para você voltar ao salão?";
    return {...c,reason,suggested_message:message,estimated_value:c.avg_ticket};
  }).sort((a,b)=>(b.days_late||0)-(a.days_late||0));
}

function syncNotes(db,tenant){
  const ov=overview(db,tenant),stock=stockForecast(db,tenant),clients=clientIntelligence(db,tenant);
  const notes=[];
  if(ov.noShowRate>=10)notes.push({kind:"operation",severity:"warning",title:"No-show acima de 10%",body:"Taxa atual: "+ov.noShowRate.toFixed(1)+"%. Vale reforçar confirmação e lista de espera.",fingerprint:"noshow-high"});
  for(const p of stock.filter(x=>x.risk==="critical").slice(0,8))notes.push({kind:"stock",severity:"critical",title:"Risco de faltar "+p.product_name,body:p.days_cover==null?"Sem histórico suficiente.":"Cobertura estimada: "+p.days_cover+" dias. Prazo do fornecedor: "+p.lead_days+" dias.",entity_type:"product",entity_id:p.product_id,fingerprint:"stock-"+p.product_id});
  const lost=clients.filter(c=>c.status==="lost");
  if(lost.length)notes.push({kind:"crm",severity:"warning",title:lost.length+" clientes em risco de perda",body:"Valor médio recuperável estimado: R$ "+lost.reduce((n,c)=>n+c.avg_ticket,0).toFixed(2)+".",fingerprint:"lost-clients"});
  const ts=now();
  for(const n of notes)run(db,"insert into intelligence_notes(id,tenant_id,kind,severity,title,body,entity_type,entity_id,status,fingerprint,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?) on conflict(tenant_id,fingerprint) do update set severity=excluded.severity,title=excluded.title,body=excluded.body,entity_type=excluded.entity_type,entity_id=excluded.entity_id,status='open',updated_at=excluded.updated_at",[uid(),tenant,n.kind,n.severity,n.title,n.body,n.entity_type||null,n.entity_id||null,"open",n.fingerprint,ts,ts]);
  return all(db,"select * from intelligence_notes where tenant_id=? and status='open' order by case severity when 'critical' then 0 when 'warning' then 1 else 2 end,updated_at desc",[tenant]);
}

export async function handlePhase3Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit}){
  const guard=p=>requirePermission(user,p);
  if(req.method==="GET"&&url.pathname==="/api/intelligence/overview"){guard("analytics.read");return send(res,200,overview(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/intelligence/clients"){guard("analytics.read");return send(res,200,clientIntelligence(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/intelligence/professionals"){guard("analytics.read");return send(res,200,professionals(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/intelligence/services"){guard("analytics.read");return send(res,200,services(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/intelligence/stock-forecast"){guard("analytics.read");return send(res,200,stockForecast(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/intelligence/recovery"){guard("analytics.read");return send(res,200,recoveryList(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/intelligence/alerts"){guard("analytics.read");return send(res,200,syncNotes(db,tenant))}
  if(req.method==="POST"&&url.pathname==="/api/intelligence/recovery/action"){
    guard("recovery.write");
    const b=await parseBody(req),client=one(db,"select * from clients where id=? and tenant_id=?",[txt(b.client_id,64),tenant]);
    if(!client)return send(res,404,{error:"client_not_found"});
    const rec=recoveryList(db,tenant).find(x=>x.id===client.id),message=txt(b.message||rec?.suggested_message||"",1200);
    if(!message)return send(res,400,{error:"message_required"});
    const id=uid(),value=Math.round(Number(rec?.estimated_value||0)*100);
    run(db,"insert into recovery_actions(id,tenant_id,client_id,channel,reason,message,status,estimated_value_cents,created_by,created_at,metadata) values(?,?,?,?,?,?,?,?,?,?,?)",[id,tenant,client.id,"whatsapp",txt(rec?.reason||b.reason||"recuperacao",240),message,"queued",value,user.id,now(),JSON.stringify({source:"intelligence"})]);
    audit(db,user,"recovery.queue","client",client.id,{action_id:id,estimated_value_cents:value});
    return send(res,201,{id,status:"queued",client_id:client.id,message,estimated_value:value/100});
  }
  if(req.method==="GET"&&url.pathname==="/api/intelligence/recovery/actions"){
    guard("analytics.read");
    return send(res,200,all(db,"select r.*,c.name client_name,c.phone client_phone from recovery_actions r join clients c on c.id=r.client_id where r.tenant_id=? order by r.created_at desc limit 200",[tenant]).map(x=>({...x,estimated_value:Number(x.estimated_value_cents||0)/100})));
  }
  return false;
}
