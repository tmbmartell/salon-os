(()=>{'use strict';
function make(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n}
function enhance(card){
 if(card.dataset.enhancedClient)return;card.dataset.enhancedClient='1';
 const id=card.dataset.neClientId;
 const info=make('div','ne-client-expanded');info.hidden=true;info.id='ne-client-'+id;
 info.append(make('strong','','Detalhes da cliente'));
 const meta=card.querySelector('.clientMeta');if(meta)meta.querySelectorAll('small').forEach(n=>info.append(make('p','',n.textContent)));
 const note=card.querySelector(':scope > p');if(note)info.append(make('p','','Observações: '+note.textContent));
 if(info.childElementCount===1)info.append(make('p','','Sem observações adicionais.'));
 const actions=make('div','ne-client-commands');
 const agendar=make('button','ne-client-primary','＋ Agendar');agendar.type='button';
 agendar.addEventListener('click',()=>{
  const select=document.querySelector('#apClient'),modal=document.querySelector('#appointmentModal');
  if(select&&Array.from(select.options).some(o=>o.value===id))select.value=id;
  if(modal&&!modal.open)modal.showModal();
 });
 const btn=make('button','','Ver detalhes');btn.type='button';btn.setAttribute('aria-expanded','false');btn.setAttribute('aria-controls',info.id);
 const history=make('div','ne-client-history');history.append(make('strong','','Histórico de serviços e pagamentos'));
 info.append(history);
 btn.addEventListener('click',()=>{
  info.hidden=!info.hidden;btn.setAttribute('aria-expanded',String(!info.hidden));btn.textContent=info.hidden?'Ver detalhes':'Ocultar detalhes';
  if(!info.hidden&&!history.dataset.loaded){history.dataset.loaded='1';loadHistory(id,history).catch(()=>{history.dataset.loaded='';history.append(make('p','','Falha ao consultar histórico. Feche e abra novamente.'))})}
 });
 actions.append(agendar,btn);card.append(actions,info);
}
async function loadHistory(id,container){
 const message=make('p','','Consultando histórico…');container.append(message);
 const resp=await fetch('/api/clients/'+encodeURIComponent(id)+'/history',{credentials:'same-origin',cache:'no-store'});
 if(!resp.ok){message.textContent=resp.status===403?'Seu perfil não tem acesso ao histórico.':'Não foi possível carregar o histórico.';return}
 const data=await resp.json();message.remove();
 if(!data.visits?.length){container.append(make('p','','Nenhum atendimento registrado.'));return}
 const payments=new Map((data.payments||[]).map(x=>[x.appointment_id,x]));
 const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
 const labels={completed:'Finalizado',scheduled:'Agendado',confirmed:'Confirmado',arrived:'Chegou',in_service:'Em atendimento',cancelled:'Cancelado',no_show:'Não compareceu'};
 for(const visit of data.visits){
  const row=make('div','ne-client-visit'),when=new Date(visit.start_at);
  const tz=window.__neTenantZone||'America/Porto_Velho';
  const date=Number.isNaN(when.getTime())?String(visit.start_at||''):when.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:tz});
  row.append(make('p','',date+' · '+(labels[visit.status]||visit.status)),make('p','',visit.service_names||'Serviço não identificado'));
  if(data.show_payments){const pay=payments.get(visit.id);row.append(make('p','',pay?'Pagamento: '+money.format(pay.amount)+' · '+String(pay.method||'não informado'):'Nenhum pagamento vinculado a este atendimento.'))}
  container.append(row);
 }
}
function init(){const list=document.getElementById('clientList');if(!list)return;const scan=()=>list.querySelectorAll('article[data-ne-client-id]').forEach(enhance);new MutationObserver(scan).observe(list,{childList:true});scan()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();