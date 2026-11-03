# Etapa 19 — Demonstração gratuita com pendências controladas

**Data:** 27/10/2026  
**Projeto:** NOVAGENTE Estética  
**Base:** RC1 `release/novagente-estetica-piloto-offline-rc1`  
**Situação:** configuração e testes da demonstração. **Não houve deploy real, merge ou contratação.**

## Decisão de escopo

O primeiro objetivo é permitir a **visualização e testes operacionais com dados fictícios**, sem conectar o WhatsApp e sem pagar hospedagem agora.

### O que é entregue nesta etapa

- `render.yaml`: Blueprint para **Render Web Service Free** em Node 22, deploy automático desativado e healthcheck local.
- `scripts/start-free-preview.mjs`: inicia servidor com **novo SQLite temporário**, exclusivo daquela execução; não aponta para diretório de um cliente.
- `free-preview.mjs`: impede início sem confirmação explícita de modo descartável, sem login de teste configurado ou quando detectar integração externa configurada.
- Conta proprietária de demonstração criada no primeiro boot, com e-mail e senha definidos **somente no painel privado de variáveis do serviço**.
- Primeiro cadastro público não pode assumir a conta: `NODE_ENV=production` e `NOVAGENTE_SETUP_TOKEN` protegido.
- Origem HTTPS externa obtida de `RENDER_EXTERNAL_URL` somente para prévia, sem aceitar cabeçalho `X-Forwarded-For` enviado por visitante.
- Aviso visível na tela: **“Demonstração gratuita; apenas dados fictícios; tudo poderá ser apagado ao reiniciar; não cadastre clientes reais.”**
- `tests/free-preview.test.mjs`: segurança de configuração, inicialização, login, proibição de setup aberto, ausência de WhatsApp, descarte de alterações e reinício com base limpa.

## Limitações verificadas na documentação oficial do Render

Plano Free:
- Disponível para web services Node, dentro de cotas de uso do serviço.
- Entra em repouso após **15 minutos sem atividade**.
- Bancos SQLite e arquivos locais desaparecem em reinícios, republicações ou quando o serviço adormece.
- Free não suporta disco persistente e não deve ser usado como produção.

Referências:
- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://render.com/docs/environment-variables

**Não prometer disponibilidade contínua, dados persistentes, ausência absoluta de cobranças por excedentes de consumo nem uso comercial no Free.** Conferir cotas e plano na conta antes de provisionar.

## Como ativar quando houver autorização

1. Criar/abrir conta gratuita no [Render Dashboard](https://dashboard.render.com/), sem vincular meio de pagamento se não for necessário e sem contratar plano pago.
2. Conectar o GitHub `tmbmartell/salon-os` ao Render com escopo mínimo necessário.
3. Criar um **Blueprint** a partir do `render.yaml` da branch `feat/novagente-estetica-demo-gratuita-etapa19`.
4. Conferir se o serviço foi configurado como `plan: free`, se aponta **apenas para a branch de preview**, com deploy automático desligado.
5. Preencher `NOVAGENTE_DEMO_OWNER_EMAIL` e `NOVAGENTE_DEMO_OWNER_PASSWORD` nas variáveis privadas do Render (senha de no mínimo 16 caracteres). Não publicar a senha em README, mensagem ou captura.
6. Manter `NODE_ENV=production`, `NOVAGENTE_FREE_PREVIEW=yes`, `HOST=0.0.0.0`; o Blueprint gera `NOVAGENTE_SETUP_TOKEN`, e o processo cria a chave MFA temporária em base64 **a cada inicialização**, acompanhando o banco descartável.
7. Conferir que variáveis de integração externa como `WAHA_API_KEY`, `WAHA_BASE_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `JEV_CONTROL_PLANE_URL`, `DATABASE_URL` estejam **vazias ou ausentes**.
8. Autorizar o primeiro deploy **manual** da demonstração. Verificar a URL real disponibilizada pelo Render; nunca inventar uma URL.
9. Verificar `GET /api/health`: `mode: "free_preview_disposable"`, `disposable_demo: true`.
10. Validar login, aviso de demonstração, cards de atendimento, agenda e caixa com dados fictícios.
11. Desligar ou remover a demonstração quando não for mais necessária.

**Atenção:** cada reinício poderá zerar o cadastro e também desfazer novas contas, modificações e cenários de teste. Não existe rotina de backup para preservar os dados dessa demonstração.

## Pode ficar pendente AGORA (para o preview fictício)

- Conexão WAHA/QR Code e sincronização de WhatsApp real.
- Integrações bancárias/Pix de cobrança real, emissão fiscal e assinatura eletrônica.
- Hospedagem paga e banco persistente.
- Backups externos e restauração do servidor final (mas **obrigatórios antes de usar dados reais**).
- Domínio personalizado e marca própria no endereço.
- Integrações com ferramentas comerciais externas e automações de envio.
- Testes com funcionários e clientes reais (necessários para aprovar o piloto posterior).
- MFA obrigatório (MFA opcional já implementado, política obrigatória fica para a implantação real).

## Não pode ser tratado como concluído ou ignorado antes de clientes reais

- Revisão de dados pessoais, LGPD, retenção e acesso de profissionais às fichas.
- Controle da conta, segredos, HTTPS e autenticação no ambiente definitivo.
- Backup externo cifrado, restauração testada, monitoramento e plano de reversão.
- Homologação com pessoas reais e dispositivos físicos, desempenho e usabilidade.
- Revisão final da versão, aprovação de merge para `main` e aceite de publicação.

## Progresso de planejamento

**Para entrega inicial de demonstração gratuita e depois piloto sem WhatsApp: estimativa provisória de 85% concluído e 15% restante**, após validação de CI e sem deploy real. Percentual subjetivo de gestão, não derivado automaticamente do GitHub.

Os **15% restantes** são estimados para:
- 3 pontos: configurar/acessar Render e validar a demonstração ao vivo (depende de conta e autorização);
- 5 pontos: operação supervisionada com equipe, celulares e correções;
- 4 pontos: revisão das permissões sensíveis, LGPD e segurança antes de dados reais;
- 3 pontos: aprovação da release, backup externo/restauração e critérios para o piloto persistente.

Esta porcentagem **não significa versão publicada** e **não autoriza dados reais**.
