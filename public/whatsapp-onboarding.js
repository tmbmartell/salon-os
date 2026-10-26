/* NOVAGENTE Estética — etapa 2: vinculação WAHA explícita, QR e diagnóstico.
   Sem agentes automáticos. Não guarda credenciais ou mídias em localStorage. */
(() => {
  "use strict";
  const one = id => document.getElementById(id);
  const form = one("neWhatsappSessionForm");
  if (!form) return;
  const status = one("neWhatsAppConnectionStatus");
  const message = one("neWhatsappMessage");
  const input = one("neWhatsappSessionName");
  const qrImage = one("waQrImage");
  const prepareButton = one("prepareWaha");
  const qrButton = one("showQr");
  const refreshButton = one("neWhatsappRefresh");
  let qrObjectUrl = null;
  let owner = false;

  function showMessage(text, isError = false) {
    message.textContent = text;
    message.classList.toggle("ne-error", isError);
  }
  function releaseQr() {
    qrImage.classList.add("hidden");
    qrImage.removeAttribute("src");
    if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
    qrObjectUrl = null;
  }
  async function call(path, init = {}) {
    const res = await fetch(path, { credentials: "same-origin", ...init });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || data.detail || "Não foi possível concluir a operação.");
    return data;
  }
  async function check() {
    try {
      const [auth, w] = await Promise.all([call("/api/auth/me"), call("/api/whatsapp/status")]);
      owner = auth.user?.role === "owner";
      form.classList.toggle("hidden", !owner);
      if (owner && document.activeElement !== input) input.value = w.session || "";
      const connected = !!w.connected;
      const configured = !!w.configured && !!w.session;
      status.textContent = connected ? "Conectado" : w.status === "UNASSIGNED" ? "Sem sessão" : configured ? "Aguardando conexão" : "Configuração pendente";
      status.classList.toggle("ok", connected);
      prepareButton.disabled = !configured || !["owner", "manager"].includes(auth.user?.role);
      qrButton.disabled = !configured || !["owner", "manager"].includes(auth.user?.role) || connected;
      showMessage(connected
        ? "Número vinculado. Envie e receba mensagens pela Central de Atendimento."
        : w.status === "UNASSIGNED"
        ? "A proprietária precisa cadastrar um identificador exclusivo para esta conexão."
        : w.status === "UNAVAILABLE"
        ? "O servidor WAHA não respondeu. Verifique conectividade, credenciais e logs do serviço."
        : !configured
        ? "O servidor WAHA ou suas credenciais ainda precisam ser configurados pelo administrador técnico."
        : "Prepare a sessão e escaneie o QR Code com o WhatsApp do salão.");
      return w;
    } catch (error) {
      status.textContent = "Não foi possível verificar";
      showMessage(error.message, true);
      prepareButton.disabled = qrButton.disabled = true;
      return null;
    }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!owner || !form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const name = input.value.trim();
      await call("/api/whatsapp/session/link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session: name })
      });
      releaseQr();
      await check();
      one("refreshInbox")?.click();
      showMessage("Identificação salva exclusivamente para este salão. Agora prepare a conexão.");
    } catch (error) { showMessage(error.message, true); }
    finally { button.disabled = false; }
  });
  prepareButton.onclick = async () => {
    prepareButton.disabled = true;
    try {
      const w = await call("/api/whatsapp/session/prepare", {
        method: "POST", headers: { "content-type": "application/json" }, body: "{}"
      });
      showMessage(w.connected ? "WhatsApp conectado." : "Sessão preparada. Agora clique em Mostrar QR Code.");
      await check();
      one("refreshInbox")?.click();
    } catch (error) { showMessage("Não foi possível preparar a conexão: " + error.message, true); }
    finally { if (!qrButton.disabled) prepareButton.disabled = false; }
  };
  qrButton.onclick = async () => {
    qrButton.disabled = true;
    try {
      const res = await fetch("/api/whatsapp/session/qr", { credentials: "same-origin", cache: "no-store" });
      const type = (res.headers.get("content-type") || "").split(";")[0].trim();
      if (!res.ok || !["image/png","image/jpeg","image/webp"].includes(type)) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "O QR Code ainda não está disponível. Prepare a conexão.");
      }
      const blob = await res.blob();
      if (blob.size > 1024 * 1024) throw new Error("Imagem do QR Code acima do limite.");
      releaseQr();
      qrObjectUrl = URL.createObjectURL(blob);
      qrImage.src = qrObjectUrl;
      qrImage.classList.remove("hidden");
      showMessage("Escaneie no WhatsApp do salão: Aparelhos conectados → Conectar aparelho. Depois verifique o status.");
    } catch (error) { releaseQr(); showMessage(error.message, true); }
    finally { qrButton.disabled = false; }
  };
  qrImage.addEventListener("error", () => { releaseQr(); showMessage("Não foi possível exibir o QR Code.",true); });
  refreshButton.addEventListener("click", async () => { await check(); one("refreshInbox")?.click(); });
  // Ao abrir Atendimento depois do login, atualizar as permissões e a conexão.
  document.addEventListener("click", event => {
    if (event.target.closest('[data-view="inbox"],[data-jump="inbox"]')) check();
  });
  window.addEventListener("pagehide", releaseQr);
  check();
})();