import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { installWhatsApp, registerTenantSession, sessionForTenant, tenantForWahaEvent, wahaStatus } from "../whatsapp.mjs";

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
