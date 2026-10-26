import { setupAppointmentUi } from "./appointment-ui.js";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const fmt=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}),dayFmt=new Intl.DateTimeFormat("pt-BR",{weekday:"long",day:"2-digit",month:"2-digit"});
const state={clients:[],professionals:[],services:[],resources:[],products:[],suppliers:[],phase2:null,dashboard:null,health:null,user:null,whatsapp:null,conversations:[],selectedConversation:null};
async function api(path,options={}){const r=await fetch(path,{headers:{"content-type":"application/json",...(options.headers||{})},...options});const j=await r.json().catch(()=>({}));if(!r.ok){if(r.status===401&&!path.startsWith("/api/auth/")&&typeof showAuth==="function")showAuth("login");throw Object.assign(new Error(j.error||"request_failed"),{data:j,status:r.status})}return j}
function toast(text){const t=$("#toast");t.textContent=text;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2200)}
function esc(v=""){return String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}
function initials(n=""){return n.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function statusLabel(s){return ({scheduled:"Agendado",confirmed:"Confirmado",arrived:"Chegou",in_service:"Em atendimento",completed:"Finalizado",cancelled:"Cancelado",no_show:"Não compareceu"})[s]||s}
function activate(view,{skipTechnicalLoad=false}={}){
  $$(".view").forEach(v=>v.classList.toggle("active",v.id===view));$$("[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  const cfg={dashboard:["Visão geral","O que precisa da sua atenção hoje."],inbox:["Atendimento","WhatsApp, cliente e próxima ação no mesmo lugar."],agenda:["Agenda","O fluxo de atendimento sem conflito de pessoa ou recurso."],clients:["Clientes","Relacionamento e histórico em um só lugar."],people:["Gente","Clientes, equipe, relacionamento e agentes em um só lugar."],productsHub:["Produtos","Venda, estoque, serviços, pacotes e compras conectados."],marketing:["Marketing & Relacionamento","Captação, canais, campanhas e oportunidades de retorno."],technical:["Ficha Técnica","Fórmulas, procedimento e memória clínica da cliente."],team:["Equipe","Quem atende, quando e em quê."],services:["Serviços","Preço, tempo e comissão organizados."],packages:["Pacotes","Venda antecipada com créditos e validade."],retail:["PDV · Produtos","Venda de produtos integrada ao estoque e financeiro."],resources:["Recursos","Cadeiras, salas e equipamentos disponíveis."],finance:["Financeiro & Caixa","Dinheiro entrando e saindo, sem depender de planilha."],inventory:["Estoque & Consumo","Produto real, custo real e alerta antes de faltar."],suppliers:["Fornecedores","Quem vende, quanto demora e como comprar melhor."],retention:["Fidelização & Relacionamento","Pontos, indicações, aniversários e pós-atendimento."],ownerEye:["Olho do Dono","Inteligência prática para decidir antes do problema aparecer."],agents:["Funcionários Artificiais","Recepção, vendas, gestão, financeiro, compras e análise."],admin:["Administração","Backup, segurança, usuários e auditoria."],reports:["Relatórios & Exportação","Período, resultado e arquivos prontos para análise."],intelligence:["JEV · Inteligência","Decisões rápidas com custo controlado."]}[view]||["Salon OS",""];
  $("#pageTitle").textContent=cfg[0];$("#pageSub").textContent=cfg[1];if(view==="agenda"){loadAgendaPhase2();loadWaitlist()}if(view==="team")loadStaff();if(view==="clients")loadClients();if(view==="technical"&&!skipTechnicalLoad)loadTechnical();if(view==="intelligence")loadReceipts();if(view==="inbox")loadInbox();if(view==="finance")loadFinance();if(view==="inventory")loadInventory();if(view==="suppliers")loadSuppliers();if(view==="packages")loadPackages();if(view==="retail")loadRetail();if(view==="retention")loadRetention();if(view==="ownerEye")loadOwnerEye();if(view==="agents")loadAgents();if(view==="admin")loadAdmin();if(view==="reports")loadReports();
}
$$("[data-view]").forEach(b=>b.onclick=()=>activate(b.dataset.view));$$("[data-jump]").forEach(b=>b.onclick=()=>activate(b.dataset.jump));$$("[data-open]").forEach(b=>b.onclick=()=>$("#"+b.dataset.open).showModal());$$("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());$("#quickAppointment").onclick=()=>$("#appointmentModal").showModal();
async function bootstrap(){const [boot,health]=await Promise.all([api("/api/bootstrap"),api("/api/health")]);state.health=health;state.user=boot.user;state.professionals=boot.professionals;state.services=boot.services;state.resources=boot.resources||[];state.dashboard=boot.dashboard;state.whatsapp=boot.whatsapp;$("#health").textContent=health.jev?"Sistema + JEV online":"Sistema online · JEV fallback";$("#jevState").textContent=health.jev?"JEV online":"fallback ativo";renderDashboard();renderTeam();renderServices();renderResources();await loadClients();fillSelects();updateWahaUi()}
function renderDashboard(){const d=state.dashboard;$("#mAppointments").textContent=d.todayAppointments;$("#mForecast").textContent=fmt.format(d.forecast);$("#mClients").textContent=d.clientCount;$("#mPros").textContent=d.profCount;$("#todayList").innerHTML=d.appointments.length?d.appointments.map(a=>`<div class="row"><div class="who"><span class="avatar">${initials(a.client_name)}</span><div><strong>${a.client_name}</strong><small>${a.service_summary||a.service_name} · ${a.professional_summary||a.professional_name}</small></div></div><div><div class="time">${new Date(a.start_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</div><span class="status ${a.status}">${statusLabel(a.status)}</span></div></div>`).join(""):`<div class="muted">Nenhum atendimento hoje.</div>`}
async function loadClients(q=""){state.clients=await api("/api/clients"+(q?`?q=${encodeURIComponent(q)}`:""));$("#clientCount").textContent=`${state.clients.length} encontrados`;$("#clientList").innerHTML=state.clients.map(c=>{const socials=[c.instagram?`Instagram: ${esc(c.instagram)}`:"",c.facebook?`Facebook: ${esc(c.facebook)}`:""].filter(Boolean).join(" · ");const ref=c.referral_reference?`Referência: ${esc(c.referral_reference)}`:"";const birthday=c.birthday?`Aniversário: ${esc(c.birthday.split("-").reverse().join("/"))}`:"";return `<article><div class="who"><span class="avatar">${initials(c.name)}</span><div><h3>${esc(c.name)}</h3><p>${esc(c.phone||"Sem WhatsApp")}</p></div></div><div class="clientMeta">${birthday?`<small>${birthday}</small>`:""}${socials?`<small>${socials}</small>`:""}${ref?`<small>${ref}</small>`:""}</div>${c.notes?`<p>${esc(c.notes)}</p>`:""}<div class="tags">${(c.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join("")}</div></article>`}).join("")||`<p class="muted">Nenhum cliente encontrado.</p>`;fillSelects();fillWaitlistSelects()}
let searchTimer;$("#clientSearch").oninput=e=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadClients(e.target.value),220)};
function downloadClientBase(){const a=document.createElement("a");a.href="/api/clients/export";a.download="";document.body.appendChild(a);a.click();a.remove()}$("#exportClients").onclick=downloadClientBase;$("#marketingExportClients").onclick=downloadClientBase;
function renderTeam(){$("#teamList").innerHTML=state.professionals.map(p=>`<article><span class="avatar">${initials(p.name)}</span><h3>${p.name}</h3><p>${p.role}</p><p>${p.work_start}–${p.work_end}</p><div class="tags">${(p.specialties||[]).map(x=>`<span class="tag">${x}</span>`).join("")}</div></article>`).join("")}
function renderServices(){
  const list=$("#serviceList"),filters=$("#neServiceFilters"),counter=$("#neServiceCount");
  if(!list)return;
  const categories=[...new Set(state.services.map(s=>s.category||"Geral"))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
  if(!["Todos",...categories].includes(state.serviceCategory))state.serviceCategory="Todos";
  const current=state.serviceCategory||"Todos";
  if(filters){
    filters.innerHTML=["Todos",...categories].map(cat=>'<button type="button" data-ne-category="'+encodeURIComponent(cat)+'" aria-pressed="'+String(cat===current)+'" class="'+(cat===current?"active":"")+'">'+esc(cat)+'</button>').join("");
    $("[data-ne-category]",filters).forEach(btn=>btn.onclick=()=>{state.serviceCategory=decodeURIComponent(btn.dataset.neCategory);renderServices()});
  }
  const visible=state.services.filter(s=>current==="Todos"||(s.category||"Geral")===current);
  if(counter)counter.textContent=visible.length+" "+(visible.length===1?"serviço":"serviços");
  const showCommission=["owner","manager"].includes(state.user?.role);
  list.innerHTML=visible.map(s=>{
    const name=esc(s.name),id=esc(s.id),category=esc(s.category||"Geral");
    return '<details class="ne-service-card"><summary><span class="ne-service-symbol" aria-hidden="true">✦</span><span class="ne-service-title"><small>'+category+'</small><strong>'+name+'</strong><span>'+Number(s.duration_min||0)+' min · '+fmt.format(s.price)+'</span></span><span class="ne-service-arrow" aria-hidden="true">⌄</span></summary>'+
      '<div class="ne-service-details"><div class="ne-service-facts"><span>Duração <strong>'+Number(s.duration_min||0)+' min</strong></span><span>Valor <strong>'+fmt.format(s.price)+'</strong></span>'+
      (showCommission?'<span>Comissão <strong>'+Number(s.commission_pct||0).toLocaleString("pt-BR")+'%</strong></span>':"")+'</div>'+
      '<div class="ne-service-actions"><button type="button" class="primary" data-ne-book-service="'+id+'">Agendar serviço</button><button type="button" class="secondary" data-ne-service-tech="'+id+'">Fichas técnicas</button></div></div></details>';
  }).join("")||'<p class="muted">Nenhum serviço nesta categoria.</p>';
  $("[data-ne-book-service]",list).forEach(btn=>btn.onclick=()=>{
    $("#apService").value=btn.dataset.neBookService;
    appointmentUi.refreshSuggestions();
    appointmentUi.refreshSummary();
    $("#appointmentModal").showModal();
  });
  $("[data-ne-service-tech]",list).forEach(btn=>btn.onclick=()=>{
    activate("technical");
  });
}
function renderResources(){$("#resourceList").innerHTML=state.resources.map(r=>`<article><span class="chip">${({chair:"Cadeira",washbasin:"Lavatório",room:"Sala",equipment:"Equipamento",other:"Outro"})[r.type]||r.type}</span><h3>${r.name}</h3><p>Entra no cálculo de disponibilidade da agenda.</p></article>`).join("")||`<p class="muted">Nenhum recurso cadastrado.</p>`}
function fillSelects(){const c=$("#apClient"),p=$("#apProfessional"),s=$("#apService"),r=$("#apResource");if(!c||!p||!s||!r)return;c.innerHTML='<option value="">Selecione…</option>'+state.clients.map(x=>`<option value="${x.id}">${x.name}</option>`).join("");p.innerHTML='<option value="">Selecione…</option>'+state.professionals.map(x=>`<option value="${x.id}">${x.name}</option>`).join("");s.innerHTML='<option value="">Selecione…</option>'+state.services.map(x=>`<option value="${x.id}">${x.name} · ${fmt.format(x.price)}</option>`).join("");r.innerHTML='<option value="">Sem recurso específico</option>'+state.resources.map(x=>`<option value="${x.id}">${x.name}</option>`).join("")}
const appointmentUi=setupAppointmentUi({getState:()=>state,api,esc,fmt,$,$$});

function fillWaitlistSelects(){
  const c=$("#wlClient"),s=$("#wlService"),p=$("#wlProfessional");if(!c||!s||!p)return;
  c.innerHTML='<option value="">Selecione…</option>'+state.clients.map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join("");
  s.innerHTML='<option value="">Selecione…</option>'+state.services.map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join("");
  p.innerHTML='<option value="">Qualquer profissional</option>'+state.professionals.map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join("");
}
async function loadWaitlist(){
  const rows=await api("/api/waitlist");
  const period={any:"Qualquer horário",morning:"Manhã",afternoon:"Tarde",evening:"Noite"};
  $("#waitlistList").innerHTML=rows.map(w=>'<div class="row"><div class="who"><span class="avatar">'+initials(w.client_name)+'</span><div><strong>'+w.client_name+'</strong><small>'+w.service_name+(w.professional_name?' · '+w.professional_name:'')+'</small></div></div><div style="text-align:right"><div class="time">'+(w.preferred_date||"Sem data")+'</div><small>'+(period[w.period]||w.period)+'</small></div></div>').join("")||'<div class="muted">Ninguém aguardando encaixe.</div>';
}
$("#waitlistForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await api("/api/waitlist",{method:"POST",body:JSON.stringify(b)});$("#waitlistModal").close();e.target.reset();await loadWaitlist();toast("Cliente adicionado à lista de espera")}catch{toast("Não foi possível adicionar à lista de espera")}};

const neAgendaStatusOptions={
  scheduled:["confirmed","arrived","in_service","cancelled","no_show"],
  confirmed:["arrived","in_service","cancelled","no_show"],
  arrived:["in_service","cancelled"],
  in_service:[],completed:[],cancelled:[],no_show:[]
};
const neAgendaQuickActions={
  scheduled:{status:"confirmed",label:"Confirmar horário"},
  confirmed:{status:"arrived",label:"Cliente chegou"},
  arrived:{status:"in_service",label:"Iniciar atendimento"}
};
function renderAgendaCards(){
  const all=Array.isArray(state.agendaAppointments)?state.agendaAppointments:[];
  const select=$("#neAgendaProfessional"),profId=state.neAgendaProfessional||"";
  if(select){
    const selected=profId;
    select.innerHTML='<option value="">Todos os profissionais</option>'+state.professionals.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.name)+'</option>').join("");
    select.value=selected;
  }
  const filter=state.neAgendaFilter||"today";
  const day=new Date(),dayStart=new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime();
  const tomorrow=dayStart+24*60*60*1000;
  const closed=new Set(["completed","cancelled","no_show"]);
  const visible=all.filter(a=>{
    const start=new Date(a.start_at).getTime();
    if(!Number.isFinite(start))return false;
    if(profId&&a.professional_id!==profId)return false;
    if(filter==="today")return start>=dayStart&&start<tomorrow;
    if(filter==="upcoming")return start>=tomorrow&&!closed.has(a.status);
    if(filter==="closed")return closed.has(a.status);
    return true;
  });
  $$("[data-ne-agenda-filter]").forEach(b=>{
    const active=b.dataset.neAgendaFilter===filter;
    b.classList.toggle("active",active);
    b.setAttribute("aria-pressed",String(active));
  });
  const count=$("#neAgendaCount");if(count)count.textContent=visible.length+" "+(visible.length===1?"compromisso":"compromissos")+" nesta visão";
  $("#agendaList").innerHTML=visible.map(a=>{
    const d=new Date(a.start_at),time=d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
    const date=d.toLocaleDateString("pt-BR",{weekday:"short",day:"2-digit",month:"2-digit"});
    const opts=[a.status,...(neAgendaStatusOptions[a.status]||[])];
    const controls=opts.map(status=>'<option value="'+esc(status)+'" '+(a.status===status?'selected':'')+'>'+esc(statusLabel(status))+'</option>').join("");
    const action=neAgendaQuickActions[a.status];
    const fast=action?'<button type="button" class="primary" data-ne-agenda-next="'+esc(a.id)+'" data-next-status="'+action.status+'">'+action.label+'</button>':"";
    return '<details class="ne-agenda-card"><summary><span class="ne-agenda-time">'+time+'<small>'+esc(date)+'</small></span><span class="ne-agenda-summary"><strong>'+esc(a.client_name||"Cliente")+'</strong><small>'+esc(a.service_summary||a.service_name||"Serviço")+' · '+esc(a.professional_summary||a.professional_name||"Profissional")+'</small></span><span class="ne-agenda-status">'+esc(statusLabel(a.status))+'</span><span class="ne-agenda-chevron" aria-hidden="true">⌄</span></summary>'+
      '<div class="ne-agenda-details"><div class="ne-agenda-meta"><span>Serviço <strong>'+esc(a.service_summary||a.service_name||"—")+'</strong></span><span>Valor <strong>'+fmt.format(a.price)+'</strong></span>'+(a.resource_name?'<span>Recurso <strong>'+esc(a.resource_name)+'</strong></span>':"")+'</div>'+
      '<div class="ne-agenda-controls"><label for="ne-ag-status-'+esc(a.id)+'">Situação</label><select id="ne-ag-status-'+esc(a.id)+'" data-status="'+esc(a.id)+'" '+(opts.length===1?'disabled':'')+'>'+controls+'</select>'+fast+
      '<button type="button" class="secondary" data-ne-technical="'+esc(a.id)+'">Ficha técnica</button></div></div></details>';
  }).join("")||'<div class="ne-empty-view"><strong>Nenhum atendimento nesta visão.</strong><p>Escolha outro filtro ou abra um novo agendamento.</p></div>';
  $$("[data-status]",$("#agendaList")).forEach(sel=>sel.onchange=()=>changeAgendaStatus(sel.dataset.status,sel.value));
  $$("[data-ne-agenda-next]",$("#agendaList")).forEach(btn=>btn.onclick=()=>changeAgendaStatus(btn.dataset.neAgendaNext,btn.dataset.nextStatus));
  $$("[data-ne-technical]",$("#agendaList")).forEach(btn=>btn.onclick=async()=>{
    const a=state.agendaAppointments?.find(x=>x.id===btn.dataset.neTechnical);
    if(!a)return;
    activate("technical",{skipTechnicalLoad:true});
    await loadTechnical(a.client_id);
    const hidden=$("#neTechnicalAppointmentId");if(hidden)hidden.value=a.id;
    const client=$("#technicalFormClient"),service=$("#technicalService"),pro=$("#technicalProfessional");
    if(client)client.value=a.client_id;
    if(service)service.value=a.service_id;
    if(pro)pro.value=a.professional_id;
  });
}
async function changeAgendaStatus(id,status){
  try{
    await api("/api/appointments/"+encodeURIComponent(id)+"/status",{method:"PATCH",body:JSON.stringify({status})});
    toast("Atendimento atualizado");
    await loadAgendaPhase2();
    state.dashboard=await api("/api/dashboard");renderDashboard();
  }catch(err){
    toast(err.data?.error==="checkout_required"?"Finalize e receba pelo caixa":err.status===409?"A situação mudou. Recarregando agenda.":"Não foi possível atualizar o atendimento");
    await loadAgendaPhase2().catch(()=>{});
  }
}
async function loadAgenda(){
  const from=new Date(Date.now()-30*86400000).toISOString(),to=new Date(Date.now()+30*86400000).toISOString();
  state.agendaAppointments=await api("/api/appointments?from="+encodeURIComponent(from)+"&to="+encodeURIComponent(to));
  renderAgendaCards();
}
$$("[data-ne-agenda-filter]").forEach(btn=>btn.onclick=()=>{state.neAgendaFilter=btn.dataset.neAgendaFilter;renderAgendaCards();decorateAgendaCheckout()});
$("#neAgendaProfessional").onchange=e=>{state.neAgendaProfessional=e.target.value;renderAgendaCards();decorateAgendaCheckout()};
$("[data-ne-show-waitlist]").onclick=()=>$("#agenda .ne-waitlist-panel")?.scrollIntoView({behavior:"smooth",block:"start"});
async function loadReceipts(){const rows=await api("/api/jev/receipts");$("#receiptList").innerHTML=rows.map(r=>`<div class="row"><div><strong>${r.local_route}</strong><small>${r.input_excerpt}</small></div><div style="text-align:right"><span class="status">${r.jev_trace_id?"JEV":"local"}</span><small>${r.latency_ms?`${r.latency_ms} ms`:"sem chamada JEV"}</small></div></div>`).join("")||`<p class="muted">Ainda não há decisões.</p>`}
$("#commandForm").onsubmit=async e=>{e.preventDefault();const text=$("#commandText").value.trim();if(!text)return;$("#commandResult").textContent="Analisando…";try{const r=await api("/api/assistant/interpret",{method:"POST",body:JSON.stringify({text})}),used=r.route==="ambiguous"&&r.jev;let html="<strong>Rota:</strong> "+r.route+"<br><strong>Fonte:</strong> "+(used?"JEV ("+Math.round((r.jev.probability||0)*100)+"%)":"regra local · zero chamada JEV");if(r.booking){if(r.booking.service)html+="<br><strong>Serviço:</strong> "+r.booking.service.name;if(r.booking.professional)html+=" · "+r.booking.professional.name;if(r.booking.date)html+="<br><strong>Data:</strong> "+r.booking.date;if(r.booking.slots?.length)html+="<div class=\"slotList\">"+r.booking.slots.map(s=>"<button type=\"button\" class=\"slotChip\" data-slot=\""+s.start_at+"\" data-prof=\""+s.professional_id+"\" data-service=\""+s.service_id+"\">"+s.local_time+" · "+s.professional_name+"</button>").join("")+"</div>";else if(r.booking.missing?.length)html+="<br><small>Falta informar: "+r.booking.missing.join(", ")+"</small>";else html+="<br><small>Nenhum horário livre encontrado.</small>"}$("#commandResult").innerHTML=html;$$("[data-slot]").forEach(b=>b.onclick=()=>{$("#apProfessional").value=b.dataset.prof;$("#apService").value=b.dataset.service;const d=new Date(b.dataset.slot);const local=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);$("#appointmentForm").elements.start_at.value=local;appointmentUi.refreshSuggestions();appointmentUi.refreshSummary();$("#appointmentModal").showModal()})}catch{$("#commandResult").textContent="Falha ao interpretar."}};
$("#clientForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await api("/api/clients",{method:"POST",body:JSON.stringify(b)});e.target.reset();$("#clientModal").close();await loadClients();state.dashboard=await api("/api/dashboard");renderDashboard();toast("Cliente cadastrado")}catch(err){toast(err.data?.error==="phone_already_exists"?"Esse WhatsApp já está cadastrado":"Erro ao cadastrar")}};
$("#professionalForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const x=await api("/api/professionals",{method:"POST",body:JSON.stringify(b)});state.professionals.push(x);renderTeam();fillSelects();$("#professionalModal").close();e.target.reset();toast("Profissional cadastrado")}catch{toast("Erro ao salvar")}};
$("#serviceForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const x=await api("/api/services",{method:"POST",body:JSON.stringify(b)});state.services.push(x);renderServices();fillSelects();$("#serviceModal").close();e.target.reset();toast("Serviço cadastrado")}catch{toast("Erro ao salvar")}};
$("#appointmentForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.tags=appointmentUi.tags();b.items=appointmentUi.items();try{await api("/api/appointments",{method:"POST",body:JSON.stringify(b)});$("#appointmentModal").close();e.target.reset();appointmentUi.reset();fillSelects();await loadAgendaPhase2();state.dashboard=await api("/api/dashboard");renderDashboard();toast("Agendamento criado")}catch(err){const c=err.data?.error;toast(c==="professional_time_conflict"?(err.data?.professional||"Esse profissional")+" já está ocupado":c==="resource_time_conflict"?(err.data.resource||"Esse recurso")+" já está ocupado":c==="invalid_custom_service"?"Preencha nome, duração e valor do serviço avulso":"Erro ao agendar")}};

function updateWahaUi(){
  const w=state.whatsapp||{},label=w.connected?"WhatsApp conectado":w.status==="UNASSIGNED"?"Vincule o WhatsApp":w.configured?(w.status||"WAHA aguardando QR"):"WAHA sem configuração";
  $("#whatsappBadge").textContent=label;$("#whatsappBadge").classList.toggle("ok",!!w.connected);
  $("#waSetupText").textContent=w.connected?"Sessão "+w.session+" conectada. Atendimento humano disponível.":w.status==="UNASSIGNED"?"É necessário vincular uma sessão exclusiva a este salão.":w.configured?"Sessão "+w.session+" cadastrada. Prepare a conexão e escaneie o QR Code.":"Conectividade WAHA indisponível ou credenciais não configuradas.";
  $("#prepareWaha").disabled=!w.configured||!w.session||!["owner","manager"].includes(state.user?.role);$("#showQr").disabled=!w.configured||!w.session||!["owner","manager"].includes(state.user?.role);
}
const convStatusName={open:"Aberta",pending:"Pendente",resolved:"Resolvida"};
const convPriorityName={normal:"Normal",high:"Alta",urgent:"Urgente"};
const convCategoryName={general:"Geral",lead:"Lead",appointment:"Agendamento",waiting:"Aguardando",finance:"Financeiro",complaint:"Reclamação",post_sale:"Pós-venda",vip:"VIP",other:"Outro"};
function conversationTime(v){
  if(!v)return "";
  const d=new Date(v),today=new Date();
  return d.toDateString()===today.toDateString()?d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}):d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
}
function filteredConversations(){
  const q=($("#conversationSearch")?.value||"").trim().toLowerCase(),status=$("#conversationStatusFilter")?.value||"",priority=$("#conversationPriorityFilter")?.value||"",unread=!!$("#conversationUnreadFilter")?.checked;
  return state.conversations.filter(c=>{
    const hay=[c.client_name,c.client_phone,c.last_message,(c.labels||[]).join(" "),c.category].join(" ").toLowerCase();
    return (!q||hay.includes(q))&&(!status||c.status===status)&&(!priority||c.priority===priority)&&(!unread||Number(c.unread_count)>0);
  });
}
function renderConversationList(){
  const convs=filteredConversations();
  $("#conversationCount").textContent=convs.length+(convs.length!==state.conversations.length?" de "+state.conversations.length:"")+" conversas";
  $("#conversationList").innerHTML=convs.map(c=>{
    const selected=state.selectedConversation?.id===c.id?" selected":"",labels=(c.labels||[]).slice(0,2).map(x=>'<span class="miniLabel">'+esc(x)+'</span>').join("");
    return '<button class="conversation priority-'+esc(c.priority||"normal")+selected+'" data-conversation="'+c.id+'">'+
      '<span class="avatar">'+initials(c.client_name||"W")+'</span>'+
      '<span class="conversationMeta"><span class="conversationTop"><strong>'+esc(c.client_name||"Cliente")+(c.handling_mode==="ai"?' <em class="aiMini">IA</em>':"")+'</strong><time>'+conversationTime(c.last_message_created_at||c.last_message_at)+'</time></span>'+
      '<small>'+esc(c.last_message||c.client_phone||"Sem mensagens")+'</small><span class="conversationLabels">'+labels+(c.category&&c.category!=="general"?'<span class="miniLabel category">'+esc(convCategoryName[c.category]||c.category)+'</span>':"")+'</span></span>'+
      (Number(c.unread_count)>0?'<b class="unreadBadge">'+c.unread_count+'</b>':"")+'</button>';
  }).join("")||'<div class="muted emptyPad">Nenhuma conversa com esses filtros.</div>';
  if(window.organizeBeautyInbox)window.organizeBeautyInbox(convs);
  $("[data-conversation]").forEach(b=>b.onclick=()=>openConversation(b.dataset.conversation));
}
function updateChatModeButton(){
  const b=$("#chatModeButton"),co=state.selectedConversation;if(!b||!co)return;
  const ai=co.handling_mode==="ai";b.textContent=state.whatsapp?.ai_enabled===true?(ai?"Recepcionista IA":"Humano"):"Atendimento humano";b.disabled=state.whatsapp?.ai_enabled!==true;b.title=b.disabled?"Agente de atendimento será habilitado em uma etapa futura.":"";b.classList.toggle("aiOn",ai);
}
function renderConversationDetail(){
  const co=state.selectedConversation;
  $("#conversationDetailEmpty").classList.toggle("hidden",!!co);$("#conversationDetail").classList.toggle("hidden",!co);if(!co)return;
  $("#detailAvatar").textContent=initials(co.client_name||"C");$("#detailClientName").textContent=co.client_name||"Cliente";$("#detailClientPhone").textContent=co.client_phone||"";
  $("#detailClientTags").innerHTML=(co.client_tags||[]).map(x=>'<span class="tag">'+esc(x)+'</span>').join("");
  $("#conversationStatus").value=co.status||"open";$("#conversationPriority").value=co.priority||"normal";$("#conversationCategory").value=co.category||"general";$("#conversationLabels").value=(co.labels||[]).join(", ");
  const ass=$("#conversationAssignee"),users=state.conversationOptions?.users||[];
  ass.innerHTML='<option value="">Sem responsável</option>'+users.map(u=>'<option value="'+u.id+'">'+esc(u.name)+' · '+esc(u.role)+'</option>').join("");ass.value=co.assigned_user_id||"";
  const info=[];if(co.client_email)info.push(co.client_email);if(co.client_source)info.push("Origem: "+co.client_source);if(co.client_birthday)info.push("Nascimento: "+co.client_birthday);if(co.client_notes)info.push(co.client_notes);
  $("#detailClientInfo").textContent=info.join(" · ")||"Sem informações adicionais cadastradas.";
}
async function loadInbox(){
  try{
    const data=await Promise.all([api("/api/whatsapp/status"),api("/api/conversations"),api("/api/conversations/options")]),w=data[0],convs=data[1];
    state.whatsapp=w;state.conversations=convs;state.conversationOptions=data[2];updateWahaUi();renderConversationList();
    if(state.selectedConversation){
      const fresh=convs.find(x=>x.id===state.selectedConversation.id);if(fresh){state.selectedConversation=fresh;renderConversationDetail();updateChatModeButton()}
    }
  }catch(err){if(err.status!==401)toast("Não foi possível carregar o atendimento")}
}
async function openConversation(cid){
  const co=state.conversations.find(x=>x.id===cid);if(!co)return;state.selectedConversation=co;
  $("#chatEmpty").classList.add("hidden");$("#chatActive").classList.remove("hidden");$("#chatClient").textContent=co.client_name||"Cliente";$("#chatPhone").textContent=co.client_phone||"";updateChatModeButton();renderConversationDetail();
  const msgs=await api("/api/conversations/"+cid+"/messages");co.unread_count=0;renderConversationList();
  $("#messageList").innerHTML=msgs.map(m=>'<div class="message '+(m.direction==="out"?"out":"in")+'"><div>'+esc(m.body).replace(/\n/g,"<br>")+'</div><small>'+new Date(m.created_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})+(m.direction==="out"?" · "+esc(m.delivery_status):"")+'</small></div>').join("")||'<div class="muted">Conversa sem mensagens.</div>';
  $("#messageList").scrollTop=$("#messageList").scrollHeight;
  loadConversationClientContext(cid);
}
async function loadConversationClientContext(cid){
  const area=$("#neClientContext");if(!area)return;
  area.replaceChildren();
  try{
    const data=await api("/api/conversations/"+encodeURIComponent(cid)+"/client-context");
    if(state.selectedConversation?.id!==cid)return;
    const heading=document.createElement("strong");heading.textContent="Atendimentos anteriores";
    area.append(heading);
    const appts=Array.isArray(data.appointments)?data.appointments:[];
    if(!appts.length){const p=document.createElement("p");p.textContent="Esta cliente ainda não possui atendimentos registrados.";area.append(p);return}
    for(const ap of appts){
      const item=document.createElement("div");item.className="ne-client-appointment";
      const title=document.createElement("strong");title.textContent=ap.service_name||"Serviço";
      const detail=document.createElement("small");const dt=new Date(ap.start_at);
      detail.textContent=(Number.isNaN(dt.valueOf())?"Data não disponível":dt.toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}))+" · "+(ap.professional_name||"Sem profissional")+" · "+(ap.status||"");
      item.append(title,detail);area.append(item);
    }
  }catch{if(state.selectedConversation?.id===cid)area.textContent="Não foi possível consultar o histórico desta cliente."}
}
$("#scheduleFromChat").onclick=async()=>{
  const co=state.selectedConversation;if(!co?.client_id){toast("Associe esta conversa a uma cliente para agendar");return}
  const sel=$("#apClient");if(!sel)return;
  const clientLabel=co.client_name||"Cliente";
  if(![...sel.options].some(o=>o.value===co.client_id))sel.add(new Option(clientLabel,co.client_id));
  sel.value=co.client_id;
  sel.dispatchEvent(new Event("change",{bubbles:true}));
  $("#appointmentModal").showModal();
};
$("#refreshInbox").onclick=loadInbox;
$("#syncWhatsappHistory").onclick=async()=>{const b=$("#syncWhatsappHistory");b.disabled=true;b.textContent="Sincronizando…";try{const out=await api("/api/whatsapp/sync",{method:"POST",body:JSON.stringify({chat_limit:40,message_limit:80})});await loadInbox();toast("Sincronizado · "+out.chats_imported+" conversas · "+out.messages_imported+" mensagens")}catch{toast("Não foi possível sincronizar o histórico")}finally{b.disabled=false;b.textContent="Sincronizar histórico"}};
["conversationSearch","conversationStatusFilter","conversationPriorityFilter","conversationUnreadFilter"].forEach(id=>$("#"+id).addEventListener(id==="conversationSearch"?"input":"change",renderConversationList));
$("#saveConversationMeta").onclick=async()=>{
  const co=state.selectedConversation;if(!co)return;
  const body={status:$("#conversationStatus").value,priority:$("#conversationPriority").value,category:$("#conversationCategory").value,assigned_user_id:$("#conversationAssignee").value||null,labels:$("#conversationLabels").value.split(",").map(x=>x.trim()).filter(Boolean)};
  try{const out=await api("/api/conversations/"+co.id+"/meta",{method:"PATCH",body:JSON.stringify(body)});Object.assign(co,out,{assigned_user_id:body.assigned_user_id});await loadInbox();state.selectedConversation=state.conversations.find(x=>x.id===co.id)||co;renderConversationDetail();renderConversationList();toast("Conversa classificada")}catch{toast("Não foi possível salvar a classificação")}
};
$("#chatModeButton").onclick=async()=>{
  const co=state.selectedConversation;if(!co)return;const mode=co.handling_mode==="ai"?"human":"ai";
  try{await api("/api/conversations/"+co.id+"/mode",{method:"PATCH",body:JSON.stringify({mode})});co.handling_mode=mode;updateChatModeButton();renderConversationList();toast(mode==="ai"?"Recepcionista IA ativada":"Atendimento humano ativado")}catch{toast("Não foi possível alterar o modo")}
};
$("#messageForm").onsubmit=async e=>{e.preventDefault();if(!state.selectedConversation)return;const text=$("#messageText").value.trim();if(!text)return;try{await api("/api/conversations/"+state.selectedConversation.id+"/messages",{method:"POST",body:JSON.stringify({text})});$("#messageText").value="";await openConversation(state.selectedConversation.id)}catch{toast("Não foi possível enviar. Verifique o WhatsApp.")}};
$("#prepareWaha").onclick=async()=>{try{state.whatsapp=await api("/api/whatsapp/session/prepare",{method:"POST",body:"{}"});updateWahaUi();toast("Sessão preparada")}catch{toast("WAHA ainda não configurado para este sistema")}};
$("#showQr").onclick=()=>{$("#waQrImage").src="/api/whatsapp/session/qr?t="+Date.now();$("#waQrImage").classList.remove("hidden")};
$("#openClientFromChat").onclick=async()=>{const p=state.selectedConversation?.client_phone||"";activate("clients");$("#clientSearch").value=p;await loadClients(p)};
$("#resourceForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const x=await api("/api/resources",{method:"POST",body:JSON.stringify(b)});state.resources.push(x);renderResources();fillSelects();$("#resourceModal").close();e.target.reset();toast("Recurso cadastrado")}catch{toast("Erro ao salvar recurso")}};

function showAuth(mode,name=""){const gate=$("#authGate");gate.classList.remove("hidden");$("#setupPanel").classList.toggle("hidden",mode!=="setup");$("#loginPanel").classList.toggle("hidden",mode!=="login");$("#resetPanel").classList.toggle("hidden",mode!=="reset");$("#authError").textContent="";if(name)$("#loginTenant").textContent="Acesso a "+name+"."}
function hideAuth(){$("#authGate").classList.add("hidden")}
async function initAuth(){const resetToken=new URLSearchParams(location.search).get("reset");if(resetToken){try{const info=await api("/api/auth/reset?token="+encodeURIComponent(resetToken));showAuth("reset");$("#resetIdentity").textContent="Redefinindo o acesso de "+info.email+".";return}catch{showAuth("login");$("#authError").textContent="Este link de redefinição expirou ou já foi usado.";return}}try{const s=await api("/api/auth/state");if(!s.claimed){showAuth("setup",s.tenant?.name);return}try{const me=await api("/api/auth/me");state.user=me.user;hideAuth();await bootstrap()}catch{showAuth("login",s.tenant?.name)}}catch{showAuth("login");$("#authError").textContent="Não foi possível verificar o acesso."}}
$("#setupForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await api("/api/auth/setup",{method:"POST",body:JSON.stringify(b)});showAuth("login");$("#loginForm").elements.email.value=b.email;toast("Acesso criado. Agora entre com sua senha.")}catch(err){$("#authError").textContent=err.data?.error==="password_too_short"?"Use uma senha com pelo menos 10 caracteres.":"Não foi possível criar o acesso."}};
$("#resetForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),token=new URLSearchParams(location.search).get("reset");if(b.password!==b.confirm_password){$("#authError").textContent="As duas senhas precisam ser iguais.";return}try{await api("/api/auth/reset",{method:"POST",body:JSON.stringify({token,password:b.password})});history.replaceState({},document.title,location.pathname);showAuth("login");$("#authError").textContent="Senha redefinida. Entre com a nova senha."}catch(err){$("#authError").textContent=err.data?.error==="password_too_short"?"Use uma senha com pelo menos 10 caracteres.":"Não foi possível redefinir. Gere um novo link."}};
$("#loginForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{const out=await api("/api/auth/login",{method:"POST",body:JSON.stringify(b)});state.user=out.user;hideAuth();await bootstrap()}catch(err){if(err.data?.error==="workspace_required"){$("#workspaceLoginField").classList.remove("hidden");$("#authError").textContent="Este e-mail existe em mais de um salão. Informe o identificador da empresa."}else $("#authError").textContent="E-mail ou senha incorretos."}};
$("#logoutBtn").onclick=async()=>{try{await api("/api/auth/logout",{method:"POST",body:"{}"})}catch{}showAuth("login")};

initAuth().catch(e=>{console.error(e);$("#health").textContent="Falha ao carregar";toast("Não foi possível carregar o sistema")});

function moneyBR(v){return fmt.format(Number(v||0))}
function dateTimeBR(v){if(!v)return "—";return new Date(v).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
const neFinanceIcons={pix:"Pix",cash:"Dinheiro",credit_card:"Crédito",debit_card:"Débito",voucher:"Voucher",other:"Outro"};
function setFinanceTab(tab){
  const allowed=["cash","entries","commissions","results"],active=allowed.includes(tab)?tab:"cash";
  $$("[data-ne-finance-tab]").forEach(b=>{const yes=b.dataset.neFinanceTab===active;b.classList.toggle("is-active",yes);b.setAttribute("aria-pressed",String(yes))});
  $$("[data-ne-finance-panel]").forEach(panel=>panel.classList.toggle("hidden",panel.dataset.neFinancePanel!==active));
  if(active==="results")loadDre().catch(()=>{});
}
$$("[data-ne-finance-tab]").forEach(b=>b.addEventListener("click",()=>setFinanceTab(b.dataset.neFinanceTab)));
$$("[data-ne-finance-action]").forEach(b=>b.addEventListener("click",()=>{
  const kind=b.dataset.neFinanceAction;
  const form=$("#financeEntryForm");
  form.reset();form.elements.kind.value=kind;
  form.elements.status.value="paid";
  $("#financeEntryModal").showModal();
}));
function cashMethodCards(data){
  const grouped=new Map();
  for(const row of data.by_method||[]){
    const key=row.payment_method||"other",record=grouped.get(key)||{in:0,out:0};
    if(row.kind==="income")record.in+=Number(row.total||0);
    else record.out+=Number(row.total||0);
    grouped.set(key,record);
  }
  $("#neCashMethods").innerHTML=grouped.size?
    [...grouped.entries()].map(([method,amount])=>'<div class="ne-cash-method"><small>'+esc(neFinanceIcons[method]||method)+'</small><strong>'+moneyBR(amount.in-amount.out)+'</strong><span>'+moneyBR(amount.in)+' entradas · '+moneyBR(amount.out)+' saídas</span></div>').join(""):
    '<p class="muted">Nenhum recebimento ou pagamento associado a este caixa.</p>';
}
function showCashClose(cash){
  state.neCashExpected=Number(cash?.expected||0);
  $("#neCashCloseExpected").textContent="Saldo esperado em dinheiro: "+moneyBR(state.neCashExpected)+". Conte o dinheiro físico.";
  const form=$("#cashCloseForm");form.reset();form.elements.actual.value="";
  $("#neCashDifferencePreview").textContent="Informe o dinheiro contado para conferir a diferença.";
  $("#cashCloseModal").showModal();
}
$("#cashCloseForm").elements.actual.addEventListener("input",e=>{
  const v=e.target.value;
  $("#neCashDifferencePreview").textContent=v.trim()===""?"Informe o valor realmente contado.":
    "Diferença em relação ao esperado: "+moneyBR(Math.round((Number(v)-Number(state.neCashExpected||0))*100)/100)+
    (Math.round((Number(v)-Number(state.neCashExpected||0))*100)!==0?" · justificativa obrigatória":" · valores conferem");
});
async function showCashHistory(){
  const target=$("#neCashHistory");
  if(!target.classList.contains("hidden")){target.classList.add("hidden");return}
  target.classList.remove("hidden");
  target.textContent="Consultando histórico...";
  try{
    const rows=await api("/api/cash/history");
    target.innerHTML=rows.length?rows.map(x=>'<div class="ne-cash-history-row"><div><strong>'+esc(x.status==="open"?"Caixa aberto":"Fechamento")+'</strong><small>'+esc(dateTimeBR(x.opened_at))+' · '+(x.closed_at?esc(dateTimeBR(x.closed_at)):"em operação")+'</small></div><div><strong>'+(x.actual==null?"—":moneyBR(x.actual))+'</strong><small>'+(x.difference==null?"sem conferência":"diferença "+moneyBR(x.difference))+'</small></div></div>').join(""):'<p>Sem sessões registradas.</p>';
  }catch{target.textContent="Não foi possível consultar o histórico."}
}
$("#neCashHistoryToggle").onclick=showCashHistory;
async function loadFinance(){
  const [dash,entries,comm,costs,cashInfo]=await Promise.all([
    api("/api/phase2/dashboard").catch(()=>null),api("/api/finance/entries").catch(()=>null),
    api("/api/commissions").catch(()=>null),api("/api/services/costs").catch(()=>null),
    api("/api/cash/overview").catch(()=>null)
  ]);
  state.financeEntries=Array.isArray(entries)?entries:[];
  state.phase2=dash;
  if(dash){
    $("#fIncome").textContent=moneyBR(dash.todayIncome);
    $("#fExpense").textContent=moneyBR(dash.todayExpense);
    $("#fNet").textContent=moneyBR(dash.todayNet);
    $("#fCommission").textContent=moneyBR(dash.pendingCommissions);
    $("#fCommissionCount").textContent=dash.pendingCommissionsCount+" lançamentos";
    $("#fPayable").textContent=moneyBR(dash.accountsPayable);
    $("#fPayableCount").textContent=dash.accountsPayableCount+" pendências";
  }
  const cash=cashInfo?.status==="open"?cashInfo:null;
  $("#cashBadge").textContent=cash?"ABERTO":"FECHADO";
  $("#cashBadge").classList.toggle("ok",!!cash);
  $("#cashStatusText").textContent=cash?"Aberto desde "+dateTimeBR(cash.session.opened_at):cashInfo?"Nenhum caixa aberto.":"Acesso ao caixa indisponível.";
  $("#cashBody").innerHTML=cash?'<div class="cashNumber"><span>Esperado em dinheiro</span><strong>'+moneyBR(cash.expected)+'</strong></div><button class="primary" id="closeCashBtn">Fechar caixa</button>':
    '<p class="muted">Abra o caixa para registrar dinheiro físico.</p><button class="primary" id="openCashBtn" '+(cashInfo?"":"disabled")+'>Abrir caixa</button>';
  if($("#openCashBtn"))$("#openCashBtn").onclick=()=>{$("#cashOpenForm").reset();$("#cashOpenModal").showModal()};
  if($("#closeCashBtn"))$("#closeCashBtn").onclick=()=>showCashClose(cash);
  $("#neCashWithdraw").disabled=!cash;
  cashMethodCards(cash||{by_method:[]});
  if(Array.isArray(entries)){
    $("#financeList").innerHTML=entries.slice(0,45).map(x=>'<div class="tableRow"><div><strong>'+esc(x.description)+'</strong><small>'+esc(x.category||"outras")+' · '+esc(neFinanceIcons[x.payment_method]||"sem forma")+' · '+esc(dateTimeBR(x.created_at))+'</small></div><div class="money '+(x.kind==="expense"?"expense":"income")+'">'+(x.kind==="expense"?"− ":"+ ")+moneyBR(x.amount)+'</div>'+(x.status==="paid"?'<span class="status paid">pago</span>':'<button type="button" class="secondary smallBtn" data-pay-entry="'+esc(x.id)+'">Dar baixa</button>')+'</div>').join("")||'<p class="muted">Sem movimentações ainda.</p>';
    $$("[data-pay-entry]",$("#financeList")).forEach(b=>b.onclick=()=>payFinanceEntry(b.dataset.payEntry));
  }else $("#financeList").textContent="Sem permissão para consultar movimentações.";
  if(Array.isArray(comm)){
    $("#commissionList").innerHTML=comm.slice(0,40).map(x=>'<div class="tableRow"><div><strong>'+esc(x.professional_name||"Profissional")+'</strong><small>'+esc(x.client_name||"Cliente")+' · '+esc(x.service_name||"Serviço")+'</small></div><div class="money">'+moneyBR(x.amount)+'</div><span class="status '+(x.status==="pending"?"pending":"paid")+'">'+(x.status==="pending"?"pendente":"paga")+'</span></div>').join("")||'<p class="muted">Nenhuma comissão gerada.</p>';
    const pending=comm.filter(x=>x.status==="pending");
    $("#payPendingCommissions").disabled=!pending.length;
    $("#payPendingCommissions").dataset.ids=pending.map(x=>x.id).join(",");
    $("#payPendingCommissions").dataset.total=pending.reduce((a,x)=>a+Number(x.amount||0),0).toFixed(2);
  }else{
    $("#commissionList").textContent="Sem permissão para consultar comissões.";
    $("#payPendingCommissions").disabled=true;
  }
  if(Array.isArray(costs)){
    $("#serviceCostList").innerHTML=costs.slice(0,15).map(x=>'<div class="row"><div><strong>'+esc(x.service_name)+'</strong><small>Produto '+moneyBR(x.product_cost)+' · comissão '+moneyBR(x.commission)+'</small></div><div style="text-align:right"><strong>'+moneyBR(x.gross_margin)+'</strong><small>'+Number(x.gross_margin_pct||0).toFixed(1)+'% margem direta</small></div></div>').join("")||'<p class="muted">Configure produtos para calcular custo real.</p>';
  }else $("#serviceCostList").textContent="Sem acesso aos custos financeiros.";
}
function showStockTab(type,id){
  const prefix=type==="inventory"?"stock":"purchase",other=prefix==="stock"?"products":"suppliers";
  const active=id||other;
  $("[data-ne-"+prefix+"-tab]").forEach(button=>{
    const yes=button.dataset["ne"+prefix[0].toUpperCase()+prefix.slice(1)+"Tab"]===active;
    button.classList.toggle("is-active",yes);button.setAttribute("aria-pressed",String(yes));
  });
  $("[data-ne-"+prefix+"-panel]").forEach(panel=>panel.classList.toggle("hidden",panel.dataset["ne"+prefix[0].toUpperCase()+prefix.slice(1)+"Panel"]!==active));
}
$("[data-ne-stock-tab]").forEach(button=>button.addEventListener("click",()=>showStockTab("inventory",button.dataset.neStockTab)));
$("[data-ne-purchase-tab]").forEach(button=>button.addEventListener("click",()=>showStockTab("purchase",button.dataset.nePurchaseTab)));
async function loadInventory(){
  try{
    const data=await Promise.all([api("/api/products"),api("/api/stock/recipes-overview"),api("/api/suppliers"),api("/api/stock/movements"),api("/api/stock/lots")]);state.products=data[0];state.suppliers=data[2];const costs=data[1],movements=data[3],lots=data[4];
    $("#iProducts").textContent=state.products.length;$("#iLow").textContent=state.products.filter(x=>x.low_stock).length;$("#iRecipes").textContent=costs.filter(x=>Number(x.product_count)>0).length;
    $("#productList").innerHTML=state.products.map(p=>{
      const low=p.low_stock,unit=esc(p.unit),name=esc(p.name),id=esc(p.id);
      return '<details class="ne-stock-product '+(low?'lowStock':'')+'"><summary><span class="ne-stock-product-symbol" aria-hidden="true">▦</span><span class="ne-stock-title"><strong>'+name+'</strong><small>'+Number(p.stock_qty).toLocaleString("pt-BR")+' '+unit+' disponíveis</small></span>'+(low?'<span class="dangerChip">Repor</span>':'')+'<span class="ne-stock-chevron" aria-hidden="true">⌄</span></summary>'+
      '<div class="ne-stock-details"><div><small>Estoque mínimo</small><strong>'+Number(p.min_qty).toLocaleString("pt-BR")+' '+unit+'</strong></div><div><small>Custo por '+unit+'</small><strong>'+moneyBR(p.avg_cost)+'</strong></div><div><small>Fornecedor</small><strong>'+esc(p.supplier_name||"Não definido")+'</strong></div>'+
      '<button type="button" class="secondary" data-adjust-product="'+id+'">Registrar ajuste</button></div></details>';
    }).join("")||'<p class="muted">Cadastre o primeiro produto.</p>';
    $("#recipeServiceList").innerHTML=costs.map(c=>'<details class="ne-stock-recipe"><summary><span class="ne-stock-product-symbol" aria-hidden="true">◈</span><span class="ne-stock-title"><strong>'+esc(c.service_name)+'</strong><small>'+Number(c.product_count)+' produtos previstos</small></span><span class="ne-stock-chevron" aria-hidden="true">⌄</span></summary><div class="ne-stock-details"><div><small>Custo dos materiais</small><strong>'+moneyBR(c.product_cost)+'</strong></div><button type="button" class="secondary" data-recipe-service="'+esc(c.service_id)+'">Definir consumo padrão</button></div></details>').join("");
    $$("[data-adjust-product]").forEach(b=>b.onclick=()=>openStockAdjust(b.dataset.adjustProduct));
    $$("[data-recipe-service]").forEach(b=>b.onclick=()=>openRecipe(b.dataset.recipeService));
    $("#stockMovementList").innerHTML=movements.slice(0,40).map(m=>'<div class="tableRow"><div><strong>'+m.product_name+'</strong><small>'+m.reason+' · '+dateTimeBR(m.created_at)+'</small></div><div class="money '+(Number(m.qty)>=0?"income":"expense")+'">'+(Number(m.qty)>=0?"+ ":"")+Number(m.qty).toLocaleString("pt-BR")+' '+m.unit+'</div><span class="status">'+(({purchase:"compra",consumption:"consumo",adjust_in:"ajuste",adjust_out:"ajuste"})[m.type]||m.type)+'</span></div>').join("")||'<p class="muted">Nenhuma movimentação ainda.</p>';
    $("#lotList").innerHTML=lots.slice(0,50).map(l=>'<div class="tableRow"><div><strong>'+l.product_name+'</strong><small>Lote '+(l.lot_code||"sem código")+(l.supplier_name?' · '+l.supplier_name:'')+'</small></div><div><strong>'+Number(l.qty_remaining).toLocaleString("pt-BR")+' '+l.unit+'</strong><small>'+(l.expiry_date?'validade '+l.expiry_date:"sem validade")+'</small></div><span class="status '+(l.expiry_status==="expired"?"cancelled":l.expiry_status==="soon"?"pending":"paid")+'">'+(l.expiry_status==="expired"?"vencido":l.expiry_status==="soon"?"vence em "+l.days_to_expiry+"d":l.expiry_status==="ok"?"ok":"sem validade")+'</span></div>').join("")||'<p class="muted">Nenhum lote recebido ainda.</p>';
    fillProductSupplier();
  }catch(err){if(err.status!==403&&err.status!==401)toast("Não foi possível carregar o estoque")}
}
async function loadSuppliers(){
  try{
    state.suppliers=await api("/api/suppliers");fillProductSupplier();
    $("#supplierList").innerHTML=state.suppliers.map(s=>'<article><span class="chip">'+Number(s.lead_days||0)+' dias</span><h3>'+s.name+'</h3><p>'+(s.contact_name||"Sem representante")+'</p><p>'+(s.phone||s.email||"Sem contato")+'</p><p>'+(s.payment_terms||"Condição não informada")+'</p></article>').join("")||'<p class="muted">Nenhum fornecedor cadastrado.</p>';
    await loadPurchaseArea();
  }catch(err){if(err.status!==403&&err.status!==401)toast("Não foi possível carregar fornecedores")}
}
function fillProductSupplier(){const s=$("#productSupplier");if(!s)return;s.innerHTML='<option value="">Sem fornecedor</option>'+state.suppliers.map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join("")}
function openStockAdjust(pid){
  const p=state.products.find(x=>x.id===pid);if(!p)return;
  $("#stockAdjustForm").elements.product_id.value=p.id;$("#stockAdjustProduct").textContent=p.name+" · atual "+Number(p.stock_qty).toLocaleString("pt-BR")+" "+p.unit;
  const inp=$("#stockAdjustForm").elements.qty;inp.step=["un","unidade","und"].includes(p.unit)?"1":"0.001";inp.value="";$("#neStockAdjustQtyLabel").firstChild.textContent="Quantidade em "+p.unit+" (+ entrada / − saída)";$("#stockAdjustModal").showModal();
}
function recipeRow(selected="",qty=""){
  return '<div class="recipeRow"><select class="recipeProduct"><option value="">Selecione o produto…</option>'+state.products.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===selected?'selected':'')+'>'+esc(p.name)+' ('+esc(p.unit)+')</option>').join("")+'</select><input class="recipeQty" type="number" step="0.001" min="0.001" value="'+esc(String(qty))+'" placeholder="Quantidade na unidade do produto"><button type="button" class="x recipeRemove">×</button></div>';
}
function bindRecipeRemove(){$$(".recipeRemove").forEach(b=>b.onclick=()=>b.closest(".recipeRow").remove())}
async function openRecipe(serviceId){
  if(!state.products.length)await loadInventory();
  const s=state.services.find(x=>x.id===serviceId),rows=await api("/api/services/"+serviceId+"/recipe");
  $("#recipeForm").elements.service_id.value=serviceId;$("#recipeServiceName").textContent=s?.name||"Serviço";
  $("#recipeRows").innerHTML=(rows.length?rows.map(r=>recipeRow(r.product_id,r.qty_standard)): [recipeRow()]).join("");bindRecipeRemove();$("#recipeModal").showModal();
}
$("#addRecipeRow").onclick=()=>{$("#recipeRows").insertAdjacentHTML("beforeend",recipeRow());bindRecipeRemove()};
$("#recipeForm").onsubmit=async e=>{e.preventDefault();const sid=e.target.elements.service_id.value,items=$$(".recipeRow",e.target).map(r=>({product_id:$(".recipeProduct",r).value,qty_standard:Number($(".recipeQty",r).value||0)})).filter(x=>x.product_id&&x.qty_standard>0);try{await api("/api/services/"+sid+"/recipe",{method:"PUT",body:JSON.stringify({items})});$("#recipeModal").close();await loadInventory();toast("Consumo padrão atualizado")}catch{toast("Não foi possível salvar o consumo")}};
$("#supplierForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await api("/api/suppliers",{method:"POST",body:JSON.stringify(b)});e.target.reset();$("#supplierModal").close();await loadSuppliers();toast("Fornecedor cadastrado")}catch{toast("Erro ao salvar fornecedor")}};
$("#productForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));try{await api("/api/products",{method:"POST",body:JSON.stringify(b)});e.target.reset();$("#productModal").close();await loadInventory();toast("Produto cadastrado")}catch{toast("Erro ao salvar produto")}};
$("#stockAdjustForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.qty=Number(b.qty);try{await api("/api/stock/adjust",{method:"POST",body:JSON.stringify(b)}); $("#stockAdjustModal").close();e.target.reset();await loadInventory();toast("Estoque ajustado")}catch(err){toast(err.data?.error==="insufficient_stock"?"Não é possível retirar mais que o saldo existente":err.data?.error==="invalid_stock_quantity"?"Confira a quantidade e a unidade do produto":"Erro ao ajustar estoque")}};
$("#financeEntryForm").onsubmit=async e=>{
  e.preventDefault();const form=e.target,b=Object.fromEntries(new FormData(form));
  try{
    await api("/api/finance/entries",{method:"POST",body:JSON.stringify(b)});
    form.reset();$("#financeEntryModal").close();setFinanceTab("entries");await loadFinance();toast("Lançamento registrado");
  }catch(err){toast(err.data?.error==="cash_session_required"?"Abra o caixa antes de movimentar dinheiro":err.data?.error==="invalid_amount"?"Informe um valor positivo com até duas casas decimais":err.data?.error==="invalid_payment_method"?"Escolha uma forma de pagamento válida":"Não foi possível salvar o lançamento")}
};
$("#cashOpenForm").onsubmit=async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target));
  try{await api("/api/cash/open",{method:"POST",body:JSON.stringify(b)});
    e.target.reset();$("#cashOpenModal").close();await loadFinance();toast("Caixa aberto");
  }catch(err){toast(err.data?.error==="cash_already_open"?"Já existe um caixa aberto":err.data?.error==="invalid_amount"?"Confira o valor inicial":"Não foi possível abrir o caixa")}
};
$("#cashCloseForm").onsubmit=async e=>{
  e.preventDefault();
  const form=e.target,b=Object.fromEntries(new FormData(form));
  const difference=Math.round((Number(b.actual)-Number(state.neCashExpected||0))*100);
  if(difference!==0&&String(b.notes||"").trim().length<8){form.elements.notes.focus();toast("Explique a diferença do caixa antes de fechar");return}
  if(!window.confirm("Confirmar o fechamento? Valor contado: "+moneyBR(b.actual)+"."))return;
  try{const out=await api("/api/cash/close",{method:"POST",body:JSON.stringify(b)});
    $("#cashCloseModal").close();form.reset();await loadFinance();
    toast("Caixa fechado · diferença "+moneyBR(out.difference));
  }catch(err){toast(err.data?.error==="cash_difference_reason_required"?"Informe o motivo da diferença (mínimo de oito caracteres)":err.data?.error==="cash_not_open"?"Este caixa já está fechado":"Não foi possível fechar o caixa")}
};
$("#cashWithdrawForm").onsubmit=async e=>{
  e.preventDefault();const form=e.target,b=Object.fromEntries(new FormData(form));
  if(!window.confirm("Confirmar retirada de "+moneyBR(b.amount)+" do caixa?"))return;
  try{await api("/api/cash/withdraw",{method:"POST",body:JSON.stringify(b)});
    form.reset();$("#cashWithdrawModal").close();await loadFinance();toast("Retirada registrada no caixa");
  }catch(err){toast(err.data?.error==="insufficient_cash"?"O dinheiro em caixa é insuficiente":err.data?.error==="cash_not_open"?"Abra o caixa antes de retirar dinheiro":"Não foi possível registrar a retirada")}
};
$("#financePayForm").onsubmit=async e=>{
  e.preventDefault();const form=e.target,b=Object.fromEntries(new FormData(form));
  try{await api("/api/finance/entries/"+encodeURIComponent(b.entry_id)+"/pay",{method:"POST",body:JSON.stringify({payment_method:b.payment_method})});
    form.reset();$("#financePayModal").close();await loadFinance();toast("Pagamento confirmado");
  }catch(err){toast(err.data?.error==="already_paid"?"Esse lançamento já foi pago":err.data?.error==="cash_session_required"?"Abra o caixa para pagar em dinheiro":"Não foi possível registrar o pagamento")}
};
function decorateAgendaCheckout(){
  $$("[data-status]").forEach(sel=>{
    const status=sel.value,id=sel.dataset.status;if(["completed","cancelled","no_show"].includes(status)||sel.parentElement.querySelector("[data-checkout]"))return;
    const b=document.createElement("button");b.type="button";b.className="secondary checkoutBtn";b.dataset.checkout=id;b.textContent="Finalizar e receber";
    b.onclick=()=>openCheckout(id);sel.parentElement.appendChild(b);
  });
}
async function loadAgendaPhase2(){await loadAgenda();decorateAgendaCheckout()}
$("#checkoutForm").onsubmit=async e=>{
  e.preventDefault();
  const b=Object.fromEntries(new FormData(e.target));
  try{
    b.consumption=collectCheckoutConsumption();
    const out=await api("/api/checkout",{method:"POST",body:JSON.stringify(b)});
    $("#checkoutModal").close();e.target.reset();$("#checkoutConsumption").innerHTML="";
    await loadAgendaPhase2();state.dashboard=await api("/api/dashboard");renderDashboard();
    toast("Atendimento finalizado · "+moneyBR(out.total));
  }catch(err){
    const code=err.data?.error;
    toast(code==="cash_session_required"?"Abra o caixa antes de receber em dinheiro":
      code==="appointment_already_checked_out"?"Esse atendimento já foi finalizado":
      code==="package_credit_required"?"Esta cliente não possui crédito válido deste serviço":
      code==="insufficient_stock"?"Estoque insuficiente: "+(err.data?.product_name||"corrija o saldo do produto"):
      code==="invalid_stock_quantity"||code==="invalid_consumption_product"?"Verifique o consumo informado e sua unidade":
      code==="invalid_consumption_form"?"Informe quantidades válidas antes de finalizar":"Não foi possível finalizar");
  }
};

async function loadDre(){
  const month=$("#dreMonth").value||new Date().toISOString().slice(0,7);$("#dreMonth").value=month;
  try{const d=await api("/api/reports/dre?month="+encodeURIComponent(month));$("#dreBody").innerHTML='<div class="dreHero"><div><span>Entradas</span><strong>'+moneyBR(d.income)+'</strong></div><div><span>Saídas</span><strong>'+moneyBR(d.expense)+'</strong></div><div><span>Resultado</span><strong>'+moneyBR(d.result)+'</strong></div></div><div class="stack">'+d.categories.map(c=>'<div class="row"><div><strong>'+c.category+'</strong><small>'+(c.kind==="income"?"receita":"despesa")+'</small></div><div class="money '+c.kind+'">'+moneyBR(c.total)+'</div></div>').join("")+'</div>'}catch{$("#dreBody").innerHTML='<p class="muted">Não foi possível calcular o DRE.</p>'}
}
$("#dreMonth").onchange=loadDre;
$("#payPendingCommissions").onclick=async e=>{const ids=String(e.currentTarget.dataset.ids||"").split(",").filter(Boolean);if(!ids.length)return;const total=Number(e.currentTarget.dataset.total||0);if(!window.confirm("Confirmar pagamento de "+ids.length+" comissões no total de "+moneyBR(total)+"?"))return;try{const out=await api("/api/commissions/pay",{method:"POST",body:JSON.stringify({ids})});await loadFinance();toast(out.count+" comissões pagas · "+moneyBR(out.total))}catch{toast("Não foi possível pagar as comissões")}};
function purchaseRow(selected="",qty="",cost="",lot="",expiry=""){
  return '<div class="purchaseRow"><select class="purchaseProduct"><option value="">Produto…</option>'+state.products.map(p=>'<option value="'+p.id+'" '+(p.id===selected?'selected':'')+'>'+p.name+' ('+p.unit+')</option>').join("")+'</select><input class="purchaseQty" type="number" step="0.01" min="0.01" value="'+qty+'" placeholder="Qtd."><input class="purchaseCost" type="number" step="0.0001" min="0" value="'+cost+'" placeholder="R$/un"><input class="purchaseLot" value="'+lot+'" placeholder="Lote"><input class="purchaseExpiry" type="date" value="'+expiry+'"><button type="button" class="x purchaseRemove">×</button></div>';
}
function bindPurchaseRemove(){$$(".purchaseRemove").forEach(b=>b.onclick=()=>b.closest(".purchaseRow").remove())}
function fillPurchaseSupplier(){const s=$("#purchaseSupplier");if(!s)return;s.innerHTML='<option value="">Selecione…</option>'+state.suppliers.map(x=>'<option value="'+x.id+'">'+x.name+'</option>').join("")}
$("#addPurchaseRow").onclick=()=>{$("#purchaseRows").insertAdjacentHTML("beforeend",purchaseRow());bindPurchaseRemove()};
$('[data-open="purchaseModal"]').addEventListener("click",async()=>{if(!state.products.length)await loadInventory();if(!state.suppliers.length)await loadSuppliers();fillPurchaseSupplier();if(!$("#purchaseRows").children.length)$("#purchaseRows").innerHTML=purchaseRow();bindPurchaseRemove()});
$("#purchaseForm").onsubmit=async e=>{e.preventDefault();const base=Object.fromEntries(new FormData(e.target)),items=$$(".purchaseRow",e.target).map(r=>({product_id:$(".purchaseProduct",r).value,qty:Number($(".purchaseQty",r).value||0),unit_cost:Number($(".purchaseCost",r).value||0),lot_code:$(".purchaseLot",r).value.trim(),expiry_date:$(".purchaseExpiry",r).value})).filter(x=>x.product_id&&x.qty>0);try{await api("/api/purchases",{method:"POST",body:JSON.stringify({...base,items})});e.target.reset();$("#purchaseRows").innerHTML="";$("#purchaseModal").close();await loadSuppliers();await loadFinance();await loadPurchaseArea();toast("Pedido de compra criado")}catch{toast("Não foi possível criar o pedido")}};

async function loadPurchaseArea(){
  try{
    const [suggestions,purchases,prices]=await Promise.all([api("/api/purchases/suggestions"),api("/api/purchases"),api("/api/suppliers/price-history")]);
    $("#purchaseSuggestionList").innerHTML=suggestions.map(s=>'<div class="tableRow"><div><strong>'+s.product_name+'</strong><small>Atual '+Number(s.stock_qty).toLocaleString("pt-BR")+' '+s.unit+' · mínimo '+Number(s.min_qty).toLocaleString("pt-BR")+' · ideal '+Number(s.ideal_qty).toLocaleString("pt-BR")+(s.supplier_name?' · '+s.supplier_name:'')+'</small></div><div><strong>'+Number(s.suggested_qty).toLocaleString("pt-BR")+' '+s.unit+'</strong><small>'+(s.days_left==null?'sem histórico':'~'+Number(s.days_left).toFixed(1)+' dias restantes')+'</small></div><span class="status pending">repor</span></div>').join("")||'<p class="muted">Nenhum produto abaixo do mínimo.</p>';
    $("#purchaseList").innerHTML=purchases.map(p=>'<div class="tableRow"><div><strong>'+p.supplier_name+'</strong><small>'+p.item_count+' itens · pedido '+dateTimeBR(p.ordered_at)+(p.expected_at?' · previsão '+p.expected_at:'')+'</small></div><div class="money">'+moneyBR(p.total)+'</div>'+(p.status==="received"?'<span class="status paid">recebido</span>':'<button type="button" class="secondary smallBtn" data-receive-purchase="'+p.id+'">Receber</button>')+'</div>').join("")||'<p class="muted">Nenhum pedido criado ainda.</p>';
    $("#supplierPriceList").innerHTML=prices.slice(0,60).map(x=>'<div class="tableRow"><div><strong>'+x.product_name+'</strong><small>'+x.supplier_name+' · '+dateTimeBR(x.recorded_at)+'</small></div><div><strong>'+moneyBR(x.unit_cost)+'/'+x.unit+'</strong><small>'+(x.change_pct==null?"primeiro registro":(x.change_pct>=0?"+":"")+Number(x.change_pct).toFixed(1)+"% vs. anterior")+'</small></div><span class="status '+(x.change_pct!=null&&x.change_pct>0?"pending":"paid")+'">'+(x.change_pct!=null&&x.change_pct>0?"subiu":"ok")+'</span></div>').join("")||'<p class="muted">O histórico aparece a partir do primeiro pedido.</p>';
    $$("[data-receive-purchase]").forEach(b=>b.onclick=async()=>{try{await api("/api/purchases/"+b.dataset.receivePurchase+"/receive",{method:"POST",body:"{}"});await loadPurchaseArea();await loadInventory();toast("Compra recebida e estoque atualizado")}catch(err){toast(err.data?.error==="already_received"?"Esse pedido já foi recebido":"Não foi possível receber o pedido")}});
  }catch(err){if(err.status!==403&&err.status!==401)toast("Não foi possível carregar os pedidos")}
}
async function openCheckout(appointmentId){
  try{
    const prep=await api("/api/checkout/"+appointmentId+"/prep");
    $("#checkoutForm").elements.appointment_id.value=appointmentId;
    $("#checkoutLabel").textContent=prep.client_name+" · "+prep.service_name+" · "+moneyBR(prep.price);
    state.checkoutPackages=prep.packages||[];const cp=$("#checkoutPackage");cp.innerHTML='<option value="">Selecione…</option>'+state.checkoutPackages.map(p=>'<option value="'+p.client_package_id+'">'+p.package_name+' · '+p.remaining+' crédito(s) · até '+String(p.expires_at).slice(0,10)+' · valor '+moneyBR(p.allocated_unit)+'</option>').join("");$("#checkoutPaymentMethod").value="pix";updateCheckoutPaymentMode();
    const shortages=[];
    $("#checkoutConsumption").innerHTML=prep.recipe.length?prep.recipe.map(r=>{
      const unit=String(r.unit||"ml"),stock=Number(r.stock_qty||0),standard=Number(r.qty_standard||0);
      const avg=Number(r.client_avg_qty),suggested=r.client_avg_qty!=null&&Number.isFinite(avg)?avg:standard;
      const hint=r.client_avg_qty!=null?"média desta cliente ("+r.client_samples+" atend.)":"padrão do serviço";
      if(suggested>stock)shortages.push(r.product_name);
      const step=["un","unidade","und"].includes(unit)?"1":"0.001";
      return '<div class="consumptionRow" data-consumption-product="'+esc(r.product_id)+'" data-unit="'+esc(unit)+'"><div><strong>'+esc(r.product_name)+'</strong><small>'+hint+' · previsto '+standard.toLocaleString("pt-BR")+' '+esc(unit)+' · saldo '+stock.toLocaleString("pt-BR")+' '+esc(unit)+'</small></div><input type="number" step="'+step+'" min="0" max="'+stock+'" required value="'+Number(suggested.toFixed(3))+'"><span>'+esc(unit)+'</span></div>';
    }).join(""):'<p class="muted">Este serviço ainda não tem produtos configurados. O financeiro e a comissão serão registrados normalmente.</p>';
    $("#neCheckoutStockHint").textContent=shortages.length?"Atenção: saldo insuficiente para "+shortages.join(", ")+". Corrija o estoque antes de finalizar.":"Confira as quantidades. É permitido registrar zero quando um produto não foi usado.";
    $("#checkoutModal").showModal();
  }catch{toast("Não foi possível preparar o fechamento")}
}
function collectCheckoutConsumption(){
  return $("#checkoutConsumption [data-consumption-product]").map(row=>{
    const input=$("input",row),number=Number(input.value),unit=row.dataset.unit;
    if(input.value.trim()===""||!input.checkValidity()||!Number.isFinite(number)||number<0||number>1000000||
      ["un","unidade","und"].includes(unit)&&!Number.isInteger(number)){
      input.focus();throw Object.assign(new Error("invalid_consumption_form"),{data:{error:"invalid_consumption_form"}});
    }
    return {product_id:row.dataset.consumptionProduct,actual_qty:number};
  });
}
function payFinanceEntry(id){
  const entry=state.financeEntries?.find(x=>x.id===id);
  if(!entry||entry.status!=="pending"){toast("Lançamento não encontrado ou já pago");return}
  const form=$("#financePayForm");form.reset();
  form.elements.entry_id.value=id;
  $("#neFinancePayDescription").textContent=entry.description+" · "+moneyBR(entry.amount);
  $("#financePayModal").showModal();
}

async function loadOwnerEye(){
  try{
    const data=await Promise.all([
      api("/api/intelligence/overview"),api("/api/intelligence/recovery"),api("/api/intelligence/alerts"),
      api("/api/intelligence/professionals"),api("/api/intelligence/services"),api("/api/intelligence/stock-forecast")
    ]);
    const ov=data[0],recovery=data[1],alerts=data[2],pros=data[3],services=data[4],stock=data[5];
    $("#oiRevenue").textContent=moneyBR(ov.revenue30);$("#oiTicket").textContent=moneyBR(ov.avgTicket);$("#oiRepeat").textContent=Number(ov.repeatRate||0).toFixed(1)+"%";$("#oiRecovery").textContent=moneyBR(ov.recoverableValue);
    $("#intelligenceAlerts").innerHTML=alerts.map(x=>'<div class="alertItem '+x.severity+'"><div><strong>'+x.title+'</strong><p>'+x.body+'</p></div><span class="chip">'+x.severity+'</span></div>').join("")||'<p class="muted">Nenhum alerta crítico neste momento.</p>';
    $("#recoveryList").innerHTML=recovery.slice(0,12).map(c=>'<div class="row"><div><strong>'+c.name+'</strong><small>'+(c.last_service||"Sem serviço recente")+' · '+(c.days_late==null?"sem previsão":c.days_late+" dias atrasada")+' · '+moneyBR(c.estimated_value)+'</small></div><button type="button" class="secondary smallBtn" data-recovery-client="'+c.id+'">Preparar contato</button></div>').join("")||'<p class="muted">Nenhuma cliente atrasada pela leitura atual.</p>';
    $$("[data-recovery-client]").forEach(b=>b.onclick=async()=>{const c=recovery.find(x=>x.id===b.dataset.recoveryClient);try{await api("/api/intelligence/recovery/action",{method:"POST",body:JSON.stringify({client_id:c.id,message:c.suggested_message})});toast("Contato preparado para o Comercial IA");await loadOwnerEye()}catch{toast("Não foi possível preparar o contato")}});
    $("#performanceList").innerHTML=pros.map(p=>'<div class="tableRow"><div><strong>'+p.name+'</strong><small>'+p.appointments+' atend. · '+Number(p.productive_hours).toFixed(1)+'h produtivas</small></div><div><strong>'+moneyBR(p.revenue)+'</strong><small>'+moneyBR(p.revenue_per_hour)+'/h</small></div><span class="status paid">'+moneyBR(p.avg_ticket)+' ticket</span></div>').join("")||'<p class="muted">Ainda sem atendimentos finalizados.</p>';
    $("#serviceIntelList").innerHTML=services.slice(0,15).map(s=>'<div class="tableRow"><div><strong>'+s.name+'</strong><small>'+s.count+' vendas · receita '+moneyBR(s.revenue)+'</small></div><div><strong>'+moneyBR(s.direct_margin)+'</strong><small>'+Number(s.direct_margin_pct||0).toFixed(1)+'% margem</small></div><span class="status '+(s.direct_margin_pct<30?"pending":"paid")+'">'+moneyBR(s.product_cost)+' produto</span></div>').join("")||'<p class="muted">Ainda sem dados de serviços.</p>';
    $("#stockForecastList").innerHTML=stock.slice(0,30).map(s=>'<div class="tableRow"><div><strong>'+s.product_name+'</strong><small>'+Number(s.stock_qty).toLocaleString("pt-BR")+' '+s.unit+' · '+(s.supplier_name||"sem fornecedor")+'</small></div><div><strong>'+(s.days_cover==null?"—":s.days_cover+" dias")+'</strong><small>'+(s.reorder_in_days==null?"sem histórico":"repor em ~"+s.reorder_in_days+" dias")+'</small></div><span class="status '+(s.risk==="critical"?"cancelled":s.risk==="warning"?"pending":"paid")+'">'+s.risk+'</span></div>').join("")||'<p class="muted">Cadastre consumo para gerar previsão.</p>';
  }catch(err){if(err.status!==403&&err.status!==401)toast("Não foi possível atualizar o Olho do Dono")}
}
$("#refreshIntelligence").onclick=loadOwnerEye;

const agentNames={receptionist:"Recepcionista IA",commercial:"Comercial IA",manager:"Gerente IA",finance:"Financeiro IA",buyer:"Comprador IA",analyst:"Analista IA"};
const actionNames={send_whatsapp:"Mensagem WhatsApp",review_finance:"Revisar financeiro",prepare_purchase:"Preparar compra",manager_review:"Revisão gerencial",insight:"Insight"};
async function loadAgents(){
  try{
    const [meta,tasks]=await Promise.all([api("/api/agents"),api("/api/agents/tasks")]);
    $("#agentPendingBadge").textContent=meta.pending+" pendentes";state.agentProfiles=meta.profiles;
    $("#agentProfileList").innerHTML=meta.profiles.map(a=>{const cfg=a.config||{},display=cfg.identity?.display_name||a.name,configBtn=a.agent_key==="receptionist"?'<button type="button" class="secondary smallBtn" data-agent-config="'+a.agent_key+'">Configurar agente</button>':"";return '<article><div class="panelhead"><span class="chip">'+(a.enabled?"ativo":"pausado")+'</span><strong>'+esc(display)+'</strong></div><p>'+esc(a.description)+'</p><label class="autonomyLabel">Autonomia <b>'+a.autonomy+'</b>/10<input type="range" min="0" max="10" value="'+a.autonomy+'" data-agent-autonomy="'+a.agent_key+'"></label><div class="agentCardActions">'+configBtn+'</div></article>'}).join("");
    $$("[data-agent-autonomy]").forEach(s=>s.onchange=async()=>{try{await api("/api/agents/profile",{method:"PATCH",body:JSON.stringify({agent_key:s.dataset.agentAutonomy,autonomy:Number(s.value)})});toast("Autonomia atualizada");await loadAgents()}catch{toast("Não foi possível alterar a autonomia")}});
    $$("[data-agent-config]").forEach(b=>b.onclick=()=>openAgentConfig(b.dataset.agentConfig));
    $("#agentTaskList").innerHTML=tasks.slice(0,80).map(t=>{
      const approve=t.status==="pending"&&Number(t.requires_approval)?'<button class="secondary smallBtn" data-agent-approve="'+t.id+'">Aprovar</button>':"";
      const execute=(t.status==="approved"||(!Number(t.requires_approval)&&t.status==="pending"))?'<button class="primary smallBtn" data-agent-execute="'+t.id+'">Executar</button>':"";
      const reject=["pending","approved"].includes(t.status)?'<button class="link dangerText" data-agent-reject="'+t.id+'">Rejeitar</button>':"";
      return '<div class="agentTask"><div><span class="chip">'+(agentNames[t.agent_key]||t.agent_key)+'</span><strong>'+t.title+'</strong><small>'+t.description+'</small></div><div class="agentTaskMeta"><span class="status '+(t.risk==="medium"?"pending":t.risk==="high"?"cancelled":"paid")+'">'+t.risk+'</span><small>'+t.status+' · '+(actionNames[t.action_type]||t.action_type)+'</small></div><div class="agentTaskActions">'+approve+execute+reject+'</div></div>';
    }).join("")||'<p class="muted">Rode uma varredura para os agentes procurarem trabalho.</p>';
    $$("[data-agent-approve]").forEach(b=>b.onclick=()=>agentTaskAction(b.dataset.agentApprove,"approve"));
    $$("[data-agent-execute]").forEach(b=>b.onclick=()=>agentTaskAction(b.dataset.agentExecute,"execute"));
    $$("[data-agent-reject]").forEach(b=>b.onclick=()=>agentTaskAction(b.dataset.agentReject,"reject"));
  }catch(err){if(err.status!==403&&err.status!==401)toast("Não foi possível carregar os agentes")}
}
async function agentTaskAction(id,action){
  try{await api("/api/agents/tasks/"+id+"/"+action,{method:"POST",body:"{}"});toast(action==="approve"?"Ação aprovada":action==="reject"?"Ação rejeitada":"Ação executada");await loadAgents()}catch(err){const c=err.data?.error;toast(c==="approval_required"?"Aprovação necessária":c==="whatsapp_unavailable"?"WhatsApp ainda não conectado":"Não foi possível concluir a ação")}
}
$("#runAgents").onclick=async()=>{try{const out=await api("/api/agents/run",{method:"POST",body:"{}"});toast("Varredura concluída · "+out.items+" sinais analisados");await loadAgents()}catch{toast("Não foi possível rodar os agentes")}};
$("#agentCommandForm").onsubmit=async e=>{e.preventDefault();const text=$("#agentCommandText").value.trim();if(!text)return;$("#agentCommandResult").textContent="Roteando…";try{const r=await api("/api/agents/command",{method:"POST",body:JSON.stringify({text})});$("#agentCommandResult").innerHTML='<strong>'+r.agent_name+'</strong><br><small>fonte: '+r.source+(r.confidence!=null?' · confiança '+Math.round(Number(r.confidence)*100)+'%':'')+'</small>'}catch{$("#agentCommandResult").textContent="Não foi possível rotear o comando."}};


function setAgentField(form,name,value){
  const el=form.elements[name];if(!el)return;
  if(el.type==="checkbox")el.checked=!!value;
  else el.value=value??"";
}
async 
function updateLlmFields(){
  const f=$("#agentConfigForm"),external=f.elements.llm_provider.value!=="internal";
  f.elements.llm_model.disabled=!external;
  f.elements.llm_api_key.disabled=!external;
  $("#llmKeyLabel").classList.toggle("muted",!external);
}
async function loadReceptionistLlmForm(){
  const f=$("#agentConfigForm");
  try{
    const cfg=await api("/api/agents/receptionist/llm");state.receptionistLlm=cfg;
    setAgentField(f,"llm_enabled",cfg.enabled!==false);
    setAgentField(f,"llm_provider",cfg.provider||"internal");
    setAgentField(f,"llm_model",cfg.model||"");
    f.elements.llm_api_key.value="";
    $("#llmKeyStatus").textContent=cfg.provider==="internal"?"Sem chave necessária.":(cfg.has_api_key?"Chave configurada e protegida.":"Nenhuma chave configurada.");
    $("#llmStatusBadge").textContent=cfg.provider==="internal"?"interno":"configurado";
    updateLlmFields();
  }catch{
    $("#llmStatusBadge").textContent="erro";
    $("#llmKeyStatus").textContent="Não foi possível carregar a configuração da LLM.";
  }
}

$("#llmProvider").onchange=()=>{
  const f=$("#agentConfigForm"),p=f.elements.llm_provider.value;
  if(p==="internal")f.elements.llm_model.value="";
  updateLlmFields();
};


$("#testLlmConfig").onclick=async()=>{
  const f=$("#agentConfigForm"),b=$("#testLlmConfig");b.disabled=true;b.textContent="Testando…";
  try{
    const payload={provider:f.elements.llm_provider.value,model:f.elements.llm_model.value,api_key:f.elements.llm_api_key.value};
    const out=await api("/api/agents/receptionist/llm/test",{method:"POST",body:JSON.stringify(payload)});
    $("#llmStatusBadge").textContent="conectado";
    $("#llmKeyStatus").textContent=out.provider==="internal"?"Cérebro interno disponível.":"Conexão validada com "+out.provider+" / "+out.model+".";
    toast("LLM conectada com sucesso");
  }catch{
    $("#llmStatusBadge").textContent="falhou";
    $("#llmKeyStatus").textContent="Falha no teste. Confira empresa, modelo e chave.";
    toast("Não foi possível conectar à LLM");
  }finally{b.disabled=false;b.textContent="Testar conexão"}
};

async function openAgentConfig(key){
  const profile=(state.agentProfiles||[]).find(x=>x.agent_key===key);if(!profile)return;
  const c=profile.config||{},f=$("#agentConfigForm");
  setAgentField(f,"agent_key",key);setAgentField(f,"enabled",!!profile.enabled);
  setAgentField(f,"display_name",c.identity?.display_name||profile.name);
  setAgentField(f,"greeting_name",c.identity?.greeting_name||"");
  setAgentField(f,"introduction",c.identity?.introduction||"");
  setAgentField(f,"signature",c.identity?.signature||"");
  setAgentField(f,"tone",c.voice?.tone||"warm");
  setAgentField(f,"formality",c.voice?.formality??3);
  setAgentField(f,"directness",c.voice?.directness??7);
  setAgentField(f,"emoji_level",c.voice?.emoji_level??2);
  setAgentField(f,"use_client_first_name",c.voice?.use_client_first_name!==false);
  const service=["auto_activate_new_conversations","answer_prices","list_services","suggest_appointments","allow_booking_flow","allow_cancel","allow_reschedule","transfer_on_complaint","transfer_on_ambiguity","transfer_on_human_request"];
  service.forEach(n=>setAgentField(f,n,c.service?.[n]));
  const sales=["offer_next_step","suggest_related_service","recover_abandoned_lead"];
  sales.forEach(n=>setAgentField(f,n,c.sales?.[n]));
  setAgentField(f,"discount_policy",c.sales?.discount_policy||"");
  setAgentField(f,"confirmation_hours_before",c.schedule?.confirmation_hours_before??24);
  setAgentField(f,"reminder_hours_before",c.schedule?.reminder_hours_before??3);
  setAgentField(f,"max_slots_to_offer",c.schedule?.max_slots_to_offer??3);
  setAgentField(f,"allow_waitlist_offer",c.schedule?.allow_waitlist_offer!==false);
  const limits=["never_promise_unavailable_slot","never_invent_price","never_confirm_without_slot","never_handle_payment_dispute","sensitive_topics_handoff"];
  limits.forEach(n=>setAgentField(f,n,c.limits?.[n]!==false));
  setAgentField(f,"custom_instructions",c.custom_instructions||"");
  $("#agentFormalityOut").textContent=f.elements.formality.value;
  $("#agentDirectnessOut").textContent=f.elements.directness.value;
  $("#agentConfigModal").showModal();
  await loadReceptionistLlmForm();
}
$("#agentConfigForm").elements.formality.oninput=e=>$("#agentFormalityOut").textContent=e.target.value;
$("#agentConfigForm").elements.directness.oninput=e=>$("#agentDirectnessOut").textContent=e.target.value;
$("#agentConfigForm").onsubmit=async e=>{
  e.preventDefault();const f=e.target,key=f.elements.agent_key.value;
  const config={
    identity:{display_name:f.elements.display_name.value,greeting_name:f.elements.greeting_name.value,introduction:f.elements.introduction.value,signature:f.elements.signature.value},
    voice:{tone:f.elements.tone.value,formality:Number(f.elements.formality.value),directness:Number(f.elements.directness.value),emoji_level:Number(f.elements.emoji_level.value),use_client_first_name:f.elements.use_client_first_name.checked},
    service:{auto_activate_new_conversations:f.elements.auto_activate_new_conversations.checked,answer_prices:f.elements.answer_prices.checked,list_services:f.elements.list_services.checked,suggest_appointments:f.elements.suggest_appointments.checked,allow_booking_flow:f.elements.allow_booking_flow.checked,allow_cancel:f.elements.allow_cancel.checked,allow_reschedule:f.elements.allow_reschedule.checked,transfer_on_complaint:f.elements.transfer_on_complaint.checked,transfer_on_ambiguity:f.elements.transfer_on_ambiguity.checked,transfer_on_human_request:f.elements.transfer_on_human_request.checked},
    sales:{offer_next_step:f.elements.offer_next_step.checked,suggest_related_service:f.elements.suggest_related_service.checked,recover_abandoned_lead:f.elements.recover_abandoned_lead.checked,discount_policy:f.elements.discount_policy.value},
    schedule:{confirmation_hours_before:Number(f.elements.confirmation_hours_before.value||24),reminder_hours_before:Number(f.elements.reminder_hours_before.value||3),max_slots_to_offer:Number(f.elements.max_slots_to_offer.value||3),allow_waitlist_offer:f.elements.allow_waitlist_offer.checked},
    limits:{never_promise_unavailable_slot:f.elements.never_promise_unavailable_slot.checked,never_invent_price:f.elements.never_invent_price.checked,never_confirm_without_slot:f.elements.never_confirm_without_slot.checked,never_handle_payment_dispute:f.elements.never_handle_payment_dispute.checked,sensitive_topics_handoff:f.elements.sensitive_topics_handoff.checked},
    custom_instructions:f.elements.custom_instructions.value
  };
  try{
    const llmPayload={provider:f.elements.llm_provider.value,model:f.elements.llm_model.value,enabled:f.elements.llm_enabled.checked},typedKey=f.elements.llm_api_key.value.trim();
    if(typedKey)llmPayload.api_key=typedKey;
    await api("/api/agents/receptionist/llm",{method:"PUT",body:JSON.stringify(llmPayload)});
    await api("/api/agents/profile",{method:"PATCH",body:JSON.stringify({agent_key:key,enabled:f.elements.enabled.checked,config})});
    f.elements.llm_api_key.value="";$("#agentConfigModal").close();toast("Recepcionista IA atualizada");await loadAgents();
  }catch(err){toast(err.status===403?"Seu perfil não pode alterar agentes":"Não foi possível salvar a configuração")}
};

if("serviceWorker" in navigator){window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}))}

function bytesHuman(v){
  const n=Number(v||0);if(n<1024)return n+" B";if(n<1024**2)return (n/1024).toFixed(1)+" KB";if(n<1024**3)return (n/1024**2).toFixed(1)+" MB";return (n/1024**3).toFixed(1)+" GB";
}
function ageHuman(v){
  if(!v)return "—";const d=Math.max(0,Date.now()-new Date(v).getTime()),m=Math.floor(d/60000);
  if(m<1)return "agora";if(m<60)return m+" min";const h=Math.floor(m/60);if(h<24)return h+" h";return Math.floor(h/24)+" d";
}
const auditNames={
  "auth.login":"Login","client.create":"Cliente criado","professional.create":"Profissional criado","service.create":"Serviço criado",
  "appointment.create":"Agendamento criado","appointment.status":"Status do agendamento","cash.open":"Caixa aberto","cash.close":"Caixa fechado",
  "finance.entry.create":"Lançamento financeiro","finance.entry.pay":"Pagamento registrado","supplier.create":"Fornecedor criado","product.create":"Produto criado",
  "stock.adjust":"Ajuste de estoque","checkout.create":"Atendimento finalizado","recovery.queue":"Recuperação preparada","agents.scan":"Varredura dos agentes",
  "agent.task.approve":"Ação de agente aprovada","agent.task.reject":"Ação de agente rejeitada","agent.task.execute":"Ação de agente executada",
  "agent.profile.update":"Autonomia de agente alterada","admin.user.role":"Perfil de usuário alterado","admin.user.active":"Acesso de usuário alterado","retail.sale":"Venda de produto","retail.product.config":"Configuração de revenda","staff.schedule.update":"Escala alterada","staff.time_off.create":"Folga/ausência registrada","staff.goal.update":"Meta da equipe alterada","package.sell":"Pacote vendido","package.create":"Pacote criado"
};
async function loadAdmin(){
  try{
    const d=await api("/api/admin/overview");
    const ok=d.database?.integrity==="ok";
    $("#adminHealthBadge").textContent=ok?"SAUDÁVEL":"ATENÇÃO";$("#adminHealthBadge").classList.toggle("ok",ok);
    $("#adminDbIntegrity").textContent=d.database?.integrity||"—";
    $("#adminUsersCount").textContent=(d.users||[]).length;
    $("#adminAuditCount").textContent=(d.audits||[]).length;
    $("#adminBackupAge").textContent=d.backup?.latest?ageHuman(d.backup.latest.mtime):"—";
    $("#adminBackupName").textContent=d.backup?.latest?.name||"nenhum backup";$("#adminRestore").textContent=d.restore?.ok?"OK":"ATENÇÃO";$("#adminRestoreDate").textContent=d.restore?.checked_at?ageHuman(d.restore.checked_at)+" atrás":(d.restore?.error||"não verificada");
    const mem=d.system?.memory||{},disk=d.system?.disk||{};
    $("#adminSystemInfo").innerHTML=[
      ["Memória usada",bytesHuman(mem.used)+" / "+bytesHuman(mem.total)],
      ["Disco usado",bytesHuman(disk.used)+" / "+bytesHuman(disk.total)],
      ["Uptime do app",Math.floor(Number(d.system?.uptime_seconds||0)/60)+" min"],
      ["Clientes",d.database?.counts?.clients??"—"],
      ["Agendamentos",d.database?.counts?.appointments??"—"],
      ["Atendimentos finalizados",d.database?.counts?.checkout_records??"—"],
      ["Tarefas dos agentes",d.database?.counts?.agent_tasks??"—"]
    ].map(x=>'<div class="row"><strong>'+x[0]+'</strong><span>'+x[1]+'</span></div>').join("");
    const roleName={owner:"Proprietária",manager:"Gerente",reception:"Recepção",professional:"Profissional"};
    $("#adminUserList").innerHTML=(d.users||[]).map(u=>'<div class="tableRow"><div><strong>'+u.name+'</strong><small>'+u.email+'</small></div><span class="chip">'+(roleName[u.role]||u.role)+'</span><span class="status '+(u.active?"paid":"cancelled")+'">'+(u.active?"ativo":"inativo")+'</span></div>').join("")||'<p class="muted">Nenhum usuário.</p>';
    $("#adminAuditList").innerHTML=(d.audits||[]).slice(0,80).map(a=>'<div class="tableRow"><div><strong>'+(auditNames[a.action]||a.action)+'</strong><small>'+(a.user_name||"sistema")+' · '+dateTimeBR(a.created_at)+'</small></div><span class="chip">'+(a.entity_type||"evento")+'</span><small>'+((a.entity_id||"").slice(0,8))+'</small></div>').join("")||'<p class="muted">Sem eventos de auditoria.</p>';
    $("#adminBackupList").innerHTML=(d.backup?.recent||[]).map(b=>'<div class="tableRow"><div><strong>'+b.name+'</strong><small>'+dateTimeBR(b.mtime)+'</small></div><strong>'+bytesHuman(b.size)+'</strong><span class="status paid">íntegro</span></div>').join("")||'<p class="muted">Nenhum backup encontrado.</p>';
  }catch(err){
    if(err.status===403)toast("Administração disponível para proprietária/gerência");
    else if(err.status!==401)toast("Não foi possível carregar a administração");
  }
}

function tierLabel(t){return ({base:"Base",prata:"Prata",ouro:"Ouro",diamante:"Diamante"})[t]||t}
function engagementKind(k){return ({postcare:"Pós-atendimento",birthday:"Aniversário"})[k]||k}
function fillReferralSelects(){
  for(const id of ["referrerClient","referredClient"]){
    const el=$("#"+id);if(!el)continue;
    el.innerHTML='<option value="">Selecione…</option>'+state.clients.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join("");
  }
}
async function loadRetention(){
  try{
    const [ov,clients,tasks,refs]=await Promise.all([api("/api/retention/overview"),api("/api/retention/clients"),api("/api/retention/tasks?status=pending"),api("/api/referrals")]);
    $("#rVip").textContent=ov.vip;$("#rPoints").textContent=Number(ov.total_points||0).toLocaleString("pt-BR");$("#rTasks").textContent=ov.pending_tasks;$("#rReferrals").textContent=ov.converted_referrals;
    $("#retentionClientList").innerHTML=clients.slice(0,25).map(c=>'<div class="tableRow"><div><strong>'+c.name+'</strong><small>'+c.visits+' visitas · LTV '+moneyBR(c.lifetime_value)+' · '+c.points+' pts</small></div><span class="chip tier '+c.tier+'">'+tierLabel(c.tier)+'</span><small>'+(c.referrals?c.referrals+' indicações':'')+'</small></div>').join("")||'<p class="muted">Ainda não há histórico de fidelização.</p>';
    $("#retentionTaskList").innerHTML=tasks.slice(0,30).map(t=>'<div class="row retentionTask"><div><strong>'+engagementKind(t.kind)+' · '+t.client_name+'</strong><small>'+t.message+' · '+dateTimeBR(t.due_at)+'</small></div><button type="button" class="secondary smallBtn" data-retention-done="'+t.id+'">Concluir</button></div>').join("")||'<p class="muted">Nenhuma ação de relacionamento pendente.</p>';
    $$("[data-retention-done]").forEach(b=>b.onclick=async()=>{try{await api("/api/retention/tasks/"+b.dataset.retentionDone+"/complete",{method:"POST",body:"{}"});await loadRetention();toast("Ação concluída")}catch{toast("Não foi possível concluir a ação")}});
    $("#referralList").innerHTML=refs.slice(0,50).map(r=>'<div class="tableRow"><div><strong>'+r.referrer_name+' → '+r.referred_name+'</strong><small>'+dateTimeBR(r.created_at)+' · recompensa '+r.reward_points+' pts</small></div><span class="status '+(r.status==="converted"?"paid":"pending")+'">'+(r.status==="converted"?"convertida":"aguardando 1ª compra")+'</span><small>'+(r.converted_at?dateTimeBR(r.converted_at):"")+'</small></div>').join("")||'<p class="muted">Nenhuma indicação registrada.</p>';
    fillReferralSelects();
  }catch(err){if(err.status!==403&&err.status!==401)toast("Não foi possível carregar a fidelização")}
}
$("#generateRetention").onclick=async()=>{try{const out=await api("/api/retention/tasks/generate",{method:"POST",body:"{}"});await loadRetention();toast("Ações atualizadas · "+out.generated+" verificadas")}catch{toast("Não foi possível gerar as ações")}};
$("#referralForm").onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.target));b.reward_points=Number(b.reward_points||50);try{await api("/api/referrals",{method:"POST",body:JSON.stringify(b)});e.target.reset();$("#referralModal").close();await loadRetention();toast("Indicação registrada")}catch(err){toast(err.data?.error==="referral_exists"?"Essa cliente já possui uma indicação":"Não foi possível registrar a indicação")}};

function fillTechnicalSelects(){
  const clientOpts='<option value="">Selecione…</option>'+state.clients.map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join("");
  const tc=$("#technicalClient"),fc=$("#technicalFormClient");if(tc)tc.innerHTML=clientOpts;if(fc)fc.innerHTML=clientOpts;
  const ss=$("#technicalService");if(ss)ss.innerHTML='<option value="">Sem serviço específico</option>'+state.services.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join("");
  const ps=$("#technicalProfessional");if(ps)ps.innerHTML='<option value="">Sem profissional</option>'+state.professionals.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join("");
}
async function loadTechnical(clientId=null){
  if(!state.clients.length)await loadClients();
  fillTechnicalSelects();
  const selector=$("#technicalClient");
  const cid=clientId||selector?.value||state.clients[0]?.id||"";
  if(!cid){$("#technicalRecordList").innerHTML='<p class="muted">Cadastre uma cliente primeiro.</p>';return}
  if(selector)selector.value=cid;
  const client=state.clients.find(c=>c.id===cid);
  const formClient=$("#technicalFormClient");if(formClient)formClient.value=cid;
  $("#technicalClientMeta").textContent=client?((client.allergies?"Alergias/restrições atuais: "+client.allergies:"Sem alergias/restrições registradas.")+(client.notes?" · "+client.notes:"")):"";
  try{
    const rows=await api("/api/clients/"+cid+"/technical");
    $("#technicalRecordList").innerHTML=rows.map(r=>{
      const service=esc(r.service_name||"Registro"),title=esc(r.title||"Ficha técnica");
      return '<details class="ne-technical-card"><summary><span class="ne-technical-icon" aria-hidden="true">▤</span><span class="ne-technical-title"><small>'+service+'</small><strong>'+title+'</strong><span>'+dateTimeBR(r.created_at)+'</span></span><span class="ne-service-arrow" aria-hidden="true">⌄</span></summary>'+
        '<div class="ne-technical-body">'+(r.professional_name?'<p><strong>Profissional:</strong> '+esc(r.professional_name)+'</p>':"")+
        (r.formula?'<div class="technicalBlock"><strong>Fórmula</strong><p>'+esc(r.formula).replace(/\n/g,"<br>")+'</p></div>':"")+
        (r.observations?'<div class="technicalBlock"><strong>Observações</strong><p>'+esc(r.observations).replace(/\n/g,"<br>")+'</p></div>':"")+
        (r.allergies_snapshot?'<p class="technicalAlert"><strong>Alergias/restrições registradas:</strong> '+esc(r.allergies_snapshot)+'</p>':"")+'</div></details>';
    }).join("")||'<article class="panel"><p class="muted">Ainda não há registro técnico para esta cliente.</p></article>';
    const add=$("#technical .sectionTitle [data-open]");if(add)add.style.display=state.user?.role==="reception"?"none":"";
  }catch(err){if(err.status!==401&&err.status!==403)toast("Não foi possível carregar a ficha técnica")}
}
$("#technicalClient").onchange=e=>{const linked=$("#neTechnicalAppointmentId");if(linked)linked.value="";loadTechnical(e.target.value)};
$("#technicalFormClient").onchange=()=>{const linked=$("#neTechnicalAppointmentId");if(linked)linked.value=""};
$("#technicalRecordModal").addEventListener("close",()=>{const linked=$("#neTechnicalAppointmentId");if(linked)linked.value=""});
$("#technicalRecordForm").onsubmit=async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),cid=b.client_id;
  try{await api("/api/clients/"+cid+"/technical",{method:"POST",body:JSON.stringify(b)});$("#technicalRecordModal").close();e.target.reset();fillTechnicalSelects();await loadTechnical(cid);toast("Registro técnico salvo")}catch(err){toast(err.status===403?"Seu perfil pode consultar, mas não alterar a ficha":"Não foi possível salvar o registro")}
};

function updateCheckoutPaymentMode(){
  const method=$("#checkoutPaymentMethod")?.value,isPackage=method==="package",wrap=$("#checkoutPackageWrap"),discount=$("#checkoutDiscount"),sel=$("#checkoutPackage");
  if(wrap)wrap.classList.toggle("hidden",!isPackage);
  if(discount){discount.disabled=isPackage;if(isPackage)discount.value="0"}
  if(isPackage){
    if(state.checkoutPackages?.length===1&&sel)sel.value=state.checkoutPackages[0].client_package_id;
    $("#checkoutPackageHint").textContent=state.checkoutPackages?.length?"Será consumido 1 crédito deste serviço.":"Esta cliente não possui crédito válido para este serviço.";
  }
}
$("#checkoutPaymentMethod").onchange=updateCheckoutPaymentMode;

function packageServiceRow(selected="",qty=1){
  return '<div class="packageRow"><select class="packageService"><option value="">Serviço…</option>'+state.services.map(s=>'<option value="'+s.id+'" '+(s.id===selected?'selected':'')+'>'+esc(s.name)+' · '+moneyBR(s.price)+'</option>').join("")+'</select><input class="packageQty" type="number" min="1" max="100" value="'+qty+'"><button type="button" class="x packageRemove">×</button></div>';
}
function bindPackageRows(){$$(".packageRemove").forEach(b=>b.onclick=()=>b.closest(".packageRow").remove())}
function fillPackageSaleSelects(packages){
  const c=$("#packageSellClient"),p=$("#packageSellPackage");
  if(c)c.innerHTML='<option value="">Selecione…</option>'+state.clients.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join("");
  if(p)p.innerHTML='<option value="">Selecione…</option>'+packages.filter(x=>x.active).map(x=>'<option value="'+x.id+'">'+esc(x.name)+' · '+moneyBR(x.price)+'</option>').join("");
}
async function loadPackages(){
  try{
    const [ov,packs,sold]=await Promise.all([api("/api/packages/overview"),api("/api/packages"),api("/api/client-packages")]);
    state.packages=packs;
    $("#pActive").textContent=ov.active_packages;$("#pValue").textContent=moneyBR(ov.active_value);$("#pCredits").textContent=ov.remaining_credits;$("#pTemplates").textContent=packs.filter(x=>x.active).length;
    $("#packageTemplateList").innerHTML=packs.map(p=>'<article><span class="chip">'+p.validity_days+' dias</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||"")+'</p><strong>'+moneyBR(p.price)+'</strong><div class="packageItems">'+p.items.map(i=>'<small>'+i.qty+'× '+esc(i.service_name)+'</small>').join("")+'</div></article>').join("")||'<p class="muted">Nenhum pacote configurado.</p>';
    $("#clientPackageList").innerHTML=sold.slice(0,80).map(p=>'<div class="tableRow"><div><strong>'+esc(p.client_name)+' · '+esc(p.package_name)+'</strong><small>Comprado '+dateTimeBR(p.purchased_at)+' · vence '+String(p.expires_at).slice(0,10)+'</small></div><div><strong>'+p.credits.reduce((n,x)=>n+x.remaining,0)+' créditos</strong><small>'+p.credits.map(x=>x.service_name+': '+x.remaining).join(' · ')+'</small></div><span class="status '+(p.status==="active"?"paid":p.status==="expired"?"cancelled":"")+'">'+(p.status==="active"?"ativo":p.status==="used"?"usado":"expirado")+'</span></div>').join("")||'<p class="muted">Nenhum pacote vendido.</p>';
    fillPackageSaleSelects(packs);
    const newBtn=$('#packages [data-open="packageModal"]');if(newBtn)newBtn.style.display=state.user?.role==="reception"?"none":"";
  }catch(err){if(err.status!==401&&err.status!==403)toast("Não foi possível carregar os pacotes")}
}
$("#addPackageRow").onclick=()=>{$("#packageRows").insertAdjacentHTML("beforeend",packageServiceRow());bindPackageRows()};
$('[data-open="packageModal"]').addEventListener("click",()=>{if(!$("#packageRows").children.length)$("#packageRows").innerHTML=packageServiceRow();bindPackageRows()});
$("#packageForm").onsubmit=async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),items=$$(".packageRow",e.target).map(r=>({service_id:$(".packageService",r).value,qty:Number($(".packageQty",r).value||1)})).filter(x=>x.service_id&&x.qty>0);
  try{await api("/api/packages",{method:"POST",body:JSON.stringify({...b,items})});e.target.reset();$("#packageRows").innerHTML="";$("#packageModal").close();await loadPackages();toast("Pacote criado")}catch(err){toast(err.status===403?"Seu perfil pode vender, mas não criar pacotes":"Não foi possível criar o pacote")}
};
$("#packageSellForm").onsubmit=async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),packageId=b.package_id;delete b.package_id;
  try{const out=await api("/api/packages/"+packageId+"/sell",{method:"POST",body:JSON.stringify(b)});e.target.reset();$("#packageSellModal").close();await loadPackages();await loadFinance();toast("Pacote vendido · "+moneyBR(out.amount))}catch(err){toast(err.data?.error==="cash_session_required"?"Abra o caixa antes de receber em dinheiro":"Não foi possível vender o pacote")}
};

const staffDayNames=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
function staffCanManage(){return ["owner","manager"].includes(state.user?.role)}
function staffProgress(value,target){if(!target)return "—";return Math.min(999,Math.max(0,Number(value||0)/Number(target)*100)).toFixed(0)+"%"}
function fillStaffProfessionalSelect(){
  const el=$("#timeOffProfessional");if(!el)return;
  el.innerHTML='<option value="">Selecione…</option>'+state.professionals.map(p=>'<option value="'+p.id+'">'+esc(p.name)+'</option>').join("");
}
async function loadStaff(){
  const period=$("#staffPeriod")?.value||new Date().toISOString().slice(0,7);
  if($("#staffPeriod")&&!$("#staffPeriod").value)$("#staffPeriod").value=period;
  fillStaffProfessionalSelect();
  try{
    const d=await api("/api/staff/overview?period="+encodeURIComponent(period));state.staffOverview=d;
    const can=staffCanManage();
    $("#teamList").innerHTML=d.metrics.map(p=>'<article><span class="avatar">'+initials(p.name)+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.role||"Profissional")+'</p><div class="tags">'+(p.specialties||[]).map(x=>'<span class="tag">'+esc(x)+'</span>').join("")+'</div><div class="staffQuick"><strong>'+moneyBR(p.revenue)+'</strong><small>'+p.appointments+' atendimentos · comissão '+moneyBR(p.commission_total)+'</small></div>'+(can?'<button type="button" class="secondary smallBtn" data-staff-manage="'+p.id+'">Escala & meta</button>':'')+'</article>').join("");
    $("#staffPerformanceList").innerHTML=d.metrics.map(p=>{
      const g=p.goal||{},revTarget=Number(g.target_revenue||0),apTarget=Number(g.target_appointments||0);
      return '<div class="tableRow"><div><strong>'+esc(p.name)+'</strong><small>'+p.appointments+' atend. · ticket '+moneyBR(p.avg_ticket)+' · no-show '+Number(p.no_show_rate||0).toFixed(1)+'%</small></div><div><strong>'+moneyBR(p.revenue)+'</strong><small>meta '+(revTarget?moneyBR(revTarget):"não definida")+' · '+staffProgress(p.revenue,revTarget)+'</small></div><span class="status '+(revTarget&&p.revenue>=revTarget?"paid":"pending")+'">'+(apTarget?staffProgress(p.appointments,apTarget)+" atend.":"sem meta")+'</span></div>';
    }).join("")||'<p class="muted">Sem dados de equipe.</p>';
    const type={day_off:"Folga",vacation:"Férias",medical:"Saúde",personal:"Pessoal",training:"Treinamento"};
    $("#staffTimeOffList").innerHTML=d.time_off.slice(0,80).map(o=>'<div class="tableRow"><div><strong>'+esc(o.professional_name)+'</strong><small>'+(type[o.type]||o.type)+(o.notes?' · '+esc(o.notes):'')+'</small></div><div><strong>'+o.start_date+(o.end_date!==o.start_date?' → '+o.end_date:'')+'</strong><small>'+o.status+'</small></div><span class="status '+(o.status==="approved"?"paid":"pending")+'">'+(o.status==="approved"?"bloqueado":"pendente")+'</span></div>').join("")||'<p class="muted">Nenhuma folga/ausência registrada.</p>';
    $$("[data-staff-manage]").forEach(b=>b.onclick=()=>openStaffManage(b.dataset.staffManage));
    const timeBtn=$('#team [data-open="timeOffModal"]');if(timeBtn)timeBtn.style.display=can?"":"none";
  }catch(err){if(err.status!==403&&err.status!==401)toast("Não foi possível carregar a gestão da equipe")}
}
async function openStaffManage(pid){
  try{
    const schedule=await api("/api/staff/"+pid+"/schedule"),metric=state.staffOverview?.metrics?.find(x=>x.id===pid),period=$("#staffPeriod").value;
    const f=$("#staffManageForm");f.elements.professional_id.value=pid;f.elements.period.value=period;$("#staffManageName").textContent=metric?.name||"Profissional";
    const g=metric?.goal||{};f.elements.target_revenue.value=g.target_revenue||"";f.elements.target_appointments.value=g.target_appointments||"";f.elements.target_avg_ticket.value=g.target_avg_ticket||"";f.elements.target_no_show_pct.value=g.target_no_show_pct||"";
    $("#staffScheduleGrid").innerHTML=schedule.map(d=>'<div class="staffDayRow" data-weekday="'+d.weekday+'"><label class="staffDayToggle"><input class="staffActive" type="checkbox" '+(d.active?"checked":"")+'> '+staffDayNames[d.weekday]+'</label><input class="staffStart" type="time" value="'+d.start_time+'"><span>até</span><input class="staffEnd" type="time" value="'+d.end_time+'"><small>'+(d.source==="default"?"padrão":"personalizado")+'</small></div>').join("");
    $("#staffManageModal").showModal();
  }catch{toast("Não foi possível abrir a escala")}
}
$("#staffPeriod").onchange=loadStaff;
$("#staffManageForm").onsubmit=async e=>{
  e.preventDefault();const f=e.target,pid=f.elements.professional_id.value,period=f.elements.period.value;
  const days=$$(".staffDayRow",f).map(r=>({weekday:Number(r.dataset.weekday),active:$(".staffActive",r).checked,start_time:$(".staffStart",r).value,end_time:$(".staffEnd",r).value}));
  const goal={period,target_revenue:Number(f.elements.target_revenue.value||0),target_appointments:Number(f.elements.target_appointments.value||0),target_avg_ticket:Number(f.elements.target_avg_ticket.value||0),target_no_show_pct:Number(f.elements.target_no_show_pct.value||0)};
  try{await api("/api/staff/"+pid+"/schedule",{method:"PUT",body:JSON.stringify({days})});await api("/api/staff/"+pid+"/goal",{method:"PUT",body:JSON.stringify(goal)});$("#staffManageModal").close();await loadStaff();toast("Escala e meta atualizadas")}catch{toast("Não foi possível salvar a gestão da profissional")}
};
$("#timeOffForm").onsubmit=async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target));if(!b.end_date)b.end_date=b.start_date;
  try{await api("/api/staff/time-off",{method:"POST",body:JSON.stringify(b)});e.target.reset();$("#timeOffModal").close();await loadStaff();toast("Período bloqueado na agenda")}catch{toast("Não foi possível registrar a ausência")}
};

function retailCanManage(){return ["owner","manager"].includes(state.user?.role)}
function fillRetailPeople(){
  const c=$("#retailClient"),p=$("#retailProfessional");
  if(c)c.innerHTML='<option value="">Venda balcão</option>'+state.clients.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join("");
  if(p)p.innerHTML='<option value="">Sem comissão</option>'+state.professionals.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join("");
}
function retailRow(selected="",qty=1){
  return '<div class="retailRow"><select class="retailProduct"><option value="">Produto…</option>'+(state.retailProducts||[]).map(p=>'<option value="'+p.id+'" '+(p.id===selected?'selected':'')+'>'+esc(p.name)+' · '+moneyBR(p.sale_price)+' · estoque '+Number(p.stock_qty).toLocaleString("pt-BR")+'</option>').join("")+'</select><input class="retailQty" type="number" step="0.01" min="0.01" value="'+qty+'"><button type="button" class="x retailRemove">×</button></div>';
}
function bindRetailRows(){$$(".retailRemove").forEach(b=>b.onclick=()=>b.closest(".retailRow").remove())}
function openRetailConfig(id){
  const p=(state.allProducts||[]).find(x=>x.id===id);if(!p)return;
  const f=$("#retailConfigForm");f.elements.product_id.value=id;f.elements.sale_price.value=Number(p.sale_price||0);f.elements.sale_commission_pct.value=Number(p.sale_commission_pct||0);$("#retailConfigName").textContent=p.name;$("#retailConfigModal").showModal();
}
async function loadRetail(){
  try{
    const [ov,products,sales,allProducts]=await Promise.all([api("/api/retail/overview"),api("/api/retail/products"),api("/api/retail/sales"),api("/api/products")]);
    state.retailProducts=products;state.allProducts=allProducts;
    $("#rtSales").textContent=ov.sales;$("#rtRevenue").textContent=moneyBR(ov.revenue);$("#rtMargin").textContent=moneyBR(ov.gross_margin);$("#rtMarginPct").textContent=Number(ov.gross_margin_pct||0).toFixed(1)+"% antes de comissão";$("#rtUnits").textContent=Number(ov.units||0).toLocaleString("pt-BR");
    const can=retailCanManage();
    $("#retailProductList").innerHTML=allProducts.map(p=>'<article><div class="panelhead"><span class="chip">'+esc(p.unit)+'</span>'+(Number(p.sale_price||0)>0?'<span class="status paid">à venda</span>':'<span class="status pending">sem preço</span>')+'</div><h3>'+esc(p.name)+'</h3><p>Estoque '+Number(p.stock_qty).toLocaleString("pt-BR")+' '+esc(p.unit)+' · custo '+moneyBR(p.avg_cost)+'</p><strong>'+(Number(p.sale_price||0)>0?moneyBR(p.sale_price):"Não configurado")+'</strong><p>Comissão '+Number(p.sale_commission_pct||0).toFixed(1)+'%</p>'+(can?'<button type="button" class="secondary smallBtn" data-retail-config="'+p.id+'">Configurar revenda</button>':'')+'</article>').join("")||'<p class="muted">Nenhum produto cadastrado.</p>';
    $("#retailSalesList").innerHTML=sales.slice(0,60).map(s=>'<div class="tableRow"><div><strong>'+(s.client_name?esc(s.client_name):"Venda balcão")+'</strong><small>'+s.item_count+' item(ns) · '+(s.professional_name?esc(s.professional_name)+' · ':'')+dateTimeBR(s.created_at)+'</small></div><strong>'+moneyBR(s.total)+'</strong><span class="chip">'+s.payment_method+'</span></div>').join("")||'<p class="muted">Nenhuma venda de produtos ainda.</p>';
    $$("[data-retail-config]").forEach(b=>b.onclick=()=>openRetailConfig(b.dataset.retailConfig));
    fillRetailPeople();
  }catch(err){if(err.status!==401&&err.status!==403)toast("Não foi possível carregar o PDV")}
}
$("#addRetailRow").onclick=()=>{$("#retailRows").insertAdjacentHTML("beforeend",retailRow());bindRetailRows()};
$('[data-open="retailSaleModal"]').addEventListener("click",()=>{fillRetailPeople();if(!$("#retailRows").children.length)$("#retailRows").innerHTML=retailRow();bindRetailRows()});
$("#retailConfigForm").onsubmit=async e=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.target)),id=b.product_id;delete b.product_id;
  try{await api("/api/products/"+id+"/retail",{method:"PATCH",body:JSON.stringify(b)});$("#retailConfigModal").close();await loadRetail();toast("Revenda configurada")}catch(err){toast(err.status===403?"Seu perfil não altera regras comerciais":"Não foi possível configurar o produto")}
};
$("#retailSaleForm").onsubmit=async e=>{
  e.preventDefault();const base=Object.fromEntries(new FormData(e.target)),items=$$(".retailRow",e.target).map(r=>({product_id:$(".retailProduct",r).value,qty:Number($(".retailQty",r).value||0)})).filter(x=>x.product_id&&x.qty>0);
  try{const out=await api("/api/retail/sales",{method:"POST",body:JSON.stringify({...base,items})});e.target.reset();$("#retailRows").innerHTML="";$("#retailSaleModal").close();await loadRetail();await loadFinance();toast("Venda registrada · "+moneyBR(out.total)+" · margem "+moneyBR(out.gross_margin))}catch(err){const c=err.data?.error;toast(c==="insufficient_stock"?"Estoque insuficiente para um dos produtos":c==="cash_session_required"?"Abra o caixa antes de receber em dinheiro":c==="sale_price_required"?"Configure o preço de revenda":"Não foi possível finalizar a venda")}
};

function localDateInput(d=new Date()){
  const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,"0"),day=String(d.getDate()).padStart(2,"0");
  return y+"-"+m+"-"+day;
}
function reportRange(){
  const to=$("#reportTo")?.value||localDateInput(),from=$("#reportFrom")?.value||localDateInput(new Date(Date.now()-29*86400000));
  return {from,to};
}
function reportUrl(path){
  const r=reportRange();return path+(path.includes("?")?"&":"?")+"from="+encodeURIComponent(r.from)+"&to="+encodeURIComponent(r.to);
}
function executiveReportText(d){
  const bits=[];
  bits.push((d.net>=0?"O período fechou positivo em ":"O período fechou negativo em ")+moneyBR(Math.abs(d.net))+".");
  bits.push("Entraram "+moneyBR(d.income)+" e saíram "+moneyBR(d.expenses)+".");
  if(d.services?.package_consumption>0)bits.push("Além do caixa, houve "+moneyBR(d.services.package_consumption)+" de serviços consumidos por créditos de pacotes — esse valor não foi contado novamente como entrada.");
  if(d.retail?.revenue>0)bits.push("O PDV respondeu por "+moneyBR(d.retail.revenue)+" em vendas de produtos.");
  if(d.packages?.revenue>0)bits.push("Foram vendidos "+d.packages.count+" pacote(s), somando "+moneyBR(d.packages.revenue)+".");
  if(d.commissions>0)bits.push("As comissões geradas no período somaram "+moneyBR(d.commissions)+".");
  return bits.join(" ");
}
async function loadReports(){
  const can=["owner","manager"].includes(state.user?.role);
  if(!can){toast("Relatórios gerenciais disponíveis para proprietária/gerência");return}
  if($("#reportTo")&&!$("#reportTo").value)$("#reportTo").value=localDateInput();
  if($("#reportFrom")&&!$("#reportFrom").value)$("#reportFrom").value=localDateInput(new Date(Date.now()-29*86400000));
  try{
    const d=await api(reportUrl("/api/reports/summary"));
    $("#repIncome").textContent=moneyBR(d.income);$("#repExpense").textContent=moneyBR(d.expenses);$("#repNet").textContent=moneyBR(d.net);$("#repCommission").textContent=moneyBR(d.commissions);
    $("#reportComposition").innerHTML=[
      ["Serviços recebidos no período",moneyBR(d.services?.revenue||0),(d.services?.count||0)+" atendimentos"],
      ["Consumo econômico de pacotes",moneyBR(d.services?.package_consumption||0),"não soma novamente no caixa"],
      ["Vendas de produtos",moneyBR(d.retail?.revenue||0),(d.retail?.count||0)+" vendas"],
      ["Venda de pacotes",moneyBR(d.packages?.revenue||0),(d.packages?.count||0)+" pacotes"]
    ].map(x=>'<div class="row"><div><strong>'+x[0]+'</strong><small>'+x[2]+'</small></div><strong>'+x[1]+'</strong></div>').join("");
    $("#reportExecutive").textContent=executiveReportText(d);
  }catch(err){if(err.status!==401&&err.status!==403)toast("Não foi possível carregar o relatório")}
}
$("#reportRefresh").onclick=loadReports;
$("#reportFrom").onchange=loadReports;$("#reportTo").onchange=loadReports;
$$("[data-report-export]").forEach(b=>b.onclick=()=>{
  const type=b.dataset.reportExport,r=reportRange(),a=document.createElement("a");
  a.href="/api/reports/export?type="+encodeURIComponent(type)+"&from="+encodeURIComponent(r.from)+"&to="+encodeURIComponent(r.to);
  a.download="";document.body.appendChild(a);a.click();a.remove();
});
