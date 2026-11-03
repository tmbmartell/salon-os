// MFA da equipe gestora: interface sob demanda, sem registrar segredos em storage/logs.
// Um segredo de aplicativo só aparece no momento de ativação; códigos de recuperação
// só aparecem na confirmação e devem ser guardados offline pelo titular.
(() => {
  "use strict";
  const admin=document.querySelector("#admin .ne-stage8-security");
  if(!admin)return;
  const element=(tag,text="",className="")=>{
    const node=document.createElement(tag);
    if(text)node.textContent=text;
    if(className)node.className=className;
    return node;
  };
  const panel=element("details","","ne-mfa-box");
  const title=element("summary","Verificação em duas etapas (MFA)");
  const area=element("div","","ne-mfa-content"),status=element("p","","ne-stage8-help");
  status.setAttribute("role","status");
  panel.append(title,area);
  admin.prepend(panel);
  async function api(route,{method="GET",body}={}){
    const options={method,credentials:"same-origin",headers:{"content-type":"application/json"}};
    if(body!==undefined)options.body=JSON.stringify(body);
    const r=await fetch("/api/auth/mfa/"+route,options);
    const data=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(data.error||"Falha na configuração MFA");
    return data;
  }
  const mkButton=(text,cb)=>{
    const b=element("button",text,"secondary");
    b.type="button";b.onclick=cb;return b;
  };
  const input=(label,type="text",autocomplete="off")=>{
    const wrap=element("label","","ne-mfa-field");
    const title=element("span",label),el=element("input");
    el.type=type;el.autocomplete=autocomplete;el.required=true;
    wrap.append(title,el);return {wrap,el};
  };
  function setNote(text){status.textContent=text}
  function showCodes(codes){
    area.replaceChildren(element("h3","Códigos de recuperação"));
    area.append(element("p","Guarde estes códigos em local seguro. Cada código só poderá ser usado uma vez; eles não aparecerão novamente.","ne-stage8-help"));
    const block=element("pre",codes.join("\n"),"ne-mfa-codes");
    area.append(block,mkButton("Copiar os códigos",async()=>{
      try{await navigator.clipboard.writeText(codes.join("\n"));setNote("Copiados. Guarde em local seguro.")}
      catch{setNote("Selecione e copie os códigos manualmente.")}
    }),mkButton("Já guardei os códigos",()=>load()));
    area.append(status);
  }
  async function begin(){
    area.replaceChildren(element("h3","Ativar a verificação em duas etapas"));
    area.append(element("p","Use um aplicativo autenticador compatível com TOTP. A senha confirma que você é o titular.","ne-stage8-help"));
    const secretInput=input("Confirme sua senha","password","current-password");
    const action=mkButton("Gerar chave do autenticador",async()=>{
      action.disabled=true;
      try{
        const response=await api("enroll",{method:"POST",body:{password:secretInput.el.value}});
        secretInput.el.value="";
        showEnroll(response);
      }catch(err){setNote(err.message);action.disabled=false}
    });
    area.append(secretInput.wrap,action,status);
  }
  function showEnroll(data){
    area.replaceChildren(element("h3","Cadastre no aplicativo"));
    area.append(element("p","Adicione a chave abaixo manualmente ao seu aplicativo autenticador. Depois digite o código de seis dígitos para ativar.","ne-stage8-help"));
    const secret=element("code",data.secret,"ne-mfa-secret");
    secret.setAttribute("aria-label","Chave de autenticação temporária");
    const code=input("Código de seis dígitos","text","one-time-code");
    code.el.inputMode="numeric";code.el.maxLength=6;code.el.pattern="[0-9]{6}";
    const action=mkButton("Confirmar e ativar MFA",async()=>{
      action.disabled=true;
      try{const out=await api("confirm",{method:"POST",body:{code:code.el.value}});
        secret.textContent="";code.el.value="";showCodes(out.recovery_codes);
      }catch(err){setNote(err.message);action.disabled=false}
    });
    area.append(secret,code.wrap,action,status);
  }
  function showEnabled(remaining){
    area.replaceChildren(element("h3","MFA ativado"));
    area.append(element("p","O próximo login exigirá o código do autenticador ou um código de recuperação. Restam "+remaining+" códigos de recuperação não utilizados.","ne-stage8-help"));
    const disable=element("details","","ne-mfa-danger");
    disable.append(element("summary","Desativar MFA"));
    const pw=input("Senha atual","password","current-password"),otp=input("Código autenticador ou recuperação");
    const action=mkButton("Desativar após confirmar",async()=>{
      if(!confirm("Desativar a segunda etapa de segurança desta conta?"))return;
      action.disabled=true;
      try{
        await api("disable",{method:"POST",body:{password:pw.el.value,code:otp.el.value}});
        pw.el.value="";otp.el.value="";setNote("MFA desativado.");await load();
      }catch(err){setNote(err.message);action.disabled=false}
    });
    disable.append(pw.wrap,otp.wrap,action);
    area.append(disable,status);
  }
  async function load(){
    area.replaceChildren(status);setNote("Consultando a segurança da sua conta...");
    try{
      const current=await api("status");
      if(!current.configured){
        setNote("O servidor ainda não tem NOVAGENTE_MFA_KEY configurada. A ativação só poderá ser feita após configurar a chave no ambiente.");
        return;
      }
      if(current.enabled)showEnabled(current.recovery_remaining);
      else await begin();
    }catch(err){setNote(err.message==="unauthorized"?"Entre novamente para configurar a segurança.":err.message)}
  }
  panel.addEventListener("toggle",()=>{if(panel.open)load()});
})();