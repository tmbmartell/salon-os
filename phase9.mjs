import crypto from "node:crypto";

const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const all=(db,s,p=[])=>db.prepare(s).all(...p);
const run=(db,s,p=[])=>db.prepare(s).run(...p);
const txt=(v,n=500)=>String(v??"").trim().slice(0,n);
const cents=v=>Math.round(Number(v||0)*100);

export function installPhase9(db){
  db.exec([
    "CREATE TABLE IF NOT EXISTS staff_schedules(tenant_id TEXT NOT NULL,professional_id TEXT NOT NULL,weekday INTEGER NOT NULL,start_time TEXT NOT NULL,end_time TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,updated_by TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,professional_id,weekday))",
    "CREATE TABLE IF NOT EXISTS staff_time_off(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,professional_id TEXT NOT NULL,type TEXT NOT NULL,start_date TEXT NOT NULL,end_date TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'approved',notes TEXT NOT NULL DEFAULT '',created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_staff_time_off ON staff_time_off(tenant_id,professional_id,start_date,end_date,status)",
    "CREATE TABLE IF NOT EXISTS staff_goals(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,professional_id TEXT NOT NULL,period TEXT NOT NULL,target_revenue_cents INTEGER NOT NULL DEFAULT 0,target_appointments INTEGER NOT NULL DEFAULT 0,target_avg_ticket_cents INTEGER NOT NULL DEFAULT 0,target_no_show_pct REAL NOT NULL DEFAULT 0,created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,professional_id,period))"
  ].join(";"));
}

export function staffWindowForDate(db,tenant,professional,date){
  const p=one(db,"select * from professionals where id=? and tenant_id=? and active=1",[professional,tenant]);if(!p)return null;
  const off=one(db,"select id,type from staff_time_off where tenant_id=? and professional_id=? and status='approved' and date(?) between date(start_date) and date(end_date) limit 1",[tenant,professional,date]);
  if(off)return null;
  const weekday=new Date(date+"T12:00:00Z").getUTCDay();
  const s=one(db,"select * from staff_schedules where tenant_id=? and professional_id=? and weekday=?",[tenant,professional,weekday]);
  if(s)return Number(s.active)?{start:s.start_time,end:s.end_time,source:"weekly"}:null;
  return {start:p.work_start||"09:00",end:p.work_end||"18:00",source:"default"};
}

function scheduleRows(db,tenant,professional){
  const p=one(db,"select * from professionals where id=? and tenant_id=?",[professional,tenant]);if(!p)return null;
  const saved=new Map(all(db,"select * from staff_schedules where tenant_id=? and professional_id=?",[tenant,professional]).map(x=>[Number(x.weekday),x]));
  return Array.from({length:7},(_,weekday)=>{
    const x=saved.get(weekday);
    return x?{weekday,start_time:x.start_time,end_time:x.end_time,active:!!x.active,source:"weekly"}:{weekday,start_time:p.work_start||"09:00",end_time:p.work_end||"18:00",active:true,source:"default"};
  });
}
function periodRange(period){
  const m=/^\d{4}-\d{2}$/.test(period)?period:new Date().toISOString().slice(0,7);
  const start=m+"-01T00:00:00.000Z",d=new Date(start),next=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)).toISOString();
  return {period:m,start,end:next};
}
function staffMetrics(db,tenant,period){
  const {start,end}=periodRange(period),profs=all(db,"select * from professionals where tenant_id=? and active=1 order by name",[tenant]);
  return profs.map(p=>{
    const sales=one(db,"select count(distinct appointment_id) n,coalesce(sum(gross_cents),0) revenue from commissions where tenant_id=? and professional_id=? and created_at>=? and created_at<?",[tenant,p.id,start,end])||{};
    const apps=all(db,"select distinct a.id,a.status from appointments a where a.tenant_id=? and a.start_at>=? and a.start_at<? and (exists(select 1 from appointment_items ai where ai.appointment_id=a.id and ai.professional_id=?) or (a.professional_id=? and not exists(select 1 from appointment_items ax where ax.appointment_id=a.id)))",[tenant,start,end,p.id,p.id]);
    const commission=one(db,"select coalesce(sum(amount_cents),0) total,coalesce(sum(case when status='pending' then amount_cents else 0 end),0) pending from commissions where tenant_id=? and professional_id=? and created_at>=? and created_at<?",[tenant,p.id,start,end])||{};
    let retailCommission={total:0,pending:0};try{retailCommission=one(db,"select coalesce(sum(amount_cents),0) total,coalesce(sum(case when status='pending' then amount_cents else 0 end),0) pending from retail_commissions where tenant_id=? and professional_id=? and created_at>=? and created_at<?",[tenant,p.id,start,end])||retailCommission}catch{};
    const goal=one(db,"select * from staff_goals where tenant_id=? and professional_id=? and period=?",[tenant,p.id,period])||null;
    const n=Number(sales.n||0),revenue=Number(sales.revenue||0),noShow=apps.filter(x=>x.status==="no_show").length;
    return {id:p.id,name:p.name,role:p.role,specialties:JSON.parse(p.specialties||"[]"),appointments:n,revenue:revenue/100,avg_ticket:n?revenue/n/100:0,no_show_rate:apps.length?noShow/apps.length*100:0,commission_total:(Number(commission.total||0)+Number(retailCommission.total||0))/100,commission_pending:(Number(commission.pending||0)+Number(retailCommission.pending||0))/100,goal:goal?{target_revenue:Number(goal.target_revenue_cents||0)/100,target_appointments:Number(goal.target_appointments||0),target_avg_ticket:Number(goal.target_avg_ticket_cents||0)/100,target_no_show_pct:Number(goal.target_no_show_pct||0)}:null};
  });
}
function timeOffRows(db,tenant){
  return all(db,"select o.*,p.name professional_name from staff_time_off o join professionals p on p.id=o.professional_id where o.tenant_id=? order by date(o.start_date) desc,o.created_at desc limit 200",[tenant]);
}

export async function handlePhase9Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit}){
  const guard=p=>requirePermission(user,p);
  if(req.method==="GET"&&url.pathname==="/api/staff/overview"){
    guard("staff.read");const period=txt(url.searchParams.get("period")||new Date().toISOString().slice(0,7),7);
    const privileged=["owner","manager"].includes(user.role);
    if(!privileged){
      // A recepção pode consultar a equipe, mas nunca desempenho financeiro,
      // comissões, metas individuais nem justificativas de afastamento.
      const basics=all(db,"select id,name,role,specialties from professionals where tenant_id=? and active=1 order by name",[tenant])
        .map(p=>({...p,specialties:(()=>{try{return JSON.parse(p.specialties||"[]")}catch{return []}})()}));
      return send(res,200,{period,limited:true,metrics:basics,time_off:[]});
    }
    return send(res,200,{period,limited:false,metrics:staffMetrics(db,tenant,period),time_off:timeOffRows(db,tenant)});
  }
  const schedule=url.pathname.match(/^\/api\/staff\/([^/]+)\/schedule$/);
  if(schedule&&req.method==="GET"){
    guard("staff.read");const id=decodeURIComponent(schedule[1]),rows=scheduleRows(db,tenant,id);if(!rows)return send(res,404,{error:"professional_not_found"});return send(res,200,rows);
  }
  if(schedule&&req.method==="PUT"){
    guard("staff.manage");const id=decodeURIComponent(schedule[1]);if(!one(db,"select id from professionals where id=? and tenant_id=?",[id,tenant]))return send(res,404,{error:"professional_not_found"});
    const b=await parseBody(req),days=Array.isArray(b.days)?b.days:[];if(!days.length)return send(res,400,{error:"days_required"});
    const ts=now();db.exec("BEGIN IMMEDIATE");try{
      for(const d of days){
        const weekday=Math.max(0,Math.min(6,Math.trunc(Number(d.weekday)))),active=d.active?1:0,start=txt(d.start_time||"09:00",5),end=txt(d.end_time||"18:00",5);
        if(!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end)||start>=end)throw Object.assign(new Error("invalid_schedule"),{status:400});
        run(db,"insert into staff_schedules(tenant_id,professional_id,weekday,start_time,end_time,active,updated_by,updated_at) values(?,?,?,?,?,?,?,?) on conflict(tenant_id,professional_id,weekday) do update set start_time=excluded.start_time,end_time=excluded.end_time,active=excluded.active,updated_by=excluded.updated_by,updated_at=excluded.updated_at",[tenant,id,weekday,start,end,active,user.id,ts]);
      }
      db.exec("COMMIT");
    }catch(e){db.exec("ROLLBACK");throw e}
    audit(db,user,"staff.schedule.update","professional",id,{days:days.length});return send(res,200,scheduleRows(db,tenant,id));
  }
  if(req.method==="GET"&&url.pathname==="/api/staff/time-off"){guard("staff.read");return send(res,200,timeOffRows(db,tenant))}
  if(req.method==="POST"&&url.pathname==="/api/staff/time-off"){
    guard("staff.manage");const b=await parseBody(req),pid=txt(b.professional_id,64);if(!one(db,"select id from professionals where id=? and tenant_id=?",[pid,tenant]))return send(res,404,{error:"professional_not_found"});
    const start=txt(b.start_date,10),end=txt(b.end_date||b.start_date,10),type=txt(b.type||"day_off",40);if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}$/.test(end)||end<start)return send(res,400,{error:"invalid_dates"});
    const id=uid(),ts=now();run(db,"insert into staff_time_off(id,tenant_id,professional_id,type,start_date,end_date,status,notes,created_by,created_at,updated_at) values(?,?,?,?,?,?,'approved',?,?,?,?)",[id,tenant,pid,type,start,end,txt(b.notes,1000),user.id,ts,ts]);
    audit(db,user,"staff.time_off.create","staff_time_off",id,{professional_id:pid,start_date:start,end_date:end,type});return send(res,201,{id,status:"approved"});
  }
  const goal=url.pathname.match(/^\/api\/staff\/([^/]+)\/goal$/);
  if(goal&&req.method==="PUT"){
    guard("staff.manage");const pid=decodeURIComponent(goal[1]);if(!one(db,"select id from professionals where id=? and tenant_id=?",[pid,tenant]))return send(res,404,{error:"professional_not_found"});
    const b=await parseBody(req),period=txt(b.period||new Date().toISOString().slice(0,7),7);if(!/^\d{4}-\d{2}$/.test(period))return send(res,400,{error:"invalid_period"});
    const id=uid(),ts=now();run(db,"insert into staff_goals(id,tenant_id,professional_id,period,target_revenue_cents,target_appointments,target_avg_ticket_cents,target_no_show_pct,created_by,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?) on conflict(tenant_id,professional_id,period) do update set target_revenue_cents=excluded.target_revenue_cents,target_appointments=excluded.target_appointments,target_avg_ticket_cents=excluded.target_avg_ticket_cents,target_no_show_pct=excluded.target_no_show_pct,updated_at=excluded.updated_at",[id,tenant,pid,period,cents(b.target_revenue),Math.max(0,Math.trunc(Number(b.target_appointments||0))),cents(b.target_avg_ticket),Math.max(0,Number(b.target_no_show_pct||0)),user.id,ts,ts]);
    audit(db,user,"staff.goal.update","professional",pid,{period});return send(res,200,{ok:true,period});
  }
  return false;
}
