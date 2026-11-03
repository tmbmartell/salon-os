/* Etapa 23 — micro navegação contextual, sem API nova. */
(()=>{'use strict';
const labels={inbox:['Atendimentos','✉'],agenda:['Agenda','▣'],clients:['Clientes','♧'],finance:['Financeiro','▥'],inventory:['Estoque','⬡'],team:['Equipe','♧'],services:['Serviços','☷'],marketing:['Marketing','✧'],retention:['Fidelização','♡'],reports:['Relatórios','▥'],ownerEye:['Olho do Dono','♛']};
const shortcuts={inbox:[['clients','Ver clientes'],['agenda','Abrir agenda']],agenda:[['clients','Clientes'],['inbox','Atendimentos']],clients:[['agenda','Agenda'],['retention','Fidelização']],finance:[['reports','Relatórios'],['inventory','Estoque']],inventory:[['suppliers','Fornecedores'],['retail','PDV']],team:[['services','Serviços'],['agenda','Agenda']]};
function start(){
 for(const [id,[label,symbol]] of Object.entries(labels)){
 const section=document.getElementById(id),title=section?.querySelector(':scope > .sectionTitle');
 if(!title||title.dataset.neDone)continue;
 title.dataset.neDone='1';
 const heading=title.querySelector('h2');
 if(heading&&!heading.parentElement.querySelector('.ne-ops-kicker')){
  const kicker=document.createElement('span');kicker.className='ne-ops-kicker';kicker.textContent='Gestão inteligente · '+label;heading.before(kicker);
 }
 const links=shortcuts[id]||[];
 if(links.length){
  const strip=document.createElement('nav');strip.className='ne-ops-mini-nav';strip.setAttribute('aria-label','Atalhos de '+label);
  for(const [target,name] of links){
    const btn=document.createElement('button');btn.type='button';btn.textContent=name+' ↗';
    btn.addEventListener('click',()=>document.querySelector('.sidebar nav [data-view="'+target+'"]')?.click());
    strip.append(btn);
  }
  title.after(strip);
 }
 }
 const wa=document.querySelector('#inbox .ne-wa-connection');
 if(wa&&!wa.closest('details.ne-ops-advanced')){
  const details=document.createElement('details');details.className='ne-ops-advanced bw-disclosure';
  const summary=document.createElement('summary');summary.className='bw-disclosure-summary';
  const group=document.createElement('span');group.className='bw-disclosure-copy';
  const title=document.createElement('strong');title.className='bw-disclosure-title';title.textContent='Configuração do WhatsApp';
  const help=document.createElement('small');help.textContent='Conexão e importação: abrir somente quando necessário';
  group.append(title,help);summary.append(group);
  const arrow=document.createElement('span');arrow.className='bw-disclosure-arrow';arrow.textContent='⌄';summary.append(arrow);
  wa.before(details);details.append(summary,wa);
 }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();