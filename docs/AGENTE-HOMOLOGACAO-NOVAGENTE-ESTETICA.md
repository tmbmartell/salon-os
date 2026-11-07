# Agente de homologação — NOVAGENTE Estética

## Objetivo
Executar operações como uma pessoa real, com Chrome/Playwright, banco SQLite temporário e evidências, sem tocar nos dados do piloto. Base de aceite: **Manual NOVAGENTE Estética — 204 casos A01–X22**.

## Regras de segurança (obrigatórias)
- Executar sempre com `SALON_DB` em diretório temporário; nunca usar `/srv/margot/novagente-estetica-whatsapp-pilot/data/estetica.sqlite`.
- Desligar `WAHA_BASE_URL`, `WAHA_API_KEY`, `WAHA_WEBHOOK_URL`, IA de WhatsApp e os acessos externos no sandbox.
- Só utilizar contas, números e clientes fictícios (`example.invalid`). Não enviar mensagens reais nem disparar campanhas reais.
- Capturar print do estado antes/depois de cada fluxo importante; ocultar senhas, códigos TOTP e tokens de convite.
- Caso falhe: registrar etapa, esperado, obtido, erro e evidência; prosseguir quando seguro.
- Estados do caso: `APROVADO`, `FALHOU`, `PARCIAL`, `PENDENTE` e `BLOQUEADO`. Nunca confundir testes unitários com os 204 casos completos.

## Execução reproduzível
`QA_CHROME=/usr/bin/google-chrome NE_EVIDENCE=/caminho/execucao node scripts/auditor-navegador.mjs`
`npm run check && npm test && QA_CHROME=/usr/bin/google-chrome node tests/browser-smoke.mjs`
`npm run commercial:smoke && npm run booking:smoke`
`node --test tests/professional-notice-planner.test.mjs`

## Casos do aviso à profissional — bloqueantes para aceite do piloto
- G21: IA/recepção agenda → profissional recebe WhatsApp, sua agenda exibe a nova reserva.
- G24: remarcação e cancelamento → profissional recebe atualização, sem duplicar mensagens.
- Incluído para aceite: 24 horas, 2 horas e 30 minutos antes; o aviso informa profissional, data/hora local, serviço, duração prevista, quanto falta para iniciar e, durante atendimento, tempo estimado restante.
- Agendamentos de última hora não devem receber lembretes retroativos.
- Deve existir fila por salão/profissional com idempotência, log e estado de entrega. Não usar número de cliente como destinatário de notificação à profissional.
- **Estado atual:** o planejador `professional-notice-planner.mjs` valida o cálculo das mensagens, mas **a integração com a fila WAHA, entrega real e agenda individual ainda não está implementada**. Manter G21/G24 pendentes até simulação end-to-end e verificação de confirmação de entrega.

## Relatório
Registrar versão do Git, data/fuso, ambiente, total de testes de código, navegação em 22 telas, todos os casos efetivamente executados, screenshots e causas de pendência. Reprovação de teste de calendário por data fixa deve ser corrigida no próprio teste, mantendo histórico da falha original.

## Condições para liberar para cliente
Não há aprovação integral com G21/G24 pendentes, sem teste de perfis completos, sem WhatsApp em sandbox próprio, sem validação de acesso público real e sem confirmação de backup/restauração.