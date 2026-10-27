/* NOVAGENTE Estética — Etapa 8: Administração progressiva e equipe.
   Não existe pagamento ou liberação de RH Premium nesta versão. */
(() => {
  "use strict";
  const $=(s,root=document)=>root.querySelector(s);
  const $$=(s,root=document)=>[...root.querySelectorAll(s)];
  const make=(tag,className="",value)=>{
    const el=document.createElement(tag);if(className)el.className=className;
    if(value!==undefined)el.textContent=String(value);return el;
  };
  const userRoles={owner:"Proprietária",manager:"Gerência",reception:"Recepção",professional:"Profissional"};
  const getError=e=>e?.message||"Não foi possível concluir esta ação";
  async function api(url,options={}){
    const response=await fetch(url,{credentials:"same-origin",...options});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||"Falha na operação");
    return data;
  }
  const json=(method,body)=>({method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const detailMessage=(place,value)=>{if(place)place.textContent=String(value||"")};
  let logged=null,profile=null;
  const admin=$("#admin"),team=$("#team");
  if(!admin||!team)return;
  function section(className){return make("section",className+" ne-stage8-panel")}
  function newCard(title,subtitle,icon,target){
    const b=make("button","ne-stage8-card");b.type="button";b.dataset.neTab=target;
    b.append(make("span","ne-stage8-icon",icon),make("strong","",title),make("small","",subtitle));return b;
  }
  const adminMenu=make("div","ne-stage8-grid");
  adminMenu.append(newCard("Meu salão","Dados e preferências","▤","business"),
    newCard("Usuários e acessos","Contas e permissões","♙","users"),
    newCard("Segurança","Auditoria e backups","◇","security"),
    newCard("RH avançado","Módulo adicional futuro","✦","premium"));
  const adminAnchor=$(".sectionTitle",admin);adminAnchor.after(adminMenu);
  const adminPanels={
    business:section("ne-stage8-business"),
    users:section("ne-stage8-users"),
    security:section("ne-stage8-security"),
    premium:section("ne-stage8-premium")
  };
  for(const [name,el] of Object.entries(adminPanels)){el.dataset.neAdminPanel=name;admin.append(el)}
  // Reutilizar painéis legados sem duplicar chamadas ou IDs.
  const adminMetrics=$(".metrics",admin),adminGrid=$(".grid2",admin),
    audit=$("#adminAuditList")?.closest(".panel"),backups=$("#adminBackupList")?.closest(".panel"),
    quick=$(".ne-security-quick",admin);
  if(quick)adminPanels.security.append(quick);
  if(adminMetrics)adminPanels.security.append(adminMetrics);
  if(adminGrid)adminPanels.users.append(adminGrid);
  if(audit)adminPanels.security.append(audit);
  if(backups)adminPanels.security.append(backups);
  const businessTitle=make("h3","","Identidade do salão");
  const businessInfo=make("p","ne-stage8-help","Somente a proprietária pode alterar. O fuso escolhido é usado em relatórios e horários locais.");
  const profileForm=make("form","ne-stage8-form");profileForm.id="neBusinessProfileForm";
  const field=(label,key,type="text",required=false)=>{
    const container=make("label","ne-stage8-field"),input=make("input");
    input.name=key;input.type=type;input.required=required;
    input.maxLength=key==="address"?200:120;
    container.append(make("span","",label),input);return container;
  };
  profileForm.append(field("Nome do salão","name","text",true),
    field("Nome público","public_name"),field("Telefone","phone","tel"),field("Endereço","address"));
  const timezone=make("label","ne-stage8-field");
  const zoneSelect=make("select");zoneSelect.name="timezone";
  for(const zone of ["America/Porto_Velho","America/Manaus","America/Sao_Paulo","America/Belem",
    "America/Rio_Branco","America/Cuiaba","America/Recife","America/Boa_Vista","America/Noronha"]){
    const option=make("option","",zone.replace("America/","").replace("_"," "));option.value=zone;zoneSelect.append(option);
  }
  timezone.append(make("span","","Fuso horário"),zoneSelect);
  const saveProfile=make("button","primary","Salvar dados do salão");saveProfile.type="submit";
  const profileMessage=make("p","ne-stage8-help");profileMessage.setAttribute("role","status");
  profileForm.append(timezone,saveProfile,profileMessage);
  adminPanels.business.append(businessTitle,businessInfo,profileForm);
  const usersHeading=make("div","ne-stage8-heading");
  usersHeading.append(make("h3","","Gestão de acessos"),make("p","ne-stage8-help","A conta da proprietária controla perfis, convites e encerramento de sessões."));
  const inviteButton=make("button","primary","+ Convidar pessoa");inviteButton.type="button";
  usersHeading.append(inviteButton);
  const invitationList=make("div","ne-stage8-invites");
  const usersControls=make("div","ne-stage8-user-management");
  const matrix=make("div","ne-stage8-matrix");
  adminPanels.users.prepend(usersHeading,usersControls,invitationList,make("h3","","Permissões por perfil"),matrix);
  const premiumInfo=make("div","ne-stage8-coming");
  premiumInfo.append(make("h3","","RH avançado · opcional"),make("p","",
    "Planejado para documentos de pessoal, avaliações, treinamentos e gestão aprofundada. Ainda não disponível nem contratado."));
  adminPanels.premium.append(premiumInfo);
  const inviteDialog=make("dialog","ne-stage8-dialog");
  inviteDialog.id="neInviteDialog";const inviteForm=make("form","ne-stage8-form");
  inviteForm.append(make("h3","","Convidar uma pessoa"),make("p","ne-stage8-help","Convite válido por 48 horas. A pessoa criará sua própria senha."));
  inviteForm.append(field("Nome","name","text",true),field("E-mail","email","email",true));
  const roleField=make("label","ne-stage8-field"),roles=make("select");roles.name="role";
  for(const r of ["manager","reception","professional"]){
    const op=make("option","",userRoles[r]);op.value=r;roles.append(op);
  }
  roleField.append(make("span","","Perfil"),roles);inviteForm.append(roleField);
  const inviteActions=make("div","ne-stage8-dialog-actions");
  const cancelInvite=make("button","secondary","Cancelar");cancelInvite.type="button";cancelInvite.onclick=()=>inviteDialog.close();
  const submitInvite=make("button","primary","Criar convite");submitInvite.type="submit";
  inviteActions.append(cancelInvite,submitInvite);
  const inviteStatus=make("p","ne-stage8-help");inviteStatus.setAttribute("role","status");
  inviteForm.append(inviteActions,inviteStatus);
  inviteDialog.append(inviteForm);document.body.append(inviteDialog);
  const inviteFormOriginal=[...inviteForm.childNodes];
  inviteButton.onclick=()=>{inviteForm.replaceChildren(...inviteFormOriginal);inviteForm.reset();submitInvite.disabled=false;detailMessage(inviteStatus,"");inviteDialog.showModal()};
  inviteForm.onsubmit=async event=>{
    event.preventDefault();submitInvite.disabled=true;
    try{
      const body=Object.fromEntries(new FormData(inviteForm));
      const invite=await api("/api/admin/invitations",json("POST",body));
      const link=location.origin+location.pathname+"#invite="+encodeURIComponent(invite.token);
      const holder=make("div","ne-stage8-invite-link");
      const info=make("p","","Convite criado. Copie este link e envie por um canal seguro. Ele aparece somente agora.");
      const input=make("input");input.readOnly=true;input.value=link;input.setAttribute("aria-label","Link do convite");
      const copy=make("button","secondary","Copiar link");copy.type="button";
      copy.onclick=async()=>{
        try{await navigator.clipboard.writeText(link);detailMessage(inviteStatus,"Link copiado.");}
        catch{input.focus();input.select();detailMessage(inviteStatus,"Selecione e copie o link manualmente.");}
      };
      holder.append(info,input,copy);inviteForm.replaceChildren(make("h3","","Convite gerado"),holder,inviteStatus);
      await loadUsers();
    }catch(e){detailMessage(inviteStatus,getError(e));submitInvite.disabled=false}
  };
  async function loadUsers(){
    if(!logged)return;
    usersControls.replaceChildren();invitationList.replaceChildren();matrix.replaceChildren();
    try{
      const [users,rolesMatrix]=await Promise.all([api("/api/admin/users"),api("/api/admin/role-matrix")]);
      for(const u of users){
        const row=make("div","ne-stage8-user-row"),info=make("div","ne-stage8-user-info");
        info.append(make("strong","",u.name),make("small","",u.email+" · "+(u.active?"Ativo":"Inativo")));
        const actions=make("div","ne-stage8-user-actions");
        const select=make("select");select.setAttribute("aria-label","Perfil de "+u.name);
        for(const [value,label] of Object.entries(userRoles)){
          const opt=make("option","",label);opt.value=value;select.append(opt);
        }
        select.value=u.role;select.disabled=logged.role!=="owner"||u.id===logged.id;
        select.onchange=async()=>{
          if(!confirm("Alterar o perfil de "+u.name+" para "+userRoles[select.value]+"?")){select.value=u.role;return}
          try{await api("/api/admin/users/"+encodeURIComponent(u.id)+"/role",json("PATCH",{role:select.value}));await loadUsers()}
          catch(e){alert(getError(e));select.value=u.role}
        };
        actions.append(select);
        if(logged.role==="owner"&&u.id!==logged.id){
          const status=make("button","secondary",u.active?"Desativar":"Ativar");
          status.onclick=async()=>{if(!confirm((u.active?"Desativar":"Ativar")+" acesso de "+u.name+"?"))return;
            try{await api("/api/admin/users/"+encodeURIComponent(u.id)+"/active",json("PATCH",{active:!u.active}));await loadUsers()}catch(e){alert(getError(e))}
          };
          const revoke=make("button","secondary","Encerrar sessões");
          revoke.onclick=async()=>{if(!confirm("Desconectar todos os dispositivos de "+u.name+"?"))return;
            try{await api("/api/admin/users/"+encodeURIComponent(u.id)+"/revoke-sessions",json("POST",{}));alert("Acessos encerrados.")}catch(e){alert(getError(e))}
          };
          actions.append(status,revoke);
        }
        row.append(info,actions);usersControls.append(row);
      }
      for(const role of rolesMatrix.roles){
        const details=make("details","ne-stage8-role");
        details.append(make("summary","",role.label));
        const list=make("div","ne-stage8-role-grid");
        for(const area of role.areas){const entry=make("div","ne-stage8-role-entry");
          entry.append(make("strong","",area.label),make("small","",area.write?"Pode editar":area.read?"Somente leitura":"Sem acesso"));list.append(entry)}
        details.append(list);matrix.append(details);
      }
      inviteButton.hidden=logged.role!=="owner";
      if(logged.role==="owner"){
        const invites=await api("/api/admin/invitations");
        if(invites.length){
          invitationList.append(make("h4","","Convites recentes"));
          for(const inv of invites.slice(0,8)){
            invitationList.append(make("p","ne-stage8-help",inv.name+" · "+userRoles[inv.role]+" · "+(inv.accepted_at?"Aceito":new Date(inv.expires_at)<new Date()?"Expirado":"Aguardando aceitação")));
          }
        }
      }
    }catch(e){usersControls.append(make("p","ne-stage8-help",getError(e)))}
  }
  async function loadProfile(){
    if(!logged)return;
    try{
      profile=await api("/api/admin/business-profile");
      for(const key of ["name","public_name","phone","address"]){profileForm.elements[key].value=profile[key]||""}
      if(![...zoneSelect.options].some(x=>x.value===profile.timezone)){
        const op=make("option","",profile.timezone);op.value=profile.timezone;zoneSelect.append(op);
      }
      zoneSelect.value=profile.timezone;
      $$("input,select,button",profileForm).forEach(el=>el.disabled=logged.role!=="owner");
      detailMessage(profileMessage,logged.role==="owner"?"Altere e salve quando necessário.":"Consulta disponível; somente a proprietária pode editar.");
    }catch(e){detailMessage(profileMessage,getError(e))}
  }
  profileForm.onsubmit=async event=>{
    event.preventDefault();if(logged?.role!=="owner")return;
    saveProfile.disabled=true;
    try{
      const body=Object.fromEntries(new FormData(profileForm));
      await api("/api/admin/business-profile",json("PUT",body));
      detailMessage(profileMessage,"Configurações do salão atualizadas.");await loadProfile();
    }catch(e){detailMessage(profileMessage,getError(e))}
    finally{saveProfile.disabled=false}
  };
  function selectAdminTab(name){
    for(const [id,panel] of Object.entries(adminPanels))panel.classList.toggle("hidden",id!==name);
    $$("[data-ne-tab]",adminMenu).forEach(b=>b.classList.toggle("is-active",b.dataset.neTab===name));
    if(name==="business")loadProfile();if(name==="users")loadUsers();
  }
  $$("[data-ne-tab]",adminMenu).forEach(b=>b.addEventListener("click",()=>selectAdminTab(b.dataset.neTab)));
  selectAdminTab("business");

  // Gestão de pessoas básica continua acessível, RH futuro fica separado.
  const teamTitle=$(".sectionTitle",team),teamMenu=make("div","ne-stage8-grid");
  teamMenu.append(newCard("Profissionais","Cadastro e equipe","♙","professionals"),
    newCard("Desempenho","Metas e comissões","▥","performance"),
    newCard("Folgas e escalas","Disponibilidade","▦","leave"),
    newCard("RH avançado","Adicional futuro","✦","premium"));
  teamTitle.after(teamMenu);
  const teamPanels={
    professionals:section("ne-stage8-people"),performance:section("ne-stage8-performance"),
    leave:section("ne-stage8-leave"),premium:section("ne-stage8-team-premium")
  };
  for(const [name,p]of Object.entries(teamPanels)){p.dataset.neTeamPanel=name;team.append(p)}
  const roster=$("#teamList"),performance=$("#staffPerformanceList")?.closest(".panel"),
    timeOff=$("#staffTimeOffList")?.closest(".panel");
  if(roster)teamPanels.professionals.append(roster);
  if(performance)teamPanels.performance.append(performance);
  if(timeOff)teamPanels.leave.append(timeOff);
  teamPanels.premium.append(make("h3","","RH avançado"),make("p","ne-stage8-help",
    "Opcional em desenvolvimento. Documentos, avaliações, treinamentos e rotinas trabalhistas exigem implementação e homologação próprias. Não há contratação ativada."));
  function teamTab(name){
    for(const [id,p]of Object.entries(teamPanels))p.classList.toggle("hidden",id!==name);
    $$("[data-ne-tab]",teamMenu).forEach(b=>b.classList.toggle("is-active",b.dataset.neTab===name));
  }
  $$("[data-ne-tab]",teamMenu).forEach(b=>b.addEventListener("click",()=>teamTab(b.dataset.neTab)));
  teamTab("professionals");

  async function onAdminOpen(){
    try{
      const data=await api("/api/auth/me");logged=data.user;
      await loadProfile();
      if(logged?.role==="owner")inviteButton.hidden=false;
    }catch{logged=null;detailMessage(profileMessage,"Entre com sua conta para acessar as configurações.")}
  }
  document.addEventListener("click",event=>{
    if(event.target.closest('[data-view="admin"],[data-jump="admin"]'))onAdminOpen();
  });
  if(admin.classList.contains("active"))onAdminOpen();

  // O convite via fragmento nunca é enviado em URLs de requisições HTTP.
  const inviteToken=new URLSearchParams(location.hash.slice(1)).get("invite");
  if(inviteToken){
    const acceptance=make("dialog","ne-stage8-dialog ne-stage8-accept");
    const form=make("form","ne-stage8-form");
    form.append(make("h3","","Convite para NOVAGENTE Estética"),
      make("p","ne-stage8-help","Crie uma senha exclusiva para acessar o salão. Use pelo menos 12 caracteres."));
    const pw=field("Nova senha","password","password",true);pw.querySelector("input").minLength=12;
    const pwAgain=field("Confirmar senha","confirm_password","password",true);
    const hint=make("p","ne-stage8-help");hint.setAttribute("role","status");
    const button=make("button","primary","Criar meu acesso");button.type="submit";
    form.append(pw,pwAgain,button,hint);acceptance.append(form);document.body.append(acceptance);
    acceptance.showModal();
    form.onsubmit=async event=>{
      event.preventDefault();
      const password=form.elements.password.value;
      if(password!==form.elements.confirm_password.value){detailMessage(hint,"As duas senhas precisam ser iguais.");return}
      button.disabled=true;
      try{
        await api("/api/auth/invitations/accept",json("POST",{token:inviteToken,password}));
        history.replaceState(null,"",location.pathname+location.search);
        form.replaceChildren(make("h3","","Seu acesso foi criado"),make("p","ne-stage8-help",
          "Agora entre com seu e-mail e a senha recém-criada."));
        const close=make("button","primary","Ir para o login");
        close.type="button";close.onclick=()=>acceptance.close();form.append(close);
      }catch(e){detailMessage(hint,getError(e));button.disabled=false}
    };
  }
})();
