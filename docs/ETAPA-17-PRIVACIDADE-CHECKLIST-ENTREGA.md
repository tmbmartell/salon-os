# NOVAGENTE Estética — Etapa 17: Privacidade e checklist de entrega

**Registro:** 27 de outubro de 2026  
**PR de revisão:** https://github.com/tmbmartell/salon-os/pull/17  
**Status:** implementada para homologação automática; **sem merge, domínio, hospedagem ou deploy de produção**.

## 1. Alcance da etapa

O objetivo desta etapa é reduzir riscos de exposição de dados pessoais antes do primeiro salão piloto, concentrando-se no acesso à base completa do CRM e no isolamento de informações por empresa. **Não foi acrescentado um novo módulo comercial.**

### O que mudou

- A exportação de clientes **não** compartilha a permissão genérica `clients.read`.
- Foi criada a permissão independente `clients.export`, concedida a **proprietária e gerência**.
- Recepção e profissionais continuam com a leitura de CRM conforme suas funções operacionais, porém o servidor devolve HTTP **403** para tentativa de baixar todos os registros.
- O botão *Baixar planilha* fica oculto nos perfis operacionais. Isso é só conveniência da interface; a proteção verdadeira está na API.
- Cada exportação autorizada registra `clients.export` na auditoria, com usuário, empresa e quantidade de linhas; não copia informações pessoais para os metadados da auditoria.
- A resposta CSV acrescenta `Cache-Control: no-store` e `X-Content-Type-Options: nosniff`, evitando cache intermediário acidental.
- Textos de nome, notas e outras células que começam com `=`, `+`, `-` ou `@` são tratados como texto em CSV, mitigando execução de fórmulas ao abrir em editores de planilhas.
- Teste HTTP injeta uma segunda empresa fictícia, com cliente e ficha técnica, para garantir que o proprietário de outro salão não leia a ficha ou exporte os registros da empresa vizinha.

**Limite relevante:** proteção contra CSV formula injection é uma mitigação de compatibilidade; planilhas de diferentes fabricantes podem interpretar caracteres de maneiras variadas. Revisão de segurança é necessária antes de exportação em escala.

## 2. Verificações de segurança realizadas

1. Proprietária: leitura e download do CSV no salão autenticado.
2. Recepção: pode operar CRM, mas **não** fazer download em massa.
3. Perfil profissional: tem leitura operacional, mas **não** exportação em massa (teste de permissão).
4. Duas empresas em SQLite: dados da empresa B não aparecem no arquivo CSV da empresa A.
5. Ficha técnica de cliente da empresa B: HTTP **404** mesmo usando uma sessão válida da empresa A.
6. Injeção de texto de fórmula em nome e observações: dados são neutralizados no CSV.
7. A exportação é registrada na trilha de auditoria sem conteúdo integral das clientes.
8. O fluxo habitual de login, agenda, estoque, marketing e Administração segue coberto pelo teste com Chrome.

## 3. O que AINDA bloqueia a entrega comercial

Os PRs **#1–#17** formam uma cadeia de alterações em rascunho, ainda **não incorporadas à versão principal**. Para entregar o piloto sem WhatsApp é necessário:

| Frente | Critério de aprovação | Situação |
|---|---|---|
| Integração de versões | Revisar e integrar a cadeia de PRs na branch de entrega, com testes após cada integração e rollback | **Pendente** |
| Privacidade completa | Vincular profissional à conta e limitar fichas e listagens de clientes aos dados necessários; validar LGPD, perfis e retenção | **Pendente** |
| Publicação segregada | Servidor/ambiente QA, domínio HTTPS, variáveis secretas e configuração correta do proxy/cookies | **Pendente** |
| Recuperação | Política de backup cifrado externo, retenção, monitoramento e restauração comprovada com volume piloto | **Pendente** |
| Operação em salão | Rodada supervisionada com proprietária, recepção e profissional, em desktop e celulares físicos | **Pendente** |
| Teste de saída | Regressão completa e aprovação de critérios de segurança/funcionamento | **Pendente** |
| WhatsApp real | Conexão WAHA, QR Code, mensagens, anexos e sincronização em instância autorizada | **Adiada por decisão da usuária** |

**Sem esses itens, não considerar pronta para produção pública.**

## 4. Estimativa de projeto — escopo sem WhatsApp

Percentual de planejamento **aproximado, não medido automaticamente por horas ou story points**.

- **Projeto estimado em aproximadamente 78% concluído** para uma primeira entrega de piloto sem WhatsApp.
- **Restante estimado: 22%.**

Distribuição indicativa dos 22 pontos percentuais restantes:

| Trabalho pendente | Pontos percentuais estimados |
|---|---:|
| Revisão e consolidação dos PRs #1–#17 | 7 |
| Hospedagem segura, domínio/HTTPS, segredos, backups externos e restauração real | 6 |
| Piloto com pessoas e dispositivos físicos e correções de usabilidade | 5 |
| Revisão formal de segurança, permissões sensíveis e requisitos LGPD para o piloto | 4 |
| **Total restante** | **22** |

O percentual não significa que o sistema já está publicado: a maior parte do trabalho residual é justamente converter um conjunto de funcionalidades testadas em uma versão integrável, operável e recuperável.

**WhatsApp real não faz parte desta previsão de primeira entrega**, pois foi adiado.

## 5. Próxima ação recomendada

**Etapa 18: Consolidação da versão candidata à entrega**, criando uma branch única de release e uma sequência verificável de integração das PRs, testando de novo após a consolidação. Somente depois proceder à configuração do servidor de homologação e ao piloto assistido.

Nenhum dado real foi utilizado na Etapa 17. Não houve mesclagem de branch nem operação em produção.
