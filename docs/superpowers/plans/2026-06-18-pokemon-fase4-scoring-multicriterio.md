# Fase 4 — Scoring multicritério por objetivo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar `lib/meta/score.js` (`PokeScore`), um módulo puro que combina `pvp.js`/`pve.js`/`cost.js` em scores por objetivo (`scorePvP[liga]`, `scorePvE`, `scoreColecao`), e expô-los em `analysis.js` (`e.scores`) sem mudar veredito/ação/ordenação.

**Architecture:** Módulo dual browser+Node no padrão dos demais `lib/meta/*`. Forma do score: `meta × qualidade-da-cópia × prontidão ÷ custo-escalar`, todos os fatores em `[0,1]` (×100 no fim). `PokeScore.scoreMon(e, meta)` consome os objetos `pvpMeta`/`pveMeta` já calculados por `analyze` e chama `PokeCost.estimate` uma vez por objetivo. `analyze` anexa `e.scores`; nada mais muda.

**Tech Stack:** Vanilla JS (ES5-ish, igual ao resto de `lib/`), `node:test`, sem dependências de runtime.

**Spec:** `docs/superpowers/specs/2026-06-18-pokemon-fase4-scoring-multicriterio-design.md`

**Baseline:** 261 testes verdes (rodar `npm test` de dentro de `pokemon/`).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `pokemon/lib/meta/score.js` | **novo** — `PokeScore`: funções-folha (`rankDecay`, `qualityPve`, `costScalar`, `readiness`, `scoreColecao`) + `scorePvpLeague`/`scorePve` + agregador `scoreMon`. |
| `pokemon/lib/analysis.js` | importa `PokeScore`; `enrichOne` ganha `scores:null`; `analyze` passada 1 anexa `e.scores`. |
| `pokemon/test/score.test.js` | **novo** — testes das folhas + aceite ponta-a-ponta (Shadow Gyarados) + degradação. |
| `pokemon/index.html` | `<script>` de `score.js` entre `cost.js` e `analysis.js`. |
| `pokemon/sw.js` | bump `CACHE` `v20→v21`; `'./lib/meta/score.js'` em `ASSETS`. |

**Convenções obrigatórias (CLAUDE.md):**
- Padrão de módulo dual: `module.exports` no Node, global (`root.PokeScore = api`) no browser.
- Todos os comandos `npm test` rodam **de dentro de `pokemon/`**.
- `score.js` importa `PokeCost` pela mesma cadeia `require`/global que `cost.js` usa p/ `PokePvp`.

---

## Task 1: Esqueleto do módulo `score.js` + `rankDecay`

**Files:**
- Create: `pokemon/lib/meta/score.js`
- Test: `pokemon/test/score.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Criar `pokemon/test/score.test.js`:

```js
// pokemon/test/score.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const Score = require('../lib/meta/score.js');

test('rankDecay: rank 1 → 1, decai monotônico, rank inválido → 0', () => {
  assert.strictEqual(Score.rankDecay(1, 20), 1);
  assert.ok(Score.rankDecay(10, 20) < Score.rankDecay(5, 20));
  assert.ok(Score.rankDecay(32, 20) > 0 && Score.rankDecay(32, 20) < 0.5);
  assert.strictEqual(Score.rankDecay(null, 20), 0);
  assert.strictEqual(Score.rankDecay(0, 20), 0);
  assert.strictEqual(Score.rankDecay(undefined, 12), 0);
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd pokemon && npm test 2>&1 | grep -A2 score.test`
Expected: FAIL — `Cannot find module '../lib/meta/score.js'`.

- [ ] **Step 3: Implementação mínima**

Criar `pokemon/lib/meta/score.js`:

```js
// pokemon/lib/meta/score.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokeScore = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // PokeCost: reusa estimate/format (custo de investimento — Fase 3).
  var PokeCost = (typeof require === 'function')
    ? require('./cost.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokeCost : null);

  // Constantes de calibração (ajustáveis; os testes checam ordem relativa, não absolutos).
  var TAU_PVP = 20;        // decaimento do speciesRank PvP
  var TAU_PVE = 12;        // decaimento do erRank PvE
  var MOVESET_MISS = 0.5;  // prontidão quando falta o moveset-alvo
  var CANDY_W = 250, XL_W = 1000, TM_W = 2000, ELITE_W = 10000;  // poeira-equivalente
  var COST_NORM = 50000;   // normalização do custo-escalar

  function _clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  // META: decaimento exponencial de um rank (1 = melhor). Rank inválido/null → 0.
  function rankDecay(rank, tau) {
    if (typeof rank !== 'number' || !(rank >= 1)) return 0;
    return Math.exp(-(rank - 1) / tau);
  }

  return {
    TAU_PVP, TAU_PVE, MOVESET_MISS, CANDY_W, XL_W, TM_W, ELITE_W, COST_NORM,
    rankDecay,
  };
});
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: PASS (1 teste).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/score.js pokemon/test/score.test.js
git commit -m "feat(pokemon): score.js esqueleto + rankDecay (Fase 4)"
```

---

## Task 2: `qualityPve` (qualidade da cópia ponderada em ataque)

**Files:**
- Modify: `pokemon/lib/meta/score.js`
- Test: `pokemon/test/score.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `pokemon/test/score.test.js`:

```js
test('qualityPve: ponderada em ataque; hundo ≈ 15/x/x p/ base de ataque alta', () => {
  // Gyarados atkBase 237: hundo (iv 15) = 252/252 = 1.0; iv 0 = 237/252 ≈ 0.94.
  assert.strictEqual(Score.qualityPve(237, 15), 1);
  assert.ok(Score.qualityPve(237, 0) > 0.93);            // a "ironia": atk IV quase não muda PvE
  assert.ok(Score.qualityPve(237, 15) - Score.qualityPve(237, 0) < 0.07);
  assert.strictEqual(Score.qualityPve(null, 15), 0);     // sem base → 0
  assert.strictEqual(Score.qualityPve(0, 15), 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: FAIL — `Score.qualityPve is not a function`.

- [ ] **Step 3: Implementação mínima**

Em `pokemon/lib/meta/score.js`, **antes** do `return`, adicionar a função:

```js
  // QUALIDADE PvE ponderada em ataque: (atkBase + atkIv) / (atkBase + 15). Base domina
  // → hundo ≈ 15/x/x (a "ironia": o 100% é quase desperdiçado no único modo onde a espécie é útil).
  function qualityPve(atkBase, atkIv) {
    if (typeof atkBase !== 'number' || atkBase <= 0) return 0;
    var iv = (typeof atkIv === 'number') ? atkIv : 0;
    return _clamp01((atkBase + iv) / (atkBase + 15));
  }
```

E adicionar `qualityPve` ao objeto `return`:

```js
  return {
    TAU_PVP, TAU_PVE, MOVESET_MISS, CANDY_W, XL_W, TM_W, ELITE_W, COST_NORM,
    rankDecay, qualityPve,
  };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/score.js pokemon/test/score.test.js
git commit -m "feat(pokemon): score.qualityPve (ponderada em ataque)"
```

---

## Task 3: `costScalar` (reduz PokeCost.estimate a um escalar ≥ 1)

**Files:**
- Modify: `pokemon/lib/meta/score.js`
- Test: `pokemon/test/score.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `pokemon/test/score.test.js`:

```js
test('costScalar: null → 1; cresce com cada recurso; sempre ≥ 1', () => {
  assert.strictEqual(Score.costScalar(null), 1);
  assert.strictEqual(Score.costScalar({ dust: 0, candy: 0, xlCandy: 0, tm: { normal: 0, elite: 0 } }), 1);
  const base = Score.costScalar({ dust: 50000, candy: 0, xlCandy: 0, tm: { normal: 0, elite: 0 } });
  assert.ok(base > 1);
  // cada recurso a mais encarece
  assert.ok(Score.costScalar({ dust: 50000, candy: 100, xlCandy: 0, tm: { normal: 0, elite: 0 } }) > base);
  assert.ok(Score.costScalar({ dust: 50000, candy: 0, xlCandy: 50, tm: { normal: 0, elite: 0 } }) > base);
  assert.ok(Score.costScalar({ dust: 50000, candy: 0, xlCandy: 0, tm: { normal: 2, elite: 0 } }) > base);
  // Elite TM pesa mais que TM normal
  const n = Score.costScalar({ dust: 0, candy: 0, xlCandy: 0, tm: { normal: 1, elite: 0 } });
  const e = Score.costScalar({ dust: 0, candy: 0, xlCandy: 0, tm: { normal: 0, elite: 1 } });
  assert.ok(e > n);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: FAIL — `Score.costScalar is not a function`.

- [ ] **Step 3: Implementação mínima**

Em `score.js`, antes do `return`, adicionar:

```js
  // CUSTO-ESCALAR (≥1): poeira-equivalente do est do PokeCost. null/zero → 1 (sem penalidade).
  function costScalar(est) {
    if (!est) return 1;
    var tm = est.tm || { normal: 0, elite: 0 };
    var dustEq = (est.dust || 0)
               + (est.candy || 0)   * CANDY_W
               + (est.xlCandy || 0) * XL_W
               + (tm.normal || 0)   * TM_W
               + (tm.elite || 0)    * ELITE_W;
    return 1 + dustEq / COST_NORM;
  }
```

Adicionar `costScalar` ao `return`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/score.js pokemon/test/score.test.js
git commit -m "feat(pokemon): score.costScalar (custo → escalar ≥ 1)"
```

---

## Task 4: `readiness` (prontidão = fatorMoveset × fatorNível)

**Files:**
- Modify: `pokemon/lib/meta/score.js`
- Test: `pokemon/test/score.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `pokemon/test/score.test.js`:

```js
test('readiness: moveset ok + nível-alvo → 1; falta moveset ou nível baixo derruba', () => {
  // pronto: tem moveset, fromLevel == toLevel
  assert.strictEqual(Score.readiness(true, { fromLevel: 40, toLevel: 40 }), 1);
  // falta moveset → cai p/ MOVESET_MISS (0.5)
  assert.strictEqual(Score.readiness(false, { fromLevel: 40, toLevel: 40 }), 0.5);
  // nível baixo: fromLevel/toLevel
  assert.ok(Math.abs(Score.readiness(true, { fromLevel: 20, toLevel: 40 }) - 0.5) < 1e-9);
  // combina: sem moveset E nível baixo
  assert.ok(Math.abs(Score.readiness(false, { fromLevel: 20, toLevel: 40 }) - 0.25) < 1e-9);
  // sem est (cost null) → fatorNível = 1
  assert.strictEqual(Score.readiness(true, null), 1);
  assert.strictEqual(Score.readiness(false, null), 0.5);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: FAIL — `Score.readiness is not a function`.

- [ ] **Step 3: Implementação mínima**

Em `score.js`, antes do `return`, adicionar:

```js
  // PRONTIDÃO (0,1]: fatorMoveset × fatorNível. est (do PokeCost) dá from/to nível.
  function readiness(movesetOk, est) {
    var fMove = movesetOk ? 1 : MOVESET_MISS;
    var fLvl = 1;
    if (est && typeof est.fromLevel === 'number' && typeof est.toLevel === 'number' && est.toLevel > 0)
      fLvl = _clamp01(est.fromLevel / est.toLevel);
    return fMove * fLvl;
  }
```

Adicionar `readiness` ao `return`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/score.js pokemon/test/score.test.js
git commit -m "feat(pokemon): score.readiness (moveset × nível)"
```

---

## Task 5: `scoreColecao` (OR probabilístico das flags de raridade)

**Files:**
- Modify: `pokemon/lib/meta/score.js`
- Test: `pokemon/test/score.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `pokemon/test/score.test.js`:

```js
test('scoreColecao: [0,1]; empilha; sem flags → 0; nearPerfect não dobra com hundo', () => {
  assert.strictEqual(Score.scoreColecao({}), 0);
  const hundo = Score.scoreColecao({ isHundo: true });
  assert.ok(Math.abs(hundo - 0.90) < 1e-9);
  const shinyHundo = Score.scoreColecao({ isHundo: true, isShiny: true });
  assert.ok(shinyHundo > hundo && shinyHundo <= 1);      // empilha, mas fica ≤ 1
  // isNearPerfect é ignorado quando já é hundo (não soma a perfeição duas vezes)
  const both = Score.scoreColecao({ isHundo: true, isNearPerfect: true });
  assert.ok(Math.abs(both - hundo) < 1e-9);
  // near-perfect sozinho conta
  assert.ok(Score.scoreColecao({ isNearPerfect: true }) > 0);
  assert.strictEqual(Score.scoreColecao(null), 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: FAIL — `Score.scoreColecao is not a function`.

- [ ] **Step 3: Implementação mínima**

Em `score.js`, adicionar a tabela de pesos junto às outras constantes (logo após `COST_NORM`):

```js
  // Pesos de colecionismo (OR probabilístico). Maior = mais raro/valioso.
  var COLECAO_W = {
    isHundo: 0.90, isShiny: 0.85, isNearPerfect: 0.60, isLegendary: 0.60,
    isCostume: 0.55, isExtremeSize: 0.50, isRegional: 0.50, isLucky: 0.40,
    isShadow: 0.30, isXSComfort: 0.25, isXLComfort: 0.25, isTradeEvo: 0.20,
    hasSecondCharge: 0.10,
  };
```

E, antes do `return`, a função:

```js
  // scoreColecao: OR probabilístico das flags ativas → [0,1], empilha com retorno decrescente.
  function scoreColecao(e) {
    if (!e) return 0;
    var keep = 1;
    for (var k in COLECAO_W) {
      if (k === 'isNearPerfect' && e.isHundo) continue;   // não dobra a "perfeição"
      if (e[k]) keep *= (1 - COLECAO_W[k]);
    }
    return 1 - keep;
  }
```

Adicionar `COLECAO_W` e `scoreColecao` ao `return`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/score.js pokemon/test/score.test.js
git commit -m "feat(pokemon): score.scoreColecao (raridade, OR probabilístico)"
```

---

## Task 6: `scorePvpLeague` + `scorePve` (helpers internos de custo/golpes)

**Files:**
- Modify: `pokemon/lib/meta/score.js`
- Test: `pokemon/test/score.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `pokemon/test/score.test.js` (testa as duas funções por liga/objetivo com dados reais; usa o melhor da espécie p/ não depender de IVs sintéticos):

```js
const PokePvp = require('../lib/meta/pvp.js');
const PokePve = require('../lib/meta/pve.js');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

function realMeta() {
  return {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    pvpRanks: require('../data/pvp_ranks.json'),
    pveRanks: require('../data/pve_ranks.json'),
    cpm: require('../data/cpm.json'),
    moves: require('../data/moves.json'),
  };
}

// Monta um mon enriquecido mínimo (o que score.js consome) com pvpMeta/pveMeta reais.
function makeMon(meta, over) {
  const e = Object.assign({
    speciesId: 'gyarados',
    ivs: { atk: 15, def: 15, sta: 15 },
    ivPct: 100,
    isShadow: true,
    moveIds: ['WATERFALL', 'HYDRO_PUMP'],   // set de raid capturado
    eliteMoves: [],
  }, over || {});
  const base = meta.speciesIndex.byId[e.speciesId].baseStats;
  const cpmAt25 = meta.cpm.find(x => x.level === 25).cpm;
  if (typeof e.cp !== 'number') e.cp = PokePvp.cpFor(base, e.ivs, cpmAt25);
  e.pvpMeta = PokePvp.evalMon(e, meta);
  e.pveMeta = PokePve.evalMon(e, meta);
  return e;
}

test('scorePvpLeague: espécie fora do meta da liga → 0', () => {
  const meta = realMeta();
  const e = makeMon(meta);
  // Gyarados Sombrio não tem entrada great → score 0.
  assert.strictEqual(Score.scorePvpLeague(e, meta, 'great'), 0);
  // master existe (rank 32) → score > 0.
  assert.ok(Score.scorePvpLeague(e, meta, 'master') > 0);
});

test('scorePve: atacante (erRank válido) → > 0; sem papel atacante → 0', () => {
  const meta = realMeta();
  const e = makeMon(meta);
  assert.ok(Score.scorePve(e, meta) > 0);
  // sem pveMeta → 0
  assert.strictEqual(Score.scorePve({ pveMeta: null }, meta), 0);
  // pveMeta só defensivo → 0
  assert.strictEqual(Score.scorePve({ pveMeta: { raid: false, pve: false, gymAtk: false, gymDef: true } }, meta), 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: FAIL — `Score.scorePvpLeague is not a function`.

- [ ] **Step 3: Implementação mínima**

Em `score.js`, antes do `return`, adicionar os helpers de golpes faltantes, de baseStats/estimate, e as duas funções de score:

```js
  // --- golpes faltantes p/ o custo de TM (espelha analysis.js; mantém score.js puro) ---
  function _missingPvp(moveIds, rec) {
    if (!rec || rec.length < 2) return [];
    var mine = moveIds || [], out = [];
    if (mine.indexOf(rec[0]) < 0) out.push(rec[0]);          // falta o rápido
    var charged = rec.slice(1);
    if (!charged.some(function (c) { return mine.indexOf(c) >= 0; }))
      out.push.apply(out, charged);                          // não tem nenhum carregado
    return out;
  }
  function _missingPve(moveIds, rec) {
    if (!rec || rec.length < 2) return [];
    var mine = moveIds || [];
    return rec.filter(function (id) { return mine.indexOf(id) < 0; });   // PvE exige os dois
  }

  function _baseStats(e, meta) {
    var byId = meta && meta.speciesIndex && meta.speciesIndex.byId;
    var sp = byId && e && byId[e.speciesId];
    return (sp && sp.baseStats) || null;
  }

  // Uma estimativa de custo p/ o objetivo (context) — ou null (degradação graciosa).
  function _estimate(e, meta, context, missing) {
    if (!PokeCost || !meta || !meta.cpm || !e) return null;
    var bs = _baseStats(e, meta);
    if (!bs || !e.ivs || typeof e.cp !== 'number') return null;
    return PokeCost.estimate({
      baseStats: bs, ivs: e.ivs, cp: e.cp, isShadow: !!e.isShadow,
      context: context, missingMoves: missing || [], eliteMoves: e.eliteMoves || [], cpm: meta.cpm,
    });
  }

  // score PvP de uma liga: META(rank decaído) × QUALIDADE(spPct) × PRONTIDÃO ÷ CUSTO. ×100.
  function scorePvpLeague(e, meta, league) {
    var L = e && e.pvpMeta && e.pvpMeta[league];
    if (!L || !L.isMeta || typeof L.speciesRank !== 'number') return 0;
    var metaF = rankDecay(L.speciesRank, TAU_PVP);
    var qual = (typeof L.spPct === 'number') ? _clamp01(L.spPct) : 0;
    var missing = _missingPvp(e.moveIds, L.moveset);
    var est = _estimate(e, meta, { kind: 'pvp', league: league }, missing);
    var ready = readiness(L.movesetOk, est);
    return metaF * qual * ready / costScalar(est) * 100;
  }

  // score PvE: META(erRank decaído) × QUALIDADE(ataque) × PRONTIDÃO ÷ CUSTO. ×100.
  function scorePve(e, meta) {
    var P = e && e.pveMeta;
    if (!P) return 0;
    if (!(P.raid || P.pve || P.gymAtk)) return 0;            // gym_def (defensivo) não pontua aqui
    var bt = (P.bestType && P.byType) ? P.byType[P.bestType] : null;
    var erRank = (bt && typeof bt.erRank === 'number') ? bt.erRank : null;
    if (erRank == null) return 0;
    var metaF = rankDecay(erRank, TAU_PVE);
    var bs = _baseStats(e, meta);
    var qual = qualityPve(bs ? bs.atk : null, (e.ivs && typeof e.ivs.atk === 'number') ? e.ivs.atk : 0);
    var missing = _missingPve(e.moveIds, P.bestMoveset);
    var est = _estimate(e, meta, { kind: 'pve' }, missing);
    var ready = readiness(P.movesetOk, est);
    return metaF * qual * ready / costScalar(est) * 100;
  }
```

Adicionar `scorePvpLeague` e `scorePve` ao `return`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: PASS (7 testes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/score.js pokemon/test/score.test.js
git commit -m "feat(pokemon): score.scorePvpLeague + scorePve (consomem pvp/pve/cost)"
```

---

## Task 7: `scoreMon` (agregador) + ACEITE do Shadow Gyarados

**Files:**
- Modify: `pokemon/lib/meta/score.js`
- Test: `pokemon/test/score.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `pokemon/test/score.test.js` (reusa `realMeta`/`makeMon` da Task 6):

```js
test('scoreMon: shape completo (pvp por liga, pve, colecao, best)', () => {
  const meta = realMeta();
  const e = makeMon(meta);
  const s = Score.scoreMon(e, meta);
  assert.ok(s && s.pvp && typeof s.pvp.great === 'number'
              && typeof s.pvp.ultra === 'number' && typeof s.pvp.master === 'number');
  assert.strictEqual(typeof s.pve, 'number');
  assert.strictEqual(typeof s.colecao, 'number');
  assert.ok(s.best && typeof s.best.objective === 'string' && typeof s.best.value === 'number');
  assert.strictEqual(Score.scoreMon(null, meta), null);
});

test('ACEITE: Shadow Gyarados hundo (set de raid) → scorePvE > scorePvP[master]', () => {
  const meta = realMeta();
  const e = makeMon(meta);          // gyarados Sombrio 15/15/15, moveIds Waterfall+Hydro Pump
  const s = Score.scoreMon(e, meta);
  assert.ok(s.pve > s.pvp.master,
    'PvE (' + s.pve.toFixed(3) + ') deveria superar PvP master (' + s.pvp.master.toFixed(3) + ')');
  // best de INVESTIMENTO (colecao fora) = PvE
  assert.strictEqual(s.best.objective, 'pve');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: FAIL — `Score.scoreMon is not a function`.

- [ ] **Step 3: Implementação mínima**

Em `score.js`, antes do `return`, adicionar:

```js
  var LEAGUES = ['great', 'ultra', 'master'];

  // Agregador: scores por objetivo + melhor objetivo de INVESTIMENTO (colecao fica fora do best).
  function scoreMon(e, meta) {
    if (!e) return null;
    var pvp = {};
    LEAGUES.forEach(function (lg) { pvp[lg] = scorePvpLeague(e, meta, lg); });
    var pve = scorePve(e, meta);
    var colecao = scoreColecao(e) * 100;
    var cands = [
      { objective: 'pvp_great',  value: pvp.great },
      { objective: 'pvp_ultra',  value: pvp.ultra },
      { objective: 'pvp_master', value: pvp.master },
      { objective: 'pve',        value: pve },
    ];
    var best = cands[0];
    for (var i = 1; i < cands.length; i++) if (cands[i].value > best.value) best = cands[i];
    return { pvp: pvp, pve: pve, colecao: colecao,
             best: { objective: best.objective, value: best.value } };
  }
```

Adicionar `LEAGUES` e `scoreMon` ao `return`. O `return` final deve ficar:

```js
  return {
    TAU_PVP, TAU_PVE, MOVESET_MISS, CANDY_W, XL_W, TM_W, ELITE_W, COST_NORM, COLECAO_W, LEAGUES,
    rankDecay, qualityPve, costScalar, readiness, scoreColecao,
    scorePvpLeague, scorePve, scoreMon,
  };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: PASS (9 testes) — inclusive o ACEITE.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/score.js pokemon/test/score.test.js
git commit -m "feat(pokemon): score.scoreMon + aceite Shadow Gyarados (PvE > PvP master)"
```

---

## Task 8: Fiar `PokeScore` em `analysis.js` (expor `e.scores`)

**Files:**
- Modify: `pokemon/lib/analysis.js` (imports ~linha 20; `enrichOne` ~linha 162; `analyze` ~linha 609)
- Test: `pokemon/test/score.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Acrescentar a `pokemon/test/score.test.js` (e2e leve pelo `analyze` real — confirma o wiring; não depende de casar nome PT de golpe):

```js
const { analyze } = require('../lib/analysis.js');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');

test('analyze: anexa e.scores com shape de objetivos (wiring)', () => {
  const meta = realMeta();
  const fd = { g: { mon_name: 'Gyarados', mon_number: 130, mon_cp: 2700,
                    mon_attack: 15, mon_defence: 15, mon_stamina: 15, mon_height: 6.5,
                    mon_alignment: 'SHADOW', mon_isShiny: 'NO', mon_isLucky: 'NO',
                    mon_move_1: 'Cachoeira', mon_move_2: "Jato d'Água" } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.ok(e.scores, 'e.scores deveria existir');
  assert.strictEqual(typeof e.scores.pve, 'number');
  assert.ok(e.scores.pvp && typeof e.scores.pvp.master === 'number');
  assert.ok(e.scores.best && typeof e.scores.best.objective === 'string');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: FAIL — `e.scores` é `undefined` (analyze ainda não anexa).

- [ ] **Step 3: Implementação mínima**

**3a.** Em `pokemon/lib/analysis.js`, após o bloco do `PokeCost` (logo depois da linha 22, antes do `var TYPE_PT`), adicionar o import dual:

```js
  var PokeScore = (typeof require === 'function')
    ? require('./meta/score.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokeScore : null);
```

**3b.** Em `enrichOne`, na seção "preenchidos por analyze", logo após a linha `action: null,` (final do objeto retornado, ~linha 162), adicionar o campo:

```js
      action: null,
      // Fase 4 — scores multicritério por objetivo (preenchido por analyze).
      scores: null,
```

**3c.** Em `analyze`, na **passada 1**, logo após a linha `e.tags = computeTags(e);` (~linha 618), adicionar:

```js
      e.tags = computeTags(e);
      e.scores = (meta && PokeScore) ? PokeScore.scoreMon(e, meta) : null;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/score.test.js`
Expected: PASS (10 testes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/score.test.js
git commit -m "feat(pokemon): analyze expõe e.scores (Fase 4)"
```

---

## Task 9: Infra — `index.html`, `sw.js` (bump + ASSETS)

**Files:**
- Modify: `pokemon/index.html:344` (entre `cost.js` e `analysis.js`)
- Modify: `pokemon/sw.js` (`CACHE` e lista `ASSETS`)

- [ ] **Step 1: `index.html` — adicionar o `<script>`**

Em `pokemon/index.html`, entre a linha do `cost.js` e a do `analysis.js`:

```html
<script src="./lib/meta/cost.js"></script>
<script src="./lib/meta/score.js"></script>
<script src="./lib/analysis.js"></script>
```

- [ ] **Step 2: `sw.js` — bump do cache**

Em `pokemon/sw.js`, trocar:

```js
const CACHE = 'pokemon-leo-v20';
```
por:
```js
const CACHE = 'pokemon-leo-v21';
```

- [ ] **Step 3: `sw.js` — adicionar `score.js` a `ASSETS`**

Localizar a entrada `'./lib/meta/cost.js'` na lista `ASSETS` e adicionar a linha de `score.js` logo depois:

```js
  './lib/meta/cost.js',
  './lib/meta/score.js',
```

(Se a entrada do `cost.js` não existir na lista, adicionar ambas as linhas junto às outras `'./lib/meta/*.js'`.)

- [ ] **Step 4: Verificar consistência da infra**

Run:
```bash
cd pokemon && grep -n "score.js" index.html sw.js && grep -n "pokemon-leo-v" sw.js
```
Expected: `index.html` mostra o `<script>` de `score.js`; `sw.js` mostra `score.js` em ASSETS e `CACHE = 'pokemon-leo-v21'`.

- [ ] **Step 5: Commit**

```bash
git add pokemon/index.html pokemon/sw.js
git commit -m "chore(pokemon): servir score.js (script + sw v21/ASSETS)"
```

---

## Task 10: Suíte inteira + verificação no browser

**Files:** nenhum (verificação).

- [ ] **Step 1: Rodar a suíte INTEIRA**

Run: `cd pokemon && npm test 2>&1 | tail -8`
Expected: `pass 271` (261 baseline + 10 novos), `fail 0`. (O número exato de novos pode variar se algum teste agrupar asserts — o importante é **0 falhas** e o ACEITE verde.)

- [ ] **Step 2: Smoke do módulo no "browser" (sandbox vm sem `module`)**

Confirma que o padrão dual funciona no lado browser (sem `require`): carrega `pvp.js`→`pve.js`→`cost.js`→`score.js` como globais e roda `scoreMon` num sandbox `vm` SEM `module` (senão o UMD pega o branch Node).

Run:
```bash
cd pokemon && node -e '
const vm = require("vm"), fs = require("fs");
const ctx = { globalThis: {}, Math: Math, console: console };
ctx.globalThis = ctx;                        // self-ref p/ o factory
["lib/meta/pvp.js","lib/meta/pve.js","lib/meta/cost.js","lib/meta/score.js"].forEach(f =>
  vm.runInContext(fs.readFileSync(f,"utf8"), vm.createContext(ctx), { filename: f }));
console.log("PokeScore global?", typeof ctx.PokeScore, "scoreMon?", typeof ctx.PokeScore.scoreMon);
const s = ctx.PokeScore.scoreColecao({ isHundo: true });
console.log("scoreColecao(hundo) =", s.toFixed ? s.toFixed(2) : s);
'
```
Expected: `PokeScore global? object scoreMon? function` e `scoreColecao(hundo) = 0.90`. (Prova que no browser `PokeScore` vira global e enxerga `PokeCost`/`PokePvp` por global, sem `require`.)

- [ ] **Step 3: Commit (se necessário)**

Nada a commitar se tudo passou. Caso o smoke revele bug do lado browser, corrigir em `score.js`, re-rodar Steps 1–2 e commitar a correção.

---

## Self-Review (preenchido pelo autor do plano)

- **Cobertura do spec:** §2 módulo/ordem de script → Tasks 1–9. §3.1 META (rankDecay) → T1+T6. §3.2 qualidade (qualityPve / spPct) → T2+T6. §3.3 prontidão → T4. §3.4 custo-escalar + missing moves → T3+T6. §4 scoreColecao → T5. §5 fiação analysis → T8. §6 infra (index/sw) → T9. §7 testes + aceite → distribuídos + T7/T10. §8 bordas (shadow/spPct null/custo zero) → cobertas em T6/T4/T3. §9 fora-de-escopo → respeitado (nenhuma task toca verdict/sort). §10 arquivos → T1–T9.
- **Placeholders:** nenhum — todo passo tem código/comando completo.
- **Consistência de tipos:** `scoreMon` retorna `{ pvp:{great,ultra,master}, pve, colecao, best:{objective,value} }` em T7; `e.scores` lê exatamente isso em T8; `best.objective` ∈ {pvp_*, pve} (colecao fora) consistente com o spec corrigido. `costScalar(est)` lê `est.{dust,candy,xlCandy,tm:{normal,elite}}` — mesma forma do retorno de `PokeCost.estimate`. `readiness(movesetOk, est)` lê `est.{fromLevel,toLevel}` — idem.
