# NOVAGENTE Estética — Etapa 2: avisos à equipe (homologação segura)

## O que foi construído

- Planejador de mensagens `professional-notice-planner.mjs` em horário local `America/Porto_Velho`: novo agendamento, avisos **24 horas, 2 horas e 30 minutos antes**, remarcação, cancelamento e tempo estimado restante do atendimento.
- Fila persistente e idempotente `professional-notice-queue.mjs` (SQLite) com `tenant_id`, `appointment_id`, `professional_id`, tipo, horário, destinatário da equipe, status e chave de deduplicação.
- Ao criar agendamento pelo servidor (inclusive quando a IA usa a criação central), são planejados os avisos da equipe. Ao cancelar pela rota de status, avisos futuros são invalidados e o cancelamento entra na fila.
- Atendimentos com múltiplos serviços/profissionais são separados por profissional. **O número da cliente não é utilizado como destinatário de avisos à equipe.**
- Sem telefone profissional válido, o aviso fica bloqueado com estado `blocked_missing_phone`; não ocorre envio.
- Mensagens são geradas com o tempo restante atualizado na hora da prévia/entrega, não no momento em que a reserva foi criada.

## Limites reais — ainda não é envio ao WhatsApp

**Nenhuma mensagem é enviada ao WhatsApp por esta PR.** Não há worker programado, disparo WAHA, confirmação de recebimento, mecanismo de tentativa/reenvio nem painel do proprietário para corrigir avisos bloqueados.

O fluxo de remarcação e troca de profissional possui cálculo e suporte na fila, mas ainda precisa de ligação aos endpoints operacionais específicos. Também falta alinhar a antecedência dos avisos às preferências de cada salão e identificar formalmente a autorização do telefone profissional.

A fila NÃO confirma que o destinatário recebeu ou leu qualquer mensagem. O estado `simulated_only` existe apenas para homologação e nunca significa envio real.

## Critérios para liberar produção

1. Criar worker isolado por salão com prova de conexão WAHA da sessão correta, autenticação e limites de envio.
2. Validar **opt-in do profissional**, telefone cadastrado e confirmação de recebimento; remover informações sensíveis ou desnecessárias.
3. Garantir idempotência em múltiplas instâncias, retries e auditoria dos envios/erros.
4. Atualizar a fila em remarcações, cancelamentos e transferência de profissional, inclusive alertando a profissional anterior.
5. Implementar um painel operacional simples de falhas, bloqueios e últimas notificações por profissional.
6. Executar testes em sandbox com números autorizados e só então habilitar produção por salão.

## Testes realizados em sandbox

- Regras de 24h, 2h, 30min e contagem regressiva.
- Deduplicação, cancelamento de lembretes pendentes, remarcação em fila e isolamento entre salões.
- Mais de um profissional em uma única reserva, destinatários por telefone próprio e bloqueio por número ausente.
- `npm run check`, `npm test`, `npm run booking:smoke`, `npm run commercial:smoke`, `QA_CHROME=/usr/bin/google-chrome node tests/browser-smoke.mjs`.
- **115/115 testes unitários e integrados passaram** no ambiente isolado. Isso não substitui o teste de envio end-to-end.

Não publicar ou disparar mensagens reais apenas porque a fila foi criada.
