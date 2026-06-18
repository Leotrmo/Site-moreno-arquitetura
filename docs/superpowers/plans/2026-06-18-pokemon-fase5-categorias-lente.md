# Fase 5 — Categorias de decisão + lente por objetivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derivar dos scores da Fase 4 categorias de decisão legíveis (Investir já / só PvE / só PvP / Guardar pro futuro / Transferir) e uma lente por objetivo (Eficiência / PvP / Coleção / XP) que reordena e recategoriza a coleção na UI da `/pokemon`.

**Architecture:** Camada **derivada** — `verdict` (INVESTIR/MANTER/TRANSFERIR) continua o motor intocado; uma função pura `categorize(e, lens)` em `analysis.js` lê só `verdict`+`scores`. A lente Eficiência dá as 5 categorias; PvP/Coleção/XP reenquadram em 3 baldes pelo seu eixo. Invariante: `transfer`/`feed` só quando `verdict === 'TRANSFERIR'`. `sort.js` ganha `lensSorter`; `render.js` mostra o rótulo; `app.js`/`index.html` ganham o seletor de lente.

**Tech Stack:** Vanilla JS (padrão de módulo dual browser+Node), `node:test`, PWA com Service Worker cache-first.

**Spec:** `docs/superpowers/specs/2026-06-18-pokemon-fase5-categorias-lente-design.md`

**Calibração (medida na coleção real de 723 mons, não estimada):** scores de investimento são esmagados por custo/prontidão → `pve` máx 8.9, `pvpBest` máx 26.5, `colecao` máx 95.5. Por isso `T_INVEST = 2` e `T_COL = 50`. Gyarados sintético: `pve 4.45 ≥ 2 > pvpBest 0.75` → "Investir só PvE".

**Regra de ouro (CLAUDE.md):** todo asset cache-first mexido exige bump do `CACHE` em `sw.js` (`v21 → v22`). Sem arquivo novo servido → `ASSETS` e ordem dos `<script>` inalterados.

**Rodar a suíte INTEIRA entre tarefas** (de dentro de `pokemon/`): `npm test`. Shape compartilhado quebra testes cross-file.

---

## File Structure

| Arquivo | Responsabilidade nesta fase |
|---|---|
| `pokemon/lib/analysis.js` | **+** `categorize(e, lens)` pura/exportada + constantes `T_INVEST`/`T_COL` + helper `_pvpBest`; `e.category` em enrich/analyze. `verdict`/`action`/`counts` intocados. |
| `pokemon/lib/sort.js` | **+** `lensSorter(lens)` + helpers `_lensScore`/`_pvpBestScore`. Existentes intactos. |
| `pokemon/lib/render.js` | **+** rótulo de categoria em `cardHtml(e, lens)` + quebra de scores em `detailHtml`; import dual de `Analysis`. |
| `pokemon/app.js` | **+** `state.lens`, seletor de lente, escolha de sorter por lente, habilitação do sort-select. |
| `pokemon/index.html` | **+** markup do seletor de lente; CSS de `.lens-btn`/`.pk-category`/`.pk-scores`. |
| `pokemon/sw.js` | bump `v21 → v22`. |
| `pokemon/test/category.test.js` | **novo** — regras + reenquadramento + invariante + degradação + aceite. |
| `pokemon/test/sort.test.js` | **+** testes de `lensSorter`. |
| `pokemon/test/render.test.js` | **+** testes de rótulo/quebra de scores. |
| `pokemon/test/verdict.test.js` | **inalterado** — rodado p/ provar não-regressão do veredito. |

---

## Task 1: `categorize(e, lens)` — núcleo da lógica (TDD)

**Files:**
- Create: `pokemon/test/category.test.js`
- Modify: `pokemon/lib/analysis.js`

- [ ] **Step 1: Write the failing test** — criar `pokemon/test/category.test.js`:

```js
// pokemon/test/category.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { categorize, analyze } = require('../lib/analysis.js');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

// scores sintéticos na escala REAL (pve/pvp single-digit; colecao 0–100).
function scores(o) {
  o = o || {};
  return {
    pvp: { great: o.great || 0, ultra: o.ultra || 0, master: o.master || 0 },
    pve: o.pve || 0,
    colecao: o.colecao || 0,
    best: { objective: o.bestObj || 'pve', value: o.bestVal || 0 },
  };
}
function mon(over) { return Object.assign({ verdict: 'MANTER', scores: scores() }, over); }

// --- Eficiência (5 categorias) ---
test('Eficiência: pve≥T e pvp≥T → invest_both', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ pve: 5, great: 5 }) }), 'eficiencia').key, 'invest_both');
});
test('Eficiência: pve≥T e pvp<T → invest_pve', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ pve: 5, great: 1 }) }), 'eficiencia').key, 'invest_pve');
});
test('Eficiência: pvp≥T e pve<T → invest_pvp', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ pve: 1, ultra: 5 }) }), 'eficiencia').key, 'invest_pvp');
});
test('Eficiência: nada cruza T → keep', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ pve: 1, great: 1 }) }), 'eficiencia').key, 'keep');
});
test('lens default (sem arg) = eficiencia', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ pve: 5 }) })).key, 'invest_pve');
});

// --- Invariante conservador ---
test('verdict TRANSFERIR → transfer mesmo com scores altos', () => {
  const e = mon({ verdict: 'TRANSFERIR', scores: scores({ pve: 9, ultra: 26, colecao: 95 }) });
  assert.strictEqual(categorize(e, 'eficiencia').key, 'transfer');
  assert.strictEqual(categorize(e, 'pvp').key, 'transfer');
  assert.strictEqual(categorize(e, 'colecao').key, 'transfer');
});
test('mon protegido (não-TRANSFERIR) nunca vira transfer/feed em lente nenhuma', () => {
  const e = mon({ verdict: 'MANTER', scores: scores({ colecao: 85 }) });
  for (const lens of ['eficiencia', 'pvp', 'colecao', 'xp']) {
    const k = categorize(e, lens).key;
    assert.ok(k !== 'transfer' && k !== 'feed', 'lente ' + lens + ' deu ' + k);
  }
});

// --- Reenquadramento por lente ---
test('lente PvP: pvpBest≥T → invest; senão keep', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ master: 5 }) }), 'pvp').key, 'invest');
  assert.strictEqual(categorize(mon({ scores: scores({ master: 1 }) }), 'pvp').key, 'keep');
});
test('lente Coleção: colecao≥T_COL → trophy; Lucky simples → keep', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ colecao: 60 }) }), 'colecao').key, 'trophy');
  assert.strictEqual(categorize(mon({ scores: scores({ colecao: 40 }) }), 'colecao').key, 'keep');
});
test('lente XP: verdict TRANSFERIR → feed; senão keep', () => {
  assert.strictEqual(categorize(mon({ verdict: 'TRANSFERIR' }), 'xp').key, 'feed');
  assert.strictEqual(categorize(mon({ verdict: 'MANTER' }), 'xp').key, 'keep');
});

// --- Degradação (sem scores) ---
test('sem scores: rótulo por veredito, sem lançar', () => {
  assert.strictEqual(categorize({ verdict: 'INVESTIR', scores: null }, 'eficiencia').key, 'invest');
  assert.strictEqual(categorize({ verdict: 'MANTER', scores: null }, 'eficiencia').key, 'keep');
  assert.strictEqual(categorize({ verdict: 'TRANSFERIR', scores: null }, 'eficiencia').key, 'transfer');
  assert.strictEqual(categorize({ verdict: 'TRANSFERIR', scores: null }, 'xp').key, 'feed');
});

// --- Aceite ponta-a-ponta (dados reais) ---
function realMeta() {
  return {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: require('../data/moves_pt.json'),
    pvpRanks: require('../data/pvp_ranks.json'),
    pveRanks: require('../data/pve_ranks.json'),
    cpm: require('../data/cpm.json'),
    moves: require('../data/moves.json'),
  };
}
test('ACEITE: Shadow Gyarados hundo (set de raid) → Investir só PvE; reenquadra por lente', () => {
  const meta = realMeta();
  const fd = { g: { mon_name: 'Gyarados', mon_number: 130, mon_cp: 2700,
    mon_attack: 15, mon_defence: 15, mon_stamina: 15, mon_height: 6.5,
    mon_alignment: 'SHADOW', mon_isShiny: 'NO', mon_isLucky: 'NO',
    mon_move_1: 'Cachoeira', mon_move_2: "Jato d'Água" } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.category.key, 'invest_pve');            // e.category = eficiencia (default)
  assert.strictEqual(categorize(e, 'eficiencia').key, 'invest_pve');
  assert.strictEqual(categorize(e, 'pvp').key, 'keep');        // pvp fraco (0.75 < 2)
  assert.strictEqual(categorize(e, 'colecao').key, 'trophy');  // hundo+sombrio (colecao 93)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pokemon && node --test test/category.test.js`
Expected: FAIL — `categorize` is `undefined` / not a function.

- [ ] **Step 3: Write minimal implementation** — em `pokemon/lib/analysis.js`, logo **depois de** `function computeVerdict(e) { ... }` (≈ linha 357), inserir:

```js
  // ---- Fase 5: categoria de decisão (camada derivada de verdict + scores, reenquadrada
  // pela lente). Invariante: 'transfer'/'feed' só quando verdict === 'TRANSFERIR'.
  const T_INVEST = 2;    // limiar "vale investir já" na escala REAL dos scores (ver spec Fase 5)
  const T_COL = 50;      // limiar "troféu" na escala 0–100 do scoreColecao

  function _pvpBest(s) {
    if (!s || !s.pvp) return 0;
    return Math.max(s.pvp.great || 0, s.pvp.ultra || 0, s.pvp.master || 0);
  }

  function categorize(e, lens) {
    lens = lens || 'eficiencia';
    const transfer = e.verdict === 'TRANSFERIR';
    // Degradação: sem scores (meta ausente), rótulo só pelo veredito.
    if (!e.scores) {
      if (transfer) return lens === 'xp'
        ? { key: 'feed', label: 'Alimentar (doce/XP)' }
        : { key: 'transfer', label: 'Transferir' };
      if (e.verdict === 'INVESTIR') return { key: 'invest', label: 'Investir' };
      return { key: 'keep', label: 'Guardar pro futuro' };
    }
    const s = e.scores;
    if (lens === 'pvp') {
      if (transfer) return { key: 'transfer', label: 'Transferir' };
      if (_pvpBest(s) >= T_INVEST) return { key: 'invest', label: 'Investir (PvP)' };
      return { key: 'keep', label: 'Guardar' };
    }
    if (lens === 'colecao') {
      if (transfer) return { key: 'transfer', label: 'Transferir' };
      if ((s.colecao || 0) >= T_COL) return { key: 'trophy', label: 'Troféu' };
      return { key: 'keep', label: 'Guardar' };
    }
    if (lens === 'xp') {
      if (transfer) return { key: 'feed', label: 'Alimentar (doce/XP)' };
      return { key: 'keep', label: 'Guardar' };
    }
    // 'eficiencia' (padrão) → as 5 categorias.
    if (transfer) return { key: 'transfer', label: 'Transferir' };
    const invPve = (s.pve || 0) >= T_INVEST;
    const invPvp = _pvpBest(s) >= T_INVEST;
    if (invPve && invPvp) return { key: 'invest_both', label: 'Investir já' };
    if (invPve) return { key: 'invest_pve', label: 'Investir só PvE' };
    if (invPvp) return { key: 'invest_pvp', label: 'Investir só PvP' };
    return { key: 'keep', label: 'Guardar pro futuro' };
  }
```

- [ ] **Step 4: Wire `e.category`** — duas edições em `pokemon/lib/analysis.js`:

(a) em `enrichOne`, logo após `scores: null,` (≈ linha 168), adicionar:
```js
      // Fase 5 — categoria de decisão (preenchida por analyze).
      category: null,
```

(b) em `analyze`, na **passada 2**, logo após `e.reason = v.reason;` (≈ linha 634), adicionar:
```js
      e.category = categorize(e, 'eficiencia');
```

(c) no `return { ... }` final do módulo (≈ linha 669), adicionar `categorize` à lista exportada:
```js
  return { ivPct, speciesKey, enrichOne, enrichCollection, isProtected, isPvpMeta, isPveMeta, isMetaRelevant, computeVerdict, computeTags, computeAction, canBestFriendTrade, tradeBoost, analyze, computeCounts, categorize,
           TRADE_MIN_IV_PCT, TRADE_EXPECTED_IV_PCT };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd pokemon && node --test test/category.test.js`
Expected: PASS (todos os testes verdes).

- [ ] **Step 6: Run the WHOLE suite**

Run: `cd pokemon && npm test`
Expected: PASS — baseline + os novos; `verdict.test.js` intacto e verde.

- [ ] **Step 7: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/category.test.js
git commit -m "feat(pokemon): categorize(e,lens) — categoria de decisão derivada (Fase 5)"
```

---

## Task 2: `lensSorter(lens)` — ordenação por lente (TDD)

**Files:**
- Modify: `pokemon/lib/sort.js`
- Test: `pokemon/test/sort.test.js`

- [ ] **Step 1: Write the failing test** — adicionar ao FINAL de `pokemon/test/sort.test.js`:

```js
// --- Fase 5: lensSorter ---
const { lensSorter } = require('../lib/sort.js');

function sc(o) {
  o = o || {};
  return { pvp: { great: o.great || 0, ultra: o.ultra || 0, master: o.master || 0 },
           pve: o.pve || 0, colecao: o.colecao || 0,
           best: { objective: o.bestObj || 'pve', value: o.bestVal || 0 } };
}
function smon(over) {
  return Object.assign({ name: 'M', number: 1, cp: 500, ivPct: 80, verdict: 'MANTER', scores: sc() }, over);
}

test('lensSorter pvp: ordena por pvpBest desc', () => {
  const list = [smon({ name: 'A', scores: sc({ great: 1 }) }), smon({ name: 'B', scores: sc({ master: 9 }) }), smon({ name: 'C', scores: sc({ ultra: 5 }) })];
  list.sort(lensSorter('pvp'));
  assert.deepStrictEqual(list.map(m => m.name), ['B', 'C', 'A']);
});
test('lensSorter colecao: ordena por colecao desc', () => {
  const list = [smon({ name: 'A', scores: sc({ colecao: 30 }) }), smon({ name: 'B', scores: sc({ colecao: 90 }) }), smon({ name: 'C', scores: sc({ colecao: 60 }) })];
  list.sort(lensSorter('colecao'));
  assert.deepStrictEqual(list.map(m => m.name), ['B', 'C', 'A']);
});
test('lensSorter xp: pior primeiro (ivPct asc)', () => {
  const list = [smon({ name: 'A', ivPct: 90 }), smon({ name: 'B', ivPct: 20 }), smon({ name: 'C', ivPct: 50 })];
  list.sort(lensSorter('xp'));
  assert.deepStrictEqual(list.map(m => m.name), ['B', 'C', 'A']);
});
test('lensSorter eficiencia: ordena por best.value desc', () => {
  const list = [smon({ name: 'A', scores: sc({ bestVal: 1 }) }), smon({ name: 'B', scores: sc({ bestVal: 8 }) }), smon({ name: 'C', scores: sc({ bestVal: 4 }) })];
  list.sort(lensSorter('eficiencia'));
  assert.deepStrictEqual(list.map(m => m.name), ['B', 'C', 'A']);
});
test('lensSorter: mon sem scores vai p/ o fim (desc)', () => {
  const list = [smon({ name: 'A', scores: null }), smon({ name: 'B', scores: sc({ bestVal: 5 }) })];
  list.sort(lensSorter('eficiencia'));
  assert.deepStrictEqual(list.map(m => m.name), ['B', 'A']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pokemon && node --test test/sort.test.js`
Expected: FAIL — `lensSorter` is not a function.

- [ ] **Step 3: Write minimal implementation** — em `pokemon/lib/sort.js`, logo **antes do** `return { ... }` final, inserir:

```js
  // ---- Fase 5: ordenação pela lente ativa. pvp/colecao/eficiencia por score desc;
  // xp pior-primeiro (IV asc). Mon sem scores → -Infinity (vai p/ o fim em desc).
  function _pvpBestScore(e) {
    var s = e.scores;
    if (!s || !s.pvp) return -Infinity;
    return Math.max(s.pvp.great || 0, s.pvp.ultra || 0, s.pvp.master || 0);
  }
  function _lensScore(e, lens) {
    var s = e.scores;
    if (lens === 'pvp') return _pvpBestScore(e);
    if (lens === 'colecao') return (s && typeof s.colecao === 'number') ? s.colecao : -Infinity;
    return (s && s.best && typeof s.best.value === 'number') ? s.best.value : -Infinity; // eficiencia
  }
  function lensSorter(lens) {
    if (lens === 'xp') {
      return function (a, b) { return (a.ivPct - b.ivPct) || (a.cp - b.cp) || byName(a, b); };
    }
    return function (a, b) {
      return (_lensScore(b, lens) - _lensScore(a, lens)) || (b.ivPct - a.ivPct) || byName(a, b);
    };
  }
```

E adicionar `lensSorter` ao objeto de `return`:
```js
  return { COMPARATORS, SORT_OPTIONS, getSorter, COMP_RANK_KEYS, rankFor, competitiveRankSorter, lensSorter };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pokemon && node --test test/sort.test.js`
Expected: PASS (novos + existentes de sort intactos).

- [ ] **Step 5: Run the WHOLE suite**

Run: `cd pokemon && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pokemon/lib/sort.js pokemon/test/sort.test.js
git commit -m "feat(pokemon): lensSorter(lens) — ordenação por objetivo (Fase 5)"
```

---

## Task 3: Render — rótulo de categoria + quebra de scores (TDD)

**Files:**
- Modify: `pokemon/lib/render.js`
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Write the failing test** — adicionar ao FINAL de `pokemon/test/render.test.js`:

```js
// --- Fase 5: rótulo de categoria + quebra de scores ---
function scoredMon(over) {
  return Object.assign({
    id: 'z', name: 'Hydreigon', verdict: 'INVESTIR', reason: 'x', ivPct: 96, cp: 3200,
    size: null, isHundo: false, isShiny: false, isShadow: false, isPurified: false, isLucky: false,
    isLegendary: false, isCostume: false, isXSComfort: false, isXLComfort: false, hasSecondCharge: false,
    tradeBoost: null, action: null, movesetTip: null, tags: [], pvp: null, pvpMeta: null, pveMeta: null,
    moves: ['x'], ivs: { atk: 15, def: 15, sta: 15 }, height: 1.8, weight: 160,
    scores: { pvp: { great: 0, ultra: 0, master: 0 }, pve: 8.9, colecao: 60, best: { objective: 'pve', value: 8.9 } },
  }, over || {});
}

test('cardHtml: rótulo de categoria (Investir só PvE) na lente padrão', () => {
  const html = cardHtml(scoredMon());
  assert.match(html, /pk-category/);
  assert.match(html, /Investir só PvE/);
});
test('cardHtml: categoria muda com a lente', () => {
  assert.match(cardHtml(scoredMon(), 'colecao'), /Troféu/);
  assert.match(cardHtml(scoredMon(), 'pvp'), /Guardar/);   // pvpBest 0 < 2
});
test('cardHtml: sem scores → rótulo por veredito (degradação)', () => {
  const html = cardHtml(scoredMon({ scores: null, verdict: 'MANTER' }));
  assert.match(html, /pk-category/);
  assert.match(html, /Guardar pro futuro/);
});
test('cardHtml(e) sem lens assume Eficiência', () => {
  assert.match(cardHtml(scoredMon()), /Investir só PvE/);
});
test('detailHtml: quebra de scores quando há e.scores', () => {
  const html = detailHtml(scoredMon());
  assert.match(html, /pk-scores/);
  assert.match(html, /PvE 9/);   // round(8.9)=9
});
test('detailHtml: sem scores → sem quebra (não-regressão)', () => {
  assert.doesNotMatch(detailHtml(scoredMon({ scores: null })), /pk-scores/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pokemon && node --test test/render.test.js`
Expected: FAIL — não há `pk-category`.

- [ ] **Step 3: Write minimal implementation** — em `pokemon/lib/render.js`:

(a) logo após o bloco de `TYPE_PT` (≈ linha 11), adicionar o import dual de `Analysis` + os mapas/ helpers:
```js
  var Analysis = ((typeof require === 'function')
    ? require('./analysis.js') : (typeof globalThis !== 'undefined' ? globalThis : {}));

  const CATEGORY_ICON = {
    invest_both: '💪', invest_pve: '💪', invest_pvp: '💪', invest: '💪',
    trophy: '🏆', keep: '🛡️', transfer: '❌', feed: '🍬',
  };
  const CATEGORY_CLASS = {
    invest_both: 'cat-invest', invest_pve: 'cat-invest', invest_pvp: 'cat-invest', invest: 'cat-invest',
    trophy: 'cat-trophy', keep: 'cat-keep', transfer: 'cat-transfer', feed: 'cat-feed',
  };

  // Score do eixo da lente p/ exibir ao lado da categoria (null = não exibe número).
  function _lensAxisScore(e, lens) {
    const s = e.scores;
    if (!s) return null;
    if (lens === 'pvp') return Math.max(s.pvp.great || 0, s.pvp.ultra || 0, s.pvp.master || 0);
    if (lens === 'colecao') return s.colecao || 0;
    if (lens === 'xp') return null;
    return (s.best && typeof s.best.value === 'number') ? s.best.value : null; // eficiencia
  }
  function _fmtScore(n) { return (n < 10) ? n.toFixed(1) : String(Math.round(n)); }

  // Linha de categoria por card; só mostra número p/ categorias positivas (invest/trophy).
  function categoryLineHtml(e, lens) {
    const cat = Analysis.categorize ? Analysis.categorize(e, lens) : null;
    if (!cat) return '';
    const positive = cat.key.indexOf('invest') === 0 || cat.key === 'trophy';
    const sc = positive ? _lensAxisScore(e, lens) : null;
    const scTxt = (sc != null) ? ' · ' + _fmtScore(sc) : '';
    return '<div class="pk-category ' + (CATEGORY_CLASS[cat.key] || 'cat-keep') + '">' +
           (CATEGORY_ICON[cat.key] || '') + ' ' + esc(cat.label) + scTxt + '</div>';
  }

  // Quebra de scores no detalhe (power-user). '' quando não há e.scores.
  function scoresHtml(e) {
    if (!e.scores) return '';
    const s = e.scores, r = Math.round;
    return '<div class="pk-scores"><strong>Scores</strong> — ⚔️ G ' + r(s.pvp.great) +
           ' · U ' + r(s.pvp.ultra) + ' · M ' + r(s.pvp.master) +
           ' · 🔥 PvE ' + r(s.pve) + ' · ✨ Col ' + r(s.colecao) + '</div>';
  }
```

(b) trocar a assinatura e inserir a linha de categoria em `cardHtml`. Substituir:
```js
  function cardHtml(e) {
    return (
```
por:
```js
  function cardHtml(e, lens) {
    lens = lens || 'eficiencia';
    return (
```
e, dentro do retorno, logo **após** o bloco `'</div>'` que fecha `pk-stats` e **antes** de `'<div class="reason">'`, inserir:
```js
        categoryLineHtml(e, lens) +
```

(c) em `detailHtml`, adicionar `const scores = scoresHtml(e);` junto às outras consts e inseri-lo no retorno **antes** de `competitive +`:
```js
    const competitive = competitiveHtml(e);
    const scores = scoresHtml(e);
    return (
      '<div class="pk-detail">' +
        ...
        scores +
        competitive +
        compare +
      '</div>'
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pokemon && node --test test/render.test.js`
Expected: PASS (novos + render existentes intactos — a linha de categoria não colide com os matchers existentes; `/INVESTIR/` casa o selo de veredito, não o rótulo `Investir`).

- [ ] **Step 5: Run the WHOLE suite**

Run: `cd pokemon && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pokemon/lib/render.js pokemon/test/render.test.js
git commit -m "feat(pokemon): rótulo de categoria no card + quebra de scores no detalhe (Fase 5)"
```

---

## Task 4: UI — seletor de lente + wiring (browser-verified)

Sem teste unitário (toca DOM vivo). Verificado no navegador na Task 5.

**Files:**
- Modify: `pokemon/app.js`
- Modify: `pokemon/index.html`
- Modify: `pokemon/sw.js`

- [ ] **Step 1: `app.js` — estado e constantes da lente.** Substituir o bloco:
```js
  const SORT_KEY = 'pokemon-sort';
  const DIR_KEY = 'pokemon-sort-dir';
  const state = { verdict: null, special: null, query: '', sort: loadSort(), dirRev: loadDir() };
```
por:
```js
  const SORT_KEY = 'pokemon-sort';
  const DIR_KEY = 'pokemon-sort-dir';
  const LENS_KEY = 'pokemon-lens';
  const LENSES = [
    ['eficiencia', '🎯 Eficiência'],
    ['pvp', '⚔️ PvP'],
    ['colecao', '✨ Coleção'],
    ['xp', '🍬 XP'],
  ];
  const state = { verdict: null, special: null, query: '', sort: loadSort(), dirRev: loadDir(), lens: loadLens() };
```

- [ ] **Step 2: `app.js` — `loadLens`.** Logo após `function loadDir() { ... }`, adicionar:
```js
  function loadLens() {
    const saved = localStorage.getItem(LENS_KEY);
    return LENSES.some(l => l[0] === saved) ? saved : 'eficiencia';
  }
```

- [ ] **Step 3: `app.js` — `renderLensSelector` + `syncLens`.** Logo após `function syncSortDir() { ... }`, adicionar:
```js
  function renderLensSelector() {
    const wrap = document.getElementById('lens');
    if (!wrap) return;
    wrap.innerHTML = '';
    for (const [key, label] of LENSES) {
      const b = document.createElement('button');
      b.className = 'lens-btn';
      b.dataset.lens = key;
      b.textContent = label;
      b.addEventListener('click', () => {
        state.lens = key;
        try { localStorage.setItem(LENS_KEY, key); } catch {}
        syncLens();
        applyFilters();
      });
      wrap.appendChild(b);
    }
    syncLens();
  }
  function syncLens() {
    document.querySelectorAll('.lens-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.lens === state.lens));
    // Fora da Eficiência, a lente dita a ordem → desabilita sort-select/dir.
    const lensActive = state.lens !== 'eficiencia';
    const sel = document.getElementById('sort');
    const dir = document.getElementById('sort-dir');
    if (sel) sel.disabled = lensActive;
    if (dir) dir.disabled = lensActive;
  }
```

- [ ] **Step 4: `app.js` — escolher sorter por lente + passar lente p/ `cardHtml`.** Em `applyFilters`, substituir:
```js
    // Com um chip competitivo ranqueável ativo, ordena pelo rank daquela dimensão (melhor primeiro).
    const sorter = (state.special && COMP_RANK_KEYS.includes(state.special))
      ? competitiveRankSorter(state.special)
      : getSorter(state.sort, state.dirRev);
    rows = rows.slice().sort(sorter);

    const list = document.getElementById('list');
    list.innerHTML = rows.map(cardHtml).join('');
```
por:
```js
    // Fora da Eficiência, a lente vence a ordenação; nela, mantém o sort-select / chip competitivo.
    let sorter;
    if (state.lens !== 'eficiencia') {
      sorter = lensSorter(state.lens);
    } else if (state.special && COMP_RANK_KEYS.includes(state.special)) {
      sorter = competitiveRankSorter(state.special);
    } else {
      sorter = getSorter(state.sort, state.dirRev);
    }
    rows = rows.slice().sort(sorter);

    const list = document.getElementById('list');
    list.innerHTML = rows.map(e => cardHtml(e, state.lens)).join('');
```

- [ ] **Step 5: `app.js` — chamar `renderLensSelector` no boot.** Em `boot`, substituir:
```js
      renderCounts();
      renderChips();
      renderSortOptions();
      applyFilters();
```
por:
```js
      renderCounts();
      renderChips();
      renderSortOptions();
      renderLensSelector();
      applyFilters();
```

- [ ] **Step 6: `index.html` — markup do seletor.** Dentro de `<div class="toolbar-wrap">`, logo **antes de** `<div class="toolbar">`, inserir:
```html
          <div class="lens-bar" id="lens"></div>
```

- [ ] **Step 7: `index.html` — CSS.** Logo **antes de** `/* Toolbar sticky:` (ou em qualquer ponto do `<style>`), adicionar:
```css
/* Seletor de lente por objetivo */
.lens-bar { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.lens-btn {
  font-family: inherit; font-size: 16px; line-height: 1;
  background: #fff; color: var(--tinta);
  border: 2px solid var(--preto); border-radius: 6px;
  box-shadow: 0 2px 0 var(--preto);
  padding: 6px 9px; cursor: pointer;
}
.lens-btn:active { transform: translateY(2px); box-shadow: none; }
.lens-btn.active { background: var(--azul-lente); color: #fff; }
.sort-select:disabled, .sort-dir:disabled { opacity: .45; cursor: not-allowed; }

/* Rótulo de categoria por card */
.pk-category {
  font-family: 'Press Start 2P', monospace; font-size: 8px; line-height: 1.5;
  text-transform: uppercase; align-self: flex-start;
  background: #fff; border: 2px solid var(--preto); border-radius: 6px; padding: 4px 6px;
}
.cat-invest   { color: var(--investir); }
.cat-trophy   { color: var(--dourado); }
.cat-keep     { color: var(--manter); }
.cat-transfer { color: var(--transferir); }
.cat-feed     { color: var(--laranja); }

/* Quebra de scores no detalhe */
.pk-scores { font-size: 15px; line-height: 1.3; color: var(--tinta-fraca); padding: 4px 0; }
```

- [ ] **Step 8: `sw.js` — bump do cache.** Substituir:
```js
const CACHE = 'pokemon-leo-v21';
```
por:
```js
const CACHE = 'pokemon-leo-v22';
```
(Não mexer em `ASSETS` — nenhum arquivo novo é servido.)

- [ ] **Step 9: Run the WHOLE suite (garante que app/index/sw não quebraram nada importável)**

Run: `cd pokemon && npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add pokemon/app.js pokemon/index.html pokemon/sw.js
git commit -m "feat(pokemon): seletor de lente na toolbar + wiring + bump sw v22 (Fase 5)"
```

---

## Task 5: Verificação no navegador (obrigatória) + PR

- [ ] **Step 1: Subir o preview servindo a RAIZ DO REPO** (o worktree fica sob ela em `.claude/worktrees/`). Usar `preview_start`. **Confirmar qual diretório está sendo servido** (gotcha: o preview MCP pode servir a main, não o worktree).

- [ ] **Step 2: Abrir o worktree** em
`http://localhost:<porta>/.claude/worktrees/worktree-pokemon-fase5-categorias/pokemon/?cb=<timestamp>`.
**Desregistrar o service worker + limpar caches** antes (senão serve `index.html` velho):
`preview_eval`:
```js
(async () => {
  if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k);
  return 'cleared';
})()
```
depois recarregar com novo `?cb=`.

- [ ] **Step 3: Conferir no console** (`preview_console_logs`) que não há erro (ex.: `lensSorter is not defined`, `categorize is not defined`) — sintoma de ordem de script / cache velho.

- [ ] **Step 4: Verificar comportamento** (`preview_snapshot` / `preview_click`):
  - Seletor de lente aparece com 4 botões; `🎯 Eficiência` ativo por padrão.
  - Cards mostram o rótulo de categoria (ex.: "Investir só PvE", "Guardar pro futuro").
  - Trocar para `⚔️ PvP` / `✨ Coleção` / `🍬 XP` **reordena a lista E muda os rótulos**; o `sort-select`/`sort-dir` ficam esmaecidos (disabled) fora da Eficiência.
  - Buscar "Gyarados" e expandir: confirmar categoria "Investir só PvE" na Eficiência (se o Gyarados real de Leo bater o caso) e a quebra de scores no detalhe.
  - Contagens dos baldes não estão todas vazias nem transbordando (rodar o probe abaixo p/ contagens exatas).

- [ ] **Step 5: Calibração ao vivo (contagens dos baldes).** Rodar, de `pokemon/`, um probe Node que imprime quantos mons caem em cada categoria por lente (criar arquivo temporário, rodar, apagar):
```js
// pokemon/_tmp_counts.js
const { analyze, categorize } = require('./lib/analysis.js');
const { getPokemonSize, getPokemonSizeScalar } = require('./sizes.js');
const refdata = require('./lib/refdata.js');
const { buildSpeciesIndex } = require('./lib/meta/match.js');
const meta = { speciesIndex: buildSpeciesIndex(require('./data/species.json')),
  movesPt: require('./data/moves_pt.json'), pvpRanks: require('./data/pvp_ranks.json'),
  pveRanks: require('./data/pve_ranks.json'), cpm: require('./data/cpm.json'), moves: require('./data/moves.json') };
const list = analyze(require('./colecao.json').fileData, getPokemonSize, refdata, getPokemonSizeScalar, meta);
for (const lens of ['eficiencia','pvp','colecao','xp']) {
  const c = {}; for (const e of list) { const k = categorize(e, lens).key; c[k] = (c[k]||0)+1; }
  console.log(lens, c);
}
```
Run: `cd pokemon && node _tmp_counts.js && rm _tmp_counts.js`
Mostrar as contagens a Leo. Se "Investir já" estiver vazio ou algum balde absurdo, **ajustar `T_INVEST`/`T_COL`** em `analysis.js` (e re-rodar a suíte) — é o ponto de calibração previsto no spec.

- [ ] **Step 6: Prova visual.** `preview_screenshot` da lista em duas lentes diferentes (Eficiência e PvP) mostrando rótulos diferentes; compartilhar com Leo.

- [ ] **Step 7: Suíte inteira final + push + PR.**
```bash
cd pokemon && npm test    # tudo verde, incluindo verdict.test.js
cd ../ && git push -u origin worktree-worktree-pokemon-fase5-categorias
gh pr create --base main --title "Pokémon Fase 5 — categorias de decisão + lente por objetivo" \
  --body "Implementa a Fase 5 do roadmap de revisão da recomendação. Categoria derivada (verdict intocado), categorize(e,lens), lensSorter, seletor de lente. Gyarados → Investir só PvE. Suíte inteira verde; verificado ao vivo (723 mons). sw v21→v22.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review (preenchido)

**Spec coverage:** §2 camada derivada → Task 1. §3 categorize/constantes/5 categorias/divergência/lentes → Task 1. §4 lensSorter → Task 2. §5 UI/seletor → Task 4. §6 render → Task 3. §7 wiring e.category → Task 1. §9 testes (category/sort/render/verdict intacto) → Tasks 1-3 + Task 5 step 7. §10 infra sw v22 → Task 4. §11 verificação navegador → Task 5. Sem lacunas.

**Placeholder scan:** nenhum TBD/TODO; todo passo de código tem o código real.

**Type consistency:** `categorize(e, lens) → {key,label}` usado igual em analysis/render/testes. `lensSorter(lens)` idem. Chaves de categoria (`invest_both`/`invest_pve`/`invest_pvp`/`invest`/`trophy`/`keep`/`transfer`/`feed`) consistentes entre `categorize`, `CATEGORY_ICON`/`CATEGORY_CLASS` e os testes. `state.lens` valores (`eficiencia`/`pvp`/`colecao`/`xp`) consistentes entre `LENSES`, `loadLens`, `lensSorter`, `categorize`.
