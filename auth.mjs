import crypto from "node:crypto";
import { requestIsSecure } from "./request-security.mjs";
import { installMfa, mfaEnabled, beginMfaLogin, completeMfaLogin, mfaStatus, enrollMfa, confirmMfa, disableMfa } from "./mfa.mjs";

const SESSION_COOKIE="salon_session";
const DAY=86400000;
const SESSION_IDLE_HOURS=8;

function sha(v){return crypto.createHash("sha256").update(String(v)).digest("hex")}
function scrypt(password,salt){return crypto.scryptSync(password,salt,64).toString("hex")}
function cookies(req){
  const out={};
  for(const part of String(req.headers.cookie||"").split(";")){
    const i=part.indexOf("="); if(i<1)continue;
    out[decodeURIComponent(part.slice(0,i).trim())]=decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
function secureRequest(req){return requestIsSecure(req)}

export function installAuth(db){
  const cols=db.prepare("pragma table_info(users)").all().map(x=>x.name);
  if(!cols.includes("password_hash"))db.exec("alter table users add column password_hash TEXT");
  if(!cols.includes("updated_at"))db.exec("alter table users add column updated_at TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_sessions(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,user_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,created_at TEXT NOT NULL,last_seen_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id),FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token_hash);
    CREATE TABLE IF NOT EXISTS user_invites(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL DEFAULT '',role TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,accepted_at TEXT,created_by TEXT,created_at TEXT NOT NULL,
      FOREIGN KEY(tenant_id) REFERENCES tenants(id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_invites_tenant_email ON user_invites(tenant_id,email,expires_at);
    CREATE TABLE IF NOT EXISTS password_resets(
      id TEXT PRIMARY KEY,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets(token_hash);
    CREATE TABLE IF NOT EXISTS auth_login_attempts(
      attempt_key TEXT PRIMARY KEY, failures INTEGER NOT NULL,window_started TEXT NOT NULL,
      blocked_until TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_log(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,user_id TEXT,action TEXT NOT NULL,entity_type TEXT,entity_id TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL
    );
  `);
  installMfa(db);
  const sessionCols=db.prepare("pragma table_info(auth_sessions)").all().map(x=>x.name);
  if(!sessionCols.includes("device_label"))db.exec("alter table auth_sessions add column device_label TEXT NOT NULL DEFAULT 'Dispositivo não identificado'");
}

export function makePasswordHash(password){
  const salt=crypto.randomBytes(16).toString("hex");
  return "scrypt$"+salt+"$"+scrypt(password,salt);
}
export function verifyPassword(password,stored){
  const [kind,salt,expected]=String(stored||"").split("$");
  if(kind!=="scrypt"||!salt||!expected)return false;
  const actual=scrypt(password,salt);
  const a=Buffer.from(actual,"hex"),b=Buffer.from(expected,"hex");
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
export function authenticate(req,db){
  const token=cookies(req)[SESSION_COOKIE];
  if(!token)return null;
  const row=db.prepare(`select s.id session_id,s.tenant_id,s.user_id,s.expires_at,u.name,u.email,u.role,u.active
    from auth_sessions s join users u on u.id=s.user_id and u.tenant_id=s.tenant_id
    where s.token_hash=? and datetime(s.expires_at)>datetime('now')
      and datetime(s.last_seen_at)>datetime('now','-${SESSION_IDLE_HOURS} hours') limit 1`).get(sha(token));
  if(!row||!row.active)return null;
  db.prepare("update auth_sessions set last_seen_at=? where id=?").run(new Date().toISOString(),row.session_id);
  return {sessionId:row.session_id,tenantId:row.tenant_id,id:row.user_id,name:row.name,email:row.email,role:row.role};
}
export function audit(db,user,action,entityType=null,entityId=null,metadata={}){
  db.prepare("insert into audit_log(id,tenant_id,user_id,action,entity_type,entity_id,metadata,created_at) values(?,?,?,?,?,?,?,?)")
    .run(crypto.randomUUID(),user?.tenantId||metadata.tenantId||"",user?.id||null,action,entityType,entityId,JSON.stringify(metadata||{}),new Date().toISOString());
}
export function can(user,permission){
  if(!user)return false;
  if(user.role==="owner")return true;
  const grants={
    manager:["marketing.read","marketing.write","dashboard.read","clients.read","clients.write","team.read","team.write","services.read","services.write","appointments.read","appointments.write","resources.read","resources.write","conversations.read","conversations.write","whatsapp.send","jev.read","finance.read","finance.write","cash.read","cash.write","inventory.read","inventory.write","suppliers.read","suppliers.write","commissions.read","commissions.write","checkout.write","analytics.read","recovery.write","agents.read","agents.write","agents.approve","agents.execute","admin.read","retention.read","retention.write","technical.read","technical.write","packages.read","packages.manage","packages.sell","staff.read","staff.manage","retail.read","retail.manage","retail.sell","reports.read","reports.export"],
    reception:["marketing.read","dashboard.read","clients.read","clients.write","team.read","services.read","appointments.read","appointments.write","resources.read","conversations.read","conversations.write","whatsapp.send","cash.read","cash.write","inventory.read","suppliers.read","checkout.write","analytics.read","recovery.write","retention.read","retention.write","technical.read","packages.read","packages.sell","staff.read","retail.read","retail.sell"],
    professional:["dashboard.read","clients.read","team.read","staff.read","services.read","appointments.read","appointments.write","technical.read","technical.write"]
  };
  return (grants[user.role]||[]).includes(permission);
}
export function requirePermission(user,permission){
  if(!user){const e=new Error("unauthorized");e.status=401;throw e}
  if(!can(user,permission)){const e=new Error("forbidden");e.status=403;throw e}
}

function sessionCookie(req,token,maxAgeSec){
  const secure=secureRequest(req)?"; Secure":"";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}
function deleteSessionCookie(req){return sessionCookie(req,"",0)}

const LOGIN_WINDOW_MS=15*60*1000;
const LOGIN_MAX_FAILURES=8;
function loginAttemptKey(email,workspace){return sha(email+"|"+workspace)}
function blockedLogin(db,key,ts){
  const row=db.prepare("select blocked_until from auth_login_attempts where attempt_key=?").get(key);
  return !!(row?.blocked_until&&new Date(row.blocked_until).getTime()>ts);
}
function loginFailure(db,key,ts){
  db.exec("BEGIN IMMEDIATE");
  try{
    const row=db.prepare("select failures,window_started from auth_login_attempts where attempt_key=?").get(key);
    const windowStart=new Date(row?.window_started||0).getTime();
    const fresh=!row||!Number.isFinite(windowStart)||ts-windowStart>LOGIN_WINDOW_MS;
    const failures=(fresh?0:Number(row.failures))+1;
    const started=fresh?new Date(ts).toISOString():row.window_started;
    const until=failures>=LOGIN_MAX_FAILURES?new Date(ts+LOGIN_WINDOW_MS).toISOString():null;
    db.prepare(`insert into auth_login_attempts(attempt_key,failures,window_started,blocked_until)
      values(?,?,?,?) on conflict(attempt_key) do update
      set failures=excluded.failures,window_started=excluded.window_started,blocked_until=excluded.blocked_until`)
      .run(key,failures,started,until);
    db.exec("COMMIT");
    return failures>=LOGIN_MAX_FAILURES;
  }catch(e){db.exec("ROLLBACK");throw e}
}
function secureSetupRequired(){
  return process.env.NODE_ENV==="production";
}
function setupAuthorized(req){
  if(!secureSetupRequired())return true;
  const secret=String(process.env.NOVAGENTE_SETUP_TOKEN||"");
  if(secret.length<32)return false;
  const supplied=String(req.headers["x-novagente-setup-token"]||"");
  const actual=Buffer.from(supplied),expected=Buffer.from(secret);
  return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}

export async function handleAuthApi({req,res,url,db,send,parseBody,defaultTenant}){
  if(url.pathname==="/api/auth/state"&&req.method==="GET"){
    const tenant=db.prepare("select id,name,slug from tenants where id=?").get(defaultTenant);
    const claimed=!!db.prepare("select 1 x from users where tenant_id=? and role='owner' and password_hash is not null limit 1").get(defaultTenant);
    return {handled:true,result:send(res,200,{claimed,tenant})};
  }
  if(url.pathname==="/api/auth/setup"&&req.method==="POST"){
    // Em produção, quem alcança a página pública não pode tomar a conta dona.
    // O provisionamento inicial exige segredo longo definido fora do repositório.
    if(!setupAuthorized(req))return {handled:true,result:send(res,503,{error:"initial_setup_requires_server_token"})};
    const claimed=!!db.prepare("select 1 x from users where tenant_id=? and role='owner' and password_hash is not null limit 1").get(defaultTenant);
    if(claimed)return {handled:true,result:send(res,409,{error:"already_claimed"})};
    const b=await parseBody(req);const password=String(b.password||"");
    if(password.length<10)return {handled:true,result:send(res,400,{error:"password_too_short",min:10})};
    const owner=db.prepare("select id,email,name from users where tenant_id=? and role='owner' order by created_at limit 1").get(defaultTenant);
    if(!owner)return {handled:true,result:send(res,500,{error:"owner_missing"})};
    const email=String(b.email||owner.email||"").trim().toLowerCase();
    const name=String(b.name||owner.name||"Proprietária").trim().slice(0,120);
    db.prepare("update users set email=?,name=?,password_hash=?,updated_at=? where id=?").run(email,name,makePasswordHash(password),new Date().toISOString(),owner.id);
    return {handled:true,result:send(res,201,{ok:true,email})};
  }
  if(url.pathname==="/api/auth/reset"&&req.method==="GET"){
    const token=String(url.searchParams.get("token")||"");
    const row=token?db.prepare("select r.id,r.expires_at,r.used_at,u.email,u.name from password_resets r join users u on u.id=r.user_id where r.token_hash=? limit 1").get(sha(token)):null;
    if(!row||row.used_at||new Date(row.expires_at)<=new Date())return {handled:true,result:send(res,410,{error:"reset_invalid_or_expired"})};
    return {handled:true,result:send(res,200,{ok:true,email:row.email,name:row.name,expires_at:row.expires_at})};
  }
  if(url.pathname==="/api/auth/reset"&&req.method==="POST"){
    const b=await parseBody(req),token=String(b.token||""),password=String(b.password||"");
    if(password.length<10)return {handled:true,result:send(res,400,{error:"password_too_short",min:10})};
    const row=token?db.prepare("select * from password_resets where token_hash=? limit 1").get(sha(token)):null;
    if(!row||row.used_at||new Date(row.expires_at)<=new Date())return {handled:true,result:send(res,410,{error:"reset_invalid_or_expired"})};
    const ts=new Date().toISOString();
    db.exec("BEGIN IMMEDIATE");
    try{
      db.prepare("update users set password_hash=?,updated_at=? where id=? and tenant_id=?").run(makePasswordHash(password),ts,row.user_id,row.tenant_id);
      db.prepare("update password_resets set used_at=? where id=?").run(ts,row.id);
      db.prepare("delete from auth_sessions where user_id=? and tenant_id=?").run(row.user_id,row.tenant_id);
      db.exec("COMMIT");
    }catch(e){db.exec("ROLLBACK");throw e}
    return {handled:true,result:send(res,200,{ok:true})};
  }
  // Convites: o token só é retornado uma vez à proprietária, jamais listado.
  // Aceitação não concede acesso de proprietária e exige senha própria.
  if(url.pathname==="/api/auth/invitations/accept"&&req.method==="POST"){
    const b=await parseBody(req),token=String(b.token||"").trim(),
      password=String(b.password||"");
    if(token.length<30||password.length<12||password.length>128)
      return {handled:true,result:send(res,400,{error:"invalid_invite_or_password"})};
    let result;
    db.exec("BEGIN IMMEDIATE");
    try{
      const invite=db.prepare(`select * from user_invites where token_hash=? and accepted_at is null and expires_at>?`).get(sha(token),new Date().toISOString());
      if(!invite||!["manager","reception","professional"].includes(invite.role))
        throw Object.assign(new Error("invitation_invalid_or_expired"),{status:410});
      const existing=db.prepare("select id from users where tenant_id=? and lower(email)=?").get(invite.tenant_id,invite.email.toLowerCase());
      if(existing)throw Object.assign(new Error("user_already_exists"),{status:409});
      const userId=crypto.randomUUID(),stamp=new Date().toISOString();
      db.prepare(`insert into users(id,tenant_id,name,email,role,active,created_at,password_hash,updated_at)
        values(?,?,?,?,?,1,?,?,?)`).run(userId,invite.tenant_id,invite.name,invite.email,invite.role,stamp,makePasswordHash(password),stamp);
      db.prepare("update user_invites set accepted_at=? where id=? and accepted_at is null").run(stamp,invite.id);
      db.exec("COMMIT");
      result={ok:true,email:invite.email,role:invite.role};
    }catch(e){db.exec("ROLLBACK");return {handled:true,result:send(res,e.status||400,{error:e.message||"invitation_failed"})}}
    return {handled:true,result:send(res,201,result)};
  }
  if(url.pathname==="/api/auth/login"&&req.method==="POST"){
    const b=await parseBody(req),email=String(b.email||"").trim().toLowerCase().slice(0,200),password=String(b.password||""),workspace=String(b.workspace||"").trim().toLowerCase().slice(0,120);
    if(!email||password.length>256)return {handled:true,result:send(res,401,{error:"invalid_credentials"})};
    const attemptKey=loginAttemptKey(email,workspace),time=Date.now();
    if(blockedLogin(db,attemptKey,time))
      return {handled:true,result:send(res,429,{error:"login_temporarily_blocked"},{"retry-after":"900"})};
    let matches;
    if(workspace)matches=db.prepare("select u.id,u.tenant_id,u.name,u.email,u.role,u.active,u.password_hash from users u join tenants t on t.id=u.tenant_id where lower(u.email)=? and lower(t.slug)=?").all(email,workspace);
    else matches=db.prepare("select id,tenant_id,name,email,role,active,password_hash from users where lower(email)=?").all(email);
    if(matches.length>1&&!workspace)return {handled:true,result:send(res,409,{error:"workspace_required"})};
    const u=matches[0];
    if(!u||!u.active||!verifyPassword(password,u.password_hash)){
      const locked=loginFailure(db,attemptKey,time);
      return {handled:true,result:locked?
        send(res,429,{error:"login_temporarily_blocked"},{"retry-after":"900"}):
        send(res,401,{error:"invalid_credentials"})};
    }
    if(mfaEnabled(db,u.id,u.tenant_id)){
      const challenge=beginMfaLogin(db,u);
      return {handled:true,result:send(res,202,challenge)};
    }
    db.prepare("delete from auth_login_attempts where attempt_key=?").run(attemptKey);
    const token=crypto.randomBytes(32).toString("base64url"),ts=new Date(),expires=new Date(ts.getTime()+7*DAY);
    db.prepare("delete from auth_sessions where datetime(expires_at)<=datetime('now')").run();
    const deviceLabel=String(req.headers["user-agent"]||"Dispositivo não identificado").slice(0,180);
    db.prepare("insert into auth_sessions(id,tenant_id,user_id,token_hash,expires_at,created_at,last_seen_at,device_label) values(?,?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(),u.tenant_id,u.id,sha(token),expires.toISOString(),ts.toISOString(),ts.toISOString(),deviceLabel);
    const user={id:u.id,tenantId:u.tenant_id,name:u.name,email:u.email,role:u.role};
    audit(db,user,"auth.login","user",u.id,{});
    return {handled:true,result:send(res,200,{ok:true,user},{"set-cookie":sessionCookie(req,token,7*24*3600)})};
  }
  if(url.pathname==="/api/auth/sessions"&&req.method==="GET"){
    const user=authenticate(req,db);
    if(!user)return {handled:true,result:send(res,401,{error:"unauthorized"})};
    const rows=db.prepare("select id,device_label,created_at,last_seen_at,expires_at from auth_sessions where tenant_id=? and user_id=? and datetime(expires_at)>datetime('now') and datetime(last_seen_at)>datetime('now','-8 hours') order by last_seen_at desc").all(user.tenantId,user.id);
    return {handled:true,result:send(res,200,{sessions:rows.map(x=>({...x,current:x.id===user.sessionId})),idle_timeout_hours:SESSION_IDLE_HOURS})};
  }
  if(url.pathname==="/api/auth/sessions/revoke"&&req.method==="POST"){
    const user=authenticate(req,db);
    if(!user)return {handled:true,result:send(res,401,{error:"unauthorized"})};
    const body=await parseBody(req),sessionId=String(body.session_id||"").trim();
    if(!sessionId)return {handled:true,result:send(res,400,{error:"session_id_required"})};
    const out=db.prepare("delete from auth_sessions where id=? and user_id=? and tenant_id=?").run(sessionId,user.id,user.tenantId);
    if(!out.changes)return {handled:true,result:send(res,404,{error:"session_not_found"})};
    audit(db,user,"auth.session.revoke","auth_session",sessionId,{self:sessionId===user.sessionId});
    const headers=sessionId===user.sessionId?{"set-cookie":deleteSessionCookie(req)}:{};
    return {handled:true,result:send(res,200,{ok:true,revoked:sessionId},headers)};
  }
  if(url.pathname==="/api/auth/logout"&&req.method==="POST"){
    const token=cookies(req)[SESSION_COOKIE];
    if(token)db.prepare("delete from auth_sessions where token_hash=?").run(sha(token));
    return {handled:true,result:send(res,200,{ok:true},{"set-cookie":deleteSessionCookie(req)})};
  }
  if(url.pathname==="/api/auth/me"&&req.method==="GET"){
    const user=authenticate(req,db);
    return {handled:true,result:user?send(res,200,{user}):send(res,401,{error:"unauthorized"})};
  }
  return {handled:false};
}
