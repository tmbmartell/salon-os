import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { installWhatsApp, registerTenantSession, sessionForTenant, tenantForWahaEvent, wahaStatus, listConversations, sendConversationMessage } from "../whatsapp.mjs";

test("um salão não herda nem pode tomar a sessão WAHA de outro", async () => {
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("create table conversations(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL);");
    installWhatsApp(db);
    registerTenantSession(db,"salon-a","sessao-a");
    assert.equal(sessionForTenant(db,"salon-a"),"sessao-a");
    assert.equal(sessionForTenant(db,"salon-b"),"");
    assert.throws(() => registerTenantSession(db,"salon-b","sessao-a"),/another_tenant/);
    assert.equal(tenantForWahaEvent(db,{session:"sessao-a"}),"salon-a");
    assert.equal(tenantForWahaEvent(db,{session:"sessao-b"}),null);
    const status=await wahaStatus(sessionForTenant(db,"salon-b"));
    assert.equal(status.status,"UNASSIGNED");
    assert.equal(status.connected,false);
  }finally{db.close()}
});

test("trocar sessão desativa a anterior e preserva vínculo exclusivo", () => {
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("create table conversations(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL);");
    installWhatsApp(db);
    registerTenantSession(db,"salon-a","salon-1");
    registerTenantSession(db,"salon-a","salon-2");
    assert.equal(sessionForTenant(db,"salon-a"),"salon-2");
    assert.equal(tenantForWahaEvent(db,{session:"salon-1"}),null);
    assert.equal(tenantForWahaEvent(db,{session:"salon-2"}),"salon-a");
    assert.throws(()=>registerTenantSession(db,"salon-b","salon-2"),/another_tenant/);
    assert.equal(sessionForTenant(db,"salon-a"),"salon-2");
  } finally{db.close()}
});

test("mensageria não expõe cliente de outro salão mesmo com referência inválida", async () => {
  const db=new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE conversations(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,client_id TEXT,assigned_user_id TEXT,created_at TEXT,last_message_at TEXT);
      CREATE TABLE clients(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT,phone TEXT,email TEXT,tags TEXT,source TEXT,notes TEXT,birthday TEXT);
      CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT);
    `);
    installWhatsApp(db);
    db.prepare("insert into clients(id,tenant_id,name,phone,tags) values(?,?,?,?,?)").run("x","salon-b","Nome privado","6999998888","[]");
    db.prepare("insert into users(id,tenant_id,name) values(?,?,?)").run("u","salon-b","Equipe privada");
    db.prepare("insert into conversations(id,tenant_id,client_id,assigned_user_id,created_at) values(?,?,?,?,?)")
      .run("co","salon-a","x","u",new Date().toISOString());
    const list=listConversations(db,"salon-a");
    assert.equal(list.length,1);
    assert.equal(list[0].client_name,null);
    assert.equal(list[0].client_phone,null);
    assert.equal(list[0].assigned_user_name,null);
    await assert.rejects(sendConversationMessage(db,"salon-a","co","oi","user-a"),/conversation_or_phone_missing/);
  } finally{db.close()}
});
