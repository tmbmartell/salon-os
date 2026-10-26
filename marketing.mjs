import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const id=()=>crypto.randomUUID(),timestamp=()=>new Date().toISOString();
const text=(v,n=500)=>String(v??"").trim().slice(0,n);
const one=(db,sql,args=[])=>db.prepare(sql).get(...args);
const all=(db,sql,args=[])=>db.prepare(sql).all(...args);
const run=(db,sql,args=[])=>db.prepare(sql).run(...args);
const kinds=new Set(["promotion","announcement","hours","holiday","portfolio","other"]);
const statuses=new Set(["draft","ready","archived"]);
const imageMimes={"image/jpeg":".jpg","image/png":".png","image/webp":".webp","image/gif":".gif"};
const MAX_IMAGE=3*1024*1024;
export function detectImageType(bytes){
  if(bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)return "image/jpeg";
  if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "image/png";
  if(bytes.length>=12&&bytes.toString("ascii",0,4)==="RIFF"&&bytes.toString("ascii",8,12)==="WEBP")return "image/webp";
  if(bytes.length>=6&&["GIF87a","GIF89a"].includes(bytes.toString("ascii",0,6)))return "image/gif";
  return null;
}
export async function readImage(req,maximum=MAX_IMAGE){
  const chunks=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>maximum)throw Object.assign(new Error("media_too_large"),{status:413});chunks.push(chunk)}
  if(bytes===0)throw Object.assign(new Error("empty_media"),{status:400});
  return Buffer.concat(chunks);
}
function safeDate(value){
  if(value==null||String(value).trim()==="")return null;
  const d=new Date(value);
  if(Number.isNaN(d.valueOf())||!/^(?:\d{4}-\d\d-\d\d)(?:T.*)?$/.test(String(value)))throw Object.assign(new Error("invalid_date"),{status:400});
  return d.toISOString();
}
export function renderTemplate(template,{name="",service=""}={}){
  return String(template||"").replace(/\{nome\}/gi,String(name).split(/\s+/)[0]).replace(/\{servico\}/gi,String(service)).slice(0,1200);
}
export function installMarketing(db){
  db.exec(`
    CREATE TABLE IF NOT EXISTS marketing_assets(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,storage_key TEXT NOT NULL,created_by TEXT,created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_marketing_assets_tenant ON marketing_assets(tenant_id,created_at);
    CREATE TABLE IF NOT EXISTS marketing_campaigns(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,title TEXT NOT NULL,category TEXT NOT NULL,
      message TEXT NOT NULL DEFAULT '',audience TEXT NOT NULL DEFAULT 'manual',
      status TEXT NOT NULL DEFAULT 'draft',media_id TEXT,starts_at TEXT,ends_at TEXT,
      created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_tenant ON marketing_campaigns(tenant_id,status,updated_at);
    CREATE TABLE IF NOT EXISTS service_followup_rules(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,service_id TEXT NOT NULL,
      delay_hours INTEGER NOT NULL,template TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      UNIQUE(tenant_id,service_id)
    );
  `);
}
function mediaRecord(db,tenant,assetId){
  return one(db,"select id,tenant_id,name,mime,bytes,storage_key,created_at from marketing_assets where id=? and tenant_id=?",[assetId,tenant]);
}
function publicMedia(m){return {id:m.id,name:m.name,mime:m.mime,bytes:m.bytes,created_at:m.created_at,content_url:"/api/marketing/assets/"+encodeURIComponent(m.id)+"/content"}}
export function scheduleServicePostcare(db,tenant,appointment,userId=null){
  const rows=all(db,`select distinct r.id,r.service_id,r.delay_hours,r.template,s.name service_name
    from service_followup_rules r join services s on s.id=r.service_id and s.tenant_id=r.tenant_id
    where r.tenant_id=? and r.enabled=1 and (r.service_id=? or exists(
      select 1 from appointment_items i where i.tenant_id=r.tenant_id and i.appointment_id=? and i.service_id=r.service_id
    ))`,[tenant,appointment.service_id,appointment.id]);
  if(!rows.length)return false;
  const client=one(db,"select name from clients where tenant_id=? and id=?",[tenant,appointment.client_id]);
  if(!client)return false;
  const base=new Date().toISOString(),dueBase=new Date(base).getTime();
  for(const rule of rows){
    const due=new Date(dueBase+rule.delay_hours*3600000).toISOString();
    run(db,`insert into engagement_tasks(id,tenant_id,client_id,appointment_id,kind,channel,title,message,due_at,status,created_by,created_at,dedupe_key)
      values(?,?,?,?,?,'whatsapp',?, ?,?,'pending',?,?,?)
      on conflict(tenant_id,dedupe_key) do nothing`,
      [id(),tenant,appointment.client_id,appointment.id,"postcare","Acompanhar "+rule.service_name+" · "+client.name,
        renderTemplate(rule.template,{name:client.name,service:rule.service_name}),due,userId,base,"postcare-rule-"+appointment.id+"-"+rule.id]);
  }
  return true; // Apenas tarefa interna; nenhum envio automático.
}
export async function handleMarketingApi({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit,storageDir,sendImage}){
  const read=()=>requirePermission(user,"marketing.read"),write=()=>requirePermission(user,"marketing.write");
  if(req.method==="GET"&&url.pathname==="/api/marketing/assets"){
    read();return send(res,200,all(db,"select id,name,mime,bytes,created_at from marketing_assets where tenant_id=? order by created_at desc limit 200",[tenant]).map(publicMedia));
  }
  if(req.method==="POST"&&url.pathname==="/api/marketing/assets"){
    write();
    let name="Imagem da campanha";try{name=text(decodeURIComponent(req.headers["x-media-name"]||"Imagem da campanha"),140)}catch{return send(res,400,{error:"invalid_media_name"})}
    const claimed=String(req.headers["content-type"]||"").split(";")[0].trim().toLowerCase();
    if(!imageMimes[claimed])return send(res,415,{error:"unsupported_media_type"});
    let blob;try{blob=await readImage(req)}catch(e){return send(res,e.status||400,{error:e.message})}
    const detected=detectImageType(blob);
    if(detected!==claimed)return send(res,415,{error:"media_signature_mismatch"});
    const assetId=id(),key=assetId+imageMimes[detected],dir=path.join(storageDir,tenant),disk=path.join(dir,key);
    fs.mkdirSync(dir,{recursive:true,mode:0o700});
    fs.writeFileSync(disk,blob,{flag:"wx",mode:0o600});
    try{
      run(db,"insert into marketing_assets(id,tenant_id,name,mime,bytes,storage_key,created_by,created_at) values(?,?,?,?,?,?,?,?)",
        [assetId,tenant,name,detected,blob.length,key,user.id,timestamp()]);
    }catch(error){fs.rmSync(disk,{force:true});throw error}
    audit(db,user,"marketing.asset.create","marketing_asset",assetId,{mime:detected,bytes:blob.length});
    return send(res,201,publicMedia(mediaRecord(db,tenant,assetId)));
  }
  const media=url.pathname.match(/^\/api\/marketing\/assets\/([\w-]+)\/content$/);
  if(media&&req.method==="GET"){
    read();const record=mediaRecord(db,tenant,media[1]);
    if(!record)return send(res,404,{error:"asset_not_found"});
    const disk=path.join(storageDir,tenant,record.storage_key);
    if(!fs.existsSync(disk))return send(res,404,{error:"asset_missing"});
    return sendImage(res,fs.readFileSync(disk),record.mime);
  }
  if(req.method==="GET"&&url.pathname==="/api/marketing/campaigns"){
    read();
    const rows=all(db,"select * from marketing_campaigns where tenant_id=? order by updated_at desc limit 200",[tenant]);
    return send(res,200,rows.map(({tenant_id,...x})=>x));
  }
  if(req.method==="POST"&&url.pathname==="/api/marketing/campaigns"){
    write();const b=await parseBody(req),title=text(b.title,140),category=text(b.category,40),
      message=text(b.message,2000),status=text(b.status||"draft",20),audience=text(b.audience||"manual",60),mediaId=text(b.media_id,64)||null;
    if(!title||!kinds.has(category)||!statuses.has(status))return send(res,400,{error:"invalid_campaign"});
    if(mediaId&&!mediaRecord(db,tenant,mediaId))return send(res,400,{error:"invalid_media"});
    let start,end;try{start=safeDate(b.starts_at);end=safeDate(b.ends_at)}
    catch(e){return send(res,e.status||400,{error:e.message})}
    if(start&&end&&end<start)return send(res,400,{error:"campaign_dates_reversed"});
    const campaignId=id(),created=timestamp();
    run(db,`insert into marketing_campaigns(id,tenant_id,title,category,message,audience,status,media_id,starts_at,ends_at,created_by,created_at,updated_at)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [campaignId,tenant,title,category,message,audience,status,mediaId,start,end,user.id,created,created]);
    audit(db,user,"marketing.campaign.create","marketing_campaign",campaignId,{status,category});
    return send(res,201,{id:campaignId,status});
  }
  const campaign=url.pathname.match(/^\/api\/marketing\/campaigns\/([\w-]+)$/);
  if(campaign&&req.method==="PATCH"){
    write();const b=await parseBody(req),item=one(db,"select * from marketing_campaigns where tenant_id=? and id=?",[tenant,campaign[1]]);
    if(!item)return send(res,404,{error:"campaign_not_found"});
    const status=text(b.status||item.status,20);
    if(!statuses.has(status))return send(res,400,{error:"invalid_status"});
    run(db,"update marketing_campaigns set status=?,updated_at=? where id=? and tenant_id=?",[status,timestamp(),campaign[1],tenant]);
    audit(db,user,"marketing.campaign.status","marketing_campaign",campaign[1],{from:item.status,to:status});
    return send(res,200,{id:campaign[1],status});
  }
  if(req.method==="GET"&&url.pathname==="/api/marketing/followup-rules"){
    read();
    return send(res,200,all(db,`select r.id,r.service_id,s.name service_name,r.delay_hours,r.template,r.enabled,r.updated_at
      from service_followup_rules r join services s on s.id=r.service_id and s.tenant_id=r.tenant_id
      where r.tenant_id=? order by s.name`,[tenant]));
  }
  if(req.method==="PUT"&&url.pathname==="/api/marketing/followup-rules"){
    write();const b=await parseBody(req),serviceId=text(b.service_id,64),
      service=one(db,"select id from services where id=? and tenant_id=?",[serviceId,tenant]),
      hours=Number(b.delay_hours),template=text(b.template,1200),enabled=b.enabled===true||b.enabled===1;
    if(!service)return send(res,404,{error:"service_not_found"});
    if(!Number.isInteger(hours)||hours<1||hours>24*90||!template)return send(res,400,{error:"invalid_followup_rule"});
    const prev=one(db,"select id from service_followup_rules where tenant_id=? and service_id=?",[tenant,serviceId]),ruleId=prev?.id||id(),at=timestamp();
    run(db,`insert into service_followup_rules(id,tenant_id,service_id,delay_hours,template,enabled,created_by,created_at,updated_at)
      values(?,?,?,?,?,?,?,?,?) on conflict(tenant_id,service_id)
      do update set delay_hours=excluded.delay_hours,template=excluded.template,enabled=excluded.enabled,updated_at=excluded.updated_at`,
      [ruleId,tenant,serviceId,hours,template,enabled?1:0,user.id,at,at]);
    audit(db,user,"marketing.followup.configure","service",serviceId,{delay_hours:hours,enabled});
    return send(res,200,{ok:true,service_id:serviceId,enabled});
  }
  return false;
}
