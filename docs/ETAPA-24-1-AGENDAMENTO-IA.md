# NOVAGENTE Estética — Etapa 24.1: recepcionista que agenda

**Estado: PR de implementação, ainda em homologação.** O endereço público atual segue na Etapa 22/23; não ativar a recepcionista para clientes reais antes das validações.

## Funciona agora

1. A cliente solicita um serviço e um dia, por exemplo, "Quero agendar coloração amanhã". A IA **não inventa serviço, preço ou disponibilidade**.
2. O motor pesquisa os serviços ativos e as profissionais habilitadas e consulta a mesma função de disponibilidade real usada no sistema.
3. Oferece até **duas opções de horários efetivamente livres**. Se houver somente uma, oferece apenas essa. A oferta não reserva a vaga e expira em 10 minutos.
4. A cliente escolhe explicitamente a opção 1 ou 2. Uma resposta vaga como "sim" **não confirma**.
5. Antes de gravar, o sistema revalida horário, serviço e preço, consulta a janela de trabalho e executa a criação do agendamento usando a transação SQLite `BEGIN IMMEDIATE`, a verificação de profissional/recurso e `appointment_items` já existentes.
6. Se a vaga não estiver mais disponível, oferece outras; se falhar inesperadamente, transfere para a equipe e não afirma que confirmou.
7. Ao gravar, dispara os **ganchos internos** de funil, histórico e fila de confirmação. O disparo externo permanece desligado.
8. O histórico e o estado da conversa ficam separados por `tenant_id`, `client_id` e `conversation_id`. Há proteção contra reconfirmação da mesma oferta.
9. O pedido de desconto, avaliação/diagnóstico clínico ou atendimento humano é tratado pela proteção da Etapa 24 e encaminhado para uma pessoa. A conversa mantém o histórico.
10. O painel Atendimento → Funil inteligente e automações → Configurações e simulação → Recepcionista que agenda permite testar a conversa **somente em um banco de demonstração descartável**, com os mesmos horários reais desse ambiente.

## Regras de segurança

- Políticas **`assistant_reply`** e **`assistant_booking`** ficam desligadas por padrão para cada salão.
- Mesmo que ambas sejam habilitadas pela dona, o WhatsApp automático só será permitido com as duas flags de ambiente `NOVAGENTE_ENABLE_RECEPTIONIST_AI=true` e `NOVAGENTE_AUTOMATION_V2_APPROVED=true`, após homologação. Nenhuma delas foi ativada na demo existente.
- Todas as ações externas (disparo de WhatsApp, Pix, NFS-e e campanhas) seguem desligadas nesta entrega.
- A disponibilidade considera horários da equipe, ausências aprovadas, especialização por serviço, agendamentos existentes, recursos informados e fuso IANA; horários inexistentes por horário de verão não são oferecidos.
- As opções são consultas momentâneas, **não reservas temporárias**. Outras pessoas ainda podem ocupar a vaga; a segunda checagem é obrigatória.
- Mudança de preço exige nova proposta antes de registrar.
- A simulação exige autenticação de dona e `NOVAGENTE_FREE_PREVIEW_ACTIVE=true`. Conversas simuladas são `demo_booking` e não aparecem no inbox do WhatsApp real.
- O cliente nunca recebe comunicação automática proativa nesta etapa. Futuro envio exigirá regras e consentimento próprios, idempotência e suporte de templates homologados fora da janela conversacional do WhatsApp.

## Como validar em banco isolado

Executar: `npm run check && npm test && npm run commercial:smoke && npm run booking:smoke`

O teste de booking inicia sua própria demo descartável na porta 19425, faz login, solicita horário, escolhe 1, verifica exatamente **um registro real em appointments**, repete a opção sem criar outro e testa o encaminhamento por desconto. O teste fecha o processo e descarta a base.

## Pendências para habilitação com clientes reais

- QA visual no desktop e nos celulares, claro e escuro; testar o fluxo conversacional em Português natural.
- Validação com o provedor WhatsApp (HMAC, dupla entrega, atraso/falha na mensagem de confirmação, duplicidade).
- Regras completas para profissional preferida, horários específicos e mais de um serviço por atendimento.
- Revisar cancelamento/remarcação e fluxo de volta ao modo IA após intervenção humana.
- Reserva temporária opcional com expiração, para minimizar ofertas que desaparecem.
- Ensaios de concorrência em múltiplos processos e DB de produção, além da checagem transacional local.
- Aprovar políticas por salão e revisar LGPD, consentimento, armazenamento e logs antes de habilitar no ambiente real.
- Monitoramento, reconciliação de falhas e retentativas antes de confirmação por canal externo.

Esta PR depende da PR #27, que por sua vez depende da PR #26, ambas em rascunho. Não fazer merge isolado em produção.