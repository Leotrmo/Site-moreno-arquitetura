# Pokémon Meta — Fase 4 (Polimento) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polir a camada de meta competitivo da `/pokemon`: Sombrio correto (bônus no build + casamento), filtro de Megas no pool de PvE, Rocket por duração real, limiares PvP afrouxados (shortlist útil), ordenação por rank com chip ativo, justificativas mais ricas e limpezas (TYPE_PT, desempate de sorts).

**Architecture:** Site estático, JS puro UMD (Node `require` + globais no browser). Build em `pokemon/build/` (Node) gera `pokemon/data/*`; runtime em `pokemon/lib/*` consome. Tudo aditivo e não-regressivo. Testes `node:test` co-locados em `pokemon/test/`.

**Tech Stack:** Node v24 (`node --test`), JavaScript ES5-ish (compatível com browser), sem dependências externas.

**Base spec:** `docs/superpowers/specs/2026-06-07-pokemon-meta-competitivo-design.md` §14 (decisões de 2026-06-09).

**Branch:** `claude/pokemon-meta-fase4` (já criada off `main` pós-merge da Fase 3; o spec §14 já foi commitado).

**Comando de teste (do diretório raiz do repo):**
```
node --test pokemon/test/*.test.js
```
Baseline antes da Fase 4: **166 testes verdes**. Para um arquivo só: `node --test pokemon/test/pve.test.js`.

---

## File Structure

**Modificados:**
- `pokemon/lib/meta/pve.js` — constantes Sombrio + `cycleDps`/`tdoFor`/`bestMoveset` recebem flag `shadow`; `evalMon` resolve entrada `_shadow`; expõe `defBulkRank`; `rocketSpam` por turnos reais.
- `pokemon/build/transform.js` — `buildPveRanks` filtra Mega/Primal e aplica bônus Sombrio + desempate determinístico; `buildMoves` captura `pvp.turns`.
- `pokemon/lib/meta/pvp.js` — `THRESHOLDS` afrouxados.
- `pokemon/lib/refdata.js` — passa a exportar `TYPE_PT` (fonte única).
- `pokemon/lib/analysis.js` — consome `TYPE_PT` de refdata; justificativa PvE com rank do tipo.
- `pokemon/lib/render.js` — consome `TYPE_PT` de refdata (remove `TYPE_PT_PVE`).
- `pokemon/lib/sort.js` — sorter competitivo por rank (`rankFor` + comparador).
- `pokemon/app.js` — aplica sort por rank quando há chip competitivo ativo.
- `pokemon/sw.js` — bump `v11` → `v12`.
- `pokemon/fixtures/mini-gamemaster.json` — (opcional) usado por testes; mantido como está; testes novos usam dados inline.
- `pokemon/data/*` — regenerados pelo build (Task 11).

**Testes tocados:** `pokemon/test/pve.test.js`, `transform.test.js`, `pvp.test.js`, `sort.test.js`, `render.test.js`, `refdata.test.js`.

---

## Task 1: Bônus Sombrio no motor de PvE (cálculo de DPS/TDO/ER)

Sombrio dá +20% de ataque (×1.2) e toma +20% de dano (defesa efetiva ×1/1.2). Threading aditivo: param `shadow` opcional (default falsy = comportamento atual).

**Files:**
- Modify: `pokemon/lib/meta/pve.js`
- Test: `pokemon/test/pve.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `pokemon/test/pve.test.js`:

```javascript
const { SHADOW_ATK_MULT } = require('../lib/meta/pve.js');

test('cycleDps: Sombrio aplica 1.2x no ataque (DPS maior)', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  const fast    = { type: 'fighting', pve: { power: 10, energy: 10, durationMs: 1000 } };
  const charged = { type: 'fighting', pve: { power: 50, energy: 50, durationMs: 2000 } };
  const normal = cycleDps(fast, charged, base, ['fighting']);
  const shadow = cycleDps(fast, charged, base, ['fighting'], true);
  assert.ok(shadow > normal, 'Sombrio tem DPS maior que a base');
});

test('tdoFor: Sombrio reduz o bulk (toma 1.2x de dano)', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  assert.ok(tdoFor(10, base, true) < tdoFor(10, base, false), 'TDO Sombrio < TDO base');
});

test('bestMoveset: Sombrio supera a base de mesmos stats (ER maior)', () => {
  const sp = { baseStats: { atk: 200, def: 120, hp: 140 }, types: ['ice'],
               fastMoves: ['ICE_SHARD'], chargedMoves: ['AVALANCHE'] };
  const movesById = {
    ICE_SHARD: { type: 'ice', pve: { power: 12, energy: 12, durationMs: 1200 } },
    AVALANCHE: { type: 'ice', pve: { power: 90, energy: 45, durationMs: 2700 } },
  };
  const baseBm   = bestMoveset(sp, movesById, false);
  const shadowBm = bestMoveset(sp, movesById, true);
  assert.ok(shadowBm.best.er > baseBm.best.er, 'ER Sombrio > ER base');
});

test('SHADOW_ATK_MULT exportado = 1.2', () => {
  assert.strictEqual(SHADOW_ATK_MULT, 1.2);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/pve.test.js`
Expected: FAIL — `cycleDps(..., true)` hoje ignora o 5º arg (DPS igual); `SHADOW_ATK_MULT` é `undefined`.

- [ ] **Step 3: Implementar os multiplicadores Sombrio**

Em `pokemon/lib/meta/pve.js`, na linha das constantes (logo após `var PVE = {...}`), adicione:

```javascript
  var SHADOW_ATK_MULT = 1.2;        // Sombrio: +20% de ataque
  var SHADOW_DEF_MULT = 1 / 1.2;    // Sombrio: toma 1.2x de dano → defesa efetiva ×0.8333
```

Troque `cycleDps` para aceitar `shadow`:

```javascript
  function cycleDps(fast, charged, base, types, shadow) {
    if (!fast || !charged || !fast.pve || !charged.pve) return 0;
    if (!(fast.pve.energy > 0)) return 0;                 // sem geração de energia → ciclo indefinido
    var atk = effAtk(base) * (shadow ? SHADOW_ATK_MULT : 1);
    var sF = types.indexOf(fast.type) >= 0 ? PVE.STAB : 1;
    var sC = types.indexOf(charged.type) >= 0 ? PVE.STAB : 1;
    var dF = dmgPerHit(fast.pve.power, atk, sF), tF = fast.pve.durationMs / 1000;
    var dC = dmgPerHit(charged.pve.power, atk, sC), tC = charged.pve.durationMs / 1000;
    var n = charged.pve.energy / fast.pve.energy;
    var cycleTime = n * tF + tC;
    return cycleTime > 0 ? (n * dF + dC) / cycleTime : 0;
  }
```

Troque `tdoFor` para aceitar `shadow`:

```javascript
  function tdoFor(dps, base, shadow) {
    return dps * effHp(base) * (effDef(base) * (shadow ? SHADOW_DEF_MULT : 1)) / PVE.INCOMING_K;
  }
```

Troque `bestMoveset` para repassar `shadow`:

```javascript
  function bestMoveset(species, movesById, shadow) {
    var base = species.baseStats, types = species.types || [];
    var fastIds = (species.fastMoves || []).filter(function (id) { return _hasPve(id, movesById); });
    var chgIds  = (species.chargedMoves || []).filter(function (id) { return _hasPve(id, movesById); });
    var byType = {}, best = null;
    for (var i = 0; i < fastIds.length; i++) {
      for (var j = 0; j < chgIds.length; j++) {
        var fId = fastIds[i], cId = chgIds[j];
        var F = movesById[fId], C = movesById[cId];
        var dps = cycleDps(F, C, base, types, shadow);
        if (!(dps > 0)) continue;
        var tdo = tdoFor(dps, base, shadow), er = erFor(dps, tdo);
        var rec = { moveset: [fId, cId], type: C.type, dps: dps, tdo: tdo, er: er };
        if (!byType[C.type] || er > byType[C.type].er) byType[C.type] = rec;
        if (!best || er > best.er) best = rec;
      }
    }
    return { best: best, byType: byType };
  }
```

Por fim, exporte as constantes novas. Troque a linha do `return { ... }` final para incluir `SHADOW_ATK_MULT, SHADOW_DEF_MULT`:

```javascript
  return { PVE, RAID_TOP, PVE_TOP, GYM_ATK_TOP, GYM_ATK_COVERAGE_MIN, GYM_DEF_TOP, GYM_DEF_IV_MIN, ROCKET_SPAM_TURNS,
           SHADOW_ATK_MULT, SHADOW_DEF_MULT,
           effAtk, effDef, effHp, dmgPerHit, cycleDps, tdoFor, erFor, bestMoveset,
           defBulk, evalMon, pveTags, rocketSpam };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/pve.test.js`
Expected: PASS (todos, incluindo os antigos — `cycleDps`/`tdoFor`/`bestMoveset` sem o arg novo mantêm o comportamento).

- [ ] **Step 5: Commit**

```
git add pokemon/lib/meta/pve.js pokemon/test/pve.test.js
git commit -m "fase4: bônus Sombrio (1.2x atk / 0.833x bulk) no motor de PvE"
```

---

## Task 2: `evalMon` (PvE) resolve a entrada `_shadow` para mons Sombrios + expõe `defBulkRank`

O casamento (`match.js`) devolve a espécie-base. Mons Sombrios devem ler a entrada `_shadow` (com bônus, Task 3) quando ela existir. Também expomos `defBulkRank` no retorno (necessário p/ ordenar `gym_def`, Task 9).

**Files:**
- Modify: `pokemon/lib/meta/pve.js` (`evalMon`)
- Test: `pokemon/test/pve.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `pokemon/test/pve.test.js`:

```javascript
const { evalMon } = require('../lib/meta/pve.js');

test('evalMon: mon Sombrio usa a entrada _shadow quando existe', () => {
  const meta = {
    pveRanks: {
      gengar:        { roles: [],            bestType: 'ghost', bestMoveset: ['SHADOW_CLAW','SHADOW_BALL'], byType: {}, defBulkRank: 900 },
      gengar_shadow: { roles: ['raid','pve'], bestType: 'ghost', bestMoveset: ['SHADOW_CLAW','SHADOW_BALL'], byType: {}, defBulkRank: 900 },
    },
    speciesIndex: { byId: { gengar: { baseStats: { atk: 1, def: 1, hp: 1 } }, gengar_shadow: { baseStats: { atk: 1, def: 1, hp: 1 } } } },
  };
  const e = { speciesId: 'gengar', isShadow: true, ivs: { atk: 15, def: 15, sta: 15 }, moveIds: [] };
  const r = evalMon(e, meta);
  assert.strictEqual(r.raid, true, 'pegou a role raid da entrada _shadow');
});

test('evalMon: mon NÃO Sombrio ignora a entrada _shadow (usa a base)', () => {
  const meta = {
    pveRanks: {
      gengar:        { roles: [],            bestType: 'ghost', bestMoveset: null, byType: {}, defBulkRank: 900 },
      gengar_shadow: { roles: ['raid','pve'], bestType: 'ghost', bestMoveset: null, byType: {}, defBulkRank: 900 },
    },
    speciesIndex: { byId: { gengar: { baseStats: { atk: 1, def: 1, hp: 1 } } } },
  };
  const e = { speciesId: 'gengar', isShadow: false, ivs: { atk: 15, def: 15, sta: 15 }, moveIds: [] };
  const r = evalMon(e, meta);
  assert.strictEqual(r.raid, false, 'usou a base, sem role');
});

test('evalMon: expõe defBulkRank no retorno', () => {
  const meta = {
    pveRanks: { blissey: { roles: [], bestType: null, bestMoveset: null, byType: {}, defBulkRank: 2 } },
    speciesIndex: { byId: { blissey: { baseStats: { atk: 60, def: 80, hp: 510 } } } },
  };
  const e = { speciesId: 'blissey', isShadow: false, ivs: { atk: 15, def: 15, sta: 15 }, moveIds: [] };
  assert.strictEqual(evalMon(e, meta).defBulkRank, 2);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/pve.test.js`
Expected: FAIL — `evalMon` hoje lê só `e.speciesId` e não retorna `defBulkRank`.

- [ ] **Step 3: Implementar**

Em `pokemon/lib/meta/pve.js`, troque o início de `evalMon` e o objeto retornado:

```javascript
  function evalMon(e, meta) {
    if (!e || !e.speciesId || !meta || !meta.pveRanks) return null;
    // Sombrio prefere a entrada _shadow (com bônus do build); degrada p/ a base se não existir.
    var pveId = (e.isShadow && meta.pveRanks[e.speciesId + '_shadow'])
      ? e.speciesId + '_shadow' : e.speciesId;
    var entry = meta.pveRanks[pveId];
    var byId = meta.speciesIndex && meta.speciesIndex.byId;
    var sp = byId && (byId[pveId] || byId[e.speciesId]);
    if (!entry) return null;                       // espécie sem dados de PvE
    var roles = entry.roles || [];
    var gymDef = false;
    if (sp && sp.baseStats && typeof entry.defBulkRank === 'number'
        && entry.defBulkRank <= GYM_DEF_TOP
        && e.ivs && e.ivs.def >= GYM_DEF_IV_MIN && e.ivs.sta >= GYM_DEF_IV_MIN) {
      gymDef = true;
    }
    return {
      raid: roles.indexOf('raid') >= 0,
      pve: roles.indexOf('pve') >= 0,
      gymAtk: roles.indexOf('gym_atk') >= 0,
      gymDef: gymDef,
      bestType: entry.bestType || null,
      bestMoveset: entry.bestMoveset || null,
      byType: entry.byType || {},
      defBulkRank: (typeof entry.defBulkRank === 'number') ? entry.defBulkRank : null,
      movesetOk: pveMovesetOk(e.moveIds, entry.bestMoveset),
    };
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/pve.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add pokemon/lib/meta/pve.js pokemon/test/pve.test.js
git commit -m "fase4: evalMon PvE lê entrada _shadow p/ Sombrios + expõe defBulkRank"
```

---

## Task 3: `buildPveRanks` filtra Mega/Primal, aplica bônus Sombrio e desempata sorts

Pool de ranking = base + regional + Sombrio (com bônus). Megas/Primal saem (forma temporária, nenhuma cópia casa). Ties dos sorts viram determinísticos por `id`.

**Files:**
- Modify: `pokemon/build/transform.js` (`buildPveRanks`)
- Test: `pokemon/test/transform.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `pokemon/test/transform.test.js`:

```javascript
test('buildPveRanks: filtra Mega/Primal do pool e dá bônus a Sombrio', () => {
  const { buildPveRanks } = require('../build/transform.js');
  const species = {
    chomp:        { baseStats: { atk: 200, def: 120, hp: 140 }, types: ['dragon'],
                    fastMoves: ['DRAGON_TAIL'], chargedMoves: ['OUTRAGE'] },
    chomp_shadow: { baseStats: { atk: 200, def: 120, hp: 140 }, types: ['dragon'],
                    fastMoves: ['DRAGON_TAIL'], chargedMoves: ['OUTRAGE'] },
    chomp_mega:   { baseStats: { atk: 320, def: 200, hp: 140 }, types: ['dragon'],
                    fastMoves: ['DRAGON_TAIL'], chargedMoves: ['OUTRAGE'] },
    groudon_primal: { baseStats: { atk: 300, def: 200, hp: 180 }, types: ['ground'],
                    fastMoves: ['MUD_SHOT'], chargedMoves: ['EARTHQUAKE'] },
  };
  const movesById = {
    DRAGON_TAIL: { type: 'dragon', pve: { power: 13, energy: 9,  durationMs: 1100 } },
    OUTRAGE:     { type: 'dragon', pve: { power: 110, energy: 60, durationMs: 3900 } },
    MUD_SHOT:    { type: 'ground', pve: { power: 3,  energy: 9,  durationMs: 600 } },
    EARTHQUAKE:  { type: 'ground', pve: { power: 120, energy: 65, durationMs: 3600 } },
  };
  const out = buildPveRanks(species, movesById);
  assert.ok(!out.chomp_mega, 'Mega não entra no pool');
  assert.ok(!out.groudon_primal, 'Primal não entra no pool');
  assert.ok(out.chomp_shadow.byType.dragon.er > out.chomp.byType.dragon.er, 'Sombrio com bônus > base');
  assert.strictEqual(out.chomp_shadow.byType.dragon.erRank, 1, 'Sombrio ranqueia acima da base');
  assert.strictEqual(out.chomp.byType.dragon.erRank, 2);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/transform.test.js`
Expected: FAIL — hoje `chomp_mega`/`groudon_primal` entram e `chomp_shadow` empata com `chomp` (mesmo ER, rank instável).

- [ ] **Step 3: Implementar**

Em `pokemon/build/transform.js`, logo antes de `function buildPveRanks(...)`, adicione os detectores:

```javascript
// Formas não-obteníveis como cópia permanente: Mega/Primal saem do pool de ranking PvE.
const MEGA_RE = /_mega(_x|_y)?$|_primal$/;
const isShadowId = (id) => /_shadow$/.test(id);
```

Dentro de `buildPveRanks`, no laço "1. melhor moveset por espécie", filtre Mega/Primal e passe o flag Sombrio:

```javascript
  const calc = {};   // id → { best, byType, defBulk }
  for (const id of ids) {
    if (MEGA_RE.test(id)) continue;                 // Mega/Primal fora do pool
    const sp = species[id];
    if (!sp || !sp.baseStats) continue;
    const bm = PokePve.bestMoveset(sp, movesById, isShadowId(id));   // bônus Sombrio nas entradas _shadow
    calc[id] = { best: bm.best, byType: bm.byType, defBulk: sp.baseStats.def * sp.baseStats.hp };
  }
```

No bloco "2. ranking global por tipo", dê desempate determinístico aos dois sorts:

```javascript
  for (const t in byTypeList) {
    const byEr = byTypeList[t].slice().sort((a, b) => (b.er - a.er) || a.id.localeCompare(b.id));
    const byDps = byTypeList[t].slice().sort((a, b) => (b.dps - a.dps) || a.id.localeCompare(b.id));
    erRankOf[t] = {}; dpsRankOf[t] = {};
    byEr.forEach((x, i) => { erRankOf[t][x.id] = i + 1; });
    byDps.forEach((x, i) => { dpsRankOf[t][x.id] = i + 1; });
  }
```

No bloco "3. defBulkRank global", desempate por id:

```javascript
  const bulkSorted = Object.keys(calc).sort((a, b) => (calc[b].defBulk - calc[a].defBulk) || a.localeCompare(b));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/transform.test.js`
Expected: PASS (incluindo os testes antigos de `buildPveRanks`, cujos ids sintéticos não casam Mega/Shadow).

- [ ] **Step 5: Commit**

```
git add pokemon/build/transform.js pokemon/test/transform.test.js
git commit -m "fase4: buildPveRanks filtra Mega/Primal, boost Sombrio e desempate determinístico"
```

---

## Task 4: `buildMoves` captura a duração PvP (turnos) dos golpes rápidos

O gamemaster do PvPoke traz `cooldown` (ms) nos golpes. Em PvP, turnos = `cooldown / 500`. Guardamos `pvp.turns` só para golpes rápidos e só quando `cooldown` existe (mantém o teste atual com `deepStrictEqual`).

**Files:**
- Modify: `pokemon/build/transform.js` (`buildMoves`)
- Test: `pokemon/test/transform.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `pokemon/test/transform.test.js`:

```javascript
test('buildMoves: guarda pvp.turns (cooldown/500) só p/ golpes rápidos', () => {
  const { buildMoves } = require('../build/transform.js');
  const gmInline = { moves: [
    { moveId: 'MUD_SHOT',  type: 'ground',   power: 3,  energy: 0,  energyGain: 9, cooldown: 1000 },
    { moveId: 'COUNTER',   type: 'fighting', power: 8,  energy: 0,  energyGain: 7, cooldown: 1000 },
    { moveId: 'BODY_SLAM', type: 'normal',   power: 60, energy: 35, energyGain: 0, cooldown: 1900 },
  ] };
  const m = buildMoves(gmInline);
  assert.strictEqual(m.MUD_SHOT.pvp.turns, 2);          // 1000 / 500
  assert.strictEqual(m.COUNTER.pvp.turns, 2);
  assert.strictEqual(m.BODY_SLAM.pvp.turns, undefined); // carregado não guarda turns
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/transform.test.js`
Expected: FAIL — `pvp.turns` é `undefined` para `MUD_SHOT`/`COUNTER` hoje.

- [ ] **Step 3: Implementar**

Em `pokemon/build/transform.js`, troque o corpo do laço de `buildMoves`:

```javascript
  for (const mv of gamemaster.moves) {
    if (!mv.moveId || mv.unlisted) continue;       // pula não-listados (ex.: Transform)
    const isFast = mv.energyGain > 0;              // fast gera energia; charge gasta (energy > 0)
    const pvp = { power: mv.power, energy: isFast ? mv.energyGain : mv.energy };
    if (isFast && mv.cooldown) pvp.turns = mv.cooldown / 500;   // duração PvP em turnos
    out[mv.moveId] = { type: mv.type, kind: isFast ? 'fast' : 'charge', pvp: pvp };
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/transform.test.js`
Expected: PASS — o teste antigo `buildMoves: classifica fast/charge` continua verde porque o fixture não tem `cooldown` (sem `turns`).

- [ ] **Step 5: Commit**

```
git add pokemon/build/transform.js pokemon/test/transform.test.js
git commit -m "fase4: buildMoves captura pvp.turns (duração PvP) dos golpes rápidos"
```

---

## Task 5: `rocketSpam` usa turnos reais (com fallback gracioso)

Turnos reais para carregar = ativações × turnos por ativação do golpe rápido. Sem `turns` (dado ausente) → cai no número de ativações (heurística atual). O "rápido mais forte" passa a ser o de maior energia-por-turno.

**Files:**
- Modify: `pokemon/lib/meta/pve.js` (`rocketSpam`)
- Test: `pokemon/test/pve.test.js`

- [ ] **Step 1: Escrever/ajustar os testes**

Em `pokemon/test/pve.test.js`, no bloco do `rkMoves` (por volta da linha 132), adicione `turns` aos golpes rápidos para exercitar o caminho novo:

```javascript
const rkMoves = {
  STRONG_FAST: { type: 'ground', kind: 'fast',   pvp: { power: 3,  energy: 12, turns: 1 } },
  WEAK_FAST:   { type: 'normal', kind: 'fast',   pvp: { power: 5,  energy: 3,  turns: 1 } },
  CHEAP_CHG:   { type: 'rock',   kind: 'charge', pvp: { power: 50, energy: 35 } },
  PRICEY_CHG:  { type: 'rock',   kind: 'charge', pvp: { power: 110,energy: 55 } },
};
```

(Os 4 testes existentes de `rocketSpam` continuam válidos: com `turns:1`, turnos = ativações.)

Adicione dois testes novos no final do arquivo:

```javascript
test('rocketSpam: golpe rápido lento (2 turnos) dobra os turnos p/ carregar → false', () => {
  const slow = {
    SLOW_FAST: { type: 'ground', kind: 'fast',   pvp: { power: 3, energy: 12, turns: 2 } },
    CHEAP_CHG: { type: 'rock',   kind: 'charge', pvp: { power: 50, energy: 35 } },
  };
  // ativações 35/12 = 2.92 × 2 turnos = 5.84 > 4 → não é spam
  assert.strictEqual(rocketSpam(['SLOW_FAST', 'CHEAP_CHG'], slow), false);
});

test('rocketSpam: sem duração (turns ausente) usa ativações (fallback gracioso)', () => {
  const noT = {
    F: { type: 'x', kind: 'fast',   pvp: { power: 3, energy: 12 } },
    C: { type: 'y', kind: 'charge', pvp: { power: 50, energy: 35 } },
  };
  assert.strictEqual(rocketSpam(['F', 'C'], noT), true);   // 35/12 = 2.92 <= 4
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/pve.test.js`
Expected: FAIL no teste "golpe rápido lento (2 turnos)" — a versão atual ignora `turns` (2.92 <= 4 → true, mas esperamos false).

- [ ] **Step 3: Implementar**

Em `pokemon/lib/meta/pve.js`, troque `rocketSpam`:

```javascript
  function rocketSpam(moveIds, movesById) {
    if (!moveIds || !moveIds.length || !movesById) return false;
    var bestFast = null, cheapestCharged = Infinity;
    for (var i = 0; i < moveIds.length; i++) {
      var m = movesById[moveIds[i]];
      if (!m || !m.pvp) continue;
      if (m.kind === 'fast') {
        // "mais forte" = mais energia por turno (com fallback p/ energia por ativação).
        var ept = m.pvp.turns ? (m.pvp.energy / m.pvp.turns) : m.pvp.energy;
        if (!bestFast || ept > bestFast.ept)
          bestFast = { energy: m.pvp.energy, turns: m.pvp.turns || null, ept: ept };
      } else if (m.kind === 'charge') {
        if (m.pvp.energy > 0 && m.pvp.energy < cheapestCharged) cheapestCharged = m.pvp.energy;
      }
    }
    if (!bestFast || !(bestFast.energy > 0) || cheapestCharged === Infinity) return false;
    var activations = cheapestCharged / bestFast.energy;
    // turnos reais = ativações × turnos por ativação; sem duração → usa ativações (fallback).
    var turnsToCharge = bestFast.turns ? activations * bestFast.turns : activations;
    return turnsToCharge <= ROCKET_SPAM_TURNS;
  }
```

Atualize também o comentário acima da função (remova a nota "refino de Fase 4" — agora foi feito).

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/pve.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```
git add pokemon/lib/meta/pve.js pokemon/test/pve.test.js
git commit -m "fase4: rocketSpam por turnos reais do golpe rápido (fallback p/ ativações)"
```

---

## Task 6: Afrouxar os limiares de PvP (valores provisórios; calibração final na Task 11)

Hoje `great`/`ultra` exigem `spPct >= 0.99` **ou** `ivRank <= 50/4096` (só Gyarados hundo passa). Afrouxamos para virar shortlist. Valores aqui são **provisórios** — a Task 11 calibra contra a coleção real.

**Files:**
- Modify: `pokemon/lib/meta/pvp.js` (`THRESHOLDS`)
- Test: `pokemon/test/pvp.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `pokemon/test/pvp.test.js`:

```javascript
const { pvpTags, THRESHOLDS } = require('../lib/meta/pvp.js');

test('pvpTags: cópia "muito boa" (não perfeita) de espécie meta agora ganha tag', () => {
  // ivRank 180/4096 e spPct 0.972 — reprovaria nos limiares antigos (0.99 / 50).
  const pvp = {
    great:  { isMeta: true, speciesRank: 30, ivRank: 180, spPct: 0.972, movesetOk: true, moveset: [] },
    ultra:  { isMeta: false, ivRank: null, spPct: null },
    master: { isMeta: false },
  };
  assert.ok(pvpTags(pvp, 80).includes('pvp_great'), 'shortlist útil: tag concedida');
});

test('THRESHOLDS great/ultra afrouxados em relação ao rigor antigo', () => {
  assert.ok(THRESHOLDS.great.spPct <= 0.97, 'spPct afrouxado');
  assert.ok(THRESHOLDS.great.ivRank >= 100, 'ivRank afrouxado');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/pvp.test.js`
Expected: FAIL — com `spPct 0.99 / ivRank 50`, a cópia 0.972 / 180 não recebe tag.

- [ ] **Step 3: Implementar (valores provisórios)**

Em `pokemon/lib/meta/pvp.js`, troque `THRESHOLDS`:

```javascript
  // Limiares de "essa cópia presta?" — calibrados p/ shortlist útil (Fase 4).
  // spPct = stat product / melhor da liga; ivRank = posição entre os 4096 IVs.
  var THRESHOLDS = {
    great:  { spPct: 0.97, ivRank: 200 },
    ultra:  { spPct: 0.97, ivRank: 200 },
    master: { ivPct: 96 },
  };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/pvp.test.js`
Expected: PASS. Rode também a suíte toda — confirme que o pivô do Gyarados (pvp_master) segue verde: `node --test pokemon/test/*.test.js`.

- [ ] **Step 5: Commit**

```
git add pokemon/lib/meta/pvp.js pokemon/test/pvp.test.js
git commit -m "fase4: afrouxa limiares PvP p/ shortlist útil (valores provisórios)"
```

---

## Task 7: Dedup do `TYPE_PT` — fonte única em `refdata.js`

`analysis.js` (`TYPE_PT`) e `render.js` (`TYPE_PT_PVE`) têm o mesmo mapa. Movemos para `refdata.js` (já carregado antes dos dois no `index.html`, linha 181) e consumimos nos dois.

**Files:**
- Modify: `pokemon/lib/refdata.js`, `pokemon/lib/analysis.js`, `pokemon/lib/render.js`
- Test: `pokemon/test/refdata.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `pokemon/test/refdata.test.js`:

```javascript
const { TYPE_PT } = require('../lib/refdata.js');

test('refdata exporta TYPE_PT (fonte única dos nomes de tipo em PT)', () => {
  assert.strictEqual(TYPE_PT.fire, 'Fogo');
  assert.strictEqual(TYPE_PT.dark, 'Sombrio');
  assert.strictEqual(Object.keys(TYPE_PT).length, 18);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/refdata.test.js`
Expected: FAIL — `TYPE_PT` é `undefined` em refdata.

- [ ] **Step 3: Implementar**

Em `pokemon/lib/refdata.js`, adicione a const antes do `return` e exporte-a:

```javascript
  // Nomes de tipo em PT-BR (fonte única; consumido por analysis.js e render.js).
  const TYPE_PT = { normal:'Normal', fire:'Fogo', water:'Água', electric:'Elétrico', grass:'Planta',
    ice:'Gelo', fighting:'Lutador', poison:'Venenoso', ground:'Terrestre', flying:'Voador',
    psychic:'Psíquico', bug:'Inseto', rock:'Pedra', ghost:'Fantasma', dragon:'Dragão',
    dark:'Sombrio', steel:'Aço', fairy:'Fada' };

  return { LEGENDARY, REGIONAL, TRADE_EVO, TYPE_PT };
```

Em `pokemon/lib/analysis.js`, **remova** o bloco `const TYPE_PT = {...}` (linhas ~226-229) e, junto dos outros `require` do topo (após o `PokePve`), adicione a resolução dual Node/browser:

```javascript
  var TYPE_PT = ((typeof require === 'function')
    ? require('./refdata.js') : (typeof globalThis !== 'undefined' ? globalThis : {})).TYPE_PT || {};
```

Em `pokemon/lib/render.js`, **remova** o bloco `const TYPE_PT_PVE = {...}` (linhas ~72-75) e adicione no topo do factory (logo após `function esc(...)` ou antes de `competitiveHtml`):

```javascript
  var TYPE_PT = ((typeof require === 'function')
    ? require('./refdata.js') : (typeof globalThis !== 'undefined' ? globalThis : {})).TYPE_PT || {};
```

Ainda em `render.js`, na `competitiveHtml`, troque a única referência `TYPE_PT_PVE[t]` por `TYPE_PT[t]`:

```javascript
        const tipoPt = TYPE_PT[t] || t || '';
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/*.test.js`
Expected: PASS (refdata + render + analysis seguem verdes — `render.test.js` exercita `competitiveHtml`).

- [ ] **Step 5: Commit**

```
git add pokemon/lib/refdata.js pokemon/lib/analysis.js pokemon/lib/render.js pokemon/test/refdata.test.js
git commit -m "fase4: TYPE_PT em fonte única (refdata) — remove duplicata analysis/render"
```

---

## Task 8: Justificativa PvE mais rastreável (rank do tipo)

Hoje a ação PvE diz "atacante recomendado (estimativa)" sem o rank. Acrescentamos "Top N atacante de {tipo}" usando o `erRank` do melhor tipo.

**Files:**
- Modify: `pokemon/lib/analysis.js` (`_pveAction`)
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `pokemon/test/verdict.test.js` (usa `computeAction` exportado por analysis.js):

```javascript
const { computeAction } = require('../lib/analysis.js');

test('computeAction: justificativa de Raid inclui o rank do tipo (rastreável)', () => {
  const e = {
    tags: ['raid'], isShadow: false, ivPct: 90, betterCopy: null, moveIds: ['ICE_SHARD','AVALANCHE'], eliteMoves: [],
    pvpMeta: null,
    pveMeta: { raid: true, pve: true, gymAtk: false, gymDef: false, movesetOk: true,
               bestType: 'ice', bestMoveset: ['ICE_SHARD','AVALANCHE'],
               byType: { ice: { erRank: 8, dpsRank: 6 } }, defBulkRank: 300 },
  };
  const a = computeAction(e);
  assert.strictEqual(a.kind, 'FORTALECER');
  assert.match(a.reason, /Top 8/);   // rank do tipo aparece na justificativa
  assert.match(a.reason, /Gelo/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/verdict.test.js`
Expected: FAIL — a justificativa atual não traz "Top 8".

- [ ] **Step 3: Implementar**

Em `pokemon/lib/analysis.js`, troque a função `_pveAction`:

```javascript
  // Ação a partir do papel de atacante PvE (raid > gym_atk). null se o mon não é atacante.
  function _pveAction(e) {
    if (!e.pveMeta) return null;
    const role = e.pveMeta.raid ? 'raid' : (e.pveMeta.gymAtk ? 'gym_atk' : null);
    if (!role) return null;
    const tipo = TYPE_PT[e.pveMeta.bestType] || e.pveMeta.bestType || 'ataque';
    const papel = role === 'raid' ? 'Raid' : 'Ataque de Ginásio';
    const bt = e.pveMeta.bestType && e.pveMeta.byType ? e.pveMeta.byType[e.pveMeta.bestType] : null;
    const rankTxt = (bt && typeof bt.erRank === 'number') ? ' — Top ' + bt.erRank + ' atacante de ' + tipo : '';
    if (e.pveMeta.movesetOk) {
      return { kind: 'FORTALECER', role: role,
        reason: 'Fortalecer p/ ' + papel + ' (' + tipo + ')' + rankTxt + ' (estimativa)' };
    }
    return _notReadyAction(e,
      'Ensinar/TM p/ ' + papel + ' (' + tipo + ')' + rankTxt + ' — falta o moveset de ataque (estimativa)');
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/*.test.js`
Expected: PASS (verdict + e2e seguem verdes).

- [ ] **Step 5: Commit**

```
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "fase4: justificativa de ação PvE com rank do tipo (rastreável)"
```

---

## Task 9: Sorter competitivo por rank em `sort.js`

Quando um chip competitivo está ativo, a lista ordena pelo rank daquela dimensão (melhor primeiro), com desempate `IV% → nome`. Chips competitivos com rank: `pvp_great`, `pvp_ultra`, `pvp_master` (por `ivRank`), `raid` (menor `erRank` entre tipos), `gym_def` (por `defBulkRank`).

**Files:**
- Modify: `pokemon/lib/sort.js`
- Test: `pokemon/test/sort.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao final de `pokemon/test/sort.test.js`:

```javascript
const { rankFor, competitiveRankSorter, COMP_RANK_KEYS } = require('../lib/sort.js');

const mkPvp = (ivRank) => ({ great: { isMeta: true, ivRank }, ultra: { isMeta: false }, master: { isMeta: false } });

test('rankFor: pvp usa ivRank; ausente → Infinity', () => {
  assert.strictEqual(rankFor({ pvpMeta: mkPvp(12) }, 'pvp_great'), 12);
  assert.strictEqual(rankFor({ pvpMeta: null }, 'pvp_great'), Infinity);
});

test('rankFor: raid usa o menor erRank entre os tipos', () => {
  const e = { pveMeta: { byType: { ice: { erRank: 9 }, water: { erRank: 4 } } } };
  assert.strictEqual(rankFor(e, 'raid'), 4);
});

test('rankFor: gym_def usa defBulkRank', () => {
  assert.strictEqual(rankFor({ pveMeta: { defBulkRank: 2 } }, 'gym_def'), 2);
});

test('competitiveRankSorter: ordena por rank asc, desempata por IV% e nome', () => {
  const a = { name: 'Azu', ivPct: 90, pvpMeta: mkPvp(40) };
  const b = { name: 'Bel', ivPct: 95, pvpMeta: mkPvp(10) };
  const c = { name: 'Cce', ivPct: 80, pvpMeta: mkPvp(10) };
  const sorted = [a, b, c].slice().sort(competitiveRankSorter('pvp_great'));
  assert.deepStrictEqual(sorted.map(x => x.name), ['Bel', 'Cce', 'Azu']); // rank 10 antes de 40; IV 95 antes de 80
});

test('COMP_RANK_KEYS lista as dimensões ranqueáveis', () => {
  assert.ok(COMP_RANK_KEYS.includes('pvp_great'));
  assert.ok(COMP_RANK_KEYS.includes('raid'));
  assert.ok(COMP_RANK_KEYS.includes('gym_def'));
  assert.ok(!COMP_RANK_KEYS.includes('rocket')); // rocket não tem rank
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/sort.test.js`
Expected: FAIL — `rankFor`/`competitiveRankSorter`/`COMP_RANK_KEYS` não existem.

- [ ] **Step 3: Implementar**

Em `pokemon/lib/sort.js`, antes do `return { ... }` final, adicione:

```javascript
  // Dimensões competitivas com rank (rocket não tem rank → fora).
  const COMP_RANK_KEYS = ['pvp_great', 'pvp_ultra', 'pvp_master', 'raid', 'gym_def'];

  // Rank do mon na dimensão do chip ativo. Menor = melhor. Ausente → Infinity (vai p/ o fim).
  function rankFor(e, key) {
    if (key === 'pvp_great' || key === 'pvp_ultra' || key === 'pvp_master') {
      const lg = key.slice(4);
      const L = e.pvpMeta && e.pvpMeta[lg];
      return (L && L.isMeta && typeof L.ivRank === 'number') ? L.ivRank : Infinity;
    }
    if (key === 'raid') {
      const bt = e.pveMeta && e.pveMeta.byType;
      if (!bt) return Infinity;
      let best = Infinity;
      for (const t in bt) if (typeof bt[t].erRank === 'number' && bt[t].erRank < best) best = bt[t].erRank;
      return best;
    }
    if (key === 'gym_def') {
      return (e.pveMeta && typeof e.pveMeta.defBulkRank === 'number') ? e.pveMeta.defBulkRank : Infinity;
    }
    return Infinity;
  }

  // Comparador: rank asc, desempate IV% desc, depois nome.
  function competitiveRankSorter(key) {
    return (a, b) => (rankFor(a, key) - rankFor(b, key)) || (b.ivPct - a.ivPct) || byName(a, b);
  }
```

Troque o `return` final para exportar os três:

```javascript
  return { COMPARATORS, SORT_OPTIONS, getSorter, COMP_RANK_KEYS, rankFor, competitiveRankSorter };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/sort.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```
git add pokemon/lib/sort.js pokemon/test/sort.test.js
git commit -m "fase4: sorter competitivo por rank (pvp ivRank / raid erRank / gym_def bulk)"
```

---

## Task 10: `app.js` aplica o sort por rank quando há chip competitivo ativo

Wiring de UI (sem teste unitário — `app.js` é o controller do browser; validação manual + e2e da Task 11). Quando `state.special` é uma dimensão ranqueável, o sort por rank manda; senão, mantém o sort do seletor.

**Files:**
- Modify: `pokemon/app.js` (`applyFilters`)

- [ ] **Step 1: Implementar**

Em `pokemon/app.js`, dentro de `applyFilters`, troque a linha do sort:

```javascript
    rows = rows.slice().sort(getSorter(state.sort));
```

por:

```javascript
    // Com um chip competitivo ranqueável ativo, ordena pelo rank daquela dimensão (melhor primeiro).
    const sorter = (state.special && COMP_RANK_KEYS.includes(state.special))
      ? competitiveRankSorter(state.special)
      : getSorter(state.sort);
    rows = rows.slice().sort(sorter);
```

(`COMP_RANK_KEYS` e `competitiveRankSorter` são globais via `sort.js`, carregado antes de `app.js` no `index.html`.)

- [ ] **Step 2: Verificação manual (smoke) via Node**

Confirme que `sort.js` expõe os símbolos no escopo global como o browser espera:

Run:
```
node -e "global.window=global; require('./pokemon/lib/sort.js'); console.log(typeof competitiveRankSorter, Array.isArray(COMP_RANK_KEYS))"
```
Expected: `function true`

- [ ] **Step 3: Suíte completa (não-regressão)**

Run: `node --test pokemon/test/*.test.js`
Expected: PASS (sem novos testes; garante que nada quebrou).

- [ ] **Step 4: Commit**

```
git add pokemon/app.js
git commit -m "fase4: lista reordena por rank quando há chip competitivo ativo"
```

---

## Task 11: Regenerar datasets, calibrar limiares e verificar na coleção real

Roda o build (download do gamemaster + rankings), calibra `THRESHOLDS` (PvP) e `ROCKET_SPAM_TURNS` para a shortlist alvo, e verifica os invariantes na coleção de 592 mons.

**Files:**
- Modify (dados): `pokemon/data/*` (gerados)
- Modify (calibração): `pokemon/lib/meta/pvp.js` (`THRESHOLDS`), `pokemon/lib/meta/pve.js` (`ROCKET_SPAM_TURNS`), e o teste `pokemon/test/pve.test.js` (`ROCKET_SPAM_TURNS === N`).

- [ ] **Step 1: Regenerar os datasets**

Run (do raiz do repo; precisa de rede):
```
node pokemon/build/refresh-meta.js
```
Expected: termina sem erro e atualiza `pokemon/data/species.json`, `moves.json`, `pve_ranks.json`, `pvp_ranks.json`, `cpm.json`, `meta.json`. (Se a validação defensiva do build falhar por mudança de schema, pare e investigue — não force.)

- [ ] **Step 2: Script de verificação e2e na coleção real**

Crie um script temporário `pokemon/build/_verify-fase4.js` (apagado no fim) que carrega os datasets + `colecao.json` e imprime as contagens:

```javascript
// pokemon/build/_verify-fase4.js — verificação temporária da Fase 4 (apagar depois)
const fs = require('fs');
const path = require('path');
const P = (f) => path.join(__dirname, '..', f);
const J = (f) => JSON.parse(fs.readFileSync(P(f), 'utf8'));

global.window = global;
require('../sizes.js');
require('../lib/refdata.js');
require('../lib/meta/match.js');
require('../lib/meta/pvp.js');
require('../lib/meta/pve.js');
require('../lib/analysis.js');

const species = J('data/species.json');
const meta = {
  speciesIndex: buildSpeciesIndex(species),
  movesPt: J('data/moves_pt.json'),
  pvpRanks: J('data/pvp_ranks.json'),
  cpm: J('data/cpm.json'),
  pveRanks: J('data/pve_ranks.json'),
  moves: J('data/moves.json'),
};
const col = J('colecao.json');
const t0 = Date.now();
const list = analyze(col.fileData, getPokemonSize, { LEGENDARY, REGIONAL, TRADE_EVO }, getPokemonSizeScalar, meta);
const c = computeCounts(list);
const actions = {};
let metaInTransfer = 0;
for (const e of list) {
  if (e.action) actions[e.action.kind] = (actions[e.action.kind] || 0) + 1;
  if (e.verdict === 'TRANSFERIR' && (isPvpMeta(e) || isPveMeta(e))) metaInTransfer++;
}
console.log('mons:', list.length, 'ms:', Date.now() - t0);
console.log('PvP  great/ultra/master:', c.pvpGreat, c.pvpUltra, c.pvpMaster);
console.log('PvE  raid/pve/gymAtk/gymDef/rocket:', c.raid, c.pve, c.gymAtk, c.gymDef, c.rocket);
console.log('ações:', JSON.stringify(actions));
console.log('INVARIANTE meta em TRANSFERIR (deve ser 0):', metaInTransfer);
```

Run: `node pokemon/build/_verify-fase4.js`
Expected: imprime as contagens; **meta em TRANSFERIR = 0**.

- [ ] **Step 3: Calibrar `THRESHOLDS` (PvP)**

Meta: shortlist útil de ~**15-30** picks somando `pvpGreat + pvpUltra + pvpMaster`. Ajuste `THRESHOLDS` em `pokemon/lib/meta/pvp.js` e rode o Step 2 de novo até cair na faixa:
- Se vier **abaixo de ~15**: afrouxe (suba `ivRank`, ex. 200→350; baixe `spPct`, ex. 0.97→0.95).
- Se vier **acima de ~30**: aperte (desça `ivRank`; suba `spPct`).
- `master.ivPct`: ajuste p/ incluir hundos/quase-hundos de espécies meta (faixa 95-97).

Anote os valores finais num comentário em `THRESHOLDS` (ex.: `// calibrado: N picks na coleção de 592`).

- [ ] **Step 4: Calibrar `ROCKET_SPAM_TURNS`**

Agora o `rocketSpam` usa turnos reais (Task 5), então a métrica mudou de "ativações" p/ "turnos". Ajuste `ROCKET_SPAM_TURNS` em `pokemon/lib/meta/pve.js` para a tag `rocket` ficar numa shortlist (alvo: **dezenas, não a coleção inteira** — referência da Fase 3 era ~9% / ~53 mons). Rode o Step 2 e observe o `rocket:` count. Atualize também:
- O comentário/assert do teste: em `pokemon/test/pve.test.js`, troque `assert.strictEqual(ROCKET_SPAM_TURNS, 4)` para o novo valor calibrado.

- [ ] **Step 5: Verificar pivôs e suíte**

Confirme no output do Step 2 que os pivôs seguem coerentes (ex.: Gyarados ainda aparece em pvp_master; Chansey/Blissey em gym_def; algum Sombrio ganhando raid agora). Depois:

Run: `node --test pokemon/test/*.test.js`
Expected: PASS (com o assert de `ROCKET_SPAM_TURNS` atualizado).

- [ ] **Step 6: Limpar e commitar**

```
rm pokemon/build/_verify-fase4.js
git add pokemon/data pokemon/lib/meta/pvp.js pokemon/lib/meta/pve.js pokemon/test/pve.test.js
git commit -m "fase4: regenera datasets + calibra limiares PvP/Rocket na coleção real"
```

---

## Task 12: Bump do service worker + verificação final

Dados e lógica de runtime mudaram → invalidar cache. Fechamento da fase.

**Files:**
- Modify: `pokemon/sw.js`

- [ ] **Step 1: Bump da versão do cache**

Em `pokemon/sw.js` (linha 1), troque:

```javascript
const CACHE = 'pokemon-leo-v11';
```
por:
```javascript
const CACHE = 'pokemon-leo-v12';
```

- [ ] **Step 2: Suíte completa verde**

Run: `node --test pokemon/test/*.test.js`
Expected: PASS — total ≥ 166 (baseline) + os testes novos da Fase 4.

- [ ] **Step 3: Commit**

```
git add pokemon/sw.js
git commit -m "fase4: sw cache v11 -> v12"
```

- [ ] **Step 4: Atualizar a memória do projeto**

Atualize `C:\Users\leona\.claude\projects\I--Meu-Drive-Site-moreno-arquitetura\memory\pokemon-meta-competitivo.md`: marcar Fase 4 como implementada (branch `claude/pokemon-meta-fase4`), registrar valores calibrados de `THRESHOLDS` e `ROCKET_SPAM_TURNS`, contagens finais e o número do PR.

---

## Self-Review

**1. Spec coverage (§14):**
- §14.2 PvP afrouxar → Task 6 + calibração Task 11. ✓
- §14.2 Sombrio (build) → Task 1 + Task 3. ✓
- §14.2 Sombrio (casamento `_shadow`) → Task 2 (via `evalMon`, sem mexer no `matchSpecies`; mais simples e sem regredir PvP, que segue na espécie-base). ✓
- §14.2 Rocket duração real → Task 4 + Task 5 + calibração Task 11. ✓
- §14.3 Filtro de formas (Mega/Primal fora; Sombrio fica) → Task 3. ✓
- §14.4 Ordenação por rank (UI) → Task 9 + Task 10. ✓
- §14.4 Desempate no build → Task 3 (sorts de `buildPveRanks`). ✓
- §14.5 Justificativas → Task 8 (PvE; PvP já era rastreável). ✓
- §14.6 TYPE_PT dedup → Task 7. ✓
- §14.6 spec legacyMoves→eliteMoves → já commitado (spec §14). ✓
- §14.7 Invariantes (meta nunca TRANSFERIR; suíte verde) → Task 11 Step 2 + Task 12. ✓

**Desvio consciente vs spec §14.2:** o spec citava "conserto do `match.js` p/ casar `_shadow`". Implementamos o equivalente em `evalMon` (Task 2): mais cirúrgico, mantém `e.speciesId` na base (PvP/eliteMoves intactos) e dá o boost de PvE via lookup `_shadow`. Mesmo efeito final, menor superfície de regressão.

**2. Placeholder scan:** sem TBD/TODO; todo passo tem código ou comando concreto. Os valores de calibração (Task 11) são empíricos por design (método e alvos explícitos), não placeholders.

**3. Type/símbolo consistency:** `SHADOW_ATK_MULT`/`SHADOW_DEF_MULT` (Task 1) exportados e usados; `isShadowId`/`MEGA_RE` (Task 3) locais ao build; `pvp.turns` (Task 4) consumido por `rocketSpam` (Task 5); `defBulkRank` exposto (Task 2) e consumido por `rankFor` (Task 9); `COMP_RANK_KEYS`/`competitiveRankSorter`/`rankFor` (Task 9) consumidos por `app.js` (Task 10). Coerentes.
