import crypto from "node:crypto";

const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const all=(db,s,p=[])=>db.prepare(s).all(...p);
const run=(db,s,p=[])=>db.prepare(s).run(...p);
const txt=(v,n=800)=>String(v??"").trim().slice(0,n);

export function installPhase6(db){
  db.exec([
    "CREATE TABLE IF NOT EXISTS loyalty_ledger(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT NOT NULL,points INTEGER NOT NULL,reason TEXT NOT NULL,reference_type TEXT,reference_id TEXT,expires_at TEXT,created_by TEXT,created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_loyalty_client ON loyalty_ledger(tenant_id,client_id,created_at)",
    "CREATE TABLE IF NOT EXISTS referrals(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,referrer_client_id TEXT NOT NULL,referred_client_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reward_points INTEGER NOT NULL DEFAULT 50,created_at TEXT NOT NULL,converted_at TEXT,UNIQUE(tenant_id,referred_client_id))",
    "CREATE INDEX IF NOT EXISTS idx_referrals_tenant ON referrals(tenant_id,status,created_at)",
    "CREATE TABLE IF NOT EXISTS engagement_tasks(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT NOT NULL,appointment_id TEXT,kind TEXT NOT NULL,channel TEXT NOT NULL DEFAULT 'whatsapp',title TEXT NOT NULL,message TEXT NOT NULL,due_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_by TEXT,created_at TEXT NOT NULL,completed_at TEXT,dedupe_key TEXT NOT NULL,UNIQUE(tenant_id,dedupe_key))",
    "CREATE INDEX IF NOT EXISTS idx_engagement_due ON engagement_tasks(tenant_id,status,due_at)"
  ].join(";"));
}

function clientPoints(db,tenant,clientId){
  return Number(one(db,"select coalesce(sum(points),0) n from loyalty_ledger where tenant_id=? and client_id=?",[tenant,clientId])?.n||0);
}
function addPoints(db,tenant,clientId,points,reason,referenceType=null,referenceId=null,userId=null){
  const p=Math.trunc(Number(points||0));if(!p)return null;
  const exists=referenceType&&referenceId?one(db,"select id from loyalty_ledger where tenant_id=? and client_id=? and reference_type=? and reference_id=?",[tenant,clientId,referenceType,referenceId]):null;
  if(exists)return exists.id;
  const id=uid();
  run(db,"insert into loyalty_ledger(id,tenant_id,client_id,points,reason,reference_type,reference_id,created_by,created_at) values(?,?,?,?,?,?,?,?,?)",[id,tenant,clientId,p,txt(reason,240),referenceType,referenceId,userId,now()]);
  return id;
}
function addEngagement(db,tenant,{clientId,appointmentId=null,kind,title,message,dueAt,dedupeKey,userId=null}){
  const id=uid();
  run(db,"insert into engagement_tasks(id,tenant_id,client_id,appointment_id,kind,channel,title,message,due_at,status,created_by,created_at,dedupe_key) values(?,?,?,?,?,'whatsapp',?,?,?,'pending',?,?,?) on conflict(tenant_id,dedupe_key) do nothing",
    [id,tenant,clientId,appointmentId,kind,txt(title,180),txt(message,1200),dueAt,userId,now(),dedupeKey]);
  return id;
}

export function afterCheckoutRetention(db,tenant,appointment,userId,checkout){
  const total=Number(checkout?.total_cents||0),checkoutId=checkout?.checkout_id||null;
  const points=Math.max(1,Math.floor(total/1000));
  if(checkoutId)addPoints(db,tenant,appointment.client_id,points,"Atendimento concluído","checkout",checkoutId,userId);
  const client=one(db,"select name from clients where id=? and tenant_id=?",[appointment.client_id,tenant]);
  const first=String(client?.name||"").split(/\s+/)[0]||"";
  const due=new Date(Date.now()+24*3600000).toISOString();
  addEngagement(db,tenant,{clientId:appointment.client_id,appointmentId:appointment.id,kind:"postcare",title:"Pós-atendimento de "+(client?.name||"cliente"),message:"Oi, "+first+"! Passando para saber como você está depois do atendimento de ontem. Ficou tudo bem? 💛",dueAt:due,dedupeKey:"postcare-"+appointment.id,userId});
  const referral=one(db,"select * from referrals where tenant_id=? and referred_client_id=? and status='pending'",[tenant,appointment.client_id]);
  if(referral){
    const previous=Number(one(db,"select count(*) n from checkout_records cr join appointments a on a.id=cr.appointment_id where cr.tenant_id=? and a.client_id=? and cr.id<>?",[tenant,appointment.client_id,checkoutId])?.n||0);
    if(previous===0){
      run(db,"update referrals set status='converted',converted_at=? where id=?",[now(),referral.id]);
      addPoints(db,tenant,referral.referrer_client_id,Number(referral.reward_points||50),"Indicação convertida","referral",referral.id,userId);
    }
  }
  return {points,postcare:true};
}

function generateBirthdays(db,tenant,userId=null){
  const clients=all(db,"select id,name,birthday from clients where tenant_id=? and birthday is not null and birthday<>''",[tenant]);
  const today=new Date(),created=[];
  for(let offset=0;offset<=14;offset++){
    const d=new Date(today);d.setDate(d.getDate()+offset);
    const mm=String(d.getMonth()+1).padStart(2,"0"),dd=String(d.getDate()).padStart(2,"0");
    for(const c of clients){
      const b=String(c.birthday);if(b.slice(5,10)!==mm+"-"+dd)continue;
      const first=c.name.split(/\s+/)[0],date=d.toISOString().slice(0,10);
      const due=new Date(date+"T12:00:00Z").toISOString();
      const id=addEngagement(db,tenant,{clientId:c.id,kind:"birthday",title:"Aniversário de "+c.name,message:"Feliz aniversário, "+first+"! 🎉 Que seu novo ciclo venha cheio de coisas bonitas. Se quiser se cuidar um pouquinho hoje, estamos por aqui. 💛",dueAt:due,dedupeKey:"birthday-"+c.id+"-"+d.getFullYear(),userId});
      created.push(id);
    }
  }
  return created.length;
}
function clientRetention(db,tenant){
  const clients=all(db,"select id,name,phone,birthday,tags from clients where tenant_id=? order by name",[tenant]);
  return clients.map(c=>{
    const points=clientPoints(db,tenant,c.id);
    const sales=one(db,"select count(*) visits,coalesce(sum(cr.total_cents),0) total,max(a.start_at) last_visit from checkout_records cr join appointments a on a.id=cr.appointment_id where cr.tenant_id=? and a.client_id=?",[tenant,c.id])||{};
    const refs=Number(one(db,"select count(*) n from referrals where tenant_id=? and referrer_client_id=? and status='converted'",[tenant,c.id])?.n||0);
    const visits=Number(sales.visits||0),ltv=Number(sales.total||0)/100;
    const tier=ltv>=3000||visits>=20?"diamante":ltv>=1500||visits>=10?"ouro":ltv>=600||visits>=5?"prata":"base";
    return {...c,points,visits,lifetime_value:ltv,last_visit:sales.last_visit||null,referrals:refs,tier};
  }).sort((a,b)=>b.lifetime_value-a.lifetime_value);
}
function retentionOverview(db,tenant){
  const clients=clientRetention(db,tenant),tasks=all(db,"select status,kind,due_at from engagement_tasks where tenant_id=?",[tenant]);
  return {
    clients:clients.length,total_points:clients.reduce((n,c)=>n+c.points,0),
    vip:clients.filter(c=>["ouro","diamante"].includes(c.tier)).length,
    converted_referrals:Number(one(db,"select count(*) n from referrals where tenant_id=? and status='converted'",[tenant])?.n||0),
    pending_tasks:tasks.filter(x=>x.status==="pending").length,
    due_tasks:tasks.filter(x=>x.status==="pending"&&new Date(x.due_at)<=new Date()).length,
    birthdays_next14:tasks.filter(x=>x.status==="pending"&&x.kind==="birthday").length
  };
}

export async function handlePhase6Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit}){
  const guard=p=>requirePermission(user,p);
  if(req.method==="GET"&&url.pathname==="/api/retention/overview"){guard("retention.read");generateBirthdays(db,tenant,user.id);return send(res,200,retentionOverview(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/retention/clients"){guard("retention.read");return send(res,200,clientRetention(db,tenant))}
  if(req.method==="GET"&&url.pathname==="/api/retention/tasks"){
    guard("retention.read");generateBirthdays(db,tenant,user.id);
    const status=txt(url.searchParams.get("status")||"",20);
    const rows=status?all(db,"select e.*,c.name client_name,c.phone client_phone from engagement_tasks e join clients c on c.id=e.client_id where e.tenant_id=? and e.status=? order by e.due_at",[tenant,status]):all(db,"select e.*,c.name client_name,c.phone client_phone from engagement_tasks e join clients c on c.id=e.client_id where e.tenant_id=? order by case e.status when 'pending' then 0 else 1 end,e.due_at desc limit 300",[tenant]);
    return send(res,200,rows);
  }
  if(req.method==="POST"&&url.pathname==="/api/retention/tasks/generate"){guard("retention.write");const n=generateBirthdays(db,tenant,user.id);audit(db,user,"retention.generate","engagement_task",null,{generated:n});return send(res,200,{ok:true,generated:n})}
  const done=url.pathname.match(/^\/api\/retention\/tasks\/([^/]+)\/complete$/);
  if(req.method==="POST"&&done){guard("retention.write");const id=decodeURIComponent(done[1]),info=run(db,"update engagement_tasks set status='completed',completed_at=? where id=? and tenant_id=? and status='pending'",[now(),id,tenant]);if(!info.changes)return send(res,404,{error:"task_not_found"});audit(db,user,"retention.task.complete","engagement_task",id,{});return send(res,200,{ok:true})}
  if(req.method==="GET"&&url.pathname==="/api/referrals"){guard("retention.read");return send(res,200,all(db,"select r.*,a.name referrer_name,b.name referred_name from referrals r join clients a on a.id=r.referrer_client_id join clients b on b.id=r.referred_client_id where r.tenant_id=? order by r.created_at desc",[tenant]))}
  if(req.method==="POST"&&url.pathname==="/api/referrals"){
    guard("retention.write");const b=await parseBody(req),referrer=txt(b.referrer_client_id,64),referred=txt(b.referred_client_id,64);
    if(!referrer||!referred||referrer===referred)return send(res,400,{error:"invalid_referral"});
    if(!one(db,"select id from clients where id=? and tenant_id=?",[referrer,tenant])||!one(db,"select id from clients where id=? and tenant_id=?",[referred,tenant]))return send(res,404,{error:"client_not_found"});
    const id=uid();try{run(db,"insert into referrals(id,tenant_id,referrer_client_id,referred_client_id,status,reward_points,created_at) values(?,?,?,?, 'pending',?,?)",[id,tenant,referrer,referred,Math.max(0,Number(b.reward_points||50)),now()])}catch{return send(res,409,{error:"referral_exists"})}
    audit(db,user,"referral.create","referral",id,{referrer_client_id:referrer,referred_client_id:referred});return send(res,201,{id,status:"pending"});
  }
  if(req.method==="POST"&&url.pathname==="/api/loyalty/adjust"){
    guard("retention.write");const b=await parseBody(req),clientId=txt(b.client_id,64),points=Math.trunc(Number(b.points||0));if(!points)return send(res,400,{error:"points_required"});
    if(!one(db,"select id from clients where id=? and tenant_id=?",[clientId,tenant]))return send(res,404,{error:"client_not_found"});
    const id=addPoints(db,tenant,clientId,points,txt(b.reason||"Ajuste manual",240),"manual",uid(),user.id);audit(db,user,"loyalty.adjust","client",clientId,{points});return send(res,201,{id,points,balance:clientPoints(db,tenant,clientId)});
  }
  return false;
}
