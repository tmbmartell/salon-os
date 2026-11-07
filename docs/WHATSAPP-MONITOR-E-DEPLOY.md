# NOVAGENTE Estética — Monitor de WhatsApp e Deploy seguro (2026-11-07)

## Para o salão

Em **Conversas → Conexão WhatsApp → Ver o que chegou e o que foi enviado**, o proprietário e a gerência podem conferir o estado da sessão, contagem recebida/enviada nas últimas 24h, data/hora dos últimos registros, estados de entrega conhecidos, funcionamento do webhook oficial e as pendências dos avisos profissionais. Botão **Atualizar diagnóstico** faz consulta sob demanda.

**Importante**: mensagem recebida registrada no banco significa que o sistema processou um evento, não prova que *todas* as mensagens chegaram. Mensagem enviada registrada pode significar aceite do provedor; não comprova visualização/leitura do destinatário. Indicadores não contêm texto de conversas, números, token nem chave. Recepcionistas e profissionais não acessam o endpoint gerencial.

## Para operação técnica da NOVAGENTE

- Endpoint autenticado de leitura: `GET /api/whatsapp/diagnostics`. Proprietário e gerência podem ver os indicadores operacionais, mas não detalhes técnicos, prompts, credenciais nem números.
- O estado do webhook é consultado na configuração real da sessão WAHA, comparando URL esperada, evento, assinatura HMAC e domínio oficial. Nenhuma chave ou URL completa é retornada.
- `WAHA_WEBHOOK_URL` deve ser `https://estetica.novagente.com.br/api/whatsapp/waha/webhook`, e `NOVAGENTE_PUBLIC_ORIGIN` deve permanecer `https://estetica.novagente.com.br`.
- A troca do webhook pelo `PUT /api/sessions/{name}` provoca reinício da sessão WAHA. Deve preservar a configuração completa de webhooks, HMAC e retries, e confirmar `WORKING`; não substituir ou alterar a sessão sem rollback disponível.
- O `POST /api/whatsapp/waha/webhook` exige assinatura HMAC SHA-512 e a sessão deve estar mapeada ao salão. Teste seguro: evento `session.status` de diagnóstico autenticado, sem forjar mensagens recebidas.
- Um webhook válido pode ser testado sem conteúdo de cliente. Confirmação de envio/recebimento real requer troca consentida de mensagens entre números autorizados e leitura do log.
- Automação da recepcionista não equivale ao status `WORKING` do WAHA; os controles comerciais e o modo humano ainda determinam se responde.
- As notificações profissionais têm outbox persistente e plano de 24h/2h/30min, mas **não possuem dispatcher de WhatsApp**. Seus contadores são mostrados claramente como simulação, sem envio real.

## Deploy e backup

Antes de instalar o commit novo:
1. Backup transacional do SQLite com `sqlite3.Connection.backup`, arquivo `.env.runtime`, SHA anterior e código da aplicação.
2. `npm run check`, `npm test`, testes de navegador, agendamento e comercial em sandbox.
3. Publicar sem sobrescrever `data/`, `.env.runtime`, identidade de operador nem sessões de WhatsApp.
4. Reiniciar o serviço do aplicativo e conferir 200 no domínio oficial e na rota direta, API de saúde e páginas estáticas, autenticação/negação de rotas privadas sem sessão.
5. Caso falhe, restaurar versão anterior do aplicativo (não sobrescrever mensagens já recebidas, salvo procedimento de recuperação explicitamente aprovado). Para webhook, restaurar sessão anterior sem alterar chaves.

## Testes realizados

- 118/118 testes de regressão, incluindo leitura privada de diagnósticos, outbox por profissional e convite sem senha.
- Chrome/Playwright: login, administração, restrição de prompt para cliente, convite de profissional, agenda, fluxo de equipe e painel de diagnóstico WhatsApp.
- `booking:smoke` e `commercial:smoke`: nenhum disparo externo.
