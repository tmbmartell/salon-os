# NOVAGENTE Estética — versão em desenvolvimento

Plataforma de gestão integrada para salões e negócios de estética, criada pela **NOVAGENTE**.

**Situação:** implementação progressiva sobre a base do Salon OS. Alterações em uma branch de revisão; não está homologada nem publicada em produção.

## Componentes existentes aproveitados do Salon OS

- Clientes, CRM, histórico e WhatsApp via WAHA;
- Agenda, serviços, fichas técnicas e recursos de trabalho;
- Equipe, escalas, metas e comissões;
- Caixa, financeiro, estoque, compras e fornecedores;
- Pacotes, revenda, fidelização e relatórios;
- PWA e estrutura inicial de agentes de IA.

> Existir código para um recurso não é garantia de integração real, disponibilidade de WhatsApp ou homologação de segurança.

## Etapa atual: identidade, interface e fundação de segurança

- Identidade **NOVAGENTE Estética** no título, login, menu e PWA;
- Logotipo NOVAGENTE otimizado e incorporado em `public/novagente-logo.svg`;
- Menu agrupado, painéis recolhíveis e triagem visual de conversas;
- Central de Segurança em cards dentro de Administração;
- Acesso pessoal **Meus dispositivos** para visualizar e revogar sessões;
- Sessões com expiração por inatividade de oito horas, além do vencimento absoluto;
- Vínculo conferido entre usuário e empresa durante autenticação;
- Operações HTTP com origem cruzada bloqueadas quando o navegador fornece evidência de origem;
- Sessões WAHA sem compartilhamento implícito entre empresas; falta configurar sessões específicas para novas empresas;
- Testes automatizados em `tests/` e validação no GitHub Actions.

## Rodar localmente

Node.js 22 ou superior:

```bash
npm run check
npm test
npm start
```

O aplicativo usa SQLite (`node:sqlite`). Para integrar WhatsApp é necessário configurar WAHA e suas credenciais no ambiente de execução.

## Antes de usar com clientes reais

- Validar toda a navegação e atendimento com WhatsApp conectado;
- Configurar sessão WhatsApp individual por empresa e testar isolamentos;
- Adicionar MFA, proteção anti-CSRF por token e políticas mais completas de sessão;
- Revisar permissões de dados sensíveis e autorização por registro;
- Homologar backups cifrados e **testar restauração**;
- Revisar LGPD, retenção, consentimentos, incidentes e segurança de arquivos;
- Realizar testes de ponta a ponta e revisão de segurança;
- Somente depois disso considerar deploy ou merge na branch principal.

## Arquitetura de referência

- `server.mjs`: servidor, API e headers;
- `auth.mjs`: autenticação, sessões, autorização e auditoria;
- `whatsapp.mjs`: mensageria e isolamento de sessões WAHA;
- `public/beauty-ui.js` e `public/beauty-ui.css`: camada visual progressiva da NOVAGENTE Estética (nomes de arquivos legados);
- `public/security-center.js`: Central de Segurança e gerenciamento de dispositivos;
- `public/novagente-logo.svg`: logo oficial otimizada;
- `phase*.mjs`: funcionalidades herdadas;
- `tests/`: testes automatizados.

A construção continuará por entregas: **WhatsApp+CRM → Agenda+Serviços → Estoque+Equipe → Caixa+Financeiro → Marketing+Automações → Relatórios → IA/RH premium**.
