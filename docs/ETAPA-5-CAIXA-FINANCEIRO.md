# NOVAGENTE Estética — Etapa 5: Caixa Visual e Financeiro

**Estado:** entregue para revisão no GitHub. **Não homologado em navegador, sem merge e sem deploy em produção.**

## Interface e navegação

Tela de Caixa e Financeiro com seis cards de acesso:
1. **Registrar recebimento:** cria lançamento manual de receita. Atendimento já realizado deve ser recebido pelo checkout na Agenda.
2. **Registrar despesa:** contabiliza saída ou conta prevista, com situação pago/pendente.
3. **Caixa do dia:** abertura, saldo esperado em dinheiro, detalhamento por meio de pagamento, sangria, fechamento e histórico.
4. **Movimentações:** lançamentos confirmados e pendentes, com baixa orientada e método explícito.
5. **Comissões:** resumo, registros, confirmação do pagamento e escolha do meio de pagamento.
6. **Resultados:** margem direta e DRE; detalhes somente quando esta área é aberta.

A primeira impressão mostra três indicadores simples: entradas, saídas e resultado do dia. Os detalhes ficam recolhidos.

## Regras de segurança financeira

- Dinheiro convertido para centavos com validação de até duas casas decimais.
- Não permite abertura de novo caixa se já há outro aberto para a empresa.
- O **saldo físico esperado** considera fundo inicial, entradas e saídas pagas em dinheiro e retiradas (sangrias).
- A sangria é registrada numa tabela própria, pois **transferir dinheiro ao cofre não é uma despesa**, evitando distorção de DRE.
- Retirada e pagamento físico que excedem o saldo são recusados.
- Ao fechar, o usuário precisa digitar o valor físico contado; o sistema **não preenche automaticamente com o valor esperado**.
- Diferenças de fechamento exigem uma justificativa mínima de oito caracteres e ficam registradas no histórico/auditoria.
- Contas pendentes **não são marcadas automaticamente como Pix**. A forma efetivamente utilizada deve ser selecionada.
- Comissões exigem confirmação e método de pagamento. Quando pagas em dinheiro, impactam o saldo esperado do caixa.
- Lançamentos e operações são sempre filtrados pelo salão e sujeitos às permissões atuais.

## Exemplo de conferência

- Abertura com R$ 100.
- Recebimento em dinheiro R$ 50 e Pix R$ 75.
- Despesa em dinheiro R$ 25.
- Sangria de R$ 30.

**Saldo esperado físico: R$ 95**; o Pix de R$ 75 não aumenta a quantidade de cédulas na gaveta.

Se forem contados R$ 94, o fechamento registra **diferença de -R$ 1** e exige uma justificativa.

## Arquitetura técnica

- `finance-rules.mjs`: regras puras de centavos, métodos e diferenças de caixa.
- `phase2.mjs`: API de caixa, sangria, histórico, resumos e baixa de pendências/comissões.
- `public/index.html`, `public/app.js`, `public/beauty-ui.css`: cards, fluxos e formulários.
- `tests/finance-cash.test.mjs`: testes de saldos, sangrias, pagamentos e isolamento.
- Corrigidos seletores da navegação de estoque herdados da Etapa 4.

## Antes da implantação real

- Testar a interface em navegador e celular.
- Homologar abertura, saídas, fechamento, diferença, pendências e comissões com um salão piloto.
- Revisar política de desconto, reembolso/estorno e reconciliação de cartões/Pix (integrações externas não estão implementadas).
- Definir o fuso horário de cada salão e validar relatórios por **dia local**. A implementação atual utiliza o tempo do servidor para o recorte de hoje; não está homologada para múltiplos fusos.
- Conferir emissão de recibos/documentos fiscais conforme legislação aplicável.
- Revisar permissões por cargo, incluindo separação de caixa, financeiro e gerência.
- Homologar recuperação de backup e consistência após falhas.

**A API não movimenta fundos em contas bancárias**. Os registros são controles gerenciais declaratórios, não transferências automáticas.
