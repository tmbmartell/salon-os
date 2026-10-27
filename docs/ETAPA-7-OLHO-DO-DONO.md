# NOVAGENTE Estética — Etapa 7: Olho do Dono

**Estado:** implementação disponível em branch de revisão. Testes automáticos não substituem a homologação operacional. Não realizar merge nem deploy em produção antes de revisar.

## Objetivo da experiência

A proprietária abre a plataforma e encontra quatro informações essenciais, sem tela sobrecarregada:

1. **Entradas recebidas nos últimos 30 dias** — pagamentos efetivamente confirmados no Financeiro, sem somar checkout novamente.
2. **Atendimentos com checkout nos últimos 30 dias** — quantidade e ticket nominal, independentemente do momento em que o dinheiro entrou.
3. **Clientes que já voltaram** — taxa histórica de clientes com dois ou mais checkouts entre aqueles que já concluíram ao menos um.
4. **Pontos de atenção** — alertas acionáveis, não notificações decorativas.

O restante permanece recolhido em cinco abas/cards: **Atenção, Dinheiro, Serviços, Equipe e Clientes**.

## Fontes e significados dos números

- Entradas e despesas: `financial_entries`, `status='paid'`, usando **`paid_at`**. Os valores não são duplicados usando `checkout_records`.
- Saldo financeiro do período: entradas recebidas menos despesas pagas. **Não corresponde ao lucro contábil** e não considera tudo que foi provisionado nem pagamentos futuros.
- Checkouts finalizados: registros de `checkout_records` no período. O valor nominal inclui eventuais créditos de pacotes, portanto **não é equivalente ao dinheiro recebido**.
- Ticket: valor nominal dos checkouts dividido pela quantidade de registros encerrados, não pela quantidade de itens em serviços combinados.
- Recorrência: clientes com ao menos dois checkouts sobre clientes com um ou mais, considerando todo o histórico.
- Ranking de profissionais e serviços: receita nominal do checkout atribuída ao profissional e serviço principais; **não faz rateio correto de serviços combinados** (planejado para relatórios mais avançados).
- Alertas: estoque com saldo até mínimo, contas a pagar vencidas, tarefas de relacionamento atrasadas e percentual de faltas nos últimos 30 dias (a partir de cinco atendimentos com resultado).
- Gráfico de 14 dias: entradas efetivamente pagas por dia local.
- O período considera o **fuso cadastrado em `tenants.timezone`**. Referência para comparação de 30 dias imediatamente anteriores ao período atual.

## Navegação e ações

Alertas levam à área correspondente: estoque, financeiro, relacionamento ou agenda. Eles não executam despesas, comunicações ou ajustes automaticamente.

Não há previsão de receitas futuras apresentada como se fosse receita confirmada.

## Segurança

- API gerencial `GET /api/owner-eye/summary` restrita à proprietária e gerência.
- Rotas legadas de inteligência agora seguem a mesma restrição para evitar acesso indireto por recepção.
- Interface oculta o acesso à área para perfis sem autorização, mas **a permissão verdadeira é verificada no servidor**.
- Consultas financeiras, de estoque e de equipe sempre levam `tenant_id`; junções do checkout conferem empresa nas referências.
- O resumo não devolve nomes de clientes, números de telefone ou fichas técnicas.
- Rankings contêm nomes dos profissionais e serviços, exclusivamente a pessoas autorizadas.

## Critérios para homologação

1. Conferir receitas e despesas em dois períodos de 30 dias e garantir ausência de dupla contagem.
2. Simular checkout com pagamento em Pix, dinheiro e pacote; diferenciar receita nominal de entrada financeira.
3. Conferir o cálculo do ticket e da recorrência de cada cliente com checkout.
4. Conferir o dia local quando UTC já está no dia seguinte.
5. Simular conta vencida, estoque abaixo do mínimo e tarefa de relacionamento atrasada.
6. Testar com proprietária, gerente, recepção e profissional: dois primeiros podem consultar, demais recebem 403.
7. Testar isolamento entre dois salões com movimentações financeiras e funcionários distintos.
8. Verificar abertura dos cards e gráfico em celular e desktop.
9. Testar o painel com mais dados para medir latência e validar índices e agregações.
10. Fazer uma rodada real com o salão piloto antes de publicar.

## Arquivos principais

- `owner-eye.mjs`: função de indicadores e API gerencial protegida.
- `phase3.mjs`: restrição de acesso às rotas legadas de inteligência.
- `server.mjs`: registro da API protegida.
- `public/index.html`, `public/app.js`, `public/beauty-ui.css`: interface por cards e dados reais.
- `tests/owner-eye.test.mjs`: testes de números, período, fuso e segregação.

### Testes

```bash
npm run check
npm test
```

**Próximo ciclo planejado:** Etapa 8 — Administração, configurações e maturidade do produto; também é necessário realizar homologação ponta a ponta das etapas anteriores antes de produção.
