# Beauty Woman — reaproveitamento de sistemas e arquitetura

**Revisão:** 23/10/2026. **Objetivo:** evoluir Salon OS e reaproveitar recursos sem misturar códigos e bancos incompatíveis.

## Decisão

**Base:** [Salon OS](https://github.com/tmbmartell/salon-os), Node.js + SQLite, interface HTML/CSS/JS e módulos de autenticação, WAHA, recepção IA, agenda, CRM, checkout, financeiro, estoque, equipe, pacotes, PDV e relatórios.

**Fluxo principal:** mensagem → conversa/CRM → agendamento → atendimento → pagamento/comissão/baixa de estoque → pós-venda e indicadores.

**Regra de reaproveitamento:** preferir contratos, regras de negócio, padrões e integração por API. Nunca copiar arquivos de tecnologias diferentes sem adaptar modelos, auth, permissões e testes.

## Inventário seletivo: repositórios inspecionados

| Fonte | Evidência lida | O que aproveitar | Estratégia |
|---|---|---|---|
| [salon-os](https://github.com/tmbmartell/salon-os) | README, server.mjs, auth.mjs, whatsapp.mjs, receptionist_brain.mjs, public/index.html, public/app.js, styles.css | CRM, ERP operacional, mensageria, agentes | **Coração do produto** |
| [NOVAGENTE-ATENDIMENTO-COM-AGENDAMENTO](https://github.com/tmbmartell/NOVAGENTE-ATENDIMENTO-COM-AGENDAMENTO) | README e package.json | Funil, WAHA, memória inteligente de reuniões e tarefas autorizadas | Adapter futuro; backend Next/PostgreSQL separado |
| [digchat](https://github.com/tmbmartell/digchat) | README | WebSocket, presença, experiência de mensagens em tempo real | Padrão de UX; FastAPI independente |
| [em-roma-com-ingrid](https://github.com/tmbmartell/em-roma-com-ingrid) | README e package.json | Rules Engine determinístico, auditoria, validação, testes | Adaptar padrões, não importar lógica de turismo |
| [novagente-v1](https://github.com/tmbmartell/novagente-v1) | README e package.json | Papéis, multiempresa e isolamento PostgreSQL RLS | Referência para endurecimento SaaS |
| [nova-gente-workspace](https://github.com/tmbmartell/nova-gente-workspace) | README e package.json | Quadro de tarefas, colaboração e validação | Roadmap de operação interna |
| [MOVI-PLUS](https://github.com/tmbmartell/MOVI-PLUS) | README | Ideias de categorização e análise financeira | Somente elementos relevantes ao salão |
| [saas-generico-v1](https://github.com/tmbmartell/saas-generico-v1) | README e package.json não localizados na raiz | Módulos não confirmados | Não usar ainda |

Este mapa é uma seleção técnica dos candidatos entre 56 repositórios visíveis, não uma revisão integral de todos os códigos.

## Organização do produto

    BEAUTY WOMAN
    ├── Visão geral (somente o essencial)
    ├── Atendimento
    │   ├── Precisa responder
    │   ├── Sobre agendamentos
    │   ├── Em acompanhamento
    │   └── Concluídas
    │       └── Abrir conversa → chat + ficha + responsável + prioridade
    ├── Agenda (disponibilidade, profissionais, espera)
    ├── Clientes (cadastro, histórico, ficha e fidelização)
    ├── Operação (expansível)
    │   ├── Equipe
    │   ├── Ficha técnica e serviços
    │   └── Recursos
    ├── Financeiro & estoque (expansível)
    │   ├── Caixa, lançamentos e DRE em cartões
    │   ├── Comissões em cartão
    │   ├── Produtos, consumo e lotes
    │   ├── Fornecedores/compras, PDV e pacotes
    ├── Crescimento (marketing, retenção, relatórios)
    ├── Inteligência (IA, automações, JEV)
    └── Configurações (administração, usuários, sessão)

## O que a branch implementa

- public/beauty-ui.css: paleta Beauty Woman, acabamento visual, responsividade, menu expansível e seções resumidas.
- public/beauty-ui.js: reorganização preservando cliques existentes, cartões de expansão e conversas agrupadas verticalmente.
- public/index.html: importa a camada visual sem apagar CSS e JS anteriores.
- whatsapp.mjs: traz last_message_direction para diferenciar entrada e saída das mensagens.
- public/app.js: chama o agrupamento após a renderização existente.

**Definições precisas:** Precisa responder = última mensagem recebida ou mensagem não lida. Sobre agendamentos = categoria da conversa; não confirma agendamento efetivo. Respondida = última mensagem enviada; não indica encerramento nem conversão.

**Branding:** Beauty Woman em texto + monograma BW provisório. O logotipo original só deverá substituir o monograma quando seu arquivo estiver incorporado ao projeto.

## Não mexer sem teste

- Dados reais, banco SQLite e migrations
- Logins, papéis de usuário e autorização
- Regras de preço, descontos, comissões, agendamento e estoque
- Contatos, mensagens, webhook e sessão WhatsApp
- Integrações JEV e com provedores externos

## Homologação e riscos

1. Executar com Node >=22 e testar login, agenda, cliente, atendimento, caixa, estoque, equipe e responsividade.
2. Validar permissões em cada rota e isolamento entre empresas; coluna tenant_id não basta como prova.
3. Verificar backups, restauração, LGPD, sessões e logs.
4. Testar WAHA conectado de verdade e indisponível, sem disparo duplicado.
5. Confirmar que clicar cartões expandidos e submenus mantém funções originais.
6. Concluir layout em homologação antes de mesclar à branch main.

**Não foi executado o servidor ou testes de produção nesta revisão por acesso somente ao código via GitHub.**

## Próximos ciclos

**1.** Homologar essa interface. **2.** Garantir jornada ponta a ponta WhatsApp → agenda → checkout → estoque → relacionamento. **3.** Integrar apenas lacunas reais dos demais repositórios por API/adapters. **4.** Validar arquitetura SaaS de produção e logo final.
