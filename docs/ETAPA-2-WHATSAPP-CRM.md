# Etapa 2 — WhatsApp integrado ao CRM (NOVAGENTE Estética)

**Situação:** código em revisão. Nenhum número de WhatsApp conectado foi comprovado nesta etapa; deploy e merge não realizados.

## Entregas implementadas

- Cadastro explícito de **identificador de sessão WAHA** por empresa, permitido apenas à proprietária;
- Validação de identificador (3–60 caracteres ASCII seguros) e **rejeição de sessão já pertencente a outro salão**;
- Troca atômica de sessão, desativando a anterior e preservando a nova após reinício;
- Status da conexão, preparação, QR Code e verificação dentro de **Atendimento → Conexão WhatsApp**;
- Mensagens claras para estados **sem sessão**, **WAHA indisponível**, **aguardando conexão** e **conectado**;
- Histórico da cliente na lateral da conversa, consultado por rota autenticada com filtro por empresa;
- Atalho **Agendar** na conversa, preenchendo a cliente na abertura do agendamento;
- Correção da abertura de todos os cards da lista de mensagens;
- Atendimento **humano por padrão**. A IA não responde, a menos que a flag `NOVAGENTE_ENABLE_RECEPTIONIST_AI=true` seja habilitada futuramente de forma explícita;
- Junções de clientes e usuários nas conversas protegidas pelo `tenant_id` para evitar vazamento entre empresas;
- Testes de não compartilhamento/tomada de sessão, troca de sessão e dados cruzados.

## Pré-requisitos para homologação real

1. Iniciar uma cópia de teste da plataforma, em ambiente HTTPS seguro.
2. Configurar WAHA com `WAHA_BASE_URL`, `WAHA_API_KEY`, `WAHA_WEBHOOK_HMAC_SECRET` e `WAHA_WEBHOOK_URL` no ambiente, sem expor credenciais ao frontend.
3. Entrar como proprietária e cadastrar identificador exclusivo (por exemplo `novagente-estetica-teste`).
4. Clicar **Preparar conexão** e **Mostrar QR Code**.
5. Escanear o QR Code com número de WhatsApp **de teste**, não o número principal de produção.
6. Verificar o status **Conectado**; enviar mensagem de um segundo número para o número de teste.
7. Confirmar a mensagem recebida no CRM, vínculo automático ao cadastro, resposta manual, histórico e associação na Agenda.
8. Reiniciar o servidor e verificar se a sessão exclusiva continua corretamente selecionada.
9. Testar dois salões de forma isolada: WhatsApp, clientes, sessões e históricos de mensagens.
10. Rodar `npm run check` e `npm test`, inspecionando logs e falhas.

## Fora do escopo desta etapa

- IA recepcionista, automações de campanhas e resposta automática;
- envio automatizado de mídias (JPG/GIF), templates de campanha;
- validação de conexão real WAHA neste ambiente;
- API oficial da Meta como segunda opção de provedor (permanece como arquitetura futura);
- publicação na VPS e habilitação em produção.

**Não conectar o WhatsApp principal até a homologação técnica e das políticas do canal.**
