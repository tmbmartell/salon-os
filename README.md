# Salon OS — Nova Gente

Sistema operacional para salões e negócios de beleza, criado pela **Nova Gente**.

O Salon OS reúne operação, atendimento, agenda, CRM, WhatsApp, financeiro, estoque, pacotes, equipe, relatórios e agentes de IA em uma única aplicação.

## Principais módulos

- CRM de clientes e histórico
- Agenda com múltiplos serviços e profissionais
- Recursos físicos e prevenção de conflitos
- Atendimento via WhatsApp / WAHA
- Recepcionista com IA configurável
- Caixa, financeiro e comissões
- Produtos, estoque, fornecedores e PDV
- Pacotes e créditos de serviços
- Fidelização e relacionamento
- Ficha técnica
- Gestão de equipe e desempenho
- Relatórios gerenciais
- Estrutura multiempresa (`tenant_id`)
- PWA responsivo

## Requisitos

- Node.js 22 ou superior
- SQLite com suporte via `node:sqlite`
- Variáveis de ambiente para integrações externas quando utilizadas

## Executar

```bash
PORT=9331 HOST=127.0.0.1 node server.mjs
```

Ou:

```bash
npm start
```

## Configuração

Credenciais e chaves **não fazem parte deste repositório**.

Integrações como WhatsApp/WAHA, LLM e JEV devem ser configuradas por variáveis de ambiente ou armazenamento seguro externo.

## Segurança

Não versione:

- arquivos `.env`
- bancos SQLite
- backups
- chaves privadas
- tokens de API
- logs de produção

O `.gitignore` deste projeto já cobre esses arquivos.

## Estrutura

- `server.mjs` — servidor principal e rotas
- `auth.mjs` — autenticação e autorização
- `whatsapp.mjs` — integração de mensageria
- `llm_config.mjs` — configuração segura de LLM
- `receptionist_brain.mjs` — camada de inteligência da recepcionista
- `phase*.mjs` — módulos operacionais do produto
- `public/` — interface web e PWA

## Empresa

**Nova Gente** — Inteligência Artificial aplicada em sua vida.

