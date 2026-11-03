/* NOVAGENTE · ícones coerentes para cards existentes.
   Apenas troca glifos decorativos por SVGs acessíveis (aria-hidden), sem alterar ações. */
(()=>{"use strict";
const path={
 plus:'<path d="M12 5v14M5 12h14"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M7.5 3v4M16.5 3v4M3 10h18M8 14h3M8 17h3"/>',
 refresh:'<path d="M20 6v5h-5M4 18v-5h5"/><path d="M5.6 9a7.5 7.5 0 0 1 13-2L20 11M4 13l1.4 4a7.5 7.5 0 0 0 13-2"/>',
 wallet:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
 box:'<path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 5 9-5M12 12v9"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 8a3 3 0 0 1 0 6M18 17a5 5 0 0 1 3 3"/>',
 chart:'<rect x="4" y="12" width="3" height="8" rx="1"/><rect x="10.5" y="7" width="3" height="13" rx="1"/><rect x="17" y="3" width="3" height="17" rx="1"/>',
 message:'<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3.2-.7L4 20l1.8-5.3a8 8 0 1 1 14.2-3.2Z"/><circle cx="9" cy="11.5" r=".7"/><circle cx="12.5" cy="11.5" r=".7"/><circle cx="16" cy="11.5" r=".7"/>',
 gift:'<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M3 13h18M12 9C2 9 5 2 9 4c2 1 3 5 3 5Zm0 0c10 0 7-7 3-5-2 1-3 5-3 5Z"/>',
 settings:'<path d="M9.8 3.2h4.4l.7 2.3 1.7.9 2.3-.6 2.2 3.8-1.7 1.7v2l1.7 1.7-2.2 3.8-2.3-.6-1.7.9-.7 2.3H9.8l-.7-2.3-1.7-.9-2.3.6-2.2-3.8 1.7-1.7v-2L2.9 9.6l2.2-3.8 2.3.6 1.7-.9z"/><circle cx="12" cy="12" r="3"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
 arrow:'<path d="m9 5 7 7-7 7"/>',
 scissors:'<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><path d="m7 7.5 13 12M7 16.5l13-12"/>',
 truck:'<path d="M3 6h11v11H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
 spark:'<path d="m12 2 2.2 6.3L21 11l-6.8 2.7L12 20l-2.2-6.3L3 11l6.8-2.7z"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>'
};
const names=[
 [/^agendar|novo hor[aá]rio|novo atendimento|adicionar/, "plus"],
 [/^hoje|agenda do dia/, "clock"],
 [/^pr[oó]ximos|calend[aá]rio|agenda/, "calendar"],
 [/^encaixes|lista de espera|atualizar/, "refresh"],
 [/^clientes|cliente|equipe|profissionais|pessoas|funcion[aá]rios/, "users"],
 [/^financeiro|caixa|pagamento|cobran/, "wallet"],
 [/^estoque|produtos|materiais|insumo/, "box"],
 [/^relat[oó]rios|desempenho|an[aá]lis|crescimento/, "chart"],
 [/^atendimento|mensagens|whats|conversa/, "message"],
 [/^fideliza|b[oô]nus|pr[eê]mio|pacote/, "gift"],
 [/^servi[cç]os|corte|colora/, "scissors"],
 [/^fornecedor|compras|entrega/, "truck"],
 [/^ia|agentes|intelig[eê]ncia/, "spark"],
 [/^configura|administra|seguran/, "settings"],
 [/^detalhes|hist[oó]rico|registros/, "list"]
];
function glyph(name){
 const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
 svg.setAttribute("viewBox","0 0 24 24");
 svg.setAttribute("fill","none");
 svg.setAttribute("stroke","currentColor");
 svg.setAttribute("stroke-width","1.9");
 svg.setAttribute("stroke-linecap","round");
 svg.setAttribute("stroke-linejoin","round");
 svg.setAttribute("aria-hidden","true");
 svg.innerHTML=path[name];
 return svg;
}
function update(){
 document.querySelectorAll('.view:not(#dashboard) :is(.ne-action-card,.ne-finance-action,.ne-stock-action,.hubCard)').forEach(card=>{
  if(card.dataset.neIconEnhanced)return;
  const label=card.querySelector("strong,h3")?.textContent?.trim()?.toLowerCase()||"";
  const match=names.find(([re])=>re.test(label));
  if(!match)return;
  const span=card.querySelector(":scope > .ne-action-icon,:scope > .hubIcon,:scope > span:first-child");
  if(!span)return;
  // Do not replace meaningful text labels; only known icon containers.
  if(!span.classList.contains("ne-action-icon")&&!span.classList.contains("hubIcon")&&span.textContent.trim().length>4)return;
  span.replaceChildren(glyph(match[1]));
  span.classList.add("ne-ui-icon");
  span.setAttribute("aria-hidden","true");
  card.dataset.neIconEnhanced="1";
 });
}
function mount(){
 update();
 let pending=false;
 const observer=new MutationObserver(()=>{
  if(pending)return;pending=true;
  requestAnimationFrame(()=>{pending=false;update()});
 });
 for(const v of document.querySelectorAll(".view:not(#dashboard)"))observer.observe(v,{childList:true,subtree:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
})();