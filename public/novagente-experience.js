(()=>{"use strict";
const groups=[
["Essenciais do seu salão",[
["agenda","Agenda","calendar-days","rose"],["clients","Clientes","users","peach"],["inbox","Atendimentos","scissors","violet"],["finance","Financeiro","chart-no-axes-column-increasing","teal"]]],
["Gestão do seu negócio",[
["inventory","Estoque","package","amber"],["team","Equipe","users-round","purple"],["services","Serviços","list","copper"],["suppliers","Fornecedores","truck","coral"]]],
["Crescimento e relacionamento",[
["marketing","Marketing","megaphone","pink"],["retention","Fidelização","gift","red"],["inbox","WhatsApp e Automações","message-circle","green"],["agents","IA e Assistentes","sparkles","lilac"]]],
["Análises e resultados",[
["reports","Relatórios e BI","chart-column","blue"],["ownerEye","Olho do Dono","crown","gold"]]]
];
const symbols={"calendar-days":"▣","users":"♙","scissors":"✂","chart-no-axes-column-increasing":"▥","package":"⬡","users-round":"♧","list":"☷","truck":"▱","megaphone":"◁","gift":"♧","message-circle":"◎","sparkles":"✧","chart-column":"▥","crown":"♛"};
function mount(){
 const dashboard=document.querySelector("#dashboard");
 if(!dashboard||dashboard.querySelector(".ne-experience"))return;
 const root=document.createElement("div");root.className="ne-experience";
 const intro=document.createElement("div");intro.className="ne-intro";
 intro.innerHTML='<div><p class="ne-kicker">NOVAGENTE • ESTÉTICA</p><h2>Seu salão, em um só lugar<span>.</span></h2><p class="ne-sub">Tudo conectado, sem sobrecarregar sua rotina. Escolha por onde começar.</p></div>';
 root.append(intro);
 for(const [title,items] of groups){
  const section=document.createElement("section");section.className="ne-section";
  const h=document.createElement("h3");h.textContent=title;section.append(h);
  const grid=document.createElement("div");grid.className="ne-card-grid";
  if(items.length===2)grid.classList.add("ne-wide-grid");
  for(const [view,label,symbol,tone] of items){
   const button=document.createElement("button");button.type="button";
   button.className="ne-module ne-"+tone;button.setAttribute("aria-label","Abrir "+label);
   const badge=document.createElement("span");badge.className="ne-module-icon";badge.setAttribute("aria-hidden","true");badge.textContent=symbols[symbol]||"◈";
   const text=document.createElement("strong");text.textContent=label;
   const arrow=document.createElement("span");arrow.className="ne-module-arrow";arrow.textContent="›";arrow.setAttribute("aria-hidden","true");
   button.append(badge,text,arrow);
   button.addEventListener("click",()=>{
     const target=document.querySelector('.sidebar nav [data-view="'+view+'"]');
     if(target){target.click();if(document.querySelector("#"+view)?.classList.contains("active"))document.querySelector("main")?.scrollTo({top:0,behavior:"smooth"});}
   });
   grid.append(button);
  }
  section.append(grid);root.append(section);
 }
 const old=Array.from(dashboard.children);
 const details=document.createElement("details");details.className="ne-operational-details";
 const summary=document.createElement("summary");summary.textContent="Ver indicadores e operações do dia";details.append(summary);
 old.forEach(node=>details.append(node));
 dashboard.append(root,details);
 const nav=document.querySelector(".sidebar nav");
 if(nav){
  nav.classList.add("ne-compact-nav");
  const compact=new Set(["dashboard","inbox","agenda","clients","finance","admin"]);
  nav.querySelectorAll(".bw-single-link").forEach(b=>{if(!compact.has(b.dataset.view))b.classList.add("ne-hidden-link")});
 }
 const title=document.querySelector("#pageTitle");
 if(title&&document.querySelector("#dashboard.active"))title.textContent="Visão geral";
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mount,{once:true});else mount();
})();