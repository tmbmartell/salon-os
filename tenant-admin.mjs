import crypto from "node:crypto";
import {can} from "./auth.mjs";
const now=()=>new Date().toISOString();
const one=(db,sql,args=[])=>db.prepare(sql).get(...args);
const all=(db,sql,args=[])=>db.prepare(sql).all(...args);
const run=(db,sql,args=[])=>db.prepare(sql).run(...args);
const roles=["owner","manager","reception","professional"];
const visiblePermissions=[
  ["agenda","Agenda","appointments.read","appointments.write"],
  ["customers","Clientes","clients.read","clients.write"],
  ["whatsapp","WhatsApp","conversations.read","conversations.write"],
  ["services","Serviços","services.read","services.write"],
  ["team","Equipe","staff.read","staff.manage"],
  ["inventory","Estoque","inventory.read","inventory.write"],
  ["finance","Financeiro","finance.read","finance.write"],
  ["cash","Caixa","cash.read","cash.write"],
  ["marketing","Marketing","marketing.read","marketing.write"],
  ["ownerEye","Olho do Dono","analytics.read",null],
  ["admin","Administração","admin.read","admin.write"]
];
const roleLabel={owner:"Proprietária",manager:"Gerência",reception:"Recepção",professional:"Profissional"};
export function permissionsMatrix(){
  return roles.map(role=>{
    const person={id:"matrix",role};
    return {role,label:roleLabel[role],areas:visiblePermissions.map(([id,label,read,write])=>({
      id,label,read:can(person,read),write:write?can(person,write):false
    }))};
  });
}
export function normalizeBusinessProfile(input){
  const b=input&&typeof input==="object"&&!Array.isArray(input)?input:{};
  const name=String(b.name||"").trim().slice(0,120),
    phone=String(b.phone||"").replace(/\D/g,"").slice(0,15),
    publicName=String(b.public_name||"").trim().slice(0,120),
    address=String(b.address||"").trim().slice(0,200),
    timezone=String(b.timezone||"America/Porto_Velho").trim();
  if(name.length<3)throw Object.assign(new Error("invalid_business_name"),{status:400});
  if(phone&&phone.length<10)throw Object.assign(new Error("invalid_phone"),{status:400});
  try{new Intl.DateTimeFormat("pt-BR",{timeZone:timezone})}catch{throw Object.assign(new Error("invalid_timezone"),{status:400})}
  if(!timezone.includes("/"))throw Object.assign(new Error("invalid_timezone"),{status:400});
  return {name,public_name:publicName||name,phone,address,timezone};
}
const sha=v=>crypto.createHash("sha256").update(v).digest("hex");
export function makeInviteToken(){return crypto.randomBytes(32).toString("base64url")}
export function installTenantAdministration(db){
  db.exec(`CREATE TABLE IF NOT EXISTS business_profiles(
    tenant_id TEXT PRIMARY KEY,public_name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',updated_by TEXT,updated_at TEXT NOT NULL
  );`);
}
export async function handleTenantAdministrationApi({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit}){
  const manage=()=>{if(user.role!=="owner")return false;requirePermission(user,"admin.write");return true};
  const see=()=>{requirePermission(user,"admin.read");return ["owner","manager"].includes(user.role)};
  if(req.method==="GET"&&url.pathname==="/api/admin/business-profile"){
    if(!see())return send(res,403,{error:"forbidden"});
    const t=one(db,"select id,name,slug,timezone from tenants where id=?",[tenant]);
    if(!t)return send(res,404,{error:"tenant_not_found"});
    const p=one(db,"select public_name,phone,address from business_profiles where tenant_id=?",[tenant]);
    return send(res,200,{name:t.name,slug:t.slug,timezone:t.timezone,public_name:p?.public_name||t.name,phone:p?.phone||"",address:p?.address||""});
  }
  if(req.method==="PUT"&&url.pathname==="/api/admin/business-profile"){
    if(!manage())return send(res,403,{error:"owner_only"});
    const t=one(db,"select id from tenants where id=?",[tenant]);if(!t)return send(res,404,{error:"tenant_not_found"});
    let profile;try{profile=normalizeBusinessProfile(await parseBody(req))}catch(e){return send(res,e.status||400,{error:e.message})}
    const stamp=now();
    db.exec("BEGIN IMMEDIATE");
    try{
      run(db,"update tenants set name=?,timezone=? where id=?",[profile.name,profile.timezone,tenant]);
      run(db,`insert into business_profiles(tenant_id,public_name,phone,address,updated_by,updated_at)
        values(?,?,?,?,?,?) on conflict(tenant_id)
        do update set public_name=excluded.public_name,phone=excluded.phone,address=excluded.address,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
        [tenant,profile.public_name,profile.phone,profile.address,user.id,stamp]);
      db.exec("COMMIT");
    }catch(e){db.exec("ROLLBACK");throw e}
    audit(db,user,"business.profile.update","tenant",tenant,{timezone:profile.timezone});
    return send(res,200,{ok:true,...profile});
  }
  if(req.method==="GET"&&url.pathname==="/api/admin/role-matrix"){
    if(!see())return send(res,403,{error:"forbidden"});
    return send(res,200,{roles:permissionsMatrix(),note:"Permissões fixas nesta versão; cada papel não concede acesso adicional por esta tela."});
  }
  if(req.method==="GET"&&url.pathname==="/api/admin/modules"){
    if(!see())return send(res,403,{error:"forbidden"});
    return send(res,200,{base:["Equipe e escala","Folgas/ausências","Metas","Comissões","Usuários e permissões","Segurança"],
      premium_hr:{name:"RH avançado",available:false,active:false,reason:"Módulo futuro, não contratado nem implementado",features:["Documentos de pessoal","Avaliações","Treinamentos","Férias e políticas trabalhistas"]}});
  }
  if(req.method==="GET"&&url.pathname==="/api/admin/invitations"){
    if(!manage())return send(res,403,{error:"owner_only"});
    return send(res,200,all(db,`select id,email,name,role,expires_at,accepted_at,created_at
      from user_invites where tenant_id=? order by created_at desc limit 60`,[tenant]));
  }
  if(req.method==="POST"&&url.pathname==="/api/admin/invitations"){
    if(!manage())return send(res,403,{error:"owner_only"});
    const b=await parseBody(req);
    const email=String(b.email||"").trim().toLowerCase().slice(0,200),
      name=String(b.name||"").trim().slice(0,120),role=String(b.role||"").trim();
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||name.length<2||!["manager","reception","professional"].includes(role))
      return send(res,400,{error:"invalid_invitation"});
    if(one(db,"select id from users where tenant_id=? and lower(email)=?",[tenant,email]))return send(res,409,{error:"user_already_exists"});
    const token=makeInviteToken(),tokenHash=sha(token),invitationId=crypto.randomUUID(),created=now(),expires=new Date(Date.now()+48*3600000).toISOString();
    db.exec("BEGIN IMMEDIATE");
    try{
      run(db,"delete from user_invites where tenant_id=? and lower(email)=? and accepted_at is null",[tenant,email]);
      run(db,"insert into user_invites(id,tenant_id,email,name,role,token_hash,expires_at,created_by,created_at) values(?,?,?,?,?,?,?,?,?)",
        [invitationId,tenant,email,name,role,tokenHash,expires,user.id,created]);
      db.exec("COMMIT");
    }catch(e){db.exec("ROLLBACK");throw e}
    audit(db,user,"admin.invitation.create","user_invite",invitationId,{role,email});
    return send(res,201,{id:invitationId,name,email,role,expires_at:expires,token,delivery:"manual"});
  }
  const revokeRoute=url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/revoke-sessions$/);
  if(req.method==="POST"&&revokeRoute){
    if(!manage())return send(res,403,{error:"owner_only"});
    const id=decodeURIComponent(revokeRoute[1]);
    const target=one(db,"select id from users where id=? and tenant_id=?",[id,tenant]);
    if(!target)return send(res,404,{error:"user_not_found"});
    if(target.id===user.id)return send(res,409,{error:"use_my_devices"});
    const result=run(db,"delete from auth_sessions where tenant_id=? and user_id=?",[tenant,id]);
    audit(db,user,"admin.sessions.revoke","user",id,{count:result.changes});
    return send(res,200,{ok:true,revoked:result.changes});
  }
  return false;
}
