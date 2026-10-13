import fs from "node:fs";
import {DatabaseSync} from "node:sqlite";
import {installWhatsApp,registerTenantSession,sessionForTenant,tenantForWahaEvent} from "./whatsapp.mjs";
const f="/tmp/wa-tenant-smoke.sqlite";try{fs.unlinkSync(f)}catch{}
const db=new DatabaseSync(f);
db.exec("create table conversations(id text primary key,tenant_id text,client_id text,channel text,external_id text,status text,last_message_at text,created_at text)");
installWhatsApp(db);
registerTenantSession(db,"tenant-a","salon-a");
registerTenantSession(db,"tenant-b","salon-b");
const out={
 a:sessionForTenant(db,"tenant-a"),
 b:sessionForTenant(db,"tenant-b"),
 eventA:tenantForWahaEvent(db,{session:"salon-a"}),
 eventB:tenantForWahaEvent(db,{session:"salon-b"}),
 unknown:tenantForWahaEvent(db,{session:"salon-x"})
};
console.log(JSON.stringify(out));
db.close();try{fs.unlinkSync(f)}catch{}
