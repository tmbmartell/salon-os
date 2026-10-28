/* NOVAGENTE Etapa 24 — funil e controles; envio externo não implementado */
(()=>{"use strict";
const stages=[
["novo_contato","Novo contato"],["respondeu","Respondeu"],["orcamento_enviado","Orçamento"],["agendou","Agendou"],["sinal_pago","Sinal pago"],["atendido","Atendido"],["voltou","Voltou"]
];
const switches=[
["assistant_reply","IA responde mensagens"],["assistant_booking","IA confirma agendamentos"],["appointment_confirmation_24h","Confirmação 24h"],["appointment_reminder_2h","Lembrete 2h"],["deposit_receivable","Sinal financeiro"],["waitlist_offer","Lista de espera"],["quote_followups","Retomada de orçamento"],["lead_recovery_7d","Recuperação em 7 dias"],["return_cycle","Convite de retorno"],["birthday","Aniversário"],["inactive_60d","Inativos há 60 dias"],["review_invitation","Convite para avaliação"],["high_value_alert","Alerta alto valor"],["owner_digest","Resumo da dona"],["stock_replenishment","Reposição de estoque"],["commission_reports","Relatórios da equipe"],["fiscal_invoice","Emissão de nota fiscal"]
];
const $=(selector,root=document)=>root.querySelector(selector);
const create=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e};
async function api(path,options={}){
 const resp=await fetch(path,{credentials:"same-origin",headers:{"content-type":"application/json"},...options});
 const value=await resp.json().catch(()=>({}));
 if(!resp.ok)throw new Error(value.error||"request_failed");
 return value;
}
let selected="novo_contato";
async function refresh(wrapper){
 const state=await api("/api/commercial/overview");
 const counts=$("#neAutoStages",wrapper),details=$("#neAutoLeads",wrapper),jobs=$("#neAutoJobs",wrapper);
 counts.replaceChildren();
 for(const [key,label] of stages){
  const b=create("button","ne-auto-stage"+(selected===key?" is-active":""),label);
  b.type="button";b.append(create("strong","",String(state.stages[key]||0)));
  b.addEventListener("click",()=>{selected=key;refresh(wrapper).catch(showError)});
  counts.append(b);
 }
 details.replaceChildren();
 const filtered=state.leads.filter(l=>l.stage===selected);
 if(!filtered.length)details.append(create("p","ne-auto-muted","Nenhum contato nesta etapa ainda."));
 else for(const lead of filtered){
  const entry=create("div","ne-auto-lead");
  entry.append(create("strong","",lead.client_name||"Cliente"),create("span","",lead.source+" · "+(lead.intent||"geral")));
  const detailsBtn=create("button","ne-auto-mini","Avançar etapa");detailsBtn.type="button";
  const i=stages.findIndex(x=>x[0]===lead.stage);
  if(i===stages.length-1){detailsBtn.disabled=true;detailsBtn.textContent="Ciclo concluído"}
  else detailsBtn.onclick=async()=>{
   try{await api("/api/commercial/leads/"+encodeURIComponent(lead.id)+"/stage",{method:"PATCH",body:JSON.stringify({stage:stages[i+1][0]})});await refresh(wrapper)}catch(e){showError(e)}
  };
  entry.append(detailsBtn);details.append(entry);
 }
 $("#neAutoValue",wrapper).textContent=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format((state.open_quote_cents||0)/100);
 $("#neAutoPending",wrapper).textContent=String(state.jobs.filter(j=>j.status==="pending").length);
 $("#neAutoCount",wrapper).textContent=String(state.leads.length);
 jobs.replaceChildren();
 if(!state.jobs.length)jobs.append(create("p","ne-auto-muted","Nenhuma ação prevista."));
 else for(const j of state.jobs.slice(0,12)){
  const row=create("div","ne-auto-job");
  row.append(create("span","",j.kind.replace(/_/g," ")),create("small","",j.status==="held"?"Em espera: "+j.reason:"Planejada, sem envio automático"));
  jobs.append(row);
 }
 const options=$("#neAutoPolicyOptions",wrapper);
 options.replaceChildren();
 for(const [key,label] of switches){
  const item=create("label","ne-auto-switch");
  const span=create("span","",label),checkbox=create("input");checkbox.type="checkbox";checkbox.checked=!!state.settings[key];
  checkbox.onchange=async()=>{
   checkbox.disabled=true;
   try{await api("/api/commercial/policies",{method:"PATCH",body:JSON.stringify({key,enabled:checkbox.checked})});await refresh(wrapper)}catch(e){checkbox.checked=!checkbox.checked;showError(e)}finally{checkbox.disabled=false}
  };
  item.append(span,checkbox);options.append(item);
 }
}
function showError(err){const el=document.getElementById("neAutoFeedback");if(el)el.textContent="Não foi possível concluir: "+(err.message||err)}
function addSection(){
 const inbox=document.getElementById("inbox");if(!inbox||document.getElementById("neAutomationHub"))return;
 const root=create("details","ne-auto-hub");root.id="neAutomationHub";
 const title=create("summary","ne-auto-summary");
 const heading=create("span","ne-auto-summary-heading","Funil inteligente e automações");
 const status=create("span","ne-auto-status","Modo seguro · Sem envios externos");
 title.append(heading,status);root.append(title);
 const content=create("div","ne-auto-content");
 const metrics=create("div","ne-auto-metrics");
 for(const [id,label] of [["neAutoCount","Contatos no funil"],["neAutoValue","Orçamentos em aberto"],["neAutoPending","Ações planejadas"]]){
  const box=create("div","ne-auto-metric");box.append(create("small","",label));
  const val=create("strong","",id==="neAutoValue"?"R$ 0,00":"0");val.id=id;box.append(val);metrics.append(box);
 }
 content.append(metrics);
 const stageCards=create("div","ne-auto-stages");stageCards.id="neAutoStages";content.append(stageCards);
 const list=create("div","ne-auto-leads");list.id="neAutoLeads";content.append(list);
 const more=create("details","ne-auto-settings");
 const smry=create("summary","","Configurações e simulação");more.append(smry);
 const internal=create("div","ne-auto-settings-inside");
 internal.append(create("p","ne-auto-muted","Todos os envios começam desligados. Ativar uma regra não conecta o WhatsApp nem envia mensagens. É necessário registrar permissão da cliente e configurar o provedor."));
 const policiesBox=create("div","ne-auto-policy-options");policiesBox.id="neAutoPolicyOptions";internal.append(policiesBox);
 const simulation=create("div","ne-auto-simulation");
 simulation.append(create("h3","","Simular conversa, sem disparar mensagem"));
 const clientPicker=create("select");clientPicker.id="neAutoClient";
 simulation.append(clientPicker);
 const message=create("input");message.id="neAutoText";message.type="text";message.maxLength=800;message.placeholder="Ex.: Quanto custa coloração? Tem horário?";
 const actions=create("div","ne-auto-actions");
 const preview=create("button","ne-auto-primary","Prévia da recepcionista");preview.type="button";
 const ingest=create("button","ne-auto-secondary","Adicionar ao funil (demo)");ingest.type="button";
 actions.append(preview,ingest);simulation.append(message,actions);
 const response=create("p","ne-auto-response");response.id="neAutoResponse";simulation.append(response);
 preview.onclick=async()=>{
  try{const r=await api("/api/commercial/preview-message",{method:"POST",body:JSON.stringify({text:message.value})});response.textContent=(r.handoff?"Encaminhar ao humano: ":"Prévia: ")+r.text}catch(e){showError(e)}
 };
 ingest.onclick=async()=>{
  try{await api("/api/commercial/simulate-inbound",{method:"POST",body:JSON.stringify({client_id:clientPicker.value,text:message.value})});response.textContent="Contato simulado registrado no funil. Nenhuma mensagem foi enviada.";await refresh(root)}catch(e){showError(e)}
 };
 internal.append(simulation);
 const bookingPane=create("details","ne-auto-settings ne-booking-preview");
 const bookingHead=create("summary","","Recepcionista que agenda · Demonstração");
 bookingPane.append(bookingHead);
 const bookContent=create("div","ne-auto-settings-inside");
 bookContent.append(create("p","ne-auto-muted","Simule uma conversa com dados fictícios. A IA verifica a agenda, oferece opções, registra a escolha e não envia mensagens reais."));
 const thread=create("div","ne-booking-thread");thread.setAttribute("role","log");thread.setAttribute("aria-live","polite");
 bookContent.append(thread);
 clientPicker.addEventListener("change",()=>thread.replaceChildren());
 const form=create("div","ne-booking-compose");
 const prompt=create("input");prompt.type="text";prompt.maxLength=800;
 prompt.placeholder="Ex.: quero agendar coloração amanhã";
 prompt.setAttribute("aria-label","Mensagem para a recepcionista");
 const send=create("button","ne-auto-primary","Enviar simulação");send.type="button";
 const quick=create("div","ne-auto-actions");
 for(const [label,phrase] of [["1ª opção","1"],["2ª opção","2"],["Outro dia","outro dia"]]){
  const action=create("button","ne-auto-mini",label);action.type="button";
  action.addEventListener("click",()=>{prompt.value=phrase;send.click()});
  quick.append(action);
 }
 send.addEventListener("click",async()=>{
  const input=prompt.value.trim(),clientId=clientPicker.value;
  if(!input||!clientId)return;
  const textRow=create("p","ne-booking-user",input);thread.append(textRow);
  send.disabled=true;prompt.value="";
  try{
    const result=await api("/api/commercial/booking-preview",{method:"POST",body:JSON.stringify({client_id:clientId,text:input})});
    thread.append(create("p","ne-booking-bot",result.text||"Não houve resposta."));
    if(result.booked)thread.append(create("p","ne-booking-success","Agendamento cadastrado na agenda fictícia."));
    if(result.handoff)thread.append(create("p","ne-booking-warning","Encaminhado ao humano, sem agendar."));
    thread.scrollTop=thread.scrollHeight;
    await refresh(root);
  }catch(e){thread.append(create("p","ne-booking-warning","Falha: "+(e.message||e)))}
  finally{send.disabled=false;prompt.focus()}
 });
 prompt.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();send.click()}});
 form.append(prompt,send);bookContent.append(form,quick);bookingPane.append(bookContent);
 content.prepend(bookingPane);
 const queue=create("details","ne-auto-settings");queue.append(create("summary","","Ações futuras e bloqueios"));
 const queueRows=create("div","ne-auto-jobs");queueRows.id="neAutoJobs";queue.append(queueRows);internal.append(queue);
 more.append(internal);content.append(more);
 const feedback=create("p","ne-auto-feedback");feedback.id="neAutoFeedback";feedback.setAttribute("role","status");content.append(feedback);
 root.append(content);
 const ref=$("#inbox > .sectionTitle")||$("#inbox > .ne-ops-mini-nav");
 ref?.after(root);
 let initiated=false;
 root.addEventListener("toggle",async()=>{
  if(!root.open)return;
  try{if(!initiated){const health=await api("/api/health");bookingPane.hidden=!health.disposable_demo;const clients=await api("/api/clients");clientPicker.replaceChildren();for(const c of clients){const opt=document.createElement("option");opt.value=c.id;opt.textContent=c.name;clientPicker.append(opt)}initiated=true}await refresh(root)}catch(e){showError(e)}
 });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",addSection,{once:true});else addSection();
})();