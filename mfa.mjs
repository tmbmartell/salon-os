// NOVAGENTE Estética — MFA TOTP (RFC 6238) e códigos de recuperação únicos.
// O segredo do autenticador é cifrado no banco. Operações com código usam transação
// para impedir reuso em duas instâncias da aplicação.
import crypto from "node:crypto";

const now=()=>new Date().toISOString();
const digest=s=>crypto.createHash("sha256").update(String(s)).digest("hex");
const privateKey=()=>{
  const raw=String(process.env.NOVAGENTE_MFA_KEY||"");
  const key=Buffer.from(raw,"base64");
  return key.length===32&&raw.length>=43&&key.toString("base64").replace(/=+$/,"")===raw.replace(/=+$/,"")?key:null;
};
export const mfaConfigured=()=>!!privateKey();
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
function encrypt(secret){
  const key=privateKey();
  if(!key)throw failure("mfa_key_not_configured",503);
  try{
    const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv);
    const ciphertext=Buffer.concat([cipher.update(secret,"utf8"),cipher.final()]);
    return "v1:"+Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString("base64");
  }finally{key.fill(0)}
}
function decrypt(sealed){
  const key=privateKey();
  if(!key)throw failure("mfa_key_not_configured",503);
  try{
    if(!String(sealed||"").startsWith("v1:"))throw failure("invalid_mfa_secret",500);
    const bytes=Buffer.from(sealed.slice(3),"base64");
    if(bytes.length<29)throw failure("invalid_mfa_secret",500);
    const decipher=crypto.createDecipheriv("aes-256-gcm",key,bytes.subarray(0,12));
    decipher.setAuthTag(bytes.subarray(12,28));
    return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString("utf8");
  }finally{key.fill(0)}
}
const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32Encode(bytes){
  let buffer=0,bits=0,result="";
  for(const byte of bytes){
    buffer=(buffer<<8)|byte;bits+=8;
    while(bits>=5){bits-=5;result+=alphabet[(buffer>>>bits)&31]}
    buffer&=(1<<bits)-1;
  }
  if(bits>0)result+=alphabet[(buffer<<(5-bits))&31];
  return result;
}
function base32Decode(encoded){
  let v=0,bits=0,output=[];
  for(const ch of String(encoded||"").replace(/\s|=/g,"").toUpperCase()){
    const i=alphabet.indexOf(ch);
    if(i<0)throw failure("invalid_mfa_secret",500);
    v=(v<<5)|i;bits+=5;
    if(bits>=8){bits-=8;output.push((v>>>bits)&255);v&=(1<<bits)-1}
  }
  return Buffer.from(output);
}
export function totpAt(secret,time=Date.now(),digits=6){
  const counter=Math.floor(time/30000);
  const bytes=Buffer.alloc(8);bytes.writeBigUInt64BE(BigInt(counter));
  const hmac=crypto.createHmac("sha1",base32Decode(secret)).update(bytes).digest();
  const offset=hmac[hmac.length-1]&15;
  return String((hmac.readUInt32BE(offset)&0x7fffffff)%(10**digits)).padStart(digits,"0");
}
export function verifyTotp(secret,code,{time=Date.now(),lastCounter=-1}={}){
  if(!/^\d{6}$/.test(String(code||"")))return null;
  const current=Math.floor(time/30000);
  for(const counter of [current-1,current,current+1]){
    if(counter<=lastCounter||counter<0)continue;
    const expected=totpAt(secret,counter*30000);
    if(crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(String(code))))return counter;
  }
  return null;
}
function inTransaction(db,fn){
  db.exec("BEGIN IMMEDIATE");
  try{const result=fn();db.exec("COMMIT");return result}
  catch(e){db.exec("ROLLBACK");throw e}
}
export function installMfa(db){
  db.exec(`CREATE TABLE IF NOT EXISTS user_mfa(
    user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,encrypted_secret TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,last_counter INTEGER NOT NULL DEFAULT -1,
    pending_expires_at TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,tenant_id)
  );
  CREATE TABLE IF NOT EXISTS mfa_recovery_codes(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,
    code_hash TEXT NOT NULL UNIQUE,used_at TEXT,created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mfa_recovery_user ON mfa_recovery_codes(tenant_id,user_id,used_at);
  CREATE TABLE IF NOT EXISTS mfa_login_challenges(
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mfa_challenge_user ON mfa_login_challenges(tenant_id,user_id);`);
}
export const mfaEnabled=(db,userId,tenant)=>!!db.prepare(
  "select 1 x from user_mfa where user_id=? and tenant_id=? and enabled=1"
).get(userId,tenant);
export function beginMfaLogin(db,user){
  const token=crypto.randomBytes(32).toString("base64url");
  const id=crypto.randomUUID(),stamp=now(),expires=new Date(Date.now()+5*60000).toISOString();
  db.prepare("delete from mfa_login_challenges where user_id=? and tenant_id=?").run(user.id,user.tenant_id);
  db.prepare("delete from mfa_login_challenges where expires_at<?").run(stamp);
  db.prepare("insert into mfa_login_challenges(id,tenant_id,user_id,token_hash,expires_at,created_at) values(?,?,?,?,?,?)")
    .run(id,user.tenant_id,user.id,digest(token),expires,stamp);
  return {mfa_required:true,challenge:token,expires_in_seconds:300};
}
function useVerification(db,entry,code){
  if(typeof code!=="string")return false;
  const numeric=verifyTotp(decrypt(entry.encrypted_secret),code,{lastCounter:entry.last_counter});
  if(numeric!==null){
    db.prepare("update user_mfa set last_counter=?,updated_at=? where user_id=? and tenant_id=?")
      .run(numeric,now(),entry.user_id,entry.tenant_id);
    return true;
  }
  const normalized=code.toUpperCase().replace(/[\s-]/g,"");
  if(!/^[0-9A-F]{32}$/.test(normalized))return false;
  const tokenHash=digest(normalized);
  const record=db.prepare("select id from mfa_recovery_codes where user_id=? and tenant_id=? and code_hash=? and used_at is null")
    .get(entry.user_id,entry.tenant_id,tokenHash);
  if(!record)return false;
  db.prepare("update mfa_recovery_codes set used_at=? where id=? and used_at is null").run(now(),record.id);
  return true;
}
export function completeMfaLogin(db,token,code){
  if(typeof token!=="string"||token.length<30||token.length>200)throw failure("mfa_invalid_or_expired",401);
  return inTransaction(db,()=>{
    const record=db.prepare(`select c.*,u.name,u.email,u.role,u.active,m.encrypted_secret,m.last_counter
      from mfa_login_challenges c join users u on u.id=c.user_id and u.tenant_id=c.tenant_id
      join user_mfa m on m.user_id=c.user_id and m.tenant_id=c.tenant_id and m.enabled=1
      where c.token_hash=? and c.expires_at>? limit 1`).get(digest(token),now());
    if(!record||!record.active)throw failure("mfa_invalid_or_expired",401);
    if(record.attempts>=5)throw failure("mfa_challenge_locked",429);
    const ok=useVerification(db,record,String(code||""));
    if(!ok){
      db.prepare("update mfa_login_challenges set attempts=attempts+1 where id=?").run(record.id);
      // Must commit failed attempt: return an error record rather than throw.
      return {error:"mfa_invalid_code",status:record.attempts>=4?429:401};
    }
    db.prepare("delete from mfa_login_challenges where id=?").run(record.id);
    return {user:{id:record.user_id,tenant_id:record.tenant_id,name:record.name,
      email:record.email,role:record.role}};
  });
}
export function mfaStatus(db,user){
  const row=db.prepare("select enabled,pending_expires_at from user_mfa where user_id=? and tenant_id=?")
    .get(user.id,user.tenantId);
  const remaining=db.prepare("select count(*) n from mfa_recovery_codes where user_id=? and tenant_id=? and used_at is null")
    .get(user.id,user.tenantId)?.n||0;
  return {configured:mfaConfigured(),enabled:!!row?.enabled,
    pending:!!row&&!row.enabled&&!!row.pending_expires_at&&row.pending_expires_at>now(),
    recovery_remaining:remaining};
}
export function enrollMfa(db,user,password,verifyPassword){
  if(!["owner","manager"].includes(user.role))throw failure("mfa_management_only",403);
  if(!mfaConfigured())throw failure("mfa_key_not_configured",503);
  const account=db.prepare("select password_hash from users where tenant_id=? and id=?")
    .get(user.tenantId,user.id);
  if(!verifyPassword(String(password||""),account?.password_hash))throw failure("invalid_credentials",403);
  if(mfaEnabled(db,user.id,user.tenantId))throw failure("mfa_already_enabled",409);
  const secret=base32Encode(crypto.randomBytes(20));
  const expires=new Date(Date.now()+10*60000).toISOString();
  inTransaction(db,()=>{
    db.prepare(`insert into user_mfa(user_id,tenant_id,encrypted_secret,enabled,last_counter,pending_expires_at,updated_at)
      values(?,?,?,0,-1,?,?) on conflict(user_id,tenant_id)
      do update set encrypted_secret=excluded.encrypted_secret,enabled=0,last_counter=-1,
        pending_expires_at=excluded.pending_expires_at,updated_at=excluded.updated_at`)
      .run(user.id,user.tenantId,encrypt(secret),expires,now());
    db.prepare("delete from mfa_recovery_codes where user_id=? and tenant_id=?").run(user.id,user.tenantId);
  });
  const label=encodeURIComponent("NOVAGENTE Estética:"+user.email);
  const issuer=encodeURIComponent("NOVAGENTE Estética");
  return {secret,otpauth_url:`otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`,
    expires_at:expires};
}
export function confirmMfa(db,user,code){
  return inTransaction(db,()=>{
    const row=db.prepare("select * from user_mfa where user_id=? and tenant_id=?")
      .get(user.id,user.tenantId);
    if(!row||row.enabled||!row.pending_expires_at||row.pending_expires_at<=now())
      throw failure("mfa_enrollment_expired",409);
    const counter=verifyTotp(decrypt(row.encrypted_secret),String(code||""));
    if(counter===null)throw failure("mfa_invalid_code",401);
    db.prepare("update user_mfa set enabled=1,last_counter=?,pending_expires_at=null,updated_at=? where user_id=? and tenant_id=?")
      .run(counter,now(),user.id,user.tenantId);
    const recovery=Array.from({length:8},()=>crypto.randomBytes(16).toString("hex").toUpperCase());
    db.prepare("delete from mfa_recovery_codes where user_id=? and tenant_id=?").run(user.id,user.tenantId);
    const stmt=db.prepare("insert into mfa_recovery_codes(id,user_id,tenant_id,code_hash,created_at) values(?,?,?,?,?)");
    for(const value of recovery)stmt.run(crypto.randomUUID(),user.id,user.tenantId,digest(value),now());
    // The active enrollment session is retained; previous sessions must reauthenticate.
    db.prepare("delete from auth_sessions where user_id=? and tenant_id=? and id<>?")
      .run(user.id,user.tenantId,user.sessionId);
    return {enabled:true,recovery_codes:recovery};
  });
}
export function disableMfa(db,user,{password,code},verifyPassword){
  return inTransaction(db,()=>{
    const account=db.prepare("select password_hash from users where id=? and tenant_id=?")
      .get(user.id,user.tenantId);
    if(!verifyPassword(String(password||""),account?.password_hash))throw failure("invalid_credentials",403);
    const row=db.prepare("select * from user_mfa where user_id=? and tenant_id=? and enabled=1")
      .get(user.id,user.tenantId);
    if(!row)throw failure("mfa_not_enabled",409);
    if(!useVerification(db,row,String(code||"")))throw failure("mfa_invalid_code",401);
    db.prepare("delete from user_mfa where user_id=? and tenant_id=?").run(user.id,user.tenantId);
    db.prepare("delete from mfa_recovery_codes where user_id=? and tenant_id=?").run(user.id,user.tenantId);
    db.prepare("delete from mfa_login_challenges where user_id=? and tenant_id=?").run(user.id,user.tenantId);
    db.prepare("delete from auth_sessions where user_id=? and tenant_id=? and id<>?")
      .run(user.id,user.tenantId,user.sessionId);
    return {enabled:false};
  });
}
