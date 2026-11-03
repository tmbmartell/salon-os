import { staffWindowForDate } from "./phase9.mjs";

const all=(db,s,p=[])=>db.prepare(s).all(...p);
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const DAY=86400000;
const RETURN_TOLERANCE_DAYS=7;
const LAST_MINUTE_HOURS=24;
const MAX_RANGE_DAYS=366;
const validDate=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||"")&&!Number.isNaN(Date.parse(x+"T00:00:00Z"));

export function installPhase12(db){}

function addDays(date,n){return new Date(Date.parse(date+"T12:00:00Z")+n*DAY).toISOString().slice(0,10)}
function diffDays(from,to){return Math.round((Date.parse(to+"T12:00:00Z")-Date.parse(from+"T12:00:00Z"))/DAY)}
function localDate(ms,timeZone){return new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(ms))}
function zoneOffsetMs(ms,timeZone){
  const m=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit"}).formatToParts(new Date(ms)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return Date.UTC(+m.year,+m.month-1,+m.day,+m.hour,+m.minute,+m.second)-ms;
}
function dayStartMs(date,timeZone){const guess=Date.parse(date+"T00:00:00Z");return guess-zoneOffsetMs(guess,timeZone)}
function utcRange(from,to,timeZone){return {start:new Date(dayStartMs(from,timeZone)).toISOString(),end:new Date(dayStartMs(addDays(to,1),timeZone)).toISOString()}}
function minutes(t){const [h,m]=String(t||"0:0").split(":").map(Number);return h*60+(m||0)}
function pct(part,total){return total?part/total*100:0}

function dailyRevenue(db,tenant,from,to,timeZone){
  const {start,end}=utcRange(from,to,timeZone),byDay=new Map();
  // Same base as Relatórios ("Entradas reais"), so both screens show the same revenue.
  for(const x of all(db,"select amount_cents,created_at from financial_entries where tenant_id=? and kind='income' and status='paid' and created_at>=? and created_at<?",[tenant,start,end])){
    const k=localDate(Date.parse(x.created_at),timeZone);byDay.set(k,(byDay.get(k)||0)+Number(x.amount_cents||0));
  }
  return Array.from({length:diffDays(from,to)+1},(_,i)=>{const date=addDays(from,i);return {date,value:(byDay.get(date)||0)/100}});
}
function occupancy(db,tenant,from,to,timeZone){
  const {start,end}=utcRange(from,to,timeZone);
  const booked=all(db,`select coalesce(ai.start_at,a.start_at) s,coalesce(ai.end_at,a.end_at) e from appointments a left join appointment_items ai on ai.appointment_id=a.id
    where a.tenant_id=? and a.start_at>=? and a.start_at<? and a.status not in ('cancelled','no_show')`,[tenant,start,end])
    .reduce((n,x)=>n+Math.max(0,(Date.parse(x.e)-Date.parse(x.s))/60000),0);
  const pros=all(db,"select id from professionals where tenant_id=? and active=1",[tenant]);let available=0;
  for(let i=0;i<=diffDays(from,to);i++){
    const date=addDays(from,i);
    for(const p of pros){const w=staffWindowForDate(db,tenant,p.id,date);if(w)available+=Math.max(0,minutes(w.end)-minutes(w.start))}
  }
  return Math.min(100,pct(booked,available));
}
function lastMinuteCancellation(db,tenant,from,to,timeZone){
  const {start,end}=utcRange(from,to,timeZone),rows=all(db,"select start_at,updated_at,status from appointments where tenant_id=? and start_at>=? and start_at<?",[tenant,start,end]);
  const late=rows.filter(x=>x.status==="no_show"||(x.status==="cancelled"&&Date.parse(x.start_at)-Date.parse(x.updated_at)<LAST_MINUTE_HOURS*3600000)).length;
  return pct(late,rows.length);
}
function averageTicket(db,tenant,from,to,timeZone){
  const {start,end}=utcRange(from,to,timeZone),x=one(db,"select count(*) n,coalesce(sum(total_cents),0) total from checkout_records where tenant_id=? and payment_method<>'package' and created_at>=? and created_at<?",[tenant,start,end])||{};
  return Number(x.n)?Number(x.total)/Number(x.n)/100:0;
}
// Same forecast as Olho do Dono: average interval between visits, or 30/45 days for clients with one visit.
function returnRate(db,tenant,from,to,timeZone){
  const {start,end}=utcRange(from,to,timeZone),startMs=Date.parse(start),endMs=Date.parse(end),byClient=new Map();
  for(const x of all(db,"select a.client_id,a.start_at,s.duration_min from checkout_records cr join appointments a on a.id=cr.appointment_id join services s on s.id=a.service_id where cr.tenant_id=? and a.start_at<? order by a.start_at",[tenant,start])){
    if(!byClient.has(x.client_id))byClient.set(x.client_id,[]);byClient.get(x.client_id).push(x);
  }
  let expected=0,returned=0;
  for(const [clientId,visits] of byClient){
    const last=visits[visits.length-1],lastMs=Date.parse(last.start_at);
    const interval=visits.length>1?(lastMs-Date.parse(visits[0].start_at))/DAY/(visits.length-1):Number(last.duration_min||60)>=90?45:30;
    const predicted=lastMs+interval*DAY;if(predicted<startMs||predicted>=endMs)continue;
    expected++;
    const next=one(db,"select 1 ok from appointments where tenant_id=? and client_id=? and status not in ('cancelled','no_show') and start_at>? and start_at<=? limit 1",[tenant,clientId,last.start_at,new Date(predicted+RETURN_TOLERANCE_DAYS*DAY).toISOString()]);
    if(next)returned++;
  }
  return {rate:pct(returned,expected),returned,expected};
}
function periodMetrics(db,tenant,from,to,timeZone){
  const series=dailyRevenue(db,tenant,from,to,timeZone);
  return {from,to,series,revenue:series.reduce((n,x)=>n+x.value,0),occupancy:occupancy(db,tenant,from,to,timeZone),avg_ticket:averageTicket(db,tenant,from,to,timeZone),last_minute_cancellation:lastMinuteCancellation(db,tenant,from,to,timeZone),return_rate:returnRate(db,tenant,from,to,timeZone)};
}
function weekProjection(db,tenant,timeZone){
  const today=localDate(Date.now(),timeZone),until=addDays(today,6),nowIso=new Date().toISOString(),{end}=utcRange(today,until,timeZone);
  const pending=kind=>Number(one(db,"select coalesce(sum(amount_cents),0) total from financial_entries where tenant_id=? and kind=? and status='pending' and due_date is not null and date(due_date) between ? and ?",[tenant,kind,today,until])?.total||0)/100;
  const apps=all(db,`select a.id,s.price_cents,(select coalesce(sum(ai.unit_price_cents*ai.qty),0) from appointment_items ai where ai.appointment_id=a.id) items_cents
    from appointments a join services s on s.id=a.service_id where a.tenant_id=? and a.start_at>=? and a.start_at<? and a.status in ('scheduled','confirmed','arrived','in_service')`,[tenant,nowIso,end]);
  const estimated=apps.reduce((n,x)=>n+Number(x.items_cents||x.price_cents||0),0)/100,receivable=pending("income"),payable=pending("expense");
  return {from:today,to:until,receivable,estimated,payable,total:receivable+estimated-payable};
}

export async function handlePhase12Api({req,res,url,db,user,tenant,send,requirePermission}){
  const guard=p=>requirePermission(user,p);
  if(req.method==="GET"&&url.pathname==="/api/analytics/dashboard"){
    guard("analytics.read");
    const timeZone=one(db,"select timezone from tenants where id=?",[tenant])?.timezone||"America/Porto_Velho",today=localDate(Date.now(),timeZone);
    const from=url.searchParams.get("from")||today.slice(0,8)+"01",to=url.searchParams.get("to")||today;
    if(!validDate(from)||!validDate(to)||from>to||diffDays(from,to)+1>MAX_RANGE_DAYS)return send(res,400,{error:"invalid_period"});
    const span=diffDays(from,to)+1,compareTo=url.searchParams.get("compare_to")||addDays(from,-1),compareFrom=url.searchParams.get("compare_from")||addDays(compareTo,1-span);
    if(!validDate(compareFrom)||!validDate(compareTo)||compareFrom>compareTo||diffDays(compareFrom,compareTo)+1>MAX_RANGE_DAYS)return send(res,400,{error:"invalid_compare_period"});
    return send(res,200,{current:periodMetrics(db,tenant,from,to,timeZone),compare:periodMetrics(db,tenant,compareFrom,compareTo,timeZone),projection:weekProjection(db,tenant,timeZone)});
  }
  if(req.method==="GET"&&url.pathname==="/api/agenda/windows"){
    guard("appointments.read");
    const date=url.searchParams.get("date")||"";if(!validDate(date))return send(res,400,{error:"invalid_date"});
    const pros=all(db,"select id,name,role from professionals where tenant_id=? and active=1 order by name",[tenant]);
    return send(res,200,pros.map(p=>({...p,window:staffWindowForDate(db,tenant,p.id,date),time_off:one(db,"select type,notes from staff_time_off where tenant_id=? and professional_id=? and status='approved' and date(?) between date(start_date) and date(end_date) limit 1",[tenant,p.id,date])||null})));
  }
  return false;
}
