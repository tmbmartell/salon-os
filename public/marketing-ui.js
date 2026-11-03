/* NOVAGENTE Estética — marketing progressivo, sem envio automático.
   Todos os materiais são privados e permanecem sob o controle do salão. */
(() => {
  "use strict";
  const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
  const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const toast=s=>{const el=$("#toast");if(!el)return;el.textContent=s;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3200)};
  const state={assets:[],campaigns:[],rules:[],services:[],canWrite:false};
  const paths={assets:"/api/marketing/assets",campaigns:"/api/marketing/campaigns",rules:"/api/marketing/followup-rules"};
  async function api(url,options={}){
    const response=await fetch(url,{credentials:"same-origin",...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Não foi possível carregar esta informação.");
    return data;
  }
  function tab(name){
    $$("[data-marketing-tab]").forEach(button=>{
      const match=button.dataset.marketingTab===name;
      button.classList.toggle("is-active",match);button.setAttribute("aria-pressed",String(match));
    });
    $$("[data-marketing-panel]").forEach(section=>section.classList.toggle("hidden",section.dataset.marketingPanel!==name));
  }
  $$("[data-marketing-tab]").forEach(b=>b.addEventListener("click",()=>tab(b.dataset.marketingTab)));
  function image(asset){
    if(!asset)return '<span class="ne-marketing-placeholder">▣</span>';
    return '<img loading="lazy" alt="'+esc(asset.name)+'" src="'+esc(asset.content_url)+'">';
  }
  function listCampaigns(target,list){
    const node=$("#"+target);
    node.innerHTML=list.map(c=>{
      const asset=state.assets.find(a=>a.id===c.media_id);
      const dates=[c.starts_at&&"A partir de "+new Date(c.starts_at).toLocaleDateString("pt-BR"),c.ends_at&&"Até "+new Date(c.ends_at).toLocaleDateString("pt-BR")].filter(Boolean).join(" · ");
      const status={draft:"Rascunho",ready:"Pronta para uso",archived:"Arquivada"}[c.status]||"";
      return '<details class="ne-marketing-entry"><summary>'+image(asset)+'<span class="ne-marketing-entry-text"><strong>'+esc(c.title)+'</strong><small>'+esc(status)+' · '+esc(c.category)+(dates?" · "+esc(dates):"")+'</small></span><span aria-hidden="true">⌄</span></summary><div class="ne-marketing-entry-details"><p>'+esc(c.message||"Sem mensagem cadastrada")+'</p>'+
        (state.canWrite?'<div class="ne-marketing-entry-buttons">'+(c.status!=="ready"?'<button type="button" class="secondary" data-ne-campaign-status="'+esc(c.id)+'" data-status="ready">Marcar pronta</button>':"")+
        (c.status!=="archived"?'<button type="button" class="secondary" data-ne-campaign-status="'+esc(c.id)+'" data-status="archived">Arquivar</button>':"")+'</div>':"")+'</div></details>';
    }).join("")||'<p class="muted">Nenhum conteúdo cadastrado nesta categoria.</p>';
    $$("[data-ne-campaign-status]",node).forEach(b=>b.onclick=async()=>{
      try{await api(paths.campaigns+"/"+encodeURIComponent(b.dataset.neCampaignStatus),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:b.dataset.status})});await refresh();toast("Situação atualizada")}
      catch(e){toast(e.message)}
    });
  }
  function render(){
    listCampaigns("neCampaignList",state.campaigns.filter(x=>!["announcement","hours","holiday"].includes(x.category)));
    listCampaigns("neAnnouncementList",state.campaigns.filter(x=>["announcement","hours","holiday"].includes(x.category)));
    $("#neMediaList").innerHTML=state.assets.map(a=>'<details class="ne-marketing-entry"><summary>'+image(a)+'<span class="ne-marketing-entry-text"><strong>'+esc(a.name)+'</strong><small>'+esc(a.mime)+' · '+(Number(a.bytes)/1024).toFixed(0)+' KB</small></span><span aria-hidden="true">⌄</span></summary><div class="ne-marketing-entry-details"><p>Imagem privada da biblioteca. Não enviada a clientes.</p></div></details>').join("")||'<p class="muted">Nenhuma imagem cadastrada.</p>';
    $("#neFollowupList").innerHTML=state.rules.map(rule=>
      '<details class="ne-marketing-entry"><summary><span class="ne-marketing-placeholder">↻</span><span class="ne-marketing-entry-text"><strong>'+esc(rule.service_name)+'</strong><small>'+Number(rule.delay_hours)+' h após o atendimento · '+(rule.enabled?"Ativa":"Desativada")+'</small></span><span aria-hidden="true">⌄</span></summary><div class="ne-marketing-entry-details"><p>'+esc(rule.template)+'</p>'+
      (state.canWrite?'<button type="button" class="secondary" data-ne-followup-edit="'+esc(rule.service_id)+'">Editar regra</button>':"")+'</div></details>'
    ).join("")||'<p class="muted">Nenhuma regra configurada. O sistema mantém as tarefas genéricas existentes até você criar uma regra específica.</p>';
    $$("[data-ne-followup-edit]").forEach(b=>b.onclick=()=>{
      const rule=state.rules.find(r=>r.service_id===b.dataset.neFollowupEdit);
      if(!rule)return;
      const form=$("#neFollowupForm");form.reset();
      form.elements.service_id.value=rule.service_id;
      form.elements.delay_hours.value=rule.delay_hours;
      form.elements.template.value=rule.template;
      form.elements.enabled.checked=!!rule.enabled;
      $("#neFollowupModal").showModal();
    });
    $("#neCampaignMedia").innerHTML='<option value="">Sem mídia</option>'+state.assets.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>').join("");
    $("#neFollowupService").innerHTML='<option value="">Escolha o serviço</option>'+state.services.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join("");
    for(const id of ["neNewCampaign","neNewMedia","neNewFollowup","neNewAnnouncement"]){const button=$("#"+id);if(button)button.hidden=!state.canWrite}
  }
  async function refresh(){
    const [assets,campaigns,rules]=await Promise.all([api(paths.assets),api(paths.campaigns),api(paths.rules)]);
    state.assets=assets;state.campaigns=campaigns;state.rules=rules;render();
  }
  let loading=false;
  async function load(){
    if(loading)return;loading=true;
    try{
      const [boot,auth]=await Promise.all([api("/api/bootstrap"),api("/api/auth/me")]);
      state.services=boot.services||[];
      state.canWrite=["owner","manager"].includes(auth.user?.role);
      await refresh();
    }catch(e){toast(e.message)}
    finally{loading=false}
  }
  $("#neNewCampaign").onclick=()=>{const form=$("#neCampaignForm");form.reset();form.elements.category.value="promotion";$("#neCampaignModal").showModal()};
  $("#neNewAnnouncement").onclick=()=>{const form=$("#neCampaignForm");form.reset();form.elements.category.value="announcement";$("#neCampaignModal").showModal()};
  $("#neNewMedia").onclick=()=>{$("#neMediaForm").reset();$("#neMediaModal").showModal()};
  $("#neNewFollowup").onclick=()=>{$("#neFollowupForm").reset();$("#neFollowupModal").showModal()};
  $("#neCampaignForm").onsubmit=async e=>{
    e.preventDefault();const form=e.target;
    const body=Object.fromEntries(new FormData(form));
    try{
      await api(paths.campaigns,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      $("#neCampaignModal").close();form.reset();await refresh();toast("Campanha salva. Nenhuma mensagem foi enviada.");
    }catch(err){toast(err.message)}
  };
  $("#neMediaForm").onsubmit=async e=>{
    e.preventDefault();const form=e.target,file=form.elements.media.files?.[0];
    if(!file){toast("Escolha uma imagem.");return}
    if(!["image/jpeg","image/png","image/webp","image/gif"].includes(file.type)){toast("Formato não permitido");return}
    if(file.size>3*1024*1024){toast("A imagem deve ter até 3 MB.");return}
    const button=form.querySelector('button[type="submit"]');button.disabled=true;
    try{
      const name=encodeURIComponent(file.name).slice(0,450);
      await api(paths.assets,{method:"POST",headers:{"content-type":file.type,"x-media-name":name},body:file});
      $("#neMediaModal").close();form.reset();await refresh();toast("Imagem salva na biblioteca privada.");
    }catch(err){toast(err.message)}
    finally{button.disabled=false}
  };
  $("#neFollowupForm").onsubmit=async e=>{
    e.preventDefault();const form=e.target,body=Object.fromEntries(new FormData(form));
    body.delay_hours=Number(body.delay_hours);
    body.enabled=form.elements.enabled.checked;
    try{
      await api(paths.rules,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      $("#neFollowupModal").close();form.reset();await refresh();toast("Regra salva. Somente tarefas internas serão geradas.");
    }catch(err){toast(err.message)}
  };
  window.addEventListener("ne:marketing-open",load);
})();