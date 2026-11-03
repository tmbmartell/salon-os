# Etapa 3 — Agenda Inteligente, Serviços e Ficha Técnica

**Produto:** NOVAGENTE Estética. Implementação progressiva sobre Salon OS; branch isolada para revisão, sem merge/deploy em produção.

## O que mudou

### Agenda — primeira impressão enxuta
- Cards **Agendar**, **Hoje**, **Próximos** e **Encaixes**;
- Filtros por período operacional e por profissional;
- Agenda carregada numa janela de 30 dias anteriores e 30 dias seguintes;
- Atendimentos apresentados como cards expansíveis com horário, cliente, serviço, profissional e situação;
- Dentro do card: detalhes, opções permitidas de mudança de status, ação rápida (confirmar, chegada, iniciar) e acesso à ficha da cliente;
- Botão de **Finalizar e receber** continua vinculado ao checkout existente, preservando fluxo de estoque, caixa e comissão.

### Segurança de status
- Atualização manual não pode marcar `completed`: esta transição exige o fluxo de checkout;
- Estados terminais não podem ser reabertos por uma requisição genérica;
- A atualização verifica a situação anterior no banco para reduzir sobrescrita concorrente;
- Junções da consulta de agenda usam o identificador da empresa em clientes, serviços, profissionais e recursos.

### Serviços — cards e ações
- Filtro por categoria com cards expansíveis;
- Nome, preço e duração visíveis imediatamente;
- Comissão exposta apenas aos perfis de proprietária/gerência na interface;
- Após abrir o card: agendar o serviço ou acessar a área de fichas técnicas;
- Cadastro existente preservado.

### Fichas técnicas
- Listagem recolhida por título, serviço e data; fórmula e observações só aparecem após abrir a ficha;
- Ao entrar pela agenda, cliente, serviço e profissional são selecionados conforme o atendimento;
- Formulário permite vincular um registro técnico a um agendamento, validando no backend cliente/empresa e combinação de serviço/profissional;
- Ao trocar a cliente, o vínculo anterior com agendamento é limpo;
- Dados acessados sob as permissões `technical.read`/`technical.write` existentes.

## Testes e validação

- `npm run check`: sintaxe dos arquivos principais, incluindo `phase7.mjs` e `appointment-status.mjs`;
- `npm test`: casos de transições de status e impedimento da finalização manual; validação do vínculo técnico e referências entre empresas; testes já existentes de segurança e WhatsApp;
- **Ainda necessário:** testes operacionais num navegador real, revisão detalhada de permissões por funcionário, transição de caixa/estoque com dados piloto, testes em dispositivos móveis.

## Critérios de homologação

1. Criar agendamento usando card Novo e usando serviço do catálogo;
2. Filtrar por dia, profissional e situação sem perder dados;
3. Confirmar → registrar chegada → iniciar → finalizar pelo checkout;
4. Impedir finalização pela alteração manual do status;
5. Abrir ficha de cliente a partir de atendimento; gravar fórmula e verificar vínculo correto;
6. Garantir que dados e fichas de outro salão sejam rejeitados;
7. Verificar restrições de acesso por recepção, profissional e gerência.

**Não foi criada baixa automática por gramatura nesta etapa.** Isso pertence à **Etapa 4 — Estoque e consumo real**. O fluxo de checkout/consumo já existente continua disponível.
