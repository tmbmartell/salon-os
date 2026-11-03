# NOVAGENTE Estética — Etapa 14: Homologação de operações simultâneas

**Data:** 27/10/2026. **Estado:** testes HTTP automatizados aprovados com banco de dados sintético. Não publicado em produção.  
**Pull request:** https://github.com/tmbmartell/salon-os/pull/14  
**GitHub Actions (42 testes, 0 falhas):** https://github.com/tmbmartell/salon-os/actions/runs/40473193113  
**Relatório sintético:** https://github.com/tmbmartell/salon-os/actions/runs/40473193113/artifacts/12719318235

## Ambiente exercitado

Duas instâncias **independentes** de `server.mjs` rodaram em processos Node.js separados, com portas HTTP distintas e **o mesmo SQLite temporário**, em modo WAL. Dois usuários de teste autenticados: proprietária e recepcionista. Clientes, números, serviços, agendas, produtos e valores gerados somente para QA. Banco descartado após o teste.

A simulação não usa WhatsApp, Pix bancário ou maquininha reais.

## Riscos e resultados verificados

| Operação simultânea | Resultado esperado e observado |
|---|---|
| 14 tentativas de cadastrar cliente com telefone idêntico | 1 criação; 13 recusas HTTP 409 |
| 16 tentativas de agendar mesmo profissional/horário | 1 reserva; 15 conflitos HTTP 409 |
| 14 checkouts concorrentes do mesmo atendimento | 1 checkout; 13 recusas HTTP 409; somente 1 lançamento financeiro, 1 comissão e 1 baixa de produto |
| 40 movimentos de estoque (+20 e −20) com duas instâncias | 40 movimentos contabilizados; sem perda de atualização ou diferença de saldo |
| Duas saídas simultâneas de 100 g com estoque de 140 g | 1 saída permitida; outra negada; saldo final 40 g, não negativo |
| Duas tentativas de abertura de caixa | 1 sessão aberta; outra recusada |
| Duas despesas simultâneas de R$ 80 com caixa de R$ 100 | 1 despesa lançada; outra recusada; saldo esperado do caixa R$ 20 |
| Duas tentativas de fechar o mesmo caixa | 1 fechamento; outra recusada; 1 sessão no histórico e diferença R$ 0 |
| Recepcionista tentando ver finanças, comissões ou Olho do Dono | Acesso HTTP 403, mesmo em segunda instância |

Todos os cenários foram executados sobre o servidor HTTP real, não apenas chamando funções isoladas.

## Correções feitas nesta etapa

### SQLite

`server.mjs` configura `PRAGMA busy_timeout=5000` em conjunto com WAL, permitindo aguardar brevemente o desbloqueio entre instâncias.

### CRM

Consulta da existência do telefone e inserção do cadastro agora ocorrem dentro de uma mesma transação `BEGIN IMMEDIATE`. Isso evita que dois atendentes registrem simultaneamente contatos idênticos por acessos diferentes.

### Agenda

O bloqueio de sobreposição já usava transação; teste comprovou o comportamento entre processos distintos. **Não foi necessário alterar a regra de agenda**.

### Checkout

Dentro da transação, o sistema passou a reler o status do atendimento, verificar se já há checkout e confirmar se ainda existe caixa aberto para pagamentos em espécie. Continua existindo também proteção de unicidade em `checkout_records.appointment_id`.

### Estoque

A consulta do saldo, validação de quantidade disponível, atualização do produto e registro do movimento foram unificados em uma transação. Leituras antigas não podem sobrescrever alterações feitas por outro terminal.

### Financeiro

Uma despesa paga em espécie agora verifica o caixa e a disponibilidade do numerário **dentro da mesma transação** que cria o lançamento, impedindo duas saídas concorrentes de excederem o saldo. A mesma regra evita lançamento ligado a um caixa que outra instância já fechou.

### Permissões

A recepção continua autorizada a cadastrar e agendar, mas sem permissão para consultar finanças, comissões ou indicadores gerenciais. Os bloqueios foram testados via API, não apenas por ocultação na interface.

## Arquivos

- `server.mjs`: tempo de espera de locks e transação no cadastro;
- `phase2.mjs`: revalidação atômica do checkout e proteção de despesas e estoque;
- `tests/concurrent-pilot.test.mjs`: simulação de múltiplos processos e usuários;
- `.github/workflows/security.yml`: geração de relatório sintético JSON e Markdown no GitHub Actions.

## Limitações — o que **não** foi comprovado

- Não equivale a teste de carga sustentada com centenas de usuários, rede lenta, quedas de energia ou falha durante transações longas.
- Não avalia a escalabilidade real de múltiplas máquinas, bancos distribuídos, replicação, múltiplas regiões ou múltiplos contêineres num armazenamento remoto. O SQLite compartilhado da homologação foi um **arquivo local de QA**.
- Nem todas as rotas do produto foram submetidas a corridas simultâneas (p.ex. compra/recebimento de lotes, pacotes, campanhas, ajustes de comissão e autenticação).
- Sem conexão WAHA/WhatsApp, Pix bancário, maquininha ou emissão fiscal.
- Requer revisão de segurança, LGPD, backup externo, restauração operacional, permissões por recurso, observabilidade e teste com usuários reais antes de liberar produção.

**Decisão:** a jornada testada suporta as concorrências sintéticas verificadas. **Não equivale a aprovação geral para produção pública.** A PR continua em rascunho, sem merge e sem deploy.
