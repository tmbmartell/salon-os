# Correção de continuidade da Recepcionista IA — 7 de novembro de 2026

## Sintoma reproduzido

No WhatsApp provisório de homologação, a cliente escreveu:
1. "Quero agendar uma limpeza de pele"
2. "Limpeza de pele"

A IA gerava repetidamente "Vamos agendar! Qual serviço você quer fazer?".

**Causa confirmada**: no cadastro real o serviço se chama **Limpeza de Pele Profunda**. A identificação anterior aceitava apenas o nome completo, portanto não reconhecia o nome abreviado. O motor de linguagem contextual externo também não está configurado: `llm_configs` está vazio e o socket local do cérebro indisponível, fazendo o sistema recorrer ao roteiro determinístico de reservas.

## Mudança

O módulo `booking-flow.mjs` agora:
- Reconhece um nome abreviado se ele indicar um único serviço do catálogo.
- Se houver mais de uma modalidade plausível, pergunta qual delas, sem escolher sozinho.
- Preserva a data informada em um turno anterior, mesmo antes de reconhecer o serviço.
- Mantém o estado por conversa e salão, com garantia de não criar agendamento sem uma escolha explícita de vaga.
- Não altera a política de intervenção humana, o filtro de reclamações, a assinatura do webhook ou o envio automático de campanhas.

## Testes

- Teste de módulos: diálogo separado serviço -> dia -> vaga -> confirmação, nomes abreviados e ambiguidades.
- Teste de integração HTTP com WAHA **simulado**, HMAC, `assistant_reply` e `assistant_booking` ativados somente no banco QA; testa duas mensagens consecutivas e evento duplicado.
- `npm run check`, `npm test`, Chrome Playwright e `npm run booking:smoke`.

## Ainda necessário para conversa aberta com IA generativa

A continuidade **estruturada de agendamento** está corrigida, mas conversas livres e mais complexas ainda usam regras de segurança e respostas determinísticas enquanto não houver provedor de LLM configurado ou serviço de cérebro disponível. Não afirmar que existe memória generativa plena.

O modelo externo poderá ser habilitado futuramente na administração técnica NOVAGENTE (chave em armazenamento protegido, testes de custo/latência e barreiras de dados pessoais) sem expor configurações aos proprietários dos salões.

## Operação

Nunca reenviar automaticamente a última mensagem recebida durante o deploy; isso poderia causar respostas duplicadas a clientes. Após o deploy, teste novamente a partir do número autorizado enviando uma mensagem nova. A base de produção e a sessão WAHA devem ser preservadas integralmente.
