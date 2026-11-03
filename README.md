# NOVAGENTE Estética — candidata técnica e piloto Jander

Sistema integrado de gestão para salões e negócios de estética: agenda + CRM, serviços, estoque, caixa/financeiro, equipe, marketing, indicadores e administração em **uma base SQLite com isolamento por salão**.

**Status atual:** `v0.9.0-rc.1` é uma *candidata de revisão*, ainda sem publicação, homologação com clientes reais ou merge em `main`. **Não é uma versão comercial pronta para produção.**

## Piloto Jander — alinhamento aprovado em 03/11/2026

Este repositório contém uma **candidata técnica**, enquanto a VPS opera uma instância piloto independente. A conexão WAHA foi observada em `WORKING`, mas **não há prova de resposta automática enviada** e o fluxo atual de reserva automática **não atende** à regra do Jander de confirmação pela recepção. Não confundir testes da prévia isolada com homologação em produção.

- [14 regras aprovadas e critérios de aceite](docs/PILOTO-JANDER-REQUISITOS-APROVADOS.md)
- [Matriz de lacunas e ordem de execução](docs/PILOTO-JANDER-MATRIZ-LACUNAS-E-ACEITE.md)
- [Consolidação de código, testes, dependências e bloqueios de release](docs/CONSOLIDACAO-TECNICA-JANDER-2026-11-03.md)

**Importante:** PRs #32 e #33 seguem como dependências; esta branch não deve ser integrada à `main` nem implantada até revisão/homologação. As 14 regras são **requisitos**, não funcionalidades automaticamente entregues.


## O que entra na candidata

| Frente | Componentes |
|---|---|
| Atendimento | Clientes, agenda, serviços, fichas técnicas e pacotes |
| Operação | Profissionais, equipe, estoque, compras, insumos e revenda |
| Financeiro | Checkout, caixa, métodos de pagamento registrados, comissões e relatórios |
| Gestão | Olho do Dono, alertas, dashboards, configuração e usuários |
| Relacionamento | Campanhas, tarefas de pós-atendimento e réguas sem disparo automático |
| Segurança | Sessões, permissões por perfil, MFA TOTP opcional para gestores, auditoria e proteção de exportação |
| Continuidade | Backup cifrado local experimental e restauração isolada para homologação |

**O WhatsApp/WAHA não faz parte da condição de entrega inicial**. A integração existe no código e terá configuração e homologação próprias depois. Nada na candidata implica sessão real conectada ou envio real habilitado.

## Pré-requisitos e execução local

Node.js **22+**, ambiente de teste separado e SQLite da aplicação. Não usar os dados de um salão real para testes.

```bash
npm run check
npm run release:preflight
npm test
npm start
```

A primeira execução sem conta é um provisionamento de teste. Em produção, o provisionamento da primeira proprietária exige um segredo configurado fora do código (`NOVAGENTE_SETUP_TOKEN`). O serviço usa `SALON_DB` para apontar o arquivo SQLite.

Se utilizar a autenticação em duas etapas, a chave `NOVAGENTE_MFA_KEY` deve conter **32 bytes aleatórios em base64** e ser armazenada no gerenciador de segredos do servidor. Não a inserir em `.env` versionado nem em mensagens. Se a chave for perdida, segredos MFA existentes se tornam ilegíveis.

### Testes e evidências

- `npm run check`: verifica sintaxe dos módulos críticos;
- `npm run release:preflight`: confere presença de arquivos e scripts que compõem a candidata, **não** aprova infraestrutura real;
- `npm test`: testes de API, concorrência, agenda, financeiro, estoque, segurança, MFA, isolamento entre salões e simulação de um dia operacional, sempre com dados fictícios;
- `.github/workflows/browser-qa.yml`: Chrome/Playwright com capturas de interface em ambiente temporário;
- `npm run release:production-check`: lista pendências bloqueantes de configuração e **encerra com falha até aprovações manuais**. Não cria segredos, não faz deploy e não valida conexão bancária.

Todos os workflows de pull request da candidata rodam para **qualquer alteração de arquivo**, inclusive módulos adicionados após as primeiras etapas.

## Estrutura do projeto

| Área | Caminho |
|---|---|
| Servidor/API/SQLite | `server.mjs`, `phase*.mjs` |
| Acesso, sessões, MFA | `auth.mjs`, `mfa.mjs`, `request-security.mjs` |
| Negócio | `finance-rules.mjs`, `inventory-rules.mjs`, `appointment-status.mjs` |
| Marketing e mensagens | `marketing.mjs`, `whatsapp.mjs`, `whatsapp-backfill.mjs` |
| Dashboards | `owner-eye.mjs`, `public/app.js` |
| Interface | `public/index.html`, `public/beauty-ui.css` e scripts específicos |
| Backup piloto | `pilot-backup.mjs`, `scripts/pilot-backup.mjs` |
| Pré-validação | `scripts/release-preflight.mjs` |
| Testes | `tests/*.test.mjs`, `tests/browser-smoke.mjs` |
| Histórico e documentação | `docs/ETAPA-*.md` |

## Como revisar a candidata

- A branch `release/novagente-estetica-piloto-offline-rc1` foi criada a partir da última etapa do desenvolvimento encadeado (Etapa 17), **sem cherry-pick ou cópia manual** de arquivos.
- O PR consolidado aponta para `main`, reunindo o trabalho acumulado para **uma revisão única**.
- Os PRs anteriores continuam como histórico de mudanças e testes; não devem ser mesclados separadamente sobre o mesmo trabalho sem planejamento, sob risco de duplicação de revisão.
- Antes de mesclar, conferir `main` novamente, revisar arquivos/segredos, auditoria de dados e resultados de CI; solicitar aprovação técnica explícita.
- Não implantar o código diretamente em domínio público; executar primeiro em homologação com credenciais e banco descartáveis.

## Critérios ainda necessários para disponibilização real

1. Revisão do PR consolidado e aprovação para integrar a versão principal, com plano de rollback.
2. Hospedagem segura, HTTPS, reverse proxy e segredos sob controle do operador.
3. Backups **fora do servidor**, rotina de rotação, teste de restauração e recuperação de chave MFA.
4. Ajuste de permissões por profissional/ficha, retenção e política de privacidade compatível com LGPD.
5. Teste supervisionado com proprietária, recepção e profissional em dispositivos físicos.
6. Monitoramento, revisão de segurança independente e aceite final para o piloto.

**A sessão WAHA do piloto foi observada conectada; isso não comprova envio pela IA nem homologação comercial. Não há integração de cobranças bancárias reais homologada.**

Veja `docs/ETAPA-18-CANDIDATA-ENTREGA.md` e `docs/ETAPA-17-PRIVACIDADE-CHECKLIST-ENTREGA.md`.
