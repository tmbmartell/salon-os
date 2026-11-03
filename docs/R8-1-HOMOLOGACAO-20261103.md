# R8.1 — Relatório de correções e homologação (2026-11-03)

**Escopo:** as 6 correções da ordem R8.1, preservando a conciliação validada
(receitas R$ 1.549,90 · saídas R$ 761,99 · resultado R$ 787,91 · 5 atendimentos · ticket R$ 156,00).
**Produção:** `/srv/margot/novagente-estetica-whatsapp-pilot` — **não alterada nesta rodada**;
o código novo está na branch/PR para autorização.

## Ambiente de homologação

Cópia isolada do código (branch) + cópia consistente do banco de produção, porta **19345**,
WhatsApp desligado (`WAHA_BASE_URL` em porta morta) e IA de recepção desativada.
Usuários criados **apenas na cópia**: owner, manager, recepção, **profissional A** (vinculada à
"Camila Profissional QA"), **profissional B** (profissional nova, sem agenda) e owner de outro
tenant. Vínculos feitos por `users.professional_id` — nunca por nome.

## Resultado por correção

| Correção | Status | Evidência |
| --- | --- | --- |
| 1. Isolamento por profissional | **PASSOU** | Profissional A: 9 agendamentos (todos dela) e 2 clientes; B: 0 e 0; owner/recepção: 15 e 9; acesso direto a ID alheio → 404 |
| 2. Mensagem de finalização | **PASSOU** | Toast exato, modal não abre, `/api/checkout/:id/prep` 403, zero checkout/comissão gerados |
| 3. Comissão 0–100 | **PASSOU** | 40 e 100 aceitos; 101, 150, −1, "abc", "50,5,5" → 400 `invalid_commission_pct`; criação e edição; Limpeza de Pele intacta em 100% |
| 4. Status no CSV da agenda | **PASSOU** | CSV traz "Agendado/Confirmado/Finalizado…", sem `scheduled/confirmed` crus; demais colunas preservadas |
| 5. Lotes de estoque | **PASSOU** | 2 lotes do mesmo produto; consumo FEFO (A antes de B); movimento com `lot_id`; saldo global 20→12→6; excesso 409 sem baixa; produto sem lote consome sem lote |
| 6. Agendamentos antigos | **PASSOU (diagnóstico)** | 15 analisados, 10 com inconsistência, 6 seguros para remoção, 2 com vínculo financeiro; nada apagado |

## Correção 1 — isolamento (detalhe)

- `users.professional_id` (migração `ALTER TABLE`, retrocompatível) é o único vínculo aceito.
- Filtro aplicado no **backend** por `tenant_id` + profissional, no mesmo critério usado pela
  comissão: itens do atendimento (`appointment_items`) ou o profissional legado do agendamento.
- Endpoints cobertos: `/api/appointments` (GET/POST/PATCH), `/api/clients` (lista e busca),
  `/api/clients/:id/history`, `/api/appointments/tag-suggestions`, `/api/dashboard`,
  `/api/bootstrap` e fichas técnicas (`/api/clients/:id/technical` GET/POST).
- Profissional **sem vínculo**: `/api/clients`, `/api/appointments` e histórico devolvem
  **403 `professional_not_linked`**; dashboard volta zerado com `professional_link_required: true`.
- Profissional não cria atendimento em nome de outra (`403 professional_scope_forbidden`) e não
  altera status de atendimento alheio (404).
- Telefone do time é omitido no bootstrap para o perfil profissional.
- Interface: menu, atalhos e painéis da home respeitam o perfil — inclusive depois do login
  (o filtro agora roda também no `bootstrap`, não só no carregamento anônimo).

## Correção 2 — finalização
`openCheckout` trata 403/404/409 com mensagem própria. Para profissional:
"Somente a recepção ou a gestão pode finalizar e receber pagamentos. Solicite a finalização do
atendimento." — sem abrir formulário e sem gerar receita/comissão.

## Correção 3 — comissão
Regra única em `finance-rules.mjs` (`commissionPct`), usada em: criação e edição de serviço
(`POST`/`PUT /api/services`), criação de produto e configuração de revenda
(`sale_commission_pct`). Nada é corrigido em silêncio: valor inválido volta 400 com
`invalid_commission_pct` e a mensagem em português. No formulário, o campo é texto com validação
local e aviso `A comissão deve estar entre 0% e 100%. Confira o valor informado.`

## Correção 4 — CSV
Mapa de status aplicado só na exportação (`scheduled → Agendado`, `confirmed → Confirmado`,
`arrived → Chegou`, `in_service → Em atendimento`, `completed → Finalizado`, `cancelled → Cancelado`,
`no_show → Não compareceu`). O banco continua com os valores técnicos.

## Correção 5 — lotes
Teste automatizado em banco temporário (`tests/r8-1-lots.test.mjs`) cobrindo: entrada por compra,
dois lotes do mesmo produto, ordem por validade, consumo que atravessa dois lotes, baixa no saldo
global, histórico com `lot_id` e código do lote, bloqueio de consumo acima do saldo e produto sem
lote. **Nenhum lote fictício foi criado no estoque real.**

## Correção 6 — dados antigos
Relatório completo em `docs/R8-1-DADOS-ANTIGOS-20261103.md`:
15 agendamentos, 10 com inconsistência (passado ativo, folga, fora da jornada, provável fuso
antigo), 6 seguros para remoção, 2 com vínculo financeiro (não remover). Scripts entregues:
auditoria (somente leitura), limpeza com quarentena reversível (dry-run por padrão) e restauração.
**Nada foi apagado ou corrigido.**

## Regressão

- `npm run check`: OK.
- `npm test`: **109 testes, 109 aprovados, 0 falhas** (105 anteriores + 4 novos: 3 de isolamento/
  comissão/CSV e 1 de lotes).
- Conciliação preservada: 15 lançamentos, 5 comissões, R$ 372 de comissões de serviço, R$ 11,99 de
  revenda, despesa R$ 80 única — sem alteração de valores.
- Produção (somente leitura): serviço ativo, `/api/health` 200, WhatsApp `WORKING`,
  `quick_check` ok, baseline intacto (sha256 `7e003a6f…`).

## Não feito (por regra)
1. Deploy em produção — aguarda autorização.
2. Limpeza/exclusão dos agendamentos antigos — aguarda autorização da proprietária.
3. Alteração da comissão da Limpeza de Pele — decisão comercial pendente.

## Riscos e rollback
- A migração adiciona uma coluna; não altera dados existentes. Usuários profissionais existentes
  ficam **sem vínculo** até a proprietária vincular em Administração → Usuários e acessos, e nesse
  estado não veem agenda/clientes (comportamento exigido).
- Agendamentos antigos fora da jornada continuam existindo; o bloqueio vale para novos.
- Rollback: `git revert` dos commits da branch. Produção não foi alterada.
