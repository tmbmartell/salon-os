# NOVAGENTE Estética — acessos simples e perfis (Etapa 1)

## Para o proprietário do salão

Entre em **Administração → Usuários e acessos**. Você pode:

- **Convidar pessoa:** informe nome, e-mail e perfil. Para recepção ou profissional, envie o link individual de ativação, válido por 15 minutos. O funcionário abre, toca em **Ativar acesso sem senha** e é autenticado. Para gerentes, a criação de senha permanece obrigatória.
- **Link para entrar:** gere novo link individual de 10 minutos para uma recepcionista ou profissional ativo. O anterior é invalidado. O link é usado uma vez; a sessão já criada continua válida conforme política atual (até sete dias, com oito horas de inatividade).
- **Redefinir senha:** gere um link de uso único válido por 15 minutos para gerente ou funcionário. O proprietário não vê a senha antiga nem a nova.
- **Desativar:** encerra acesso da conta; o link já emitido para a pessoa não autoriza entrada após a desativação. Revogue sessões conforme a operação existente.
- **Permissões por perfil:** proprietário, gerência, recepção e profissional permanecem isolados, inclusive por empresa.

Os links **não são enviados automaticamente**, porque o sistema ainda não possui um emissor de e-mails configurado. Copie e entregue individualmente, nunca em grupos. Um link é equivalente a uma credencial temporária; se outra pessoa o abrir primeiro, pode usar a sessão. Portanto, envie apenas por canal de confiança.

## Administração NOVAGENTE versus proprietário do salão

O cliente acompanha operação, agenda, produtos, preços, equipe e autorizações. Ele **não** recebe prompts, instruções internas, chaves de API ou controles de autonomia dos agentes.

Para habilitar o diagnóstico técnico a uma conta de operação da NOVAGENTE, configurar no ambiente protegido do servidor (nunca no Git):

`NOVAGENTE_PLATFORM_ADMIN_USERS=<e-mail operacional autorizado>`

A conta precisa ter perfil `owner` no contexto atual **e MFA ativado**. Sem configuração explícita e MFA, a plataforma bloqueia os endpoints técnicos. Essa lista é uma restrição adicional da fase piloto, **não** substitui um serviço separado de identidade e auditoria para suporte multiempresa. Não compartilhar a conta principal com o cliente.

## Segurança

- Tokens aleatórios com 256 bits, hashes SHA-256 no banco e consumo único em transação.
- Links de entrada expiram em 10 minutos; convites sem senha e redefinições expiram em 15 minutos.
- Um link novo de entrada revoga o link antigo daquele funcionário.
- Não é permitido gerar link de login para proprietário/gerência nem utilizar link de funcionário após promoção para função gerencial.
- Links de entrada trafegam em fragmento `#access=`, que não vai ao servidor na requisição de navegação; após a leitura, o fragmento é retirado do histórico.
- A conta de proprietário não pode ser recuperada por esses links emitidos para a equipe.
- Autenticação administrativa por senha e MFA continua disponível. Não reduzir o tamanho mínimo de senha para tornar o login conveniente.

## Testes antes de publicar

`npm run check`, `npm test`, `QA_CHROME=/usr/bin/google-chrome node tests/browser-smoke.mjs`, `npm run booking:smoke`, `npm run commercial:smoke`.

Teste especialmente: segundo uso do link, expiração, emissão de novo link, conta inativa, role change, isolamento entre salões, rotas de prompts com 403 para proprietário e gerência, bloqueio de configuração de LLM e criação de usuário por convite sem senha.

**Pendente para a próxima etapa:** telefone de notificações já existe no cadastro profissional, mas o envio automático de agendamentos, remarcações, cancelamentos e tempo restante via WhatsApp continua sem homologação. Não considerar configurado apenas porque o telefone está cadastrado.
