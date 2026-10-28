# NOVAGENTE Estética — Etapa 24 · Orquestração comercial e automações

**Estado:** implementação inicial isolada na branch de Etapa 24, ainda **não liberada para operação real**. A demonstração da PR #26 não foi alterada.

## Objetivo do produto

Acompanhar a jornada **conversa → oportunidade → orçamento → agendamento → sinal → atendimento → retorno**, com eventos auditáveis, dados verdadeiros de serviços e agenda e exceções direcionadas à dona/gerência.

**Regra essencial:** automação é opt-in por salão e por finalidade. Ações externas ficam BLOQUEADAS nesta etapa, mesmo quando uma regra é ativada na interface. Não há worker de envio nem cobrança automática conectado.

## Entregas implementadas nesta etapa

- Tabelas separadas por `tenant_id` para funil, eventos, preferências, consentimentos documentados, regras por serviço e fila idempotente.
- Sete etapas: `novo_contato → respondeu → orcamento_enviado → agendou → sinal_pago → atendido → voltou`.
- Captura no funil de mensagens novas já validadas pelo webhook WAHA; mensagens duplicadas do provedor não geram eventos extras.
- Classificação determinística de intenção: humano, desconto, caso clínico, reclamação, preço, agendamento, serviço ou geral.
- Prévia segura de respostas sem envio: preços **apenas do catálogo**, horários **apenas quando fornecidos por disponibilidade verificada**, variação de saudação e encaminhamento obrigatório de desconto/diagnóstico/humano.
- A regra de resposta automática só pode ser liberada se **ambas** as flags explícitas estiverem presentes (`NOVAGENTE_ENABLE_RECEPTIONIST_AI=true` e `NOVAGENTE_AUTOMATION_V2_APPROVED=true`), além da política do salão habilitada. Padrão OFF.
- Filas futuras sem emissor: confirmação 24h, lembrete 2h, tentativas de orçamento 2h/24h/3d, recuperação 7d, pós-serviço e avaliação após 2h; o tipo de consentimento correto e a política da dona definem se ficam `pending` ou `held`.
- Ao criar agendamento: evolução do funil, lembretes sem duplicação e **lançamento contábil de sinal a receber** apenas se configurado por serviço e regra ativada. Não gera Pix nem registra pagamento recebido.
- Ao cancelar: lembretes pendentes cancelados; sinal ainda não pago é cancelado; criada **apenas proposta de oferta** à primeira pessoa da lista, se existir. Não confirma novo agendamento sem checagem concorrente.
- Ao concluir: proposta de avaliação e de retorno conforme o ciclo do serviço; todos os clientes elegíveis recebem a mesma possibilidade de avaliar, independentemente da opinião.
- Consentimento separado `transactional` / `marketing`, com origem e evidência do aceite; revogação impede futuros envios.
- Desligar a regra pela dona também coloca em espera as ações previamente previstas.
- APIs autenticadas `/api/commercial/*`: visão do funil, relatórios básicos, regras, consentimento, regras por serviço, avanço manual de lead e prévia de mensagem.
- Interface recolhível em **Atendimento → Funil inteligente e automações**: estatísticas, fases clicáveis, configuração individual, simulação sem envio (exclusiva do ambiente descartável).
- Testes: **76 passando**, incluindo **19 testes comerciais novos**; teste HTTP separado com login + cliente fictício + simulação + política + mudança de etapa + orçamento, sem envios.

## Limites (NÃO foi entregue como produção)

| Requisito | Situação |
|---|---|
| 1. WhatsApp/IA/agendamento | Cadastro de contatos já existia; funil integrado e regras da IA criadas. **Não** há confirmação de horários por IA automática de ponta a ponta |
| 2. Sinal | Conta a receber, quando configurada, sem cobrança Pix |
| 3. Lista de espera | Proposta de oferta na fila. Falta reserva temporária, aceite com concorrência e confirmação pela API |
| 4. Ciclos/recuperação/aniversários | Ciclo de retorno e recuperação simulados em fila. Falta agendador, calendário de aniversários, inatividade e provedor |
| 5. Google | Convite neutro preparado. Falta URL oficial por salão e mecanismo de disparo; sem bloqueio de avaliações negativas |
| 6. Estoque | Motor pré-existente; falta automatizar pedido ao fornecedor com aprovação e testes integrados |
| 7. Comissão | Módulo de comissão pré-existente; falta apuração semanal e regras contratuais por profissional |
| 8. NFS-e | Não integrado; depende dos dados fiscais e configurações municipais de cada salão |
| 9. Agente da dona Premium | Não implementado; precisa scheduler por fuso, resumos, aprovações e permissões |
| 10. Integração | Requisito original sem especificação; proposta: Central de Integrações, credenciais em cofre, webhooks assinados, fila, observabilidade e testes de saúde |
| 11. Funil | Etapas, fonte, valor aberto, registro e simulação; faltam tempo médio de resposta, desempenho por atendente e ofertas consentidas verificadas |
| 12. Personalidade e limites | Guardas determinísticas e interface de simulação; validar toda saída gerativa antes da ativação externa |

## Segurança, LGPD e políticas externas

1. **Padrão desligado** para todos os envios. Se a dona revogar a regra, tarefas planejadas ficam suspensas. O emissor futuro precisa revalidar consentimento, regra, horário, idempotência, sessão, serviço e disponibilidade **imediatamente antes** de executar.
2. WhatsApp Business: contatos proativos dependem de opt-in e modelos aprovados fora da janela de 24h. Política: https://whatsappbusiness.com/pt-br/policy/
3. O convite à avaliação Google **não pode filtrar avaliações negativas**, nem oferecer incentivos por nota: https://support.google.com/business/answer/7400114
4. Para NFS-e pela API Asaas, antes da emissão devem ser verificadas configuração fiscal e opções do município, códigos municipais e webhooks de resultado: https://docs.asaas.com/docs/notas-fiscais
5. Procedimentos de beleza não incluem diagnóstico médico; pedidos de diagnóstico, reclamação sensível, desconto e atendimento humano devem gerar **handoff**.
6. Complementos de serviço são ofertas **opcionais**. Nunca condicionamos a compra de um serviço a outro (evitar venda casada).
7. Não armazenar chave privada em front-end; multiempresa isolada; sem dados reais na demo; sem revelar conversas ou informações confidenciais a outro salão.

## Próximas entregas recomendadas

**24.1:** motor de agendamento via IA com validação do serviço, preço e 2 horários realmente livres; transação atômica, confirmação e fallback humano.

**24.2:** provedor WhatsApp homologado, opt-in por finalidade, modelos aprovados, rechecagem pré-envio, scheduler, retentativas, idempotência, limite por canal e histórico da cliente.

**24.3:** fila de espera com convite sequencial, prazo de exclusividade, aceite com reserva atômica, expiração e nova oferta; gerência para exceções.

**24.4:** cobrança de sinal via gateway, conciliação por webhook assinado, saldos e estorno; automação fiscal somente após confirmação e revisão tributária.

**24.5:** ciclo de fidelização, relatórios de conversão por origem/atendente/profissional, alertas VIP, pós-atendimento e monitoramento de qualidade sem review gating.

**24.6:** gestão de estoque, compras aprovadas, comissões, notificações da dona e pacote Premium.

## Critérios de aceite antes de ir para produção

- [ ] Executar e verificar o teste HTTP da Etapa 24 em banco descartável.
- [ ] Proibir qualquer disparo externo em ambientes demo.
- [ ] Testar revogação de consentimento e pausa de regras com tarefas já agendadas.
- [ ] Testar concorrência no agendamento e na fila de espera.
- [ ] Validar termos, consentimento, retenção de dados e histórico auditável.
- [ ] Validar experiência visual desktop e celular com as duas aparências.
- [ ] Validar serviço reiniciável, HTTPS definitivo, backups e monitoramento.
- [ ] Revisão fiscal/jurídica antes de Pix automático, comissões e emissão de NFS-e.