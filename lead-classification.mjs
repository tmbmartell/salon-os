// Classificação autônoma de conversas: execução local, auditável e sem envio externo.
// Preserva intervenção humana, evita "compra" baseada apenas em palavras e respeita o tenant.
import crypto from "node:crypto";
import {advanceLead,leadFor,registerIncoming} from "./commercial-automation.mjs";

const iso=()=>new Date().toISOString();
const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const ruleVersion="lead-v1.0";
export function installLeadClassification(db){
  const columns=db.prepare("pragma table_info(conversations)").all().map(x=>x.name);
  if(!columns.includes("classification_source"))
    db.exec("alter table conversations add column classification_source text not null default 'auto'");
  db.exec(`create table if not exists lead_classification_audit(
    id text primary key,tenant_id text not null,conversation_id text not null,
    message_id text not null,previous_category text,new_category text,
    previous_priority text,new_priority text,reason text not null,
    intent text not null,confidence real not null,source text not null,
    applied integer not null,created_at text not null,
    unique(tenant_id,conversation_id,message_id)
  );
  create index if not exists idx_lead_classification_audit
    on lead_classification_audit(tenant_id,conversation_id,created_at);`);
}
export function inferLeadClassification(text,{intent=null,hasMedia=false}={}){
  if(hasMedia)return {category:"waiting",priority:"normal",intent:"media",confidence:1,reason:"Mídia precisa de análise pela equipe",handoff:true};
  const t=normalize(text);
  if(/\b(reclam\w*|insatisfeit\w*|machuc\w*|queimad\w*|prejuiz\w*|denunci\w*|processo|alergia|infec\w*|diagnostic\w*|medic\w*|doenca)\b/.test(t))
    return {category:"complaint",priority:"urgent",intent:"sensitive",confidence:.99,reason:"Reclamação ou assunto sensível: encaminhamento humano",handoff:true};
  if(/\b(falar com (uma |um )?(pessoa|atendente|gerente)|atendimento humano|quero atendente|pessoa real)\b/.test(t))
    return {category:"waiting",priority:"high",intent:"human",confidence:.99,reason:"Solicitação explícita de atendimento humano",handoff:true};
  if(/\b(cancelar|cancela|desmarcar|desmarco|reagendar|remarcar|trocar (meu |o )?horario)\b/.test(t))
    return {category:"appointment",priority:"high",intent:"appointment_change",confidence:.96,reason:"Pedido de alterar ou cancelar agendamento; decisão depende das regras",handoff:true};
  if(/\b(quero (agendar|marcar|reservar)|pode agendar|pode marcar|tem vaga|tem horario|horarios disponiveis|agendar para|marcar para|encaixe|disponibilidade|preciso agendar)\b/.test(t))
    return {category:"appointment",priority:"high",intent:"appointment_book",confidence:.95,reason:"Intenção concreta de agendar",handoff:false};
  if(/\b(pos[- ]?venda|depois do atendimento|retorno|avaliacao do atendimento|fiz (a|o) (unha|corte|servico)|gostei do atendimento)\b/.test(t))
    return {category:"post_sale",priority:"normal",intent:"post_sale",confidence:.88,reason:"Mensagem de acompanhamento após atendimento; confirmar histórico antes de agir",handoff:false};
  if(/\b(desconto|mais barato|promocao|negociar|negocia|abaixar o valor)\b/.test(t))
    return {category:"lead",priority:"high",intent:"discount",confidence:.92,reason:"Interesse comercial com negociação; desconto depende de aprovação",handoff:true};
  if(/\b(preco|valor|quanto custa|quanto fica|orcamento|tabela de preco|formas de pagamento|parcelamento)\b/.test(t))
    return {category:"lead",priority:"normal",intent:"price",confidence:.91,reason:"Consulta comercial de valor ou orçamento",handoff:false};
  if(/\b(corte|manicure|pedicure|sobrancelha|limpeza de pele|massagem|escova|progressiva|hidratacao|tratamento|servico|procedimento|fazem|voces fazem)\b/.test(t))
    return {category:"lead",priority:"normal",intent:"service",confidence:.85,reason:"Interesse em serviço do salão",handoff:false};
  if(intent?.route==="appointment_book" && Number(intent.confidence)>=.85)
    return {category:"appointment",priority:"high",intent:"appointment_book",confidence:Number(intent.confidence),reason:"Roteador identificou solicitação de agendamento",handoff:false};
  if(["price","service"].includes(intent?.route)&&Number(intent.confidence)>=.85)
    return {category:"lead",priority:"normal",intent:intent.route,confidence:Number(intent.confidence),reason:"Intenção comercial identificada pelo roteador",handoff:false};
  return {category:"general",priority:"normal",intent:"general",confidence:.35,reason:"Sem sinais suficientes; preservar organização existente",handoff:false};
}
export function classifyIncomingLead(db,{tenantId,conversationId,clientId,messageId,text,intent=null,hasMedia=false,at=iso()}){
  if(!tenantId||!conversationId||!clientId||!messageId)throw new TypeError("IDs de classificação obrigatórios");
  const co=db.prepare("select id,category,priority,classification_source,handling_mode,handling_mode_source from conversations where id=? and tenant_id=? and client_id=?").get(conversationId,tenantId,clientId);
  if(!co)throw new Error("conversation_not_found");
  const previous=db.prepare("select * from lead_classification_audit where tenant_id=? and conversation_id=? and message_id=?").get(tenantId,conversationId,messageId);
  if(previous)return {duplicate:true,applied:Boolean(previous.applied),category:previous.new_category,reason:previous.reason};
  const prediction=inferLeadClassification(text,{intent,hasMedia});
  const confident=prediction.confidence>=.80&&prediction.category!=="general";
  const manual=co.classification_source==="manual";
  const apply=confident&&!manual;
  const newCategory=apply?prediction.category:(co.category||"general");
  // Nunca reduzir prioridade automaticamente; se houver intervenção manual, não alterar.
  const levels={normal:0,high:1,urgent:2};
  const oldPriority=co.priority||"normal";
  const newPriority=apply&&levels[prediction.priority]>levels[oldPriority]?prediction.priority:oldPriority;
  db.exec("BEGIN IMMEDIATE");
  try{
    db.prepare(`insert into lead_classification_audit
      (id,tenant_id,conversation_id,message_id,previous_category,new_category,previous_priority,new_priority,reason,intent,confidence,source,applied,created_at)
      values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      crypto.randomUUID(),tenantId,conversationId,messageId,co.category||"general",newCategory,oldPriority,newPriority,
      prediction.reason,prediction.intent,prediction.confidence,ruleVersion,Number(apply),at);
    if(apply){
      db.prepare("update conversations set category=?,priority=?,updated_at=? where id=? and tenant_id=?")
        .run(newCategory,newPriority,at,conversationId,tenantId);
    }
    // Handoff só é permitido para condições de segurança; nunca retomar IA após intervenção humana.
    if(prediction.handoff&&confident&&co.handling_mode_source!=="manual"){
      db.prepare("update conversations set handling_mode='human',handling_mode_source='handoff',updated_at=? where id=? and tenant_id=?")
        .run(at,conversationId,tenantId);
    }
    db.exec("COMMIT");
  }catch(e){db.exec("ROLLBACK");throw e}
  // O funil tem suas próprias etapas. Perguntar preço NÃO significa orçamento enviado ou compra.
  // Só move de novo contato para respondeu; agendamento/compra depende de evento real do ERP.
  if(apply&&["lead","appointment"].includes(prediction.category)){
    try{
      const lead=leadFor(db,tenantId,clientId);
      if(!lead)registerIncoming(db,tenantId,clientId,text,{messageId,source:"whatsapp",at});
      const current=leadFor(db,tenantId,clientId);
      if(current?.stage==="novo_contato")advanceLead(db,tenantId,clientId,"respondeu",{actor:"lead_classifier",eventKey:"classified:"+messageId});
    }catch{ /* a classificação continua registrada, mesmo se o CRM estiver indisponível */ }
  }
  return {duplicate:false,applied:apply,category:newCategory,priority:newPriority,reason:prediction.reason,
    confidence:prediction.confidence,intent:prediction.intent,handoff:prediction.handoff,manual_override:manual};
}
export function classificationHistory(db,{tenantId,conversationId,limit=20}){
  return db.prepare(`select previous_category,new_category,previous_priority,new_priority,reason,intent,
     confidence,source,applied,created_at from lead_classification_audit
     where tenant_id=? and conversation_id=? order by created_at desc limit ?`)
    .all(tenantId,conversationId,Math.min(50,Math.max(1,limit)));
}
