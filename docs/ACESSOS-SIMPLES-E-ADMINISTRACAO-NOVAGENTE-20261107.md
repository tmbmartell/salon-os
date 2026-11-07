# Etapa 1 — Acessos simples e separação técnica NOVAGENTE Estética

## Acesso mais fácil, sem precisar memorizar senha

- O proprietário do salão entra como `owner` com sua senha e, se já habilitado, segundo fator. Links de funcionário NÃO substituem autenticação da proprietária ou da gerência.
- Para convidar recepção ou profissional: Equipe → Acessos → Convidar pessoa. O destinatário recebe um link único de convite e pode aceitar **sem criar senha**.
- Para um funcionário já cadastrado: Equipe → Acessos → Link de acesso. Link válido por **15 minutos**, usado uma vez, anterior invalidado ao gerar novo. Compartilhamento **manual**, por canal seguro.
- Para redefinir senha: Equipe → Acessos → Redefinir senha. Link válido por **30 minutos**, usado uma vez; a redefinição encerra as sessões anteriores. O responsável NÃO lê ou escolhe a senha do funcionário.
- O login por senha existente continua funcionando. A sessão tem duração máxima de 7 dias, com bloqueio após 8 horas de inatividade. Para novos acessos, é necessário novo link ou login por senha, não havendo e-mail/SMS/WhatsApp automático nessa etapa.
- Gerência usa convite com senha própria; não pode entrar pelo link rápido, evitando contornar MFA ou permissões superiores.

## Administração NOVAGENTE versus cliente

- O proprietário do salão administra usuários, permissões, serviços, preços, produtos e dados empresariais; nunca recebe prompt interno, chave de API ou configuração do modelo.
- Apenas a conta da NOVAGENTE explicitamente designada em `NOVAGENTE_PLATFORM_ADMIN_USERS` tem acesso ao prompt e configuração técnica. Lista separada por vírgulas no formato `tenant_uuid:user_uuid`; sem essa variável **nenhum usuário tem o acesso técnico**, por segurança.
- Configurações técnicas são verificadas no servidor (`/api/agents/receptionist/explain`, GET/PUT/test da LLM, alterações de autonomia e prompt), não apenas na interface. O `GET /api/agents` retorna `config:null` para usuários não administradores da plataforma.
- Atribuir a credencial NOVAGENTE requer conta nominal e validação de MFA antes do uso operacional. Não colocar esse valor em código-fonte, CSS, HTML nem no navegador. O perfil `owner` de clientes não equivale a administrador da plataforma.

## Profissional e WhatsApp

- Cadastro de profissional ganhou campo WhatsApp; servidor aceita número com 10 a 15 dígitos. Este número é ocultado dos perfis sem permissão gerencial.
- **Envio dos avisos ao profissional ainda pendente de integração**, não ativar até homologar fila e confirmação de entrega; o planejador do PR #42 segue separado. Avisos planejados: agendamento, remarcação, cancelamento, antecedência de 24 h/2 h/30 min, tempo restante.

## Segurança e limitações

- Tokens possuem 256 bits de entropia e são gravados somente como hash; expiração e uso único são verificados em transação. Links usam fragmento (`#access=`, `#reset=`), removido da barra antes da requisição.
- A criação de link exige sessão de proprietária ativa e limita-se ao salão da sessão. Conta desativada, gerente e proprietária não podem receber link rápido.
- Ainda não há entrega automática por e-mail. Não prometer `Esqueci minha senha` autoatendido sem instalar e testar um provedor; admin reseta por link manual.
- Não instalar diretamente na VPS de produção sem homologação da PR e provisão da conta técnica NOVAGENTE.

## Critérios para liberação

1. Regressão `npm run check` e `npm test` aprovadas.
2. Navegador Chrome testa fluxo da proprietária e confirma que prompt não aparece.
3. Teste isolado gera convite sem senha, acessa com link uma vez, impede reuso, expiração, conta desativada e cruzamento de empresas.
4. Validar com usuários reais em ambiente de homologação antes de produzir, incluindo recuperação de senha de gerência e restauração de backup.
