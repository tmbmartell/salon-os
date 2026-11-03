/* NOVAGENTE Estética — acesso às sessões pessoais e atalhos de segurança.
   Não exibe dados de outras contas nem guarda credenciais no navegador. */
(() => {
  "use strict";
  const make = (tag, cls, content) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (content !== undefined) e.textContent = content;
    return e;
  };
  const nav = document.querySelector(".sidefoot");
  if (!nav || document.querySelector("#neSessionsOpen")) return;

  const open = make("button", "ghostMini ne-session-link", "Meus dispositivos");
  open.type = "button";
  open.id = "neSessionsOpen";
  nav.insertBefore(open, document.querySelector("#logoutBtn"));

  const modal = document.createElement("dialog");
  modal.className = "ne-security-dialog";
  modal.id = "neSessionsModal";
  const heading = make("div", "ne-security-heading");
  const text = make("div");
  text.append(make("h2", "", "Meus dispositivos"), make("p", "", "Veja e encerre acessos à sua conta. Somente suas próprias sessões aparecem aqui."));
  const close = make("button", "secondary", "Fechar");
  close.type = "button";
  close.addEventListener("click", () => modal.close());
  heading.append(text, close);
  const note = make("p", "ne-session-note", "Carregando sessões...");
  note.setAttribute("role", "status");
  const list = make("div", "ne-session-list");
  modal.append(heading, note, list);
  document.body.append(modal);
  modal.addEventListener("click", event => {
    if (event.target === modal) modal.close();
  });

  const dt = value => {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? "—" : date.toLocaleString("pt-BR");
  };
  async function request(url, options) {
    const response = await fetch(url, { credentials: "same-origin", headers: { "content-type": "application/json" }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 401 ? "Sua sessão terminou. Entre novamente." : "Não foi possível consultar os acessos.");
    return body;
  }
  async function refresh() {
    list.replaceChildren();
    note.textContent = "Verificando acessos...";
    try {
      const result = await request("/api/auth/sessions");
      note.textContent = "Sessões inativas por mais de " + result.idle_timeout_hours + " horas perdem o acesso automaticamente.";
      if (!result.sessions?.length) {
        list.append(make("p", "", "Nenhuma sessão ativa encontrada."));
        return;
      }
      for (const item of result.sessions) {
        const row = make("article", "ne-session-item");
        const details = make("div", "ne-session-details");
        const title = make("strong", "", item.current ? "Este dispositivo" : "Outro dispositivo");
        details.append(title, make("small", "", item.device_label || "Não identificado"), make("small", "", "Último acesso: " + dt(item.last_seen_at)));
        const revoke = make("button", "secondary", item.current ? "Sair deste dispositivo" : "Encerrar acesso");
        revoke.type = "button";
        revoke.addEventListener("click", async () => {
          if (!window.confirm(item.current ? "Deseja sair deste dispositivo?" : "Deseja encerrar este acesso?")) return;
          revoke.disabled = true;
          try {
            await request("/api/auth/sessions/revoke", { method: "POST", body: JSON.stringify({ session_id: item.id }) });
            if (item.current) { window.location.reload(); return; }
            await refresh();
          } catch (err) {
            note.textContent = err.message;
            revoke.disabled = false;
          }
        });
        row.append(details, revoke);
        list.append(row);
      }
    } catch (err) {
      note.textContent = err.message;
    }
  }
  open.addEventListener("click", () => { modal.showModal(); refresh(); });

  const admin = document.querySelector("#admin .sectionTitle");
  if (admin) {
    const section = make("section", "ne-security-quick");
    section.append(make("h3", "", "Central de Segurança"));
    const cards = make("div", "ne-security-grid");
    const targets = [
      ["Usuários e permissões", "#adminUserList", "Gerenciar acessos por função"],
      ["Dispositivos conectados", "sessions", "Encerrar sessões da própria conta"],
      ["Auditoria", "#adminAuditList", "Consultar ações registradas"],
      ["Backups e recuperação", "#adminBackupList", "Verificar cópias e restauração"]
    ];
    for (const [label, selector, sub] of targets) {
      const card = make("button", "ne-security-card");
      card.type = "button";
      card.append(make("strong", "", label), make("small", "", sub));
      card.addEventListener("click", () => {
        if (selector === "sessions") { modal.showModal(); refresh(); return; }
        document.querySelector(selector)?.closest(".panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      cards.append(card);
    }
    section.append(cards);
    const readiness=make("details","ne-pilot-readiness");
    const trigger=make("summary","","Diagnóstico do ambiente piloto (sem WhatsApp)");
    const content=make("div","ne-pilot-readiness-body");
    content.setAttribute("role","status");
    readiness.append(trigger,content);
    let loading=false;
    readiness.addEventListener("toggle",async()=>{
      if(!readiness.open||loading)return;
      loading=true;content.replaceChildren(make("p","","Verificando as condições deste ambiente..."));
      try{
        const result=await request("/api/admin/pilot-checks");
        content.replaceChildren();
        for(const check of result.checks||[]){
          const line=make("article","ne-pilot-check");
          const title=make("strong","",check.title);
          const icon=check.status==="passed"?"Verificado":check.status==="deferred"?"Adiado":"Pendente";
          const status=make("small","ne-pilot-check-status",icon);
          const description=make("p","",check.explanation);
          line.append(title,status,description);
          content.append(line);
        }
        content.append(make("p","ne-pilot-warning",
          "Ambiente de testes: a aprovação desses itens não representa autorização para disponibilizar o sistema publicamente."));
      }catch(error){content.replaceChildren(make("p","",error.message))}
      finally{loading=false}
    });
    section.append(readiness);
    admin.after(section);
  }
})();
