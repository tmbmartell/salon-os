# NOVAGENTE Estética — Piloto Jander: requisitos aprovados (R01–R14)

> **Estado:** especificação de produto e aceite funcional, **não** declaração de que as funcionalidades estejam implementadas.  
> **Data de consolidação:** 03/11/2026.  
> **Origem:** transcrição da reunião comercial do salão do Jander (conversa de 28/10/2026, com trechos de fala possivelmente imprecisos) e **14 decisões expressamente confirmadas pela responsável pelo projeto nesta conversa**.  
> **Escopo de mudança:** este documento não autoriza modificações diretas na produção, envio de mensagens ou migração de dados.

## Objetivo do piloto

Priorizar a resposta a dúvidas sobre produtos e serviços, a conversão de interessados, campanhas do Esquenta Black e a redução de faltas. Fazer a adoção paralela ao Saikon, em notebook separado, preservando o controle da recepção e a familiaridade da equipe.

Os valores **apresentados**, e não aqui considerados aceitos ou contratados, foram implantação de **R$ 4.000** e mensalidade de **R$ 1.000**. Foi proposto um teste de aproximadamente uma semana, iniciado **terça-feira, 03/11/2026**, com acompanhamento até aproximadamente **domingo, 08/11/2026**. Suporte presencial e personalização visual foram oferecidos; frequência, SLA, escopo exato, implantação, custos de canais/IA e tráfego pago exigem confirmação contratual. Não consta compromisso de migração integral do Saikon.

## Regras de negócio validadas

| ID | Regra aprovada | Critério de aceite mínimo |
|---|---|---|
| **R01 — Agendamento assistido** | A IA conversa, coleta dados, consulta e **sugere horários**; a **recepção confirma todos** os agendamentos. | Nenhuma ação da IA cria agendamento confirmado ou comunica confirmação sem ação de recepcionista autorizada; pedido permanece **pendente** até decisão humana; agenda é atualizada apenas após aprovação. |
| **R02 — Campanhas aprovadas** | **Cada campanha** requer aprovação humana antes de ser enviada. | Nenhum disparo ativo de campanha antes de aprovação vinculada à versão exata de mensagem, oferta, público, janela e canal; qualquer edição relevante invalida aprovação. |
| **R03 — Aprovadores** | Apenas **proprietário** e **pessoas expressamente autorizadas da gerência** podem aprovar campanhas. | Verificação de permissão por usuário em backend; recepcionista pode editar/preparar mas não aprovar; trilha de auditoria com autor, versão, aprovador e data. |
| **R04 — Descontos e negociação** | IA usa **somente preços e promoções aprovados**; não negocia desconto livre. | Pedido de condição adicional é escalado à equipe; promoções expiram e respeitam elegibilidade; nenhuma oferta inventada. |
| **R05 — Base de conhecimento de produtos** | IA responde **somente com informações validadas no catálogo do salão**, nunca com pesquisa livre como fonte final. | Para dados ausentes/não aprovados, encaminhar à equipe sem improviso; preço e estoque consultados em dados cadastrados e atualizados. |
| **R06 — Fluxo de revisão do catálogo** | **Profissionais cadastram** conteúdo técnico; **gerência valida** antes de liberar para a IA. | Estados rascunho → em revisão → aprovado/publicado; edição de conteúdo já aprovado gera nova versão pendente; há auditoria de autores e aprovadores. |
| **R07 — Central unificada** | Instagram Direct e WhatsApp aparecem na **mesma Central de Atendimento**, com histórico, canal e CRM. | Origem e contexto de cada mensagem preservados; vinculação de identidades só com evidência confiável; proteção contra mistura de clientes/tenants. |
| **R08 — IA nos dois canais** | A IA atende **tanto Instagram Direct quanto WhatsApp**, com as mesmas regras comerciais e de segurança. | Política única para handoff, catálogo, descontos e agendamentos; considerar as permissões e restrições específicas de cada canal. |
| **R09 — Handoff humano persistente** | Após a recepção assumir uma conversa, a IA **só volta com devolução manual pela atendente**. | Timeout, novas mensagens, logout ou reinício do sistema não reativam IA; devolução explícita é auditada; novo atendimento não sobrescreve controle humano anterior. |
| **R10 — Ausência de confirmação/fila** | Se a cliente não confirma presença, **alertar a recepção**; só a equipe libera o horário e autoriza a oferta à fila de espera. | Ausência de resposta **não é cancelamento**; sem liberação automática, sem dupla reserva, com identificação do profissional que autorizou. |
| **R11 — Lembretes após confirmação** | Enviar automaticamente lembretes de **24h e 2h**, conforme configuração do salão, **somente após confirmação da recepção**. | Cancelamento/remarcação reavalia tarefas; envio único/idempotente, horário e consentimentos observados, falha visível à recepção; nunca enviar lembrete de reserva não confirmada. |
| **R12 — Lembrete 2h contextual** | Se a cliente **já confirmou presença**, o lembrete de 2h será **curto, cordial e sem pedir nova confirmação**. | Estado de confirmação diferencia texto; cliente ainda pendente pode receber solicitação de confirmação segundo política configurada. |
| **R13 — Aviso à profissional** | Após a recepção confirmar, a profissional recebe **notificação WhatsApp automática** e visualiza horário na sua **agenda individual**. | Somente profissional vinculado e autorizado recebe dados mínimos; entrega/erro registrados; permissões da agenda individual testadas. |
| **R14 — Atualização/cancelamento** | Quando a recepção altera, remarca ou cancela um agendamento confirmado, a profissional recebe novo aviso. | Remarcação mostra horário antigo e novo; troca de profissional alerta anterior e nova profissional; cancelamento não gera oferta automática à fila; idempotência e erro monitoráveis. |

## Regras transversais de segurança e governança

1. Toda operação que marca presença, confirma ou libera vagas deve ter autorização humana correspondente.
2. Mensagens de **resposta a cliente** e **campanhas promocionais ativas** são tipos diferentes: resposta autorizada não libera disparos em massa.
3. Campanhas devem ter opt-in/base legal aplicável, lista de supressão, rastreio e limites compatíveis com os canais; aprovação comercial não substitui consentimento.
4. Nenhuma funcionalidade deve usar informação técnica de produtos em rascunho/rejeitada; não oferecer aconselhamento médico.
5. A auditoria registra ações sem divulgar credenciais, áudios privados ou dados sensíveis nos logs.
6. Feature flags de produção não substituem checagem de autorização do usuário na API.

## Escopo prometido na reunião versus refinamento pós-reunião

**Expressamente levantados/apresentados na reunião:** necessidade de conexão WhatsApp + Instagram, campanhas/Black Friday/aniversários, IA para dúvidas sobre marcas e serviços, lembretes e fila, acesso computador/celular, equipe habituada ao Saikon, teste paralelo, suporte/personalização, preços apresentados. Houve demonstração/discurso de agendamento automático e notificações aos profissionais.

**Regras refinadas e aprovadas depois pela responsável do projeto:** controle humano em R01–R03/R09–R14, conteúdo validado R04–R06, integração R07–R08. As decisões pós-reunião **prevalecem sobre exemplos genéricos** da apresentação para este piloto.

**Ainda não decidido:** estratégia de importação **parcial ou completa** dos dados do Saikon; abrangência da personalização visual; termos de suporte e custo de integração com canais/provedores. Nenhuma escolha de migração deve ser assumida como aprovada.

## Condição de conclusão

Nenhum requisito R01–R14 estará **“pronto”** só por existir campo, tela, tabela, flag ou teste unitário. Aceite requer teste positivo e negativo **de ponta a ponta** em ambiente de homologação, com usuário/perfil, canal e dados controlados, e registro da aprovação funcional da recepção/gerência.
