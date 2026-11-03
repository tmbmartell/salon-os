# NOVAGENTE Estética — Etapa 27: Escala visual compacta global

**Solicitação:** diminuir a sensação de zoom em todo o sistema, incluindo a Home, as 22 áreas de trabalho, abas, subabas, menu lateral, caixas, cards, modais, formulários, tabelas e filtros.

## Como foi implementado

Em vez de `zoom: 0.9` ou `transform: scale(0.9)` no `body`, que podem quebrar layout, deslocar eventos de clique, aumentar faixas vazias ou prejudicar o celular, foi criada uma **camada final de densidade**.

- `public/novagente-density-compact.css`: carregada **depois** do Design System Global da Etapa 26.
- Token central `--ne-density: 0.90`: documenta a intenção visual de redução média de cerca de 10%, mas **não é uma operação aritmética automática**. As medidas são ajustes reais e individualizados por componente.
- Desktop: fonte-base 15→14px, títulos principais 36→31px, título da Home 43→37px, cards da Home 165→143px, cards de ações 153→132px, ícones 53→45px (Home) e 48→43px (módulos).
- Sidebar desktop: 216→198px e textos de navegação 13,5→12,5px; preserva submenus e estado ativo.
- Celular: redução mais leve, sem encolher áreas de toque abaixo do mínimo definido em 44px para os principais campos. Títulos dos módulos 25→23px.
- Formulários, diálogos, indicadores, tags, filtros, listas e componentes gerados depois do carregamento recebem o mesmo tratamento.
- As cores e as diferenças entre claro e escuro permanecem intactas.
- A execução é CSS-only: não modifica preços, horários, serviços, clientes, pagamentos, permissões nem lógica do backend.

## Como pedir alterações futuras

> Aplique a **densidade visual compacta global do NOVAGENTE Estética — Etapa 27**. Não faça CSS zoom no body nem corrija uma aba isolada. Ajuste os tokens e os componentes globais, preserve os temas, a escala mínima confortável no celular e a consistência entre todas as áreas. Valide largura de 1440px, 768px, 390px e 360px, nos dois temas, sem overflow horizontal, e rode os testes antes de publicar apenas na demo.

## QA e publicação

- `npm run check` e `npm test` precisam permanecer aprovados, incluindo `tests/density-global.test.mjs`.
- Conferir no navegador a proporção de Home, Agenda, Atendimento, Financeiro e Administração; inspecionar as outras áreas com os dois temas.
- Manter a demonstração com dados fictícios, na VPS e túnel HTTPS temporário; não ativar envios externos ou pagamentos.
- A PR é dependente da PR #30. Manter draft e não fazer merge sem a revisão visual do usuário.