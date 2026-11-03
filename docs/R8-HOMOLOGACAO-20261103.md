# R8 — Relatório de homologação (2026-11-03)

**Escopo:** NOVAGENTE Estética — pendências da issue #35.
**Branch:** `r8/reconcile-vps-20261103` · **PR:** #36.
**Produção:** `/srv/margot/novagente-estetica-whatsapp-pilot` (serviço ativo, **não alterado nesta rodada**).

## Como a homologação foi feita

A pasta de produção não é repositório Git e não pode ser sobrescrita. Para testar de verdade
sem tocar em dados financeiros, a homologação rodou em uma **instância isolada**:

| Item | Valor |
| --- | --- |
| Código | clone do repositório, branch R8 (idêntico ao que está no PR) |
| Banco | cópia consistente (API de backup do SQLite) do banco de produção |
| Porta | `127.0.0.1:19344` (produção segue em `19333`) |
| WhatsApp | desabilitado (`WAHA_BASE_URL` apontando para porta morta, IA desligada) |
| Usuários de teste | owner, manager, reception, professional + owner de outro tenant, criados **apenas na cópia** |
| Pagamentos | executados **apenas na cópia**, com comissões geradas por um checkout de teste |

Nenhum restart, deploy ou escrita foi feito em produção.

## Resultado por etapa

| Etapa | Status | Evidência principal |
| --- | --- | --- |
| 1. Preservar e sincronizar | **PASSOU** | 126 arquivos sincronizados, backup tar.gz, `docs/R8-SYNC-VPS-20261103.md`, PR #36 |
| 2. Autenticação e permissões | **PASSOU** | 5 logins OK; matriz de 39 endpoints × 4 perfis; home do profissional sem `/api/products` e `/api/conversations` |
| 3. Exportações e relatórios | **PASSOU** | 8 CSVs baixados pelo navegador; comissões com 6 lançamentos (5 serviços + revenda R$ 11,99); cards automáticos |
| 4. Pagamento de comissões | **PASSOU** | pagamento individual 200, repetição 409, transação única, auditoria com ids |
| 5. Histórico das clientes | **PASSOU** | 7 visitas/3 pagamentos e 5/1; multi-serviço; pagamentos só com `finance.read`; outro tenant 404 |
| 6. Financeiro e movimentações | **PASSOU** | descrições legíveis no extrato e no CSV; DRE, caixa e relatórios com os mesmos totais |
| 7. Caixa e Pix | **PASSOU** | Dinheiro R$ 46,01 (fundo + entradas − saídas) e Pix R$ 841,90; R$ 719,90 de 28/10 visíveis |
| 8. Agenda e fuso | **PASSOU** | 10:00 local → 14:00Z exibido como 10:00; passado, folga, fora da jornada e conflito bloqueados |
| 9. Comissão da Limpeza de Pele | **AGUARDA DECISÃO** | 100% confirmado, margem direta 0%; nenhum valor alterado |
| 10. Homologação final | **PASSOU (QA)** | 105 testes automatizados, 0 falhas; deploy pendente de autorização |

## Etapa 1 — sincronização
- `main` estava defasada: faltavam as etapas 2–28 e as correções R8 (+12.673/−395 linhas).
- A VPS foi copiada para o clone com exclusão de `data/`, `.env*`, `*.bak-*`, logs e segredos;
  auditoria não encontrou credencial, banco ou dado pessoal no que foi publicado.
- Commits: `6298aaa` (código) e `6fbde25` (documento de reconciliação).

## Etapa 2 — autenticação e permissões
- Login 200 para owner, manager, reception, professional e owner de outro tenant.
- Owner: 200 em Produtos, Conversas, Financeiro, Caixa, Relatórios, Estoque, Administração (39 endpoints).
- Professional: 403 em `/api/products`, `/api/conversations`, `/api/finance/*`, `/api/commissions`,
  `/api/reports/*`, `/api/cash/*` — bloqueio correto, sem ampliar permissões.
- Home: o log de rede do profissional mostra `/api/auth/me`, `/api/dashboard`, `/api/clients`,
  `/api/bootstrap` e **nenhuma** chamada a produtos/conversas (causa dos 403 observados).
- Menu e atalhos agora escondem módulos sem permissão e `activate()` recusa a view com aviso
  (“Seu perfil não tem acesso a este módulo”), em vez de tela vazia.
- Sessão: cookie `HttpOnly`, `SameSite=Lax`, `Max-Age=604800`; inatividade de 8h expira (401);
  `expires_at` vencido expira (401); novo login restabelece.
- Isolamento: histórico de cliente de outro tenant → 404; listas não se misturam.

## Etapa 3 — exportações e relatórios
- Download real pelo navegador (CDP): financeiro, clientes, agenda, estoque, comissões, equipe e
  vendas de produtos — 8 arquivos, CSV UTF-8 com `;`.
- Comissões (janela de homologação): 6 linhas = 5 comissões de serviço (R$ 372,00) + 1 revenda de
  R$ 11,99.
- Período passou a ser interpretado em **data local do salão** (04:00Z–03:59:59Z do dia seguinte);
  datas dos CSVs agora saem em `dd/mm/aaaa hh:mm` local.
- Cards de Relatórios carregam sozinhos ao abrir; falha de API mostra mensagem (não fica em “—”).
- Profissional recebe 403 e mensagem clara ao tentar exportar.

## Etapa 4 — comissões
- Botões “Pagar este”, “Pagar profissional” e “Pagar todos (confirmar)” com modal exibindo
  quantidade e **total antes de confirmar**.
- Backend transacional (`BEGIN IMMEDIATE`): todos os ids ou nenhum; ids já pagos → 409
  `commission_not_pending`; caixa insuficiente → 409.
- Auditoria registra usuário, data, valor, forma e **ids** dos lançamentos.
- Teste real na cópia: checkout R$ 120 gerou comissão de R$ 48; pagamento individual 200;
  segunda tentativa 409; nenhuma comissão de outra profissional foi afetada.

## Etapa 5 — histórico das clientes
- `GET /api/clients/:id/history` com tenant + `clients.read`; pagamentos somente com `finance.read`.
- Ficha mostra data/hora local, serviços individuais (`A + B` em atendimento múltiplo), situação e
  pagamento vinculado (“Nenhum pagamento vinculado” quando não houve).
- Duas clientes de QA: 7 visitas/3 pagamentos e 5 visitas/1 pagamento; como profissional,
  `show_payments=false` e zero pagamentos; outro tenant → 404.

## Etapa 6 — financeiro
- Novos pagamentos de comissão gravam descrição legível já no lançamento
  (“Comissão de serviço · Profissional · Cliente”); lançamentos antigos com código são traduzidos
  na interface **e no CSV** pelo vínculo, sem reescrever o histórico.
- Despesa R$ 80 aparece uma única vez em Financeiro, Caixa, Movimentações, DRE e CSV.
- Totais conferem: entradas R$ 710, saídas R$ 463,99, comissões R$ 372, resultado R$ 246,01
  (dataset de homologação, antes do checkout adicional de teste).

## Etapa 7 — caixa e Pix
- Textos residuais “Verificando caixa…” e “SEM ACESSO” não existem mais no código.
- Estados: `ABERTO`, `FECHADO`, `INDISPONÍVEL` (falha com “Tentar novamente”) e mensagem de
  permissão para quem não tem `cash.read`.
- Pix de 28/10 (R$ 600 e R$ 119,90) estavam no financeiro com sessão nula e não apareciam no
  consolidado; o caixa agora considera lançamentos pagos do período sem vínculo de sessão.
- Resultado: **Dinheiro R$ 46,01** (fundo R$ 100 + R$ 410 − R$ 463,99) e
  **Pix R$ 1.139,90 de entradas** (600 + 119,90 + 300 + 120 de teste) **− R$ 298,00**.
- Vendas em Pix/cartão e pacotes passam a gravar `cash_session_id` quando há caixa aberto.

## Etapa 8 — agenda e fuso
- `America/Porto_Velho` (UTC−4): criação às 10:00 grava `14:00Z`, agenda e ficha exibem 10:00.
- Bloqueios no servidor: passado (400), conflito de profissional/recurso (409), folga (409
  `professional_time_off`), fora da jornada ou atravessando o dia (409
  `professional_outside_schedule` com `window_start`/`window_end`).
- Interface converte o horário digitado usando o fuso do salão, independente do fuso do navegador,
  e mostra mensagem específica por motivo.
- **Inconsistência histórica identificada (não corrigida):** agendamentos criados antes do ajuste
  estão gravados como 10:00Z (06:00 local). Exemplo no dataset de QA: 05/11 06:00. Precisa de
  decisão humana antes de qualquer migração.

## Etapa 9 — Limpeza de Pele (decisão comercial)
- Configuração atual: preço R$ 180, comissão 100% → comissão R$ 180, custo direto R$ 180,
  **margem direta 0%**.
- Referência: a 40% a comissão seria R$ 72 e a margem direta R$ 108 (60%) — **hipótese, não aplicada**.
- Nenhuma comissão histórica foi recalculada.

## Etapa 10 — regressão
- `npm run check`: OK em todos os arquivos.
- `npm test`: **105 testes, 105 aprovados, 0 falhas** (103 anteriores + 2 novos de fuso/agenda).
- Produção (somente leitura): serviço `active` desde 15:24:52 UTC; `/api/health` 200; WhatsApp
  `WORKING`; `PRAGMA quick_check = ok`; baseline de integridade intacto
  (`data/monitoring/baseline.json`, sha256 `7e003a6f…`, mtime 29/10).

## O que NÃO foi feito (e por quê)
1. **Deploy em produção** — proibido sem autorização explícita. O código está no PR, testado na cópia.
2. **Alteração da comissão da Limpeza de Pele** — depende da taxa aprovada pela proprietária.
3. **Correção dos horários históricos em UTC errado** — exige decisão sobre migração.
4. **Teste autenticado na produção** — não há credencial da proprietária nesta sessão; a validação
   autenticada foi feita na cópia idêntica (código + dados).
5. **Envio de mensagens de WhatsApp** — bloqueado por regra; nenhuma mensagem foi disparada.

## Riscos
- A cópia do banco tem os mesmos dados da produção no momento do snapshot; testes criaram um
  atendimento/checkout/comissão apenas na cópia.
- O caixa agora soma lançamentos sem vínculo de sessão criados após a abertura: se houver lançamento
  retroativo com data antiga, ele não entra (usa `created_at`).
- O bloqueio de jornada vale para novos agendamentos; agendamentos legados fora da janela continuam
  existindo e aparecem na agenda.

## Rollback
- Código: `git revert` dos commits desta branch (nenhum deploy foi feito).
- Produção: nada a reverter nesta rodada; permanece no estado de 15:24 UTC.
- Cópia de QA: parar o processo na porta 19344 e apagar `/root/qa-r8` (dados de teste).
