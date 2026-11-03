# NOVAGENTE Estética — Consolidação técnica e preparação de release

**Data:** 03/11/2026  
**Origem GitHub:** `tmbmartell/salon-os`  
**Branch de consolidação:** `release/estetica-jander-consolidacao-2026-11-03`  
**Base:** `fix/etapa29-status-recepcionista` (PR #33; commit de base `803398cd3afdeb0e89a5840eb968da25f13150dd`).  
**Dependência:** PR #32 (`feat/etapa28-whatsapp-pareamento-seguro`), também aberta. A cadeia de PRs anteriores ainda precisa de revisão para integração à `main`.

## O que foi efetivamente consolidado

1. Criada uma branch própria para **revisão de entrega**, baseada na versão do código mais avançada.
2. Registradas em Git as **14 decisões aprovadas** e seus critérios verificáveis em `docs/PILOTO-JANDER-REQUISITOS-APROVADOS.md`.
3. Publicada matriz de lacunas e plano de homologação em `docs/PILOTO-JANDER-MATRIZ-LACUNAS-E-ACEITE.md`.
4. Comparado o Git com a aplicação ativa `/srv/margot/novagente-estetica-whatsapp-pilot`, **sem mudar o servidor**.
5. Reconciliadas diferenças não funcionais de comentário/formatação dos **três arquivos ativos** `server.mjs`, `public/app.js` e `public/novagente-approved-home.css`. Comparação byte a byte confirmou equivalência desses três arquivos.
6. Preservados os testes novos do Git, mesmo que a instalação ativa tenha cópias antigas. `tests/whatsapp-crm.test.mjs` e `tests/whatsapp-pairing.test.mjs` são **mais completos na branch do que na VPS**.
7. Nenhuma alteração foi feita em `.env.runtime`, banco, credenciais, sessão WAHA, serviço, tunnel, campanhas ou dados de clientes.

## Separação de versões e limitações

Na auditoria de entrada, o commit da branch de base PR #33 estava **373 commits / 125 arquivos à frente da `main`**, sem commits atrás. Logo, **não é seguro pressupor que `main` contenha a aplicação atual** ou fazer merge sem revisar o conjunto amplo de alterações.

Com a nova documentação presente no Git, a diferença entre o candidato e a pasta ativa é proposital em arquivos:

- `docs/PILOTO-JANDER-REQUISITOS-APROVADOS.md` e `docs/PILOTO-JANDER-MATRIZ-LACUNAS-E-ACEITE.md`: **novos no Git**; não copiar para a pasta ativa sem necessidade operacional.
- `tests/whatsapp-crm.test.mjs` e `tests/whatsapp-pairing.test.mjs`: testes de regressão atualizados no Git, não retroceder às versões instaladas.
- `scripts/activate-whatsapp-owner-once.mjs` e `docs/ETAPA-28-WHATSAPP-PAREAMENTO.md`: diferenças pontuais de versão, **mantidas para revisão**, sem aplicar o script operacional na VPS.
- Código ativo principal citado acima: **idêntico** ao candidato após reconciliação.

## Testes feitos na cópia isolada da branch

Local de validação: `/tmp/novagente-estetica-release-20261103`, sem ler credenciais ou executar dados de produção.

| Verificação | Resultado |
|---|---|
| `npm run check` | **PASSOU** |
| `npm test` | **110 testes, 110 passaram, 0 falharam** |
| `npm run release:preflight` (modo CI) | **PASSOU**; `production_ready=false` por desenho |
| `npm run commercial:smoke` (preview descartável) | **PASSOU** |
| `npm run booking:smoke` (preview descartável) | **PASSOU**, exercitando agendamento automático (agora permitido na R01 revisada). Não comprova, por si só, o aceite ponta a ponta do piloto nos canais reais, nem prevenção de conflitos ou segurança operacional. |
| HTTP local `/api/health` | **OK** |
| HTTPS `fighting-measurement-missed-mono.trycloudflare.com/api/health` | **HTTP 200** |
| WAHA | **Conectado / WORKING** |
| URL `estetica.novagente.com.br/api/health` | **HTTP 404**, pendência já conhecida |

**Cuidado:** nenhum teste automatizado aqui demonstra o envio real da recepcionista de IA, aprovação de campanhas ou integração do Instagram. Testes em preview não substituem aceite operacional.

## Atualização de requisito em 03/11/2026

A responsável do projeto retificou expressamente a **R01**: a IA **está autorizada a confirmar reservas diretamente**, desde que as condições de disponibilidade, escolha da cliente e regras do salão sejam atendidas. Foi retirada a exigência de confirmação humana para cada nova reserva. Os controles R02/R03, R09 e R10 continuam intactos. A primeira versão desta análise apontava conflito com R01; essa conclusão **foi substituída por este adendo**.

## Bloqueios para homologar o piloto do Jander

**P0 / impeditivos, não mascarar como “pronto”:**

1. **Agendamento automático (R01 revisada em 03/11/2026):** a IA **pode confirmar reservas sem aprovação individual da recepção**. O motor `booking-flow.mjs` contempla essa capacidade e a política `assistant_booking` estava ativa. Antes do uso real, homologar aceitação da cliente, disponibilidade atualizada e duração, profissional correta, conflitos/concor­rência, duplicidades, auditoria, mensagens e agenda. Uma reserva inválida ou ambígua deve ser encaminhada à recepção. **Não confundir autorização de reservar com poder de liberar horários ocupados/acionar a fila (R10).**
2. **Campanhas:** `sending_enabled=false`, campanha de exemplo permanece rascunho; precisam de aprovação humana versionada R02 e autorização específica R03, sem enviar antes do aceite.
3. **Catálogo:** apenas um produto e um serviço cadastrados na instância consultada, sem workflow técnico/gerencial publicado R05/R06.
4. **WhatsApp:** WAHA funciona, mas não há mensagens enviadas com `sender_type=assistant` na fotografia do banco. Validar entrega e fallback/handoff com teste controlado.
5. **Instagram:** Direct ainda não conectado; R07/R08 dependem de permissões oficiais e implementação segura.
6. **Agenda e lembretes:** R10–R14 dependem de teste completo, notificações e segregação de permissões.
7. **URL estável:** túnel Quick Tunnel é temporário e domínio próprio está retornando 404; configurar e validar domínio permanente antes de uso operacional contínuo.
8. **Dados e treinamento:** conferir com as recepcionistas a adaptação ao Saikon e a estratégia de importação parcial/completa ainda não aprovada.

## Porta de promoção para `main` e produção

- [ ] Rever a hierarquia das PRs abertas e resolver dependências/conflitos de forma ordenada.
- [ ] Executar `npm run check`, `npm test` e os smoke tests na **árvore final após cada resolução**.
- [ ] Revisar diferenças entre servidor, Git e artefatos instalados; **não commitar segredos, dados de clientes, backups, sessão WAHA ou chaves**.
- [ ] Homologar R01: IA confirma reservas válidas diretamente, impede conflitos/duplicidades, registra aceite da cliente e atualiza agenda/CRM/avisos corretamente. Não requer autorização individual da recepção.
- [ ] Implementar e validar os critérios P0 da matriz de aceite, inclusive R02/R03 e isolamento de acesso.
- [ ] Validar gateway/WhatsApp/Instagram em ambiente de homologação, com números e contas de teste.
- [ ] Confirmar política LGPD, conteúdo aprovado e consentimentos para envios.
- [ ] Aprovação de recepção, gerência e proprietário sobre os fluxos finais.
- [ ] Backup/restauração, teste de recuperação, MFA, domínio permanente, plano de rollback.
- [ ] **Somente então:** criar release/tag, revisão de PRs, merge controlado e implantação com monitoramento, preferencialmente em janela autorizada.

## Não realizado nesta etapa

- Nenhum merge na `main`, nenhum deploy/restart, nenhuma alteração no banco ou nas flags de IA.
- Nenhuma criação de campanha, envio de WhatsApp, importação de dados ou ligação ao Instagram.
- Nenhuma afirmação de que as 14 regras estão implementadas.

## Links de contexto

- PR #32: https://github.com/tmbmartell/salon-os/pull/32
- PR #33: https://github.com/tmbmartell/salon-os/pull/33
- Repositório: https://github.com/tmbmartell/salon-os

Este arquivo é o registro técnico do candidato e a passagem de responsabilidade para a homologação, não um certificado de operação pronta.
