# Etapa 20 — Aceite operacional e interface móvel

**Escopo:** NOVAGENTE Estética, candidata à demonstração gratuita sem WhatsApp.  
**Data:** 27/10/2026. **Ambiente:** testes automatizados com banco fictício e sessão local.  
**Status:** automação de viewport adicionada; validação humana em aparelhos físicos **ainda pendente**.

## O que é executado automaticamente

O teste `tests/browser-smoke.mjs` percorre, no Chromium, as seguintes larguras: **360px, 390px e 768px**.

Em cada largura:
- o menu inferior deve estar visível;
- os botões Início, Agenda, Clientes e Gestão devem abrir a visualização correta;
- nenhuma falha JavaScript deve interromper a navegação;
- o documento não deve ter rolagem horizontal global não intencional;
- uma captura visual do último painel é salva no artefato do GitHub Actions.

O teste mantém as capturas da interface em desktop, validação de login, dashboard, estoque, financeiro, administração e a autenticação multifator realizadas nas etapas anteriores.

**Limite:** o Chromium com viewport reduzido não é um Android ou iPhone físico e não comprova performance real, teclado, notch, leitor de tela, acessibilidade completa, toque ou rede móvel.

## Roteiro de aceite com equipe real — pendente

Não executar no banco público descartável com dados reais. Usar exclusivamente cenário fictício e contas de teste.

| Papel | Tarefa | Evidência esperada | Situação |
|---|---|---|---|
| Proprietária | Login, visão geral, alertas e configurações | Entende receita, equipe e estoque sem abrir várias telas | Pendente |
| Recepção | Cadastrar cliente fictício com telefone inventado | Cadastro sem repetição, confirmação simples | Pendente |
| Recepção | Marcar, reagendar, cancelar e registrar ausência | Agenda não permite horário sobreposto | Pendente |
| Profissional | Consultar o necessário para executar serviço | Dados pessoais excessivos não devem ser expostos | Pendente |
| Caixa | Recebimento fictício e fechamento | Entradas e numerário conferem | Pendente |
| Gestora | Consultar estoque e compras | Identifica ponto de reposição e consumo real | Pendente |
| Gestora | Acessar dados sensíveis e exportação de clientes | Apenas perfis autorizados obtêm os dados | Pendente |
| Proprietária | Ativar MFA e recuperar entrada com código de uso único | Não perde acesso após troca de dispositivo | Pendente |
| Equipe | Usar Android e iPhone físicos | Sem bloqueios, campos escondidos ou necessidade de zoom | Pendente |
| Operador | Reiniciar a demonstração gratuita | Entende que os dados fictícios são apagados | Pendente |

## Critérios de avaliação por teste humano

Registrar para cada tarefa:
- **Concluiu?** (sim/não, sem assistência ou com assistência)
- **Quantos cliques?** (caminho observado, não estimado)
- **Dúvidas e erros** (descrição e captura *sem dados reais*)
- **Gravidade:** bloqueador / alta / média / baixa
- **Responsável e data** de correção

**Não declarar “aprovado por usuárias reais” até preencher a evidência, testar correções e obter aceite explícito da pessoa responsável.**

## Regras de privacidade

Não colocar credenciais, números pessoais de clientes, fotos de rostos, dados de saúde ou códigos MFA em capturas, tickets ou documentos públicos do GitHub.

## Continuidade

Pode seguir agora com correções de responsividade demonstradas automaticamente e preparação do pacote de entrega. Permanecem pendentes: a hospedagem gratuita ao vivo (depende de conta Render), testes com aparelhos físicos e o aceite humano.
