# Graph Report - salon-os  (2026-11-02)

## Corpus Check
- 31 files · ~23,062 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 9 file(s) not represented in the graph (top: .woff2 5, (none) 1, .webmanifest 1)

## Summary
- 598 nodes · 1389 edges · 31 communities (27 shown, 4 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 66 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a2062b5a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Frontend do Painel
- server.mjs
- Agentes de Agenda
- Estoque & Consumo view
- Checkout e Consumo
- receptionist_brain.mjs
- Autenticação e Permissões
- Inteligência de Clientes
- Backup e Saúde
- Configuração LLM
- Caixa Financeiro
- Retenção e Fidelidade
- phase12.mjs
- Status Operacional
- Formulário de Agendamento
- Relatórios e Exportação
- Manifesto do Pacote
- whatsapp.mjs
- Ícone 192px
- Ícone 512px
- Service Worker
- setupAgenda
- api
- dashboard-board.js
- agentConfigModal (Recepcionista IA)
- Salon OS
- Agenda view
- Credenciais externas ao repositorio
- Clientes view
- wa-tenant-smoke.mjs

## God Nodes (most connected - your core abstractions)
1. `api()` - 55 edges
2. `api()` - 30 edges
3. `handlePhase2Api()` - 25 edges
4. `generateAgentTasks()` - 21 edges
5. `activate()` - 20 edges
6. `toast()` - 19 edges
7. `esc()` - 19 edges
8. `moneyBR()` - 16 edges
9. `Salon OS` - 16 edges
10. `handlePhase3Api()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `Configuracao de provedor LLM` --semantically_similar_to--> `Credenciais externas ao repositorio`  [INFERRED] [semantically similar]
  public/index.html → README.md
- `Administracao & Seguranca view` --conceptually_related_to--> `Arquivos que nao devem ser versionados`  [AMBIGUOUS]
  public/index.html → README.md
- `Financeiro & Caixa view` --implements--> `Caixa, financeiro e comissoes`  [INFERRED]
  public/index.html → README.md
- `Pacotes view` --implements--> `Pacotes e creditos de servicos`  [INFERRED]
  public/index.html → README.md
- `loginForm` --conceptually_related_to--> `Estrutura multiempresa (tenant_id)`  [INFERRED]
  public/index.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Fechamento de atendimento atualiza financeiro, estoque e pacotes** — public_index_checkout_modal, public_index_finance, public_index_inventory, public_index_packages [EXTRACTED 1.00]
- **Controles de seguranca da Recepcionista IA** — public_index_ai_guardrails, public_index_human_handoff, public_index_agent_autonomy, public_index_internal_brain_fallback [INFERRED 0.85]
- **Postura de protecao de segredos** — readme_external_credentials, readme_versioning_exclusions, security_public_repo_policy, public_index_llm_provider_config [INFERRED 0.85]

## Communities (31 total, 4 thin omitted)

### Community 0 - "Frontend do Painel"
Cohesion: 0.05
Nodes (91): actionNames, activate(), ageHuman(), agendaBoard, agentNames, agentTaskAction(), api(), appointmentUi (+83 more)

### Community 1 - "server.mjs"
Cohesion: 0.09
Nodes (30): phase*.mjs modulos operacionais, addDaysDate(), appointmentApiView(), appointmentCols, appointmentItemsFor(), baseSecurityHeaders(), clientCols, clientIp() (+22 more)

### Community 2 - "Agentes de Agenda"
Cohesion: 0.08
Nodes (40): db, gen, kinds, tasks, user, wait, db, here (+32 more)

### Community 3 - "Estoque & Consumo view"
Cohesion: 0.22
Nodes (13): checkoutModal, Financeiro & Caixa view, Estoque & Consumo view, packageSellModal, Pacotes view, Produtos hub, purchaseModal, PDV Produtos view (+5 more)

### Community 4 - "Checkout e Consumo"
Cohesion: 0.11
Nodes (40): appointmentCheckoutItems(), checkout(), checkoutPrep(), clientConsumption(), commissions(), consumeLots(), consumeRecipe(), dashboard() (+32 more)

### Community 5 - "receptionist_brain.mjs"
Cohesion: 0.28
Nodes (11): brainHealth(), brainRequest(), buildPrompt(), buildReceptionistPrompt(), clip(), contextSnapshot(), extractJson(), runReceptionistBrain() (+3 more)

### Community 6 - "Autenticação e Permissões"
Cohesion: 0.19
Nodes (18): audit(), authenticate(), can(), cookies(), deleteSessionCookie(), handleAuthApi(), installAuth(), makePasswordHash() (+10 more)

### Community 7 - "Inteligência de Clientes"
Cohesion: 0.29
Nodes (15): checkoutRows(), clientIntelligence(), days(), handlePhase3Api(), now(), one(), overview(), professionals() (+7 more)

### Community 9 - "Configuração LLM"
Cohesion: 0.28
Nodes (14): callConfiguredLlm(), dec(), enc(), ensureKey(), extractChat(), extractOpenAI(), fetchJson(), getLlmConfig() (+6 more)

### Community 10 - "Caixa Financeiro"
Cohesion: 0.26
Nodes (13): cents(), handlePhase10Api(), installPhase10(), now(), one(), openCash(), overview(), productsForRetail() (+5 more)

### Community 11 - "Retenção e Fidelidade"
Cohesion: 0.42
Nodes (13): addEngagement(), addPoints(), afterCheckoutRetention(), clientPoints(), clientRetention(), generateBirthdays(), handlePhase6Api(), now() (+5 more)

### Community 12 - "phase12.mjs"
Cohesion: 0.14
Nodes (32): addDays(), averageTicket(), dailyRevenue(), dayStartMs(), diffDays(), handlePhase12Api(), installPhase12(), lastMinuteCancellation() (+24 more)

### Community 13 - "Status Operacional"
Cohesion: 0.13
Nodes (19): backupStatus(), dbStats(), fileStat(), handlePhase5Api(), installPhase5(), now(), one(), restoreStatus() (+11 more)

### Community 14 - "Formulário de Agendamento"
Cohesion: 0.32
Nodes (11): setupAppointmentUi(), addItem(), bindRows(), items(), professionalOptions(), refreshSuggestions(), refreshSummary(), renderTags() (+3 more)

### Community 15 - "Relatórios e Exportação"
Cohesion: 0.31
Nodes (9): csv(), esc(), handlePhase11Api(), installPhase11(), one(), range(), reportData(), summary() (+1 more)

### Community 16 - "Manifesto do Pacote"
Cohesion: 0.20
Nodes (9): engines, node, name, private, scripts, check, start, type (+1 more)

### Community 17 - "whatsapp.mjs"
Cohesion: 0.14
Nodes (27): API_KEY, BASE, chatName(), chatSerializedId(), conversationMessages(), displayName(), ensureWahaSession(), ingestWahaEvent() (+19 more)

### Community 18 - "Ícone 192px"
Cohesion: 0.67
Nodes (3): 192px App Icon (white NG on dark rounded square), NG Monogram, PWA Install / Home Screen Icon

### Community 21 - "setupAgenda"
Cohesion: 0.17
Nodes (21): CLOSED, hhmm(), iso(), MONTHS, moonPhase(), NEW_MOON_MS, OFF_LABEL, setupAgenda() (+13 more)

### Community 22 - "api"
Cohesion: 0.19
Nodes (19): api(), availabilityFor(), bookingSuggestion(), createAppointmentRecord(), csvCell(), dashboard(), ensureSeed(), interpret() (+11 more)

### Community 23 - "dashboard-board.js"
Cohesion: 0.27
Nodes (14): curve(), dateBR(), niceMax(), NS_W, pctBR(), setupDashboard(), compareOptions(), load() (+6 more)

### Community 24 - "agentConfigModal (Recepcionista IA)"
Cohesion: 0.20
Nodes (8): agentConfigModal (Recepcionista IA), Funcionarios Artificiais view, Configuracao de provedor LLM, Gente hub, referralModal, Fidelizacao view, Fidelizacao e relacionamento, Recepcionista com IA configuravel

### Community 25 - "Salon OS"
Cohesion: 0.20
Nodes (9): Administracao & Seguranca view, mobileNav, Ficha Tecnica view, manifest.webmanifest, Ficha tecnica, SQLite via node:sqlite (Node.js 22+), Nova Gente, PWA responsivo (+1 more)

### Community 26 - "Agenda view"
Cohesion: 0.20
Nodes (10): Agenda view, appointmentModal, Olho do Dono view, Recursos view, Servicos view, Equipe view, timeOffModal, Agenda multi-servico e multi-profissional (+2 more)

### Community 27 - "Credenciais externas ao repositorio"
Cohesion: 0.22
Nodes (4): Comando inteligente, Dashboard view, JEV Decisoes view, JEV

### Community 28 - "Clientes view"
Cohesion: 0.32
Nodes (8): Clientes view, Central de Mensagens (inbox view), Marketing & Relacionamento hub, Relatorios & Exportacao view, Conexao WhatsApp (waSetup), CRM de clientes e historico, Relatorios gerenciais, Atendimento via WhatsApp / WAHA

### Community 29 - "wa-tenant-smoke.mjs"
Cohesion: 0.25
Nodes (5): db, out, installWhatsApp(), registerTenantSession(), tenantForWahaEvent()

## Ambiguous Edges - Review These
- `Administracao & Seguranca view` → `Arquivos que nao devem ser versionados`  [AMBIGUOUS]
  public/index.html · relation: conceptually_related_to

## Knowledge Gaps
- **13 isolated node(s):** `phase*.mjs modulos operacionais`, `NG Monogram`, `PWA Install / Home Screen Icon`, `NG Monogram Brand Mark`, `NG PWA App Icon (512x512): white 'NG' monogram on dark rounded square` (+8 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 105 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Auth Gate` connect `Autenticação e Permissões` to `Frontend do Painel`?**
  _High betweenness centrality (0.325) - this node is a cross-community bridge._
- **Are the 9 inferred relationships involving `api()` (e.g. with `appointmentApiView()` and `clientView()`) actually correct?**
  _`api()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `phase*.mjs modulos operacionais`, `NG Monogram`, `PWA Install / Home Screen Icon` to the rest of the system?**
  _13 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend do Painel` be split into smaller, more focused modules?**
  _Cohesion score 0.053775965831877305 - nodes in this community are weakly interconnected._
- **Why does `Salon OS` connect `Salon OS` to `agentConfigModal (Recepcionista IA)`, `Agenda view`, `Estoque & Consumo view`, `Clientes view`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Should `server.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.08912655971479501 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Administracao & Seguranca view` and `Arquivos que nao devem ser versionados`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._