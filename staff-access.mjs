// Links de acesso sem senha para recepção e profissionais. Sem envios externos.
// O token é de uso único, expira em 10 minutos e nunca é salvo em texto puro.
import crypto from "node:crypto";
import {authenticate,audit} from "./auth.mjs";
import {requestIsSecure} from "./request-security.mjs";

const sha = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const stamp = () => new Date().toISOString();
const staff = role => role === "reception" || role === "professional";

export function installStaffAccess(db) {
  db.exec(`create table if not exists staff_access_links(
    id text primary key,tenant_id text not null,user_id text not null,
    token_hash text not null unique,expires_at text not null,used_at text,
    created_by text not null,created_at text not null
  );create index if not exists idx_staff_access_links_user
    on staff_access_links(tenant_id,user_id,expires_at);`);
}

export async function handleStaffAccessApi({req,res,url,db,send,parseBody}){
  const consume = req.method==="POST" && url.pathname==="/api/auth/access-link";
  const issue = req.method==="POST" && url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/(access-link|password-reset)$/);
  if(!consume && !issue)return false;
  if(consume){
    const body=await parseBody(req),token=String(body.token||"");
    if(!/^[a-zA-Z0-9_-]{43,90}$/.test(token))return send(res,410,{error:"access_link_invalid_or_expired"});
    let response;
    db.exec("BEGIN IMMEDIATE");
    try{
      const row=db.prepare(`select l.id as link_id,u.id,u.tenant_id,u.name,u.email,u.role,u.active
        from staff_access_links l join users u on u.id=l.user_id and u.tenant_id=l.tenant_id
        where l.token_hash=? and l.used_at is null and l.expires_at>? limit 1`).get(sha(token),stamp());
      if(!row || !row.active || !staff(row.role))throw Object.assign(new Error("access_link_invalid_or_expired"),{status:410});
      const mfa=db.prepare("select enabled from user_mfa where user_id=? and tenant_id=?").get(row.id,row.tenant_id);
      if(Number(mfa?.enabled)===1)throw Object.assign(new Error("mfa_required"),{status:403});
      const ts=stamp(),session=crypto.randomBytes(32).toString("base64url");
      db.prepare("update staff_access_links set used_at=? where id=?").run(ts,row.link_id);
      db.prepare(`insert into auth_sessions(id,tenant_id,user_id,token_hash,expires_at,created_at,last_seen_at,device_label)
        values(?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),row.tenant_id,row.id,sha(session),
          new Date(Date.now()+7*86400000).toISOString(),ts,ts,String(req.headers["user-agent"]||"Dispositivo").slice(0,180));
      db.exec("COMMIT");
      audit(db,{id:row.id,tenantId:row.tenant_id},"auth.staff_link.login","user",row.id,{});
      const secure=requestIsSecure(req)?"; Secure":"";
      response=send(res,200,{ok:true,user:{id:row.id,tenantId:row.tenant_id,name:row.name,email:row.email,role:row.role,platform_admin:false}},
        {"set-cookie":"salon_session="+encodeURIComponent(session)+"; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800"+secure});
    }catch(e){db.exec("ROLLBACK");return send(res,e.status||410,{error:e.message||"access_link_invalid_or_expired"})}
    return response;
  }
  const actor=authenticate(req,db);
  if(!actor)return send(res,401,{error:"unauthorized"});
  if(actor.role!=="owner")return send(res,403,{error:"owner_only"});
  const targetId=decodeURIComponent(issue[1]);
  const target=db.prepare("select id,tenant_id,role,active from users where id=? and tenant_id=?").get(targetId,actor.tenantId);
  if(!target)return send(res,404,{error:"user_not_found"});
  if(target.id===actor.id||target.role==="owner")return send(res,403,{error:"owner_only"});
  if(!target.active)return send(res,409,{error:"user_inactive"});
  if(issue[2]==="access-link"&&!staff(target.role))return send(res,403,{error:"staff_only"});
  const token=crypto.randomBytes(32).toString("base64url"),ts=stamp(),expires=new Date(Date.now()+(issue[2]==="access-link"?10:15)*60000).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try{
    if(issue[2]==="access-link"){
      db.prepare("delete from staff_access_links where tenant_id=? and user_id=?").run(actor.tenantId,target.id);
      db.prepare(`insert into staff_access_links(id,tenant_id,user_id,token_hash,expires_at,created_by,created_at)
        values(?,?,?,?,?,?,?)`).run(crypto.randomUUID(),actor.tenantId,target.id,sha(token),expires,actor.id,ts);
    }else{
      db.prepare("delete from password_resets where tenant_id=? and user_id=? and used_at is null").run(actor.tenantId,target.id);
      db.prepare(`insert into password_resets(id,user_id,tenant_id,token_hash,expires_at,created_at)
        values(?,?,?,?,?,?)`).run(crypto.randomUUID(),target.id,actor.tenantId,sha(token),expires,ts);
    }
    db.exec("COMMIT");
  }catch(e){db.exec("ROLLBACK");throw e}
  audit(db,actor,"admin."+issue[2]+".issued","user",target.id,{expires_at:expires});
  return send(res,201,{ok:true,token,expires_at:expires,delivery:"manual",role:target.role});
}
