import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { authenticate, handleAuthApi, installAuth, makePasswordHash } from "../auth.mjs";

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE tenants(id TEXT PRIMARY KEY,slug TEXT NOT NULL); CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT,email TEXT,role TEXT,active INTEGER NOT NULL DEFAULT 1,created_at TEXT);");
  installAuth(db);
  db.prepare("insert into tenants(id,slug) values(?,?)").run("salon-a", "a");
  db.prepare("insert into tenants(id,slug) values(?,?)").run("salon-b", "b");
  const hash = makePasswordHash("senha-de-teste-segura");
  db.prepare("insert into users(id,tenant_id,name,email,role,active,created_at,password_hash) values(?,?,?,?,?,1,?,?)")
    .run("user-a", "salon-a", "Ana", "ana@example.test", "owner", new Date().toISOString(), hash);
  db.prepare("insert into users(id,tenant_id,name,email,role,active,created_at,password_hash) values(?,?,?,?,?,1,?,?)")
    .run("user-b", "salon-b", "Bia", "bia@example.test", "owner", new Date().toISOString(), hash);
  return db;
}

async function route(db, method, url, input={}, cookie="") {
  const req = { method, headers: { cookie, "user-agent": "Navegador de teste" } };
  const r = await handleAuthApi({
    req, res: {}, url: new URL(url, "http://localhost"), db,
    defaultTenant: "salon-a",
    send: (_res,status,data,headers={}) => ({ status,data,headers }),
    parseBody: async () => input
  });
  assert.equal(r.handled,true);
  return r.result;
}

async function login(db,email,workspace) {
  const result = await route(db, "POST", "/api/auth/login", { email, password:"senha-de-teste-segura", workspace });
  assert.equal(result.status,200);
  const cookie = result.headers["set-cookie"].split(";")[0];
  return cookie;
}

test("sessões pessoais e encerramento entre salões", async () => {
  const db=fixture();
  try {
    const a = await login(db,"ana@example.test","a");
    const b = await login(db,"bia@example.test","b");
    const aSessions=await route(db,"GET","/api/auth/sessions",{},a);
    assert.equal(aSessions.status,200);
    assert.equal(aSessions.data.sessions.length,1);
    assert.equal(aSessions.data.sessions[0].current,true);
    assert.equal(aSessions.data.idle_timeout_hours,8);
    const bSessions=await route(db,"GET","/api/auth/sessions",{},b);
    const bSessionId=bSessions.data.sessions[0].id;
    const wrong=await route(db,"POST","/api/auth/sessions/revoke",{session_id:bSessionId},a);
    assert.equal(wrong.status,404);
    assert.ok(authenticate({headers:{cookie:b}},db));
    const revoked=await route(db,"POST","/api/auth/sessions/revoke",{session_id:aSessions.data.sessions[0].id},a);
    assert.equal(revoked.status,200);
    assert.match(revoked.headers["set-cookie"],/Max-Age=0/);
    assert.equal(authenticate({headers:{cookie:a}},db),null);
    assert.ok(authenticate({headers:{cookie:b}},db));
  } finally { db.close(); }
});

test("sessão acima do limite de inatividade não autentica", async () => {
  const db=fixture();
  try{
    const cookie=await login(db,"ana@example.test","a");
    db.prepare("update auth_sessions set last_seen_at=? where user_id=?").run(new Date(Date.now()-9*3600000).toISOString(),"user-a");
    assert.equal(authenticate({headers:{cookie}},db),null);
    const sessions=await route(db,"GET","/api/auth/sessions",{},cookie);
    assert.equal(sessions.status,401);
  }finally{db.close()}
});

test("sessão não pode autenticar usuário pertencente a outro salão", () => {
  const db=fixture();
  try{
    const token=crypto.randomBytes(20).toString("hex");
    const stamp=new Date().toISOString();
    const expires=new Date(Date.now()+86400000).toISOString();
    db.prepare("insert into auth_sessions(id,tenant_id,user_id,token_hash,expires_at,created_at,last_seen_at) values(?,?,?,?,?,?,?)")
      .run(crypto.randomUUID(),"salon-a","user-b",crypto.createHash("sha256").update(token).digest("hex"),expires,stamp,stamp);
    assert.equal(authenticate({headers:{cookie:"salon_session="+token}},db),null);
  }finally{db.close()}
});
