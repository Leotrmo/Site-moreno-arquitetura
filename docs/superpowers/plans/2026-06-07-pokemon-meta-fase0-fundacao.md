# Camada de Meta Competitivo — Fase 0 (Fundação) — Plano de Implementação

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa-a-tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

**Goal:** Construir o pipeline de dados de referência (GitHub Action + `build/refresh-meta.js`) que baixa dados abertos (PvPoke + PokeMiners), gera datasets versionados em `pokemon/data/*`, e enriquece cada mon da coleção com `speciesId` e `moveIds` — sem nenhuma mudança de UI e sem regredir a triagem atual.

**Architecture:** Build-time (Node, rodado pela Action) baixa e transforma dados externos em JSONs compactos commitados no repo. Runtime (navegador estático) carrega esses JSONs e cruza com a coleção via um novo módulo `lib/meta/match.js`. Toda transformação pura é testável com fixtures pequenos; o orquestrador faz só I/O. Falha de casamento degrada graciosamente (mon mantém o comportamento atual).

**Tech Stack:** Node 18+ (global `fetch`, `node --test`), JavaScript (CommonJS no build, UMD no runtime como os libs atuais), GitHub Actions.

**Referência:** `docs/superpowers/specs/2026-06-07-pokemon-meta-competitivo-design.md` (§5, §6, §11 Fase 0).

---

## Fontes externas (URLs verificadas)

| Fonte | URL | Uso |
|---|---|---|
| PvPoke gamemaster | `https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json` | `species.json`, `moves.json` (stats PvP), `speciesId` (chave dos rankings) |
| PvPoke rankings Grande | `https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-1500.json` | `pvp_ranks.json` (liga great) |
| PvPoke rankings Ultra | `.../rankings/all/overall/rankings-2500.json` | `pvp_ranks.json` (liga ultra) |
| PvPoke rankings Mestre | `.../rankings/all/overall/rankings-10000.json` | `pvp_ranks.json` (liga master) |
| PokeMiners Game Master | `https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json` | número↔uniqueId dos golpes (join PT) |
| PokeMiners i18n PT-BR | `https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_brazilianportuguese.json` | `move_name_####` → nome PT |

## Estrutura de arquivos (Fase 0)

```
pokemon/
  build/
    refresh-meta.js     ← orquestrador: baixa, transforma, valida, grava (CommonJS, Node-only)
    transform.js        ← funções puras de transformação (CommonJS, Node-only)
    sources.js          ← constantes de URL (CommonJS)
    SOURCES.md          ← registro da sondagem (Tarefa 1)
  data/                 ← datasets gerados (commitados)
    species.json moves.json moves_pt.json pvp_ranks.json meta.json
  lib/meta/
    match.js            ← runtime: normalizeName, índice de espécie, matchSpecies, matchMove (UMD)
  test/
    transform.test.js   ← testes das transformações puras
    match.test.js       ← testes de casamento
  fixtures/
    mini-gamemaster.json mini-rankings.json mini-game-master.json mini-i18n-pt.json
.github/workflows/
    refresh-meta.yml    ← Action (agendada + manual)
```

Arquivos modificados: `pokemon/lib/analysis.js` (anexar `speciesId`/`moveIds`), `pokemon/app.js` (carregar datasets), `pokemon/sw.js` (cache de `data/`), `pokemon/package.json` (script `build`).

## Formato dos datasets (contrato entre build e runtime)

```jsonc
// species.json  — chave: speciesId
{ "machop": { "dex": 66, "baseStats": {"atk":118,"def":96,"hp":150},
              "types": ["fighting"], "family": "machop",
              "eliteMoves": ["KARATE_CHOP"], "shadowEligible": true } }

// moves.json  — chave: moveId
{ "ROCK_SMASH": { "type":"fighting", "kind":"fast", "pvp": {"power":9,"energy":7} },
  "CROSS_CHOP": { "type":"fighting", "kind":"charge", "pvp": {"power":50,"energy":35} } }

// moves_pt.json  — chave: nome PT normalizado → moveId
{ "esmagamento de pedras": "ROCK_SMASH", "soco de gelo": "ICE_PUNCH" }

// pvp_ranks.json  — chave: speciesId
{ "medicham": { "great":  {"rank":12,"score":94,"moveset":["COUNTER","ICE_PUNCH","POWER_UP_PUNCH"]},
                "ultra":  null,
                "master": null } }

// meta.json
{ "generatedAt":"2026-06-07T17:00:00Z", "pvpokeSource":"raw.githubusercontent...",
  "counts": {"species":1100,"moves":350,"movesPt":340,"pvpGreat":100,"pvpUltra":100,"pvpMaster":80},
  "ptCoverage": 0.97, "speciesIdCoverageNote":"medido em runtime" }
```

---

### Task 1: Sondagem de verificação das fontes (investigação, sem TDD)

Objetivo: baixar as fontes reais e **registrar a estrutura exata** em `build/SOURCES.md`, para o código ser escrito contra a realidade confirmada (não contra suposições).

**Files:**
- Create: `pokemon/build/SOURCES.md`
- Create: `pokemon/build/sources.js`

- [ ] **Step 1: Criar `pokemon/build/sources.js` com as URLs**

```js
// pokemon/build/sources.js — fontes externas (Node-only)
module.exports = {
  PVPOKE_GAMEMASTER: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json',
  PVPOKE_RANKINGS: {
    great:  'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-1500.json',
    ultra:  'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-2500.json',
    master: 'https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/rankings/all/overall/rankings-10000.json',
  },
  POKEMINERS_GAME_MASTER: 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json',
  POKEMINERS_I18N_PT: 'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_brazilianportuguese.json',
};
```

- [ ] **Step 2: Rodar a sondagem e inspecionar cada fonte**

Run (cada comando imprime a forma de UM elemento — copie a saída pro SOURCES.md):

```bash
cd pokemon
node -e "const u=require('./build/sources.js');(async()=>{const gm=await (await fetch(u.PVPOKE_GAMEMASTER)).json();console.log('PVPOKE keys:',Object.keys(gm));console.log('pokemon[0]:',JSON.stringify(gm.pokemon.find(p=>p.dex===66),null,1));const m=gm.moves&&gm.moves[0];console.log('moves[0]:',JSON.stringify(m,null,1));console.log('has cpMultipliers:', !!(gm.cpMultipliers||gm.cpms));})()"
node -e "const u=require('./build/sources.js');(async()=>{const r=await (await fetch(u.PVPOKE_RANKINGS.great)).json();console.log('rank[0]:',JSON.stringify({speciesId:r[0].speciesId,moveset:r[0].moveset,score:r[0].score,rating:r[0].rating,stats:r[0].stats},null,1));console.log('len:',r.length);})()"
node -e "const u=require('./build/sources.js');(async()=>{const g=await (await fetch(u.POKEMINERS_GAME_MASTER)).json();const arr=Array.isArray(g)?g:(g.template||g.itemTemplates);console.log('GM top isArray:',Array.isArray(g),'len:',arr.length);const cm=arr.find(t=>/COMBAT_V\d+_MOVE_/.test(t.templateId||''));console.log('combat move sample:',JSON.stringify(cm,null,1));})()"
node -e "const u=require('./build/sources.js');(async()=>{const i=await (await fetch(u.POKEMINERS_I18N_PT)).json();const d=i.data||i;const idx=d.findIndex(x=>/^move_name_/.test(x));console.log('i18n top keys:',Object.keys(i));console.log('sample move key/val:',d[idx],'=>',d[idx+1]);})()"
```

Expected: cada comando imprime JSON sem erro. Anote em `SOURCES.md`: (a) se `gm.moves[].name` (nome EN) existe e o nome da chave de classificação fast/charge (`energyGain` vs `energy`); (b) confirmação de que `rankings` é array ordenado por rank; (c) formato do `templateId` de combate e o `combatMove.uniqueId`; (d) o prefixo/padding real da chave i18n (`move_name_233` vs `move_name_0233`).

- [ ] **Step 3: Escrever `pokemon/build/SOURCES.md`** com as 4 estruturas reais coladas e as 4 confirmações acima.

- [ ] **Step 4: Commit**

```bash
git add pokemon/build/sources.js pokemon/build/SOURCES.md
git commit -m "fase0: sondagem e registro das fontes externas (PvPoke + PokeMiners)"
```

> **Se a sondagem contradizer uma suposição abaixo** (ex.: `gm.moves[].name` não existe, ou o uniqueId não bate com o moveId do PvPoke), ajuste a tarefa correspondente conforme o SOURCES.md antes de implementá-la. As transformações já validam presença de chaves e falham alto.

---

### Task 2: `normalizeName` (TDD)

Função pura de normalização compartilhada por build e runtime. Vive em `match.js` (UMD, requerível no Node).

**Files:**
- Create: `pokemon/lib/meta/match.js`
- Test: `pokemon/test/match.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// pokemon/test/match.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeName } = require('../lib/meta/match.js');

test('normalizeName: minúsculo, sem acento, sem pontuação, espaço único', () => {
  assert.strictEqual(normalizeName('Esmagamento de Pedras'), 'esmagamento de pedras');
  assert.strictEqual(normalizeName('Soco de Gelo'), 'soco de gelo');
  assert.strictEqual(normalizeName('  Investida   Trovão!! '), 'investida trovao');
  assert.strictEqual(normalizeName('Aerial Ace'), 'aerial ace');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/match.test.js`
Expected: FAIL — `Cannot find module '../lib/meta/match.js'`.

- [ ] **Step 3: Implementação mínima (cria o módulo UMD com `normalizeName`)**

```js
// pokemon/lib/meta/match.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokeMatch = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function normalizeName(s) {
    return String(s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acentos
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')                      // pontuação → espaço
      .trim().replace(/\s+/g, ' ');
  }

  return { normalizeName };
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/match.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/match.js pokemon/test/match.test.js
git commit -m "fase0: normalizeName (match.js)"
```

---

### Task 3: `build/transform.js` — `buildSpecies` (TDD)

**Files:**
- Create: `pokemon/build/transform.js`
- Create: `pokemon/fixtures/mini-gamemaster.json`
- Test: `pokemon/test/transform.test.js`

- [ ] **Step 1: Criar o fixture mínimo**

```json
// pokemon/fixtures/mini-gamemaster.json
{
  "pokemon": [
    { "dex": 66, "speciesId": "machop", "speciesName": "Machop",
      "baseStats": { "atk": 118, "def": 96, "hp": 150 },
      "types": ["fighting", "none"], "fastMoves": ["ROCK_SMASH", "LOW_KICK"],
      "chargedMoves": ["CROSS_CHOP", "LOW_SWEEP"], "eliteMoves": ["KARATE_CHOP"],
      "tags": ["shadoweligible"], "family": { "id": "machop" } },
    { "dex": 27, "speciesId": "sandshrew", "speciesName": "Sandshrew",
      "baseStats": { "atk": 126, "def": 120, "hp": 137 },
      "types": ["ground", "none"], "fastMoves": ["MUD_SHOT"],
      "chargedMoves": ["DIG"], "family": { "id": "sandshrew" } },
    { "dex": 27, "speciesId": "sandshrew_alolan", "speciesName": "Sandshrew (Alolan)",
      "baseStats": { "atk": 125, "def": 129, "hp": 137 },
      "types": ["ice", "steel"], "fastMoves": ["POWDER_SNOW"],
      "chargedMoves": ["ICE_PUNCH"], "family": { "id": "sandshrew" } }
  ],
  "moves": [
    { "moveId": "ROCK_SMASH", "name": "Rock Smash", "type": "fighting", "energyGain": 7, "power": 9 },
    { "moveId": "CROSS_CHOP", "name": "Cross Chop", "type": "fighting", "energy": 35, "power": 50 }
  ]
}
```

- [ ] **Step 2: Escrever o teste que falha**

```js
// pokemon/test/transform.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const gm = require('../fixtures/mini-gamemaster.json');
const { buildSpecies } = require('../build/transform.js');

test('buildSpecies: chaveado por speciesId, com dex/baseStats/types/family/eliteMoves/shadowEligible', () => {
  const s = buildSpecies(gm);
  assert.strictEqual(s.machop.dex, 66);
  assert.deepStrictEqual(s.machop.baseStats, { atk: 118, def: 96, hp: 150 });
  assert.deepStrictEqual(s.machop.types, ['fighting']);          // "none" removido
  assert.strictEqual(s.machop.family, 'machop');
  assert.deepStrictEqual(s.machop.eliteMoves, ['KARATE_CHOP']);
  assert.strictEqual(s.machop.shadowEligible, true);
  assert.strictEqual(s.sandshrew.shadowEligible, false);         // sem tag
  assert.deepStrictEqual(s.sandshrew_alolan.types, ['ice', 'steel']);
});

test('buildSpecies: falha alto se faltar o array pokemon', () => {
  assert.throws(() => buildSpecies({}), /pokemon/);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: FAIL — `Cannot find module '../build/transform.js'`.

- [ ] **Step 4: Implementação mínima**

```js
// pokemon/build/transform.js — transformações puras (Node-only, CommonJS)
const { normalizeName } = require('../lib/meta/match.js');

function buildSpecies(gamemaster) {
  if (!gamemaster || !Array.isArray(gamemaster.pokemon))
    throw new Error('buildSpecies: gamemaster.pokemon ausente');
  const out = {};
  for (const p of gamemaster.pokemon) {
    if (!p.speciesId) continue;
    out[p.speciesId] = {
      dex: p.dex,
      baseStats: p.baseStats,
      types: (p.types || []).filter(t => t && t !== 'none'),
      family: p.family ? p.family.id : null,
      eliteMoves: p.eliteMoves || [],
      shadowEligible: Array.isArray(p.tags) && p.tags.includes('shadoweligible'),
    };
  }
  return out;
}

module.exports = { buildSpecies };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pokemon/build/transform.js pokemon/fixtures/mini-gamemaster.json pokemon/test/transform.test.js
git commit -m "fase0: buildSpecies (transform.js)"
```

---

### Task 4: `buildMoves` (TDD)

**Files:**
- Modify: `pokemon/build/transform.js`
- Test: `pokemon/test/transform.test.js`

- [ ] **Step 1: Adicionar o teste que falha** (append em `transform.test.js`)

```js
const { buildMoves } = require('../build/transform.js');

test('buildMoves: classifica fast/charge e guarda type + stats PvP', () => {
  const m = buildMoves(gm);
  assert.deepStrictEqual(m.ROCK_SMASH, { type: 'fighting', kind: 'fast', pvp: { power: 9, energy: 7 } });
  assert.deepStrictEqual(m.CROSS_CHOP, { type: 'fighting', kind: 'charge', pvp: { power: 50, energy: 35 } });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: FAIL — `buildMoves is not a function`.

- [ ] **Step 3: Implementação** (em `transform.js`; ajuste `energyGain`/`energy` conforme SOURCES.md da Tarefa 1)

```js
function buildMoves(gamemaster) {
  if (!gamemaster || !Array.isArray(gamemaster.moves))
    throw new Error('buildMoves: gamemaster.moves ausente');
  const out = {};
  for (const mv of gamemaster.moves) {
    if (!mv.moveId) continue;
    const isFast = mv.energyGain != null && mv.energy == null; // fast: gera energia
    out[mv.moveId] = {
      type: mv.type,
      kind: isFast ? 'fast' : 'charge',
      pvp: { power: mv.power, energy: isFast ? mv.energyGain : mv.energy },
    };
  }
  return out;
}

module.exports = { buildSpecies, buildMoves };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/build/transform.js pokemon/test/transform.test.js
git commit -m "fase0: buildMoves (transform.js)"
```

---

### Task 5: `buildMovesPt` — join número↔uniqueId↔nome PT (TDD)

**Files:**
- Modify: `pokemon/build/transform.js`
- Create: `pokemon/fixtures/mini-game-master.json`
- Create: `pokemon/fixtures/mini-i18n-pt.json`
- Test: `pokemon/test/transform.test.js`

- [ ] **Step 1: Criar fixtures** (forma conforme SOURCES.md; ajuste padding/chaves se a sondagem indicar diferente)

```json
// pokemon/fixtures/mini-game-master.json
[
  { "templateId": "COMBAT_V0233_MOVE_ROCK_SMASH", "combatMove": { "uniqueId": "ROCK_SMASH", "type": "POKEMON_TYPE_FIGHTING" } },
  { "templateId": "COMBAT_V0247_MOVE_ICE_PUNCH", "combatMove": { "uniqueId": "ICE_PUNCH", "type": "POKEMON_TYPE_ICE" } },
  { "templateId": "COMBAT_V0200_MOVE_ROCK_SMASH_FAST", "combatMove": { "uniqueId": "ROCK_SMASH_FAST", "type": "POKEMON_TYPE_FIGHTING" } },
  { "templateId": "POKEMON_SETTINGS_IGNORE_ME", "pokemonSettings": {} }
]
```

```json
// pokemon/fixtures/mini-i18n-pt.json
{ "data": [
  "move_name_0233", "Esmagamento de Pedras",
  "move_name_0247", "Soco de Gelo",
  "move_name_0200", "Esmagamento de Pedras",
  "pokemon_name_0001", "Bulbasaur"
] }
```

- [ ] **Step 2: Adicionar o teste que falha**

```js
const gameMaster = require('../fixtures/mini-game-master.json');
const i18nPt = require('../fixtures/mini-i18n-pt.json');
const { buildMovesPt } = require('../build/transform.js');

test('buildMovesPt: nome PT normalizado → uniqueId (sem sufixo _FAST)', () => {
  const { map, coverage } = buildMovesPt(gameMaster, i18nPt);
  assert.strictEqual(map['esmagamento de pedras'], 'ROCK_SMASH'); // _FAST removido, mesmo nome
  assert.strictEqual(map['soco de gelo'], 'ICE_PUNCH');
  assert.ok(coverage > 0 && coverage <= 1);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: FAIL — `buildMovesPt is not a function`.

- [ ] **Step 4: Implementação**

```js
function _i18nMoveNames(i18nPt) {
  const data = Array.isArray(i18nPt) ? i18nPt : i18nPt.data;
  if (!Array.isArray(data)) throw new Error('buildMovesPt: i18n.data ausente');
  const byNum = {}; // "233" → "Esmagamento de Pedras"
  for (let i = 0; i < data.length - 1; i += 2) {
    const m = /^move_name_0*(\d+)$/.exec(data[i]);
    if (m) byNum[m[1]] = data[i + 1];
  }
  return byNum;
}

function buildMovesPt(gameMaster, i18nPt) {
  const arr = Array.isArray(gameMaster) ? gameMaster : (gameMaster.template || gameMaster.itemTemplates);
  if (!Array.isArray(arr)) throw new Error('buildMovesPt: game master sem array de templates');
  const ptByNum = _i18nMoveNames(i18nPt);
  const map = {};
  let total = 0, hit = 0;
  for (const t of arr) {
    const tid = t.templateId || '';
    const m = /^COMBAT_V0*(\d+)_MOVE_/.exec(tid);
    if (!m || !t.combatMove || !t.combatMove.uniqueId) continue;
    total++;
    const num = m[1];
    const moveId = t.combatMove.uniqueId.replace(/_FAST$/, '');
    const pt = ptByNum[num];
    if (!pt) continue;
    hit++;
    map[normalizeName(pt)] = moveId;
  }
  return { map, coverage: total ? hit / total : 0 };
}

module.exports = { buildSpecies, buildMoves, buildMovesPt };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pokemon/build/transform.js pokemon/fixtures/mini-game-master.json pokemon/fixtures/mini-i18n-pt.json pokemon/test/transform.test.js
git commit -m "fase0: buildMovesPt — join numero/uniqueId/nome PT"
```

---

### Task 6: `buildPvpRanks` (TDD)

**Files:**
- Modify: `pokemon/build/transform.js`
- Create: `pokemon/fixtures/mini-rankings.json`
- Test: `pokemon/test/transform.test.js`

- [ ] **Step 1: Criar fixture** (array ordenado por rank; índice 0 = rank 1)

```json
// pokemon/fixtures/mini-rankings.json
[
  { "speciesId": "medicham", "score": 94, "moveset": ["COUNTER", "ICE_PUNCH", "POWER_UP_PUNCH"] },
  { "speciesId": "azumarill", "score": 92, "moveset": ["BUBBLE", "ICE_BEAM", "PLAY_ROUGH"] },
  { "speciesId": "machop",   "score": 51, "moveset": ["KARATE_CHOP", "CROSS_CHOP"] }
]
```

- [ ] **Step 2: Adicionar o teste que falha**

```js
const ranks = require('../fixtures/mini-rankings.json');
const { buildPvpRanks } = require('../build/transform.js');

test('buildPvpRanks: junta as 3 ligas por speciesId, com rank 1-based e corte Top N', () => {
  const r = buildPvpRanks({ great: ranks, ultra: [], master: [] }, { great: 2, ultra: 2, master: 2 });
  assert.deepStrictEqual(r.medicham.great, { rank: 1, score: 94, moveset: ['COUNTER', 'ICE_PUNCH', 'POWER_UP_PUNCH'] });
  assert.strictEqual(r.azumarill.great.rank, 2);
  assert.strictEqual(r.machop, undefined);       // fora do Top 2 e sem outras ligas → não entra
  assert.strictEqual(r.medicham.ultra, null);    // ausente na liga ultra
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: FAIL — `buildPvpRanks is not a function`.

- [ ] **Step 4: Implementação**

```js
const LEAGUES = ['great', 'ultra', 'master'];

function buildPvpRanks(rankingsByLeague, topN) {
  const out = {};
  for (const lg of LEAGUES) {
    const arr = rankingsByLeague[lg] || [];
    if (!Array.isArray(arr)) throw new Error('buildPvpRanks: ranking ' + lg + ' não é array');
    const cut = topN[lg];
    for (let i = 0; i < arr.length && i < cut; i++) {
      const e = arr[i];
      if (!e.speciesId) continue;
      (out[e.speciesId] = out[e.speciesId] || { great: null, ultra: null, master: null });
      out[e.speciesId][lg] = { rank: i + 1, score: e.score, moveset: e.moveset || [] };
    }
  }
  return out;
}

module.exports = { buildSpecies, buildMoves, buildMovesPt, buildPvpRanks, LEAGUES };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pokemon/build/transform.js pokemon/fixtures/mini-rankings.json pokemon/test/transform.test.js
git commit -m "fase0: buildPvpRanks — junta 3 ligas com corte Top N"
```

---

### Task 7: `buildSpeciesIndex` + `matchSpecies` (TDD)

Runtime: dado `mon_number` (+ `mon_form`), achar o `speciesId` do PvPoke.

**Files:**
- Modify: `pokemon/lib/meta/match.js`
- Test: `pokemon/test/match.test.js`

- [ ] **Step 1: Adicionar o teste que falha** (append em `match.test.js`)

```js
const { buildSpeciesIndex, matchSpecies } = require('../lib/meta/match.js');

const speciesJson = {
  machop:            { dex: 66, baseStats: {}, types: ['fighting'] },
  sandshrew:         { dex: 27, baseStats: {}, types: ['ground'] },
  sandshrew_alolan:  { dex: 27, baseStats: {}, types: ['ice', 'steel'] },
};

test('matchSpecies: forma base casa pelo dex (sem mon_form)', () => {
  const idx = buildSpeciesIndex(speciesJson);
  assert.strictEqual(matchSpecies({ mon_number: 66 }, idx), 'machop');
  assert.strictEqual(matchSpecies({ mon_number: 27 }, idx), 'sandshrew');                 // base, não alolan
  assert.strictEqual(matchSpecies({ mon_number: 27, mon_form: 'SANDSHREW_NORMAL' }, idx), 'sandshrew');
});

test('matchSpecies: forma regional casa pelo sufixo', () => {
  const idx = buildSpeciesIndex(speciesJson);
  assert.strictEqual(matchSpecies({ mon_number: 27, mon_form: 'SANDSHREW_ALOLA' }, idx), 'sandshrew_alolan');
});

test('matchSpecies: desconhecido → null (degrada gracioso)', () => {
  const idx = buildSpeciesIndex(speciesJson);
  assert.strictEqual(matchSpecies({ mon_number: 99999 }, idx), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/match.test.js`
Expected: FAIL — `buildSpeciesIndex is not a function`.

- [ ] **Step 3: Implementação** (em `match.js`, dentro do factory)

```js
  // sufixos de forma (mon_form do export → sufixo do speciesId no PvPoke)
  var REGION_SUFFIX = {
    ALOLA: 'alolan', GALAR: 'galarian', HISUI: 'hisuian', PALDEA: 'paldean',
  };
  function _regionSuffixOf(speciesId) {
    var parts = speciesId.split('_');
    var last = parts[parts.length - 1];
    return ['alolan', 'galarian', 'hisuian', 'paldean'].indexOf(last) >= 0 ? last : null;
  }

  function buildSpeciesIndex(speciesJson) {
    var byDex = {}; // dex → [speciesId,...]
    Object.keys(speciesJson).forEach(function (id) {
      var dex = speciesJson[id].dex;
      (byDex[dex] = byDex[dex] || []).push(id);
    });
    return { byDex: byDex, byId: speciesJson };
  }

  function matchSpecies(mon, index) {
    var ids = index.byDex[mon.mon_number];
    if (!ids || !ids.length) return null;
    var form = mon.mon_form || '';
    var wantRegion = null;
    for (var k in REGION_SUFFIX) if (form.indexOf('_' + k) >= 0) wantRegion = REGION_SUFFIX[k];
    if (wantRegion) {
      var hit = ids.filter(function (id) { return _regionSuffixOf(id) === wantRegion; });
      if (hit.length) return hit[0];
    }
    // base: speciesId sem sufixo de região
    var base = ids.filter(function (id) { return !_regionSuffixOf(id); });
    return (base[0] || ids[0]);
  }
```

E atualize o `return` do factory:

```js
  return { normalizeName, buildSpeciesIndex, matchSpecies };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/match.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/match.js pokemon/test/match.test.js
git commit -m "fase0: buildSpeciesIndex + matchSpecies (dex + forma regional)"
```

---

### Task 8: `matchMove` (TDD)

**Files:**
- Modify: `pokemon/lib/meta/match.js`
- Test: `pokemon/test/match.test.js`

- [ ] **Step 1: Adicionar o teste que falha**

```js
const { matchMove } = require('../lib/meta/match.js');
const movesPt = { 'esmagamento de pedras': 'ROCK_SMASH', 'soco de gelo': 'ICE_PUNCH' };

test('matchMove: nome PT (com variação de caixa/acentos) → moveId', () => {
  assert.strictEqual(matchMove('Esmagamento de Pedras', movesPt), 'ROCK_SMASH');
  assert.strictEqual(matchMove('soco de  gelo', movesPt), 'ICE_PUNCH');
});

test('matchMove: golpe sem casar → null', () => {
  assert.strictEqual(matchMove('Golpe Inexistente', movesPt), null);
  assert.strictEqual(matchMove(undefined, movesPt), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/match.test.js`
Expected: FAIL — `matchMove is not a function`.

- [ ] **Step 3: Implementação** (em `match.js`)

```js
  function matchMove(ptName, movesPt) {
    if (!ptName) return null;
    var key = normalizeName(ptName);
    return Object.prototype.hasOwnProperty.call(movesPt, key) ? movesPt[key] : null;
  }
```

Atualize o `return`:

```js
  return { normalizeName, buildSpeciesIndex, matchSpecies, matchMove };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/match.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/match.js pokemon/test/match.test.js
git commit -m "fase0: matchMove (nome PT → moveId)"
```

---

### Task 9: Integrar `speciesId`/`moveIds` no enriquecimento (TDD, não-regressão)

`analysis.js` passa a anexar `speciesId` e `moveIds` quando um objeto `meta` opcional é fornecido; sem ele, comportamento idêntico ao de hoje.

**Files:**
- Modify: `pokemon/lib/analysis.js` (`enrichOne`, `enrichCollection`, `analyze`)
- Test: `pokemon/test/enrich.test.js`

- [ ] **Step 1: Adicionar o teste que falha** (append em `enrich.test.js`)

```js
const { buildSpeciesIndex } = require('../lib/meta/match.js');

test('enrich anexa speciesId e moveIds quando meta é fornecido', () => {
  const meta = {
    speciesIndex: buildSpeciesIndex({ machop: { dex: 66, baseStats: {}, types: ['fighting'] } }),
    movesPt: { 'soco dinamico': 'DYNAMIC_PUNCH', 'lampada quebrada': 'X' },
  };
  const mon = { mon_name: 'Machop', mon_number: 66, mon_cp: 500, mon_attack: 15, mon_defence: 15,
                mon_stamina: 15, mon_height: 0.8, mon_isShiny: 'NO', mon_isLucky: 'NO',
                mon_move_1: 'Soco Dinâmico' };
  const e = enrichOne(mon, getPokemonSize, refdata, getPokemonSizeScalar, meta);
  assert.strictEqual(e.speciesId, 'machop');
  assert.deepStrictEqual(e.moveIds, ['DYNAMIC_PUNCH']);  // só golpes que casaram
});

test('enrich sem meta: speciesId/moveIds nulos, resto intacto (não-regressão)', () => {
  const e = enrichOne({ mon_name: 'Machop', mon_number: 66, mon_cp: 500, mon_attack: 15,
                        mon_defence: 15, mon_stamina: 15, mon_height: 0.8, mon_isShiny: 'NO',
                        mon_isLucky: 'NO' }, getPokemonSize, refdata, getPokemonSizeScalar);
  assert.strictEqual(e.speciesId, null);
  assert.deepStrictEqual(e.moveIds, []);
  assert.strictEqual(e.ivPct, 100); // comportamento atual preservado
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/enrich.test.js`
Expected: FAIL — `e.speciesId` é `undefined` (não `null`) / `moveIds` indefinido.

- [ ] **Step 3: Implementação** — editar `pokemon/lib/analysis.js`

3a. No topo do factory de `analysis.js`, importar match quando em Node (logo após a abertura do factory):

```js
  var PokeMatch = (typeof require === 'function')
    ? require('./meta/match.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokeMatch : null);
```

3b. Trocar a assinatura de `enrichOne` para aceitar `meta` e anexar os campos. Substituir a linha `function enrichOne(mon, getSize, refdata, getSizeScalar) {` por:

```js
  function enrichOne(mon, getSize, refdata, getSizeScalar, meta) {
```

E dentro do objeto retornado por `enrichOne`, logo após `tags: [],`, adicionar:

```js
      // Fase 0 — casamento com o meta (null/[] quando meta ausente):
      speciesId: (meta && meta.speciesIndex && PokeMatch)
        ? PokeMatch.matchSpecies(mon, meta.speciesIndex) : null,
      moveIds: (meta && meta.movesPt && PokeMatch)
        ? [mon.mon_move_1, mon.mon_move_2, mon.mon_move_3]
            .map(function (m) { return PokeMatch.matchMove(m, meta.movesPt); })
            .filter(Boolean)
        : [],
```

3c. Propagar `meta` em `enrichCollection` e `analyze`. Substituir `function enrichCollection(fileData, getSize, refdata, getSizeScalar) {` por:

```js
  function enrichCollection(fileData, getSize, refdata, getSizeScalar, meta) {
```

e a linha `const e = enrichOne(fileData[id], getSize, refdata, getSizeScalar);` por:

```js
      const e = enrichOne(fileData[id], getSize, refdata, getSizeScalar, meta);
```

Substituir `function analyze(fileData, getSize, refdata, getSizeScalar) {` por:

```js
  function analyze(fileData, getSize, refdata, getSizeScalar, meta) {
```

e a linha `const list = enrichCollection(fileData, getSize, refdata, getSizeScalar);` por:

```js
    const list = enrichCollection(fileData, getSize, refdata, getSizeScalar, meta);
```

- [ ] **Step 4: Rodar a suíte inteira (garante não-regressão)**

Run: `cd pokemon && node --test`
Expected: PASS — todos os testes existentes (incluindo os dois Xatus) continuam verdes, mais os novos.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/enrich.test.js
git commit -m "fase0: anexa speciesId/moveIds no enrich (meta opcional, nao-regressivo)"
```

---

### Task 10: Orquestrador `build/refresh-meta.js` + gerar datasets reais

Baixa as fontes, chama as transformações, valida, grava `pokemon/data/*`. Não é unit-testado (I/O de rede); roda de verdade uma vez para gerar os dados iniciais.

**Files:**
- Create: `pokemon/build/refresh-meta.js`
- Modify: `pokemon/package.json` (script `build`)
- Create (gerados): `pokemon/data/species.json`, `moves.json`, `moves_pt.json`, `pvp_ranks.json`, `meta.json`

- [ ] **Step 1: Escrever o orquestrador**

```js
// pokemon/build/refresh-meta.js — baixa, transforma, valida, grava (Node 18+)
const fs = require('fs');
const path = require('path');
const S = require('./sources.js');
const T = require('./transform.js');

const TOP_N = { great: 100, ultra: 100, master: 80 };
const OUT = path.join(__dirname, '..', 'data');

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
  return res.json();
}

function write(name, obj) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));
  console.log('  gravado', name, '(' + Object.keys(obj).length + ' chaves)');
}

function assertNonEmpty(label, obj) {
  if (!obj || Object.keys(obj).length === 0) throw new Error('validação: ' + label + ' vazio — abortando');
}

async function main() {
  console.log('Baixando fontes…');
  const [gm, rGreat, rUltra, rMaster, gameMaster, i18nPt] = await Promise.all([
    getJson(S.PVPOKE_GAMEMASTER),
    getJson(S.PVPOKE_RANKINGS.great),
    getJson(S.PVPOKE_RANKINGS.ultra),
    getJson(S.PVPOKE_RANKINGS.master),
    getJson(S.POKEMINERS_GAME_MASTER),
    getJson(S.POKEMINERS_I18N_PT),
  ]);

  console.log('Transformando…');
  const species = T.buildSpecies(gm);
  const moves = T.buildMoves(gm);
  const movesPtRes = T.buildMovesPt(gameMaster, i18nPt);
  const pvpRanks = T.buildPvpRanks({ great: rGreat, ultra: rUltra, master: rMaster }, TOP_N);

  assertNonEmpty('species', species);
  assertNonEmpty('moves', moves);
  assertNonEmpty('movesPt', movesPtRes.map);
  assertNonEmpty('pvpRanks', pvpRanks);
  if (movesPtRes.coverage < 0.8)
    throw new Error('validação: cobertura PT ' + (movesPtRes.coverage * 100).toFixed(1) + '% < 80% — schema mudou?');

  write('species.json', species);
  write('moves.json', moves);
  write('moves_pt.json', movesPtRes.map);
  write('pvp_ranks.json', pvpRanks);
  write('meta.json', {
    generatedAt: new Date().toISOString(),
    pvpokeSource: S.PVPOKE_GAMEMASTER,
    counts: {
      species: Object.keys(species).length, moves: Object.keys(moves).length,
      movesPt: Object.keys(movesPtRes.map).length, pvpRanked: Object.keys(pvpRanks).length,
    },
    ptCoverage: Number(movesPtRes.coverage.toFixed(3)),
    topN: TOP_N,
  });
  console.log('OK.');
}

main().catch(err => { console.error('FALHA:', err.message); process.exit(1); });
```

- [ ] **Step 2: Adicionar script em `pokemon/package.json`**

```json
  "scripts": {
    "test": "node --test",
    "build": "node build/refresh-meta.js"
  }
```

- [ ] **Step 3: Rodar de verdade e gerar os datasets**

Run: `cd pokemon && npm run build`
Expected: imprime "Baixando…", "Transformando…", grava os 5 arquivos sem erro, "OK." Conferir `data/meta.json` → `ptCoverage` ≥ 0.8 e counts plausíveis (species ~1100, pvpRanked ≤ 280).

> Se falhar por schema (validação dispara), volte ao SOURCES.md da Tarefa 1 e ajuste o transformador correspondente; este é o ponto onde o "falha alto" do spec protege a integridade dos dados.

- [ ] **Step 4: Verificar manualmente um cruzamento real**

Run:
```bash
cd pokemon && node -e "const sp=require('./data/species.json');const mp=require('./data/moves_pt.json');const pr=require('./data/pvp_ranks.json');console.log('Machop →', !!sp.machop, '| Esmagamento de Pedras →', mp['esmagamento de pedras'], '| Medicham great rank →', pr.medicham && pr.medicham.great && pr.medicham.great.rank);"
```
Expected: `Machop → true | Esmagamento de Pedras → ROCK_SMASH | Medicham great rank → <número>`.

- [ ] **Step 5: Commit (script + dados gerados)**

```bash
git add pokemon/build/refresh-meta.js pokemon/package.json pokemon/data/
git commit -m "fase0: orquestrador refresh-meta + datasets iniciais gerados"
```

---

### Task 11: `app.js` carrega os datasets e passa `meta` para `analyze`

Carregamento tolerante a falha: se `data/*` não existir (ainda não gerado), passa `meta` nulo → comportamento atual.

**Files:**
- Modify: `pokemon/app.js` (função `boot`)

- [ ] **Step 1: Adicionar carregamento dos datasets em `boot`**

Em `pokemon/app.js`, substituir o início de `boot()` (da linha `const res = await fetch('./colecao.json'...` até `allMons = analyze(...)`) por:

```js
      const res = await fetch('./colecao.json', { cache: 'no-store' });
      const data = await res.json();
      document.getElementById('updated').textContent = 'Leo · ' + (data.exportTime || '');
      document.getElementById('total').textContent = (data.pokemonCount || 0) + ' Pokémons';

      const meta = await loadMeta();   // null se datasets ausentes
      allMons = analyze(data.fileData, getPokemonSize,
                        { LEGENDARY, REGIONAL, TRADE_EVO }, getPokemonSizeScalar, meta);
```

E adicionar a função `loadMeta` logo acima de `boot`:

```js
  async function loadMeta() {
    try {
      const [species, movesPt] = await Promise.all([
        fetch('./data/species.json').then(r => r.ok ? r.json() : null),
        fetch('./data/moves_pt.json').then(r => r.ok ? r.json() : null),
      ]);
      if (!species || !movesPt) return null;
      return { speciesIndex: buildSpeciesIndex(species), movesPt };
    } catch (e) { console.warn('meta indisponível:', e); return null; }
  }
```

- [ ] **Step 2: Carregar `match.js` no `index.html`**

Em `pokemon/index.html`, adicionar a tag de script de `match.js` ANTES de `app.js` e junto dos outros libs. Localizar a linha que carrega `lib/analysis.js` e inserir após ela:

```html
  <script src="lib/meta/match.js"></script>
```

(Conferir no `index.html` a ordem: `sizes.js`, `lib/refdata.js`, `lib/analysis.js`, `lib/meta/match.js`, `lib/render.js`, `app.js`.)

- [ ] **Step 3: Verificação manual no navegador**

Run: `cd pokemon && python -m http.server 8000` (ou abrir via Live Server) e acessar `http://localhost:8000`.
Expected: a página carrega normalmente; no console, `window.__pokeApp.getMons().find(m => m.name === 'Meditite').speciesId` retorna `"meditite"`, e `.moveIds` lista os golpes que casaram. Nenhuma regressão visual.

- [ ] **Step 4: Commit**

```bash
git add pokemon/app.js pokemon/index.html
git commit -m "fase0: app carrega datasets e passa meta para analyze (degrada se ausente)"
```

---

### Task 12: Service worker — cachear `data/*` (network-first) + bump de versão

**Files:**
- Modify: `pokemon/sw.js`

- [ ] **Step 1: Bump da versão do cache**

Em `pokemon/sw.js`, trocar `const CACHE = 'pokemon-leo-v6';` por `const CACHE = 'pokemon-leo-v7';`.

- [ ] **Step 2: Adicionar `match.js` e os datasets aos ASSETS**

Trocar o array `ASSETS` por:

```js
const ASSETS = [
  './index.html', './app.js', './sizes.js',
  './lib/refdata.js', './lib/analysis.js', './lib/render.js', './lib/meta/match.js',
  './colecao.json', './manifest.json',
  './data/species.json', './data/moves.json', './data/moves_pt.json',
  './data/pvp_ranks.json', './data/meta.json',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];
```

- [ ] **Step 3: Tratar `data/*` como network-first** (igual ao `colecao.json`)

Trocar a linha do `isData` por:

```js
  const isData = url.pathname.endsWith('colecao.json') || url.pathname.includes('/data/');
```

- [ ] **Step 4: Verificação manual**

Run: recarregar a página (com SW), conferir no DevTools → Application → Cache Storage que `pokemon-leo-v7` contém os arquivos de `data/`. Modo offline: a página ainda carrega com os últimos dados.

- [ ] **Step 5: Commit**

```bash
git add pokemon/sw.js
git commit -m "fase0: sw cacheia data/* (network-first) e bump v7"
```

---

### Task 13: GitHub Action `refresh-meta.yml` (agendada + manual)

**Files:**
- Create: `.github/workflows/refresh-meta.yml`

- [ ] **Step 1: Escrever o workflow**

```yaml
# .github/workflows/refresh-meta.yml
name: Atualizar dados de meta (Pokémon)

on:
  schedule:
    - cron: '0 6 * * 1'   # toda segunda 06:00 UTC
  workflow_dispatch: {}    # botão "Run workflow" manual

permissions:
  contents: write

jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Gerar datasets
        working-directory: pokemon
        run: npm run build
      - name: Commitar se houve mudança
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if ! git diff --quiet -- pokemon/data; then
            git add pokemon/data
            git commit -m "chore: atualizar dados de meta (automático)"
            git push
          else
            echo "Sem mudanças nos datasets."
          fi
```

- [ ] **Step 2: Validar a sintaxe do YAML**

Run: `cd "I:\Meu Drive\Site-moreno-arquitetura" && node -e "const fs=require('fs');const s=fs.readFileSync('.github/workflows/refresh-meta.yml','utf8');console.log('linhas:', s.split('\n').length); if(!/npm run build/.test(s)) throw new Error('faltou build');"`
Expected: imprime o número de linhas sem lançar erro.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/refresh-meta.yml
git commit -m "fase0: GitHub Action que regenera datasets de meta"
```

> Após o merge, validar uma vez pela aba **Actions → Atualizar dados de meta → Run workflow** (dispatch manual) e conferir que roda verde e (se houver mudança) commita `pokemon/data/`.

---

### Task 14: Verificação final da Fase 0

- [ ] **Step 1: Suíte completa verde**

Run: `cd pokemon && node --test`
Expected: PASS em todos os arquivos de teste (`counts`, `grouping`, `refdata`, `enrich`, `render`, `verdict`, `transform`, `match`).

- [ ] **Step 2: Conferir os critérios de sucesso da Fase 0 (do spec §12)**

Checklist manual:
- `pokemon/data/*` existe e foi gerado pelo script (não à mão).
- `meta.json.ptCoverage` ≥ 0.8.
- Abrir a página: nenhuma regressão visual; mons têm `speciesId`/`moveIds` no objeto enriquecido (via console).
- Trocar o `colecao.json` por um export novo continua sendo o único passo manual do Leo; os datasets vêm da Action.

- [ ] **Step 3: Commit final (se algo pendente) e fim da Fase 0**

```bash
git add -A && git commit -m "fase0: verificação final" --allow-empty
```

---

## Notas para as próximas fases (fora deste plano)

- **Fase 1 (PvP):** `lib/meta/pvp.js` com o cálculo de rank de IV (precisa de `cpMultipliers` — confirmar na sondagem se vem do PvPoke gamemaster ou do PokeMiners GAME_MASTER; pode exigir um `data/cpm.json`). Tags `pvp_*`, ações Fortalecer/Ensinar-TM, chips ⚔️.
- **Fase 2 (PvE):** stats PvE de golpe vêm do PokeMiners GAME_MASTER (já baixado aqui), não do PvPoke gamemaster (que é PvP). Estender `moves.json` com bloco `pve`.
- O `build/refresh-meta.js` já baixa o GAME_MASTER e a i18n — as fases seguintes reaproveitam o download.
