# NOVAGENTE Estética — Etapa 9: Relatório de Homologação Integrada

**Data de execução:** 27 de outubro de 2026  
**Repositório:** `tmbmartell/salon-os`  
**Branch isolada:** `test/novagente-estetica-homologacao-integrada`  
**Pull request:** https://github.com/tmbmartell/salon-os/pull/9  
**Status geral:** testes automatizados **APROVADOS**; homologação com integrações externas e operação real **PENDENTE**.

## 1. Ambiente e proteção dos dados

As baterias foram executadas no GitHub Actions, usando Node.js 22, um banco SQLite descartável em diretório temporário e um servidor `server.mjs` real iniciado em porta local aleatória. O navegador foi o Google Chrome do runner de testes por meio do Playwright.

**Não foi acessado o banco da produção**, não foi realizado deploy/merge e não foram disparadas mensagens no WhatsApp. Contas, clientes, produtos, atendimentos e campanhas eram dados fictícios.

## 2. Testes automáticos de API e integração: APROVADOS

**Resultado:** 36 testes aprovados, 0 falhas.  
**GitHub Actions:** https://github.com/tmbmartell/salon-os/actions/runs/40457961922

A nova bateria HTTP iniciou o servidor e percorreu:

1. Primeiro acesso, cadastro da proprietária, login, cookie de sessão e leitura do `bootstrap`;
2. Criação de cliente no CRM;
3. Cadastro de produto, receita de consumo padrão e regra de pós-atendimento por serviço;
4. Campanha em rascunho;
5. Agendamento e ficha técnica vinculada ao atendimento;
6. Bloqueio de conclusão de atendimento por simples alteração de status: checkout obrigatório;
7. Tentativa de receber um atendimento com consumo superior ao saldo: operação negada **sem debitar estoque**;
8. Checkout por Pix: recebimento registrado uma única vez, comissão lançada e baixa de 65 g reais em lugar dos 60 g previstos;
9. Atendimento com **dois serviços** que compartilham o mesmo produto: 60 g + 40 g previstos; 125 g reais rateados entre os serviços **sem baixa em duplicidade**;
10. Recebimento em dinheiro bloqueado sem caixa aberto, seguido de abertura, checkout, conferência do valor físico esperado e fechamento correto;
11. Criação de uma única tarefa interna de pós-atendimento, sem envio automático de WhatsApp;
12. Atualização dos indicadores do Olho do Dono;
13. Convite de recepcionista, aceite com senha individual e login;
14. Bloqueio do acesso da recepção a financeiro, gestão proprietária, informações privadas da equipe e novos convites;
15. Tentativa de falsificar identificador de salão via cabeçalho sem trocar o salão autenticado.

Essas validações operacionais são reproduzíveis executando `npm test`, que inclui `tests/integration-http.test.mjs`.

## 3. Teste real de interface com navegador: APROVADO

**Resultado:** navegador real completou o fluxo sem exceções de JavaScript não tratadas.  
**GitHub Actions:** https://github.com/tmbmartell/salon-os/actions/runs/40457961723

O script `tests/browser-smoke.mjs` testa:
- primeiro acesso e formulário de criação de proprietária;
- formulário de login e entrada no painel;
- dashboard, agenda e ações de navegação;
- estoque: abertura dos cards e seleção de Consumo por serviço;
- financeiro: cards e Movimentações;
- marketing: abertura e criação de campanha em rascunho;
- Olho do Dono e atualização dos números;
- Administração e sua organização visual;
- renderização da Administração em viewport mobile.

**Capturas geradas:** primeiro acesso, dashboard desktop, estoque desktop, Olho do Dono desktop, administração desktop e administração mobile.  
**Artefato da execução:** https://github.com/tmbmartell/salon-os/actions/runs/40457961723/artifacts/12713650513

As imagens foram capturadas automaticamente; ainda é necessária revisão humana de legibilidade, responsividade, contraste e usabilidade em dispositivos físicos.

## 4. Problemas encontrados e corrigidos durante os testes

- Botão de exportação de marketing legado não existia mais no HTML, mas seu manipulador ainda era acessado como obrigatório; erro bloqueava a interface antes do primeiro login.
- Um `async` isolado antes de uma declaração de função causava `ReferenceError` no navegador, embora a verificação sintática do arquivo passasse.
- Nove seletores que deveriam operar em vários elementos usavam `querySelector` em vez de `querySelectorAll`, afetando painel gerencial, serviços, conversas, estoque e compras.
- Texto literal `\\n` sobrando entre tags de scripts no HTML foi removido.
- O teste de navegador foi aprimorado para capturar stack traces reais; alguns seletores da automação também foram corrigidos durante a montagem.

**Resultado:** após essas correções, a suíte funcional e a suíte do navegador ficaram verdes.

## 5. O que continua pendente antes de disponibilizar aos salões

- **WhatsApp real (WAHA):** conectar uma sessão de homologação específica, receber mensagem, reconhecer cliente, responder e validar consentimento/opt-out. O teste atual cobre regras e integração simulada, não entrega externa real.
- **Integrações financeiras reais:** Pix bancário, maquininha, conciliação, reembolso/estorno, meios de pagamento e documentos fiscais.
- **Segurança:** revisão externa, MFA, CSRF por token, gestão de privilégios por registro, auditoria LGPD, retenção, limitação de requisições e recuperação de incidente.
- **Backup e restauração:** testar recuperação conjunta do SQLite e da pasta de mídias.
- **Operação com pessoas:** validar recepção, profissional e proprietária no computador e celular físicos.
- **Carga e confiabilidade:** múltiplos atendimentos simultâneos, concorrência, interrupção e recuperação, crescimento da base e métricas de performance.
- **Produção:** verificar ambiente, segredos, observabilidade, DNS, certificados, segregação entre salões, contingência e rollback antes de qualquer publicação.

## 6. Critério de decisão

**Aprovado para prosseguir com a homologação piloto controlada, ainda sem dados reais.**

**Não aprovado para produção nem para abertura comercial generalizada** enquanto a matriz de riscos e os testes acima não forem concluídos.

Todas as alterações estão na PR de teste, separadas das etapas anteriores em rascunho; não houve merge nem deploy.
