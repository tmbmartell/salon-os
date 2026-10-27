# NOVAGENTE Estética — Etapa 12: Preparação do salão piloto sem WhatsApp

**Data:** 27 de outubro de 2026  
**Status:** desenvolvimento com testes automatizados aprovados; **não é homologação comercial ou autorização de produção**.  
**GitHub:** https://github.com/tmbmartell/salon-os/pull/12

## Objetivo

Permitir que proprietária, gerência, recepção e profissionais validem a plataforma em ambiente segregado enquanto a conexão com WhatsApp real permanece para uma etapa posterior.

O sistema continua utilizável para cadastro e atendimento de clientes, agenda, catálogo, fichas técnicas, estoque, caixa, financeiro e Olho do Dono, desde que as operações sejam executadas manualmente. O WhatsApp fica marcado como **não conectado**, sem presumir envio ou recebimento real.

A rota pública `GET /api/health` retorna `mode:"offline_without_whatsapp"` quando WAHA não está conectado. A resposta separa banco de dados de serviços opcionais e deixa de tentar consultar um controlador externo quando sua URL não foi explicitamente configurada.

## Backup e restauração: o que foi implementado

Novo módulo `pilot-backup.mjs` com ferramenta `scripts/pilot-backup.mjs`.

- Captura SQLite de maneira consistente, usando **VACUUM INTO**, inclusive com WAL ativo.
- Inclui as imagens privadas da biblioteca de marketing em `marketing-assets/` da pasta do banco.
- Cria um arquivo `.nebak`, cifrado com **AES-256-GCM**, chave derivada por **scrypt** e autenticação contra adulteração.
- Exige frase secreta com **no mínimo 16 caracteres**, informada via variável de ambiente; ela não é incluída no arquivo nem no repositório.
- O arquivo é finalizado antes de aparecer com o nome `.nebak` e não substitui backups anteriores.
- Verifica integridade do SQLite, SHA-256 do banco e arquivos, bem como existência dos arquivos associados aos registros de mídia.
- A restauração **só pode criar uma pasta de destino nova**, nunca substitui o banco em uso. Ao terminar com sucesso, cria um comprovante local `restore-verify.json` junto ao backup.
- Limite desta implementação piloto: **256 MB de dados não comprimidos**. Excedendo esse tamanho, o backup é recusado. Para volumes maiores, é necessário projeto de cópia em streaming, armazenamento externo e orquestração robusta.
- O backup contém dados de **todas as empresas presentes naquela instância SQLite**. Nunca compartilhar esse arquivo com um salão isoladamente nem oferecer download na interface.

### Exemplo de uso local

Os comandos a seguir são para operadores autorizados na máquina de homologação. A localização do banco deve ser a da instalação de testes.

```bash
# A frase é digitada sem aparecer no terminal.
read -rsp 'Frase do backup: ' NOVAGENTE_BACKUP_PASSPHRASE
export NOVAGENTE_BACKUP_PASSPHRASE
echo

# Criar cópia cifrada.
node scripts/pilot-backup.mjs create \
  --db ./data/salon.sqlite \
  --archive ./data/backups/piloto-2026-10-27.nebak

# Conferir integridade e autenticação do backup.
node scripts/pilot-backup.mjs verify \
  --archive ./data/backups/piloto-2026-10-27.nebak

# Restaurar SOMENTE em pasta nova, sem substituir o banco original.
node scripts/pilot-backup.mjs restore \
  --archive ./data/backups/piloto-2026-10-27.nebak \
  --target-dir ./data/restauracao-teste-2026-10-27

# Ao terminar, retirar a senha do processo atual.
unset NOVAGENTE_BACKUP_PASSPHRASE
```

Se a senha estiver errada, o arquivo tiver sido alterado, faltar uma mídia ou a pasta de destino já existir, o teste é recusado.

A diretoria de backups do painel usa `NOVAGENTE_BACKUP_DIR`; quando ausente, usa a subpasta `backups` no mesmo diretório definido por `SALON_DB`. O painel **não** disponibiliza arquivos cifrados para download. Presença da cópia **não é prova de restauração bem-sucedida**.

## Central de Segurança

Novo botão recolhível **Diagnóstico do ambiente piloto (sem WhatsApp)**, em Administração → Segurança:

- Banco de dados: verifica `PRAGMA integrity_check`;
- Cópia cifrada: identifica `.nebak` no diretório configurado;
- Restauração: somente aparece como verificada quando há comprovante válido gerado após restauração em pasta nova;
- WhatsApp: *adiado*, não bloqueia o piloto manual;
- Revisão de segurança e LGPD: *pendente*, antes da produção.

A API de diagnóstico é `GET /api/admin/pilot-checks`, restrita a proprietária e gerência. O campo `production_ready` é **sempre `false` nesta versão**.

## Testes realizados

- SQLite criado com WAL ativo, clientes de teste e imagem privada;
- Backup cifrado não contém texto claro com nome do cliente;
- Senha incorreta ou arquivo alterado não permite leitura;
- Verificação detecta arquivos de mídia referenciados pelo banco, mas ausentes na cópia;
- Restauração recupera SQLite e mídia em nova pasta;
- Restauração não sobrescreve pasta de destino existente;
- Administração não reporta backups de caminho fixo legado;
- Diagnóstico sem WhatsApp informa a ausência de restauração e acesso restrito;
- Teste integrado HTTP confirma que banco, login e demais módulos continuam operando sem WAHA;
- Smoke Chrome abre o diagnóstico da Administração e registra captura de tela.

**37 testes anteriores + 3 testes de backup = 40 testes aprovados**.

GitHub Actions:
- Testes e sintaxe: https://github.com/tmbmartell/salon-os/actions/runs/40463238104
- Navegador: https://github.com/tmbmartell/salon-os/actions/runs/40463238121

## Limites antes de um salão piloto real

1. Exigir conta e ambiente de **homologação separados** de qualquer instalação real.
2. Salvar cópia externa cifrada com controle de acesso, política de retenção e rotação, **não apenas no mesmo disco do SQLite**.
3. Repetir o teste de restauração com o volume real da instalação e realizar simulação de desastre.
4. Confirmar localização segura da frase secreta: sem registro em `.env` com permissões públicas, README, GitHub ou conversas.
5. Homologar funções de recepção, profissional e proprietária em aparelhos reais.
6. Revisar antes de produção: proteção CSRF por token, MFA, autorização por registro, gestão de segredos, retenção, LGPD, monitoramento e procedimentos de recuperação.
7. Quando autorizado, conectar WhatsApp de **homologação** e repetir os testes externos específicos. Esta etapa não faz essa conexão.
8. Conferir a atualização do backfill e de qualquer outro dado privado na política de retenção e backup.

**Este documento não afirma que houve deploy, backup do servidor real ou restauração de dados de clientes.** A verificação realizada foi reproduzível no GitHub Actions, com base temporária de testes.
