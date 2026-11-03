# Etapa 18 — Release Candidate RC1 e consolidação para entrega

**Produto:** NOVAGENTE Estética  
**Candidata:** `v0.9.0-rc.1`  
**PR integrado:** https://github.com/tmbmartell/salon-os/pull/18  
**Branch:** `release/novagente-estetica-piloto-offline-rc1`  
**Alvo:** `main`  
**Data:** 27/10/2026  
**Status:** **versão de revisão**, sem merge, sem publicação, sem uso de contas reais e **sem WAHA conectado**.

## 1. O que foi consolidado

As PRs #1–#17 foram desenvolvidas em *branches encadeadas*: a etapa seguinte sempre começou da anterior. Assim, a Etapa 17 já continha as anteriores.

A RC1 foi **derivada da Etapa 17 sem recriar ou copiar cada arquivo**. A comparação inicial da última etapa com `main` confirmou:

- **229 commits adiante**;
- **0 commits atrás**;
- **74 arquivos alterados**;
- documentação, testes automatizados, SPA, autenticação, CRM, agenda, financeiro, estoque, equipe, marketing, mensageria preparada, relatórios, MFA opcional e utilitários de backup.

Esses números retratam a **base antes dos commits exclusivos de RC1** e não são números de funcionalidades prontas para uso comercial.

O PR #18 passa a ser a referência principal para revisão do **pacote acumulado**. As PRs anteriores permanecem como histórico; mesclar todas elas isoladamente, além do PR consolidado, exigiria outro plano de integração e poderia aumentar o retrabalho.

## 2. Aperfeiçoamentos específicos da RC1

- `README.md` atualizado com a arquitetura real, instruções de teste, escopo offline e limites da candidata.
- `package.json` identificado como `0.9.0-rc.1`, com comandos de pré-validação.
- `scripts/release-preflight.mjs` valida Node 22+, presença dos módulos indispensáveis e scripts.
- Em modo de análise de produção, o preflight também exige HTTPS público, chave MFA, token inicial e banco de dados fora dos arquivos públicos.
- **Nenhum verificador automatizado pode declarar o projeto pronto para produção**: backup off-site, revisão de segurança/LGPD, validação humana e plano de rollback exigem evidências externas.
- `tests/release-preflight.test.mjs` valida caminhos de falha e confirma que segredos não são escritos no resultado.
- CI de API e Chrome agora executa em **todos os pull requests**, mesmo quando só módulos especializados são alterados.

## 3. Comandos reproduzíveis

```bash
npm run check
npm run release:preflight
npm test
```

Os testes de interface e responsividade são executados por `.github/workflows/browser-qa.yml`, com ambiente temporário e dados sintéticos.

Para **avaliar** configurações de publicação (não executar deploy):

```bash
npm run release:production-check
```

Este último comando **falha enquanto houver bloqueios técnicos ou aprovações manuais**. Não cadastrar chaves ou segredos em arquivos versionados apenas para torná-lo verde.

## 4. Critérios de aceitação da RC1

| Verificação | Evidência necessária |
|---|---|
| Histórico consolidado | Branch RC1 comparável à `main`, sem divergência/duplicação |
| Regressão da API | `npm run check`, `npm test` e `npm run release:preflight` aprovados na **RC1** |
| Interface | Chrome/Playwright sem erro em login, agenda, estoque, financeiro, gestão, MFA e layout |
| Merge/revisão | PR #18 revisado e integração para `main` feita apenas após autorização |
| Segurança | Permissões por profissional/ficha, controle de sessões, LGPD e revisão de recuperação MFA |
| Hospedagem | Ambiente piloto, HTTPS, segredos, banco, backups externos e restauração real |
| Aceite operacional | Gestora, recepção e profissional validam operações em aparelhos físicos |
| Mensageria | **Adiada** — WAHA não precisa estar conectado para o primeiro piloto |

Os três últimos critérios são **pendências**, não itens concluídos por CI.

## 5. Estimativa de entrega, sem conexão com WhatsApp

Percentuais de gestão, **não medidos automaticamente** e válidos somente para o escopo do *primeiro piloto offline*.

- Após a Etapa 17: **78% concluído / 22% faltante**.
- Após preparar a RC1 e validar o pacote acumulado: **estimativa de 83% concluído / 17% faltante**.

Pontos percentuais restantes propostos:

| Próximo trabalho | Pontos estimados |
|---|---:|
| Revisão técnica final do PR #18, integração autorizada e plano de rollback | 2 |
| Hospedagem segregada, HTTPS, segredos, backup externo e restauração real | 6 |
| Piloto presencial/supervisionado com dispositivos e correções pontuais | 5 |
| Permissões de fichas, revisão LGPD e aceite técnico de segurança | 4 |
| **Total restante** | **17** |

A nota de 83% **não significa que a versão está em `main` ou acessível em domínio público**. Reflete o fechamento do trabalho de consolidação para um PR de revisão, com integração final ainda pendente.

## 6. Próxima etapa recomendada

**Etapa 19 — Revisão de release e implantação de homologação isolada.** Exige definir ou autorizar explicitamente o ambiente (host/conta, domínio de QA e segredos), preservar a base real, testar a restauração e obter aceite técnico do PR. Não iniciar deploy de produção nem WhatsApp real sem decisão posterior.
