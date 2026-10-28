# NOVAGENTE Estética — Etapa 28 · Pareamento WhatsApp via WAHA

## Entrega

- Sessão WAHA exclusiva `novagente-estetica-pilot` no servidor WAHA existente, sem alterar sessões de outros projetos.
- Runtime persistente separado de todas as demos descartáveis em `/srv/margot/novagente-estetica-whatsapp-pilot` com SQLite próprio e serviço systemd.
- Conta administrativa ainda depende de configuração inicial segura e autenticação. **Nunca publicar QR sem login nem expor API key.**
- Interface em Atendimento → Conexão WhatsApp mostra status, prepara sessão, busca QR protegido, atualiza QR a cada 16 segundos e verifica status periodicamente. Interrompe quando conectado.
- Sessões só podem ser preparadas e QR mostrado por owner/manager.
- IA, respostas automáticas e campanhas externas seguem desligadas. Webhooks assinados com HMAC SHA-512; cada sessão mapeada a tenant.
- API de status **não revela configuração bruta do WAHA** (evita exibir chave HMAC em JSON).
- Instância de teste com novos clientes não recebe sementes fictícias: `NOVAGENTE_EMPTY_INITIAL_TENANT=true` cria só a empresa e a administradora não reivindicada.

## Segurança

- Configuração em `.env.runtime` fora do Git, modo 0600, proprietária do serviço sentinelx.
- Serviço não publica a porta no IP público; somente 127.0.0.1, HTTPS passa pelo Cloudflare Tunnel.
- Proteção de origem via `NOVAGENTE_PUBLIC_ORIGIN`, confiança no proxy apenas a partir do túnel da VPS.
- Código QR é privado e temporário, sem cache. Não compartilhar em páginas públicas ou logs.
- O túnel rápido `trycloudflare.com` pode mudar após restart e requer atualizar `WAHA_WEBHOOK_URL` e `NOVAGENTE_PUBLIC_ORIGIN`.
- Antes de usar com clientes reais, preferir um hostname estável e revisar políticas de privacidade, consentimento, retenção e backup.
- A conta real do WhatsApp ainda precisa ser vinculada pelo próprio usuário no celular: WhatsApp → Dispositivos conectados → Conectar dispositivo.
- Não habilitar IA ou disparos em massa sem validação do fluxo e autorização por empresa.

## Checklist de validação

- [ ] Setup inicial autenticado da conta proprietária
- [ ] Login HTTPS e status `MISSING` antes do preparo
- [ ] `POST /api/whatsapp/session/prepare` -> `SCAN_QR_CODE`
- [ ] `GET /api/whatsapp/session/qr` -> `image/png` com autenticação, `401` anonimamente
- [ ] QR muda conforme expiração, nunca fica publicamente cacheado
- [ ] Após scan `GET /api/whatsapp/status` -> `WORKING`
- [ ] Webhook HMAC com assinatura inválida -> `401`
- [ ] Envio de mensagem de teste feito manualmente pela equipe, sem IA
- [ ] Recarregar/reiniciar app e validar persistência
- [ ] Testar desconexão e reconexão controladas, sem afetar outras sessões

**Observação:** a criação do runtime e o healthcheck podem estar concluídos antes dos testes de QR; não declarar conectado ou QR validado sem resultado de ambas as rotas autenticadas.