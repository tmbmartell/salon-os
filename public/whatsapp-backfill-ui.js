// Histórico WhatsApp: uma página no servidor por operação, até 10 por ação.
// Nenhuma mensagem é enviada ao cliente. Sem "percentual" inventado.
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const block=$("whatsappBackfillDetails");
  if(!block)return;
  let job=null,processing=false,stopRequested=false;
  const state=$("neBackfillStatus"),start=$("neBackfillStart"),step=$("neBackfillStep"),
    pause=$("neBackfillPause"),resume=$("neBackfillResume"),date=$("neBackfillDate");
  async function api(path,{method="GET",body}={}){
    const init={method,credentials:"same-origin",headers:{}};
    if(body!==undefined){init.headers["content-type"]="application/json";init.body=JSON.stringify(body)}
    const response=await fetch("/api/whatsapp/backfill/"+path,init);
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error||"Erro na importação"),{status:response.status});
    return data;
  }
  function display(message=""){
    if(!job){
      state.textContent=message||"Nenhuma importação iniciada. Selecione a data e clique em Iniciar.";
    }else{
      const label={running:"Em andamento",paused:"Pausada",completed:"Concluída no WAHA"}[job.status]||job.status;
      state.textContent=label+" · Desde "+job.from_date+
        " · "+Number(job.chats_processed||0)+" conversas percorridas"+
        " · "+Number(job.messages_scanned||0)+" mensagens examinadas"+
        " · "+Number(job.messages_imported||0)+" novas mensagens importadas"+
        " · "+Number(job.groups_skipped||0)+" conversas ignoradas"+
        (job.last_error?" · Último erro: "+job.last_error:"")+
        (message?" · "+message:"")+
        (job.status==="completed"?" · IMPORTANTE: o WAHA pode não disponibilizar todo o histórico.":"");
    }
    start.disabled=processing||!!job&&["running","paused"].includes(job.status);
    step.disabled=processing||job?.status!=="running";
    pause.disabled=job?.status!=="running";
    resume.disabled=processing||job?.status!=="paused";
    date.disabled=!!job&&["running","paused"].includes(job.status);
  }
  async function refresh(){
    try{job=(await api("status")).job;display()}
    catch(e){
      if(e.status===403){block.open=false;$("syncWhatsappHistory").hidden=true;return}
      state.textContent="Não foi possível consultar o progresso: "+e.message;
    }
  }
  async function startNew(){
    if(!date.value){state.textContent="Informe uma data inicial válida.";return}
    try{
      job=(await api("start",{method:"POST",body:{from_date:date.value,page_size:40}})).job;
      display("Iniciada. Clique em Processar até 10 páginas para importar.");
    }catch(e){state.textContent="Não foi possível iniciar: "+e.message;await refresh()}
  }
  async function processPages(){
    if(processing||job?.status!=="running")return;
    processing=true;stopRequested=false;display("Processando páginas...");
    let pages=0;
    try{
      for(;pages<10&&!stopRequested;pages++){
        const result=await api("step",{method:"POST"});
        job=result.job;
        display("Lote atual: "+(pages+1)+" de 10 páginas.");
        if(job.status!=="running")break;
      }
      if(pages>0||job?.status==="completed")$("refreshInbox")?.click();
      display(job.status==="completed"?"Importação finalizada nas páginas disponíveis.":"Lote encerrado. É possível continuar mais tarde.");
    }catch(e){
      state.textContent="Importação interrompida: "+e.message+". O progresso salvo permanece disponível.";
      await refresh();
    }finally{processing=false;display()}
  }
  async function pauseJob(){
    stopRequested=true;
    try{job=(await api("pause",{method:"POST"})).job;display("Pausada. O progresso já salvo foi mantido.")}
    catch(e){state.textContent="Não foi possível pausar: "+e.message;await refresh()}
  }
  async function resumeJob(){
    try{job=(await api("resume",{method:"POST"})).job;display("Retomada. Clique para processar o próximo lote.")}
    catch(e){state.textContent="Não foi possível retomar: "+e.message;await refresh()}
  }
  start.addEventListener("click",startNew);
  step.addEventListener("click",processPages);
  pause.addEventListener("click",pauseJob);
  resume.addEventListener("click",resumeJob);
  block.addEventListener("toggle",()=>{if(block.open)refresh()});
  window.addEventListener("ne:backfill-open",refresh);
  display();
})();