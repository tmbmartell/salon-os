# NOVAGENTE Estética — Kanban de Mensageria, simples e fluido

## Intenção da referência
O modelo enviado pela administradora mostra cartões separados em etapas comerciais, filtros simples, contadores por coluna, movimentação direta e a possibilidade de abrir a conversa. **Não copiar cores nem a identidade de outra empresa.** Manter linguagem e tokens visuais NOVAGENTE.

## Experiência implementada
- A tela **Atendimento** abre em visão de cinco colunas: **Novos**, **Aquecendo**, **Quer agendar**, **Precisa de atenção** e **Pós-venda**. Cabeçalhos apresentam quantidade por etapa; cartões resumem nome, origem, última mensagem, prioridade, recepção IA/humana e status de resposta.
- Arrastar para outra coluna (desktop) ou usar **Mover para** (celular, teclado e desktop) persiste a categoria na API autenticada. Uma edição manual impede que a IA sobreponha silenciosamente a decisão.
- Clicar no cartão coloca conversa e classificação em foco, com mensagens, agendamento, ficha e explicação de classificação sem poluir o Kanban inicial; **Voltar ao Kanban** recupera o quadro.
- **Ver lista / Ver Kanban** alterna para a interface antiga. Os filtros de busca, status, prioridade e não lidas continuam aplicados ao quadro.
- Layout com rolagem horizontal em telas pequenas, botões grandes e contraste da identidade NOVAGENTE. Nenhuma regra de backend, autenticação ou automação de mensagens foi alterada.

## Mapeamento das categorias reais
| Etapa visual | Categorias técnicas existentes |
| --- | --- |
| Novos | general, other |
| Aquecendo | lead, vip |
| Quer agendar | appointment |
| Precisa de atenção | waiting, complaint, finance |
| Pós-venda | post_sale |

**Importante:** não marcar cliente como comprador apenas por palavras. A coluna "Clientes/Compraram" da referência será criada somente quando baseada em venda/atendimento comprovado no ERP, em uma etapa posterior.

## Testes
- Chrome/Playwright criou uma conversa em banco temporário, verificou quadro e cinco colunas, alterou categoria de `general` para `lead`, conferiu persistência na API, abriu o atendimento, retornou ao Kanban, alternou lista/quadro e gerou capturas desktop/mobile.
- `npm run check`, `npm test` (**139/139**), `QA_CHROME=/usr/bin/google-chrome node tests/browser-smoke.mjs`: aprovados na branch.
- Nenhum envio pelo WAHA; nenhum dado ou login de produção alterado durante os testes de interface.

## Segurança de implantação
Antes de instalar: backup do banco por SQLite backup e do código, validação do commit, cópia sem sobrescrever `.env.runtime`, `data/` ou identidades; verificação HTTP das duas URLs públicas, sessão WAHA e JavaScript em navegadores desktop/mobile.
