# NOVAGENTE Estética — Etapa 10: Homologação WhatsApp + CRM

**Data:** 27/10/2026  
**Situação:** Integração interna testada com um **simulador de WAHA por HTTP**. **Não houve conexão com WhatsApp real nem envio a pessoas reais.**  
**PR:** https://github.com/tmbmartell/salon-os/pull/10

## 1. O que passou na homologação simulada

A suíte `tests/whatsapp-integration-http.test.mjs` abre `server.mjs` com banco SQLite temporário e inicia um servidor WAHA simulado, disponível apenas dentro do runner de testes.

Resultados:
- Sessão de WhatsApp associada ao salão, com status `WORKING`, modo humano e agente de IA **desligado**.
- Webhooks sem HMAC-SHA512 ou com algoritmo incorreto **rejeitados**; não devem provocar consulta desnecessária ao provedor.
- Eventos assinados de sessão desconhecida ignorados, sem criar clientes.
- Mensagem nova cria cliente e conversa no CRM, preserva nome e telefone e marca como não lida.
- Webhook repetido com o mesmo ID não duplica mensagens.
- Alteração de prioridade, categoria, etiqueta e usuário responsável.
- Agendamento vinculado ao cliente, consultável na tela de contexto da conversa.
- Mensagem manual sai para o **simulador**, grava ID de envio e acompanha confirmação de leitura por `message.ack`.
- Mídias não iniciam respostas automáticas; a conversa continua em atendimento humano.
- Segunda empresa com sessão própria não compartilha mensagens, clientes nem histórico, mesmo com o mesmo telefone.
- Tentativa de forjar o identificador do salão no cabeçalho não troca o contexto autenticado.
- Sincronização do histórico de **15/04/2026** por API simulada, ignorando grupos, sem duplicar na segunda execução. Corrigida normalização de IDs recebidos como objetos.

**Resultado agregado da validação inicial:** 37 testes aprovados, sem falhas.  
**Execução:** https://github.com/tmbmartell/salon-os/actions/runs/40459225478

Os testes automatizados do navegador da Etapa 9 verificam os principais painéis, mas **não testam telas do WhatsApp com número real**.

## 2. Correções nesta etapa

- `whatsapp.mjs`: ID de mensagem histórica normalizado com função compartilhada para atender formatos diferentes de engines WAHA; timestamp histórico inválido/adiantado não derruba importação.
- `server.mjs`: recusa webhooks inválidos **antes** de consultar o provedor WAHA. O segredo HMAC nunca é exposto na resposta.
- `tests/whatsapp-integration-http.test.mjs`: teste de integração HTTP e sessão isolada, sem custos de WhatsApp.

## 3. Configuração necessária para o próximo teste real (não executada)

Ambiente de homologação separado, com:

```text
WAHA_BASE_URL=https://SEU-WAHA-DE-HOMOLOGACAO
WAHA_API_KEY=<SEGREDO_DO_AMBIENTE>
WAHA_SESSION=novagente-qa-salao
WAHA_WEBHOOK_HMAC_SECRET=<SEGREDO_ALEATORIO_DIFERENTE_DA_API_KEY>
WAHA_WEBHOOK_URL=https://SEU-DOMINIO-QA/api/whatsapp/waha/webhook
NOVAGENTE_ENABLE_RECEPTIONIST_AI=false
SALON_DB=/caminho/isolado/homologacao.sqlite
```

**Nunca colocar segredos no repositório, nos prints, nos logs, em mensagens ou na configuração do frontend.**

Passos de habilitação real:
1. Usar **número exclusivo de homologação**, preferencialmente sem conversas privadas e sem contatos pessoais.
2. Garantir endpoint de webhook HTTPS válido e protegido por HMAC-SHA512.
3. Associar uma sessão WAHA distinta à empresa de testes como proprietária.
4. Preparar sessão WAHA e digitalizar QR Code **no dispositivo do responsável pelo número de teste**.
5. Validar estado `WORKING` na tela de conexão.
6. Trocar mensagens somente entre números de teste autorizados.
7. Conferir chegada do evento, vínculo com cadastro, status de não lida e resposta **manual**.
8. Confirmar agendamento, detecção de duplicatas, anexos, confirmação de leitura, queda/reconexão e permissões.
9. Fazer backup/restauração, observabilidade e verificação de logs/segredos antes de desligar o ambiente de QA.

## 4. Limites e riscos ainda abertos

- O histórico de um período longo (por exemplo desde abril de 2026) **não está garantido pela importação atual**: `/api/whatsapp/sync` importa quantidades limitadas de chats e mensagens por chamada. É necessário adicionar paginação, checkpoints, reconciliação de eventos e relatórios de completude antes de prometer histórico inteiro.
- Testes de tipos de arquivo (áudio, PDF, imagem, vídeo) no WhatsApp **real** não foram concluídos; recepção de mídia hoje registra um marcador textual e encaminha a pessoa para tratamento manual.
- O sistema não envia campanhas em massa nem mensagens automáticas no WhatsApp nesta etapa. Consentimento, opt-out, horário de contato e políticas do provedor devem ser revistos antes de liberar novas automações.
- Token de QR, desconexões, perda de sincronismo e volumes altos de mensagens requerem homologação com WAHA conectado.
- Política LGPD, MFA, proteção CSRF, limites operacionais, retenção/expurgo de mensagens e segredos precisam de revisão antes de produção.

## 5. Decisão

**Aprovado:** validação interna com mock WAHA + CRM, API, agenda, mensagens, isolamento de empresas e sincronização limitada.

**Pendente:** validação ao vivo com número e servidor WAHA de homologação. Nenhum número ou credencial foi presumido, criado ou utilizado.

**Não homologado para produção pública.** Todas as alterações seguem em PR rascunho sem merge ou deploy.
