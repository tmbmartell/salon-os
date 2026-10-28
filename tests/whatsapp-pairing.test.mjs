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
test("WhatsApp QR UI has exactly one prepare and QR click handler",()=>{
 assert.equal((app.match(/waPrepareButton\.onclick=/g)||[]).length,1);
 assert.equal((app.match(/waQrButton\.onclick=/g)||[]).length,1);
 assert.equal((app.match(/\$\("#prepareWaha"\)\.onclick=/g)||[]).length,0);
});
test("QR is prepared on first click, refreshed without hiding old image and error is visible",()=>{
 for(const marker of ["await fetchWaQr()","startWaQrPoll()","preloaded.onload=resolve","waQrMessage.classList.toggle","waQrImage.scrollIntoView"])assert.ok(app.includes(marker),marker);
 assert.ok(app.includes("waPrepareButton.onclick=()=>displayWaQr({prepare:true})"));
});
test("QR uses CSP-approved data images rather than blocked blob URLs",()=>{
 const begin=app.indexOf("async function fetchWaQr()");
 const end=app.indexOf("async function checkWaPairing()",begin);
 const qr=app.slice(begin,end);
 assert.ok(qr.includes("new FileReader()"));
 assert.ok(qr.includes("reader.readAsDataURL(image)"));
 assert.ok(qr.includes("data:"+String.fromCharCode(34)+"+type+")); // type-constrained image URL
 assert.ok(!qr.includes("URL.createObjectURL("));
 assert.ok(!qr.includes("URL.revokeObjectURL("));
 assert.ok(server.includes("img-src 'self' data:"));
});

test("Only the primary app controls QR and preparation; onboarding only manages ownership",()=>{
 const onboarding=readFileSync(new URL("public/whatsapp-onboarding.js",root),"utf8");
 assert.ok(onboarding.includes("neWhatsappSessionForm"));
 assert.ok(onboarding.includes("/api/whatsapp/session/link"));
 assert.doesNotMatch(onboarding,/get\(["'](?:showQr|prepareWaha|waQrImage)["']\)/);
 assert.doesNotMatch(onboarding,/\.onclick\s*=|URL\.createObjectURL|URL\.revokeObjectURL/);
 assert.ok(app.includes("waQrButton.onclick=()=>displayWaQr()"));
 assert.ok(app.includes("reader.readAsDataURL(image)"));
});