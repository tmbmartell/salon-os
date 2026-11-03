// R8.1 — isolamento por profissional, finalização negada, comissão 0–100 e CSV traduzido.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import {spawn} from "node:child_process";
import {fileURLToPath} from "node:url";

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,"..");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){
  const server=net.createServer();
  await new Promise((resolve,reject)=>server.once("error",reject).listen(0,"127.0.0.1",resolve));
  const port=server.address().port;await new Promise(r=>server.close(r));return port;
}
async function start(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),"novagente-r81-"));
  const port=await freePort(),base="http://127.0.0.1:"+port,dbPath=path.join(directory,"qa.sqlite");
  const child=spawn(process.execPath,["server.mjs"],{cwd:root,
    env:{...process.env,PORT:String(port),HOST:"127.0.0.1",SALON_DB:dbPath,
      NOVAGENTE_ENABLE_RECEPTIONIST_AI:"false",JEV_CONTROL_PLANE_URL:"http://127.0.0.1:1"},
    stdio:["ignore","pipe","pipe"]});
  let logs="";
  child.stderr.on("data",c=>{logs=(logs+c.toString()).slice(-6000)});
  child.stdout.on("data",c=>{logs=(logs+c.toString()).slice(-6000)});
  const cleanup=async()=>{
    if(child.exitCode===null){child.kill("SIGTERM");await Promise.race([new Promise(r=>child.once("exit",r)),sleep(1000)])}
    if(child.exitCode===null)child.kill("SIGKILL");
    fs.rmSync(directory,{recursive:true,force:true});
  };
  for(let i=0;i<100;i++){
    if(child.exitCode!==null){await cleanup();throw Error("servidor não subiu: "+logs)}
    try{const r=await fetch(base+"/api/auth/state");if(r.ok)return {base,dbPath,cleanup,logs:()=>logs}}catch{}
    await sleep(120);
  }
  await cleanup();throw Error("timeout: "+logs);
}
function client(base,cookie=""){
  return async function(pathname,{method="GET",body=null}={}){
    const headers={};if(cookie)headers.cookie=cookie;
    const request={method,headers};
    if(body!==null){headers["content-type"]="application/json";request.body=JSON.stringify(body)}
    const response=await fetch(base+pathname,request);
    const type=response.headers.get("content-type")||"";
    const data=type.includes("application/json")?await response.json():await response.text();
    return {status:response.status,headers:response.headers,data};
  };
}
async function ownerSession(app){
  const anon=client(app.base);
  const setup=await anon("/api/auth/setup",{method:"POST",body:{email:"owner@qa.invalid",name:"QA Dona",password:"QA-senha-123456789"}});
  assert.equal(setup.status,201,JSON.stringify(setup.data));
  const login=await anon("/api/auth/login",{method:"POST",body:{email:"owner@qa.invalid",password:"QA-senha-123456789"}});
  assert.equal(login.status,200,JSON.stringify(login.data));
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  return {anon,owner:client(app.base,cookie),cookie};
}
async function inviteProfessional(app,anon,owner,email,professionalId=null){
  const inv=await owner("/api/admin/invitations",{method:"POST",body:{email,name:"QA "+email,role:"professional"}});
  assert.equal(inv.status,201,JSON.stringify(inv.data));
  const accept=await anon("/api/auth/invitations/accept",{method:"POST",body:{token:inv.data.token,password:"Prof-senha-123456"}});
  assert.equal(accept.status,201,JSON.stringify(accept.data));
  const login=await anon("/api/auth/login",{method:"POST",body:{email,password:"Prof-senha-123456"}});
  assert.equal(login.status,200,JSON.stringify(login.data));
  const api=client(app.base,login.headers.get("set-cookie")?.split(";")[0]);
  const users=await owner("/api/admin/users");
  const user=users.data.find(u=>u.email===email);
  assert.ok(user, "usuário criado");
  if(professionalId!==null){
    const link=await owner("/api/admin/users/"+user.id+"/professional",{method:"PATCH",body:{professional_id:professionalId}});
    assert.equal(link.status,200,JSON.stringify(link.data));
  }
  return {api,user};
}
function futureIso(dayOffset,hourZ){
  const d=new Date();d.setUTCDate(d.getUTCDate()+dayOffset);d.setUTCHours(hourZ,0,0,0);
  return d.toISOString();
}

test("profissional vê apenas a própria agenda, clientes, fichas e dashboard",{timeout:120000},async()=>{
  const app=await start();
  try{
    const {anon,owner}=await ownerSession(app);
    const boot=(await owner("/api/bootstrap")).data;
    const service=boot.services[0];
    const profA=(await owner("/api/professionals",{method:"POST",body:{name:"Profissional A",role:"Estética",work_start:"09:00",work_end:"18:00"}})).data;
    const profB=(await owner("/api/professionals",{method:"POST",body:{name:"Profissional B",role:"Estética",work_start:"09:00",work_end:"18:00"}})).data;
    const clientA=(await owner("/api/clients",{method:"POST",body:{name:"Cliente da A",phone:"69999990021"}})).data;
    const clientB=(await owner("/api/clients",{method:"POST",body:{name:"Cliente da B",phone:"69999990022"}})).data;
    const apA=(await owner("/api/appointments",{method:"POST",body:{client_id:clientA.id,service_id:service.id,professional_id:profA.id,start_at:futureIso(3,14)}})).data;
    const apB=(await owner("/api/appointments",{method:"POST",body:{client_id:clientB.id,service_id:service.id,professional_id:profB.id,start_at:futureIso(3,16)}})).data;
    assert.ok(apA.id&&apB.id);

    const A=await inviteProfessional(app,anon,owner,"profa@qa.invalid",profA.id);

    const appts=(await A.api("/api/appointments?from=2026-01-01T00:00:00Z&to=2027-12-31T00:00:00Z")).data;
    assert.ok(Array.isArray(appts));
    assert.ok(appts.length>0,"A precisa ver os próprios atendimentos");
    assert.ok(appts.every(x=>String(x.professional_id)===profA.id||(x.items||[]).every(i=>i.professional_id===profA.id)),"somente atendimentos da A");

    const clients=(await A.api("/api/clients")).data;
    const names=clients.map(c=>c.name);
    assert.ok(names.includes("Cliente da A"));
    assert.ok(!names.includes("Cliente da B"),"cliente da B não pode aparecer");

    assert.equal((await A.api("/api/clients/"+clientB.id+"/history")).status,404);
    assert.equal((await A.api("/api/clients/"+clientA.id+"/history")).status,200);

    // Registro direto por ID: não pode editar atendimento da B.
    assert.equal((await A.api("/api/appointments/"+apB.id+"/status",{method:"PATCH",body:{status:"confirmed"}})).status,404);
    assert.equal((await A.api("/api/appointments/"+apA.id+"/status",{method:"PATCH",body:{status:"confirmed"}})).status,200);

    // Não pode agendar em nome de outra profissional.
    const foreign=await A.api("/api/appointments",{method:"POST",body:{client_id:clientA.id,service_id:service.id,professional_id:profB.id,start_at:futureIso(4,14)}});
    assert.equal(foreign.status,403);assert.equal(foreign.data.error,"professional_scope_forbidden");
    const own=await A.api("/api/appointments",{method:"POST",body:{client_id:clientA.id,service_id:service.id,start_at:futureIso(5,14)}});
    assert.equal(own.status,201,JSON.stringify(own.data));
    assert.equal(own.data.items[0].professional_id,profA.id,"sem professional_id usa o vínculo");

    // Dashboard restrito.
    const dash=(await A.api("/api/dashboard")).data;
    assert.ok(dash.appointments.every(x=>String(x.professional_id)===profA.id||(x.items||[]).every(i=>i.professional_id===profA.id)));
    assert.ok(dash.clientCount>=1);

    // Ficha técnica: cliente da B nega, cliente da A aceita e o registro sai com o vínculo.
    assert.equal((await A.api("/api/clients/"+clientB.id+"/technical")).status,404);
    const tech=await A.api("/api/clients/"+clientA.id+"/technical",{method:"POST",body:{title:"Fórmula A",professional_id:profB.id}});
    assert.equal(tech.status,201,JSON.stringify(tech.data));
    const techRows=(await A.api("/api/clients/"+clientA.id+"/technical")).data;
    assert.equal(techRows.length,1);
    assert.equal(techRows[0].professional_id,profA.id,"vínculo forçado para a própria profissional");

    // Finalização: prep de checkout é 403 para profissional.
    assert.equal((await A.api("/api/checkout/"+apA.id+"/prep")).status,403);

    // Proprietária continua vendo tudo.
    const allClients=(await owner("/api/clients")).data.map(c=>c.name);
    assert.ok(allClients.includes("Cliente da A")&&allClients.includes("Cliente da B"));
    const allAppts=(await owner("/api/appointments?from=2026-01-01T00:00:00Z&to=2027-12-31T00:00:00Z")).data;
    assert.ok(allAppts.length>=2);
  }finally{await app.cleanup()}
});

test("profissional sem vínculo não recebe dados operacionais",{timeout:120000},async()=>{
  const app=await start();
  try{
    const {anon,owner}=await ownerSession(app);
    const boot=(await owner("/api/bootstrap")).data;
    const service=boot.services[0];
    const client=(await owner("/api/clients",{method:"POST",body:{name:"Cliente Sem Vínculo",phone:"69999990023"}})).data;
    const prof=(await owner("/api/professionals",{method:"POST",body:{name:"Prof Sem Login",role:"Estética",work_start:"09:00",work_end:"18:00"}})).data;
    await owner("/api/appointments",{method:"POST",body:{client_id:client.id,service_id:service.id,professional_id:prof.id,start_at:futureIso(3,15)}});

    const {api}=await inviteProfessional(app,anon,owner,"semvinculo@qa.invalid",null);
    const clients=await api("/api/clients");
    assert.equal(clients.status,403);assert.equal(clients.data.error,"professional_not_linked");
    assert.equal((await api("/api/appointments")).status,403);
    assert.equal((await api("/api/clients/"+client.id+"/history")).status,403);
    const dash=await api("/api/dashboard");
    assert.equal(dash.status,200);
    assert.equal(dash.data.todayAppointments,0);
    assert.equal(dash.data.clientCount,0);
    assert.equal(dash.data.professional_link_required,true);
    const boot2=await api("/api/bootstrap");
    assert.equal(boot2.data.professional_link_required,true);
    assert.ok(boot2.data.professionals.every(p=>p.phone===null),"telefone do time oculto ao profissional");
  }finally{await app.cleanup()}
});

test("comissão só aceita 0–100 e CSV da agenda traduz status",{timeout:120000},async()=>{
  const app=await start();
  try{
    const {owner}=await ownerSession(app);
    const base={name:"Serviço Comissão",category:"QA",duration_min:60,price:100};
    const ok40=await owner("/api/services",{method:"POST",body:{...base,commission_pct:40}});
    assert.equal(ok40.status,201);assert.equal(ok40.data.commission_pct,40);
    const ok100=await owner("/api/services",{method:"POST",body:{...base,name:"Serviço 100",commission_pct:"100"}});
    assert.equal(ok100.status,201);assert.equal(ok100.data.commission_pct,100);
    for(const invalid of [101,150,-1,"abc",200,"50,5,5"]){
      const r=await owner("/api/services",{method:"POST",body:{...base,name:"Inválido "+invalid,commission_pct:invalid}});
      assert.equal(r.status,400,"valor "+invalid);
      assert.equal(r.data.error,"invalid_commission_pct");
    }
    const created=ok40.data;
    assert.equal((await owner("/api/services/"+created.id,{method:"PUT",body:{commission_pct:101}})).status,400);
    assert.equal((await owner("/api/services/"+created.id,{method:"PUT",body:{commission_pct:-5}})).status,400);
    const edited=await owner("/api/services/"+created.id,{method:"PUT",body:{commission_pct:35.5}});
    assert.equal(edited.status,200);assert.equal(edited.data.commission_pct,35.5);

    // Comissão da Limpeza de Pele permanece intacta.
    const services=(await owner("/api/services")).data;
    const limpeza=services.find(s=>/limpeza/i.test(s.name));
    if(limpeza)assert.equal(limpeza.commission_pct,100,"não alterar comissão existente");

    // CSV: status traduzido.
    const boot=(await owner("/api/bootstrap")).data;
    const professional=boot.professionals[0];
    const client=(await owner("/api/clients",{method:"POST",body:{name:"Cliente CSV",phone:"69999990024"}})).data;
    const ap=(await owner("/api/appointments",{method:"POST",body:{client_id:client.id,service_id:boot.services[0].id,professional_id:professional.id,start_at:futureIso(3,17)}})).data;
    await owner("/api/appointments/"+ap.id+"/status",{method:"PATCH",body:{status:"confirmed"}});
    const csv=await owner("/api/reports/export?type=appointments&from="+new Date().toISOString().slice(0,10)+"&to="+new Date(Date.now()+5*86400000).toISOString().slice(0,10));
    assert.equal(csv.status,200);
    assert.match(csv.data,/Agendado|Confirmado/);
    assert.ok(!/;scheduled;|;confirmed;/.test(csv.data),"status não pode sair em inglês");
    assert.match(csv.data,/Cliente CSV/);
  }finally{await app.cleanup()}
});
