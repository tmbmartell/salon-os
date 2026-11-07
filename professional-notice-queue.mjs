// NOVAGENTE Estética — fila de homologação dos avisos profissionais.
// Este módulo não faz chamadas externas e NÃO envia WhatsApp.
import crypto from "node:crypto";
import {planProfessionalNotices,professionalAgendaMessage} from "./professional-notice-planner.mjs";

const nowIso=()=>new Date().toISOString();
const short=v=>String(v??"").trim().replace(/[\r\n\t]/g," ").slice(0,120);
const phoneDigits=v=>String(v||"").replace(/\D/g,"");
const phoneValid=v=>/^(?:[0-9]{10,11}|55[0-9]{10,11})$/.test(v);
const hash=s=>crypto.createHash("sha256").update(String(s)).digest("hex");

export function installProfessionalNoticeQueue(db){
  db.exec(`create table if not exists professional_notice_queue(
    id text primary key,
    tenant_id text not null,
    appointment_id text not null,
    professional_id text not null,
    kind text not null,
    appointment_version text not null,
    scheduled_at text not null,
    recipient_phone text,
    payload text not null,
    dedupe_key text not null unique,
    status text not null default 'pending',
    created_at text not null,
    updated_at text not null
  );
  create index if not exists idx_prof_notice_due
    on professional_notice_queue(tenant_id,status,scheduled_at);
  create index if not exists idx_prof_notice_appointment
    on professional_notice_queue(tenant_id,appointment_id,professional_id);`);
}

function validate({tenantId,appointment,professional,event,now}){
  if(!tenantId||!appointment?.id||!professional?.id)throw new TypeError("salão, agendamento e profissional obrigatórios");
  if(!["created","rescheduled","cancelled"].includes(event))throw new TypeError("evento inválido");
  if(String(appointment.professional_id)!==String(professional.id))throw new TypeError("profissional não corresponde ao atendimento");
  const start=Date.parse(appointment.start_at),end=Date.parse(appointment.end_at),clock=Date.parse(now);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!Number.isFinite(clock))throw new RangeError("horário inválido");
}

function entry({tenantId,appointment,professional,kind,scheduledAt,version,now,previousStartAt}){
  const phone=phoneDigits(professional.phone);
  const payload={
    id:String(appointment.id), professional_id:String(professional.id),
    professional_name:short(professional.name), client_name:short(appointment.client_name),
    service_name:short(appointment.service_name),start_at:String(appointment.start_at),
    end_at:String(appointment.end_at),status:String(appointment.status||"confirmed"),
    previous_start_at:previousStartAt||null
  };
  const dedupeKey=hash([tenantId,appointment.id,professional.id,kind,version].join("|"));
  return {
    id:crypto.randomUUID(),tenant_id:String(tenantId),appointment_id:payload.id,
    professional_id:payload.professional_id,kind,appointment_version:version,
    scheduled_at:scheduledAt,recipient_phone:phoneValid(phone)?phone:null,
    payload:JSON.stringify(payload),dedupe_key:dedupeKey,
    status:phoneValid(phone)?"pending":"blocked_missing_phone",
    created_at:now,updated_at:now
  };
}

export function queueProfessionalNotices(db,{tenantId,appointment,professional,event="created",previousStartAt=null,now=nowIso()}){
  validate({tenantId,appointment,professional,event,now});
  const version=[appointment.start_at,appointment.end_at,professional.id].join("|");
  const notifications=[];
  const kind=event==="created"?"agenda_created":event==="rescheduled"?"rescheduled":"cancelled";
  notifications.push(entry({tenantId,appointment,professional,kind,scheduledAt:now,version,now,previousStartAt}));
  if(event!=="cancelled")for(const planned of planProfessionalNotices(appointment,now)){
    notifications.push(entry({tenantId,appointment,professional,kind:planned.kind,scheduledAt:planned.scheduled_at,version,now,previousStartAt}));
  }
  let inserted=0;
  db.exec("BEGIN IMMEDIATE");
  try{
    if(event==="cancelled"){
      db.prepare(`update professional_notice_queue set status='superseded',updated_at=?
        where tenant_id=? and appointment_id=? and status in ('pending','blocked_missing_phone') and kind!='cancelled'`)
        .run(now,tenantId,appointment.id);
    }else if(event==="rescheduled"){
      db.prepare(`update professional_notice_queue set status='superseded',updated_at=?
        where tenant_id=? and appointment_id=? and status in ('pending','blocked_missing_phone') and appointment_version!=?`)
        .run(now,tenantId,appointment.id,version);
    }
    const stmt=db.prepare(`insert or ignore into professional_notice_queue
      (id,tenant_id,appointment_id,professional_id,kind,appointment_version,scheduled_at,recipient_phone,payload,dedupe_key,status,created_at,updated_at)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for(const n of notifications){
      const result=stmt.run(n.id,n.tenant_id,n.appointment_id,n.professional_id,n.kind,n.appointment_version,n.scheduled_at,n.recipient_phone,n.payload,n.dedupe_key,n.status,n.created_at,n.updated_at);
      inserted+=result.changes;
    }
    db.exec("COMMIT");
  }catch(e){db.exec("ROLLBACK");throw e}
  return {scheduled:inserted,blocked_missing_phone:notifications.filter(x=>x.status==="blocked_missing_phone").length,external_messages_sent:0};
}

export function dueProfessionalNotices(db,{tenantId,now=nowIso(),limit=50}){
  if(!tenantId)throw new TypeError("salão obrigatório");
  return db.prepare(`select id,tenant_id,appointment_id,professional_id,kind,scheduled_at,recipient_phone,payload,status
    from professional_notice_queue where tenant_id=? and status='pending' and scheduled_at<=?
    order by scheduled_at,id limit ?`).all(tenantId,now,Math.min(100,Math.max(1,limit)));
}

export function previewProfessionalNotice(row,{at=nowIso()}={}){
  if(!row||!row.payload)throw new TypeError("aviso inválido");
  const appointment=JSON.parse(row.payload);
  return professionalAgendaMessage(appointment,{
    kind:row.kind,now:at,previousStartAt:appointment.previous_start_at
  });
}

export function simulateProfessionalNotice(db,{tenantId,id,now=nowIso()}){
  const result=db.prepare(`update professional_notice_queue set status='simulated_only',updated_at=?
    where id=? and tenant_id=? and status='pending'`).run(now,id,tenantId);
  return {simulated:result.changes===1,real_delivery:false};
}
