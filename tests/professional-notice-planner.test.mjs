import test from 'node:test';
import assert from 'node:assert/strict';
import {remainingMinutes,remainingText,planProfessionalNotices,professionalAgendaMessage} from '../professional-notice-planner.mjs';
const appointment={id:'qa-ap-1',professional_id:'qa-pro-1',professional_name:'Júlia',client_name:'Cliente QA',service_name:'Limpeza de Pele',status:'confirmed',start_at:'2026-11-20T14:00:00.000Z',end_at:'2026-11-20T15:00:00.000Z'};
test('contagem regressiva usa minutos até a agenda, sem confundir timezone',()=>{
 assert.equal(remainingMinutes(appointment.start_at,'2026-11-20T13:30:00.000Z'),30);
 assert.equal(remainingMinutes(appointment.end_at,'2026-11-20T14:45:00.000Z'),15);
 assert.equal(remainingText(130),'2h 10min');assert.equal(remainingText(30),'30min');
});
test('aviso de agenda em 24h/2h/30min e idempotência',()=>{
 const x=planProfessionalNotices(appointment,'2026-11-19T11:00:00.000Z');
 assert.deepEqual(x.map(z=>z.kind),['agenda_24h','agenda_2h','agenda_30min']);
 assert.deepEqual(x.map(z=>z.scheduled_at),['2026-11-19T14:00:00.000Z','2026-11-20T12:00:00.000Z','2026-11-20T13:30:00.000Z']);
 assert.equal(new Set(x.map(z=>z.dedupe_key)).size,3);
 assert.deepEqual(planProfessionalNotices({...appointment,status:'cancelled'},'2026-11-19T11:00:00.000Z'),[]);
});
test('agenda de última hora não agenda lembrete retroativo',()=>{
 assert.deepEqual(planProfessionalNotices(appointment,'2026-11-20T13:50:00.000Z'),[]);
 assert.equal(planProfessionalNotices(appointment,'2026-11-20T11:30:00.000Z').length,2);
});
test('mensagem informa profissional, data no fuso local, duração e tempo até iniciar',()=>{
 const msg=professionalAgendaMessage(appointment,{kind:'agenda_30min',now:'2026-11-20T13:30:00.000Z'});
 assert.match(msg,/Júlia/);assert.match(msg,/20\/11\/2026/);assert.match(msg,/10:00/);assert.match(msg,/30min/);assert.match(msg,/Duração prevista: 60 min/);
});
test('remarcação, cancelamento e tempo restante do atendimento',()=>{
 assert.match(professionalAgendaMessage(appointment,{kind:'rescheduled',previousStartAt:'2026-11-20T13:00:00.000Z'}),/Novo: 20\/11\/2026/);
 assert.match(professionalAgendaMessage(appointment,{kind:'cancelled'}),/cancelado/i);
 assert.match(professionalAgendaMessage(appointment,{kind:'in_service',now:'2026-11-20T14:45:00.000Z'}),/15min/);
});
test('rejeita duração inválida e horário não interpretável',()=>{
 assert.throws(()=>planProfessionalNotices({...appointment,end_at:appointment.start_at}));
 assert.throws(()=>remainingMinutes('um-dia','2026-11-20T00:00:00Z'));
});