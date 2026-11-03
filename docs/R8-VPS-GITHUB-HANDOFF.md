# NOVAGENTE Estética — R8: reconciliação VPS × GitHub e homologação

**Data:** 2026-11-03. **Escopo:** piloto NOVAGENTE Estética. **Issue:** #35.

## Estado verificado
- VPS / SentinelX: host `hostinger-celia`.
- Aplicação operacional: `/srv/margot/novagente-estetica-whatsapp-pilot`.
- Serviço: `novagente-estetica-whatsapp-pilot.service`; API local: `http://127.0.0.1:19333/api/health`.
- A pasta operacional **não contém `.git`**. Não executar `git reset`, `git pull` ou `git checkout` nela.
- `tmbmartell/salon-os:main` está desatualizada em relação à VPS: diferenças materiais em `server.mjs`, `phase2.mjs`, `phase11.mjs`, `public/app.js`, `public/index.html`. `public/novagente-clients.js` existe na VPS e não foi encontrado em `main` na verificação. Os tamanhos de arquivos diferem significativamente. **Não sobrescrever a VPS com `main`**.
- A VPS possui backups `*.bak-*` e monitor SHA-256 em `data/monitoring/baseline.json`. Nenhuma alteração no baseline sem revisão humana.
- O código em execução já recebeu correções de checkout, comissão, fuso horário, exportação CSV, histórico, pagamentos seletivos, textos do caixa, exibição de movimentações e tratamento do perfil profissional. Algumas estão **implementadas, mas não homologadas visualmente**.

## Ordem obrigatória de trabalho do agente

### 1. Inventário e backup sem alteração de produção
1. Auditar o código implantado e seus hashes SHA-256 (apenas arquivos fonte; incluir `*.mjs` da raiz, `public/*.{js,css,html,svg}`).
2. Inspecionar `main` e PRs existentes no GitHub; registrar a divergência por arquivo.
3. Criar um **snapshot de código** num diretório isolado fora da pasta operacional, sem carregar `.env.runtime`, dados, sessões, certificados, tokens, credenciais, arquivos SQLite, logs de clientes, backups ou qualquer dado pessoal ao GitHub.
4. Não mover, excluir ou renomear a pasta operacional. Nenhum deploy ou restart nesta etapa.

### 2. Reconciliação em branch de código
1. Trabalhar na branch `r8/reconcile-vps-20261103` (ou derivada). Não alterar `main` diretamente.
2. Comparar por arquivo com `main`, incluindo módulos dependentes/importados; preservar funcionalidades existentes.
3. Registrar commits organizados (preferência: reconciliação de código, correções R8, testes) e abrir PR como *draft* para revisão.
4. Não incluir `node_modules`, `.env*`, `data/`, `*.sqlite*`, `*.bak*`, `*.log`, arquivos pessoais, chaves ou payloads de WhatsApp. Se encontrar segredo no código, parar e reportar sem copiá-lo para PR.
5. Manter migrações backward-compatible, com testes; sem alterações em dados financeiros históricos.

### 3. Critérios de homologação pendentes
- **P0:** testar `owner` e `professional` separadamente, com sessões distintas. `owner`: GET `/api/products` e `/api/conversations` HTTP 200; `professional`: 403 quando sem permissão. Confirmar home não dispara solicitações não autorizadas. Sem revelar cookies/tokens.
- **P0:** exportação de Clientes, Agenda, Financeiro, Estoque, Comissões etc. deve baixar CSV válido com erro visível caso falhe. Comissão CSV deve trazer **6 lançamentos**, incluindo **1 revenda de R$ 11,99** no dataset de QA. Verificar soma por categoria e intervalo local de datas.
- **P1:** pagar **um lançamento** ou **um profissional**, sem incluir outros. O botão de todos deve exigir confirmação explícita. Testes da API devem garantir transação, isolamento de tenant, rejeição de pagamento duplicado e status; **não efetuar pagamentos reais de teste**.
- **P1:** ficha de cliente deve exibir atendimentos + serviços (incluindo múltiplos itens), com pagamentos apenas para `finance.read`. Testar 2 clientes de QA sem expor dados de pessoas em logs/PR.
- **P1:** movimentações de comissão devem mostrar tipo, profissional e cliente, quando autorizado e existente, sem ID técnico cru.
- **P1:** caixa deve distinguir aberto, fechado, erro temporário e proibido; sem texto `Verificando caixa…` permanente. Pix não entra no **dinheiro físico**; dois lançamentos de 28/10 totalizam R$ 719,90 e já estavam no financeiro, sem necessitar relançamento.
- **P1:** ao abrir Relatórios, valores devem carregar automaticamente. Quando API falhar, mostrar feedback (sem ocultar erro).
- **P2:** comissão da Limpeza de Pele está em 100%. **Não alterar para 40% ou outro valor sem decisão comercial explícita**; não recalcular comissões pagas.
- **Regressão:** checkout em dinheiro HTTP 201, baixa de estoque e comissão corretas; agendamento 10:00 Porto Velho armazenado como 14:00Z; proibir datas passadas; folga com 409 e mensagem específica; comissão com limite no servidor e frontend.
- **Observabilidade:** WhatsApp WAHA `WORKING`, SQLite `PRAGMA quick_check = ok`, APIs local e pública 200; zero mensagens disparadas como parte de QA, e não incluir conteúdo de conversas ou telefones nas evidências.

### 4. Entrega esperada do agente
- PR *draft* da branch R8, com lista de arquivos alterados, resumo das diferenças e testes executados.
- Relatório `PASS/FAIL/NOT TESTED` para cada critério; lista do que falta para homologação.
- Plano de rollback e comandos de verificação, mas **não executar rollback/restart/deploy sem aprovação explícita da Ti**.
- Preservar o baseline de integridade. Ao final, solicitar revisão humana dos hashes divergentes antes de atualização.

**Observação:** o percentual histórico gerencial do piloto é **75% homologado / 25% pendente**. Não aumentá-lo automaticamente por implementações sem testes de aceitação.
