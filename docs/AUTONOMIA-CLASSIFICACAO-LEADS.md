# NOVAGENTE Estética — classificação autônoma de leads

## Funcionamento
O WhatsApp (sessão provisória de homologação) recebe uma mensagem, salva o conteúdo e registra o lead. A nova classificação local interpreta a intenção com regras de segurança, organiza a conversa em **Geral, Lead, Agendamento, Aguardando, Reclamação ou Pós-venda**, ajusta prioridade e grava um histórico com explicação/confiança.

- **Aquecendo:** consulta sobre preço ou serviço vira categoria `lead` e etapa comercial `respondeu` quando antes era `novo_contato`.
- **Quer agendar:** intenção explícita de vaga vira categoria `appointment` com prioridade alta, mas só a reserva real no ERP muda o funil para `agendou`.
- **Cliente convertido e pós-venda:** mudanças comerciais decorrentes de agendamento e conclusão vêm dos eventos reais de agenda/caixa; mensagens isoladas nunca registram compra fictícia.
- **Reclamação, dúvida sensível ou pedido humano:** prioridade alta ou urgente, modo humano. Nunca liberar diagnóstico médico nem desconto sem política.
- **Mensagem ambígua:** não reorganiza indevidamente. Prioridade não é reduzida pela IA.
- **Intervenção humana:** qualquer ajuste manual de metadados marca a conversa como `classification_source='manual'` e a IA não substitui a categorização. As ações e motivos automáticos ficam em `lead_classification_audit`.

Na janela de conversa, expanda **“Por que este lead está aqui?”** para ver o histórico resumido. Nenhum prompt, segredo ou dado de integração é exposto nessa consulta.

## Acompanhamento comercial ampliado dentro das autorizações

O cadastro de leads e o planejamento de retorno já existem em `commercial-automation.mjs`. A opção de autonomia ampliada **não equivale a permissão irrestrita de envio**:

- Follow-ups de orçamento e reativação só podem ficar elegíveis quando a política do salão estiver ativa e houver consentimento por finalidade com evidência registrada.
- Sem essas condições, o emprego de `commercial_jobs` mantém a ação em `held`. Não enviar WhatsApp ou disparar campanha automaticamente durante homologação.
- Não há implementação de worker de envio comercial confiável nesta etapa. A classificação e o planejamento ficam automáticos; **execução de envios agendados depende de outra homologação e opt-in**.
- Descontos, reclamações e alterações financeiras exigem decisão humana. Conversas entregues ao humano permanecem nesse modo.

## Reorganização opcional de conversas antigas

Executar **primeiro em uma cópia do SQLite**:
`node scripts/backfill-lead-classifications.mjs --db=/caminho/copia.sqlite`

A migração só altera mensagens históricas se chamada explicitamente com `--apply`. Limita-se à última mensagem recebida de conversas WhatsApp ainda na categoria Geral e prioridade Normal. Registra motivo, sem dados pessoais nos logs e sem enviar mensagens.

## Testes e rollback
`npm run check && npm test && QA_CHROME=/usr/bin/google-chrome node tests/browser-smoke.mjs`

Inclui casos de preço, agendamento, reclamação, solicitação de humano, mensagem vaga, intervenção manual, isolamento entre salões, mídia e consentimento. O teste integrado usa um servidor WAHA **simulado e assinado**, conferindo recebimento, categorização e trilha de auditoria.

Antes de atualizar produção, criar backup consistente de banco e código; caso a implantação falhe, restaurar a aplicação anterior **sem sobrescrever mensagens novas**.
