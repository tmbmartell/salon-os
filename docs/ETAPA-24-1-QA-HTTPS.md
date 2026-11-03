# NOVAGENTE Estética — Etapa 24.1 · QA da demo HTTPS

Data de verificação: **28/10/2026**. Esta homologação é de uma demo com dados fictícios, não uma liberação para produção.

## Ambiente isolado

- Código: `feat/etapa24-1-agendamento-inteligente`, PR #28 (rascunho), derivada das PRs #27 e #26.
- Processo de demonstração independente na VPS, porta interna 19332, sem substituir a demo existente na porta 19331.
- HTTPS por túnel temporário `trycloudflare.com`, sem garantia de disponibilidade permanente.
- `NOVAGENTE_FREE_PREVIEW=yes`, `NODE_ENV=production`, host `127.0.0.1`, banco SQLite descartável por reinício.
- `NOVAGENTE_ENABLE_RECEPTIONIST_AI=false`, `NOVAGENTE_ENABLE_WHATSAPP_AI=false` e `NOVAGENTE_AUTOMATION_V2_APPROVED=false`; sem serviços externos configurados.
- Importante: para autenticação sob túnel HTTPS, configurar `NOVAGENTE_PUBLIC_ORIGIN` com a origem exata `https://<domínio-temporário>` e `NOVAGENTE_TRUST_PROXY=true` apenas quando o proxy está conectado por loopback. Não usar origens curinga nem confiar em cabeçalhos enviados diretamente por visitantes.

## Testes realizados

- `npm run check`: aprovado.
- `npm test`: **90/90 aprovados**.
- `npm run commercial:smoke`: aprovado.
- `npm run booking:smoke`: aprovado, com exactly one record em `appointments`, sem cobrança ou envio externo.
- Navegador Chrome 155 em ambiente controlado:
  - login HTTP local retornou 200;
  - login HTTPS do túnel inicialmente falhou 403 por origem não cadastrada; após configuração explícita da origem confiável, retornou **200**;
  - navegação real para Atendimento e abertura do painel de automações;
  - painel de simulação de agendamento clicável e priorizado, antes das opções avançadas;
  - cliente fictícia solicitou **Coloração amanhã**; o sistema ofereceu 2 vagas reais, e confirmou a escolha **1**;
  - teste de temas claro e escuro em **1440×900**, **768×1024** e **390×844**;
  - nenhum overflow horizontal no documento nos três tamanhos; cores de superfície dos temas distintas e legíveis.
- Painel de agendamento móvel recebeu redução de área vazia e cache busting para permitir atualizações.

## Restrições e pendências

- **Não é homologação de WhatsApp real**: a demo é deliberadamente sem WAHA, sem envio real.
- A URL `trycloudflare.com` é efêmera e muda se o processo de túnel reiniciar.
- Uma simulação pode modificar a base fictícia; os dados são descartados ao reiniciar o serviço.
- O agendamento conversa com a agenda interna, mas ainda é necessário QA com o provedor WhatsApp, reentrega de mensagens, conflitos multi-instância, exclusividade temporária da reserva, acessibilidade completa e testes end-to-end com fornecedores antes de ativação comercial.
- O modo premium, pagamento, impostos e emissão de notas fiscais continuam desabilitados nesta demo.

## Critérios para seguir

1. Demonstração visual com login pelo HTTPS público, sem compartilhar credenciais em logs/repositório.
2. Revisão das mensagens e do fluxo por responsável do salão.
3. Aprovação explícita de política de IA e consentimento de contatos antes de conectar provedor externo.
4. Auditoria operacional de cancelamentos, agendamentos simultâneos e retorno para humanos.