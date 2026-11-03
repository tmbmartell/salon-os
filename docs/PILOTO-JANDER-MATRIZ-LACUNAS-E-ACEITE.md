# Piloto Jander — matriz de lacunas, prioridades e homologação

**Fotografia técnica em 03/11/2026 (somente leitura).** Referência funcional: [14 requisitos aprovados](./PILOTO-JANDER-REQUISITOS-APROVADOS.md). As observações abaixo distinguem **código existente**, **dados presentes**, **execução comprovada** e **aceite ainda pendente**.

## Evidências coletadas

- Serviço `novagente-estetica-whatsapp-pilot.service`: **active**.
- API local `/api/health`: **ok=true**; WAHA **connected=true**, status **WORKING**.
- Banco do piloto: 7 clientes, 6 conversas, 72 mensagens, 2 agendamentos, 1 profissional, **1 serviço** e **1 produto** (fotografia, não cadastro definitivo do salão).
- Mensagens: 45 entradas de cliente, 27 saídas de equipe e **0 saídas identificadas como assistant**. Conexão WAHA não prova execução de atendimento automático.
- Existem 1 campanha em **draft**, nenhum asset de marketing, 2 tarefas comerciais e 0 itens na fila de espera.
- `assistant_reply`, `assistant_booking`, `appointment_confirmation_24h`, `appointment_reminder_2h`, `waitlist_offer` estão habilitadas nas políticas observadas; o backend possui flags para IA do WhatsApp. **Isso NÃO comprova conformidade das regras R01, R09, R11 ou R12.**
- `commercial-api.mjs` reporta `sending_enabled:false`; `commercial-automation.mjs` agenda tarefas e separa status, mas não prova despacho de campanhas.
- O código de `booking-flow.mjs` contém execução de agendamento automático em determinadas condições. **Conflita com R01 do Jander:** precisa de um bloqueio real, específico para o piloto, antes de testar IA com clientes.
- `marketing.mjs` suporta rascunhos de campanha e imagens; não há, na inspeção, fluxo aprovado de envio promocional e métricas de campanha fim a fim.
- `public/manifest.webmanifest` e `public/sw.js` fornecem estrutura de PWA; testar efetivamente a instalação em notebook e celular.
- O catálogo de estoque `phase2.mjs` não é, por si só, uma base técnica versionada com revisão gerencial da IA.

## Matriz de prontidão por requisito

| Regra | Situação em 03/11 | Lacuna / risco | Critério de saída |
|---|---|---|---|
| R01 — Recepção confirma agenda | **Conflito conhecido** | O fluxo de reserva automatizada existe e `assistant_booking` está habilitado; ainda não há fila obrigatória de aprovação humana. | Criar solicitação pendente e comprovar 0 reservas confirmadas pela IA sem aprovação. |
| R02 — Aprovação de campanhas | **Não implementado de ponta a ponta** | Rascunho existe; falta ciclo de aprovação versionada e despacho condicionado. | Provar que campanhas não aprovadas não enviam, e que edição revoga aprovação. |
| R03 — Aprovadores restritos | **Pendente** | Criar permissão individual owner/gerência expressamente autorizada, independente de acesso geral à tela. | Teste negativo: recepção não aprova nem chama API diretamente; trilha auditável. |
| R04 — Apenas descontos aprovados | **Parcial** | Existem regras de escalonamento, mas é preciso vincular todas as respostas de oferta a condições aprovadas. | Testar pedido de desconto não aprovado e expiração de promoção. |
| R05 — Informações técnicas aprovadas | **Pendente** | Estoque existe, base validada para IA não. | IA só responde se conteúdo aprovado; caso contrário handoff. |
| R06 — Profissionais cadastram; gerência valida | **Pendente** | Workflow de versão e aprovação técnica necessário. | Profissional edita rascunho; gerente aprova; alteração exige revisão. |
| R07 — Inbox WhatsApp + Instagram | **Pendente** | Integração real com Instagram Direct e origem por canal ainda precisam ser construídas. | Mensagens dos 2 canais identificadas, histórico seguro e CRM vinculável. |
| R08 — IA nos 2 canais | **Pendente** | Ausência de integração Instagram; WhatsApp sem envio automático comprovado. | Fluxos de resposta e handoff seguros em ambos os canais. |
| R09 — Handoff humano manual | **Parcial** | `handling_mode` e `handling_mode_source` existem, mas validar bloqueio definitivo ao reassumir e retorno só por atendente. | Testar mensagens, logout e reinício sem retorno da IA. |
| R10 — Sem liberação automática / fila | **Parcial** | Existem espera e tarefas; confirmar intervenção humana em todas as rotas. | Nunca oferecer vaga sem confirmação explícita da liberação pela equipe. |
| R11 — Lembretes 24h/2h pós-confirmação | **Parcial** | Há agendamento de tarefas, mas não prova de despacho e gatilho após validação humana. | Teste de lembrete único e cancelamento/remarcação. |
| R12 — Lembrete 2h contextual | **Pendente** | Falta diferenciação fim a fim por confirmação de presença. | Cliente confirmada recebe apenas cordialidade, sem segunda pergunta. |
| R13 — Aviso WhatsApp + agenda profissional | **Parcial** | Agenda/role profissional existem; envio automático e estado de entrega não validados. | Confirmar aviso e acesso individual, privacidade e log de falha. |
| R14 — Avisos de remarcação/cancelamento | **Pendente** | Transições de status existem, mas notificação comparativa a profissionais não está demonstrada. | Mensagem de atualização correta, inclusive troca de profissional. |

**Critério de nomenclatura:** “parcial” = existe algum elemento correspondente, **não** significa funcionalidade homologada.

## Ordem de execução recomendada

### P0 — Antes de usar a automação com clientes reais
1. **R01:** bloqueio seguro de confirmação pela IA e fila de aprovação da recepção.
2. **R09:** handoff humano persistente que não é revertido automaticamente.
3. **R05/R06/R04:** catálogo técnico validado e limites comerciais; resposta segura a dados ausentes.
4. **R02/R03:** motor de campanhas com aprovação obrigatória e autorização de gestor, com teste negativo de envio.
5. Confirmar recepção real de mensagens e envio da IA com dados de teste, sem divulgar números de clientes.

### P1 — Para demonstrar valor no Esquenta Black e reduzir faltas
6. **R11/R12/R10:** pipeline de lembretes 24h/2h + confirmação + alerta; nenhuma liberação automática.
7. **R13/R14:** notificações aos profissionais + agenda individual.
8. Campanhas Black por público consentido e medição de respostas/vendas (R02/R03).
9. Testes guiados com a equipe no notebook separado, sem dependência da migração integral.

### P2 — Extensão comercial sujeita a permissões de terceiros
10. **R07/R08:** Instagram Direct oficial conectado, inbox unificada e atendimento com IA de regras idênticas.
11. Automação refinada de aniversário, follow-ups e relatórios, apenas após consentimento, autorização e homologação.
12. Evolução de interface guiada por recepcionistas do Saikon.

> A ordem de engenharia **não é promessa de que tudo estará concluído durante 03–08/11**. Replanejar com o salão qualquer capacidade não pronta.

## Roteiro de testes de homologação

| Cenário | Resultado esperado |
|---|---|
| Cliente pede coloração e escolhe horário | IA cria pedido; **não confirma**; recepção aprova; então cliente e profissional recebem confirmação. |
| Cliente pergunta por produto sem ficha técnica aprovada | IA não inventa; encaminha à equipe; zero vazamento de rascunho. |
| Cliente pede desconto fora de oferta | IA escalona; não concede. |
| Recepcionista tenta enviar campanha sem aprovação | Bloqueio no servidor, mesmo via API; nenhuma mensagem enviada. |
| Gerente não autorizado tenta aprovar | Erro de permissão; não muda status da campanha. |
| Proprietário aprova e alguém modifica o público | Aprovação invalidada, novo envio bloqueado. |
| Recepcionista assume conversa | IA deixa de responder em WhatsApp/Instagram até devolução manual explícita. |
| Cliente confirma via lembrete de 24h | Lembrete de 2h curto, sem nova solicitação de confirmação. |
| Cliente não responde | Recepção recebe alerta; horário permanece reservado até liberação explícita. |
| Alteração de horário ou profissional | Avisar profissional anterior e nova; sem agendamento duplicado. |
| Mensagem de mídia, webhook duplicado, reconexão WAHA | Sem respostas duplicadas ou inconsistência de CRM. |
| Internet indisponível / WhatsApp desconectado | Falha observável e recuperação controlada, sem disparar mensagens antigas sem revisão. |
| Teste de PWA em notebook e celular | Login seguro, navegação e permissões corretas. |

## Pendências comerciais de decisão

- **Migração Saikon:** opção parcial versus completa ainda **não aprovada**.
- **Suporte:** definir responsáveis, canais e janelas de atendimento; sem inferir SLA da reunião.
- **Preço:** a reunião apresentou R$ 4.000 + R$ 1.000/mês; confirmar escopo e aceite formal.
- **Instagram:** confirmar elegibilidade da conta profissional e permissões oficiais.
- **Dados do salão:** obter autorização e estratégia para catálogo, colaboradores e contatos; não importar contatos reais indiscriminadamente.

Este documento registra **estado e plano**, não executa tarefas nem modifica a instância.
