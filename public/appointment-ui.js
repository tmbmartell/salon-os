export function setupAppointmentUi({getState,api,esc,fmt,$,$$}){
  const ui={selectedTags:new Set(),autoTags:new Set()};
  const state=()=>getState();
  function serviceOptions(selected=""){
    return '<option value="">Selecione…</option>'+state().services.map(x=>'<option value="'+x.id+'" '+(x.id===selected?'selected':'')+'>'+esc(x.name)+' · '+fmt.format(x.price)+'</option>').join("")+'<option value="__custom__">+ Serviço avulso</option>';
  }
  function professionalOptions(selected=""){
    return '<option value="">Selecione…</option>'+state().professionals.map(x=>'<option value="'+x.id+'" '+(x.id===selected?'selected':'')+'>'+esc(x.name)+'</option>').join("");
  }
  function renderTags(){
    $$("[data-ap-tag]").forEach(b=>{b.classList.toggle("selected",ui.selectedTags.has(b.dataset.apTag));b.classList.toggle("autoTag",ui.autoTags.has(b.dataset.apTag))});
  }
  async function refreshSuggestions(){
    const client=$("#apClient")?.value||"",service=$("#apService")?.value||"";
    if(!client&&!service)return;
    try{
      const out=await api("/api/appointments/tag-suggestions?client_id="+encodeURIComponent(client)+"&service_id="+encodeURIComponent(service));
      for(const t of ui.autoTags)ui.selectedTags.delete(t);
      ui.autoTags=new Set(out.tags||[]);
      for(const t of ui.autoTags)ui.selectedTags.add(t);
      renderTags();
    }catch{}
  }
  function rowHtml(data={}){
    const custom=data.service_id==="__custom__"||!!data.custom_name;
    return '<div class="appointmentExtraRow">'+
      '<div class="extraServiceMain"><label>Serviço<select class="extraService">'+serviceOptions(custom?"__custom__":(data.service_id||""))+'</select></label>'+
      '<div class="customServiceFields '+(custom?"":"hidden")+'"><input class="extraCustomName" placeholder="Nome do serviço avulso" value="'+esc(data.custom_name||"")+'"><input class="extraCustomDuration" type="number" min="5" max="480" step="5" placeholder="Duração (min)" value="'+esc(data.custom_duration||"")+'"><input class="extraCustomPrice" type="number" min="0" step="0.01" placeholder="Valor (R$)" value="'+esc(data.custom_price||"")+'"></div></div>'+
      '<label>Qtd.<input class="extraQty" type="number" min="1" max="20" value="'+Number(data.qty||1)+'"></label>'+
      '<label>Profissional<select class="extraProfessional">'+professionalOptions(data.professional_id||$("#apProfessional")?.value||"")+'</select></label>'+
      '<button type="button" class="x extraRemove" title="Remover">×</button>'+
    '</div>';
  }
  function items(){
    return $$(".appointmentExtraRow").map(row=>{
      const service=$(".extraService",row).value,custom=service==="__custom__";
      return {service_id:custom?"":service,is_custom:custom,custom_name:custom?$(".extraCustomName",row).value.trim():"",custom_duration:custom?Number($(".extraCustomDuration",row).value||0):0,custom_price:custom?Number($(".extraCustomPrice",row).value||0):0,qty:Number($(".extraQty",row).value||1),professional_id:$(".extraProfessional",row).value};
    }).filter(x=>x.professional_id&&(x.service_id||x.is_custom));
  }
  function refreshSummary(){
    const counts=new Map(),primary=$("#apProfessional")?.value;
    if(primary)counts.set(primary,(counts.get(primary)||0)+1);
    for(const x of items())counts.set(x.professional_id,(counts.get(x.professional_id)||0)+Math.max(1,Number(x.qty||1)));
    const html=[...counts].map(([pid,n])=>{const p=state().professionals.find(x=>x.id===pid);return '<span class="professionalCountChip"><strong>'+esc(p?.name||"Profissional")+'</strong><small>'+n+' '+(n===1?'serviço':'serviços')+'</small></span>'}).join("");
    const target=$("#apProfessionalSummary");if(target)target.innerHTML=html||'<span class="muted">Selecione os profissionais dos serviços.</span>';
  }
  function bindRows(){
    $$(".appointmentExtraRow").forEach(row=>{
      $(".extraService",row).onchange=e=>{$(".customServiceFields",row).classList.toggle("hidden",e.target.value!=="__custom__");refreshSummary()};
      $(".extraQty",row).oninput=refreshSummary;
      $(".extraProfessional",row).onchange=refreshSummary;
      $(".extraRemove",row).onclick=()=>{row.remove();refreshSummary()};
    });
  }
  function addItem(data={}){
    $("#appointmentExtraServices").insertAdjacentHTML("beforeend",rowHtml(data));bindRows();refreshSummary();
  }
  function reset(){
    ui.selectedTags.clear();ui.autoTags.clear();
    const box=$("#appointmentExtraServices");if(box)box.innerHTML="";
    renderTags();refreshSummary();
  }
  $("#addAppointmentService")?.addEventListener("click",()=>addItem());
  $$("[data-ap-tag]").forEach(b=>b.addEventListener("click",()=>{const t=b.dataset.apTag;if(ui.autoTags.has(t))return;ui.selectedTags.has(t)?ui.selectedTags.delete(t):ui.selectedTags.add(t);renderTags()}));
  $("#addAppointmentTag")?.addEventListener("click",()=>{
    const tag=window.prompt("Nome da nova tag:");
    if(!tag||!tag.trim())return;
    const clean=tag.trim().slice(0,40);ui.selectedTags.add(clean);
    const btn=document.createElement("button");btn.type="button";btn.dataset.apTag=clean;btn.textContent=clean;
    btn.addEventListener("click",()=>{ui.selectedTags.has(clean)?ui.selectedTags.delete(clean):ui.selectedTags.add(clean);renderTags()});
    $("#addAppointmentTag").before(btn);renderTags();
  });
  $("#apClient")?.addEventListener("change",refreshSuggestions);
  $("#apService")?.addEventListener("change",refreshSuggestions);
  $("#apProfessional")?.addEventListener("change",refreshSummary);
  $("#appointmentModal")?.addEventListener("close",reset);
  reset();
  return {items,tags:()=>[...ui.selectedTags],reset,refreshSuggestions,refreshSummary,addItem};
}
