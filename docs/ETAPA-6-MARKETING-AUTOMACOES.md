# NOVAGENTE Estética — Etapa 6: Campanhas, Biblioteca e Automações

**Estado:** implementação para revisão, não homologada em navegador e não publicada.

## Acesso progressivo

Marketing apresenta quatro cards, cada um abre os detalhes somente após o clique:

1. **Campanhas:** ofertas, promoções e portfólio em rascunho, prontas ou arquivadas.
2. **Biblioteca de mídias:** upload de JPG, PNG, WebP e GIF até 3 MB, protegido por autenticação.
3. **Pós-atendimento:** prazos e mensagens por serviço; gera tarefas internas.
4. **Comunicados:** horários, feriados, avisos e informações permanentes.

Todos os registros utilizam o mesmo identificador de empresa dos cadastros, agenda e CRM.

## Recursos desenvolvidos

- Tabelas `marketing_assets`, `marketing_campaigns` e `service_followup_rules`.
- Arquivos fora de `public/`, em pasta privada por salão sob diretório do banco, com nomes aleatórios, verificação de assinatura binária e controle de tamanho.
- Arquivos servidos somente por rota autenticada `GET /api/marketing/assets/:id/content`; não existe URL pública.
- Categorias de campanha: promoção, comunicado, horário, feriado, portfólio e outros.
- Status **pronta** quer dizer somente *disponível para uso manual*: não agenda nem envia campanhas.
- Regras por serviço definem prazo entre 1 hora e 90 dias e mensagem-modelo com `{nome}` e `{servico}`.
- Após concluir atendimento, a regra ativa gera tarefa interna, sem envio automático. Se não houver regra ativa, permanece a tarefa genérica preexistente de pós-atendimento.
- O sistema usa chaves de deduplicação por atendimento e regra para não gerar tarefas repetidas.
- Proprietária/gerência editam; recepção pode consultar; profissionais sem permissão de marketing por padrão.
- Registros de auditoria das alterações de campanhas, mídias e regras.

## Segurança e limites

- Aceita apenas **image/jpeg**, **image/png**, **image/webp** e **image/gif** conferidos por assinatura inicial.
- Limite de 3 MB por arquivo, acesso baseado em sessão e isolamento por salão.
- Não há conversão automática ou compressão de arquivos; WebP já pode ser enviado.
- GIF animado é aceito como arquivo; o envio via WAHA ainda precisará ser testado, e não é realizado nesta etapa.
- Não há disparos automáticos, nem envio em lote, nem programação de campanhas no WhatsApp. Rascunhos ficam privados.
- Consentimento, opt-out, revisão de conteúdo, regras do provedor de WhatsApp e horários permitidos serão parte da homologação antes de habilitar qualquer distribuição.
- Revisão de backups deve incluir a pasta de mídias, além do banco SQLite.

## Homologação necessária

1. Entrar com a proprietária e cadastrar um comunicado e uma campanha.
2. Fazer upload de imagens PNG, JPG, WebP e GIF e verificar prévia em desktop e celular.
3. Com conta de outro salão, tentar acessar a mesma imagem: deve retornar 404.
4. Com recepção, verificar acesso de leitura e bloqueio da edição.
5. Criar regra de pós-coloração de 48 horas; finalizar atendimento de teste e verificar uma única tarefa no relacionamento.
6. Repetir operação/reprocessamento e confirmar ausência de duplicatas.
7. Com a regra desativada, confirmar comportamento da tarefa genérica.
8. Verificar que **nenhuma mensagem foi enviada** ao WhatsApp e que não há disparos pendentes no WAHA.
9. Fazer backup e restauração conjunta do banco e dos arquivos privados.
10. Conferir logs, permissão dos diretórios, limite de armazenamento e processamento dos uploads.

### Arquivos principais

- `marketing.mjs` — banco, upload privado, campanhas e regras.
- `phase6.mjs` — integração pós-checkout com tarefas de relacionamento.
- `server.mjs` — instalação e rotas autenticadas.
- `auth.mjs` — permissões de marketing por perfil.
- `public/index.html`, `public/marketing-ui.js`, `public/beauty-ui.css` — interface por cards.
- `tests/marketing.test.mjs` — testes automatizados.

**Não realizar merge nem implantação sem homologação funcional e avaliação de segurança.**
