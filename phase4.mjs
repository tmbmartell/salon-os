import crypto from "node:crypto";

const uid=()=>crypto.randomUUID();
const now=()=>new Date().toISOString();
const one=(db,s,p=[])=>db.prepare(s).get(...p);
const all=(db,s,p=[])=>db.prepare(s).all(...p);
const run=(db,s,p=[])=>db.prepare(s).run(...p);
const txt=(v,n=800)=>String(v??"").trim().slice(0,n);


const RECEPTIONIST_DEFAULT_CONFIG={
  identity:{
    display_name:"Recepcionista IA",
    greeting_name:"Assistente do salão",
    introduction:"Oi! Eu sou a assistente virtual do salão. Como posso te ajudar?",
    signature:""
  },
  voice:{
    tone:"warm",
    formality:3,
    directness:7,
    emoji_level:2,
    use_client_first_name:true
  },
  service:{
    auto_activate_new_conversations:true,
    answer_prices:true,
    list_services:true,
    suggest_appointments:true,
    allow_booking_flow:true,
    allow_cancel:false,
    allow_reschedule:false,
    transfer_on_complaint:true,
    transfer_on_ambiguity:true,
    transfer_on_human_request:true
  },
  sales:{
    offer_next_step:true,
    suggest_related_service:false,
    recover_abandoned_lead:true,
    discount_policy:"Nunca oferecer desconto sem regra explícita do salão."
  },
  schedule:{
    confirmation_hours_before:24,
    reminder_hours_before:3,
    max_slots_to_offer:3,
    allow_waitlist_offer:true
  },
  limits:{
    never_promise_unavailable_slot:true,
    never_invent_price:true,
    never_confirm_without_slot:true,
    never_handle_payment_dispute:true,
    sensitive_topics_handoff:true
  },
  custom_instructions:""
};
export function getAgentConfig(db,tenant,key){
  const row=one(db,"select config from agent_profiles where tenant_id=? and agent_key=?",[tenant,key]);
  let saved={};try{saved=JSON.parse(row?.config||"{}")}catch{}
  if(key!=="receptionist")return saved&&typeof saved==="object"?saved:{};
  return {
    ...RECEPTIONIST_DEFAULT_CONFIG,
    ...saved,
    identity:{...RECEPTIONIST_DEFAULT_CONFIG.identity,...(saved.identity||{})},
    voice:{...RECEPTIONIST_DEFAULT_CONFIG.voice,...(saved.voice||{})},
    service:{...RECEPTIONIST_DEFAULT_CONFIG.service,...(saved.service||{})},
    sales:{...RECEPTIONIST_DEFAULT_CONFIG.sales,...(saved.sales||{})},
    schedule:{...RECEPTIONIST_DEFAULT_CONFIG.schedule,...(saved.schedule||{})},
    limits:{...RECEPTIONIST_DEFAULT_CONFIG.limits,...(saved.limits||{})}
  };
}
function sanitizeReceptionistConfig(input){
  const base=JSON.parse(JSON.stringify(RECEPTIONIST_DEFAULT_CONFIG)),v=input&&typeof input==="object"?input:{};
  const str=(x,n,d="")=>String(x??d).trim().slice(0,n);
  const bool=(x,d=false)=>x===undefined?d:!!x;
  const num=(x,min,max,d)=>Math.max(min,Math.min(max,Number.isFinite(Number(x))?Number(x):d));
  base.identity.display_name=str(v.identity?.display_name,80,base.identity.display_name);
  base.identity.greeting_name=str(v.identity?.greeting_name,80,base.identity.greeting_name);
  base.identity.introduction=str(v.identity?.introduction,500,base.identity.introduction);
  base.identity.signature=str(v.identity?.signature,120,"");
  base.voice.tone=["warm","professional","casual","luxury","direct"].includes(v.voice?.tone)?v.voice.tone:base.voice.tone;
  base.voice.formality=num(v.voice?.formality,0,10,base.voice.formality);
  base.voice.directness=num(v.voice?.directness,0,10,base.voice.directness);
  base.voice.emoji_level=num(v.voice?.emoji_level,0,5,base.voice.emoji_level);
  base.voice.use_client_first_name=bool(v.voice?.use_client_first_name,base.voice.use_client_first_name);
  for(const k of Object.keys(base.service))base.service[k]=bool(v.service?.[k],base.service[k]);
  for(const k of Object.keys(base.limits))base.limits[k]=bool(v.limits?.[k],base.limits[k]);
  base.sales.offer_next_step=bool(v.sales?.offer_next_step,base.sales.offer_next_step);
  base.sales.suggest_related_service=bool(v.sales?.suggest_related_service,base.sales.suggest_related_service);
  base.sales.recover_abandoned_lead=bool(v.sales?.recover_abandoned_lead,base.sales.recover_abandoned_lead);
  base.sales.discount_policy=str(v.sales?.discount_policy,600,base.sales.discount_policy);
  base.schedule.confirmation_hours_before=num(v.schedule?.confirmation_hours_before,1,168,base.schedule.confirmation_hours_before);
  base.schedule.reminder_hours_before=num(v.schedule?.reminder_hours_before,1,24,base.schedule.reminder_hours_before);
  base.schedule.max_slots_to_offer=num(v.schedule?.max_slots_to_offer,1,8,base.schedule.max_slots_to_offer);
  base.schedule.allow_waitlist_offer=bool(v.schedule?.allow_waitlist_offer,base.schedule.allow_waitlist_offer);
  base.custom_instructions=str(v.custom_instructions,6000,"");
  return base;
}

const DEFAULT_AGENTS=[
  ["receptionist","Recepcionista IA","Atendimento, confirmações, reagendamentos e agenda",4],
  ["commercial","Comercial IA","Recuperação de clientes, retorno e oportunidades",3],
  ["manager","Gerente IA","Gargalos operacionais, equipe e prioridades",4],
  ["finance","Financeiro IA","Caixa, contas, comissões e alertas financeiros",2],
  ["buyer","Comprador IA","Estoque, reposição, fornecedor e compras",2],
  ["analyst","Analista IA","Indicadores, tendências, desvios e explicações",5]
];

export function installPhase4(db){
  db.exec([
    "CREATE TABLE IF NOT EXISTS agent_profiles(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,agent_key TEXT NOT NULL,name TEXT NOT NULL,description TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 1,autonomy INTEGER NOT NULL DEFAULT 3,config TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(tenant_id,agent_key))",
    "CREATE TABLE IF NOT EXISTS agent_runs(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,agent_key TEXT NOT NULL,trigger_type TEXT NOT NULL,source TEXT NOT NULL DEFAULT 'local',summary TEXT NOT NULL DEFAULT '',created_by TEXT,created_at TEXT NOT NULL,metadata TEXT NOT NULL DEFAULT '{}')",
    "CREATE INDEX IF NOT EXISTS idx_agent_runs ON agent_runs(tenant_id,created_at)",
    "CREATE TABLE IF NOT EXISTS agent_tasks(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,agent_key TEXT NOT NULL,title TEXT NOT NULL,description TEXT NOT NULL,action_type TEXT NOT NULL,entity_type TEXT,entity_id TEXT,payload TEXT NOT NULL DEFAULT '{}',risk TEXT NOT NULL DEFAULT 'low',requires_approval INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'pending',dedupe_key TEXT,created_by TEXT,created_at TEXT NOT NULL,approved_by TEXT,approved_at TEXT,rejected_by TEXT,rejected_at TEXT,executed_at TEXT,result TEXT NOT NULL DEFAULT '{}')",
    "CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(tenant_id,status,created_at)",
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_task_dedupe ON agent_tasks(tenant_id,dedupe_key) WHERE dedupe_key IS NOT NULL"
  ].join(";"));
  const cols=db.prepare("pragma table_info(agent_profiles)").all().map(x=>x.name);
  if(!cols.includes("config"))db.exec("alter table agent_profiles add column config TEXT NOT NULL DEFAULT '{}'");
}

export function ensureAgentProfiles(db,tenant){
  const ts=now();
  for(const [key,name,description,autonomy] of DEFAULT_AGENTS){
    run(db,"insert into agent_profiles(id,tenant_id,agent_key,name,description,enabled,autonomy,created_at,updated_at) values(?,?,?,?,?,1,?,?,?) on conflict(tenant_id,agent_key) do nothing",[uid(),tenant,key,name,description,autonomy,ts,ts]);
  }
}

function addTask(db,tenant,agentKey,data,userId=null){
  const key=data.dedupe_key||null;
  if(key){
    const old=one(db,"select id,status from agent_tasks where tenant_id=? and dedupe_key=?",[tenant,key]);
    if(old&&["pending","approved","executed"].includes(old.status))return {id:old.id,deduped:true};
  }
  const id=uid();
  run(db,"insert into agent_tasks(id,tenant_id,agent_key,title,description,action_type,entity_type,entity_id,payload,risk,requires_approval,status,dedupe_key,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    [id,tenant,agentKey,txt(data.title,180),txt(data.description,1000),txt(data.action_type,80),data.entity_type||null,data.entity_id||null,JSON.stringify(data.payload||{}),data.risk||"low",data.requires_approval===false?0:1,"pending",key,userId,now()]);
  return {id,deduped:false};
}

function pendingConfirmations(db,tenant,hours=24){
  const limit=new Date(Date.now()+Math.max(1,Number(hours||24))*3600000).toISOString();
  return all(db,"select a.id,a.start_at,c.id client_id,c.name client_name,c.phone,s.name service_name,p.name professional_name from appointments a join clients c on c.id=a.client_id join services s on s.id=a.service_id join professionals p on p.id=a.professional_id where a.tenant_id=? and a.status='scheduled' and a.start_at>=datetime('now') and a.start_at<=? order by a.start_at limit 100",[tenant,limit]);
}


function appointmentReminders(db,tenant,hours=3){
  const from=new Date().toISOString(),to=new Date(Date.now()+Math.max(1,Number(hours||3))*3600000).toISOString();
  return all(db,"select a.id,a.start_at,c.id client_id,c.name client_name,c.phone,s.name service_name,p.name professional_name from appointments a join clients c on c.id=a.client_id join services s on s.id=a.service_id join professionals p on p.id=a.professional_id where a.tenant_id=? and a.status='confirmed' and a.start_at>=? and a.start_at<=? order by a.start_at limit 100",[tenant,from,to]);
}
function appointmentLocalParts(db,tenant,startAt){
  const tz=one(db,"select timezone from tenants where id=?",[tenant])?.timezone||"America/Porto_Velho";
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date(startAt));
  const m=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  const hour=Number(m.hour||0);
  return {date:m.year+"-"+m.month+"-"+m.day,period:hour<12?"morning":hour<17?"afternoon":"evening",timezone:tz};
}
function formatAppointmentWhen(db,tenant,startAt){
  const tz=one(db,"select timezone from tenants where id=?",[tenant])?.timezone||"America/Porto_Velho";
  return new Intl.DateTimeFormat("pt-BR",{timeZone:tz,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(startAt));
}
function waitlistOpportunities(db,tenant){
  const from=new Date().toISOString(),to=new Date(Date.now()+14*86400000).toISOString();
  const cancelled=all(db,"select a.id,a.start_at,a.end_at,a.professional_id,a.service_id,s.name service_name,p.name professional_name from appointments a join services s on s.id=a.service_id join professionals p on p.id=a.professional_id where a.tenant_id=? and a.status='cancelled' and a.start_at>=? and a.start_at<=? order by a.start_at limit 100",[tenant,from,to]);
  const out=[];
  for(const a of cancelled){
    const occupied=one(db,"select id from appointments where tenant_id=? and professional_id=? and id<>? and status not in ('cancelled','no_show') and start_at<? and end_at>? limit 1",[tenant,a.professional_id,a.id,a.end_at,a.start_at]);
    if(occupied)continue;
    const lp=appointmentLocalParts(db,tenant,a.start_at);
    const w=one(db,"select w.*,c.name client_name,c.phone client_phone from waitlist w join clients c on c.id=w.client_id where w.tenant_id=? and w.status='waiting' and w.service_id=? and (w.professional_id is null or w.professional_id=?) and (w.preferred_date is null or w.preferred_date='' or w.preferred_date=?) and (w.period='any' or w.period=?) order by case when w.preferred_date=? then 0 else 1 end,w.created_at limit 1",[tenant,a.service_id,a.professional_id,lp.date,lp.period,lp.date]);
    if(w)out.push({appointment_id:a.id,start_at:a.start_at,end_at:a.end_at,professional_id:a.professional_id,service_id:a.service_id,service_name:a.service_name,professional_name:a.professional_name,waitlist_id:w.id,client_id:w.client_id,client_name:w.client_name,client_phone:w.client_phone,slot_date:lp.date});
  }
  return out;
}

function recoveries(db,tenant){
  return all(db,"select r.*,c.name client_name,c.phone client_phone from recovery_actions r join clients c on c.id=r.client_id where r.tenant_id=? and r.status='queued' order by r.created_at limit 100",[tenant]);
}

function engagementTasks(db,tenant){
  return all(db,"select e.*,c.name client_name,c.phone client_phone from engagement_tasks e join clients c on c.id=e.client_id where e.tenant_id=? and e.status='pending' and datetime(e.due_at)<=datetime('now') order by e.due_at limit 100",[tenant]);
}
function financeRisks(db,tenant){
  return all(db,"select * from financial_entries where tenant_id=? and status='pending' and kind='expense' order by coalesce(due_date,'9999-12-31'),created_at limit 100",[tenant]);
}

function stockRisks(db,tenant){
  return all(db,"select p.*,s.name supplier_name,s.lead_days from products p left join suppliers s on s.id=p.supplier_id where p.tenant_id=? and p.active=1 and p.stock_qty<=p.min_qty order by (p.min_qty-p.stock_qty) desc limit 100",[tenant]);
}

function operationSignals(db,tenant){
  const since=new Date(Date.now()-30*86400000).toISOString();
  const apps=all(db,"select status from appointments where tenant_id=? and start_at>=?",[tenant,since]);
  const noShow=apps.filter(x=>x.status==="no_show").length,cancel=apps.filter(x=>x.status==="cancelled").length;
  const noShowRate=apps.length?noShow/apps.length*100:0,cancelRate=apps.length?cancel/apps.length*100:0;
  return {appointments:apps.length,noShowRate,cancelRate};
}

function analyticalSummary(db,tenant){
  const month=new Date(Date.now()-30*86400000).toISOString();
  const sales=one(db,"select coalesce(sum(total_cents),0) total,count(*) n from checkout_records where tenant_id=? and created_at>=?",[tenant,month])||{};
  const clients=one(db,"select count(distinct a.client_id) n from checkout_records cr join appointments a on a.id=cr.appointment_id where cr.tenant_id=? and cr.created_at>=?",[tenant,month])||{};
  const low=one(db,"select count(*) n from products where tenant_id=? and active=1 and stock_qty<=min_qty",[tenant])||{};
  const pending=one(db,"select coalesce(sum(amount_cents),0) total,count(*) n from financial_entries where tenant_id=? and kind='expense' and status='pending'",[tenant])||{};
  return {revenue30:Number(sales.total||0)/100,services30:Number(sales.n||0),clients30:Number(clients.n||0),lowStock:Number(low.n||0),pendingExpenses:Number(pending.total||0)/100,pendingExpensesCount:Number(pending.n||0)};
}

export function generateAgentTasks(db,tenant,userId=null){
  ensureAgentProfiles(db,tenant);
  const created=[],receptionProfile=one(db,"select enabled from agent_profiles where tenant_id=? and agent_key='receptionist'",[tenant]),receptionCfg=getAgentConfig(db,tenant,"receptionist"),receptionOn=Number(receptionProfile?.enabled)!==0;
  if(receptionOn)for(const a of pendingConfirmations(db,tenant,receptionCfg.schedule?.confirmation_hours_before||24)){
    const first=a.client_name.split(" ")[0],when=formatAppointmentWhen(db,tenant,a.start_at);
    created.push(addTask(db,tenant,"receptionist",{title:"Confirmar atendimento de "+a.client_name,description:a.service_name+" com "+a.professional_name+" em "+when,action_type:"send_whatsapp",entity_type:"appointment",entity_id:a.id,payload:{phone:a.phone,message:"Oi, "+first+"! Passando para confirmar seu "+a.service_name+" em "+when+". Posso deixar confirmado para você?",appointment_id:a.id},risk:"low",requires_approval:true,dedupe_key:"confirm-"+a.id},userId));
  }
  if(receptionOn)for(const a of appointmentReminders(db,tenant,receptionCfg.schedule?.reminder_hours_before||3)){
    const first=a.client_name.split(" ")[0],when=formatAppointmentWhen(db,tenant,a.start_at);
    created.push(addTask(db,tenant,"receptionist",{title:"Lembrar atendimento de "+a.client_name,description:a.service_name+" com "+a.professional_name+" em "+when,action_type:"send_whatsapp",entity_type:"appointment",entity_id:a.id,payload:{phone:a.phone,message:"Oi, "+first+"! Só passando para lembrar que seu "+a.service_name+" está marcado para "+when+". Te esperamos 💛",appointment_reminder_id:a.id},risk:"low",requires_approval:true,dedupe_key:"reminder-"+a.id},userId));
  }
  if(receptionOn&&receptionCfg.schedule?.allow_waitlist_offer!==false)for(const w of waitlistOpportunities(db,tenant)){
    const first=w.client_name.split(" ")[0],when=formatAppointmentWhen(db,tenant,w.start_at);
    created.push(addTask(db,tenant,"receptionist",{title:"Oferecer vaga para "+w.client_name,description:"Abriu "+w.service_name+" com "+w.professional_name+" em "+when,action_type:"send_whatsapp",entity_type:"waitlist",entity_id:w.waitlist_id,payload:{phone:w.client_phone,message:"Oi, "+first+"! Abriu um horário para "+w.service_name+" com "+w.professional_name+" em "+when+". Quer que eu reserve para você?",waitlist_id:w.waitlist_id,source_appointment_id:w.appointment_id},risk:"low",requires_approval:true,dedupe_key:"waitlist-offer-"+w.appointment_id+"-"+w.waitlist_id},userId));
  }
  for(const r of recoveries(db,tenant)){
    created.push(addTask(db,tenant,"commercial",{title:"Recuperar "+r.client_name,description:r.reason,action_type:"send_whatsapp",entity_type:"client",entity_id:r.client_id,payload:{phone:r.client_phone,message:r.message,recovery_action_id:r.id},risk:"low",requires_approval:true,dedupe_key:"recovery-"+r.id},userId));
  }
  for(const e of engagementTasks(db,tenant)){
    const agent=e.kind==="postcare"?"receptionist":"commercial";
    created.push(addTask(db,tenant,agent,{title:e.title,description:"Relacionamento · "+e.client_name,action_type:"send_whatsapp",entity_type:"engagement_task",entity_id:e.id,payload:{phone:e.client_phone,message:e.message,engagement_task_id:e.id},risk:"low",requires_approval:true,dedupe_key:"engagement-"+e.id},userId));
  }
  for(const f of financeRisks(db,tenant)){
    const overdue=f.due_date&&f.due_date<new Date().toISOString().slice(0,10);
    created.push(addTask(db,tenant,"finance",{title:(overdue?"Conta vencida: ":"Conta a pagar: ")+f.description,description:"Valor R$ "+(Number(f.amount_cents)/100).toFixed(2)+(f.due_date?" · vencimento "+f.due_date:""),action_type:"review_finance",entity_type:"financial_entry",entity_id:f.id,payload:{financial_entry_id:f.id,amount:Number(f.amount_cents)/100,due_date:f.due_date},risk:overdue?"medium":"low",requires_approval:true,dedupe_key:"finance-"+f.id},userId));
  }
  for(const p of stockRisks(db,tenant)){
    const qty=Math.max(0,Number(p.ideal_qty||p.min_qty)-Number(p.stock_qty||0));
    created.push(addTask(db,tenant,"buyer",{title:"Repor "+p.name,description:"Estoque "+p.stock_qty+" · mínimo "+p.min_qty+" · sugestão "+qty,action_type:"prepare_purchase",entity_type:"product",entity_id:p.id,payload:{product_id:p.id,supplier_id:p.supplier_id,supplier_name:p.supplier_name,suggested_qty:qty},risk:"medium",requires_approval:true,dedupe_key:"buy-"+p.id+"-"+Math.floor(Number(p.stock_qty||0))},userId));
  }
  const op=operationSignals(db,tenant);
  if(op.noShowRate>=10)created.push(addTask(db,tenant,"manager",{title:"Reduzir no-show",description:"Taxa dos últimos 30 dias: "+op.noShowRate.toFixed(1)+"%.",action_type:"manager_review",payload:{metric:"no_show_rate",value:op.noShowRate},risk:"low",requires_approval:false,dedupe_key:"manager-noshow-"+new Date().toISOString().slice(0,7)},userId));
  const a=analyticalSummary(db,tenant);
  created.push(addTask(db,tenant,"analyst",{title:"Resumo gerencial atualizado",description:"Receita 30d R$ "+a.revenue30.toFixed(2)+" · "+a.services30+" serviços · "+a.lowStock+" itens com estoque baixo.",action_type:"insight",payload:a,risk:"low",requires_approval:false,dedupe_key:"analyst-"+new Date().toISOString().slice(0,10)},userId));
  const runId=uid();
  run(db,"insert into agent_runs(id,tenant_id,agent_key,trigger_type,source,summary,created_by,created_at,metadata) values(?,?,?,?,?,?,?,?,?)",[runId,tenant,"orchestrator","scan","local","Varredura gerou ou deduplicou "+created.length+" ações.",userId,now(),JSON.stringify({items:created.length})]);
  return {run_id:runId,items:created.length};
}

function agentRouteLocal(text){
  const n=String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  const rules=[
    ["finance",/(caixa|conta|pagar|receber|comissao|financeir|despesa|receita)/],
    ["buyer",/(estoque|produto|fornecedor|compr|reposi|faltar|validade|lote)/],
    ["commercial",/(vender|recuper|retorno|cliente sum|campanh|reativ|comercial)/],
    ["receptionist",/(agenda|agend|horario|confirm|reagend|cancel|whatsapp|atendimento)/],
    ["analyst",/(indicador|relatorio|dados|analise|ticket|ltv|margem|tendencia)/],
    ["manager",/(equipe|gerente|gargalo|meta|operacao|prioridade|produtividade)/]
  ];
  for(const [agent,re] of rules)if(re.test(n))return {agent,source:"local_rule",confidence:.96};
  return {agent:null,source:"ambiguous",confidence:.3};
}

async function executeTask(db,tenant,user,task,sendText){
  const payload=JSON.parse(task.payload||"{}"),result={};
  if(task.action_type==="send_whatsapp"){
    if(!sendText)throw Object.assign(new Error("whatsapp_unavailable"),{status:503});
    if(!payload.phone||!payload.message)throw Object.assign(new Error("whatsapp_payload_invalid"),{status:400});
    const sent=await sendText(payload.phone,payload.message);
    result.sent=true;result.message_id=sent.messageId||null;
    if(payload.recovery_action_id)run(db,"update recovery_actions set status='sent',sent_at=? where id=? and tenant_id=?",[now(),payload.recovery_action_id,tenant]);
    if(payload.engagement_task_id)run(db,"update engagement_tasks set status='completed',completed_at=? where id=? and tenant_id=?",[now(),payload.engagement_task_id,tenant]);
    if(payload.waitlist_id)run(db,"update waitlist set status='offered',updated_at=? where id=? and tenant_id=? and status='waiting'",[now(),payload.waitlist_id,tenant]);
  }else if(task.action_type==="insight"||task.action_type==="manager_review"||task.action_type==="review_finance"||task.action_type==="prepare_purchase"){
    result.prepared=true;result.note="Ação preparada pelo agente; execução financeira/compra permanece humana.";
  }else{
    throw Object.assign(new Error("unsupported_action"),{status:400});
  }
  run(db,"update agent_tasks set status='executed',executed_at=?,result=? where id=? and tenant_id=?",[now(),JSON.stringify(result),task.id,tenant]);
  return result;
}

export async function handlePhase4Api({req,res,url,db,user,tenant,send,parseBody,requirePermission,audit,sendText,routeAmbiguous}){
  const guard=p=>requirePermission(user,p);
  ensureAgentProfiles(db,tenant);
  if(req.method==="GET"&&url.pathname==="/api/agents"){
    guard("agents.read");
    const profiles=all(db,"select * from agent_profiles where tenant_id=? order by agent_key",[tenant]).map(p=>({...p,config:getAgentConfig(db,tenant,p.agent_key)}));
    const tasks=one(db,"select count(*) pending from agent_tasks where tenant_id=? and status='pending'",[tenant])||{};
    return send(res,200,{profiles,pending:Number(tasks.pending||0)});
  }
  if(req.method==="PATCH"&&url.pathname==="/api/agents/profile"){
    guard("agents.write");
    const b=await parseBody(req),key=txt(b.agent_key,40),p=one(db,"select * from agent_profiles where tenant_id=? and agent_key=?",[tenant,key]);
    if(!p)return send(res,404,{error:"agent_not_found"});
    const enabled=b.enabled===undefined?Number(p.enabled):b.enabled?1:0,autonomy=b.autonomy===undefined?Number(p.autonomy):Math.max(0,Math.min(10,Number(b.autonomy)));
    let config=getAgentConfig(db,tenant,key);
    if(b.config!==undefined){
      if(key==="receptionist")config=sanitizeReceptionistConfig(b.config);
      else config=b.config&&typeof b.config==="object"?b.config:{};
    }
    run(db,"update agent_profiles set enabled=?,autonomy=?,config=?,updated_at=? where id=?",[enabled,autonomy,JSON.stringify(config),now(),p.id]);
    audit(db,user,"agent.profile.update","agent_profile",p.id,{enabled,autonomy,config_updated:b.config!==undefined});
    return send(res,200,{ok:true,agent_key:key,enabled:!!enabled,autonomy,config});
  }
  if(req.method==="POST"&&url.pathname==="/api/agents/run"){
    guard("agents.write");
    const out=generateAgentTasks(db,tenant,user.id);
    audit(db,user,"agents.scan","agent_run",out.run_id,{items:out.items});
    return send(res,201,out);
  }
  if(req.method==="GET"&&url.pathname==="/api/agents/tasks"){
    guard("agents.read");
    const status=txt(url.searchParams.get("status")||"",20);
    const rows=status?all(db,"select * from agent_tasks where tenant_id=? and status=? order by created_at desc limit 300",[tenant,status]):all(db,"select * from agent_tasks where tenant_id=? order by created_at desc limit 300",[tenant]);
    return send(res,200,rows.map(x=>({...x,payload:JSON.parse(x.payload||"{}"),result:JSON.parse(x.result||"{}")})));
  }
  const approve=url.pathname.match(/^\/api\/agents\/tasks\/([^/]+)\/approve$/);
  if(req.method==="POST"&&approve){
    guard("agents.approve");
    const id=decodeURIComponent(approve[1]),task=one(db,"select * from agent_tasks where id=? and tenant_id=?",[id,tenant]);
    if(!task)return send(res,404,{error:"task_not_found"});
    if(task.status!=="pending")return send(res,409,{error:"task_not_pending"});
    run(db,"update agent_tasks set status='approved',approved_by=?,approved_at=? where id=?",[user.id,now(),id]);
    audit(db,user,"agent.task.approve","agent_task",id,{agent_key:task.agent_key});
    return send(res,200,{ok:true,status:"approved"});
  }
  const reject=url.pathname.match(/^\/api\/agents\/tasks\/([^/]+)\/reject$/);
  if(req.method==="POST"&&reject){
    guard("agents.approve");
    const id=decodeURIComponent(reject[1]),task=one(db,"select * from agent_tasks where id=? and tenant_id=?",[id,tenant]);
    if(!task)return send(res,404,{error:"task_not_found"});
    if(!["pending","approved"].includes(task.status))return send(res,409,{error:"task_not_rejectable"});
    run(db,"update agent_tasks set status='rejected',rejected_by=?,rejected_at=? where id=?",[user.id,now(),id]);
    audit(db,user,"agent.task.reject","agent_task",id,{agent_key:task.agent_key});
    return send(res,200,{ok:true,status:"rejected"});
  }
  const execute=url.pathname.match(/^\/api\/agents\/tasks\/([^/]+)\/execute$/);
  if(req.method==="POST"&&execute){
    guard("agents.execute");
    const id=decodeURIComponent(execute[1]),task=one(db,"select * from agent_tasks where id=? and tenant_id=?",[id,tenant]);
    if(!task)return send(res,404,{error:"task_not_found"});
    if(task.status==="executed")return send(res,409,{error:"already_executed"});
    if(Number(task.requires_approval)&&task.status!=="approved")return send(res,409,{error:"approval_required"});
    try{
      const result=await executeTask(db,tenant,user,task,sendText);
      audit(db,user,"agent.task.execute","agent_task",id,{agent_key:task.agent_key,action_type:task.action_type});
      return send(res,200,{ok:true,status:"executed",result});
    }catch(e){return send(res,e.status||500,{error:e.message||"execution_failed"})}
  }
  if(req.method==="POST"&&url.pathname==="/api/agents/command"){
    guard("agents.read");
    const b=await parseBody(req),text=txt(b.text,1600);if(!text)return send(res,400,{error:"text_required"});
    let routed=agentRouteLocal(text),jev=null;
    if(!routed.agent&&routeAmbiguous){
      jev=await routeAmbiguous(text,{domain:"salon.agents"});
      const d=String(jev?.decision||"").toLowerCase();
      const found=DEFAULT_AGENTS.find(x=>d.includes(x[0]));
      routed={agent:found?.[0]||"manager",source:"jev",confidence:jev?.probability??null};
    }
    const profile=one(db,"select * from agent_profiles where tenant_id=? and agent_key=?",[tenant,routed.agent||"manager"]);
    const id=uid();
    run(db,"insert into agent_runs(id,tenant_id,agent_key,trigger_type,source,summary,created_by,created_at,metadata) values(?,?,?,?,?,?,?,?,?)",[id,tenant,routed.agent||"manager","command",routed.source,"Comando roteado para "+(profile?.name||routed.agent),user.id,now(),JSON.stringify({text:text.slice(0,400),jev})]);
    return send(res,200,{agent_key:routed.agent||"manager",agent_name:profile?.name||"Gerente IA",source:routed.source,confidence:routed.confidence,jev});
  }
  return false;
}

export function autoExecuteInternalTasks(db,tenant){
  const allowed=new Set(["insight","manager_review"]);
  const tasks=all(db,"select t.*,p.autonomy from agent_tasks t join agent_profiles p on p.tenant_id=t.tenant_id and p.agent_key=t.agent_key where t.tenant_id=? and t.status='pending' and t.requires_approval=0 order by t.created_at",[tenant]);
  let count=0;
  for(const t of tasks){
    if(!allowed.has(t.action_type)||Number(t.autonomy)<4)continue;
    const result={prepared:true,auto:true,autonomy:Number(t.autonomy)};
    run(db,"update agent_tasks set status='executed',executed_at=?,result=? where id=?",[now(),JSON.stringify(result),t.id]);
    count++;
  }
  return count;
}
