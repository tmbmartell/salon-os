# Etapa 21 — Entrega técnica do pacote gratuito e bloqueios externos

**NOVAGENTE Estética — 27/10/2026**  
**Escopo:** demonstração gratuita com dados 100% fictícios, sem WhatsApp conectado e sem pagamentos reais.  
**Não é aceite de produção.** O código permanece em branches de revisão; não houve deploy nem merge.

## Pacote técnico preparado

- **PR #18 — candidata consolidada**: https://github.com/tmbmartell/salon-os/pull/18
- **PR #19 — demonstração Render Free descartável**: https://github.com/tmbmartell/salon-os/pull/19
- **PR #20 — QA móvel e roteiro humano**: https://github.com/tmbmartell/salon-os/pull/20
- **Etapa 21 — preflight da futura URL real**: `scripts/verify-free-preview-url.mjs`

A ferramenta nova verifica, **sem alterar dados**, uma URL pública do Render depois da ativação manual:
1. Aceita somente `https://*.onrender.com`, sem porta arbitrária, parâmetros ou credenciais no link.
2. Confere `GET /api/health`: NOVAGENTE, modo **free_preview_disposable**, banco funcional e WhatsApp não conectado.
3. Confere que o primeiro proprietário da demonstração já foi provisionado.
4. Confere se o HTML mostra o aviso de dados fictícios.
5. Só depois disso, e **somente quando credenciais foram fornecidas em variáveis de ambiente**, tenta login e leitura autorizada dos módulos.
6. Não imprime tokens, cookies, senhas, telefone ou a lista de clientes. **Não escreve no banco.**

### Execução, quando houver URL Render verdadeira

Em um terminal confiável, após conferir que a conta e a URL são realmente suas, configurar localmente:
- `NOVAGENTE_PREVIEW_URL`: endereço HTTPS fornecido pelo Render, sem caminho;
- `NOVAGENTE_DEMO_OWNER_EMAIL`: e-mail fictício configurado no Render;
- `NOVAGENTE_DEMO_OWNER_PASSWORD`: senha da conta fictícia configurada no Render.

Executar:

```bash
npm run release:smoke-preview
```

O script falha quando a página não corresponde à demonstração descartável, não há login ou qualquer checagem obrigatória não passou.

**Não copiar as variáveis secretas para arquivos versionados e nunca publicar saídas contendo credenciais.**

## Quatro frentes externas registradas no GitHub

| Frente | Issue | Condição |
|---|---|---|
| Render gratuito e URL publicada | [#21](https://github.com/tmbmartell/salon-os/issues/21) | Depende da conexão/ativação do serviço e da senha privada |
| Aceite em celulares físicos e por funcionários | [#22](https://github.com/tmbmartell/salon-os/issues/22) | Depende de pessoas e dispositivos reais |
| LGPD, fichas e permissões profissionais | [#23](https://github.com/tmbmartell/salon-os/issues/23) | Bloqueia dados de clientes reais |
| Revisão final, merge e recuperação persistente | [#24](https://github.com/tmbmartell/salon-os/issues/24) | Depende de aprovação técnica, backup e banco durável |

### O que está ADIADO e não bloqueia a demo fictícia

- WhatsApp/WAHA, QR Code, importação real e disparos automáticos;
- integração real de Pix, maquininha, emissão fiscal e cobranças;
- domínio próprio, ambiente de produção pago e backup externo para a **demo descartável**;
- obrigatoriedade de MFA em todos os papéis;
- importação de base de clientes de terceiros.

Esses itens **não devem ser esquecidos para a futura operação comercial**, mas não são pré-requisitos para mostrar a interface em modo descartável.

## Critérios de segurança e status da entrega

| Dimensão | Estado |
|---|---|
| Código integrado acumulado | **Preparado em PRs para revisão**, não mesclado a `main` |
| Testes API e Chromium | Reproduzíveis em CI, sem usar dados reais |
| Configuração Render Free | Arquivos prontos, **serviço ainda não ativado** |
| Operação com clientes reais | **Não autorizada** |
| Restauração/backup durável | **Pendente** (Render Free não preserva SQLite) |
| Privacidade de dados e LGPD | **Pendente** para produção |
| Aceite humano | **Pendente** |
| WhatsApp | **Adiado** |

## Evolução estimada do projeto

Percentuais são gerenciais e aproximados, **não um cálculo automático do GitHub**:

- Etapa 18: 83% concluído / 17% restante.
- Etapa 19: 85% concluído / 15% restante.
- Etapa 20: 87% concluído / 13% restante.
- **Etapa 21: 89% concluído / 11% restante** para a primeira entrega planejada sem WhatsApp.

Os **11% restantes** correspondem aproximadamente a:
- 3 pontos: ativação e verificação real da demonstração no Render;
- 4 pontos: aceite humano e correções encontradas com aparelhos reais;
- 2 pontos: revisão de dados sensíveis, fichas e LGPD;
- 2 pontos: revisão, aprovação de merge e política de recuperação durável antes de usar dados reais.

**Não atingir 100% artificialmente.** Os quatro critérios externos não podem ser comprovados pelo código, CI ou por uma simulação. A entrega comercial só será encerrada depois de cumprir os critérios aplicáveis e registrar aceite real.

## Decisão de próxima ação

A próxima ação prática exige a conexão/ativação da conta Render. Com a URL confirmada, executar o script seguro de verificação; depois organizar o piloto supervisionado com a equipe, sempre usando dados fictícios até a revisão de segurança.
