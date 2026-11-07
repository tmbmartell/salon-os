import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {installCommercialAutomation,registerIncoming} from "../commercial-automation.mjs";
import {installLeadClassification,classifyIncomingLead,classificationHistory,inferLeadClassification} from "../lead-classification.mjs";

function fixture(){
  const db=new DatabaseSync(":memory:");
  db.exec(`create table clients(id text primary key,tenant_id text not null,source text);
    create table conversations(id text primary key,tenant_id text not null,client_id text not null,
      category text default 'general',priority text default 'normal',handling_mode text default 'ai',
      handling_mode_source text default 'auto',updated_at text);
    insert into clients values('c1','salon-a','whatsapp'),('c2','salon-b','whatsapp');
    insert into conversations values('co1','salon-a','c1','general','normal','ai','auto','2026-11-01'),
      ('co2','salon-b','c2','general','normal','ai','auto','2026-11-01');`);
  installCommercialAutomation(db);
  installLeadClassification(db);
  return db;
}
const decide=(db,text,{id="m1",tenantId="salon-a",conversationId="co1",clientId="c1",hasMedia=false,intent=null}={})=>{
 registerIncoming(db,tenantId,clientId,text,{messageId:id,source:"whatsapp",at:"2026-11-07T12:00:00.000Z"});
 return classifyIncomingLead(db,{tenantId,conversationId,clientId,messageId:id,text,intent,hasMedia,at:"2026-11-07T12:00:00.000Z"});
};

test("classifica preço e move o lead para respondeu, mas nunca inventa venda",()=>{
 const db=fixture();
 try{
  const r=decide(db,"Oi, qual é o preço da limpeza de pele?");
  assert.equal(r.category,"lead");assert.equal(r.applied,true);assert.ok(r.confidence>=.8);
  const co=db.prepare("select category,priority from conversations where id='co1'").get();
  assert.deepEqual(co,{category:"lead",priority:"normal"});
  const lead=db.prepare("select stage from commercial_leads where client_id='c1'").get();
  assert.equal(lead.stage,"respondeu");
  assert.equal(decide(db,"Oi, qual é o preço da limpeza de pele?").duplicate,true);
  assert.equal(classificationHistory(db,{tenantId:"salon-a",conversationId:"co1"}).length,1);
 }finally{db.close()}
});

test("agendar vira prioridade alta, mas não conta como agendamento concluído",()=>{
 const db=fixture();
 try{
  const r=decide(db,"Quero agendar limpeza de pele na sexta");
  assert.equal(r.category,"appointment");assert.equal(r.priority,"high");assert.equal(r.intent,"appointment_book");
  assert.equal(db.prepare("select stage from commercial_leads where client_id='c1'").get().stage,"respondeu");
 }finally{db.close()}
});

test("reclamação gera atendimento humano e prioridade urgente",()=>{
 const db=fixture();
 try{
  const r=decide(db,"Fiquei insatisfeita, tive uma queimadura");
  assert.equal(r.category,"complaint");assert.equal(r.priority,"urgent");assert.equal(r.handoff,true);
  assert.equal(db.prepare("select handling_mode from conversations where id='co1'").get().handling_mode,"human");
 }finally{db.close()}
});

test("pedido de pessoa real transfere sem agendar nem lançar compra",()=>{
 const db=fixture();
 try{
  const r=decide(db,"Quero falar com um atendente");
  assert.equal(r.category,"waiting");assert.equal(r.handoff,true);
 }finally{db.close()}
});

test("mensagem ambígua não reorganiza nem baixa prioridade alta",()=>{
 const db=fixture();
 try{
  db.prepare("update conversations set category='vip',priority='high' where id='co1'").run();
  const r=decide(db,"Bom dia, tudo certo?");
  assert.equal(r.applied,false);assert.equal(r.category,"vip");
  assert.equal(db.prepare("select priority from conversations where id='co1'").get().priority,"high");
 }finally{db.close()}
});

test("classificação manual tem precedência, inclusive sobre intenção forte",()=>{
 const db=fixture();
 try{
  db.prepare("update conversations set category='vip',priority='high',classification_source='manual' where id='co1'").run();
  const r=decide(db,"Quero agendar para amanhã");
  assert.equal(r.manual_override,true);assert.equal(r.applied,false);assert.equal(r.category,"vip");
  assert.equal(db.prepare("select category from conversations where id='co1'").get().category,"vip");
 }finally{db.close()}
});

test("mesma conversa de outros salões não compartilha registros e histórico",()=>{
 const db=fixture();
 try{
  decide(db,"Qual o preço?",{id:"mA"});
  const r=decide(db,"Quero agendar",{id:"mA",tenantId:"salon-b",conversationId:"co2",clientId:"c2"});
  assert.equal(r.category,"appointment");
  assert.equal(classificationHistory(db,{tenantId:"salon-a",conversationId:"co2"}).length,0);
  assert.equal(classificationHistory(db,{tenantId:"salon-b",conversationId:"co2"}).length,1);
 }finally{db.close()}
});

test("mídia não é diagnosticada automaticamente nem classificada como compra",()=>{
 const db=fixture();
 try{
  const r=decide(db,"",{id:"m-media",hasMedia:true});
  assert.equal(r.category,"waiting");assert.equal(r.handoff,true);
  assert.equal(db.prepare("select stage from commercial_leads where client_id='c1'").get().stage,"novo_contato");
 }finally{db.close()}
});

test("intenção do roteador complementa mensagens diretas com confiança alta",()=>{
 const c=inferLeadClassification("sexta, por favor",{intent:{route:"appointment_book",confidence:.94}});
 assert.equal(c.category,"appointment");assert.equal(c.confidence,.94);
 const low=inferLeadClassification("ok",{intent:{route:"appointment_book",confidence:.45}});
 assert.equal(low.category,"general");assert.ok(low.confidence<.8);
});

test("não emite disparos comerciais sem política e consentimento explícito",()=>{
 const db=fixture();
 try{
  decide(db,"Qual é o preço?");
  const action=db.prepare("select kind,status from commercial_jobs where tenant_id='salon-a'").get();
  assert.equal(action.kind,"lead_recovery_7d");assert.equal(action.status,"held");
 }finally{db.close()}
});
