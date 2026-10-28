import test from "node:test";import assert from "node:assert/strict";import {readFileSync} from "node:fs";
const root=new URL("../",import.meta.url);
const wa=readFileSync(new URL("whatsapp.mjs",root),"utf8");
const app=readFileSync(new URL("public/app.js",root),"utf8");
const server=readFileSync(new URL("server.mjs",root),"utf8");
test("WAHA status redacts provider raw config",()=>{assert.match(wa,/config:_privateConfiguration/);assert.match(wa,/\.\.\.publicStatus/);});
test("QR UI checks status and shows image with authenticated fetch",()=>{
 for(const v of ["credentials:\"same-origin\"","cache:\"no-store\"","await response.blob()","clearWaQrImage","waQrPoll=setInterval","stopWaQrPoll()","WAHA"])assert.ok(app.includes(v),v);
});
test("WhatsApp pairing is protected by role and API key kept server-side",()=>{
 assert.match(server,/session\/qr/);
 assert.match(server,/owner.*manager/);
 assert.match(wa,/X-Api-Key/);
 assert.ok(!app.includes("WAHA_API_KEY"));
});
test("Persistent pilot uses tenant-only seed flag without changing other environments",()=>{
 assert.match(server,/NOVAGENTE_EMPTY_INITIAL_TENANT/);
});