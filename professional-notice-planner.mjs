// Planejador puro para lembretes da equipe (SEM envio externo).
// Para envio futuro: exigir canal autorizado, consentimento quando aplicável,
// fila com idempotência, proteção LGPD e confirmação de entrega WAHA.
const TZ='America/Porto_Velho';
const MINUTE=60000;
const fmt=new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
function validMs(value,label){const ms=Date.parse(value);if(!Number.isFinite(ms))throw new TypeError(label+' inválido');return ms}
export function remainingMinutes(targetAt,now=new Date().toISOString()) {
 return Math.ceil((validMs(targetAt,'targetAt')-validMs(now,'now'))/MINUTE);
}
export function remainingText(minutes){
 if(!Number.isInteger(minutes))throw new TypeError('minutos inválidos');
 if(minutes<=0)return 'horário iniciado';
 const hours=Math.floor(minutes/60),mins=minutes%60;
 return [hours?hours+'h':'',mins?mins+'min':''].filter(Boolean).join(' ')||'0min';
}
export function planProfessionalNotices(appointment,now=new Date().toISOString()) {
 const start=validMs(appointment.start_at,'start_at'),end=validMs(appointment.end_at,'end_at'),current=validMs(now,'now');
 if(end<=start)throw new RangeError('Atendimento não pode terminar antes de começar');
 const status=String(appointment.status||'scheduled');
 if(['cancelled','no_show','completed'].includes(status))return [];
 const notices=[['agenda_24h',24*60],['agenda_2h',120],['agenda_30min',30]];
 return notices.filter(([,m])=>start-m*MINUTE>current).map(([kind,m])=>({kind,appointment_id:String(appointment.id),professional_id:String(appointment.professional_id),scheduled_at:new Date(start-m*MINUTE).toISOString(),dedupe_key:'prof:'+appointment.id+':'+kind+':'+start}));
}
export function professionalAgendaMessage(appointment,{kind='agenda_created',now=new Date().toISOString(),previousStartAt=null}={}) {
 const start=validMs(appointment.start_at,'start_at'),end=validMs(appointment.end_at,'end_at');
 if(end<=start)throw new RangeError('Duração inválida');
 const left=remainingMinutes(appointment.start_at,now);
 const duration=Math.ceil((end-start)/MINUTE);
 const safe=s=>String(s||'').trim().replace(/[\r\n\t]+/g,' ').slice(0,90);
 const name=safe(appointment.professional_name)||'Profissional';
 const service=safe(appointment.service_name)||'Serviço agendado';
 const person=safe(appointment.client_name)||'Cliente';
 const at=fmt.format(new Date(start));
 if(kind==='cancelled')return `Olá, ${name}. Atendimento cancelado: ${service}, ${at}. Consulte sua agenda para verificar a vaga.`;
 if(kind==='rescheduled')return `Olá, ${name}. Horário alterado: ${service}. Anterior: ${previousStartAt?fmt.format(new Date(validMs(previousStartAt,'previousStartAt'))):'consultar agenda'}. Novo: ${at}. Duração prevista: ${duration} min.`;
 if(kind==='in_service')return `Olá, ${name}. Atendimento em andamento: ${service}. Tempo restante previsto: ${remainingText(remainingMinutes(appointment.end_at,now))}.`;
 const label={agenda_24h:'Lembrete de 24 horas',agenda_2h:'Lembrete de 2 horas',agenda_30min:'Lembrete de 30 minutos',agenda_created:'Novo agendamento'}[kind]||'Atualização de agenda';
 return `${label}, ${name}: ${service} com ${person}, em ${at}. Duração prevista: ${duration} min. ${left>0?'Faltam '+remainingText(left)+' para começar.':'Confira o horário na agenda.'}`;
}