# NOVAGENTE Estética — Etapa 16: autenticação em duas etapas

**Data:** 27/10/2026  
**Pull request:** https://github.com/tmbmartell/salon-os/pull/16  
**Estado:** implementação em branch de revisão; **nenhum merge ou deploy em produção**; WhatsApp não conectado.

## Objetivo

Disponibilizar proteção adicional no login da proprietária e gerência, mantendo uma experiência simples: configurar o aplicativo autenticador uma vez e, nos próximos acessos, usar senha mais um código de seis dígitos.

**MFA é opcional nesta etapa.** Nunca considerar segurança de produção aprovada só porque a opção existe. Antes de tornar a proteção obrigatória, estabelecer procedimentos de recuperação de conta, proteção do segredo do servidor, backups e suporte.

## Como a gestora ativa

1. Entrar normalmente com e-mail e senha.
2. Abrir **Administração → Segurança → Verificação em duas etapas (MFA)**.
3. Confirmar a senha da conta para iniciar o cadastro.
4. Registrar a chave no aplicativo autenticador compatível com TOTP (30 segundos, seis dígitos).
5. Informar o código atual para confirmar a ativação.
6. **Guardar os oito códigos de recuperação** em local pessoal seguro. Eles aparecem uma única vez e cada um funciona uma só vez.
7. No próximo login, depois da senha, confirmar com o aplicativo ou com um código de recuperação.

As contas de recepção e profissionais **não têm a interface de configuração MFA** nesta etapa. A gerência só configura o próprio MFA, não a conta de outras pessoas.

## Como funciona no backend

- `mfa.mjs`: TOTP compatível com RFC 6238, HMAC-SHA1, base32, código de 6 dígitos e janela de 30 segundos. Considera desvio de relógio de ±30 segundos e rejeita reutilização de contador já consumido.
- A chave do autenticador é cifrada em repouso com **AES-256-GCM** usando `NOVAGENTE_MFA_KEY`, fornecida pelo operador em variável secreta do servidor.
- O banco guarda registros `user_mfa`, `mfa_recovery_codes` e `mfa_login_challenges`, sempre identificados por `tenant_id` e usuário.
- Códigos de recuperação são gerados aleatoriamente (128 bits cada) e guardados somente como SHA-256, não em texto puro.
- Ao ativar a proteção, são revogadas as demais sessões existentes da conta; a sessão que ativou permanece válida.
- Senha correta para uma conta com MFA ativo retorna HTTP **202** com desafio temporário de cinco minutos, **sem criar cookie de login**.
- O endpoint público `POST /api/auth/mfa/verify` valida o desafio e o código e **só então** cria a sessão.
- O desafio admite até cinco tentativas. Erros do segundo fator também contam para o bloqueio persistente de login **por conta**, impedindo tentativas ilimitadas por novos desafios.
- Códigos de recuperação e TOTP são consumidos dentro de transações SQLite para evitar reuso entre instâncias.
- Desativar MFA exige **senha atual e um segundo código válido** e revoga outras sessões; não pode ocorrer com senha isolada.
- As rotas de mudança de privilégio e proteção do login da Etapa 15 continuam funcionando.

## Configuração na hospedagem

Gerar uma chave aleatória de 32 bytes **fora do GitHub**, por exemplo, numa máquina confiável:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Configurar o resultado, apenas no gerenciador de segredos da hospedagem, em:

```text
NOVAGENTE_MFA_KEY=<32 bytes aleatórios codificados em base64>
```

**Crítico:**
- Não colocar a chave em commit, issue, chat, print ou log.
- Manter a mesma chave entre reinicializações e instâncias do aplicativo.
- Guardar backup seguro da chave **separadamente** do backup cifrado do banco, com controle rigoroso de acesso.
- Se a chave for perdida, o servidor não poderá decifrar os segredos TOTP existentes e as contas com MFA ficarão impossibilitadas de validar o segundo fator. Definir procedimento supervisionado de recuperação antes de produção.
- Em modo não configurado, a interface informa a ausência da chave e **não permite ativação**. A API não cria uma chave padrão insegura.
- Verificar HTTPS, cookies Secure e reverse proxy antes da publicação. Os testes usaram dados sintéticos e conexão local.

## Endpoints e interfaces

- `GET /api/auth/mfa/status`: configuração e quantidade de códigos disponíveis (sem revelar segredos).
- `POST /api/auth/mfa/enroll`: confirma senha, emite segredo temporário e URI compatível com aplicativos autenticadores.
- `POST /api/auth/mfa/confirm`: valida primeiro código e ativa MFA; devolve oito códigos uma única vez.
- `POST /api/auth/mfa/verify`: valida desafio de segundo fator após senha.
- `POST /api/auth/mfa/disable`: exige senha e TOTP ou recuperação.
- `public/mfa-security-ui.js`: gerenciamento no card de Segurança.
- `public/app.js`: painel de segundo fator no login; nenhum cookie emitido antes de validar.
- `public/index.html`: painel de login em duas etapas.

## Testes automatizados

A bateria `tests/mfa.test.mjs` cobre:
- formato de código e rejeição de contador TOTP já usado;
- ativação com senha, chave cifrada no SQLite e confirmação;
- etapa de senha retornando desafio sem cookie;
- login com código de recuperação e sessão válida;
- tentativa de reutilização de desafio e de código de recuperação;
- bloqueio por tentativas incorretas acumuladas mesmo em vários desafios;
- desativação mediante senha e segundo fator;
- testes reais no Chrome desde a ativação até novo login com código de recuperação.

**Limites e pendências:** autenticação opcional (não mandatória), ausência de passkeys/WebAuthn e procedimento operacional supervisionado para perda do autenticador e dos códigos de recuperação. Revisão de LGPD, MFA forçado em produção, notificações de login, retenção de dados e pentest ainda são necessárias. Não foram usados números reais ou integrados serviços de mensageria.
