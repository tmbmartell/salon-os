import assert from "node:assert/strict";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
const root=new URL("../",import.meta.url).pathname;
const port=19424;
const base="http://127.0.0.1:"+port;
const password=crypto.randomBytes(25).toString("base64url");
const email="automation-demo@example.test";
const env={PATH:process.env.PATH,HOME:"/tmp",NODE_ENV:"production",PORT:String(port),HOST:"127.0.0.1",
 NOVAGENTE_FREE_PREVIEW:"yes",NOVAGENTE_DEMO_OWNER_EMAIL:email,NOVAGENTE_DEMO_OWNER_PASSWORD:password};
const child=spawn(process.execPath,["scripts/start-free-preview.mjs"],{cwd:root,env,stdio:["ignore","pipe","pipe"]});
let logs="";
child.stdout.on("data",chunk=>logs+=chunk.toString());
child.stderr.on("data",chunk=>logs+=chunk.toString());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function json(path,{method="GET",body,cookie}={}){
 const response=await fetch(base+path,{method,headers:{"content-type":"application/json",...(cookie?{cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const value=await response.json();
 return {status:response.status,value,headers:response.headers};
}
try{
 let ready=false;
 for(let i=0;i<60;i++){
   if(child.exitCode!==null)throw Error("preview_exited_early");
   try{const result=await json("/api/health");if(result.status===200){ready=true;break}}catch{}
   await sleep(180);
 }
 if(!ready)throw Error("health_timeout");
 const login=await json("/api/auth/login",{method:"POST",body:{email,password}});
 assert.equal(login.status,200,JSON.stringify(login.value));
 const cookie=(login.headers.get("set-cookie")||"").split(";")[0];
 assert.ok(cookie,"missing_session_cookie");
 const first=await json("/api/commercial/overview",{cookie});
 assert.equal(first.status,200,JSON.stringify(first.value));
 assert.equal(first.value.sending_enabled,false);
 assert.equal(first.value.leads.length,0);
 const clients=await json("/api/clients",{cookie});
 assert.ok(Array.isArray(clients.value)&&clients.value.length>0);
 const client=clients.value[0];
 const sim=await json("/api/commercial/simulate-inbound",{method:"POST",body:{client_id:client.id,text:"Quanto custa coloração?"},cookie});
 assert.equal(sim.status,200,JSON.stringify(sim.value));
 assert.equal(sim.value.message_sent,false);
 const second=await json("/api/commercial/overview",{cookie});
 assert.equal(second.value.leads.length,1);
 assert.equal(second.value.leads[0].stage,"novo_contato");
 const preview=await json("/api/commercial/preview-message",{method:"POST",body:{text:"consegue desconto?"},cookie});
 assert.equal(preview.status,200);assert.equal(preview.value.handoff,true);assert.equal(preview.value.delivery,false);
 const policy=await json("/api/commercial/policies",{method:"PATCH",body:{key:"appointment_reminder_2h",enabled:true},cookie});
 assert.equal(policy.status,200);assert.equal(policy.value.sending_enabled,false);
 const stage=await json("/api/commercial/leads/"+second.value.leads[0].id+"/stage",{method:"PATCH",body:{stage:"orcamento_enviado",estimated_value_cents:28000},cookie});
 assert.equal(stage.status,200,JSON.stringify(stage.value));
 const after=await json("/api/commercial/overview",{cookie});
 assert.equal(after.value.open_quote_cents,28000);
 const invalid=await json("/api/commercial/policies",{method:"PATCH",body:{key:"unknown_key",enabled:true},cookie});
 assert.equal(invalid.status,400);
 const wrongMethod=await json("/api/commercial/simulate-inbound",{method:"POST",body:{client_id:"other_client",text:"olá"},cookie});
 assert.equal(wrongMethod.status,404);
 console.log("COMMERCIAL_SMOKE_OK",JSON.stringify({health:true,login:true,client:!!client.id,lead:!!sim.value.lead.id,quote_value:after.value.open_quote_cents,policies:true,outbound:false,preview:true}));
}catch(err){
 console.error("COMMERCIAL_SMOKE_FAILED",String(err));
 console.error(logs.slice(-2200));
 process.exitCode=1;
}finally{
 child.kill("SIGTERM");
 for(let i=0;i<35&&child.exitCode===null;i++)await sleep(80);
 if(child.exitCode===null)child.kill("SIGKILL");
}