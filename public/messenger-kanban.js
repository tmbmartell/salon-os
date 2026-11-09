/* NOVAGENTE Estética — Kanban da Mensageria.
 * Camada visual: preserva APIs existentes, classificação manual e atendimento.
 * Sem mensagens automáticas ou mudanças de banco.
 */
(() => {
  "use strict";
  const byId=id=>document.getElementById(id);
  const cfg=[
    {id:"new",title:"Novos",subtitle:"Primeiro contato",categories:["general","other"],destination:"general",symbol:"◌"},
    {id:"warming",title:"Aquecendo",subtitle:"Conhecendo os serviços",categories:["lead","vip"],destination:"lead",symbol:"↗"},
    {id:"appointment",title:"Quer agendar",subtitle:"Prontos para marcar",categories:["appointment"],destination:"appointment",symbol:"◷"},
    {id:"attention",title:"Precisa de atenção",subtitle:"Atendimento humano ou pendência",categories:["waiting","complaint","finance"],destination:"waiting",symbol:"!"},
    {id:"aftersale",title:"Pós-venda",subtitle:"Relacionamento e retorno",categories:["post_sale"],destination:"post_sale",symbol:"♡"}
  ];
  const categoryNames={general:"Novo",lead:"Aquecendo",vip:"VIP",appointment:"Quer agendar",
    waiting:"Aguardando",complaint:"Reclamação",finance:"Financeiro",post_sale:"Pós-venda",other:"Outro"};
  let mode="board",inConversation=false,items=[],loading=false;
  const laneOf=c=>cfg.find(l=>l.categories.includes(c.category))||cfg[0];
  const text=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=value;return el;};
  const localeTime=value=>{
    if(!value)return "";
    const d=new Date(value);if(!Number.isFinite(d.valueOf()))return "";
    return d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" · "+
      d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  };
  const countSummary=()=>{
    const all=items.length;
    byId("neKanbanSummary").textContent=all+" conversa"+(all===1?"":"s")+" nos filtros atuais"+
      " · Clique em um cartão para abrir o atendimento.";
  };
  function card(c){
    const article=document.createElement("article");
    article.className="ne-kanban-card";
    article.dataset.id=c.id;
    article.draggable=true;
    article.setAttribute("aria-label","Lead "+(c.client_name||"Cliente")+" — "+(categoryNames[c.category]||"Novo"));
    article.addEventListener("dragstart",event=>{
      event.dataTransfer.setData("text/plain",String(c.id));
      event.dataTransfer.effectAllowed="move";article.classList.add("is-dragging");
    });
    article.addEventListener("dragend",()=>article.classList.remove("is-dragging"));
    const open=document.createElement("button");open.type="button";open.className="ne-kanban-card-open";
    open.setAttribute("aria-label","Abrir conversa de "+(c.client_name||"Cliente"));
    const header=text("div","ne-kanban-card-header","");
    const initials=(c.client_name||"C").trim().slice(0,1).toUpperCase();
    header.append(text("span","ne-kanban-avatar",initials),text("strong","ne-kanban-name",c.client_name||"Cliente"),
      text("time","ne-kanban-time",localeTime(c.last_message_created_at||c.last_message_at)));
    const channel=(c.channel||"whatsapp").toLowerCase();
    const channelLabel=channel==="instagram"?"Instagram":channel==="whatsapp"?"WhatsApp":channel;
    const channelRow=text("div","ne-kanban-card-channel",channelLabel+(c.handling_mode==="ai"?" · IA":" · Humano"));
    if(c.priority==="urgent"||c.priority==="high")channelRow.append(text("span","ne-kanban-priority",c.priority==="urgent"?"Urgente":"Prioridade alta"));
    const snippet=text("p","ne-kanban-preview",c.last_message||"Ainda não há mensagem");
    const footer=text("div","ne-kanban-card-footer","");
    const needReply=Number(c.unread_count)>0||c.last_message_direction==="in";
    footer.append(text("span",needReply?"ne-kanban-unread":"ne-kanban-answered",needReply?"● Precisa responder":"✓ Em acompanhamento"));
    if(Number(c.unread_count)>0)footer.append(text("span","ne-kanban-count",String(c.unread_count)+" não lida(s)"));
    open.append(header,channelRow,snippet,footer);
    open.addEventListener("click",()=>openConversation(c.id));
    const move=text("div","ne-kanban-move","");
    const label=text("label","", "Mover para");
    const select=document.createElement("select");select.setAttribute("aria-label","Mover "+(c.client_name||"Cliente")+" para outra etapa");
    for(const l of cfg){const option=new Option(l.title,l.destination);select.add(option)}
    select.value=laneOf(c).destination;
    select.addEventListener("change",async()=>{await moveConversation(c.id,select.value,select)});
    move.append(label,select);article.append(open,move);
    return article;
  }
  function render(){
    const board=byId("neMessengerBoard");if(!board)return;
    board.replaceChildren();
    countSummary();
    for(const lane of cfg){
      const section=document.createElement("section");section.className="ne-kanban-lane ne-kanban-lane-"+lane.id;
      section.dataset.lane=lane.id;section.setAttribute("aria-label",lane.title);
      const records=items.filter(c=>laneOf(c).id===lane.id);
      const head=text("div","ne-kanban-lane-head","");
      const top=text("div","ne-kanban-lane-heading","");
      top.append(text("span","ne-kanban-symbol",lane.symbol),text("strong","",lane.title));
      head.append(top,text("span","ne-kanban-lane-count",String(records.length)));
      head.append(text("small","",lane.subtitle));
      const stack=text("div","ne-kanban-lane-stack","");
      for(const item of records)stack.append(card(item));
      if(!records.length)stack.append(text("p","ne-kanban-empty","Nenhum contato nesta etapa."));
      section.append(head,stack);
      section.addEventListener("dragover",e=>{e.preventDefault();section.classList.add("drag-target");e.dataTransfer.dropEffect="move"});
      section.addEventListener("dragleave",e=>{if(!section.contains(e.relatedTarget))section.classList.remove("drag-target")});
      section.addEventListener("drop",e=>{
        e.preventDefault();section.classList.remove("drag-target");
        const cid=e.dataTransfer.getData("text/plain");
        if(cid)moveConversation(cid,lane.destination);
      });
      board.append(section);
    }
  }
  async function moveConversation(id,category,control){
    if(loading)return;
    const c=items.find(x=>String(x.id)===String(id));if(!c||c.category===category)return;
    if(!window.neKanbanActions?.moveCategory)return;
    loading=true;if(control)control.disabled=true;
    try{
      await window.neKanbanActions.moveCategory(String(id),category);
      // A ação principal atualiza os dados e chama render() novamente.
    }catch{
      const notice=byId("neKanbanSummary");
      if(notice)notice.textContent="Não foi possível mover. A categoria original foi mantida.";
      if(control)control.value=laneOf(c).destination;
    }finally{loading=false;if(control)control.disabled=false}
  }
  async function openConversation(id){
    if(!window.neKanbanActions?.open)return;
    inConversation=true;sync();
    try{
      await window.neKanbanActions.open(String(id));
      byId("neMessengerWorkspace")?.scrollIntoView({block:"start",behavior:"smooth"});
    }catch{
      inConversation=false;sync();
      const summary=byId("neKanbanSummary");if(summary)summary.textContent="Não foi possível abrir a conversa.";
    }
  }
  function sync(){
    const board=byId("neMessengerBoard"),workspace=byId("neMessengerWorkspace"),back=byId("neKanbanBack"),toggle=byId("neKanbanToggle");
    if(!board||!workspace)return;
    const showBoard=mode==="board"&&!inConversation;
    board.hidden=!showBoard;workspace.hidden=showBoard;
    workspace.classList.toggle("ne-kanban-chat-focus",mode==="board"&&inConversation);
    if(back)back.hidden=!(mode==="board"&&inConversation);
    if(toggle){toggle.textContent=mode==="board"?"Ver lista":"Ver Kanban";toggle.setAttribute("aria-pressed",String(mode==="list"))}
    byId("neKanbanSummary").hidden=mode==="list";
  }
  function init(){
    const root=byId("inbox");if(!root||byId("neKanbanToggle"))return;
    const header=root.querySelector(".sectionActions");
    const toggle=text("button","secondary","Ver lista");toggle.id="neKanbanToggle";toggle.type="button";
    toggle.onclick=()=>{mode=mode==="board"?"list":"board";inConversation=false;sync()};
    header?.prepend(toggle);
    const workspace=root.querySelector(".inboxGrid");
    if(!workspace)return;
    workspace.id="neMessengerWorkspace";
    const bar=text("div","ne-kanban-overview","");
    const intro=text("div","ne-kanban-intro","");
    intro.append(text("strong","","Seus atendimentos, organizados por etapa"),
      text("p","","Arraste um cartão ou use “Mover para”. Clique para conversar."));
    const back=text("button","secondary","← Voltar ao Kanban");
    back.id="neKanbanBack";back.type="button";
    back.onclick=()=>{inConversation=false;sync();byId("neMessengerBoard")?.scrollIntoView({block:"start"})};
    bar.append(intro,back);
    const summary=text("p","ne-kanban-summary","");summary.id="neKanbanSummary";summary.setAttribute("role","status");
    const board=text("div","ne-kanban-board","");board.id="neMessengerBoard";board.setAttribute("aria-label","Etapas do atendimento");
    workspace.before(bar,summary,board);
    sync();
    window.addEventListener("ne:kanban-conversations",event=>{items=Array.isArray(event.detail)?event.detail:[];render();sync()});
    window.neKanbanOnCategoryChanged=()=>{
      if(!items.length)return;render();sync();
    };
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
