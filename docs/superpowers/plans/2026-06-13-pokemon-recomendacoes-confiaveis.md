# Recomendações "Shortlist confiável" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer EVOLUIR e AGUARDAR_ROCKET respeitarem o mesmo limiar de meta calibrado do resto do app, projetando a evolução pelos avaliadores PvP/PvE reais, e corrigir nomes de golpe sem PT.

**Architecture:** Toda recomendação de ação passa a depender de um sinal único `e.evoProj` (projeção da forma evoluída avaliada com os IVs da cópia, value-gated). `analyze` vira 2 passadas: (1) meta+tags+projeção; (2) posse+ações+veredito. `render.js` e `computeCounts` ficam intactos (consomem só `action.kind`/`action.reason`).

**Tech Stack:** JavaScript UMD puro (sem build), Node `node --test` runner. Arquivos: `pokemon/lib/analysis.js`, `pokemon/lib/refdata.js`, `pokemon/test/*`.

**Spec:** `docs/superpowers/specs/2026-06-13-pokemon-recomendacoes-confiaveis-design.md`

**Convenções do repo (ler antes de começar):**
- Rodar testes a partir de `pokemon/`: `npm test` (= `node --test`). Um arquivo só: `node --test test/<arquivo>.test.js`.
- Módulos são UMD: `analysis.js` importa `refdata.js` via `require('./refdata.js')` no Node e via `globalThis` no browser (refdata faz `Object.assign(root, api)`).
- **Rodar a suíte INTEIRA entre tasks** — o shape do objeto enriquecido é compartilhado por enrich/analyze/render; um campo novo quebra testes cross-file.
- Commits frequentes, um por task. Mensagens em PT, terminar com a linha `Co-Authored-By` do repo.

---

## Task 1: Localização — `MOVE_PT_OVERRIDE` para golpes sem `namePt`

15 golpes em `data/moves.json` não têm `namePt` e vazam em inglês (ex.: "Chilling Water").
Como `data/moves.json` é gerado por `build/refresh-meta.js`, a correção é um dicionário de
override em `refdata.js`, consultado por `_moveName` antes do humanizado-inglês.

**Files:**
- Modify: `pokemon/lib/refdata.js`
- Modify: `pokemon/lib/analysis.js` (`_moveName` + import)
- Test: `pokemon/test/moveset_pt.test.js` (criar)

- [ ] **Step 1: Escrever o teste que falha**

Criar `pokemon/test/moveset_pt.test.js`:

```js
// pokemon/test/moveset_pt.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const refdata = require('../lib/refdata.js');
const { computeAction } = require('../lib/analysis.js');

test('refdata expõe MOVE_PT_OVERRIDE com nomes PT', () => {
  assert.strictEqual(refdata.MOVE_PT_OVERRIDE.CHILLING_WATER, 'Água Refrescante');
  assert.strictEqual(refdata.MOVE_PT_OVERRIDE.FUTURE_SIGHT, 'Premonição');
});

test('computeAction: golpe recomendado sem namePt usa override PT (não inglês)', () => {
  const e = {
    ivPct: 67, tags: ['pvp_great'], isShadow: false, betterCopy: null,
    moveIds: ['COUNTER'], eliteMoves: [],
    pvpMeta: {
      great:  { isMeta: true, speciesRank: 5, ivRank: 1, spPct: 1, movesetOk: false,
                moveset: ['COUNTER', 'CHILLING_WATER'] },
      ultra:  { isMeta: false }, master: { isMeta: false },
    },
    pveMeta: null,
  };
  const meta = { moves: { COUNTER: { namePt: 'Contra-ataque' } } }; // CHILLING_WATER sem namePt
  const a = computeAction(e, meta);
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /Água Refrescante/);
  assert.doesNotMatch(a.reason, /Chilling/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run (em `pokemon/`): `node --test test/moveset_pt.test.js`
Expected: FAIL — `refdata.MOVE_PT_OVERRIDE` é `undefined`; a 2ª asserção mostra "Chilling Water".

- [ ] **Step 3: Adicionar `MOVE_PT_OVERRIDE` ao `refdata.js`**

Em `pokemon/lib/refdata.js`, antes do `return { ... }` final, adicionar:

```js
  // Nomes PT de exibição para golpes que o i18n upstream (PokeMiners) ainda não traduz.
  // Consumido por _moveName (analysis.js) como fallback ANTES do humanizado-inglês.
  // Robusto a regenerações de data/moves.json (gerado por build/refresh-meta.js).
  const MOVE_PT_OVERRIDE = {
    AURA_WHEEL_DARK: 'Roda de Aura (Sombrio)',
    AURA_WHEEL_ELECTRIC: 'Roda de Aura (Elétrico)',
    BEAK_BLAST: 'Rajada de Bico',
    CHILLING_WATER: 'Água Refrescante',
    DRUM_BEATING: 'Batida de Tambor',
    DYNAMAX_CANNON: 'Canhão Dynamax',
    FUTURE_SIGHT: 'Premonição',
    GIGATON_HAMMER: 'Martelo Gigatônico',
    HIDDEN_POWER_NORMAL: 'Poder Oculto',
    MIND_BLOWN: 'Alucinação',
    PLASMA_FISTS: 'Punhos de Plasma',
    PYRO_BALL: 'Bola de Fogo',
    SECRET_SWORD: 'Espada Secreta',
    SPRINGTIDE_STORM: 'Tempestade Primaveril',
    TECHNO_BLAST_DOUSE: 'Tecnorrajada (Água)',
  };
```

E trocar a linha de return final para incluí-lo:

```js
  return { LEGENDARY, REGIONAL, TRADE_EVO, TYPE_PT, MOVE_PT_OVERRIDE };
```

- [ ] **Step 4: Consumir o override em `_moveName` (analysis.js)**

Em `pokemon/lib/analysis.js`, logo após a definição de `TYPE_PT` (linha ~20), adicionar o import:

```js
  var MOVE_PT_OVERRIDE = ((typeof require === 'function')
    ? require('./refdata.js') : (typeof globalThis !== 'undefined' ? globalThis : {})).MOVE_PT_OVERRIDE || {};
```

Trocar a função `_moveName`:

```js
  // Nome de exibição de um moveId: namePt (moves.json) → override PT → inglês humanizado.
  function _moveName(id, meta) {
    const m = meta && meta.moves && meta.moves[id];
    return (m && m.namePt) || MOVE_PT_OVERRIDE[id] || _humanMove(id);
  }
```

- [ ] **Step 5: Rodar o teste do arquivo e a suíte inteira**

Run: `node --test test/moveset_pt.test.js` → Expected: PASS
Run: `npm test` → Expected: todos os testes PASS (nenhuma regressão).

- [ ] **Step 6: Commit**

```bash
git add pokemon/lib/refdata.js pokemon/lib/analysis.js pokemon/test/moveset_pt.test.js
git commit -m "feat(pokemon): override PT p/ 15 golpes sem namePt (não vazar inglês)"
```

---

## Task 2: Projeção de evolução (núcleo) — `_buildEvoCandidates` + `_projectEvolution`

Substitui a lógica frouxa (`_buildEvoMetaIndex`/`_metaEvoFor`/`_isMetaSpecies`) por: índice de
candidatos a evolução + projeção da forma evoluída pelos avaliadores reais. Define `e.evoProj`
(value-ok) e recomputa `e.metaEvo`/`e.metaEvoTarget`. Nesta task o `_evolveAction` **antigo
permanece** (refatorado na Task 3); só a fonte de `metaEvo` fica estrita.

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/evo_projection.test.js` (criar)

- [ ] **Step 1: Escrever os testes que falham**

Criar `pokemon/test/evo_projection.test.js`:

```js
// pokemon/test/evo_projection.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze } = require('../lib/analysis.js');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

// pveRanks SINTÉTICO: só a evolução base (machamp) é atacante de raid; Machop não tem entrada.
function metaMachampRaid() {
  return {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'golpe de carate': 'KARATE_CHOP' },
    pveRanks: { machamp: { roles: ['raid', 'gym_atk'], bestType: 'fighting',
      bestMoveset: ['COUNTER', 'CROSS_CHOP'],
      byType: { fighting: { dps: 18, tdo: 500, er: 50, dpsRank: 3, erRank: 6 } }, defBulkRank: 999 } },
  };
}
function machop(over) {
  return Object.assign({ mon_name: 'Machop', mon_number: 66, mon_cp: 500,
    mon_height: 0.8, mon_isShiny: 'NO', mon_isLucky: 'NO', mon_move_1: 'Golpe de Caratê' }, over);
}

test('projeção PvE com IV alto → e.evoProj (kind pve) + metaEvo + alvo', () => {
  const fd = { m: machop({ mon_attack: 14, mon_defence: 14, mon_stamina: 13 }) }; // 91%
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, metaMachampRaid())[0];
  assert.strictEqual(e.pveMeta, null);                 // o Machop em si não é meta
  assert.ok(e.evoProj, 'tem evoProj');
  assert.strictEqual(e.evoProj.kind, 'pve');
  assert.strictEqual(e.evoProj.role, 'raid');
  assert.strictEqual(e.evoProj.targetId, 'machamp');
  assert.strictEqual(e.metaEvo, true);
  assert.strictEqual(e.metaEvoTarget, 'Machamp');
});

test('projeção PvE com IV abaixo do piso (58%) → SEM evoProj (corta Zweilous-like)', () => {
  const fd = { m: machop({ mon_attack: 9, mon_defence: 9, mon_stamina: 8 }) }; // 26/45 = 58%
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, metaMachampRaid())[0];
  assert.strictEqual(e.evoProj, null);
  assert.strictEqual(e.metaEvo, false);
});

test('evolução não-meta → SEM evoProj', () => {
  const meta = { speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: {}, pveRanks: {} };  // ninguém é meta
  const fd = { m: machop({ mon_attack: 15, mon_defence: 15, mon_stamina: 15 }) };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.evoProj, null);
  assert.strictEqual(e.metaEvo, false);
});

test('evolução regional respeita a região (Grimer Alola → Muk Alolan)', () => {
  const meta = { speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: {}, pveRanks: { muk_alolan: { roles: ['raid'], bestType: 'dark',
      bestMoveset: ['BITE', 'CRUNCH'], byType: { dark: { erRank: 9 } }, defBulkRank: 999 } } };
  const fd = { g: { mon_name: 'Grimer', mon_number: 88, mon_form: 'GRIMER_ALOLA', mon_cp: 500,
    mon_attack: 14, mon_defence: 14, mon_stamina: 14, mon_height: 0.7, mon_isShiny: 'NO', mon_isLucky: 'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.ok(e.evoProj);
  assert.strictEqual(e.evoProj.targetId, 'muk_alolan');
  assert.match(e.metaEvoTarget, /Alolan/);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test test/evo_projection.test.js`
Expected: FAIL — `e.evoProj` é `undefined` (campo ainda não existe).

- [ ] **Step 3: Adicionar `evoProj`/`evoOwned` aos defaults de `enrichOne`**

Em `pokemon/lib/analysis.js`, no objeto retornado por `enrichOne`, trocar o bloco da Fase 3+:

```js
      // Fase 3+ — relevância de meta da linha evolutiva (preenchida por analyze):
      // evoProj = projeção value-ok da forma evoluída (ou null); metaEvo = !!evoProj.
      metaEvo: false,
      metaEvoTarget: null,
      evoProj: null,
      evoOwned: false,
      action: null,
```

- [ ] **Step 4: Substituir o índice de evolução por candidatos + projeção**

Em `pokemon/lib/analysis.js`, **remover** as funções `_buildEvoMetaIndex`, `_metaEvoFor` e
`_isMetaSpecies` (mantém `_bst`, `_regionOf`, `_humanSpecies`). No lugar delas, adicionar:

```js
  // Candidatos de evolução por speciesId base: formas MAIS evoluídas da mesma família e mesma
  // região (proxy: soma de base stats maior). Sem arestas reais de evolução nos dados.
  function _buildEvoCandidates(meta) {
    if (!meta || !meta.speciesIndex || !meta.speciesIndex.byId) return null;
    var byId = meta.speciesIndex.byId;
    var fam = {};
    for (var id in byId) {
      if (/_shadow$/.test(id)) continue;
      var o = byId[id];
      if (!o || !o.family || !o.baseStats) continue;
      (fam[o.family] = fam[o.family] || []).push(id);
    }
    var out = {};
    for (var f in fam) {
      var ids = fam[f];
      for (var i = 0; i < ids.length; i++) {
        var myBst = _bst(byId[ids[i]].baseStats);
        var myRegion = _regionOf(ids[i]);
        var cand = [];
        for (var j = 0; j < ids.length; j++) {
          if (i === j) continue;
          if (_regionOf(ids[j]) !== myRegion) continue;            // evolui dentro da região
          if (_bst(byId[ids[j]].baseStats) > myBst) cand.push(ids[j]);
        }
        if (cand.length) out[ids[i]] = cand;
      }
    }
    return out;
  }

  var PVP_TAG_ORDER = ['pvp_great', 'pvp_ultra', 'pvp_master'];
  // Papéis PvE não filtram por IV (pve.js assume 15/15/15) → evolução só-PvE exige piso de IV.
  var EVOLVE_PVE_MIN_IV = 80;

  // Projeta UMA evolução com os IVs desta cópia pelos avaliadores reais. Retorna objeto
  // value-ok { target, targetId, kind, league, role, speciesRank, spPct, erRank, tipo } ou null.
  function _projectEvolution(e, evolvedId, meta) {
    var syn = { speciesId: evolvedId, ivs: e.ivs, ivPct: e.ivPct, isShadow: e.isShadow, moveIds: [] };
    var pvp = (meta && meta.cpm && meta.pvpRanks && PokePvp) ? PokePvp.evalMon(syn, meta) : null;
    var pve = (meta && meta.pveRanks && PokePve) ? PokePve.evalMon(syn, meta) : null;
    var pvpTags = (pvp && PokePvp) ? PokePvp.pvpTags(pvp, e.ivPct) : [];
    var target = _humanSpecies(evolvedId);
    // PvP tem prioridade e já vem gateado por spPct/ivRank (pvpTags).
    for (var i = 0; i < PVP_TAG_ORDER.length; i++) {
      if (pvpTags.indexOf(PVP_TAG_ORDER[i]) >= 0) {
        var lg = PVP_TAG_ORDER[i].slice(4);                        // great|ultra|master
        var L = pvp[lg];
        return { target: target, targetId: evolvedId, kind: 'pvp', league: lg,
                 speciesRank: L.speciesRank, spPct: L.spPct, role: null, erRank: null, tipo: null };
      }
    }
    // Só PvE (atacante): exige piso de IV explícito.
    var pveAttacker = !!(pve && (pve.raid || pve.gymAtk || pve.pve));
    if (pveAttacker && e.ivPct >= EVOLVE_PVE_MIN_IV) {
      var role = pve.raid ? 'raid' : (pve.gymAtk ? 'gym_atk' : 'pve');
      var bt = pve.bestType && pve.byType ? pve.byType[pve.bestType] : null;
      return { target: target, targetId: evolvedId, kind: 'pve', league: null,
               role: role, speciesRank: null, spPct: null,
               erRank: (bt && typeof bt.erRank === 'number') ? bt.erRank : null,
               tipo: TYPE_PT[pve.bestType] || pve.bestType || 'ataque' };
    }
    return null;
  }

  // Melhor projeção entre os candidatos. Força: pvp_great>ultra>master>raid>gym_atk>pve.
  function _bestEvolveProjection(e, evoCandidates, meta) {
    if (!evoCandidates || !e.speciesId) return null;
    var base = String(e.speciesId).replace(/_shadow$/, '');
    var cands = evoCandidates[base];
    if (!cands) return null;
    var SCORE = { pvp: { great: 5, ultra: 4, master: 3 }, pve: { raid: 2, gym_atk: 1, pve: 0 } };
    var best = null, bestScore = -1;
    for (var i = 0; i < cands.length; i++) {
      var p = _projectEvolution(e, cands[i], meta);
      if (!p) continue;
      var s = p.kind === 'pvp' ? SCORE.pvp[p.league] : SCORE.pve[p.role];
      if (s > bestScore) { best = p; bestScore = s; }
    }
    return best;
  }
```

- [ ] **Step 5: Recompor `analyze` para usar a projeção (ainda 1 passada)**

Em `pokemon/lib/analysis.js`, no corpo de `analyze`, trocar a montagem do índice e o cálculo de
`metaEvo`:

```js
  function analyze(fileData, getSize, refdata, getSizeScalar, meta) {
    const list = enrichCollection(fileData, getSize, refdata, getSizeScalar, meta);
    const evoCandidates = _buildEvoCandidates(meta);
    for (const e of list) {
      e.pvpMeta = (meta && meta.cpm && meta.pvpRanks && PokePvp) ? PokePvp.evalMon(e, meta) : null;
      e.pveMeta = (meta && meta.pveRanks && PokePve) ? PokePve.evalMon(e, meta) : null;
      _attachMovesetViews(e, meta);
      e.isRocketReady = (meta && meta.moves && PokePve)
        ? PokePve.rocketSpam(e.moveIds, meta.moves) : false;
      e.evoProj = _bestEvolveProjection(e, evoCandidates, meta);
      e.metaEvo = !!e.evoProj;
      e.metaEvoTarget = e.evoProj ? e.evoProj.target : null;
      e.tags = computeTags(e);
      e.action = computeAction(e, meta);
      const v = computeVerdict(e);
      e.verdict = v.verdict;
      e.reason = v.reason;
      e.tradeBoost = tradeBoost(e);
      e.movesetTip = _secondChargeTip(e, meta);
    }
    return list;
  }
```

(O `_evolveAction` antigo continua lendo `metaEvo`/`metaEvoTarget`/`isBestOfSpecies`/`ivPct`
por enquanto — refatorado na Task 3.)

- [ ] **Step 6: Rodar o arquivo e a suíte inteira**

Run: `node --test test/evo_projection.test.js` → Expected: PASS
Run: `npm test` → Expected: PASS. Os e2e de EVOLUIR/ROCKET existentes em `verdict.test.js`
continuam verdes (usam meta sintética com evolução genuinamente meta + IV alto).

- [ ] **Step 7: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/evo_projection.test.js
git commit -m "feat(pokemon): projeta evolução pelos avaliadores reais (metaEvo estrito)"
```

---

## Task 3: `_evolveAction` novo — dispara por `e.evoProj` + travas

Refatora `_evolveAction` para ler `e.evoProj` e aplicar as travas de forma-própria-meta e
colecionável (tamanho/fantasia; shiny/lucky sobrevivem à evolução). A trava de posse
(`e.evoOwned`) entra na Task 4 (default `false` aqui).

**Files:**
- Modify: `pokemon/lib/analysis.js` (`_evolveAction`)
- Test: `pokemon/test/verdict.test.js` (reescrever bloco EVOLUIR)

- [ ] **Step 1: Reescrever os testes do bloco EVOLUIR (que falharão)**

Em `pokemon/test/verdict.test.js`, substituir os 4 testes unitários sob o cabeçalho
`// EVOLUIR — sinalizar quando vale evoluir ...` (os que hoje passam `metaEvo`/`isBestOfSpecies`)
por estes — note o **novo formato de mensagem** `"Evoluir → <Alvo>"`:

```js
// ---------------------------------------------------------------------------
// EVOLUIR — dispara por e.evoProj (projeção value-ok) + travas
// ---------------------------------------------------------------------------

const evoProjPvP  = { target: 'Azumarill', targetId: 'azumarill', kind: 'pvp',
                      league: 'great', speciesRank: 13, spPct: 0.97, role: null, erRank: null, tipo: null };
const evoProjPvE  = { target: 'Machamp', targetId: 'machamp', kind: 'pve',
                      league: null, speciesRank: null, spPct: null, role: 'raid', erRank: 8, tipo: 'Lutador' };

function evoMon(over) {
  return Object.assign({
    isShadow: false, moveIds: [], tags: [], betterCopy: null, pvpMeta: null, pveMeta: null,
    isCostume: false, isExtremeSize: false, isXSComfort: false, isXLComfort: false,
    evoProj: evoProjPvE, evoOwned: false, ivPct: 91,
  }, over || {});
}

test('computeAction: evoProj PvE + cópia limpa → EVOLUIR (mensagem PvE)', () => {
  const a = computeAction(evoMon());
  assert.strictEqual(a.kind, 'EVOLUIR');
  assert.strictEqual(a.target, 'Machamp');
  assert.match(a.reason, /Evoluir → Machamp/);
  assert.match(a.reason, /Top 8/);
  assert.match(a.reason, /Lutador/);
});

test('computeAction: evoProj PvP → EVOLUIR (mensagem PvP com rank e IV PvP)', () => {
  const a = computeAction(evoMon({ evoProj: evoProjPvP }));
  assert.strictEqual(a.kind, 'EVOLUIR');
  assert.match(a.reason, /Evoluir → Azumarill/);
  assert.match(a.reason, /Liga Grande/);
  assert.match(a.reason, /rank 13/);
  assert.match(a.reason, /97%/);
});

test('computeAction: sem evoProj → NÃO EVOLUIR', () => {
  assert.strictEqual(computeAction(evoMon({ evoProj: null })), null);
});

test('computeAction: forma própria já meta → NÃO EVOLUIR (gancho de moveset cuida)', () => {
  const a = computeAction(evoMon({
    tags: ['pvp_great'], moveIds: ['COUNTER'],
    pvpMeta: { great: { isMeta: true, movesetOk: true, spPct: 0.98, ivRank: 1, speciesRank: 1 },
               ultra: {}, master: {} },
  }));
  assert.strictEqual(a.kind, 'FORTALECER');
});

test('computeAction: colecionável de tamanho (XS comfort) → NÃO EVOLUIR', () => {
  assert.strictEqual(computeAction(evoMon({ isXSComfort: true })), null);
});

test('computeAction: fantasia (costume) → NÃO EVOLUIR', () => {
  assert.strictEqual(computeAction(evoMon({ isCostume: true })), null);
});

test('computeAction: shiny SOBREVIVE à evolução → EVOLUIR (não travado por shiny)', () => {
  const a = computeAction(evoMon({ isShiny: true }));
  assert.strictEqual(a.kind, 'EVOLUIR');
});

test('computeAction: já possuo a evolução como keeper (evoOwned) → NÃO EVOLUIR', () => {
  assert.strictEqual(computeAction(evoMon({ evoOwned: true })), null);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test test/verdict.test.js`
Expected: FAIL — `_evolveAction` antigo ignora `evoProj`; mensagens usam "Evoluir p/" e o
gate antigo não aplica as travas novas.

- [ ] **Step 3: Reescrever `_evolveAction` em `analysis.js`**

Substituir a função `_evolveAction` (e remover a constante `EVOLVE_MIN_IV`, agora inútil):

```js
  // Evoluir: a forma evoluída desta cópia é meta value-ok (e.evoProj) e a cópia vale evoluir.
  // Travas: forma própria já meta (gancho de moveset cuida), colecionável de TAMANHO/FANTASIA
  // (shiny/lucky sobrevivem à evolução → não travam) e já possuir a evolução como keeper.
  function _evolveAction(e) {
    if (!e.evoProj) return null;
    if (isPvpMeta(e) || isPveMeta(e)) return null;
    if (e.isCostume || e.isExtremeSize || e.isXSComfort || e.isXLComfort) return null;
    if (e.evoOwned) return null;
    var p = e.evoProj;
    var reason = (p.kind === 'pvp')
      ? 'Evoluir → ' + p.target + ' · seria pick de ' + LEAGUE_PT[p.league] +
        ' (rank ' + p.speciesRank + ' da espécie · seu IV PvP ' + Math.round(p.spPct * 100) + '%)'
      : 'Evoluir → ' + p.target + ' · seria Top ' + (p.erRank != null ? p.erRank : '?') +
        ' atacante de ' + p.tipo + ' (estimativa)';
    return { kind: 'EVOLUIR', target: p.target, reason: reason };
  }
```

- [ ] **Step 4: Rodar o arquivo e a suíte inteira**

Run: `node --test test/verdict.test.js` → Expected: PASS (inclui os e2e de EVOLUIR 573/592
que preservam `action.target`).
Run: `npm test` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "feat(pokemon): EVOLUIR dispara por projeção + travas (mensagem honesta)"
```

---

## Task 4: `analyze` em 2 passadas + trava de posse (`evoOwned`)

Para suprimir EVOLUIR quando já existe a evolução como keeper, `analyze` precisa de visão da
coleção. Vira 2 passadas: (1) meta+tags+projeção de todos; (2) posse → `evoOwned` → ações+veredito.

**Files:**
- Modify: `pokemon/lib/analysis.js` (`analyze` + `_buildOwnedKeepers`)
- Test: `pokemon/test/evo_owned.test.js` (criar)

- [ ] **Step 1: Escrever os testes que falham**

Criar `pokemon/test/evo_owned.test.js`:

```js
// pokemon/test/evo_owned.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze } = require('../lib/analysis.js');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

// Só venusaur é atacante de raid (meta). bulbasaur herda via projeção da evolução.
function metaVenusaurRaid() {
  return {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: {},
    pveRanks: { venusaur: { roles: ['raid', 'pve'], bestType: 'grass',
      bestMoveset: ['VINE_WHIP', 'FRENZY_PLANT'],
      byType: { grass: { erRank: 11 } }, defBulkRank: 999 } },
  };
}
const bulba = (over) => Object.assign({ mon_name: 'Bulbasaur', mon_number: 1,
  mon_attack: 13, mon_defence: 13, mon_stamina: 13, mon_height: 0.7,   // 86%
  mon_isShiny: 'NO', mon_isLucky: 'NO' }, over);
const venu = (over) => Object.assign({ mon_name: 'Venusaur', mon_number: 3,
  mon_attack: 15, mon_defence: 15, mon_stamina: 15, mon_height: 2.0,
  mon_isShiny: 'NO', mon_isLucky: 'NO' }, over);

test('sem possuir a evolução: Bulbasaur bom → EVOLUIR', () => {
  const fd = { b: bulba() };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, metaVenusaurRaid())
    .find(x => x.id === 'b');
  assert.strictEqual(e.evoOwned, false);
  assert.strictEqual(e.action && e.action.kind, 'EVOLUIR');
});

test('já possuo Venusaur keeper: Bulbasaur duplicado → NÃO EVOLUIR (evoOwned)', () => {
  const fd = { b: bulba(), v: venu() };   // Venusaur é raid-meta → keeper
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, metaVenusaurRaid());
  const b = list.find(x => x.id === 'b');
  assert.strictEqual(b.evoOwned, true);
  assert.notStrictEqual(b.action && b.action.kind, 'EVOLUIR');
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test test/evo_owned.test.js`
Expected: FAIL no 2º teste — sem a passada de posse, `evoOwned` fica `false` e o Bulbasaur
ainda recebe EVOLUIR.

- [ ] **Step 3: Adicionar `_buildOwnedKeepers` e converter `analyze` em 2 passadas**

Em `pokemon/lib/analysis.js`, adicionar antes de `analyze`:

```js
  // Conjunto de speciesId (base, sem _shadow) que já têm ao menos uma cópia "keeper":
  // cópia com selo de meta (pvp/pve) OU melhor da espécie com IV>=90. Base só em tags+IV
  // (não no veredito) para não depender da ordem das passadas.
  function _buildOwnedKeepers(list) {
    var owned = {};
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e.speciesId) continue;
      if (isPvpMeta(e) || isPveMeta(e) || (e.isBestOfSpecies && e.ivPct >= 90)) {
        owned[String(e.speciesId).replace(/_shadow$/, '')] = true;
      }
    }
    return owned;
  }
```

Reescrever `analyze` para 2 passadas:

```js
  function analyze(fileData, getSize, refdata, getSizeScalar, meta) {
    const list = enrichCollection(fileData, getSize, refdata, getSizeScalar, meta);
    const evoCandidates = _buildEvoCandidates(meta);
    // Passada 1: meta + tags + projeção (sem ações/veredito).
    for (const e of list) {
      e.pvpMeta = (meta && meta.cpm && meta.pvpRanks && PokePvp) ? PokePvp.evalMon(e, meta) : null;
      e.pveMeta = (meta && meta.pveRanks && PokePve) ? PokePve.evalMon(e, meta) : null;
      _attachMovesetViews(e, meta);
      e.isRocketReady = (meta && meta.moves && PokePve)
        ? PokePve.rocketSpam(e.moveIds, meta.moves) : false;
      e.evoProj = _bestEvolveProjection(e, evoCandidates, meta);
      e.metaEvo = !!e.evoProj;
      e.metaEvoTarget = e.evoProj ? e.evoProj.target : null;
      e.tags = computeTags(e);
    }
    const owned = _buildOwnedKeepers(list);
    // Passada 2: posse → ações + veredito.
    for (const e of list) {
      e.evoOwned = !!(e.evoProj && owned[e.evoProj.targetId]);
      e.action = computeAction(e, meta);
      const v = computeVerdict(e);
      e.verdict = v.verdict;
      e.reason = v.reason;
      e.tradeBoost = tradeBoost(e);
      e.movesetTip = _secondChargeTip(e, meta);
    }
    return list;
  }
```

- [ ] **Step 4: Rodar o arquivo e a suíte inteira**

Run: `node --test test/evo_owned.test.js` → Expected: PASS
Run: `npm test` → Expected: PASS (a separação em 2 passadas não muda nenhum resultado por-mon
dos testes existentes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/evo_owned.test.js
git commit -m "feat(pokemon): trava de posse (evoOwned) via analyze em 2 passadas"
```

---

## Task 5: Validação no `colecao.json` real + ajuste fino

Confirma que as mudanças produzem a shortlist confiável esperada na coleção real e que os picks
remanescentes são defensáveis. Sem TDD — é verificação. Só commitar se houver ajuste de constante.

**Files:**
- Temp: `pokemon/_review_scratch.js` (criar e **apagar** ao fim — não commitar)

- [ ] **Step 1: Criar o harness de verificação**

Criar `pokemon/_review_scratch.js`:

```js
// Scratch de verificação — replica app.js loadMeta()+analyze() em Node. NÃO commitar.
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, 'data'), rd = f => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8'));
const PokeMatch = require('./lib/meta/match.js'), refdata = require('./lib/refdata.js');
const { getPokemonSize, getPokemonSizeScalar } = require('./sizes.js');
const { analyze } = require('./lib/analysis.js');
const meta = { speciesIndex: PokeMatch.buildSpeciesIndex(rd('species.json')),
  movesPt: rd('moves_pt.json'), pvpRanks: rd('pvp_ranks.json'), cpm: rd('cpm.json'),
  pveRanks: rd('pve_ranks.json'), moves: rd('moves.json') };
const col = JSON.parse(fs.readFileSync(path.join(__dirname, 'colecao.json'), 'utf8'));
const list = analyze(col.fileData, getPokemonSize,
  { LEGENDARY: refdata.LEGENDARY, REGIONAL: refdata.REGIONAL, TRADE_EVO: refdata.TRADE_EVO },
  getPokemonSizeScalar, meta);
const by = {}; for (const e of list) { const k = e.action ? e.action.kind : '(nenhuma)'; by[k] = (by[k]||0)+1; }
console.log('AÇÕES:', JSON.stringify(by));
const evo = list.filter(e => e.action && e.action.kind === 'EVOLUIR');
console.log('EVOLUIR', evo.length, '| IV<80:', evo.filter(e => e.ivPct < 80).length,
  '| PvE só + IV<80:', evo.filter(e => e.evoProj && e.evoProj.kind === 'pve' && e.ivPct < 80).length);
const rk = list.filter(e => e.action && e.action.kind === 'AGUARDAR_ROCKET');
console.log('ROCKET', rk.length, '| IV<70:', rk.filter(e => e.ivPct < 70).length);
console.log('\nAmostra EVOLUIR:');
evo.slice(0, 15).forEach(e => console.log(' -', e.name, e.ivPct + '%', '→', e.action.reason));
console.log('\nGolpes em inglês ainda vazando (heurística):');
const eng = new Set();
for (const e of list) { if (e.action && /\b(Water|Sight|Hammer|Fists|Sword|Storm|Blast|Cannon|Beating)\b/.test(e.action.reason)) eng.add(e.action.reason); }
console.log([...eng].slice(0, 10).join('\n') || ' (nenhum)');
```

- [ ] **Step 2: Rodar e inspecionar**

Run: `node _review_scratch.js`
Expected (alvos da spec, §11):
- `EVOLUIR` caiu de 122 para ~20-30; `EVOLUIR PvE só + IV<80` = **0** (piso funcionando).
- `ROCKET` caiu de 38 para ~5-12; `ROCKET IV<70` próximo de 0.
- Amostra de EVOLUIR: alvos são picks defensáveis, mensagens honestas ("seria pick de…").
- Nenhum golpe vazando em inglês.

- [ ] **Step 3: Ajuste fino (só se necessário)**

Se `EVOLUIR` ainda parecer ruidoso (muitos PvE marginais), subir `EVOLVE_PVE_MIN_IV` (ex.: 85)
em `analysis.js`; se cortar picks legítimos, descer. Reexecutar Step 2 e `npm test` após qualquer
mudança (o e2e da Task 2 usa Machop 91% — qualquer piso ≤91 mantém verde; o teste de piso usa
58% — qualquer piso ≥59 mantém verde).

- [ ] **Step 4: Apagar o scratch e confirmar árvore limpa**

```bash
rm -f pokemon/_review_scratch.js
git status --short
```
Expected: sem `_review_scratch.js` pendente. Se houve ajuste de constante:

```bash
git add pokemon/lib/analysis.js
git commit -m "tune(pokemon): calibra EVOLVE_PVE_MIN_IV pela coleção real"
```

---

## Self-Review (autor do plano)

**Cobertura da spec:**
- §4 Projeção → Task 2 (`_buildEvoCandidates`/`_projectEvolution`/`_bestEvolveProjection`) + Task 3 (`_evolveAction`/mensagem).
- §4 piso PvE (`EVOLVE_PVE_MIN_IV`) → Task 2 Step 4 + teste de piso Task 2 Step 1.
- §5 posse (`_buildOwnedKeepers`/`evoOwned`) + colecionável → Task 4 + Task 3.
- §6 ROCKET com piso → gratuito via `metaEvo = !!evoProj` (Task 2); coberto pelos e2e de ROCKET existentes (verde) e pela validação real (Task 5).
- §7 ENSINAR/FORTALECER intactos → nenhuma mudança de barra (confirmado: `_bestPvpLeague` usa tags).
- §8 Localização → Task 1.
- §9 2 passadas → Task 4. §10 Testes → Tasks 1-4. §11 Impacto → Task 5.

**Placeholders:** nenhum "TBD/TODO"; todo passo de código tem o código.
**Consistência de tipos:** `e.evoProj` (mesma forma em todas as tasks: target/targetId/kind/league/role/speciesRank/spPct/erRank/tipo); `e.evoOwned` bool; `_evolveAction(e)` sem novos args; `_bestEvolveProjection(e, evoCandidates, meta)`; `_buildOwnedKeepers(list)`.
**Risco conhecido:** o e2e existente `analyze (e2e): Machop melhor cópia → EVOLUIR` usa IV 80% (12/12/12) com evolução só-PvE; `EVOLVE_PVE_MIN_IV = 80` e `>=` mantêm verde (80 ≥ 80). Não subir o piso acima de 80 sem ajustar esse teste.
