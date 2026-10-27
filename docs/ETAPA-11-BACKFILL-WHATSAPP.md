# NOVAGENTE Estética — Etapa 11: Importação gradual do histórico WhatsApp

**Data:** 27/10/2026.  
**Branch:** `feat/novagente-estetica-backfill-whatsapp`.  
**Situação:** recurso implementado para homologação. Não executado com WhatsApp real e não implantado em produção.

## Objetivo

Importar mensagens históricas gradualmente para a **mesma base CRM/WhatsApp** da NOVAGENTE Estética, com progresso durável, sem criar um segundo cadastro e sem envio automático de mensagens.

### Interface

Na **Central de Mensagens**, o botão *Importar histórico* abre um card recolhível com:

- Data inicial, sugerida em **01/04/2026** e alterável pela gestora;
- Iniciar importação;
- Processar **até 10 páginas por clique** (no servidor, no máximo **uma página WAHA por requisição**);
- Pausar e Retomar;
- Encerrar para permitir novo período, preservando as mensagens já importadas;
- Totais: conversas percorridas, páginas de mensagens examinadas, registros realmente importados e conversas ignoradas.

**Não há execução automática em segundo plano:** é preciso iniciar e continuar os lotes manualmente. O resultado não é representado como percentual de completude; não sabemos de antemão quantas mensagens o WAHA realmente armazenou.

## Paginação e fonte oficial

WAHA documenta os parâmetros:
- `GET /api/{session}/chats?limit=1&offset=N&sortBy=id&sortOrder=asc`;
- `GET /api/{session}/chats/{chatId}/messages?limit=40&offset=N&downloadMedia=false&filter.timestamp.gte=...&sortOrder=asc`.

Referência: https://waha.devlike.pro/docs/how-to/chats/

A paginação de chats usa `sortBy=id` (ordem estável em condições normais). As páginas de mensagens usam `offset` e filtro por data; o offset avança pelo **limite solicitado**, mesmo se o provedor devolver página parcial, até receber uma **página vazia**.

**A API fornece disponibilidade, não garantia de histórico completo.** Engines, configuração de armazenamento, sessões antigas e retenção do próprio WhatsApp podem limitar ou reordenar dados.

## Persistência e execução

Novo arquivo: `whatsapp-backfill.mjs`.

Tabela `whatsapp_backfill_jobs`:
- `tenant_id` e sessão WAHA vinculada;
- `from_date`, `from_unix`, `page_size`;
- offsets atualizados de chat e mensagem;
- contadores de progresso;
- status (`running`, `paused`, `cancelled`, `completed`);
- erro resumido, marca de atualização e lease temporário contra execução concorrente.

Rotas:
- `POST /api/whatsapp/backfill/start`;
- `GET /api/whatsapp/backfill/status`;
- `POST /api/whatsapp/backfill/step`;
- `POST /api/whatsapp/backfill/pause`;
- `POST /api/whatsapp/backfill/resume`;
- `POST /api/whatsapp/backfill/cancel`.

**Apenas proprietário e gerente**, sujeitos à permissão `conversations.write`. O backend nunca aceita `tenant_id` do corpo ou do cabeçalho para escolher de qual salão importar: sempre utiliza a empresa da sessão autenticada.

Uma operação de importação que sofre erro deixa checkpoint anterior preservado. Se uma página já tiver sido gravada antes de falhar a atualização do cursor, a repetição não duplica mensagens por `(tenant_id,external_message_id)`.

O fechamento de uma importação significa que o WAHA deixou de retornar mais conversas na paginação configurada, **não comprova completude absoluta**.

## Segurança e LGPD

- **Nenhuma mensagem é enviada** pelo fluxo de importação; acesso à API é somente leitura.
- `downloadMedia=false`: mídias e documentos não são baixados durante o backfill.
- Grupos de WhatsApp são ignorados.
- Respostas automáticas de agente permanecem desligadas na homologação.
- As informações permanecem segregadas por salão e só são expostas por endpoints autenticados.
- Evitar importar indiscriminadamente mensagens pessoais ou de terceiros sem base legal, aviso de privacidade e política de retenção adequados.

## Testes executados

1. Simulador WAHA com paginação real de `limit/offset` para chats e mensagens.
2. Importação desde abril de 2026, com conta de teste.
3. Pausa e tentativa de avanço recusada, retomada do checkpoint anterior.
4. Deduplicação de mensagem já existente.
5. Grupos ignorados e contadores de progresso.
6. Tentativas inválidas de data e tamanho de página bloqueadas.
7. Encerramento e criação de nova importação em período distinto.
8. Recepção proibida de consultar ou executar a importação.
9. Teste de interface no Chrome abre o card e confere os controles sem WAHA externo.

Executar `npm run check && npm test` e o workflow `browser-qa.yml` no pull request para reproduzir.

## Pendências para homologação com WAHA real

- Conectar instância e número **exclusivos de QA** autorizados; verificar suporte da engine real a paginação e filtro de timestamp.
- Testar conversas extensas, falha no meio da página, reconexões e diferenças entre engines.
- Validar a amostragem de registros antigos com as mensagens disponíveis no aparelho.
- Testar desempenho, limites de requisição, armazenamento e recuperação do checkpoint por backup e restauração.
- Revisar LGPD, consentimento, tempo de retenção e regras para tratamento de mídia.
- Separar explicitamente histórico disponibilizado pela API de histórico completo prometido ao cliente.

**Não mesclar nem publicar sem essas verificações.**
