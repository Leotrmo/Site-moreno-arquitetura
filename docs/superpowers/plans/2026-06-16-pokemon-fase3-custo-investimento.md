# Fase 3 — Modelo de custo de investimento · Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estimar o custo restante (poeira/doce/Doce XL + TM/Elite TM) por mon e exibi-lo, em números concretos enxutos, nas razões de ação FORTALECER / Ensinar-TM (e AGUARDAR_EVENTO/ROCKET), com sobretaxa de Sombrio.

**Architecture:** Novo módulo puro `lib/meta/cost.js` (global `PokeCost`) com tabela de custo embutida; reusa `PokePvp.cpFor`/`bestLevelUnderCap` para derivar nível atual (do CP) e nível-alvo. `lib/analysis.js` chama `PokeCost.estimate`/`format` dentro de `computeAction` e anexa um sufixo às razões; degrada para string vazia quando faltam dados (protege a suíte cross-file).

**Tech Stack:** Vanilla JS (padrão de módulo dual browser-global + `require`), testes `node:test`. Sem libs novas.

**Spec:** `docs/superpowers/specs/2026-06-16-pokemon-fase3-custo-investimento-design.md`

**Pré-requisitos já confirmados:**
- Branch/worktree: `claude/reverent-euclid-378ce3` (Fase 1+2 já merdadas; SW em `pokemon-leo-v19`).
- Todos os comandos rodam a partir de `pokemon/`.
- `pvp.js` exporta `cpFor`, `bestLevelUnderCap`, `CP_CAPS`, `LEVEL_CAP`.
- A tabela de custo foi corroborada (Bulbapedia + calculadora pública pogo-powerup);
  totais usados nos testes: `1→40 = 270.000 poeira / 304 doces`; `40→50 = 250.000 poeira / 296 Doce XL`; `20→40 = 225.000 poeira / 248 doces`.

---

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `pokemon/lib/meta/cost.js` | **Criar** | Módulo puro `PokeCost`: tabela de custo, `powerUpCost`, `levelForCp`, `tmCost`, `estimate`, `format`. |
| `pokemon/test/cost.test.js` | **Criar** | Testes unitários do `PokeCost`. |
| `pokemon/lib/analysis.js` | Modificar | Importar `PokeCost`; helper `_costSuffix`; anexar custo nas razões de FORTALECER/Ensinar-TM/AGUARDAR_*; threading de contexto em `_notReadyAction`. |
| `pokemon/test/verdict.test.js` | Modificar | Custo ponta-a-ponta (aparece em ação real) + não-regressão dos mons mínimos. |
| `pokemon/index.html` | Modificar | `<script src="./lib/meta/cost.js">` entre `pve.js` e `analysis.js`. |
| `pokemon/sw.js` | Modificar | Bump `CACHE` v19→v20 + `./lib/meta/cost.js` em `ASSETS`. |

---

## Task 1: `cost.js` — esqueleto dual + tabela + `powerUpCost`

**Files:**
- Create: `pokemon/lib/meta/cost.js`
- Test: `pokemon/test/cost.test.js`

- [ ] **Step 1: Write the failing test**

Criar `pokemon/test/cost.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const Cost = require('../lib/meta/cost.js');

test('powerUpCost: 20→40 não-Sombrio bate o total conhecido', () => {
  assert.deepStrictEqual(Cost.powerUpCost(20, 40, false), { dust: 225000, candy: 248, xlCandy: 0 });
});

test('powerUpCost: 40→50 usa Doce XL e zera doce comum', () => {
  assert.deepStrictEqual(Cost.powerUpCost(40, 50, false), { dust: 250000, candy: 0, xlCandy: 296 });
});

test('powerUpCost: Sombrio encarece (≈ +20% por power-up)', () => {
  const base = Cost.powerUpCost(20, 40, false);
  const sh = Cost.powerUpCost(20, 40, true);
  assert.strictEqual(sh.dust, 270000);        // 225000 * 1.2
  assert.ok(sh.candy > base.candy);           // doce também sobe
});

test('powerUpCost: from >= to → tudo zero', () => {
  assert.deepStrictEqual(Cost.powerUpCost(35, 35, false), { dust: 0, candy: 0, xlCandy: 0 });
  assert.deepStrictEqual(Cost.powerUpCost(40, 30, false), { dust: 0, candy: 0, xlCandy: 0 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cost.test.js`
Expected: FAIL — `Cannot find module '../lib/meta/cost.js'`.

- [ ] **Step 3: Write minimal implementation**

Criar `pokemon/lib/meta/cost.js`:

```js
// pokemon/lib/meta/cost.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokeCost = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // PokePvp: reusa cpFor / bestLevelUnderCap / CP_CAPS / LEVEL_CAP (matemática de CP/nível).
  var PokePvp = (typeof require === 'function')
    ? require('./pvp.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokePvp : null);

  // Custo por meio-nível (cada power-up = +0.5), pela banda do nível DE ORIGEM (maxFrom inclusive):
  // poeira/doce até L40; poeira/Doce XL de L40 a L50. Fonte: GAME_MASTER, corroborado por
  // Bulbapedia + calculadora pública pogo-powerup. Totais validados nos testes.
  var STEP_BANDS = [
    { maxFrom: 2.5,  dust: 200,   candy: 1,  xl: 0 },
    { maxFrom: 4.5,  dust: 400,   candy: 1,  xl: 0 },
    { maxFrom: 6.5,  dust: 600,   candy: 1,  xl: 0 },
    { maxFrom: 8.5,  dust: 800,   candy: 1,  xl: 0 },
    { maxFrom: 10.5, dust: 1000,  candy: 1,  xl: 0 },
    { maxFrom: 12.5, dust: 1300,  candy: 2,  xl: 0 },
    { maxFrom: 14.5, dust: 1600,  candy: 2,  xl: 0 },
    { maxFrom: 16.5, dust: 1900,  candy: 2,  xl: 0 },
    { maxFrom: 18.5, dust: 2200,  candy: 2,  xl: 0 },
    { maxFrom: 20.5, dust: 2500,  candy: 2,  xl: 0 },
    { maxFrom: 22.5, dust: 3000,  candy: 3,  xl: 0 },
    { maxFrom: 24.5, dust: 3500,  candy: 3,  xl: 0 },
    { maxFrom: 25.5, dust: 4000,  candy: 3,  xl: 0 },
    { maxFrom: 26.5, dust: 4000,  candy: 4,  xl: 0 },
    { maxFrom: 28.5, dust: 4500,  candy: 4,  xl: 0 },
    { maxFrom: 30.5, dust: 5000,  candy: 4,  xl: 0 },
    { maxFrom: 32.5, dust: 6000,  candy: 6,  xl: 0 },
    { maxFrom: 34.5, dust: 7000,  candy: 8,  xl: 0 },
    { maxFrom: 36.5, dust: 8000,  candy: 10, xl: 0 },
    { maxFrom: 38.5, dust: 9000,  candy: 12, xl: 0 },
    { maxFrom: 39.5, dust: 10000, candy: 15, xl: 0 },
    { maxFrom: 40.5, dust: 10000, candy: 0,  xl: 10 },
    { maxFrom: 41.5, dust: 11000, candy: 0,  xl: 10 },
    { maxFrom: 42.5, dust: 11000, candy: 0,  xl: 12 },
    { maxFrom: 43.5, dust: 12000, candy: 0,  xl: 12 },
    { maxFrom: 44.5, dust: 12000, candy: 0,  xl: 15 },
    { maxFrom: 45.5, dust: 13000, candy: 0,  xl: 15 },
    { maxFrom: 46.5, dust: 13000, candy: 0,  xl: 17 },
    { maxFrom: 47.5, dust: 14000, candy: 0,  xl: 17 },
    { maxFrom: 48.5, dust: 14000, candy: 0,  xl: 20 },
    { maxFrom: 49.5, dust: 15000, candy: 0,  xl: 20 },
  ];

  var SHADOW_MULT = 1.2;        // Sombrio: +20% poeira e doce, por power-up, arredondado p/ cima.
  var PVE_TARGET_LEVEL = 40;    // teto de investimento PvE (raid/gym_atk).

  function _stepBand(fromLevel) {
    for (var i = 0; i < STEP_BANDS.length; i++)
      if (fromLevel <= STEP_BANDS[i].maxFrom + 1e-9) return STEP_BANDS[i];
    return null;                // fromLevel > 49.5 → sem passo (já no teto).
  }

  // Custo p/ subir de fromLevel a toLevel (meios-níveis). from>=to → tudo 0.
  // Sombrio: ×1.2 por power-up, Math.ceil (igual ao jogo).
  function powerUpCost(fromLevel, toLevel, isShadow) {
    var dust = 0, candy = 0, xl = 0;
    for (var L = fromLevel; L < toLevel - 1e-9; L += 0.5) {
      var b = _stepBand(L);
      if (!b) break;
      if (isShadow) {
        dust  += Math.ceil(b.dust  * SHADOW_MULT);
        candy += Math.ceil(b.candy * SHADOW_MULT);
        xl    += Math.ceil(b.xl    * SHADOW_MULT);
      } else { dust += b.dust; candy += b.candy; xl += b.xl; }
    }
    return { dust: dust, candy: candy, xlCandy: xl };
  }

  return { STEP_BANDS, SHADOW_MULT, PVE_TARGET_LEVEL, powerUpCost };
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cost.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/cost.js pokemon/test/cost.test.js
git commit -m "feat(pokemon): cost.js — tabela de custo + powerUpCost (puro)"
```

---

## Task 2: `levelForCp` — nível atual derivado do CP

**Files:**
- Modify: `pokemon/lib/meta/cost.js`
- Test: `pokemon/test/cost.test.js`

- [ ] **Step 1: Write the failing test**

Adicionar a `pokemon/test/cost.test.js`:

```js
const PokePvp = require('../lib/meta/pvp.js');
const CPM = require('../data/cpm.json');

test('levelForCp: inverte o CP de volta ao nível (auto-consistente)', () => {
  const base = { atk: 237, def: 186, hp: 216 };   // Gyarados
  const ivs = { atk: 15, def: 15, sta: 15 };
  const cpmAt25 = CPM.find(e => e.level === 25).cpm;
  const cp = PokePvp.cpFor(base, ivs, cpmAt25);   // gera o CP no nível 25
  assert.strictEqual(Cost.levelForCp(base, ivs, cp, CPM), 25);
});

test('levelForCp: dados faltando → null', () => {
  assert.strictEqual(Cost.levelForCp(null, { atk: 0, def: 0, sta: 0 }, 100, CPM), null);
  assert.strictEqual(Cost.levelForCp({ atk: 1, def: 1, hp: 1 }, { atk: 0, def: 0, sta: 0 }, 'x', CPM), null);
  assert.strictEqual(Cost.levelForCp({ atk: 1, def: 1, hp: 1 }, { atk: 0, def: 0, sta: 0 }, 100, null), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cost.test.js`
Expected: FAIL — `Cost.levelForCp is not a function`.

- [ ] **Step 3: Write minimal implementation**

Em `pokemon/lib/meta/cost.js`, adicionar a função antes do `return`:

```js
  // Nível atual derivado do CP (o export não traz nível): nível cujo cpFor mais se aproxima do CP.
  function levelForCp(baseStats, ivs, cp, cpmList) {
    if (!baseStats || !ivs || typeof cp !== 'number' || !cpmList || !cpmList.length || !PokePvp) return null;
    var best = null, bestDiff = Infinity;
    for (var i = 0; i < cpmList.length; i++) {
      var diff = Math.abs(PokePvp.cpFor(baseStats, ivs, cpmList[i].cpm) - cp);
      if (diff < bestDiff) { bestDiff = diff; best = cpmList[i].level; }
    }
    return best;
  }
```

E incluir `levelForCp` no objeto de retorno:

```js
  return { STEP_BANDS, SHADOW_MULT, PVE_TARGET_LEVEL, powerUpCost, levelForCp };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cost.test.js`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/cost.js pokemon/test/cost.test.js
git commit -m "feat(pokemon): cost.levelForCp — nível atual via inversão do CP"
```

---

## Task 3: `tmCost` + `format`

**Files:**
- Modify: `pokemon/lib/meta/cost.js`
- Test: `pokemon/test/cost.test.js`

- [ ] **Step 1: Write the failing test**

Adicionar a `pokemon/test/cost.test.js`:

```js
test('tmCost: classifica faltantes em normal vs elite', () => {
  assert.deepStrictEqual(Cost.tmCost(['AQUA_TAIL', 'TWISTER'], ['AQUA_TAIL']), { normal: 1, elite: 1 });
  assert.deepStrictEqual(Cost.tmCost([], []), { normal: 0, elite: 0 });
  assert.deepStrictEqual(Cost.tmCost(['ICE_BEAM'], []), { normal: 1, elite: 0 });
});

test('format: enxuto, omite zeros, pluraliza e marca Elite', () => {
  assert.strictEqual(
    Cost.format({ dust: 75000, candy: 0, xlCandy: 0, tm: { normal: 1, elite: 0 } }),
    '~75k poeira · 1 TM');
  assert.strictEqual(
    Cost.format({ dust: 270000, candy: 0, xlCandy: 296, tm: { normal: 0, elite: 0 } }),
    '~270k poeira · 296 Doce XL');
  assert.strictEqual(
    Cost.format({ dust: 7500, candy: 1, xlCandy: 0, tm: { normal: 2, elite: 1 } }),
    '~7.5k poeira · 1 doce · 3 TM (1 Elite)');
});

test('format: tudo zero ou null → string vazia', () => {
  assert.strictEqual(Cost.format(null), '');
  assert.strictEqual(Cost.format({ dust: 0, candy: 0, xlCandy: 0, tm: { normal: 0, elite: 0 } }), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cost.test.js`
Expected: FAIL — `Cost.tmCost is not a function`.

- [ ] **Step 3: Write minimal implementation**

Em `pokemon/lib/meta/cost.js`, adicionar antes do `return`:

```js
  // Conta golpes faltantes do moveset-alvo em {normal, elite} (elite = está em eliteMoves).
  function tmCost(missingMoveIds, eliteMoves) {
    var normal = 0, elite = 0, el = eliteMoves || [];
    (missingMoveIds || []).forEach(function (id) {
      if (el.indexOf(id) >= 0) elite++; else normal++;
    });
    return { normal: normal, elite: elite };
  }

  function _kDust(d) {
    if (d >= 10000) return Math.round(d / 1000) + 'k';
    if (d >= 1000)  return (Math.round(d / 100) / 10) + 'k';
    return String(d);
  }
  function _tmTxt(tm) {
    var n = tm.normal + tm.elite;
    return n + ' TM' + (tm.elite > 0 ? ' (' + tm.elite + ' Elite)' : '');
  }

  // String enxuta; omite componentes zero; '' quando tudo zero ou est null.
  function format(est) {
    if (!est) return '';
    var parts = [];
    if (est.dust > 0)    parts.push('~' + _kDust(est.dust) + ' poeira');
    if (est.candy > 0)   parts.push(est.candy + (est.candy === 1 ? ' doce' : ' doces'));
    if (est.xlCandy > 0) parts.push(est.xlCandy + ' Doce XL');
    if (est.tm && (est.tm.normal + est.tm.elite) > 0) parts.push(_tmTxt(est.tm));
    return parts.join(' · ');
  }
```

E atualizar o retorno:

```js
  return { STEP_BANDS, SHADOW_MULT, PVE_TARGET_LEVEL, powerUpCost, levelForCp, tmCost, format };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cost.test.js`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/cost.js pokemon/test/cost.test.js
git commit -m "feat(pokemon): cost.tmCost + cost.format (string enxuta)"
```

---

## Task 4: `estimate` — façade por contexto

**Files:**
- Modify: `pokemon/lib/meta/cost.js`
- Test: `pokemon/test/cost.test.js`

- [ ] **Step 1: Write the failing test**

Adicionar a `pokemon/test/cost.test.js`:

```js
const SPECIES = require('../data/species.json');

function gyaradosInput(over) {
  const base = SPECIES['gyarados'].baseStats;     // {atk:237,def:186,hp:216}
  const ivs = { atk: 15, def: 15, sta: 15 };
  const cpAt25 = PokePvp.cpFor(base, ivs, CPM.find(e => e.level === 25).cpm);
  return Object.assign({
    baseStats: base, ivs: ivs, cp: cpAt25, isShadow: false,
    context: { kind: 'pvp', league: 'master' }, missingMoves: [], eliteMoves: [], cpm: CPM,
  }, over || {});
}

test('estimate: contexto master vai até L50 e usa Doce XL', () => {
  const est = Cost.estimate(gyaradosInput());
  assert.strictEqual(est.fromLevel, 25);
  assert.strictEqual(est.toLevel, 50);
  assert.ok(est.xlCandy > 0);
});

test('estimate: Sombrio reflete a sobretaxa (mais poeira que o normal)', () => {
  const normal = Cost.estimate(gyaradosInput({ isShadow: false }));
  const shadow = Cost.estimate(gyaradosInput({ isShadow: true }));
  assert.ok(shadow.dust > normal.dust);
  assert.strictEqual(shadow.shadow, true);
});

test('estimate: contexto pve mira L40 (sem Doce XL)', () => {
  const est = Cost.estimate(gyaradosInput({ context: { kind: 'pve' } }));
  assert.strictEqual(est.toLevel, 40);
  assert.strictEqual(est.xlCandy, 0);
});

test('estimate: dados faltando → null (degradação graciosa)', () => {
  assert.strictEqual(Cost.estimate(null), null);
  assert.strictEqual(Cost.estimate(gyaradosInput({ baseStats: null })), null);
  assert.strictEqual(Cost.estimate(gyaradosInput({ cp: undefined })), null);
  assert.strictEqual(Cost.estimate(gyaradosInput({ context: null })), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cost.test.js`
Expected: FAIL — `Cost.estimate is not a function`.

- [ ] **Step 3: Write minimal implementation**

Em `pokemon/lib/meta/cost.js`, adicionar antes do `return`:

```js
  // Nível-alvo por contexto. pvp great/ultra → nível que estoura o CP cap; master → L50; pve → L40.
  function _targetLevel(context, baseStats, ivs, cpmList) {
    if (!context || !PokePvp) return null;
    if (context.kind === 'pve') return PVE_TARGET_LEVEL;
    if (context.kind === 'pvp') {
      if (context.league === 'master') return PokePvp.LEVEL_CAP;
      var cap = PokePvp.CP_CAPS[context.league];
      if (cap == null) return null;
      return PokePvp.bestLevelUnderCap(baseStats, ivs, cpmList, cap).level;
    }
    return null;
  }

  // Estimativa completa, ou null (faltou baseStats/ivs/cp/cpm/contexto → degradação graciosa).
  function estimate(input) {
    if (!input || !input.baseStats || !input.ivs || typeof input.cp !== 'number' || !input.cpm) return null;
    var from = levelForCp(input.baseStats, input.ivs, input.cp, input.cpm);
    if (from == null) return null;
    var to = _targetLevel(input.context, input.baseStats, input.ivs, input.cpm);
    if (to == null) return null;
    var pu = powerUpCost(from, to, !!input.isShadow);
    return {
      fromLevel: from, toLevel: to,
      dust: pu.dust, candy: pu.candy, xlCandy: pu.xlCandy,
      tm: tmCost(input.missingMoves || [], input.eliteMoves || []),
      shadow: !!input.isShadow,
    };
  }
```

E atualizar o retorno:

```js
  return { STEP_BANDS, SHADOW_MULT, PVE_TARGET_LEVEL, powerUpCost, levelForCp, tmCost, estimate, format };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cost.test.js`
Expected: PASS (13 testes).

- [ ] **Step 5: Run the WHOLE suite (cost.js é puro, não deve mexer em nada)**

Run: `npm test`
Expected: PASS — todos os ~250 testes (237 antigos + 13 novos).

- [ ] **Step 6: Commit**

```bash
git add pokemon/lib/meta/cost.js pokemon/test/cost.test.js
git commit -m "feat(pokemon): cost.estimate — custo por contexto (pvp/pve/master)"
```

---

## Task 5: Ligar o custo nas razões de ação (`analysis.js`)

**Files:**
- Modify: `pokemon/lib/analysis.js` (imports ~L16-18; `computeAction` ~L512; `_notReadyAction` ~L466; `_pveAction` ~L359)
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Write the failing test**

Adicionar a `pokemon/test/verdict.test.js` (no fim do arquivo):

```js
// ---------------------------------------------------------------------------
// Fase 3 — custo nas razões de ação
// ---------------------------------------------------------------------------

test('analyze: FORTALECER sub-nivelado mostra custo de poeira', () => {
  // Azumarill 0/15/15 great-meta, mas com CP baixo (sub-nivelado) → custo > 0.
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:900, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Bolha', mon_move_2:'Raio Congelante', mon_move_3:'Jogo Duro' } };
  const meta = (function () {
    const { buildSpeciesIndex } = require('../lib/meta/match.js');
    return {
      speciesIndex: buildSpeciesIndex(require('../data/species.json')),
      movesPt: { 'bolha':'BUBBLE', 'raio congelante':'ICE_BEAM', 'jogo duro':'PLAY_ROUGH' },
      pvpRanks: require('../data/pvp_ranks.json'),
      cpm: require('../data/cpm.json'),
    };
  })();
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.action.kind, 'FORTALECER');
  assert.match(e.action.reason, /poeira/);
  assert.ok(e.action.cost && e.action.cost.dust > 0);
});

test('computeAction: mon mínimo (sem cp/ivs) NÃO ganha sufixo de custo (degradação)', () => {
  const a = computeAction(pvpMon());     // pvpMon() não tem cp/ivs/speciesId
  assert.strictEqual(a.kind, 'FORTALECER');
  assert.doesNotMatch(a.reason, /poeira/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/verdict.test.js`
Expected: FAIL no primeiro teste — `e.action.cost` é `undefined` e o `reason` não contém "poeira" (custo ainda não ligado). O segundo teste passa desde já.

- [ ] **Step 3: Implementação — importar `PokeCost` e adicionar `_costSuffix`**

Em `pokemon/lib/analysis.js`, logo após o bloco do `PokePve` (~L16-18):

```js
  var PokePve = (typeof require === 'function')
    ? require('./meta/pve.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokePve : null);

  var PokeCost = (typeof require === 'function')
    ? require('./meta/cost.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokeCost : null);
```

Adicionar o helper logo antes de `function computeAction(e, meta) {` (~L512):

```js
  // Sufixo de custo p/ a razão da ação. Degrada para '' (sem custo) quando faltam dados
  // — é o que mantém os mons mínimos dos testes de computeAction sem sufixo. Retorna { suffix, cost }.
  function _costSuffix(e, context, missingMoves, meta) {
    if (!PokeCost || !meta || !e || !e.speciesId) return { suffix: '', cost: null };
    var byId = meta.speciesIndex && meta.speciesIndex.byId;
    var sp = byId && byId[e.speciesId];
    if (!sp || !sp.baseStats || !e.ivs || typeof e.cp !== 'number' || !meta.cpm)
      return { suffix: '', cost: null };
    var cost = PokeCost.estimate({
      baseStats: sp.baseStats, ivs: e.ivs, cp: e.cp, isShadow: !!e.isShadow,
      context: context, missingMoves: missingMoves || [], eliteMoves: e.eliteMoves || [], cpm: meta.cpm,
    });
    var s = PokeCost.format(cost);
    return { suffix: s ? ' · ' + s : '', cost: cost };
  }
```

- [ ] **Step 4: Implementação — `_notReadyAction` aceita contexto e anexa custo**

Em `pokemon/lib/analysis.js`, substituir a função `_notReadyAction` inteira (~L466-474) por:

```js
  // Ação quando o moveset NÃO está pronto: AGUARDAR_EVENTO (golpe legado falta) senão ENSINAR_TM.
  // context/missingMoves alimentam o sufixo de custo (Elite TM aparece aqui, no ramo de evento).
  function _notReadyAction(e, ensinarReason, meta, context, missingMoves) {
    const cs = _costSuffix(e, context, missingMoves || [], meta);
    const leg = _missingLegacyMove(e);
    if (leg) {
      return { kind: 'AGUARDAR_EVENTO', legacyMove: leg, cost: cs.cost,
        reason: 'Aguardar Evento — moveset ótimo precisa do golpe legado "' + _moveName(leg, meta) +
                '"; espere Dia Comunitário / Elite TM' + cs.suffix };
    }
    return { kind: 'ENSINAR_TM', cost: cs.cost, reason: ensinarReason + cs.suffix };
  }
```

- [ ] **Step 5: Implementação — `_pveAction` passa contexto e custo**

Em `pokemon/lib/analysis.js`, substituir o corpo de `_pveAction` (~L359-377) por:

```js
  function _pveAction(e, meta) {
    if (!e.pveMeta) return null;
    const role = e.pveMeta.raid ? 'raid' : (e.pveMeta.gymAtk ? 'gym_atk' : null);
    if (!role) return null;
    const tipo = TYPE_PT[e.pveMeta.bestType] || e.pveMeta.bestType || 'ataque';
    const papel = role === 'raid' ? 'Raid' : 'Ataque de Ginásio';
    const bt = e.pveMeta.bestType && e.pveMeta.byType ? e.pveMeta.byType[e.pveMeta.bestType] : null;
    const rankTxt = (bt && typeof bt.erRank === 'number') ? ' — Top ' + bt.erRank + ' atacante de ' + tipo : '';
    const ctx = { kind: 'pve', role: role };
    if (e.pveMeta.movesetOk) {
      const cs = _costSuffix(e, ctx, [], meta);
      return { kind: 'FORTALECER', role: role, cost: cs.cost,
        reason: 'Fortalecer p/ ' + papel + ' (' + tipo + ')' + rankTxt + ' (estimativa)' + cs.suffix };
    }
    // PvE exige os dois golpes do bestMoveset; lista os que faltam.
    const mine = e.moveIds || [];
    const missing = (e.pveMeta.bestMoveset || []).filter(function (id) { return mine.indexOf(id) < 0; });
    return _notReadyAction(e,
      'Ensinar/TM p/ ' + papel + ' (' + tipo + ')' + rankTxt + ' — ' +
      (missing.length ? _faltaTxt(missing, meta) : 'falta o moveset de ataque') + ' (estimativa)',
      meta, ctx, missing);
  }
```

- [ ] **Step 6: Implementação — `computeAction` (PvP FORTALECER, PvP not-ready, AGUARDAR_ROCKET)**

Em `pokemon/lib/analysis.js`, substituir a função `computeAction` inteira (~L512-541) por:

```js
  function computeAction(e, meta) {
    // P1 (Fase 3): Sombrio meta com Frustração → aguardar evento Rocket (pré-empta Fortalecer).
    // "meta" inclui pré-evoluções de espécies meta (ex.: Machop Sombrio → Shadow Machamp).
    if (isMetaRelevant(e) && _isShadowFrustration(e)) {
      const ctxR = _bestPvpLeague(e) ? { kind: 'pvp', league: _bestPvpLeague(e) } : { kind: 'pve' };
      const csR = _costSuffix(e, ctxR, [], meta);   // poeira/doce; o Charged TM já está no texto.
      return { kind: 'AGUARDAR_ROCKET', cost: csR.cost,
        reason: 'Aguardar Rocket — Sombrio com Frustração; troque o golpe em evento (Charged TM)' + csR.suffix };
    }
    // P1b: evoluir cópia boa cuja evolução é meta (pré-evolução; própria forma não é meta).
    const evo = _evolveAction(e);
    if (evo) return evo;
    // P2–P4: gancho de moveset (PvP tem prioridade; senão PvE) → Fortalecer / Aguardar Evento / Ensinar-TM.
    const lg = _bestPvpLeague(e);
    if (lg && e.pvpMeta) {
      const L = e.pvpMeta[lg];
      const ligaPt = LEAGUE_PT[lg];
      const ivInfo = 'IV PvP ' + Math.round(L.spPct * 100) + '% (rank ' + L.ivRank + '/4096)';
      const ctx = { kind: 'pvp', league: lg };
      if (L.movesetOk) {
        const cs = _costSuffix(e, ctx, [], meta);
        return { kind: 'FORTALECER', league: lg, cost: cs.cost,
          reason: 'Fortalecer p/ ' + ligaPt + ' — rank ' + L.speciesRank + ' da espécie, seu ' + ivInfo + cs.suffix };
      }
      const missing = _missingPvpMoves(e.moveIds, L.moveset);
      return _notReadyAction(e,
        'Ensinar/TM p/ ' + ligaPt + ' — Top ' + L.speciesRank + ', ' +
        (missing.length ? _faltaTxt(missing, meta) : 'falta o moveset recomendado'), meta, ctx, missing);
    }
    const pve = _pveAction(e, meta);
    if (pve) return pve;
    // P5: Trocar/Reroll (duplicata pior: shiny lucky ou meta IV baixo).
    return _trocaAction(e);
  }
```

- [ ] **Step 7: Run the targeted test to verify it passes**

Run: `node --test test/verdict.test.js`
Expected: PASS — incluindo os 2 testes novos da Fase 3.

- [ ] **Step 8: Run the WHOLE suite (shape compartilhado quebra cross-file — lição da Fase 2)**

Run: `npm test`
Expected: PASS — toda a suíte verde.

> Se algum teste antigo de `computeAction` quebrar por causa do campo `cost` novo: confirme que ele só usa `assert.match(a.reason, ...)` / `assert.strictEqual(a.kind|a.league, ...)` (nenhum faz `deepStrictEqual` da ação inteira — o campo extra é seguro). Se algum `reason` mudou inesperadamente, é porque o mon de teste tem `cp`/`ivs`/`speciesId` + `meta` completos; ajuste o teste para esperar o sufixo, não remova o custo.

- [ ] **Step 9: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "feat(pokemon): custo de investimento nas razões de ação (FORTALECER/TM/evento)"
```

---

## Task 6: Wiring de assets (`index.html` + `sw.js`)

**Files:**
- Modify: `pokemon/index.html` (~L343)
- Modify: `pokemon/sw.js` (L1 `CACHE`; L4 `ASSETS`)

- [ ] **Step 1: Adicionar o `<script>` na ordem certa**

Em `pokemon/index.html`, entre a linha de `pve.js` (343) e a de `analysis.js` (344):

```html
<script src="./lib/meta/pve.js"></script>
<script src="./lib/meta/cost.js"></script>
<script src="./lib/analysis.js"></script>
```

(`cost.js` usa o global `PokePvp` de `pvp.js` (L342) → tem que carregar depois dele e antes de `analysis.js`.)

- [ ] **Step 2: Bump do cache + ASSETS no `sw.js`**

Em `pokemon/sw.js` linha 1:

```js
const CACHE = 'pokemon-leo-v20';
```

E na lista `ASSETS` (L4), adicionar `'./lib/meta/cost.js'` junto dos outros `lib/meta`:

```js
  './lib/refdata.js', './lib/analysis.js', './lib/render.js', './lib/sort.js', './lib/meta/match.js', './lib/meta/pvp.js', './lib/meta/pve.js', './lib/meta/cost.js',
```

- [ ] **Step 3: Sanidade — `node -c` nos arquivos JS tocados**

Run: `node -c lib/meta/cost.js && node -c lib/analysis.js && node -c sw.js && echo OK`
Expected: `OK` (sem erro de sintaxe).

- [ ] **Step 4: Verificar a ordem de carregamento simulando o browser**

Run:
```bash
node -e "global.window=global; require('./lib/meta/match.js'); require('./lib/meta/pvp.js'); require('./lib/meta/pve.js'); require('./lib/meta/cost.js'); console.log('PokeCost global?', typeof globalThis.PokeCost, '| powerUpCost?', typeof globalThis.PokeCost.powerUpCost);"
```
Expected: `PokeCost global? object | powerUpCost? function` (confirma que o módulo expõe o global corretamente).

- [ ] **Step 5: Commit**

```bash
git add pokemon/index.html pokemon/sw.js
git commit -m "chore(pokemon): bump SW v19->v20 + carrega lib/meta/cost.js (Fase 3)"
```

---

## Task 7: Verificação final + PR

- [ ] **Step 1: Suíte inteira verde (a partir de `pokemon/`)**

Run: `npm test`
Expected: PASS — ~250 testes, 0 falhas.

- [ ] **Step 2: Conferência manual rápida do custo num mon real (opcional, informativo)**

Run:
```bash
node -e "
const A=require('./lib/analysis.js'); const M=require('./lib/meta/match.js');
const {getPokemonSize,getPokemonSizeScalar}=require('../sizes.js');
const refdata=require('./lib/refdata.js');
const meta={speciesIndex:M.buildSpeciesIndex(require('./data/species.json')),
  moves:require('./data/moves.json'), movesPt:require('./data/moves_pt.json'),
  pvpRanks:require('./data/pvp_ranks.json'), pveRanks:require('./data/pve_ranks.json'), cpm:require('./data/cpm.json')};
const col=require('./colecao.json'); const list=A.analyze(col.fileData||col,getPokemonSize,refdata,getPokemonSizeScalar,meta);
list.filter(e=>e.action&&e.action.cost).slice(0,8).forEach(e=>console.log(e.name, '·', e.action.kind, '·', e.action.reason));
"
```
Expected: imprime algumas ações com o sufixo de custo (`~Xk poeira …`). Sombrios devem mostrar poeira maior que equivalentes não-Sombrios. (Se `sizes.js` exigir caminho diferente, ajuste o `require` — é só diagnóstico, não faz parte do build.)

- [ ] **Step 3: Push da branch e abrir o PR**

```bash
git push -u origin claude/reverent-euclid-378ce3
gh pr create --base main --title "Fase 3 — modelo de custo de investimento (/pokemon)" --body "$(cat <<'EOF'
## Fase 3 do roadmap de revisão da recomendação

Novo módulo puro `lib/meta/cost.js` (`PokeCost`): estima o **custo restante** por mon
(poeira/doce por nível derivando o nível atual do CP, Doce XL p/ L50 no Mestre, sobretaxa
de Sombrio +20%, contagem de TM/Elite TM faltando) e injeta uma linha enxuta de custo nas
razões de ação **FORTALECER / Ensinar-TM** (e AGUARDAR_EVENTO/ROCKET, onde o Elite TM
aparece).

- Tabela de custo embutida (corroborada Bulbapedia + calculadora pública); validada por
  totais nos testes.
- Degradação graciosa: sem `cp`/`ivs`/`speciesId` o sufixo some → suíte cross-file intacta.
- Bump SW v19→v20 + `cost.js` no `ASSETS`; ordem dos `<script>` preservada.

Spec: `docs/superpowers/specs/2026-06-16-pokemon-fase3-custo-investimento-design.md`
Plano: `docs/superpowers/plans/2026-06-16-pokemon-fase3-custo-investimento.md`

Aceite: custo aparece nas ações; Sombrio reflete a sobretaxa; `npm test` verde.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR criado contra `main`.

---

## Self-Review

**1. Cobertura da spec:**
- §1 custo enxuto em FORTALECER/Ensinar-TM → Task 5 (Steps 5-6) + `format` Task 3. ✓
- §4 `cost.js` puro (levelForCp/powerUpCost/tmCost/estimate/format) → Tasks 1-4. ✓
- §5 nível-alvo (great/ultra cap, master L50, pve L40) → Task 4 `_targetLevel`. ✓
- §5 sobretaxa Sombrio +20% → Task 1 (`SHADOW_MULT`, per-step ceil) + testes Task 1/4. ✓
- §5 Doce XL p/ L50 → Task 1 bandas 40-49.5 + teste Task 1/4. ✓
- §5 TM/Elite TM faltando → Task 3 `tmCost`. ✓
- §7 integração + AGUARDAR_EVENTO/ROCKET → Task 5 (Steps 4,6). ✓
- §7 degradação graciosa → Task 4 (`estimate`→null) + Task 5 (`_costSuffix`→'') + teste de não-regressão. ✓
- §8 wiring (`index.html` ordem, `sw.js` v19→v20 + ASSETS) → Task 6. ✓
- §9 plano de testes (cost.test.js + verdict.test.js + suíte inteira) → Tasks 1-5 + Task 7. ✓

**2. Placeholders:** nenhum — todo passo de código tem o código real; números dos testes são fixos e verificados.

**3. Consistência de tipos/nomes:** `estimate` devolve `{ fromLevel, toLevel, dust, candy, xlCandy, tm:{normal,elite}, shadow }`; `format` lê exatamente esses campos; `powerUpCost` devolve `{ dust, candy, xlCandy }`; `tmCost` devolve `{ normal, elite }`; `_costSuffix` devolve `{ suffix, cost }`; ações ganham campo `cost`. `context` = `{ kind:'pvp', league }` | `{ kind:'pve', role? }` consistente em `_targetLevel`, `_costSuffix`, `computeAction`, `_pveAction`, `_notReadyAction`. ✓
