/* NOVAGENTE Estética · dashboard aprovado · interface funcional, dados reais e sem imagens */
(()=>{"use strict";
const primary=[
 ["inbox","Atendimento","message","violet","WhatsApp e conversas"],
 ["agenda","Agenda","calendar","pink","Horários e serviços"],
 ["clients","Clientes","users","orange","Cadastro e histórico"],
 ["inventory","Estoque","package","green","Produtos e consumo"],
 ["finance","Financeiro","wallet","yellow","Caixa e relatórios"],
 ["team","Equipe","team","blue","Profissionais e comissões"],
 ["marketing","Crescimento","chart","lilac","Marketing e fidelização"],
 ["admin","Administração","settings","sky","Configurações e segurança"]
];
const more=[
 ["services","Serviços","scissors","orange","Catálogo e preços"],
 ["suppliers","Fornecedores","truck","green","Compras e reposição"],
 ["retention","Fidelização","gift","pink","Retorno e campanhas"],
 ["agents","IA e Assistentes","sparkles","violet","Agentes de apoio"],
 ["reports","Relatórios e BI","chart","blue","Resultados do salão"],
 ["ownerEye","Olho do Dono","eye","yellow","Decisões e indicadores"],
 ["productsHub","Produtos","package","sky","PDV e organização"],
 ["packages","Pacotes","gift","lilac","Combos de serviços"]
];
const paths={
 message:'<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8.2 8.2 0 0 1-3.2-.7L4 20l1.8-5.3a8 8 0 1 1 14.2-3.2Z"/><circle cx="9" cy="11.5" r=".7"/><circle cx="12.5" cy="11.5" r=".7"/><circle cx="16" cy="11.5" r=".7"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M7.5 3v4M16.5 3v4M3 10h18M8 14h3M8 17h3"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M17 8a3 3 0 0 1 0 6M18 17a5 5 0 0 1 3 3"/>',
 package:'<path d="m3 7 9-4 9 4v10l-9 4-9-4zM3 7l9 5 9-5M12 12v9"/>',
 wallet:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
 team:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 8a3 3 0 0 1 0 6m0 3a5 5 0 0 1 5 4"/>',
 chart:'<rect x="4" y="12" width="3" height="8" rx="1"/><rect x="10.5" y="7" width="3" height="13" rx="1"/><rect x="17" y="3" width="3" height="17" rx="1"/>',
 settings:'<path d="M9.8 3.2h4.4l.7 2.3 1.7.9 2.3-.6 2.2 3.8-1.7 1.7v2l1.7 1.7-2.2 3.8-2.3-.6-1.7.9-.7 2.3H9.8l-.7-2.3-1.7-.9-2.3.6-2.2-3.8 1.7-1.7v-2L2.9 9.6l2.2-3.8 2.3.6 1.7-.9z"/><circle cx="12" cy="12" r="3"/>',
 scissors:'<circle cx="5" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><path d="m7 7.5 13 12M7 16.5l13-12"/>',
 truck:'<path d="M3 6h11v11H3zM14 9h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
 gift:'<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M3 13h18M12 9C2 9 5 2 9 4c2 1 3 5 3 5Zm0 0c10 0 7-7 3-5-2 1-3 5-3 5Z"/>',
 sparkles:'<path d="m12 2 2.2 6.3L21 11l-6.8 2.7L12 20l-2.2-6.3L3 11l6.8-2.7z"/>',
 eye:'<path d="M2 12s4.2-7 10-7 10 7 10 7-4.2 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
 chevron:'<path d="m9 5 7 7-7 7"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',
 alert:'<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 17h.01"/>'
};
const svg=name=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||paths.sparkles)+'</svg>';
const make=(tag,cls,content)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=content;return el;};
const currency=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"});
const dateWeekday=new Intl.DateTimeFormat("pt-BR",{weekday:"long",timeZone:"America/Porto_Velho"});
const dateShort=new Intl.DateTimeFormat("pt-BR",{day:"numeric",month:"long",timeZone:"America/Porto_Velho"});
const timeFmt=new Intl.DateTimeFormat("pt-BR",{hour:"2-digit",minute:"2-digit",timeZone:"America/Porto_Velho"});
const statusNames={scheduled:"Agendado",confirmed:"Confirmado",arrived:"Chegou",in_service:"Em atendimento",completed:"Concluído",cancelled:"Cancelado",no_show:"Faltou"};
const successStatuses=new Set(["confirmed","completed","arrived","in_service"]);
let updateTimer=0,requestInFlight=false;
function navigate(view){
 const target=[...document.querySelectorAll(".sidebar nav [data-view]")].find(e=>e.dataset.view===view);
 if(target){target.click();window.scrollTo({top:0,behavior:"smooth"});return true}
 return false;
}
function tile([view,label,ico,tone,subtitle]){
 const btn=make("button","ne-v3-tile ne-v3-"+tone);
 btn.type="button";btn.dataset.target=view;btn.setAttribute("aria-label","Abrir "+label);
 const bubble=make("span","ne-v3-tile-icon");bubble.innerHTML=svg(ico);
 const heading=make("span","ne-v3-tile-copy");
 heading.append(make("strong","",label),make("small","",subtitle));
 const chev=make("span","ne-v3-tile-chevron");chev.innerHTML=svg("chevron");
 btn.append(bubble,heading,chev);
 btn.addEventListener("click",()=>navigate(view));
 return btn;
}
function lineTitle(name,linkText,view){
 const h=make("div","ne-v3-section-head");
 const title=make("h3","",name);
 h.append(title);
 if(linkText){const button=make("button","ne-v3-text-link",linkText);button.type="button";button.addEventListener("click",()=>navigate(view));h.append(button)}
 return h;
}
function build(){
 const dash=document.getElementById("dashboard");
 if(!dash||dash.querySelector(".ne-v3"))return;
 const root=make("div","ne-v3");
 root.append(make("div","ne-v3-hero"));
 const hero=root.lastChild;
 const message=make("div","ne-v3-hero-copy");
 message.append(make("h2","","Seu salão, em um só lugar."),make("p","","Clientes, agenda, financeiro, estoque e crescimento."));
 const cal=make("button","ne-v3-date-card");cal.type="button";cal.title="Abrir agenda";cal.setAttribute("aria-label","Abrir agenda");
 const ico=make("span","ne-v3-date-icon");ico.innerHTML=svg("calendar");
 const txt=make("span","ne-v3-date-copy");
 txt.append(make("small","",dateWeekday.format(new Date())),make("strong","ne-v3-date-text",dateShort.format(new Date())),make("small","","Ver agenda"));
 cal.append(ico,txt);const go=make("span","ne-v3-date-chevron");go.innerHTML=svg("chevron");cal.append(go);cal.addEventListener("click",()=>navigate("agenda"));
 hero.append(message,cal);
 const access=make("section","ne-v3-quick");
 const title=lineTitle("Acesso rápido","Ver todos","dashboard");
 const viewAll=title.querySelector("button");const extra=make("div","ne-v3-extra");extra.id="neV3Extra";extra.hidden=true;
 if(viewAll){viewAll.setAttribute("aria-expanded","false");viewAll.setAttribute("aria-controls","neV3Extra");viewAll.onclick=()=>{extra.hidden=!extra.hidden;viewAll.textContent=extra.hidden?"Ver todos":"Mostrar menos";viewAll.setAttribute("aria-expanded",String(!extra.hidden));}}
 const tiles=make("div","ne-v3-grid");primary.forEach(def=>tiles.append(tile(def)));
 const extras=make("div","ne-v3-grid");more.forEach(def=>extras.append(tile(def)));extra.append(extras);
 access.append(title,tiles,extra);root.append(access);
 const summary=make("section","ne-v3-overview");
 summary.append(lineTitle("Resumo de hoje",null));
 const metrics=make("div","ne-v3-metrics");
 for(const [id,label,symbol,tone,foot] of [
  ["bookings","Agendamentos","calendar","violet","Agenda do dia"],
  ["forecast","Faturamento previsto","wallet","green","Serviços do dia"],
  ["noShows","Faltas","users","orange","Atendimentos de hoje"],
  ["lowStock","Produtos baixos","package","pink","Precisam de reposição"]
 ]){
  const card=make("button","ne-v3-metric ne-v3-"+tone);card.type="button";card.dataset.metric=id;
  const icon=make("span","ne-v3-metric-icon");icon.innerHTML=svg(symbol);
  const copy=make("span","ne-v3-metric-body");
  const value=make("strong","ne-v3-metric-value","—");value.id="neV3Metric_"+id;
  copy.append(value,make("span","ne-v3-metric-label",label),make("small","ne-v3-metric-foot",foot));
  card.append(icon,copy);card.addEventListener("click",()=>navigate(id==="forecast"?"finance":id==="lowStock"?"inventory":"agenda"));
  metrics.append(card);
 }
 summary.append(metrics);root.append(summary);
 const bottom=make("div","ne-v3-bottom");
 const a=make("section","ne-v3-listbox"),b=make("section","ne-v3-listbox");
 a.append(lineTitle("Próximos agendamentos","Ver agenda","agenda"));
 const appointments=make("div","ne-v3-list");appointments.id="neV3Appointments";appointments.append(make("p","ne-v3-empty","Carregando agenda…"));a.append(appointments);
 b.append(lineTitle("Últimas conversas","Ver todas","inbox"));
 const conversations=make("div","ne-v3-list");conversations.id="neV3Conversations";conversations.append(make("p","ne-v3-empty","Carregando conversas…"));b.append(conversations);
 bottom.append(a,b);root.append(bottom);
 const details=make("details","ne-operational-details ne-v3-legacy");
 const summaryToggle=make("summary","","Ferramentas operacionais e indicadores detalhados");
 details.append(summaryToggle);
 for(const element of [...dash.children])details.append(element);
 dash.append(root,details);
 const nav=document.querySelector(".sidebar nav");if(nav)nav.classList.add("ne-compact-nav");
 const oldTop=document.querySelector(".topbar");
 if(oldTop&&!document.getElementById("neV3Search")){
  const bar=make("label","ne-v3-searchbar");
  const s=make("span","ne-v3-search-icon");s.innerHTML=svg("search");bar.append(s);
  const inp=make("input");inp.type="search";inp.id="neV3Search";inp.placeholder="Buscar clientes, agendamentos, serviços...";inp.autocomplete="off";inp.setAttribute("aria-label","Buscar no sistema");bar.append(inp);
  const results=make("div","ne-v3-results");results.id="neV3Results";results.hidden=true;
  oldTop.insertBefore(bar,oldTop.querySelector("#neThemeSwitcher")||oldTop.querySelector("#quickAppointment"));
  oldTop.append(results);
  let timer;inp.addEventListener("input",()=>{clearTimeout(timer);timer=setTimeout(()=>search(inp.value,results),250)});
  inp.addEventListener("keydown",e=>{
   if(e.key==="Escape"){results.hidden=true;inp.blur()}
   if(e.key==="Enter"){e.preventDefault();const first=results.querySelector("button");if(first)first.click();else if(inp.value.trim()){navigate("clients");const clientSearch=document.getElementById("clientSearch");if(clientSearch){clientSearch.value=inp.value.trim();clientSearch.dispatchEvent(new Event("input",{bubbles:true}))}}}
  });
  document.addEventListener("click",e=>{if(!bar.contains(e.target)&&!results.contains(e.target))results.hidden=true});
 }
 const oldMetric=document.getElementById("mAppointments");
 if(oldMetric)new MutationObserver(()=>{clearTimeout(updateTimer);updateTimer=setTimeout(refresh,350)}).observe(oldMetric,{childList:true,characterData:true,subtree:true});
 document.querySelectorAll(".sidebar nav [data-view='dashboard']").forEach(x=>x.addEventListener("click",()=>setTimeout(refresh,200)));
 refresh();
}
async function search(query,results){
 const q=query.trim().toLocaleLowerCase("pt-BR");results.replaceChildren();
 if(q.length<2){results.hidden=true;return}
 const matches=[...primary,...more].filter(v=>(v[1]+" "+v[4]).toLowerCase().includes(q)).slice(0,5);
 function result(label,sub,handler){
  const btn=make("button","ne-v3-result");
  btn.type="button";btn.append(make("strong","",label),make("small","",sub));
  btn.addEventListener("click",()=>{results.hidden=true;handler()});results.append(btn);
 }
 matches.forEach(([view,label])=>result(label,"Módulo",()=>navigate(view)));
 try{
  const response=await fetch("/api/clients?q="+encodeURIComponent(query),{credentials:"same-origin"});
  if(response.ok&&query.trim().toLowerCase()===q){
   const people=await response.json();
   if(Array.isArray(people))people.slice(0,4).forEach(p=>result(p.name,"Cliente",()=>{
    navigate("clients");const inp=document.getElementById("clientSearch");if(inp){inp.value=p.name;inp.dispatchEvent(new Event("input",{bubbles:true}))}
   }));
  }
 }catch{}
 if(!results.childElementCount)results.append(make("p","ne-v3-empty","Nenhum resultado encontrado."));
 results.hidden=false;
}
const statusText=status=>statusNames[status]||"Agendado";
function showAppointments(data){
 const wrap=document.getElementById("neV3Appointments");if(!wrap)return;wrap.replaceChildren();
 const entries=[...(Array.isArray(data?.appointments)?data.appointments:[])].sort((a,b)=>String(a.start_at).localeCompare(String(b.start_at))).filter(a=>!["cancelled","no_show"].includes(a.status)).slice(0,4);
 if(!entries.length){wrap.append(make("p","ne-v3-empty","Nenhum atendimento registrado para hoje."));return}
 for(const a of entries){
  const row=make("button","ne-v3-entry");row.type="button";row.addEventListener("click",()=>navigate("agenda"));
  const dt=make("span","ne-v3-time",a.start_at?timeFmt.format(new Date(a.start_at)):"—");
  const avatar=make("span","ne-v3-avatar",String(a.client_name||"Cliente").split(/\s+/).slice(0,2).map(n=>n[0]||"").join("").toUpperCase());
  const info=make("span","ne-v3-entry-copy");
  info.append(make("strong","",a.client_name||"Cliente"),make("small","",a.service_summary||a.service_name||"Atendimento"));
  const status=make("span","ne-v3-status"+(successStatuses.has(a.status)?" is-good":""),statusText(a.status));
  row.append(dt,avatar,info,status);wrap.append(row);
 }
}
function showConversations(data){
 const wrap=document.getElementById("neV3Conversations");if(!wrap)return;wrap.replaceChildren();
 const rows=Array.isArray(data)?data.slice(0,4):[];
 if(!rows.length){wrap.append(make("p","ne-v3-empty","Nenhuma conversa conectada no momento."));return}
 rows.forEach(x=>{
  const row=make("button","ne-v3-entry ne-v3-chat-row");row.type="button";row.onclick=()=>navigate("inbox");
  const initials=String(x.client_name||"Contato").split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase();
  const avatar=make("span","ne-v3-avatar ne-v3-avatar-chat",initials);
  const data=make("span","ne-v3-entry-copy");
  data.append(make("strong","",x.client_name||x.client_phone||"Contato"),make("small","",x.last_message||"Conversa sem mensagens"));
  const side=make("span","ne-v3-chat-side");
  if(x.last_message_created_at){const d=new Date(x.last_message_created_at);if(!isNaN(d))side.append(make("small","",timeFmt.format(d)))}
  if(Number(x.unread_count)>0)side.append(make("span","ne-v3-unread",String(Math.min(99,Number(x.unread_count)))));
  row.append(avatar,data,side);wrap.append(row);
 });
}
async function refresh(){
 if(requestInFlight||!document.getElementById("dashboard"))return;
 requestInFlight=true;
 try{
  const d=await fetch("/api/dashboard",{credentials:"same-origin"});
  if(d.ok){
   const data=await d.json();
   const num=(id,value)=>{const el=document.getElementById("neV3Metric_"+id);if(el)el.textContent=value};
   num("bookings",String(data.todayAppointments??0));
   num("forecast",currency.format(Number(data.forecast||0)));
   num("noShows",String((data.appointments||[]).filter(a=>a.status==="no_show").length));
   showAppointments(data);
  }
  const [product,conversation]=await Promise.allSettled([
   fetch("/api/products",{credentials:"same-origin"}),
   fetch("/api/conversations",{credentials:"same-origin"})
  ]);
  if(product.status==="fulfilled"&&product.value.ok){
   const products=await product.value.json();
   if(Array.isArray(products)){
    const el=document.getElementById("neV3Metric_lowStock");if(el)el.textContent=String(products.filter(p=>p.low_stock).length);
   }
  }
  if(conversation.status==="fulfilled"&&conversation.value.ok)showConversations(await conversation.value.json());
  else showConversations([]);
 }catch{}finally{requestInFlight=false}
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",build,{once:true});else build();
})();