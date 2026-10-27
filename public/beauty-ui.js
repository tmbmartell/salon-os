/* NOVAGENTE Estética — camada visual progressiva. Não altera APIs, banco nem permissões. */
(() => {
  "use strict";
  const one = (s, root = document) => root.querySelector(s);
  const all = (s, root = document) => [...root.querySelectorAll(s)];

  const navigation = [
    { label: "Visão geral", views: ["dashboard"] },
    { label: "Atendimento", views: ["inbox"] },
    { label: "Agenda", views: ["agenda"] },
    { label: "Clientes", views: ["clients"] },
    { label: "Operação", views: ["people", "team", "technical", "services", "resources"] },
    { label: "Financeiro & estoque", views: ["finance", "inventory", "suppliers", "retail", "packages", "productsHub"] },
    { label: "Crescimento", views: ["marketing", "retention", "reports", "ownerEye"] },
    { label: "Inteligência", views: ["agents", "intelligence"] },
    { label: "Configurações", views: ["admin"] }
  ];

  function brand() {
    document.title = "NOVAGENTE Estética | Gestão Integrada";
    all(".brand, .authBrand").forEach(el => {
      const logo = one(".logo", el);
      const name = one("strong", el);
      const caption = one("small", el);
      if (logo) {
        const img = document.createElement("img");
        img.src = "/novagente-logo.svg";
        img.alt = "NOVAGENTE";
        img.width = 198;
        img.height = 25;
        logo.replaceChildren(img);
        logo.title = "Marca oficial NOVAGENTE";
      }
      if (name) name.textContent = "Estética";
      if (caption) caption.textContent = "Sistema integrado";
    });
    const eyebrow = one(".topbar .eyebrow");
    if (eyebrow) eyebrow.textContent = "NOVAGENTE ESTÉTICA · GESTÃO INTEGRADA";
    const login = one("#loginPanel h2");
    if (login) login.textContent = "Entrar no NOVAGENTE Estética";
  }

  function navigationMenu() {
    const nav = one(".sidebar nav");
    if (!nav || nav.dataset.bwReady) return;
    const original = new Map(all("[data-view]", nav).map(b => [b.dataset.view, b]));
    const fragment = document.createDocumentFragment();
    navigation.forEach(({ label, views }) => {
      const buttons = views.map(id => original.get(id)).filter(Boolean);
      if (!buttons.length) return;
      if (buttons.length === 1) {
        buttons[0].classList.add("bw-single-link");
        fragment.append(buttons[0]);
        return;
      }
      const group = document.createElement("div");
      group.className = "bw-nav-group";
      const trigger = document.createElement("button");
      trigger.className = "bw-nav-trigger";
      trigger.type = "button";
      trigger.setAttribute("aria-expanded", "false");
      trigger.textContent = label;
      const submenu = document.createElement("div");
      submenu.className = "bw-submenu";
      submenu.id = "bw-nav-" + views[0];
      trigger.setAttribute("aria-controls", submenu.id);
      buttons.forEach(button => submenu.append(button));
      trigger.addEventListener("click", () => {
        const open = group.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", String(open));
      });
      submenu.addEventListener("click", event => {
        if (event.target.closest("[data-view]")) {
          all(".bw-nav-group", nav).forEach(item => {
            if (item !== group) {
              item.classList.remove("is-open");
              const b = one(".bw-nav-trigger", item);
              if (b) b.setAttribute("aria-expanded", "false");
            }
          });
        }
      });
      group.append(trigger, submenu);
      fragment.append(group);
    });
    nav.replaceChildren(fragment);
    nav.dataset.bwReady = "1";
    const selected = one(".sidebar [data-view].active");
    if (selected) {
      const group = selected.closest(".bw-nav-group");
      if (group) {
        group.classList.add("is-open");
        one(".bw-nav-trigger", group)?.setAttribute("aria-expanded", "true");
      }
    }
  }

  function makeDisclosure(panel) {
    if (!panel || panel.closest("details.bw-disclosure")) return;
    const headline = one(".panelhead h2", panel)?.textContent?.trim() || "Ver detalhes";
    const description = one(".panelhead p", panel)?.textContent?.trim() || "Clique para abrir os dados completos.";
    const details = document.createElement("details");
    details.className = "bw-disclosure";
    const summary = document.createElement("summary");
    summary.className = "bw-disclosure-summary";
    const title = document.createElement("span");
    title.className = "bw-disclosure-title";
    title.textContent = headline;
    const help = document.createElement("small");
    help.textContent = description;
    const arrow = document.createElement("span");
    arrow.className = "bw-disclosure-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "⌄";
    const label = document.createElement("span");
    label.className = "bw-disclosure-copy";
    label.append(title, help);
    summary.append(label, arrow);
    panel.before(details);
    details.append(summary, panel);
  }

  function compactSections() {
    // Números essenciais aparecem de imediato; análises detalhadas só ao abrir.
    all("#finance .panel, #inventory .panel, #team .panel").forEach(makeDisclosure);
  }

  function inboxGroup(conversation) {
    if (conversation.status === "resolved") return "resolved";
    if (Number(conversation.unread_count || 0) > 0 || conversation.last_message_direction === "in") return "reply";
    if (conversation.category === "appointment") return "appointment";
    return "following";
  }

  // Chamado ao final do renderizador existente do Salon OS. Mantém os
  // botões com seus IDs e o fluxo de abertura de conversa do app original.
  window.organizeBeautyInbox = function(conversations) {
    const parent = one("#conversationList");
    if (!parent || !Array.isArray(conversations)) return;
    const cards = new Map(all("[data-conversation]", parent).map(b => [b.dataset.conversation, b]));
    if (!cards.size) return;
    const groups = [
      ["reply", "Precisa responder", "Última mensagem da cliente ou não lida"],
      ["appointment", "Sobre agendamentos", "Conversas classificadas como agendamento"],
      ["following", "Em acompanhamento", "Último retorno enviado ou próximo passo em aberto"],
      ["resolved", "Concluídas", "Atendimentos encerrados"]
    ];
    const fragment = document.createDocumentFragment();
    groups.forEach(([key, label, description]) => {
      const items = conversations.filter(c => inboxGroup(c) === key && cards.has(c.id));
      const section = document.createElement("section");
      section.className = "bw-conversation-section bw-" + key;
      const heading = document.createElement("div");
      heading.className = "bw-conversation-heading";
      const labelWrap = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = label;
      const small = document.createElement("small");
      small.textContent = description;
      labelWrap.append(strong, small);
      const count = document.createElement("span");
      count.className = "bw-section-count";
      count.textContent = String(items.length);
      heading.append(labelWrap, count);
      const stack = document.createElement("div");
      stack.className = "bw-conversation-stack";
      for (const item of items) {
        const card = cards.get(item.id);
        card.classList.add("bw-conversation-card");
        const badge = document.createElement("span");
        badge.className = "bw-response-label";
        badge.textContent = key === "reply" ? "A responder" : key === "appointment" ? "Agendamento" : key === "resolved" ? "Concluída" : (item.last_message_direction === "out" ? "Respondida" : "A acompanhar");
        one(".conversationMeta", card)?.append(badge);
        stack.append(card);
      }
      section.append(heading, stack);
      fragment.append(section);
    });
    parent.replaceChildren(fragment);
  };

  function boot() {
    brand();
    navigationMenu();
    compactSections();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();