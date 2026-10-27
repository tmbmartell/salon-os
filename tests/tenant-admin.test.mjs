import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {installAuth,handleAuthApi,requirePermission,authenticate} from "../auth.mjs";
import {installTenantAdministration,handleTenantAdministrationApi,permissionsMatrix} from "../tenant-admin.mjs";

function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE tenants(id text primary key,name text,slug text,timezone text,created_at text);
    CREATE TABLE users(id text primary key,tenant_id text,name text,email text,role text,active integer default 1,created_at text,updated_at text);
  `);
  db.prepare("insert into tenants(id,name,slug,timezone,created_at) values(?,?,?,?,?)").run("a","Salão A","sala-a","America/Porto_Velho","2026-10-01T12:00:00Z");
  db.prepare("insert into tenants(id,name,slug,timezone,created_at) values(?,?,?,?,?)").run("b","Salão B","sala-b","America/Sao_Paulo","2026-10-01T12:00:00Z");
  db.prepare("insert into users(id,tenant_id,name,email,role,active,created_at) values(?,?,?,?,?,1,?)").run("owner-a","a","Proprietária A","owner@a.example","owner","2026-10-01T12:00:00Z");
  db.prepare("insert into users(id,tenant_id,name,email,role,active,created_at) values(?,?,?,?,?,1,?)").run("manager-a","a","Gerente A","manager@a.example","manager","2026-10-01T12:00:00Z");
  db.prepare("insert into users(id,tenant_id,name,email,role,active,created_at) values(?,?,?,?,?,1,?)").run("owner-b","b","Proprietária B","owner@b.example","owner","2026-10-01T12:00:00Z");
  installAuth(db);
  installTenantAdministration(db);
  return db;
}
const ownerA={id:"owner-a",role:"owner",tenantId:"a"};
const managerA={id:"manager-a",role:"manager",tenantId:"a"};
async function admin(db,method,path,body={},user=ownerA,tenant="a"){
  return handleTenantAdministrationApi({db,req:{method,headers:{}},res:{},url:new URL(path,"http://localhost"),
    user,tenant,send:(_res,status,data)=>({status,data}),parseBody:async()=>body,
    requirePermission,audit:()=>{}});
}
async function auth(db,path,body){
  const out=await handleAuthApi({db,req:{method:"POST",headers:{}},res:{},
    url:new URL(path,"http://localhost"),defaultTenant:"a",
    send:(_res,status,data)=>({status,data}),parseBody:async()=>body});
  return out.result;
}
test("proprietária configura somente seu salão e fuso é validado",async()=>{
  const db=fixture();
  try{
    const initial=await admin(db,"GET","/api/admin/business-profile");
    assert.equal(initial.data.name,"Salão A");
    const altered=await admin(db,"PUT","/api/admin/business-profile",
      {name:"Espaço Bella",public_name:"Bella",phone:"(69) 99999-8888",address:"Rua Central",timezone:"America/Manaus"});
    assert.equal(altered.status,200);
    assert.equal(altered.data.phone,"69999998888");
    assert.equal(db.prepare("select timezone from tenants where id='a'").get().timezone,"America/Manaus");
    assert.equal(db.prepare("select name from tenants where id='b'").get().name,"Salão B");
    const bad=await admin(db,"PUT","/api/admin/business-profile",{name:"Nome",timezone:"Mars/Olympus"});
    assert.equal(bad.status,400);
    assert.equal(db.prepare("select timezone from tenants where id='a'").get().timezone,"America/Manaus");
    assert.equal((await admin(db,"PUT","/api/admin/business-profile",{name:"Outro"},managerA)).status,403);
    assert.equal((await admin(db,"GET","/api/admin/business-profile",{},managerA)).status,200);
  }finally{db.close()}
});
test("matriz de perfil diferencia leitura e edição e RH Premium não é vendido ou ativo",async()=>{
  const db=fixture();
  try{
    const roles=permissionsMatrix();
    assert.equal(roles.find(r=>r.role==="owner").areas.find(a=>a.id==="finance").write,true);
    assert.equal(roles.find(r=>r.role==="reception").areas.find(a=>a.id==="finance").read,false);
    const response=await admin(db,"GET","/api/admin/modules");
    assert.equal(response.status,200);
    assert.equal(response.data.premium_hr.available,false);
    assert.equal(response.data.premium_hr.active,false);
    assert.equal((await admin(db,"GET","/api/admin/role-matrix",{},managerA)).status,200);
  }finally{db.close()}
});
test("convite é válido por uso único; acesso criado não pode ser proprietário",async()=>{
  const db=fixture();
  try{
    const forbidden=await admin(db,"POST","/api/admin/invitations",
      {email:"new@a.example",name:"Nova pessoa",role:"reception"},managerA);
    assert.equal(forbidden.status,403);
    const attemptedOwner=await admin(db,"POST","/api/admin/invitations",
      {email:"new@a.example",name:"Nova pessoa",role:"owner"});
    assert.equal(attemptedOwner.status,400);
    const created=await admin(db,"POST","/api/admin/invitations",
      {email:"NEW@a.example",name:"Nova pessoa",role:"reception"});
    assert.equal(created.status,201);
    assert.ok(created.data.token.length>=30);
    const invites=await admin(db,"GET","/api/admin/invitations");
    assert.equal(invites.data.length,1);
    assert.equal("token" in invites.data[0],false);
    assert.equal((await auth(db,"/api/auth/invitations/accept",
      {token:created.data.token,password:"fraca"})).status,400);
    const accepted=await auth(db,"/api/auth/invitations/accept",
      {token:created.data.token,password:"senha-forte-123456!"});
    assert.equal(accepted.status,201);
    const person=db.prepare("select * from users where tenant_id=? and email=?").get("a","new@a.example");
    assert.equal(person.role,"reception");
    assert.equal(person.active,1);
    assert.ok(person.password_hash.startsWith("scrypt$"));
    assert.equal((await auth(db,"/api/auth/invitations/accept",
      {token:created.data.token,password:"senha-forte-123456!"})).status,410);
    assert.equal((await admin(db,"POST","/api/admin/invitations",
      {email:"new@a.example",name:"Nova pessoa",role:"reception"})).status,409);
  }finally{db.close()}
});
test("convite de um salão não cria usuário em outro e sessão é revogada por empresa",async()=>{
  const db=fixture();
  try{
    const invite=await admin(db,"POST","/api/admin/invitations",
      {email:"new@a.example",name:"Nova pessoa",role:"professional"});
    assert.equal(invite.status,201);
    const expired=db.prepare("update user_invites set expires_at=? where id=?")
      .run("2020-01-01T00:00:00Z",invite.data.id);
    assert.equal(expired.changes,1);
    assert.equal((await auth(db,"/api/auth/invitations/accept",{token:invite.data.token,password:"senha-muito-forte-1"})).status,410);
    db.prepare("insert into auth_sessions(id,tenant_id,user_id,token_hash,expires_at,created_at,last_seen_at) values(?,?,?,?,?,?,?)")
      .run("sess-b","b","owner-b","hash-b","2099-01-01T00:00:00Z","2026-10-01T00:00:00Z","2026-10-27T00:00:00Z");
    const cross=await admin(db,"POST","/api/admin/users/owner-b/revoke-sessions",{},ownerA,"a");
    assert.equal(cross.status,404);
    assert.equal(db.prepare("select count(*) n from auth_sessions where id='sess-b'").get().n,1);
    const self=await admin(db,"POST","/api/admin/users/owner-a/revoke-sessions");
    assert.equal(self.status,409);
  }finally{db.close()}
});
