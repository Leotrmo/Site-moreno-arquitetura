# Fase 5 — Categorias de decisão + lente por objetivo (UI)

**Data:** 2026-06-18
**Página:** `/pokemon`
**Roadmap:** §8 de `docs/superpowers/specs/2026-06-15-pokemon-revisao-recomendacao-roadmap-design.md`
**Depende de:** Fase 4 (scoring multicritério `lib/meta/score.js` + `e.scores` em
`analysis.js`, PR #41 — **mergeado na main**).

---

## 1. Objetivo

Fechar o roadmap de revisão da recomendação: a partir dos scores por objetivo da Fase 4
(`e.scores`), **derivar categorias de decisão** legíveis e oferecer uma **lente por
objetivo** na UI que reordena e recategoriza a coleção conforme o que o usuário quer fazer
(eficiência / PvP / coleção / XP).

A Fase 4 entregou os scores "expostos, sem decidir" (ver §9 daquele spec). Esta fase é a
**sessão dedicada** que usa os scores para **ordenar e categorizar** — o trabalho que foi
deliberadamente adiado por tocar regras sensíveis (`verdict.test.js` / `sort.test.js`).

### Critérios de aceite centrais
- O caso do roadmap (**Shadow Gyarados hundo, set de raid** = Cachoeira + Jato d'Água) cai
  em **"Investir só PvE"** na lente padrão (Eficiência).
- As **categorias mudam conforme a lente** escolhida (o mesmo Gyarados vira "Guardar" sob
  a lente PvP, "Troféu" sob a lente Coleção, "Guardar" sob a lente XP).
- Suíte **inteira** verde; `verdict.test.js` **intacto** (prova de que o veredito não se
  moveu); verificado **ao vivo no navegador** na coleção real (723 mons).

---

## 2. Princípio de arquitetura: categoria é uma **camada derivada**

`verdict` (INVESTIR / MANTER / TRANSFERIR) **continua sendo o motor**: dirige os contadores
do hero, a cor da faixa do card, o modo-transferir e toda a lógica conservadora de proteção
(`isProtected`, `computeVerdict`, `computeAction`, `computeCounts`) — **intocados**.

Adiciona-se um conceito novo, **categoria**, **derivado** de `verdict` + `e.scores`. A
categoria é o que aparece como rótulo de decisão no card e o que a lente reenquadra.

**Por quê:** isola o risco. `verdict.test.js`/`computeVerdict` ficam intactos; as categorias
e a lente entram como código novo com testes próprios. Menos chance de regressão na regra
conservadora calibrada.

### Invariante de conservadorismo (não negociável)
A categoria **"Transferir" ≡ `verdict === 'TRANSFERIR'`** em **toda** lente. O motor já
garante que *qualquer* sinal de valor (shiny / lucky / shadow / lendário / costume /
tamanho extremo / hundo / ≥96% / XS-XL comfort / 2º carregado / trade-evo / regional /
espécie meta PvP ou PvE) bloqueia TRANSFERIR. O código novo **nunca** re-deriva transferência
— ele a **herda** do veredito. Logo, nenhum mon protegido pode cair em "Transferir" (nem em
"Alimentar (doce/XP)", que é o mesmo conjunto reenquadrado) em lente nenhuma.

---

## 3. A função `categorize(e, lens)`

Função **pura**, exportada de `lib/analysis.js` (não um módulo novo — ver §8). Lê apenas
`e.verdict` e `e.scores`; sem estado. Retorna `{ key, label }`:

```js
categorize(e, lens) → { key: 'invest_pve', label: 'Investir só PvE' }
```

`lens ∈ { 'eficiencia' (padrão), 'pvp', 'colecao', 'xp' }`.

### 3.1 Degradação graciosa (sem meta / sem scores)
Quando `e.scores == null` (datasets de meta ausentes — app roda offline/sem `data/`), a
categoria cai num rótulo derivado **só do veredito**, para a página continuar funcionando:
- `verdict === 'TRANSFERIR'` → `{ key:'transfer', label:'Transferir' }` (ou `'Alimentar
  (doce/XP)'` na lente XP).
- `verdict === 'INVESTIR'` → `{ key:'invest', label:'Investir' }`.
- senão → `{ key:'keep', label:'Guardar pro futuro' }`.

Isto vale para qualquer lente quando não há scores (a lente não tem eixo para reenquadrar).

### 3.2 Constantes calibráveis
```js
T_INVEST = 20;   // limiar de "vale investir" na escala 0–100 dos scores de investimento
T_COL    = 50;   // limiar de "troféu" na escala 0–100 do scoreColecao
```
Nomeadas e documentadas no módulo. Os testes verificam **ordem relativa + o caso Gyarados**,
não contagens absolutas (mesma filosofia da Fase 4). `T_INVEST` será **calibrado contra a
coleção real (723 mons)** na verificação ao vivo, para os baldes "Investir" não ficarem
vazios nem transbordando.

### 3.3 Lente **Eficiência** (padrão) → as 5 categorias

Sejam `pvpBest = max(scores.pvp.great, scores.pvp.ultra, scores.pvp.master)` e
`pve = scores.pve`.

| Condição (na ordem) | `key` | `label` |
|---|---|---|
| `verdict === 'TRANSFERIR'` | `transfer` | Transferir |
| `pve ≥ T_INVEST` **e** `pvpBest ≥ T_INVEST` | `invest_both` | Investir já |
| `pve ≥ T_INVEST` **e** `pvpBest < T_INVEST` | `invest_pve` | Investir só PvE |
| `pvpBest ≥ T_INVEST` **e** `pve < T_INVEST` | `invest_pvp` | Investir só PvP |
| senão (mantido, nada cruza o limiar) | `keep` | Guardar pro futuro |

"Investir já" = **ameaça dupla** (cruza o limiar em PvE **e** PvP). Um pick puro de Liga
Grande vira "Investir só PvP"; "Investir já" é o caso mais raro (forte nos dois eixos).

**Gyarados:** `pve ≈ 40 ≥ 20`, `pvpBest ≈ 4 < 20` → **Investir só PvE** ✅.

### 3.4 Divergência categoria × veredito é **intencional**

A categoria é mais fina que o veredito e **pode divergir** dele — esse é o ganho da fase,
não um bug:
- Um **hundo de espécie não-meta** tem `verdict === 'INVESTIR'` (perfeição protege/investe)
  mas, sob Eficiência, `pve < T` e `pvpBest < T` → categoria **"Guardar pro futuro"**: não
  é um investimento de recurso, é um troféu. (Sob a lente **Coleção** ele aparece como
  **"Troféu"** — exatamente o insight multi-lente.)
- A categoria deriva **só** de `verdict` + `scores`; os scores da Fase 4 já embutem
  **qualidade da cópia** (PvE pondera o atk IV; PvP usa o `spPct` da cópia), então uma
  duplicata pior tende a não cruzar `T_INVEST` por conta própria — sem caso especial aqui.

Para não **parecer** contradição na tela, o rótulo de categoria é enquadrado pela lente
(prefixo/ícone da lente), distinto do selo de veredito do card (ver §6).

### 3.5 Lentes específicas → 3 baldes pelo eixo da lente

Cada lente específica reenquadra em **Investir / Guardar / Transferir** pelo seu eixo. O
balde "Transferir" é sempre `verdict === 'TRANSFERIR'` (invariante §2).

| Lente | Eixo (score) | Balde topo (cond.) | Balde meio | Balde base |
|---|---|---|---|---|
| **pvp** ⚔️ | `pvpBest` | `invest` "Investir (PvP)" se `pvpBest ≥ T_INVEST` | `keep` "Guardar" | `transfer` "Transferir" |
| **colecao** ✨ | `scores.colecao` | `trophy` "Troféu" se `colecao ≥ T_COL` | `keep` "Guardar" | `transfer` "Transferir" |
| **xp** 🍬 | (pior primeiro) | — | `keep` "Guardar" (todo o resto) | `feed` "Alimentar (doce/XP)" se `verdict === 'TRANSFERIR'` |

- Na lente **pvp**: `verdict TRANSFERIR` → "Transferir"; senão `pvpBest ≥ T_INVEST` →
  "Investir (PvP)"; senão "Guardar".
- Na lente **colecao**: `verdict TRANSFERIR` → "Transferir"; senão `colecao ≥ T_COL` →
  "Troféu"; senão "Guardar". (Um Lucky simples, `colecao ≈ 30–40`, fica em "Guardar" — só
  cópias genuinamente especiais ≥ 50 são troféu.)
- Na lente **xp**: `verdict TRANSFERIR` → "Alimentar (doce/XP)"; senão "Guardar". É
  exatamente o conjunto conservador de transferência, reenquadrado como "o que alimentar
  por doce/XP" e ordenado pior-primeiro. Nenhum mon protegido entra em "Alimentar".

**Gyarados nas 4 lentes:** Eficiência → "Investir só PvE"; PvP → "Guardar" (pvp fraco);
Coleção → "Troféu" (hundo + sombrio, `colecao ≥ 50`); XP → "Guardar" (protegido, não é
fodder). Demonstra "categorias mudam com a lente".

---

## 4. Ordenação por lente (`lib/sort.js`)

**Adiciona** `lensSorter(lens)` — não toca `PRIMARY` / `getSorter` / `SORT_OPTIONS` /
`competitiveRankSorter` (assim `sort.test.js` atual fica intacto; só ganha testes novos).

```js
lensSorter(lens) → (a, b) => <comparador>
```
- `pvp`: `pvpBest` desc → desempate `ivPct` desc → nome.
- `colecao`: `scores.colecao` desc → `ivPct` desc → nome.
- `xp`: pior primeiro = `ivPct` **asc** → `cp` asc → nome (o fodder sobe).
- `eficiencia`: `scores.best.value` desc → `ivPct` desc → nome. (Usado só se a app pedir
  ordenação por lente em Eficiência; ver §5 — por padrão Eficiência mantém o sort-select.)

Mon sem `scores` → eixo trata como `-Infinity` (vai para o fim em desc; em xp, sem score
não muda — usa `ivPct`). Helper interno `_lensScore(e, lens)` isola isso.

---

## 5. UI — `app.js` + `index.html`

### Seletor de lente (toolbar)
Botões segmentados no estilo dos chips/Pokédex, na `toolbar-wrap`:
`🎯 Eficiência` (padrão) · `⚔️ PvP` · `✨ Coleção` · `🍬 XP`.

- Novo `state.lens` (padrão `'eficiencia'`), persistido em `localStorage`
  (`'pokemon-lens'`), igual a sort/dir.
- **Lente Eficiência (padrão): comportamento idêntico ao de hoje.** Ordenação pelo
  `sort-select` + `sort-dir`; chips competitivos continuam com o override de rank
  (`competitiveRankSorter`) como hoje. **Zero regressão no caminho padrão.**
- **Lente não-padrão ativa: a lente vence a ordenação.** A lista ordena por
  `lensSorter(state.lens)`; o `sort-select`/`sort-dir` ficam **desabilitados** (visualmente
  esmaecidos) e os chips **apenas filtram** o conjunto (não reordenam). Decisão confirmada
  no brainstorm: lente vence; override competitivo só atua na Eficiência.
- Filtros de hero (verdict), chips e busca **compõem** normalmente com qualquer lente.

### Wiring novo (espelha o de sort/dir)
- `renderLensSelector()` monta os botões e marca o ativo; clique seta `state.lens`,
  persiste, atualiza o estado de habilitação do sort-select/dir e chama `applyFilters()`.
- `applyFilters()`: escolhe o sorter — Eficiência → `getSorter`/`competitiveRankSorter`
  (como hoje); não-padrão → `lensSorter(state.lens)`. Passa `state.lens` para `cardHtml`.

### Helper de habilitação do sort
`syncLensUi()` liga/desliga o `disabled` do `#sort` e do `#sort-dir` conforme
`state.lens === 'eficiencia'`, e marca o botão de lente ativo.

---

## 6. Render — `lib/render.js`

### `cardHtml(e, lens)` — rótulo de categoria por card
Linha nova, colorida, com a categoria + o score relevante da lente ativa. Ex.:
`💪 Investir só PvE · PvE 41`. O número exibido é o eixo da lente:
- `eficiencia`: `scores.best.value` (e o label da categoria já diz PvE/PvP).
- `pvp`: `pvpBest`. `colecao`: `scores.colecao`. `xp`: sem número (ou `ivPct`).

`cardHtml` chama `Analysis.categorize(e, lens)` para o label/cor (ou recebe a categoria já
computada — ver §8 sobre acoplamento). Ícone/cor por `key` de categoria:
`invest_both`/`invest_pve`/`invest_pvp`/`invest` → 💪 (verde investir); `trophy` → 🏆
(dourado); `keep` → 🛡️ (manter); `transfer`/`feed` → ❌/🍬 (transferir). Score formatado
com `Math.round`. Tudo por `esc()`.

Compatibilidade: `cardHtml(e)` sem `lens` assume `'eficiencia'` (default do parâmetro), para
não quebrar chamadas/teste existentes que passam só `e`.

### `detailHtml(e)` — quebra de scores
Bloco compacto novo no detalhe (quando `e.scores`): `PvP G/U/M · PvE · Coleção` com os
quatro/cinco números arredondados, para o usuário ver o porquê da categoria. Sem custo de
layout no card fechado.

---

## 7. Fiação em `analysis.js`

- `enrichOne`: adiciona `category: null` na seção "preenchidos por analyze".
- `analyze`, **passada 2** (depois de `e.verdict`/`e.scores` prontos):
  `e.category = categorize(e, 'eficiencia')` — a categoria da lente padrão, para
  contadores/testes/consumidores não-UI. A categoria por-lente (UI) é calculada pela app a
  cada render via `categorize(e, state.lens)`.
- `categorize` é **exportada** no `return` do módulo.
- **Nada** muda em `computeVerdict` / `computeAction` / `computeTags` / `isProtected` /
  `computeCounts`.

---

## 8. Isolamento / por que `categorize` fica em `analysis.js`

`categorize` (~40 linhas) é pura mas **fortemente acoplada** a `scores` + `verdict`, ambos
de `analysis.js`. Mantê-la lá evita um `<script>` novo, uma entrada nova em `ASSETS` e uma
mudança na **ordem dos scripts** (risco de `ReferenceError` na página). É exportada e testada
diretamente (estilo das demais funções de `analysis.js`). Se crescer, vira módulo depois.

`render.js`/`sort.js` consomem `categorize`/`scores` via os globais já existentes
(`Object.assign` no global para `analysis`/`render`/`sort`; nos testes, `require`). Padrão
dual preservado.

---

## 9. Testes

### Novo `test/category.test.js`
- **Tabela das 5 (Eficiência)** com mons sintéticos mínimos (só `verdict` + `scores`):
  - `verdict TRANSFERIR` → `transfer` (mesmo com scores altos — invariante).
  - pve≥T & pvp≥T → `invest_both`; pve≥T & pvp<T → `invest_pve`; pvp≥T & pve<T →
    `invest_pvp`; ambos < T mas não-transfer → `keep`.
- **Reenquadramento por lente** (mesmo mon, lentes diferentes): pvp/colecao/xp dão os
  baldes esperados; "Troféu" só com `colecao ≥ T_COL`; "Alimentar" só com verdict
  TRANSFERIR.
- **Invariante conservador**: um mon protegido (ex.: shiny IV baixo → verdict MANTER)
  **nunca** vira `transfer`/`feed` em lente nenhuma.
- **Degradação**: `scores == null` → cai no rótulo por-veredito, sem lançar.
- **Aceite ponta-a-ponta** (com `data/*.json` reais, como o `score.test.js`): monta um
  Shadow Gyarados hundo (Cachoeira + Jato d'Água), roda `analyze(...)` e asserta
  `categorize(e, 'eficiencia').key === 'invest_pve'`; e que muda nas outras lentes
  (`'pvp'` → `keep`, `'colecao'` → `trophy`).

### `test/sort.test.js` (adições; existentes intactos)
- `lensSorter('pvp')` ordena por `pvpBest` desc; `'colecao'` por `colecao` desc; `'xp'`
  pior-primeiro (`ivPct` asc); `'eficiencia'` por `best.value` desc. Desempates por
  `ivPct`/nome. Mon sem `scores` vai para o fim (exceto xp).

### `test/render.test.js` (adições)
- `cardHtml(e, lens)` inclui o rótulo de categoria certo e o número do eixo; `esc()` em
  nomes. `cardHtml(e)` sem lens assume Eficiência. `detailHtml` mostra a quebra de scores
  quando há `e.scores`.

### `test/verdict.test.js` — **inalterado**
Rodado para **provar** que o veredito não se moveu. Se algum teste de veredito quebrar, é
regressão — parar e corrigir.

### Suíte inteira
`npm test` de dentro de `pokemon/` — **suíte inteira** verde (baseline ~271 + os novos).
Rodar a suíte **completa** entre as etapas (shape compartilhado quebra testes cross-file).

---

## 10. Infra (regra de ouro do CLAUDE.md)

- `sw.js`: **bump** `pokemon-leo-v21 → v22` (mexe em `analysis.js`, `sort.js`, `render.js`,
  `app.js`, `index.html` — todos cache-first).
- `ASSETS`: **inalterado** (nenhum arquivo novo servido — `categorize` mora em `analysis.js`).
- Ordem dos `<script>`: **inalterada** (nenhum módulo novo).

---

## 11. Verificação no navegador (obrigatória)

A fase mexe em `app.js`/`render.js` (wiring de DOM não coberto por teste).
- **Gotcha conhecido:** o preview MCP pode servir a raiz do repo MAIN, não o worktree
  (sintoma: global/estado novo "undefined" com o código certo no disco). Confirmar **qual
  diretório** está sendo servido; carregar o worktree via
  `http://localhost:8765/.claude/worktrees/worktree-pokemon-fase5-categorias/pokemon/?cb=<ts>`.
- **Desregistrar o service worker + limpar caches** antes (senão serve `index.html` velho).
- Conferir ao vivo na coleção real (723 mons): seletor de lente troca ordem **e** rótulos;
  Gyarados em "Investir só PvE" na Eficiência; baldes não vazios/transbordando (calibrar
  `T_INVEST` se preciso); sort-select desabilita fora da Eficiência; sem erro no console.

---

## 12. Resumo dos arquivos tocados

| Arquivo | Mudança |
|---|---|
| `lib/analysis.js` | `categorize(e, lens)` (nova, exportada) + `e.category` em enrich/analyze. |
| `lib/sort.js` | `lensSorter(lens)` (novo); existentes intactos. |
| `lib/render.js` | `cardHtml(e, lens)` ganha rótulo de categoria + score; `detailHtml` ganha quebra de scores. |
| `app.js` | `state.lens` + seletor de lente + escolha de sorter por lente + habilitação do sort-select. |
| `index.html` | markup do seletor de lente; CSS dos botões e do rótulo de categoria. |
| `sw.js` | bump `v21 → v22`. |
| `test/category.test.js` | **novo** — 5 categorias + reenquadramento + invariante + aceite. |
| `test/sort.test.js` | adições de `lensSorter`. |
| `test/render.test.js` | adições de rótulo/quebra de scores. |

---

## 13. Fora de escopo (YAGNI)

- **Score de XP real** (custo de doce p/ evoluir / mass-evolve com Lucky Egg): não há dado
  nos datasets; a lente XP usa o enquadramento "doce/limpeza" (conjunto de transferência
  pior-primeiro). Fica para o futuro quando existir métrica de XP.
- **Cabeçalhos de seção por categoria** (agrupar a lista): preferido rótulo por card
  (menor risco com modo-transferir/expandir). Possível melhoria futura.
- **Integrar categoria ao hero/contadores**: hero/contadores seguem no `verdict` (camada
  derivada). Não se mexe.
