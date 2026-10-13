import crypto from "node:crypto";

const BASE=String(process.env.WAHA_BASE_URL||"http://127.0.0.1:3005").replace(/\/+$/,"");
const API_KEY=String(process.env.WAHA_API_KEY||"");
const SESSION=String(process.env.WAHA_SESSION||"salon-os");
const WEBHOOK_SECRET=String(process.env.WAHA_WEBHOOK_HMAC_SECRET||"");
const WEBHOOK_URL=String(process.env.WAHA_WEBHOOK_URL||"");

export function installWhatsApp(db){
  const ccols=db.prepare("pragma table_info(conversations)").all().map(x=>x.name);
  if(!ccols.includes("unread_count"))db.exec("alter table conversations add column unread_count INTEGER NOT NULL DEFAULT 0");
  if(!ccols.includes("handling_mode"))db.exec("alter table conversations add column handling_mode TEXT NOT NULL DEFAULT 'human'");
  if(!ccols.includes("handling_mode_source")){db.exec("alter table conversations add column handling_mode_source TEXT NOT NULL DEFAULT 'default'");try{db.exec("update conversations set handling_mode_source='manual' where id in (select entity_id from audit_log where action='conversation.mode')")}catch{}}
  if(!ccols.includes("updated_at"))db.exec("alter table conversations add column updated_at TEXT");
  if(!ccols.includes("priority"))db.exec("alter table conversations add column priority TEXT NOT NULL DEFAULT 'normal'");
  if(!ccols.includes("category"))db.exec("alter table conversations add column category TEXT NOT NULL DEFAULT 'general'");
  if(!ccols.includes("labels"))db.exec("alter table conversations add column labels TEXT NOT NULL DEFAULT '[]'");
  if(!ccols.includes("assigned_user_id"))db.exec("alter table conversations add column assigned_user_id TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages(
      id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,conversation_id TEXT NOT NULL,direction TEXT NOT NULL,
      sender_type TEXT NOT NULL DEFAULT 'client',body TEXT NOT NULL DEFAULT '',message_type TEXT NOT NULL DEFAULT 'text',
      external_message_id TEXT,delivery_status TEXT NOT NULL DEFAULT 'pending',metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external ON messages(tenant_id,external_message_id) WHERE external_message_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id,created_at);
    CREATE TABLE IF NOT EXISTS whatsapp_tenant_sessions(
      tenant_id TEXT NOT NULL,session TEXT NOT NULL UNIQUE,active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,session)
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_tenant_active ON whatsapp_tenant_sessions(tenant_id,active);
  `);
}
export function normalizePhone(v=""){return String(v).replace(/\D/g,"").replace(/^0+/,"")}
export function registerTenantSession(db,tenantId,session=SESSION){
  const ts=new Date().toISOString();
  db.prepare("insert into whatsapp_tenant_sessions(tenant_id,session,active,created_at,updated_at) values(?,?,1,?,?) on conflict(session) do update set tenant_id=excluded.tenant_id,active=1,updated_at=excluded.updated_at").run(tenantId,session,ts,ts);
  return session;
}
export function sessionForTenant(db,tenantId){
  return db.prepare("select session from whatsapp_tenant_sessions where tenant_id=? and active=1 order by updated_at desc limit 1").get(tenantId)?.session||SESSION;
}
export function tenantForWahaEvent(db,event){
  const session=String(event?.session||"");
  if(!session)return null;
  return db.prepare("select tenant_id from whatsapp_tenant_sessions where session=? and active=1 limit 1").get(session)?.tenant_id||null;
}
export function wahaConfigured(){return !!(BASE&&API_KEY&&SESSION)}
export function wahaConfigStatus(){
  return {provider:"waha",configured:wahaConfigured(),session:SESSION,baseUrlConfigured:!!BASE,apiKeyConfigured:!!API_KEY,webhookSecretConfigured:!!WEBHOOK_SECRET,webhookUrlConfigured:!!WEBHOOK_URL};
}
async function request(path,init={},allow404=false){
  if(!wahaConfigured())throw new Error("waha_not_configured");
  const headers=new Headers(init.headers||{});
  headers.set("X-Api-Key",API_KEY);headers.set("Accept","application/json");
  if(init.body&&!headers.has("Content-Type"))headers.set("Content-Type","application/json");
  const r=await fetch(BASE+path,{...init,headers,signal:AbortSignal.timeout(8000)});
  if(allow404&&r.status===404)return r;
  if(!r.ok){const t=await r.text().catch(()=>"");throw new Error("waha_http_"+r.status+(t?":"+t.slice(0,200):""))}
  return r;
}
export async function wahaStatus(session=SESSION){
  const config={...wahaConfigStatus(),session};
  if(!config.configured)return {...config,connected:false,status:"NOT_CONFIGURED"};
  try{
    const r=await request("/api/sessions/"+encodeURIComponent(session),{},true);
    if(r.status===404)return {...config,connected:false,status:"MISSING"};
    const j=await r.json();
    return {...config,...j,connected:j.status==="WORKING"};
  }catch(e){return {...config,connected:false,status:"UNAVAILABLE",error:String(e.message||e).slice(0,160)}}
}
function sessionPayload(session=SESSION){
  const webhooks=WEBHOOK_URL&&WEBHOOK_SECRET?[{url:WEBHOOK_URL,events:["message","message.ack","session.status"],hmac:{key:WEBHOOK_SECRET},retries:{policy:"exponential",delaySeconds:2,attempts:8}}]:[];
  return {name:session,config:{webhooks}};
}
export async function ensureWahaSession(session=SESSION){
  if(!wahaConfigured())throw new Error("waha_not_configured");
  const current=await wahaStatus(session),payload=sessionPayload(session);
  if(current.status==="MISSING")await request("/api/sessions",{method:"POST",body:JSON.stringify(payload)});
  else await request("/api/sessions/"+encodeURIComponent(session),{method:"PUT",body:JSON.stringify(payload)});
  const latest=await wahaStatus(session);
  if(!["WORKING","STARTING","SCAN_QR_CODE"].includes(latest.status||""))await request("/api/sessions/"+encodeURIComponent(session)+"/start",{method:"POST"});
  return wahaStatus(session);
}
export async function wahaQr(session=SESSION){
  if(!wahaConfigured())throw new Error("waha_not_configured");
  const r=await request("/api/"+encodeURIComponent(session)+"/auth/qr",{headers:{Accept:"application/json,image/png"}});
  const contentType=(r.headers.get("content-type")||"").split(";")[0];
  if(contentType==="application/json"){
    const j=await r.json();
    const raw=String(j.data||"").replace(/^data:[^;]+;base64,/,"");
    if(!raw)throw new Error("waha_qr_missing_data");
    return {mimetype:String(j.mimetype||"image/png"),bytes:Buffer.from(raw,"base64")};
  }
  const bytes=Buffer.from(await r.arrayBuffer());
  return {mimetype:contentType||"image/png",bytes};
}
export function normalizeWahaMessageId(v){
  if(!v)return "";
  if(typeof v==="string")return v;
  if(typeof v==="object")return String(v._serialized||v.id||v.messageId||v.key?.id||"");
  return String(v);
}
export async function sendText(target,text,session=SESSION){
  const raw=String(target||"").trim(),chatId=raw.includes("@")?raw:normalizePhone(raw)+"@c.us";
  const r=await request("/api/sendText",{method:"POST",body:JSON.stringify({session,chatId,text:String(text),linkPreview:false})});
  const j=await r.json();
  return {messageId:normalizeWahaMessageId(j.id||j.messageId||j.key?.id||j)};
}
export function verifyWebhook(raw,signature,algorithm){
  if(!WEBHOOK_SECRET||!raw||!signature)return false;
  if(String(algorithm||"").toLowerCase()!=="sha512")return false;
  const expected=crypto.createHmac("sha512",WEBHOOK_SECRET).update(raw).digest("hex");
  const a=Buffer.from(expected),b=Buffer.from(String(signature));
  return a.length===b.length&&crypto.timingSafeEqual(a,b);
}
async function phoneFromChat(chatId="",session=SESSION){
  if(!chatId||chatId.endsWith("@g.us"))return "";
  if(chatId.endsWith("@lid")){
    try{
      const r=await request("/api/"+encodeURIComponent(session)+"/lids/"+encodeURIComponent(chatId));
      const j=await r.json();
      if(j?.pn)return normalizePhone(String(j.pn).replace(/@(c\.us|s\.whatsapp\.net)$/i,""));
    }catch{}
    return "";
  }
  return normalizePhone(chatId.replace(/@(c\.us|s\.whatsapp\.net)$/i,""));
}
function displayName(payload={}){
  const data=payload._data||{};
  return [payload.pushName,data.notifyName,data.pushName,data.verifiedName].find(v=>typeof v==="string"&&v.trim())||"";
}
export function listConversations(db,tenantId,limit=120){
  return db.prepare(`select co.*,c.name client_name,c.phone client_phone,c.email client_email,c.tags client_tags,c.source client_source,c.notes client_notes,c.birthday client_birthday,u.name assigned_user_name,
    (select body from messages m where m.conversation_id=co.id order by m.created_at desc limit 1) last_message,
    (select created_at from messages m where m.conversation_id=co.id order by m.created_at desc limit 1) last_message_created_at
    from conversations co left join clients c on c.id=co.client_id left join users u on u.id=co.assigned_user_id
    where co.tenant_id=? order by coalesce(co.last_message_at,co.created_at) desc limit ?`).all(tenantId,limit).map(x=>({...x,labels:(()=>{try{return JSON.parse(x.labels||"[]")}catch{return []}})(),client_tags:(()=>{try{return JSON.parse(x.client_tags||"[]")}catch{return []}})()}));
}
export function conversationMessages(db,tenantId,conversationId,limit=200){
  return db.prepare("select * from messages where tenant_id=? and conversation_id=? order by created_at asc limit ?").all(tenantId,conversationId,limit);
}
export function markConversationRead(db,tenantId,conversationId){
  db.prepare("update conversations set unread_count=0,updated_at=? where id=? and tenant_id=?").run(new Date().toISOString(),conversationId,tenantId);
}
export async function sendConversationMessage(db,tenantId,conversationId,text,userId){
  const co=db.prepare(`select co.*,c.phone client_phone from conversations co left join clients c on c.id=co.client_id
    where co.id=? and co.tenant_id=?`).get(conversationId,tenantId);
  if(!co||!co.client_phone)throw Object.assign(new Error("conversation_or_phone_missing"),{status:404});
  const body=String(text||"").trim().slice(0,4000);if(!body)throw Object.assign(new Error("text_required"),{status:400});
  const sent=await sendText(co.external_id||co.client_phone,body,sessionForTenant(db,tenantId)),ts=new Date().toISOString(),mid=crypto.randomUUID();
  db.prepare(`insert into messages(id,tenant_id,conversation_id,direction,sender_type,body,external_message_id,delivery_status,metadata,created_at)
    values(?,?,?,?,?,?,?,?,?,?)`).run(mid,tenantId,conversationId,"out","staff",body,sent.messageId||null,"sent",JSON.stringify({userId}),ts);
  db.prepare("update conversations set last_message_at=?,updated_at=? where id=?").run(ts,ts,conversationId);
  return {id:mid,externalMessageId:sent.messageId||null,body,createdAt:ts};
}

function chatSerializedId(chat){
  if(typeof chat?.id==="string")return chat.id;
  return String(chat?.id?._serialized||"");
}
function chatName(chat,phone){
  return String(chat?.name||chat?.formattedTitle||chat?.pushName||("WhatsApp "+String(phone).slice(-4))).trim().slice(0,160);
}
export async function syncWahaHistory(db,tenantId,{chatLimit=40,messageLimit=80}={}){
  const session=sessionForTenant(db,tenantId),safeChats=Math.max(1,Math.min(120,Number(chatLimit||40))),safeMsgs=Math.max(1,Math.min(200,Number(messageLimit||80)));
  const chatsResp=await request("/api/"+encodeURIComponent(session)+"/chats?limit="+safeChats+"&sortOrder=DESC");
  const chats=await chatsResp.json(),stats={chats_seen:0,chats_imported:0,messages_imported:0,skipped:0};
  for(const chat of Array.isArray(chats)?chats:[]){
    stats.chats_seen++;
    const chatId=chatSerializedId(chat);if(!chatId||chatId.endsWith("@g.us")||chatId==="0@c.us"){stats.skipped++;continue}
    const phone=await phoneFromChat(chatId,session);if(!phone){stats.skipped++;continue}
    const ts=new Date().toISOString();
    let client=db.prepare("select * from clients where tenant_id=? and phone=? limit 1").get(tenantId,phone);
    if(!client){
      const cid=crypto.randomUUID(),name=chatName(chat,phone);
      db.prepare("insert into clients(id,tenant_id,name,phone,tags,notes,source,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)")
        .run(cid,tenantId,name,phone,JSON.stringify(["WhatsApp"]),"" ,"whatsapp",ts,ts);
      client=db.prepare("select * from clients where id=?").get(cid);
    }
    let co=db.prepare("select * from conversations where tenant_id=? and client_id=? and channel='whatsapp' order by created_at desc limit 1").get(tenantId,client.id);
    if(!co){
      const cid=crypto.randomUUID();
      db.prepare("insert into conversations(id,tenant_id,client_id,channel,external_id,status,last_message_at,created_at,unread_count,handling_mode,updated_at,priority,category,labels) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(cid,tenantId,client.id,"whatsapp",chatId,"open",ts,ts,Number(chat.unreadCount||0),"human",ts,"normal","general","[]");
      co=db.prepare("select * from conversations where id=?").get(cid);
    }else{
      db.prepare("update conversations set external_id=?,unread_count=?,updated_at=? where id=? and tenant_id=?")
        .run(chatId,Number(chat.unreadCount||0),ts,co.id,tenantId);
    }
    const msgResp=await request("/api/"+encodeURIComponent(session)+"/chats/"+encodeURIComponent(chatId)+"/messages?limit="+safeMsgs+"&downloadMedia=false&sortOrder=ASC");
    const msgs=await msgResp.json();let lastAt=co.last_message_at||co.created_at||ts;
    for(const m of Array.isArray(msgs)?msgs:[]){
      if(!m?.id)continue;
      if(db.prepare("select 1 x from messages where tenant_id=? and external_message_id=?").get(tenantId,String(m.id)))continue;
      const created=m.timestamp?new Date(Number(m.timestamp)*1000).toISOString():ts;
      if(created>lastAt)lastAt=created;
      const fromMe=!!m.fromMe,rawBody=String(m.body||"").trim(),body=m.hasMedia?(rawBody&&rawBody.length<=1000?rawBody:"📎 Mídia"):rawBody.slice(0,4000);
      db.prepare("insert into messages(id,tenant_id,conversation_id,direction,sender_type,body,message_type,external_message_id,delivery_status,metadata,created_at) values(?,?,?,?,?,?,?,?,?,?,?)")
        .run(crypto.randomUUID(),tenantId,co.id,fromMe?"out":"in",fromMe?"staff":"client",body,m.hasMedia?"media":"text",String(m.id),String(m.ackName|| (fromMe?"sent":"received")).toLowerCase(),JSON.stringify({synced:true}),created);
      stats.messages_imported++;
    }
    db.prepare("update conversations set last_message_at=?,updated_at=? where id=? and tenant_id=?").run(lastAt,ts,co.id,tenantId);
    stats.chats_imported++;
  }
  return stats;
}

export async function ingestWahaEvent({db,tenantId,event,interpret,autoReply,deliverText=sendText,defaultHandlingMode="human"}){
  const expected=sessionForTenant(db,tenantId);if(event?.session!==expected)return {accepted:false,reason:"other_session"};
  const p=event?.payload||{};
  if(event.event==="message.ack"){
    const ackId=normalizeWahaMessageId(p.id);
    if(ackId&&p.ackName)db.prepare("update messages set delivery_status=? where tenant_id=? and external_message_id=?").run(String(p.ackName).toLowerCase(),tenantId,ackId);
    return {accepted:true,type:"ack"};
  }
  if(event.event!=="message"||p.fromMe)return {accepted:true,type:"ignored"};
  const externalId=normalizeWahaMessageId(p.id),phone=await phoneFromChat(p.from,expected);if(!externalId||!phone)return {accepted:true,type:"ignored"};
  const duplicate=db.prepare("select id from messages where tenant_id=? and external_message_id=?").get(tenantId,externalId);
  if(duplicate)return {accepted:true,type:"duplicate"};
  let client=db.prepare("select * from clients where tenant_id=? and phone=? limit 1").get(tenantId,phone);
  const ts=new Date().toISOString();
  if(!client){
    const cid=crypto.randomUUID(),name=displayName(p)||("WhatsApp "+phone.slice(-4));
    db.prepare("insert into clients(id,tenant_id,name,phone,tags,notes,source,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)")
      .run(cid,tenantId,name,phone,JSON.stringify(["WhatsApp","Nova"]),"" ,"whatsapp",ts,ts);
    client=db.prepare("select * from clients where id=?").get(cid);
  }
  let co=db.prepare("select * from conversations where tenant_id=? and client_id=? and channel='whatsapp' and status='open' order by created_at desc limit 1").get(tenantId,client.id);
  if(!co){
    const cid=crypto.randomUUID();
    const initialMode=defaultHandlingMode==="ai"?"ai":"human";
    db.prepare("insert into conversations(id,tenant_id,client_id,channel,external_id,status,last_message_at,created_at,unread_count,handling_mode,handling_mode_source,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(cid,tenantId,client.id,"whatsapp",p.from,"open",ts,ts,0,initialMode,initialMode==="ai"?"auto":"default",ts);
    co=db.prepare("select * from conversations where id=?").get(cid);
  }
  if(!p.hasMedia&&defaultHandlingMode==="ai"&&co.handling_mode==="human"&&(co.handling_mode_source||"default")==="default"){
    db.prepare("update conversations set handling_mode='ai',handling_mode_source='auto',updated_at=? where id=? and tenant_id=?").run(ts,co.id,tenantId);
    co=db.prepare("select * from conversations where id=?").get(co.id);
  }
  const rawBody=String(p.body||"").trim(),body=p.hasMedia?(rawBody&&rawBody.length<=1000?rawBody:"📎 Mídia recebida — revisar manualmente."):rawBody.slice(0,4000);
  const intent=body&&interpret?await interpret(tenantId,body):null;
  db.prepare(`insert into messages(id,tenant_id,conversation_id,direction,sender_type,body,message_type,external_message_id,delivery_status,metadata,created_at)
    values(?,?,?,?,?,?,?,?,?,?,?)`).run(crypto.randomUUID(),tenantId,co.id,"in","client",body,p.hasMedia?"media":"text",externalId,"received",JSON.stringify({intent}),ts);
  let mode=p.hasMedia?"human":co.handling_mode||"human",auto=null;
  if(p.hasMedia)db.prepare("update conversations set last_message_at=?,unread_count=unread_count+1,handling_mode='human',handling_mode_source='handoff',updated_at=? where id=?").run(ts,ts,co.id);
  else db.prepare("update conversations set last_message_at=?,unread_count=unread_count+1,handling_mode=?,updated_at=? where id=?").run(ts,mode,ts,co.id);
  if(mode==="ai"&&!p.hasMedia&&autoReply){
    auto=await autoReply({tenantId,client,conversation:co,text:body,intent});
    if(auto?.handoff){
      mode="human";
      db.prepare("update conversations set handling_mode='human',handling_mode_source='handoff',updated_at=? where id=? and tenant_id=?").run(new Date().toISOString(),co.id,tenantId);
    }else if(auto?.text){
      const sent=await deliverText(co.external_id||phone,auto.text,sessionForTenant(db,tenantId)),outTs=new Date().toISOString(),mid=crypto.randomUUID();
      db.prepare(`insert into messages(id,tenant_id,conversation_id,direction,sender_type,body,external_message_id,delivery_status,metadata,created_at)
        values(?,?,?,?,?,?,?,?,?,?)`).run(mid,tenantId,co.id,"out","assistant",auto.text,sent.messageId||null,"sent",JSON.stringify({automatic:true,route:intent?.route||null}),outTs);
      db.prepare("update conversations set last_message_at=?,updated_at=? where id=?").run(outTs,outTs,co.id);
    }
  }
  return {accepted:true,type:"message",conversationId:co.id,clientId:client.id,intent,handlingMode:mode,automaticReply:!!auto?.text,handoff:!!auto?.handoff};
}
