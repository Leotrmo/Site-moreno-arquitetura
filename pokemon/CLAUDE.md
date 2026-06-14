# CLAUDE.md — /pokemon

Página de **análise da coleção de Pokémon GO** (decidir o que investir / manter /
transferir). É um app estático, vanilla JS, sem framework e sem bundler, servido
pelo GitHub Pages e instalável como PWA.

Este arquivo registra as decisões de arquitetura e as **armadilhas que quebram o
app**. Leia antes de mexer aqui.

---

## ⚠️ REGRA DE OURO: bumpar o cache do Service Worker

**Toda vez que você mudar qualquer asset estático (`app.js`, `sizes.js`,
`index.html`, qualquer `lib/**/*.js`, `manifest.json` ou ícones), você DEVE
incrementar a versão do cache em `sw.js`:**

```js
const CACHE = 'pokemon-leo-v17';   // → v18, v19, ...
```

Por quê: o `sw.js` é **cache-first** para esses arquivos (só `index.html`,
`colecao.json` e `data/**` são network-first). Sem bump, usuários que já abriram
a página continuam rodando o **JS antigo em cache** junto com o `index.html`
novo. Esse mismatch já quebrou o botão de direção da ordenação uma vez
(HTML novo com o botão, `app.js` velho sem o handler → clique não fazia nada).

Checklist ao terminar uma mudança de front-end:
1. Mudou algum asset cache-first? → bump `CACHE` em `sw.js`.
2. Adicionou/removeu/renomeou um arquivo servido? → atualize também a lista
   `ASSETS` em `sw.js` (senão o novo arquivo não é pré-cacheado / offline quebra).
3. O bump força reinstalar o SW (`install` recacheia tudo, `activate` limpa o
   cache antigo) e a página recarrega sozinha via `controllerchange`.

Não há CI que cobre isso — é responsabilidade de quem edita.

---

## Arquitetura

- **Sem dependências, sem build para rodar.** `package.json` é `private` e só tem
  scripts. Não adicione libs npm para o runtime do app. Mantenha vanilla JS.
- **Padrão de módulo dual (browser + Node).** Todo arquivo em `lib/` usa o mesmo
  factory para funcionar nos dois ambientes:

  ```js
  (function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node (testes)
    else Object.assign(root, api);            // browser: vira global
    // alguns expõem como namespace: root.PokePvp = api;
  })(typeof globalThis !== 'undefined' ? globalThis : this, function () { ... });
  ```

  **Preserve esse padrão.** No browser não há `require`/`import`; os módulos se
  enxergam por globais (`PokeMatch`, `PokePvp`, `PokePve`, e o `Object.assign` no
  global de `refdata`/`analysis`/`render`/`sort`). Nos testes, é `require(...)`.
  Quebrar um dos dois lados quebra ou a página ou os testes.

- **Ordem dos `<script>` em `index.html` importa.** Carregue dependências antes
  de quem as usa:

  ```
  sizes.js → lib/refdata.js → lib/meta/match.js → lib/meta/pvp.js →
  lib/meta/pve.js → lib/analysis.js → lib/render.js → lib/sort.js → app.js
  ```

  `app.js` lê `SORT_OPTIONS` (de `sort.js`) já na inicialização do `state`; se a
  ordem mudar, dá `ReferenceError` e a página inteira morre.

---

## Mapa dos arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Markup + todo o CSS inline. Hero (filtros INVESTIR/MANTER/TRANSFERIR), chips, toolbar (busca/ordenação/direção), lista. |
| `app.js` | Orquestração: carrega dados, monta estado, liga eventos, filtra/ordena/renderiza. Único arquivo que toca o DOM "vivo". |
| `lib/analysis.js` | Enriquece a coleção e decide o **veredito** (INVESTIR/MANTER/TRANSFERIR) + ações. Coração da lógica. |
| `lib/render.js` | Gera HTML dos cards (`cardHtml`) e do detalhe/comparador (`detailHtml`). |
| `lib/sort.js` | `SORT_OPTIONS`, `getSorter(key, reversed)`, ranqueamento competitivo. |
| `lib/refdata.js` | Constantes de referência (lendários, regionais, trade-evo). |
| `lib/meta/{match,pvp,pve}.js` | Camada de meta competitivo (casa espécie, calcula PvP/PvE). |
| `sizes.js` | Tamanho (XS/XL/XXS/XXL) por altura. |
| `sw.js` | Service worker / PWA. Ver regra de ouro acima. |
| `data/*.json` | Datasets de meta **gerados** (ver Build). Não editar à mão. |
| `colecao.json` | Export da coleção do usuário. Network-first; pode ser substituído. |
| `build/` | Script Node que baixa/transforma/valida os `data/*.json`. |
| `fixtures/` | Amostras mínimas das fontes externas para os testes do build. |
| `test/` | Testes com `node:test`. |

---

## Testes

- Rode **sempre** antes de commitar, a partir de `pokemon/`:

  ```bash
  npm test          # = node --test  (roda test/*.test.js)
  ```

- São ~237 testes, todos verdes. Não commite com teste vermelho.
- Os testes importam os módulos de `lib/` via `require` — por isso o padrão de
  módulo dual é obrigatório.
- Mudou regra de veredito, ordenação ou render? **Atualize/adicione testes**
  (`verdict.test.js`, `sort.test.js`, `render.test.js`, etc.).

---

## Convenções de lógica (não quebrar sem querer)

- **Veredito é conservador por design.** Qualquer sinal de valor protege o
  Pokémon de cair em TRANSFERIR (shiny, lucky, shadow, lendário, costume, hundo,
  ≥96%, XXS/XXL, XS/XL comfort, 2º carregado, trade-evo, regional, espécie meta).
  Só duplicata genuinamente pior (IV < 80%) vai pra TRANSFERIR. Não afrouxe esses
  limiares sem atualizar `verdict.test.js` e o design em
  `docs/superpowers/specs/2026-06-05-revisao-analise-transferir-design.md`.
- **Ordenação:** o critério vem do `<select>` (`SORT_OPTIONS`); o botão `↓/↑`
  só inverte o **critério principal** (`getSorter(key, reversed)`), mantendo o
  desempate por nome em A-Z. "Recomendado" invertido = TRANSFERIR no topo.
- **Render:** sempre passe strings de dados por `esc()` (anti-XSS) ao montar
  HTML. O card expande no toque via handler de `#list` casando `data-id`
  (string) com `mon.id` (string) — mantenha os dois como string.

---

## Build dos dados de meta (ocasional, requer rede)

`data/*.json` (species, moves, pvp_ranks, pve_ranks, cpm, meta) são **gerados**,
não escritos à mão:

```bash
npm run build     # = node build/refresh-meta.js  (Node 18+, precisa de internet)
```

Baixa de fontes externas (ver `build/SOURCES.md`), transforma, **valida** (aborta
se vier vazio) e grava em `data/`. Se regenerar os dados, lembre da regra de ouro:
os `data/*.json` são network-first no SW, então não exigem bump — mas se mudar o
**código** que os consome, exige.

---

## Checklist de PR nesta pasta

- [ ] `npm test` verde.
- [ ] Bump de `CACHE` em `sw.js` se mexeu em asset cache-first.
- [ ] `ASSETS` em `sw.js` em dia se adicionou/removeu arquivo servido.
- [ ] Ordem dos `<script>` preservada se adicionou módulo novo.
- [ ] Testes novos/atualizados para mudança de regra (veredito/ordenação/render).
