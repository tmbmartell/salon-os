# DeepSeek na recepcionista NOVAGENTE Estética

## Provedor e objetivo
- **Provedor escolhido:** DeepSeek
- **Modelo inicial:** `deepseek-flash` (modo sem raciocínio estendido) — conversa natural e respostas curtas.
- **Alternativa posterior:** `deepseek-v4-pro` apenas se houver motivo técnico e orçamento.
- **Integração:** `https://api.deepseek.com/responses`, formato JSON com schema fechado para `reply`, `intent`, `handoff`, `reason`, `confidence` e entidades da conversa.

## Fluxo da cliente
1. Mensagem recebida do WhatsApp provisório e categorizada pelo CRM.
2. Verificação de intervenção humana, regras do salão, disponibilidade e agenda.
3. Se for agendamento em andamento, **o fluxo de reservas tem prioridade**, consulta disponibilidade real e só confirma após a escolha.
4. Se perguntar preço, o sistema usa os valores efetivos do catálogo, não a invenção do modelo.
5. Quando for conversa livre, o modelo DeepSeek recebe contexto necessário e histórico recente minimizado e devolve uma resposta estruturada.
6. Se o provedor falhar, estiver sem chave ou atingir a cota, o sistema retorna às regras locais ou encaminha para a equipe, conforme os controles atuais.
7. A operação continua auditável; o proprietário não acessa prompts internos ou chaves.

## Privacidade e consumo
- Não enviar telefone, CPF, e-mail, aniversário, notas de saúde ou alergias da ficha da cliente à API.
- Mensagens recentes têm contatos e documentos mascarados; nome da cliente reduzido ao primeiro nome.
- Chave criptografada no banco via AES-256-GCM, chave-mestra local fora do repositório, e nunca retorna no GET.
- Limite diário **padrão de 120 requisições por salão**, ajustável com `NOVAGENTE_LLM_DAILY_LIMIT`; registrar requisições, falhas e tokens.
- A API DeepSeek exige credencial própria e faturamento separado. Não depende da assinatura do ChatGPT.

## Ativação (somente administração NOVAGENTE)
**Não colar chave de API nesta conversa nem no GitHub.**

1. Entre em `https://platform.deepseek.com/`, área de **API Keys**, e crie uma chave exclusiva para o piloto.
2. A administração técnica NOVAGENTE precisa de conta explicitamente liberada em `NOVAGENTE_PLATFORM_ADMIN_USERS` **e MFA ativo**. Não conceda isso ao proprietário do salão.
3. No sistema: **Funcionários Artificiais → Recepcionista IA → Configurar agente → Modelo de IA**.
4. Selecione `DeepSeek`, modelo `deepseek-flash`. Cole a chave no campo protegido. Clique em **Testar conexão** e, depois, **Salvar**.
5. Confira o status da integração e o contador de uso. Faça um teste com conta e número autorizados, sem dados sensíveis.
6. Só depois considere ativar respostas automáticas para números reais. Atendimento humano precisa continuar tendo prioridade.

### Alternativa de provisionamento pelo servidor
Para o operador autorizado que não tiver a interface técnica pronta, existe `scripts/configure-deepseek-llm.mjs`. Ele lê a chave exclusivamente de um **arquivo privado com chmod 600**, nunca de argumentos de processo, testa com um simples "OK" e armazena o segredo criptografado. O arquivo temporário deve ser apagado com segurança depois.

Exemplo em terminal de operações:

`node scripts/configure-deepseek-llm.mjs --db=/srv/margot/novagente-estetica-whatsapp-pilot/data/estetica.sqlite --key-file=/caminho/privado/deepseek.key --model=deepseek-flash`

## Validação e limitações
Testes do provedor são simulados até haver uma chave de API real. Sem ela, **não afirmar DeepSeek conectado, respondendo nem aprovado end-to-end**. Mesmo com a API conectada, confirmar entrega WhatsApp exige mensagem real autorizada. Nunca disparar campanhas automaticamente durante homologação.
