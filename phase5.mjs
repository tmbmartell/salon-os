import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import path from "node:path";

const now=()=>new Date().toISOString();
const all=(db,s,p=[])=>db.prepare(s).all(...p);
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const run=(db,s,p=[])=>db.prepare(s).run(...p);
const txt=(v,n=400)=>String(v??"").trim().slice(0,n);

export function installPhase5(db){
  db.exec([
    "CREATE TABLE IF NOT EXISTS app_settings(tenant_id TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL DEFAULT '{}',updated_by TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,key))",
    "CREATE TABLE IF NOT EXISTS security_events(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,user_id TEXT,event_type TEXT NOT NULL,severity TEXT NOT NULL DEFAULT 'info',ip_hash TEXT,details TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL)",
    "CREATE INDEX IF NOT EXISTS idx_security_events ON security_events(tenant_id,created_at)"
  ].join(";"));
}

function fileStat(path){
  try{const s=fs.statSync(path);return {exists:true,size:s.size,mtime:s.mtime.toISOString()}}catch{return {exists:false,size:0,mtime:null}}
}
function dbStats(db){
  const counts={};
  for(const t of ["clients","appointments","checkout_records","financial_entries","products","agent_tasks","audit_log"]){
    try{counts[t]=Number(one(db,"select count(*) n from "+t)?.n||0)}catch{counts[t]=null}
  }
  let integrity="unknown";
  try{integrity=one(db,"pragma integrity_check")?.integrity_check||one(db,"pragma integrity_check")?.["integrity_check"]||"ok"}catch{}
  return {integrity,counts};
}
function configuredPaths(){
  const database=path.resolve(process.env.SALON_DB||path.join(process.cwd(),"data","salon.sqlite"));
  return {dbDir:path.dirname(database),backupDir:path.resolve(
    process.env.NOVAGENTE_BACKUP_DIR||path.join(path.dirname(database),"backups"))};
}
function backupStatus(){
  const {backupDir}=configuredPaths();
  try{
    const records=fs.readdirSync(backupDir).filter(n=>n.endsWith(".nebak"))
      .map(name=>({name,...fileStat(path.join(backupDir,name))}))
      .sort((a,b)=>String(b.mtime).localeCompare(String(a.mtime)));
    return {configured:true,encrypted:true,count:records.length,
      latest:records[0]||null,recent:records.slice(0,10),
      warning:"Cópia cifrada local. Não substitui cópia externa e teste de restauração."};
  }catch{
    return {configured:true,encrypted:true,count:0,latest:null,recent:[],
      warning:"Nenhum backup cifrado encontrado no diretório configurado."};
  }
}
function restoreStatus(){
  const {backupDir}=configuredPaths();
  const receipt=path.join(backupDir,"restore-verify.json");
  try{
    const verified=JSON.parse(fs.readFileSync(receipt,"utf8"));
    if(verified.ok===true&&verified.sqlite_integrity==="ok"&&
      typeof verified.backup_sha256==="string"&&
      /^[a-f0-9]{64}$/.test(verified.backup_sha256))
      return {ok:true,checked_at:verified.checked_at,
        asset_count:verified.asset_count,warning:"Restauração verificada em diretório separado."};
  }catch{}
  return {ok:false,checked_at:null,error:"restore_not_verified"};
}
function systemInfo(){
  const memTotal=os.totalmem(),memFree=os.freemem();
  let disk=null;
  try{const s=fs.statfsSync(configuredPaths().dbDir);
    disk={total:s.blocks*s.bsize,free:s.bavail*s.bsize,used:(s.blocks-s.bavail)*s.bsize};
  }catch{}
  return {uptime_seconds:Math.round(process.uptime()),host_uptime_seconds:Math.round(os.uptime()),
    memory:{total:memTotal,free:memFree,used:memTotal-memFree},disk};
}

export async function handlePhase5Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit}){
  const guard=p=>requirePermission(user,p);
  if(req.method==="GET"&&url.pathname==="/api/admin/overview"){
    guard("admin.read");
    const users=all(db,"select id,name,email,role,active,created_at,updated_at from users where tenant_id=? order by role,name",[tenant]);
    const audits=all(db,"select a.*,u.name user_name from audit_log a left join users u on u.id=a.user_id where a.tenant_id=? order by a.created_at desc limit 150",[tenant]).map(x=>({...x,metadata:JSON.parse(x.metadata||"{}")}));
    const security=all(db,"select * from security_events where tenant_id=? order by created_at desc limit 100",[tenant]).map(x=>({...x,details:JSON.parse(x.details||"{}")}));
    return send(res,200,{users,audits,security,backup:backupStatus(),restore:restoreStatus(),database:dbStats(db),system:systemInfo()});
  }
  if(req.method==="GET"&&url.pathname==="/api/admin/audit"){
    guard("admin.read");
    const limit=Math.min(500,Math.max(1,Number(url.searchParams.get("limit")||200)));
    return send(res,200,all(db,"select a.*,u.name user_name from audit_log a left join users u on u.id=a.user_id where a.tenant_id=? order by a.created_at desc limit ?",[tenant,limit]).map(x=>({...x,metadata:JSON.parse(x.metadata||"{}")})));
  }
  if(req.method==="GET"&&url.pathname==="/api/admin/users"){
    guard("admin.read");
    return send(res,200,all(db,"select id,name,email,role,active,created_at,updated_at from users where tenant_id=? order by role,name",[tenant]));
  }
  const roleRoute=url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/role$/);
  if(req.method==="PATCH"&&roleRoute){
    guard("admin.write");
    const id=decodeURIComponent(roleRoute[1]),target=one(db,"select * from users where id=? and tenant_id=?",[id,tenant]);if(!target)return send(res,404,{error:"user_not_found"});
    const b=await parseBody(req),role=txt(b.role,30),allowed=["owner","manager","reception","professional"];
    if(!allowed.includes(role))return send(res,400,{error:"invalid_role"});
    if(target.role==="owner"&&role!=="owner"){
      const owners=Number(one(db,"select count(*) n from users where tenant_id=? and role='owner' and active=1",[tenant])?.n||0);
      if(owners<=1)return send(res,409,{error:"last_owner"});
    }
    run(db,"update users set role=?,updated_at=? where id=?",[role,now(),id]);
    audit(db,user,"admin.user.role","user",id,{from:target.role,to:role});
    return send(res,200,{ok:true,id,role});
  }
  const activeRoute=url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/active$/);
  if(req.method==="PATCH"&&activeRoute){
    guard("admin.write");
    const id=decodeURIComponent(activeRoute[1]),target=one(db,"select * from users where id=? and tenant_id=?",[id,tenant]);if(!target)return send(res,404,{error:"user_not_found"});
    const b=await parseBody(req),active=b.active?1:0;
    if(target.id===user.id&&!active)return send(res,409,{error:"cannot_disable_self"});
    if(target.role==="owner"&&!active){
      const owners=Number(one(db,"select count(*) n from users where tenant_id=? and role='owner' and active=1",[tenant])?.n||0);
      if(owners<=1)return send(res,409,{error:"last_owner"});
    }
    run(db,"update users set active=?,updated_at=? where id=?",[active,now(),id]);
    if(!active)run(db,"delete from auth_sessions where user_id=? and tenant_id=?",[id,tenant]);
    audit(db,user,"admin.user.active","user",id,{active:!!active});
    return send(res,200,{ok:true,id,active:!!active});
  }
  if(req.method==="GET"&&url.pathname==="/api/admin/settings"){
    guard("admin.read");
    const rows=all(db,"select key,value,updated_at from app_settings where tenant_id=? order by key",[tenant]);
    const out={};for(const r of rows){try{out[r.key]=JSON.parse(r.value)}catch{out[r.key]=r.value}}
    return send(res,200,out);
  }
  if(req.method==="PUT"&&url.pathname==="/api/admin/settings"){
    guard("admin.write");const b=await parseBody(req),key=txt(b.key,80);if(!key)return send(res,400,{error:"key_required"});
    const value=JSON.stringify(b.value??null);
    run(db,"insert into app_settings(tenant_id,key,value,updated_by,updated_at) values(?,?,?,?,?) on conflict(tenant_id,key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at",[tenant,key,value,user.id,now()]);
    audit(db,user,"admin.settings.update","app_settings",key,{});
    return send(res,200,{ok:true,key});
  }
  return false;
}
