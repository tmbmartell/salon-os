# NOVAGENTE Estética — Etapa 13: Simulação do dia operacional

**Data:** 27/10/2026  
**Estado:** teste automatizado com aprovação no GitHub Actions; **não houve implantação, pagamentos bancários ou uso de dados reais**.  
**Pull request:** https://github.com/tmbmartell/salon-os/pull/13

## Objetivo

Conferir se os módulos já implementados funcionam juntos, mesmo **sem WhatsApp conectado**, com uma rotina completa de um salão fictício. O teste sobe `server.mjs` em porta local aleatória e banco SQLite temporário; a base é descartada ao final.

### Cenário gerado

- Cinco clientes sintéticas, com números fictícios, sem conexão externa.
- Duas profissionais cadastradas e com escalas de atendimento.
- Dois serviços: Coloração QA (R$ 150, comissão 20%) e Escova QA (R$ 80, comissão 15%).
- Dois produtos, cada um ligado à ficha de consumo de um serviço.
- Sete agendamentos, em horários comerciais futuros para evitar conflitos com a agenda real.
- Cinco atendimentos efetivamente fechados no checkout, um cancelamento e uma falta.
- Desconto de R$ 10 em uma coloração, mais uma despesa fictícia de R$ 20.
- Pagamentos de teste pelos métodos Pix, dinheiro, débito e crédito. **Nenhuma cobrança nem captura real**.
- Fundo de caixa de R$ 50, entradas físicas de R$ 160, despesa física de R$ 20, fechamento esperado de R$ 190.

## Resultado apurado

| Medida | Esperado | Encontrado |
|---|---:|---:|
| Atendimentos com checkout | 5 | 5 |
| Não comparecimentos na agenda simulada | 1 | 1 |
| Cancelamentos na agenda simulada | 1 | 1 |
| Entradas financeiras | R$ 530,00 | R$ 530,00 |
| Despesas financeiras | R$ 20,00 | R$ 20,00 |
| Saldo financeiro | R$ 510,00 | R$ 510,00 |
| Comissões geradas | R$ 94,00 | R$ 94,00 |
| Caixa físico esperado ao fechar | R$ 190,00 | R$ 190,00 |
| Diferença de caixa | R$ 0,00 | R$ 0,00 |
| Saldo de pigmento | 330 g | 330 g |
| Saldo do finalizador | 125 ml | 125 ml |
| Tarefas internas de pós-atendimento | 5 | 5 |

**Importante sobre as datas:** a agenda sintética ocorre em uma data futura, mas as transações de checkout são registradas no instante da execução do teste. Portanto, o Olho do Dono considera 5 checkouts no período financeiro atual, enquanto o indicador histórico de falta só incluirá o não comparecimento quando a data agendada entrar no período observado. O teste mede falta e cancelamento na agenda **da data simulada**, sem modificar a regra de negócio.

**Recorrência:** uma das quatro clientes com checkout possui duas compras, resultando em **25%** pela fórmula histórica do painel. Ticket médio nominal: **R$ 106,00**.

## Proteções e fluxo aprovados

1. A recepção pode cadastrar cliente e realizar agendamentos, com senha própria, sem acessar finanças, comissões, indicadores gerenciais ou relatório gerencial.
2. Duas reservas com sobreposição de horário do mesmo profissional são impedidas (HTTP 409).
3. Checkout duplicado é rejeitado, sem duplicar receita, estoque ou comissão.
4. Um atendimento marcado como falta ou cancelado não pode ser cobrado via checkout.
5. Caixa em dinheiro é aberto antes de recebimentos, despesas são descontadas e o fechamento confere exatamente.
6. O estoque é debitado pelas quantidades reais, não pelas previsões de consumo.
7. Regras de pós-atendimento geram tarefas internas; não enviam mensagens a clientes.
8. O Financeiro, o relatório administrativo e o Olho do Dono concordam nos valores de entradas, despesas e saldo financeiro.

## Evidências reproduzíveis

- Execução automática: https://github.com/tmbmartell/salon-os/actions/runs/40469579748
- Resultado: **41 testes aprovados, zero falhas**, incluindo a simulação completa.
- Relatório sintético gerado por execução: https://github.com/tmbmartell/salon-os/actions/runs/40469579748/artifacts/12718381012
- Código da simulação: `tests/pilot-day.test.mjs`.
- O workflow `.github/workflows/security.yml` publica `artifacts/pilot-day/report.json` e `report.md` durante os testes com `NOVAGENTE_PILOT_REPORT=1`.

O artefato tem retenção de 14 dias e contém apenas agregações de dados fictícios, sem senhas, tokens, nomes completos de clientes ou dados reais.

## Roteiro de operação assistida — para etapa posterior

Executar com duas ou mais pessoas do salão e **base de demonstração isolada**, conferindo:

- Proprietária: configura o salão e os profissionais, acompanha resultados e confere o caixa.
- Recepção: inclui e busca cliente, cria agenda, cancela e registra ausência.
- Profissional: confere sua agenda e histórico autorizado, indica materiais realmente utilizados e ficha técnica.
- Caixa: registra pagamentos e confirma a saída de numerário autorizada.
- Gestora: verifica comissões, estoque crítico, serviços, recorrência, fechamento e pendências.

A homologação humana precisa registrar facilidade de uso, cliques desnecessários, mensagens de erro, situações de internet ruim, acessibilidade em dispositivos móveis e tempo de execução dos atendimentos.

## Limites ainda abertos

- **Não** foram conectados WhatsApp/WAHA, provedores bancários, Pix real nem maquininhas.
- Ainda não foram simuladas várias pessoas concorrentes no mesmo banco em carga intensa.
- Não equivale a testes físicos em Android/iPhone ou revisão de interfaces por usuárias reais.
- LGPD, autenticação multifator, CSRF, controle de privilégios, segurança, política de backup off-site e restauração em ambiente definitivo permanecem etapas de homologação.
- Nenhum merge ou deploy foi realizado. O PR permanece como **rascunho**, dependente das etapas anteriores.

**Decisão:** aprovado para seguir com um piloto supervisionado e isolado, ainda sem dados de clientes reais, não aprovado para produção pública.
