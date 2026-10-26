import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {Readable} from "node:stream";
import {DatabaseSync} from "node:sqlite";
import {installMarketing,handleMarketingApi,scheduleServicePostcare,detectImageType,readImage} from "../marketing.mjs";
import {installPhase6} from "../phase6.mjs";

function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(`create table services(id text primary key,tenant_id text,name text,active integer default 1);
    create table clients(id text primary key,tenant_id text,name text,phone text);
    create table appointment_items(id text primary key,tenant_id text,appointment_id text,service_id text);
  `);
  db.prepare("insert into services(id,tenant_id,name) values(?,?,?)").run("s-a","a","Coloração");
  db.prepare("insert into services(id,tenant_id,name) values(?,?,?)").run("s-b","b","Corte externo");
  db.prepare("insert into clients(id,tenant_id,name,phone) values(?,?,?,?)").run("c-a","a","Juliana Silva","69999990000");
  installPhase6(db);installMarketing(db);
  return db;
}
async function route(db,{method="GET",url="/api/marketing/campaigns",body={},tenant="a",buffer=null,headers={},storageDir}={}){
  let output=null;
  const req=buffer ? Object.assign(Readable.from([buffer]),{method,headers}):{method,headers};
  return handleMarketingApi({
    req,res:{},url:new URL(url,"http://localhost"),db,tenant,user:{id:"owner",role:"owner",tenantId:tenant},
    send:(_res,status,data)=>({status,data}),sendImage:(_res,buf,mime)=>({status:200,mime,bytes:buf}),
    parseBody:async()=>body,requirePermission:()=>{},audit:()=>{},storageDir
  });
}
test("biblioteca permite imagens conhecidas e recusa executáveis disfarçados",async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ne-mkt-"));
  const db=fixture();
  try{
    const good=Buffer.concat([Buffer.from("GIF89a"),Buffer.alloc(100)]);
    assert.equal(detectImageType(good),"image/gif");
    assert.equal(detectImageType(Buffer.from("<svg>malicious</svg>")),null);
    const add=await route(db,{method:"POST",url:"/api/marketing/assets",tenant:"a",storageDir:dir,buffer:good,
      headers:{"content-type":"image/gif","x-media-name":encodeURIComponent("Oferta animada.gif")}});
    assert.equal(add.status,201);
    assert.equal(add.data.mime,"image/gif");
    assert.equal(add.data.name,"Oferta animada.gif");
    assert.ok(fs.existsSync(path.join(dir,"a",add.data.id+".gif")));
    const load=await route(db,{url:add.data.content_url,tenant:"a",storageDir:dir});
    assert.equal(load.status,200);
    assert.deepEqual(load.bytes,good);
    const cross=await route(db,{url:add.data.content_url,tenant:"b",storageDir:dir});
    assert.equal(cross.status,404);
    const spoof=await route(db,{method:"POST",url:"/api/marketing/assets",tenant:"a",storageDir:dir,
      buffer:Buffer.from("<script>alert(1)</script>"),headers:{"content-type":"image/png"}});
    assert.equal(spoof.status,415);
    assert.equal(db.prepare("select count(*) n from marketing_assets").get().n,1);
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test("limite de imagem rejeita upload antes de persistir",async()=>{
  await assert.rejects(readImage(Readable.from([Buffer.alloc(3*1024*1024+1)])),/media_too_large/);
});
test("campanhas por salão têm estados e não geram disparos",async()=>{
  const db=fixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),"ne-mkt-"));
  try{
    const campaign=await route(db,{method:"POST",url:"/api/marketing/campaigns",tenant:"a",storageDir:dir,
      body:{title:"Semana da cor",category:"promotion",message:"Oferta do salão",status:"ready"}});
    assert.equal(campaign.status,201);
    assert.equal(campaign.data.status,"ready");
    assert.equal((await route(db,{tenant:"b",storageDir:dir})).length,0);
    const foreign=await route(db,{method:"PATCH",url:"/api/marketing/campaigns/"+campaign.data.id,
      tenant:"b",storageDir:dir,body:{status:"archived"}});
    assert.equal(foreign.status,404);
    const archive=await route(db,{method:"PATCH",url:"/api/marketing/campaigns/"+campaign.data.id,
      tenant:"a",storageDir:dir,body:{status:"archived"}});
    assert.equal(archive.status,200);
    assert.equal(db.prepare("select count(*) n from engagement_tasks").get().n,0);
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test("regra de coloração gera tarefa interna só uma vez e sem contatar WhatsApp",async()=>{
  const db=fixture(),dir=fs.mkdtempSync(path.join(os.tmpdir(),"ne-mkt-"));
  try{
    const invalid=await route(db,{method:"PUT",url:"/api/marketing/followup-rules",storageDir:dir,
      body:{service_id:"s-b",delay_hours:48,template:"Oi {nome}",enabled:true}});
    assert.equal(invalid.status,404);
    const rule=await route(db,{method:"PUT",url:"/api/marketing/followup-rules",storageDir:dir,
      body:{service_id:"s-a",delay_hours:48,template:"Oi {nome}, como foi {servico}?",enabled:true}});
    assert.equal(rule.status,200);
    const appt={id:"appointment-1",client_id:"c-a",service_id:"s-a"};
    assert.equal(scheduleServicePostcare(db,"a",appt,"owner"),true);
    assert.equal(scheduleServicePostcare(db,"a",appt,"owner"),true);
    const tasks=db.prepare("select * from engagement_tasks where tenant_id=?").all("a");
    assert.equal(tasks.length,1);
    assert.equal(tasks[0].message,"Oi Juliana, como foi Coloração?");
    assert.equal(tasks[0].status,"pending");
    assert.equal(tasks[0].channel,"whatsapp");
    assert.ok(new Date(tasks[0].due_at)-new Date(tasks[0].created_at)>=47*3600000);
    assert.equal(db.prepare("select count(*) n from engagement_tasks where tenant_id=?").get("b").n,0);
    const deactivate=await route(db,{method:"PUT",url:"/api/marketing/followup-rules",storageDir:dir,
      body:{service_id:"s-a",delay_hours:24,template:"Oi {nome}",enabled:false}});
    assert.equal(deactivate.status,200);
    assert.equal(scheduleServicePostcare(db,"a",{...appt,id:"appointment-2"},"owner"),false);
  }finally{db.close();fs.rmSync(dir,{recursive:true,force:true})}
});
