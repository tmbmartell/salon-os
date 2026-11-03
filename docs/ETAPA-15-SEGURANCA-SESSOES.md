# NOVAGENTE Estética — Etapa 15: autenticação, privilégios e proteção HTTP

**Data:** 27/10/2026  
**PR:** https://github.com/tmbmartell/salon-os/pull/15  
**Estado:** validação automática aprovada, **sem merge e sem deploy**. WhatsApp permanece adiado.

## O que foi corrigido

### 1. Login com proteção por conta
- Uma conta identificada por e-mail + workspace recebe bloqueio temporário após **8 falhas** numa janela de **15 minutos**.
- As tentativas e o prazo são mantidos no SQLite e continuam valendo entre instâncias do servidor que compartilham a base.
- A API retorna HTTP **429**, com cabeçalho `Retry-After: 900`. O contador é reiniciado depois de login correto quando a conta não estiver bloqueada.
- Esta proteção reduz tentativas automatizadas, mas **não substitui MFA**, detecção de abuso distribuído nem revisão de risco de bloqueio intencional de contas.

### 2. Autorização e sessões
- Apenas **proprietária** pode alterar o cargo de outro usuário.
- Uma mudança efetiva de papel é transacional e invalida todas as sessões do usuário naquele salão, exigindo novo login.
- A gerência não pode usar a rota de alteração de cargo para se promover a proprietária.
- Controles de acesso são feitos no **backend**, e não apenas ocultando botões.

### 3. Proteção HTTP, origem e proxy
- O novo módulo `request-security.mjs` centraliza validação de `Origin` e `Sec-Fetch-Site` para operações de escrita.
- `POST/PATCH/PUT` enviados como formulário simples ou `text/plain` são recusados; JSON continua permitido e não há liberação CORS para sites externos.
- A verificação de origem não aplica uma autenticação por cookie ao webhook WAHA, pois essa rota já exige **HMAC**.
- Cabeçalhos `X-Forwarded-For` e `X-Forwarded-Proto` só são considerados se **NOVAGENTE_TRUST_PROXY=true** e a conexão imediata vier de loopback. Caso contrário, o IP efetivo vem do socket.
- Se publicado atrás de proxy, definir `NOVAGENTE_PUBLIC_ORIGIN` com a origem pública exata, incluindo `https://`, sem barra final. Configurar HTTPS no proxy e limitar acesso direto ao backend.

### 4. Primeiro acesso de proprietária
- Com `NODE_ENV=production`, o provisionamento inicial exige o cabeçalho secreto `X-NOVAGENTE-SETUP-TOKEN` correspondente a `NOVAGENTE_SETUP_TOKEN`, de no mínimo 32 caracteres.
- Sem o segredo do operador, o endpoint recusa o provisionamento.
- O segredo deve ser criado fora do GitHub, armazenado em cofre de segredos e nunca incluído em captura de tela, URL, ticket ou log.
- O modo piloto de desenvolvimento continua aceitando a criação inicial controlada em banco temporário, para que os testes automatizados permaneçam reproduzíveis.

## Testes executados

O arquivo `tests/security-hardening.test.mjs` valida:
1. Tentativa de autenticação com `Origin` de site externo e `Sec-Fetch-Site` suspeito;
2. Formulário com corpo e **formulário vazio** usados para tentar provocar efeitos de navegação;
3. Login permitido com origem correta;
4. Gerente impedido de se promover;
5. Revogação de sessão após mudança de cargo;
6. Conta rebaixada impedida de ler relatórios de proprietária;
7. Proteção de login após erros repetidos, mesmo variando `X-Forwarded-For`;
8. Cabeçalhos falsificados não tornando a requisição segura;
9. Bloqueio de primeiro cadastro de proprietária em modo produção sem segredo ou com segredo errado.

**Resultados verificáveis:**
- [45 testes aprovados, zero falhas](https://github.com/tmbmartell/salon-os/actions/runs/40474729041)
- [Teste visual com Chrome aprovado](https://github.com/tmbmartell/salon-os/actions/runs/40474729049)

## Limites — NÃO é liberação para produção

- Não há **autenticação multifator (MFA)** implementada.
- O bloqueio por e-mail pode causar negação temporária de serviço se alguém tentar entrar repetidamente na conta alheia; é necessária política operacional de desbloqueio e observabilidade.
- A proteção de origem + `SameSite=Lax` + JSON reduz CSRF, mas ainda é recomendada **defesa adicional por token CSRF explícito** em fluxos sensíveis, após inventário dos clientes HTTP.
- Ainda falta auditoria externa de permissões por registro, arquivos, retenção, recuperação de conta, gestão de segredo, LGPD, testes de carga sustentada e backup off-site.
- Testar a configuração **real** do proxy HTTPS, domínio, cookies Secure, headers e redes autorizadas antes de colocar usuários reais.
- A alteração das regras de cargo exige uma revisão dos fluxos existentes de gerentes, inclusive nos testes em aparelhos físicos.

**Decisão:** versão **aprovada em homologação automatizada** e apta a seguir para revisão técnica/piloto controlado; **não aprovada para produção pública**.
