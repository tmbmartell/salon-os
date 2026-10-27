# Etapa 4 — Estoque Inteligente e Compras

**Produto:** NOVAGENTE Estética, desenvolvido sobre a base Salon OS.

**Situação:** implementação em branch separada, pendente de homologação visual e operacional. Nenhuma alteração em produção.

## Experiência do usuário

- Tela inicial de Estoque com **quatro cards clicáveis**: Produtos, Consumo por Serviço, Movimentações e Lotes; os detalhes ficam ocultos até serem solicitados.
- Compras organizadas em quatro cards: Fornecedores, Reposição, Pedidos e Histórico de Preços.
- Produto em card expansível com saldo, unidade, mínimo, custo por unidade e opção de ajuste.
- Consumo por serviço em card expansível, com quantidade padrão por produto.
- Checkout apresenta por produto a **quantidade prevista**, a média histórica da cliente (quando disponível), o saldo atual e a **quantidade real** confirmável/editável.
- Resultado do caixa, comissão e consumo seguem compartilhando o fechamento existente; **nenhum segundo estoque** foi criado.

## Regras de negócio implementadas

1. Cadastro novo de produto em unidade **g**, **ml**, **un**, **kg** ou **l**. A quantidade é registrada sempre na unidade escolhida; o sistema **não converte gramas em mililitros** e não converte automaticamente entre unidades.
2. Quantidades finitas, não negativas (exceto ajustes com motivo), com precisão máxima de três casas decimais; produtos por unidade requerem quantidade inteira.
3. Receita de consumo vinculada a um serviço da própria empresa; produtos devem existir, ser ativos e não se repetir na mesma receita.
4. Atendimento com serviços combinados: os consumos padrão são somados por produto; a quantidade total realmente utilizada é distribuída proporcionalmente entre os serviços, com cuidado para manter unidades inteiras.
5. Fechamento verifica saldo de cada produto antes de registrar movimentos; se o saldo for insuficiente, impede o fechamento sem gerar estoque negativo ou baixa parcial.
6. Finalização utiliza transação do banco: pagamento, comissões, baixa de estoque e histórico de consumo são confirmados juntos.
7. Ajuste manual exige motivo, valida a unidade e recusa retirada acima do saldo.
8. Consulta resumida de receitas por `/api/stock/recipes-overview` usa permissão de estoque e **não expõe comissão ou margem financeira**.
9. Migração idempotente assegura a coluna de comissão de revenda no cadastro de produtos, corrigindo inconsistência da estrutura anterior.
10. Consultas de estoque, produtos, receitas, compras e consumos incluem filtros por empresa nas junções de dados revisadas.

## Exemplo

- Coloração prevê 60 g de pigmento; retoque prevê 40 g do mesmo pigmento.
- No checkout a profissional confirma que usou 125 g no conjunto.
- Sistema registra 75 g na coloração e 50 g no retoque, mas desconta **somente 125 g** no total.
- Se houver apenas 120 g disponíveis, o fechamento é recusado, sem desconto parcial ou cobrança registrada.
- Para produtos por `un`, não é permitido registrar 0,5 unidade.

## Escopo que permanece para próximos ciclos

- Experiência visual completa de compras e recebimentos em navegador, com simulação de pedidos, lotes e validade.
- Rotinas de inventário físico e diferenças por lote.
- Conversões assistidas kg↔g e L↔ml, caso seja necessário cadastrar embalagens em uma unidade e consumir em outra.
- Retificação auditável de consumo após fechamento.
- Análise de vencimento e quarentena de lotes expirados em todas as saídas.
- Homologação com profissionais e dados reais de salão piloto.

## Verificações

```bash
npm run check
npm test
```

Testes incluem precisão de quantidades, unidades indivisíveis, serviços combinados, validação de produto/receita e ajuste com saldo insuficiente. A homologação completa depende de navegador e operações integradas de teste.

**Pull request em rascunho. Não publicar nem mesclar antes da validação operacional.**
