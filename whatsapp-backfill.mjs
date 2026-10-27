import crypto from "node:crypto";
import {sessionForTenant,syncWahaHistory} from "./whatsapp.mjs";

// A importação é deliberadamente manual e limitada a UMA página WAHA por chamada.
// O provedor pode reter só parte das mensagens; "concluído" significa que a API
// não forneceu mais páginas, não que toda a história do WhatsApp foi recuperada.
const stamp=()=>new Date().toISOString();
const one=(db,sql,args=[])=>db.prepare(sql).get(...args);
const run=(db,sql,args=[])=>db.prepare(sql).run(...args);
const MAX_LIMIT=100,LEASE_MS=30000;
function publicJob(job){
  if(!job)return null;
  const {tenant_id,lease_token,lease_expires, ...data}=job;
  return {...data,complete:data.status==="completed",
    completeness_warning:"Conclusão baseada nas páginas que o WAHA disponibilizou; não confirma recuperação de todas as mensagens antigas."};
}
export function installWhatsAppBackfill(db){
  db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_backfill_jobs(
    id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,session TEXT NOT NULL,
    from_date TEXT NOT NULL,from_unix INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',page_size INTEGER NOT NULL DEFAULT 40,
    chat_offset INTEGER NOT NULL DEFAULT 0,message_offset INTEGER NOT NULL DEFAULT 0,
    chats_processed INTEGER NOT NULL DEFAULT 0,groups_skipped INTEGER NOT NULL DEFAULT 0,
    messages_scanned INTEGER NOT NULL DEFAULT 0,messages_imported INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,lease_token TEXT,lease_expires TEXT,
    created_by TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_backfill_tenant ON whatsapp_backfill_jobs(tenant_id,created_at);`);
}
function latest(db,tenant){
  return one(db,"select * from whatsapp_backfill_jobs where tenant_id=? order by created_at desc,id desc limit 1",[tenant]);
}
function sinceDate(v){
  const date=String(v||"").trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Object.assign(new Error("invalid_from_date"),{status:400});
  const parsed=new Date(date+"T00:00:00Z");
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date||
      parsed.getTime()>Date.now()+86400000||parsed.getTime()<Date.parse("2009-01-01T00:00:00Z"))
    throw Object.assign(new Error("invalid_from_date"),{status:400});
  return {date,unix:Math.floor(parsed.getTime()/1000)};
}
const manageable=user=>["owner","manager"].includes(user.role);
export async function handleWhatsAppBackfillApi({db,req,res,url,user,tenant,send,parseBody,requirePermission,audit}){
  if(!url.pathname.startsWith("/api/whatsapp/backfill"))return false;
  if(!manageable(user))return send(res,403,{error:"management_only"});
  requirePermission(user,"conversations.write");
  const path=url.pathname;
  if(req.method==="GET"&&path==="/api/whatsapp/backfill/status")
    return send(res,200,{job:publicJob(latest(db,tenant))});
  if(req.method==="POST"&&path==="/api/whatsapp/backfill/start"){
    const session=sessionForTenant(db,tenant);
    if(!session)return send(res,409,{error:"whatsapp_session_unassigned"});
    const b=await parseBody(req);
    let since;try{since=sinceDate(b.from_date||"2026-04-01")}catch(e){return send(res,e.status||400,{error:e.message})}
    const limit=b.page_size===undefined?40:Number(b.page_size);
    if(!Number.isInteger(limit)||limit<1||limit>MAX_LIMIT)return send(res,400,{error:"invalid_page_size"});
    const ongoing=one(db,"select id from whatsapp_backfill_jobs where tenant_id=? and status in ('running','paused') limit 1",[tenant]);
    if(ongoing)return send(res,409,{error:"backfill_already_exists",job_id:ongoing.id});
    const id=crypto.randomUUID(),at=stamp();
    run(db,`insert into whatsapp_backfill_jobs(id,tenant_id,session,from_date,from_unix,status,page_size,created_by,created_at,updated_at)
      values(?,?,?,?,?,'running',?,?,?,?)`,[id,tenant,session,since.date,since.unix,limit,user.id,at,at]);
    audit(db,user,"whatsapp.backfill.start","whatsapp_backfill",id,{from_date:since.date,page_size:limit});
    return send(res,201,{job:publicJob(latest(db,tenant))});
  }
  if(req.method==="POST"&&path==="/api/whatsapp/backfill/pause"){
    const job=latest(db,tenant);
    if(!job||job.status!=="running")return send(res,409,{error:"backfill_not_running"});
    run(db,"update whatsapp_backfill_jobs set status='paused',updated_at=? where id=? and tenant_id=?",[stamp(),job.id,tenant]);
    audit(db,user,"whatsapp.backfill.pause","whatsapp_backfill",job.id,{});
    return send(res,200,{job:publicJob(latest(db,tenant))});
  }
  if(req.method==="POST"&&path==="/api/whatsapp/backfill/resume"){
    const job=latest(db,tenant);
    if(!job||job.status!=="paused")return send(res,409,{error:"backfill_not_paused"});
    if(sessionForTenant(db,tenant)!==job.session)return send(res,409,{error:"whatsapp_session_changed"});
    run(db,"update whatsapp_backfill_jobs set status='running',last_error=null,updated_at=? where id=? and tenant_id=?",[stamp(),job.id,tenant]);
    audit(db,user,"whatsapp.backfill.resume","whatsapp_backfill",job.id,{});
    return send(res,200,{job:publicJob(latest(db,tenant))});
  }
  if(req.method==="POST"&&path==="/api/whatsapp/backfill/step"){
    const job=latest(db,tenant);
    if(!job||job.status!=="running")return send(res,409,{error:"backfill_not_running"});
    if(sessionForTenant(db,tenant)!==job.session)return send(res,409,{error:"whatsapp_session_changed"});
    const token=crypto.randomUUID(),at=stamp(),lease=new Date(Date.now()+LEASE_MS).toISOString();
    const claim=run(db,`update whatsapp_backfill_jobs set lease_token=?,lease_expires=?,updated_at=?
       where id=? and tenant_id=? and status='running'
       and (lease_expires is null or lease_expires<?)`,[token,lease,at,job.id,tenant,at]);
    if(!claim.changes)return send(res,409,{error:"backfill_step_in_progress"});
    try{
      const page=await syncWahaHistory(db,tenant,{
        paginated:true,chatLimit:1,messageLimit:job.page_size,
        chatOffset:job.chat_offset,messageOffset:job.message_offset,sinceTimestamp:job.from_unix
      });
      if(sessionForTenant(db,tenant)!==job.session)throw Error("whatsapp_session_changed");
      const noMoreChats=page.chats_page_length===0;
      const endedChat=noMoreChats||page.skipped>0||page.messages_page_length===0;
      const chatOffset=job.chat_offset+(noMoreChats?0:endedChat?1:0);
      // Offset avança pelo limite requisitado, inclusive quando o WAHA entrega uma página parcial.
      const msgOffset=endedChat?0:job.message_offset+job.page_size;
      const nextStatus=noMoreChats?"completed":"running";
      const changed=run(db,`update whatsapp_backfill_jobs set status=?,chat_offset=?,message_offset=?,
          chats_processed=chats_processed+?,groups_skipped=groups_skipped+?,
          messages_scanned=messages_scanned+?,messages_imported=messages_imported+?,
          last_error=null,lease_token=null,lease_expires=null,updated_at=?
          where id=? and tenant_id=? and status='running' and lease_token=?`,[
        nextStatus,chatOffset,msgOffset,(!noMoreChats&&endedChat)?1:0,page.skipped,
        page.messages_page_length,page.messages_imported,stamp(),job.id,tenant,token
      ]);
      if(!changed.changes)return send(res,409,{error:"backfill_paused_during_step"});
      if(nextStatus==="completed")audit(db,user,"whatsapp.backfill.complete","whatsapp_backfill",job.id,{});
      return send(res,200,{job:publicJob(latest(db,tenant)),page:{
        chats_returned:page.chats_page_length,messages_returned:page.messages_page_length,
        messages_imported:page.messages_imported,skipped:page.skipped
      }});
    }catch(error){
      run(db,`update whatsapp_backfill_jobs set lease_token=null,lease_expires=null,last_error=?,updated_at=?
        where id=? and tenant_id=? and lease_token=?`,[
        error.message==="whatsapp_session_changed"?"whatsapp_session_changed":"provider_page_unavailable",
        stamp(),job.id,tenant,token
      ]);
      return send(res,503,{error:error.message==="whatsapp_session_changed"?"whatsapp_session_changed":"backfill_page_failed"});
    }
  }
  return send(res,404,{error:"not_found"});
}
