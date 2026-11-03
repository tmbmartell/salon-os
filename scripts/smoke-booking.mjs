import assert from "node:assert/strict";
import crypto from "node:crypto";
import {spawn} from "node:child_process";
const root=new URL("../",import.meta.url).pathname;
const port=19425;
const base="http://127.0.0.1:"+port;
const password=crypto.randomBytes(25).toString("base64url");
const email="booking-demo@example.test";
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
 const clients=await json("/api/clients",{cookie});
 assert.equal(clients.status,200);
 assert.ok(clients.value.length>=2);
 const firstClient=clients.value[0],secondClient=clients.value[1];
 async function talk(client,message){
  const out=await json("/api/commercial/booking-preview",{method:"POST",body:{client_id:client.id,text:message},cookie});
  assert.equal(out.status,200,JSON.stringify(out.value));
  assert.equal(out.value.sending_enabled,false);
  return out.value;
 }
 let result=await talk(firstClient,"Quero agendar coloração amanhã");
 assert.equal(result.booking_state,"offered",JSON.stringify(result));
 assert.match(result.text,/1\)/);
 assert.match(result.text,/2\)/);
 const choice=await talk(firstClient,"1");
 assert.equal(choice.booked,true,JSON.stringify(choice));
 assert.equal(choice.booking_state,"confirmed");
 assert.ok(choice.appointment_id);
 const repeated=await talk(firstClient,"1");
 assert.equal(repeated.booking_state,"confirmed");
 assert.equal(Boolean(repeated.booked),false);
 const services=await json("/api/services",{cookie});
 const color=services.value.find(s=>s.name==="Coloração");
 assert.ok(color);
 const date=new Date(Date.now()+86400000);
 const from=new Date(Date.now()-86400000).toISOString(),to=new Date(Date.now()+5*86400000).toISOString();
 const apps=await json("/api/appointments?from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to),{cookie});
 assert.equal(apps.status,200);
 const matching=apps.value.filter(a=>a.id===choice.appointment_id);
 assert.equal(matching.length,1,"only one committed appointment per booking");
 assert.equal(matching[0].source,"assistant");
 assert.equal(matching[0].service_id,color.id);
 const next=await talk(secondClient,"Quero agendar coloração amanhã");
 assert.equal(next.booking_state,"offered");
 const handed=await talk(secondClient,"faz desconto pra mim?");
 assert.equal(handed.handoff,true);
 assert.equal(handed.booking_state,"handoff");
 const noBooking=await talk(secondClient,"1");
 assert.equal(!!noBooking.booked,false);
 const invalid=await json("/api/commercial/booking-preview",{method:"POST",body:{client_id:"other_tenant_client",text:"quero agendar"},cookie});
 assert.equal(invalid.status,404);
 console.log("BOOKING_SMOKE_OK",JSON.stringify({login:true,proposed:true,confirmed:true,idempotent:true,appointments_created:matching.length,discount_handoff:true,sending_enabled:false}));
}catch(err){
 console.error("BOOKING_SMOKE_FAILED",String(err));
 console.error(logs.slice(-2200));
 process.exitCode=1;
}finally{
 child.kill("SIGTERM");
 for(let i=0;i<35&&child.exitCode===null;i++)await sleep(80);
 if(child.exitCode===null)child.kill("SIGKILL");
}