# NOVAGENTE Estética — Etapa 8: Administração, Equipe e Configurações

**Estado:** implementação separada, aberta para revisão no GitHub. Nenhum merge/deploy na versão principal. Testes automáticos não equivalem a homologação funcional.

## Navegação progressiva

### Administração e Segurança

Quatro cards principais:
1. **Meu Salão** — nome do negócio, nome público, telefone, endereço e fuso horário.
2. **Usuários e Acessos** — perfis fixos (Proprietária, Gerência, Recepção e Profissional), permissões, ativação/desativação de contas, encerramento de sessões de funcionários e convites.
3. **Segurança** — reutiliza auditoria, backups, integridade e dispositivos conectados já existentes.
4. **RH Avançado** — **futuro módulo premium**, não implementado, não disponível para compra e não ativado.

### Equipe — RH básico incluído

O módulo de equipe foi reorganizado em cards:
- **Profissionais** — cadastros, especialidades, contatos e horários.
- **Desempenho** — metas, produção, comissões (somente gerência/proprietária).
- **Folgas e Escalas** — programação e ausências (gestão).
- **RH Avançado** — proposta futura, separada e sem cobrança.

Acessos de recepção/profissional só recebem perfil básico da equipe; **nenhuma meta financeira, comissão, justificativa de afastamento ou detalhe médico** é enviado pela rota de equipe para esses papéis.

## Configurações

`GET /api/admin/business-profile`: proprietária e gerência consultam.
`PUT /api/admin/business-profile`: **somente proprietária** altera nome, nome público, telefone, endereço e fuso.
Todos os dados são isolados pelo identificador do salão.
A mudança de fuso influencia relatórios que utilizam `tenants.timezone`; não é conversão automática de todos os horários existentes na agenda.

## Controle de acessos

- `GET /api/admin/role-matrix` permite visualizar **permissões fixas**; esta etapa não cria editor arbitrário de privilégios.
- `/api/admin/users/:id/role` e `/active` aproveitam a API anterior; a dona precisa confirmar mudanças.
- `POST /api/admin/users/:id/revoke-sessions`: proprietária encerra as sessões de funcionário do **mesmo salão**. Para encerrar a própria, usa **Meus dispositivos**.
- O backend preserva a conta da última proprietária ativa e bloqueia auto-desativação.
- O acesso é validado no servidor, nunca apenas pela interface.

## Convites seguros

- Proprietária cria um convite para Gerente, Recepção ou Profissional, com e-mail e nome.
- Token aleatório de 256 bits, armazenamento somente do hash, prazo de **48 horas** e **uso único**.
- Link com token no **fragmento da URL**; compartilhado manualmente por meio seguro, sem envio de e-mail automático.
- Convidado escolhe senha própria de 12–128 caracteres.
- O token não aparece nas consultas posteriores de convites.
- Não é possível convidar diretamente para papel de proprietária.
- Se a pessoa já possuir conta no salão, convite é recusado.
- Revogação antecipada de convite pendente, reenvio automático e autenticação multifator ainda não estão implementados.

## RH Premium — contrato futuro

A API `GET /api/admin/modules` declara explicitamente `premium_hr.available=false` e `active=false`.
Não há cobrança, ativação, documentação trabalhista ou folha de pagamento implementadas.
O conteúdo exibido é **prévia de produto**, sujeito a requisitos legais e operação futura.

## Testes e homologação

Executar:

```bash
npm run check
npm test
```

Testes automatizados verificam:
- configuração por salão e fuso válido;
- distinção entre leitura gerencial e edição da proprietária;
- impossibilidade de elevar convites diretamente a proprietária;
- convite de uso único, criação de senha e expiração;
- bloqueio de consultas e revogação de sessões de outra empresa;
- RH premium explicitamente indisponível.

Antes do merge/deploy:
1. Executar fluxo visual de proprietária → convite → aceite → login → nova sessão.
2. Validar bloqueio de gestores, recepção e profissionais nas rotas de administração.
3. Testar papel e ativação, mantendo ao menos uma proprietária ativa.
4. Conferir privacidade de comissões e afastamentos por usuário.
5. Verificar configurações, fusos e agenda em dispositivos reais.
6. Validar backups, restauração e trilha de auditoria.
7. Planejar autenticação multifator (MFA), revogação de convites e limitação antifraude adicional.
8. Homologar, no salão piloto, a jornada inteira de WhatsApp → CRM → Agenda → Ficha → Estoque → Caixa → Olho do Dono.

## Arquivos

- `tenant-admin.mjs` — dados do salão, matriz, convites, módulos e sessões.
- `auth.mjs` — aceitação de convite com senha.
- `phase9.mjs` — restrição de dados privados de pessoal.
- `server.mjs` — integração de rotas e instalação de tabela.
- `public/admin-stage8.js`, `public/index.html`, `public/app.js`, `public/beauty-ui.css` — cartões e interações.
- `tests/tenant-admin.test.mjs` — bateria de testes.

**Ainda não é uma versão de produção.**
