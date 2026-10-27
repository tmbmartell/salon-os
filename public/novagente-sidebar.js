/* Etapa 22.1 — sidebar visual compacto, com acesso completo preservado. */
(()=>{'use strict';
const iconPaths={
 dashboard:'<path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9"/><path d="M9 21v-7h6v7"/>',
 inbox:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M7 9h10M7 13h7M7 17h4"/>',
 agenda:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h3"/>',
 clients:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2"/><path d="M17 8a3 3 0 0 1 0 6M18 17a5 5 0 0 1 3 3"/>',
 operation:'<path d="m3 7 9-4 9 4v10l-9 4-9-4z"/><path d="m3 7 9 5 9-5M12 12v9"/>',
 finance:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
 growth:'<path d="M4 14V9l11-4v13L4 14zM15 10c3 0 5 2 5 4M7 15l2 5"/>',
 ai:'<path d="m12 2 2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/><path d="M20 19v4M18 21h4"/>',
 settings:'<path d="M9.7 3h4.6l.7 2.3 2 1 2.3-.7 2.3 4-.9 1.9v2l.9 2-2.3 4-2.3-.7-2 1-.7 2.2H9.7L9 19.8l-2-1-2.3.7-2.3-4 .9-2v-2l-.9-1.9 2.3-4 2.3.7 2-1z"/><circle cx="12" cy="12" r="3"/>'
};
function svg(name){const ns='http://www.w3.org/2000/svg';const node=document.createElementNS(ns,'svg');node.setAttribute('viewBox','0 0 24 24');node.setAttribute('fill','none');node.setAttribute('stroke','currentColor');node.setAttribute('stroke-width','1.75');node.setAttribute('stroke-linecap','round');node.setAttribute('stroke-linejoin','round');node.setAttribute('aria-hidden','true');node.innerHTML=iconPaths[name]||iconPaths.operation;return node}
const navDefs=[
 ['dashboard','Início','dashboard'],['inbox','Atendimento','inbox'],['agenda','Agenda','agenda'],['clients','Clientes','clients'],
 ['Operação','Operação','operation'],['Financeiro & estoque','Financeiro e estoque','finance'],
 ['Crescimento','Crescimento','growth'],['Inteligência','Inteligência','ai'],['Configurações','Configurações','settings']
];
function start(){
 const nav=document.querySelector('.sidebar nav');if(!nav||nav.dataset.neRail)return;
 nav.dataset.neRail='true';document.querySelector('.sidebar')?.classList.add('ne-rail-sidebar');
 const nodes=Array.from(nav.children);
 for(const [key,label,ico] of navDefs){
  const node=nodes.find(n=>n.matches('[data-view]')?n.dataset.view===key:n.classList.contains('bw-nav-group')&&n.querySelector('.bw-nav-trigger')?.textContent.trim()===key);
  if(!node)continue;
  const btn=node.matches('button')?node:node.querySelector('.bw-nav-trigger');if(!btn)continue;
  if(node.classList.contains('bw-nav-group'))node.classList.add('ne-rail-group');
  btn.classList.add('ne-rail-button');
  btn.dataset.tooltip=label;btn.setAttribute('aria-label',label);btn.setAttribute('title',label);
  const labelText=document.createElement('span');labelText.className='ne-rail-label';labelText.textContent=label;
  btn.replaceChildren(svg(ico),labelText);
 }
 // Submenus: usar apenas o nome legível, sem glifos ou ícones decorativos.
 nav.querySelectorAll('.bw-submenu [data-view]').forEach(item=>{
   const label=item.querySelector('span')?.textContent?.trim()||
     item.textContent.replace(/^[^\p{L}\p{N}]+/u,'').trim();
   item.textContent=label;
   item.title=label;
   item.setAttribute('aria-label',label);
 });
 nav.querySelectorAll('.bw-nav-group .bw-nav-trigger').forEach(t=>t.addEventListener('click',()=>{
  nav.querySelectorAll('.bw-nav-group').forEach(group=>{
   if(group!==t.closest('.bw-nav-group')){group.classList.remove('is-open');group.querySelector('.bw-nav-trigger')?.setAttribute('aria-expanded','false')}
  })
 }));
 const closeAll=(except=null)=>nav.querySelectorAll('.bw-nav-group').forEach(g=>{
   if(g!==except){g.classList.remove('is-open');g.querySelector('.bw-nav-trigger')?.setAttribute('aria-expanded','false')}
 });
 const positionPopup=(group)=>{
   const trigger=group.querySelector('.bw-nav-trigger'),pop=group.querySelector('.bw-submenu');
   if(!trigger||!pop)return;
   const rect=trigger.getBoundingClientRect();
   const width=Math.min(300,Math.max(230,window.innerWidth-rect.right-24));
   const maxHeight=Math.min(500,window.innerHeight-24);
   const popupHeight=Math.min(pop.scrollHeight||180,maxHeight);
   const top=Math.max(12,Math.min(rect.top,window.innerHeight-popupHeight-12));
   pop.style.left=(rect.right+12)+'px';
   pop.style.top=top+'px';
   pop.style.width=width+'px';
   pop.style.maxHeight=maxHeight+'px';
 };
 nav.querySelectorAll('.bw-nav-group').forEach(group=>{
   const trigger=group.querySelector('.bw-nav-trigger');
   trigger?.addEventListener('click',()=>{
     closeAll(group);
     if(group.classList.contains('is-open'))positionPopup(group);
   });
 });
 nav.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>closeAll()));
 window.addEventListener('resize',()=>nav.querySelectorAll('.bw-nav-group.is-open').forEach(positionPopup));
 nav.addEventListener('scroll',()=>nav.querySelectorAll('.bw-nav-group.is-open').forEach(positionPopup),{passive:true});
 closeAll();
 nav.addEventListener('click',e=>{if(e.target.closest('.bw-submenu [data-view]')){
   nav.querySelectorAll('.bw-nav-group').forEach(g=>{g.classList.remove('is-open');g.querySelector('.bw-nav-trigger')?.setAttribute('aria-expanded','false')})
 }});
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('.sidebar'))nav.querySelectorAll('.bw-nav-group').forEach(g=>{g.classList.remove('is-open');g.querySelector('.bw-nav-trigger')?.setAttribute('aria-expanded','false')})});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')nav.querySelectorAll('.bw-nav-group').forEach(g=>{g.classList.remove('is-open');g.querySelector('.bw-nav-trigger')?.setAttribute('aria-expanded','false')})});
 const update=()=>{
  nav.querySelectorAll('.ne-rail-group').forEach(g=>{g.classList.toggle('ne-contains-active',!!g.querySelector('.bw-submenu [data-view].active'))})
 };
 const watcher=new MutationObserver(update);
 watcher.observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
 update();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();