/* NOVAGENTE Estética · WhatsApp session ownership only.
   Pairing, QR image, polling and QR messages are exclusively managed by app.js.
   Do not register prepareWaha/showQr/waQrImage handlers in this module. */
(() => {
  "use strict";
  const get=id=>document.getElementById(id);
  const form=get("neWhatsappSessionForm");
  if(!form)return;
  const input=get("neWhatsappSessionName");
  const note=get("neWhatsappMessage");
  let owner=false;

  async function call(path,options={}){
    const response=await fetch(path,{credentials:"same-origin",...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||"Falha ao consultar conexão");
    return data;
  }

  async function syncOwnership(){
    try{
      const me=await call("/api/auth/me");
      owner=me.user?.role==="owner";
      form.classList.toggle("hidden",!owner);
      if(!owner)return;
      const state=await call("/api/whatsapp/status");
      if(document.activeElement!==input)input.value=state.session||"";
    }catch{
      owner=false;
      form.classList.add("hidden");
    }
  }

  form.addEventListener("submit",async event=>{
    event.preventDefault();
    if(!owner||!form.reportValidity())return;
    const button=form.querySelector('button[type="submit"]');
    if(button)button.disabled=true;
    try{
      await call("/api/whatsapp/session/link",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({session:input.value.trim()})
      });
      await syncOwnership();
      // The single QR controller in app.js handles prepare/refresh and status.
      get("neWhatsappRefresh")?.click();
      if(note){
        note.textContent="Identificação exclusiva salva. Agora clique em Gerar QR Code.";
        note.classList.remove("ne-error");
      }
    }catch(error){
      if(note){
        note.textContent="Não foi possível vincular a sessão: "+String(error.message||error).slice(0,110);
        note.classList.add("ne-error");
      }
    }finally{
      if(button)button.disabled=false;
    }
  });
  document.addEventListener("click",event=>{
    if(event.target.closest('[data-view="inbox"],[data-jump="inbox"]'))syncOwnership();
  });
  syncOwnership();
})();