# NOVAGENTE Estética — Design System Global v1 (Etapa 26)

## Objetivo

Evitar que cada aba pareça um sistema diferente. A **Home pastel aprovada da Etapa 25** é a referência visual obrigatória para **todas as rotas, subabas, menus, pop-ups, cards, tabelas, campos e novos componentes**. A referência permanece sem fotografia no banner.

Não confundir o objetivo com “deixar tudo colorido”: a experiência deve exigir pouca leitura para localizar ações e dar maior clareza às pessoas que preferem interfaces visuais.

## Onde está no projeto

- **\`public/novagente-design-system.css\`** — camada final de tokens e regras globais; deve ser carregada **por último** no \`<head>\` (depois das folhas de tema, contraste, sidebar e módulos).
- **\`public/novagente-design-icons.js\`** — transforma os glifos decorativos dos atalhos antigos em SVGs padronizados, sem alterar os botões nem as ações.
- **\`public/novagente-approved-home.css\`** — referência imutável da Home aprovada, com o banner lilás e os cards pastel.
- **\`public/novagente-experience.js\`** — Home, atalhos, indicadores e navegabilidade.
- **\`public/novagente-theme.js\`**, **\`public/novagente-contrast-audit.css\`** — troca de tema e contraste global existente.

Todo novo módulo deve usar os **tokens** declarados em \`novagente-design-system.css\` em vez de inventar uma fonte, um card ou uma escala de espaçamento.

## Escala aprovada

| Elemento | Desktop | Mobile | Regra |
|---|---|---|---|
| Família de fonte | Inter → system-ui | Inter → system-ui | Igual à Home da Etapa 25; fallback local, sem dependência de rede |
| Título principal de módulo | 27–36 px (responsivo) | 25–27 px | Forte, claro, alto contraste |
| Título de seção | 21–27 px | ~20 px | Hierarquia inequívoca |
| Título de card de ação | ~17 px | ~15 px | Legível sem zoom |
| Texto corrido | 15 px | 15 px | Linguagem curta e direta |
| Subtexto/legenda | 12–13 px | 12–13 px | Apenas informações secundárias |
| Ícones dos cards | 48 px | 43 px | Forma circular com pictograma SVG |
| Inputs e escolhas | ao menos 44 px | ao menos 44 px | Clique/toque confortável |
| Contêineres | 19–23 px de raio | 16–18 px | Mesmo tratamento nas telas |
| Paleta clara | 8 tons pastel | os mesmos | Cor ajuda a localizar categorias, não é a única informação |
| Paleta escura | cartões escuros contrastantes, ícones coloridos | idem | Nunca texto pálido sobre superfície clara |

## Arquitetura visual

1. **Primeira impressão:** nome direto da aba, uma frase explicativa curta e, quando necessário, apenas uma ação primária.
2. **Acesso rápido:** cards clicáveis de tamanhos consistentes, com ícones circulares, título legível e subtítulo curto.
3. **Filtros:** botões/seletores claros, com estado ativo distinguível por forma, texto e contraste.
4. **Conteúdo de trabalho:** listas e indicadores simples; detalhes só ao clicar/expandir; formulários apenas quando a tarefa exige.
5. **Navegação:** sidebar escura e submenus com textos grandes, sem glifos enigmáticos.
6. **Todos os estados:** vazio, carregando, erro, confirmação, hover, foco e desabilitado.
7. **Acessibilidade:** contraste apropriado, teclados, alvos confortáveis, sem depender exclusivamente de cor ou do ícone.

### O que não fazer

- Editar um módulo isoladamente e deixar os outros com fontes/ícones de outro padrão.
- Usar CSS inline pontual para “consertar” apenas um screenshot.
- Criar uma nova família de fontes ou inventar uma paleta dentro de outra aba.
- Substituir o texto de botões por ícones sem rótulo.
- Esconder ações importantes ou adicionar dezenas de cards no painel inicial.
- Alterar comportamento, permissões, dados, mensagens reais ou regras de negócio por motivos visuais.

## Como pedir a alteração corretamente no futuro

> **Aplique o Design System Global do NOVAGENTE Estética (Etapa 26) como regra de todo o sistema.**
> Use a Home pastel aprovada como referência e preserve fonte, pesos, hierarquia, proporções, cards quase quadrados, ícones circulares SVG, cores e contraste. Inclua a aba, todas as subabas, formulários, modais, tabelas, filtros, dropdowns, estados vazios, sidebar, mobile, tema claro e escuro. Corrija na camada global/tokens e reaproveite componentes; não remende somente a tela que estou mostrando. Preserve todas as funcionalidades. Mostre screenshots de desktop e celular, teste navegação e contraste, rode os testes e publique apenas na demo isolada. Abra PR separada antes de mesclar na principal.

## Verificação inicial

- \`npm run check\` e \`npm test\` aprovados.
- Navegação real da demo pelo Chrome HTTPS com autenticação, percorrendo Agenda, Atendimento, Clientes, Financeiro, Estoque, Equipe, Serviços, Marketing, IA/Agentes, Administração, Relatórios e Olho do Dono em dois temas.
- Desktop (1440px), tablet (768px), celular (390px); comparação da fonte computada e procura de rolagem horizontal indevida.
- Conferir telas com listas vazias, campos, filtros, sidebar, modais e submenus, além das telas com dados populados.
- A demo permanece descartável e isolada, sem ativar envio de WhatsApp, cobrança ou IA real.
- **Pendente antes de produção:** auditoria manual detalhada de acessibilidade/contraste em todas as ramificações de todos os módulos, percursos longos de formulário e dispositivos reais (Android/iOS).

## Estratégia de implementação

A primeira aplicação é por **camada de tokens e seletores globais**, sem reescrever os 22 módulos nem alterar o backend. Módulos com layouts complexos podem precisar de ajustes específicos adicionais após a auditoria funcional, mas **não devem criar um design independente**. O padrão deve ser ampliado na mesma folha global e acompanhado por testes de regressão.