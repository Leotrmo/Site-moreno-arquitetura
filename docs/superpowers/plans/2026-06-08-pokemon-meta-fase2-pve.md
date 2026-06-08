# Camada de Meta Competitivo — Fase 2 (PvE: raid / pve / gym_atk / gym_def) — Plano de Implementação

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa-a-tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

**Goal:** Adicionar o motor de PvE. Calcular **DPS/TDO/ER por espécie+melhor-moveset no build** (do Game Master do PokeMiners) e emitir `pokemon/data/pve_ranks.json` com ranking **por tipo de ataque** + papéis. No runtime, derivar as tags `raid` / `pve` / `gym_atk` (espécie+moveset) e `gym_def` (bulk do **IV individual**), os selos 🔥🛡️, os chips 🔥 Raid / 🛡️ Def. Ginásio e o bloco "Competitivo" PvE no detalhe — estendendo a ação **Fortalecer/Ensinar-TM** para atacantes de raid — sem regredir nada da Fase 1.

**Architecture:** O motor PvE vive em `lib/meta/pve.js` (UMD, igual a `pvp.js`/`match.js`): funções **puras** de dano/DPS/TDO/ER + `bestMoveset` (enumera o pool de golpes da espécie) — usadas **no build** por `buildPveRanks` (transform.js) para gerar os rankings — mais o avaliador de runtime (`defBulk`, `evalMon`, `pveTags`). O build estende `buildSpecies` (passa a emitir `fastMoves`/`chargedMoves`) e `buildMoves` (anexa um bloco `pve:{power,energy,durationMs}` a cada golpe, vindo do Game Master). `analysis.js` chama `evalMon` dentro de `analyze()`, anexando `e.pveMeta`, tags PvE e estendendo `computeAction`/`isProtected`/`computeCounts`. Sem `meta.pveRanks`, tudo degrada para o comportamento da Fase 1 — não-regressão byte-a-byte no caminho sem dados.

**Tech Stack:** Node 18+ (global `fetch`, `node --test`), JavaScript (CommonJS no build, UMD no runtime), GitHub Actions (workflow da Fase 0 já regenera os dados).

**Referência:** `docs/superpowers/specs/2026-06-07-pokemon-meta-competitivo-design.md` (§8 "Motor de PvE", §9 ações, §10 UI, §11 Fase 2). Estruturas de fonte confirmadas ao vivo em `pokemon/build/SOURCES.md` (§3 e a nova §6 da Task 1). Padrões herdados de `docs/superpowers/plans/2026-06-08-pokemon-meta-fase1-pvp.md`.

---

## Fontes externas (já baixadas pela Fase 0/1 — nenhuma URL nova)

| Fonte | URL (em `build/sources.js`) | Uso nesta fase |
|---|---|---|
| PvPoke gamemaster | `PVPOKE_GAMEMASTER` | `species.json` ganha `fastMoves`/`chargedMoves` (pools de golpe); baseStats/tipos já vêm de lá |
| PokeMiners Game Master | `POKEMINERS_GAME_MASTER` | **stats PvE de golpe** (`power`, `energyDelta`, `durationMs`) → bloco `pve` em `moves.json` |

**GOTCHA confirmado na sondagem (Task 1):** os stats **PvE** de golpe NÃO vêm dos templates `COMBAT_V####_MOVE_*` (esses são PvP, `combatMove`/`durationTurns`, já documentados em SOURCES §3). Vêm dos templates **`V####_MOVE_*`** com a chave **`moveSettings`**:
- `movementId` (ex.: `ROCK_SMASH_FAST`; fast tem sufixo `_FAST`, charged não), `pokemonType` (`POKEMON_TYPE_FIGHTING`), `power`, `durationMs`, `damageWindowStartMs`, `energyDelta` (**positivo p/ fast = ganho; negativo p/ charged = custo**).
- 322 templates: **80 fast** (`_FAST`) + **242 charged**. Todos têm `durationMs`.
- `moveId` para casar com `moves.json` (chaves do PvPoke): **tira o sufixo `_FAST`** (`ROCK_SMASH_FAST` → `ROCK_SMASH`; `WRAP` → `WRAP`).

## Estrutura de arquivos (Fase 2)

```
pokemon/
  build/
    transform.js        ← + fastMoves/chargedMoves em buildSpecies; + buildMovesPve; + buildPveRanks (usa lib/meta/pve.js)
    refresh-meta.js     ← + merge pve em moves.json; + emite data/pve_ranks.json (com validação)
  data/
    species.json        ← agora inclui fastMoves[]/chargedMoves[] por espécie (regenerado)
    moves.json          ← cada golpe ganha bloco pve:{power,energy,durationMs} (regenerado)
    pve_ranks.json      ← NOVO dataset gerado (commitado)
  lib/meta/
    pve.js              ← NOVO (UMD): constantes PVE, dmgPerHit, cycleDps, tdoFor, erFor,
                          bestMoveset (build), defBulk, evalMon, pveTags (runtime)
  lib/
    analysis.js         ← + e.pveMeta, tags raid/pve/gym_atk/gym_def, isPveMeta em isProtected,
                          counts, computeAction estendido p/ PvE
    render.js           ← + selos 🔥/🛡️, bloco "Competitivo" PvE no detalhe
  app.js                ← loadMeta carrega pve_ranks; chips 🔥 Raid / 🛡️ Def. Ginásio
  index.html            ← <script src="lib/meta/pve.js"> ANTES de lib/analysis.js; CSS dos selos/bloco PvE
  sw.js                 ← + pve.js e pve_ranks.json nos ASSETS; bump v9 → v10
  fixtures/
    mini-gm-pve.json    ← NOVO: 2 templates de golpe PvE (1 fast + 1 charged) p/ testar buildMovesPve
  test/
    transform.test.js   ← + buildSpecies pools, buildMovesPve, buildPveRanks
    pve.test.js         ← NOVO: dmgPerHit, cycleDps, tdoFor, erFor, bestMoveset, defBulk, evalMon, pveTags
    enrich.test.js      ← + e.pveMeta/tags no enrich (com meta) e não-regressão (sem meta)
    counts.test.js      ← + contagens raid/pve/gymAtk/gymDef
    verdict.test.js     ← + computeAction PvE (Fortalecer p/ Raid)
    render.test.js      ← + selos 🔥/🛡️ e bloco Competitivo PvE
```

## Contrato de dados (build ↔ runtime)

```jsonc
// moves.json — cada golpe ganha um bloco pve (energy = MAGNITUDE, sempre >0). null não; ausente se sem PvE.
{ "ROCK_SMASH": { "type":"fighting", "kind":"fast",   "pvp":{...}, "pve":{ "power":17, "energy":12, "durationMs":1500 } },
  "ICE_BEAM":   { "type":"ice",      "kind":"charge", "pvp":{...}, "pve":{ "power":90, "energy":50, "durationMs":3300 } } }
```

```jsonc
// pve_ranks.json — chave = speciesId. Emitido p/ espécies atacantes OU bulk-candidatas (gym_def).
{
  "kyurem_black": {
    "bestMoveset": ["DRAGON_TAIL","FREEZE_SHOCK"],   // moveset de maior ER (qualquer tipo)
    "bestType": "ice",
    "byType": {                                       // por tipo de ataque que a espécie cobre
      "ice":    { "dps": 20.5, "tdo": 612.3, "er": 62.1, "dpsRank": 1, "erRank": 1, "moveset": ["DRAGON_TAIL","FREEZE_SHOCK"] }
    },
    "roles": ["raid","pve","gym_atk"],                // papéis de espécie (gym_def NÃO entra aqui)
    "defBulkRank": 134                                // rank global por baseDef*baseHP (1 = mais bulky)
  },
  "blissey": { "bestMoveset":[...], "bestType":"normal", "byType":{...}, "roles":[...], "defBulkRank": 2 }
}
```

```jsonc
// Saída por mon (anexada em analysis.js como e.pveMeta). null quando não há meta de PvE.
e.pveMeta = {
  raid: true, pve: true, gymAtk: true,   // papéis de espécie (de roles)
  gymDef: false,                          // calculado no runtime: espécie bulk-candidata + IV def/HP alto
  bestType: "ice",
  bestMoveset: ["DRAGON_TAIL","FREEZE_SHOCK"],
  byType: { ice: { dps:20.5, er:62.1, dpsRank:1, erRank:1, ... } },
  movesetOk: true                         // moveIds do mon casam com bestMoveset (p/ ação/detalhe)
}
// e.tags inclui (aditivo): 'raid' | 'pve' | 'gym_atk' | 'gym_def'
// e.action pode virar { kind:'FORTALECER'|'ENSINAR_TM', role:'raid', reason } quando o mon é atacante de raid.
```

## Constantes do motor (topo de `lib/meta/pve.js`, configuráveis — spec §8; afinadas na Fase 4)

```js
var PVE = {
  CPM: 0.7903,        // cpm(L40): atacante "maxado" a nível fixo (spec §8: L40, neutro)
  IV: 15,             // IV fixo do atacante (DPS quase não varia com IV → ranking de espécie)
  DEF_REF: 180,       // defesa do alvo neutro de referência (constante → não muda o ranking de DPS)
  STAB: 1.2,          // bônus de mesmo tipo
  INCOMING_K: 800,    // constante de pressão recebida p/ TDO (tdo ∝ dps·HP·Def / K)
  ER_WEIGHT: 0.7,     // peso do DPS no ER; TDO recebe (1 - 0.7) = 0.3 (spec §8: "DPS↑ sobre TDO")
};
var RAID_TOP     = 10;  // espécie no Top 10 de ER de algum tipo → role 'raid'
var PVE_TOP      = 35;  // Top 35 de ER de algum tipo → role 'pve' (camada mais larga)
var GYM_ATK_TOP  = 20;  // Top 20 de DPS de um tipo COM cobertura ofensiva alta → role 'gym_atk'
var GYM_ATK_COVERAGE_MIN = 3; // nº mín. de tipos contra os quais o tipo é super-eficaz (carta padrão)
var GYM_DEF_TOP  = 50;  // 50 espécies mais bulky (baseDef*baseHP) = candidatas a defensor
var GYM_DEF_IV_MIN = 13; // p/ gym_def: o IV individual de Def E de HP precisa ser >= 13 (bulk pessoal)
```

> **Honestidade (spec §8):** DPS/TDO/ER é **estimativa de triagem** (ciclo fast+charged a L40 neutro), NÃO simulação por chefe. O bloco "Competitivo" rotula como "estimativa".
> **Por que esses ranks são invariantes:** `DEF_REF`, `CPM` e `INCOMING_K` são constantes globais → escalam todos os DPS/TDO igualmente → a **ordem** (dpsRank/erRank) não depende dos valores exatos. Por isso os testes de dados reais usam **propriedades** (ex.: "Blissey está entre os 5 mais bulky"), não números mágicos.

---

### Task 1: Sondagem dos golpes PvE + registro em SOURCES.md (investigação, sem TDD)

Objetivo: confirmar ao vivo a estrutura dos golpes PvE e **registrar em `SOURCES.md`** antes de codar (mesma disciplina das Fases 0/1). O código será escrito contra a realidade confirmada.

**Files:**
- Modify: `pokemon/build/SOURCES.md`

- [ ] **Step 1: Rodar a sondagem dos golpes PvE**

Run (na raiz do repo):
```bash
cd "I:\Meu Drive\Site-moreno-arquitetura\pokemon" && node -e "
(async()=>{
  const S=require('./build/sources.js');
  const gm=await (await fetch(S.POKEMINERS_GAME_MASTER)).json();
  const pve=gm.filter(t=>/^V\d{4}_MOVE_/.test(t.templateId||'') && t.data && t.data.moveSettings);
  console.log('PvE move templates:', pve.length);
  const rs=pve.find(t=>/ROCK_SMASH/.test(t.templateId)); const wr=pve.find(t=>t.templateId==='V0013_MOVE_WRAP');
  console.log('FAST keys:', Object.keys(rs.data.moveSettings).join(','));
  console.log('FAST sample:', JSON.stringify(rs.data.moveSettings));
  console.log('CHARGED sample:', JSON.stringify(wr.data.moveSettings));
  const ids=pve.map(t=>t.data.moveSettings.movementId);
  console.log('fast (_FAST):', ids.filter(id=>/_FAST$/.test(id)).length, '| charged:', ids.filter(id=>!/_FAST$/.test(id)).length);
})()"
```

Expected (confirmações a anotar): `PvE move templates: 322`; chave é `moveSettings`; FAST `power:17,durationMs:1500,energyDelta:12,pokemonType:POKEMON_TYPE_FIGHTING`; CHARGED Wrap `power:60,durationMs:3000,energyDelta:-33`; `fast 80 | charged 242`.

> Se a contagem ou os campos divergirem (schema mudou), ajuste `buildMovesPve` (Task 3) e a validação (Task 9) conforme o que aparecer — registre o real no SOURCES.md.

- [ ] **Step 2: Anexar a seção ao `pokemon/build/SOURCES.md`** (no fim do arquivo)

```markdown

---

## 6. PokeMiners — Golpes PvE (Fase 2)

URL: a mesma do Game Master (seção 3).

Templates **`V{NNNN}_MOVE_{NOME}`** (sem prefixo `COMBAT_`) → chave **`data.moveSettings`**. Total: **322** (80 fast + 242 charged). NÃO confundir com os `COMBAT_V####_MOVE_*` (PvP, seção 3).

### Campos de `moveSettings`
- `movementId` (ex.: `ROCK_SMASH_FAST`) — **fast tem sufixo `_FAST`; charged não**.
- `pokemonType` (`POKEMON_TYPE_FIGHTING`) — normalizar: tira `POKEMON_TYPE_`, minúsculo.
- `power`, `durationMs`, `damageWindowStartMs`, `damageWindowEndMs`.
- `energyDelta`: **positivo p/ fast** (ganho), **negativo p/ charged** (custo). Em `moves.json` guardamos `energy = Math.abs(energyDelta)` (magnitude).

### Casamento com `moves.json` (chaves PvPoke)
`moveId = movementId.replace(/_FAST$/, '')` → `ROCK_SMASH_FAST` → `ROCK_SMASH`; `WRAP` → `WRAP`. Os `fastMoves`/`chargedMoves` do PvPoke usam exatamente esses ids (sem `_FAST`).

### Fórmulas (estimativa de triagem, padrão GamePress "weave", L40 neutro)
- **Dano/golpe** = `floor(0.5 · power · (Atk / DEF_REF) · STAB) + 1`, com `Atk=(baseAtk+15)·cpm(40)`, `STAB=1.2` se o tipo do golpe ∈ tipos da espécie, alvo neutro (efetividade 1).
- **DPS (ciclo)** = `(n·Df + Dc) / (n·Tf + Tc)`, `n = energiaCarregado / energiaRápido` (golpes rápidos por carregado), `T*` em segundos.
- **TDO** = `dps · HP · Def / K` (bulk via Def·HP), `K` constante.
- **ER** = `dps^0.7 · tdo^0.3` (pondera DPS sobre TDO).

### (f) Confirmação
| Pergunta | Resposta |
|---|---|
| Template PvE vs PvP? | PvE = `V####_MOVE_*` (`moveSettings`); PvP = `COMBAT_V####_MOVE_*` (`combatMove`). |
| Distinção fast/charged? | **Sufixo `_FAST`** no `movementId`. (energyDelta também: +fast/−charged.) |
| `durationMs` sempre presente? | **SIM** (0 ausentes em 322). |
```

- [ ] **Step 3: Commit**

```bash
git add pokemon/build/SOURCES.md
git commit -m "fase2: sondagem e registro dos golpes PvE (PokeMiners GAME_MASTER)"
```

---

### Task 2: `buildSpecies` passa a emitir `fastMoves`/`chargedMoves` (TDD)

O motor de PvE precisa enumerar o pool de golpes de cada espécie. Eles existem no `pokemon[]` do PvPoke (`fastMoves`/`chargedMoves`), mas `buildSpecies` hoje não os copia.

**Files:**
- Modify: `pokemon/build/transform.js`
- Test: `pokemon/test/transform.test.js`

- [ ] **Step 1: Adicionar o teste que falha** (append em `pokemon/test/transform.test.js`)

```js
test('buildSpecies: inclui fastMoves e chargedMoves do pool da espécie', () => {
  const gm = { pokemon: [{
    dex: 66, speciesId: 'machop', baseStats: { atk:137, def:82, hp:172 },
    types: ['fighting','none'], family: { id:'FAMILY_MACHOP' },
    fastMoves: ['KARATE_CHOP','LOW_KICK','ROCK_SMASH'],
    chargedMoves: ['BRICK_BREAK','CROSS_CHOP','LOW_SWEEP'],
    eliteMoves: ['LOW_KICK'], tags: ['shadoweligible'],
  }] };
  const out = require('../build/transform.js').buildSpecies(gm);
  assert.deepStrictEqual(out.machop.fastMoves, ['KARATE_CHOP','LOW_KICK','ROCK_SMASH']);
  assert.deepStrictEqual(out.machop.chargedMoves, ['BRICK_BREAK','CROSS_CHOP','LOW_SWEEP']);
  // não-regressão: campos antigos intactos
  assert.deepStrictEqual(out.machop.baseStats, { atk:137, def:82, hp:172 });
  assert.deepStrictEqual(out.machop.types, ['fighting']);
});

test('buildSpecies: pools ausentes viram arrays vazios (não quebra)', () => {
  const gm = { pokemon: [{ dex: 1, speciesId: 'x', baseStats:{atk:1,def:1,hp:1}, types:['grass'] }] };
  const out = require('../build/transform.js').buildSpecies(gm);
  assert.deepStrictEqual(out.x.fastMoves, []);
  assert.deepStrictEqual(out.x.chargedMoves, []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: FAIL — `out.machop.fastMoves` é `undefined`.

- [ ] **Step 3: Implementação** — em `pokemon/build/transform.js`, no objeto montado dentro de `buildSpecies`, adicionar as duas linhas (após `eliteMoves: p.eliteMoves || [],`):

```js
      fastMoves: p.fastMoves || [],
      chargedMoves: p.chargedMoves || [],
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/build/transform.js pokemon/test/transform.test.js
git commit -m "fase2: buildSpecies emite fastMoves/chargedMoves"
```

---

### Task 3: `buildMovesPve` em `transform.js` (TDD)

Extrai os stats PvE de golpe do Game Master (`V####_MOVE_*` → `moveSettings`), chaveados pelo `moveId` do PvPoke (sufixo `_FAST` removido).

**Files:**
- Modify: `pokemon/build/transform.js`
- Create: `pokemon/fixtures/mini-gm-pve.json`
- Test: `pokemon/test/transform.test.js`

- [ ] **Step 1: Criar o fixture** (1 fast + 1 charged, formato real do Game Master)

```json
[
  { "templateId": "V0241_MOVE_ROCK_SMASH_FAST", "data": { "templateId": "V0241_MOVE_ROCK_SMASH_FAST",
    "moveSettings": { "movementId": "ROCK_SMASH_FAST", "pokemonType": "POKEMON_TYPE_FIGHTING",
      "power": 17, "durationMs": 1500, "damageWindowStartMs": 750, "energyDelta": 12 } } },
  { "templateId": "V0013_MOVE_WRAP", "data": { "templateId": "V0013_MOVE_WRAP",
    "moveSettings": { "movementId": "WRAP", "pokemonType": "POKEMON_TYPE_NORMAL",
      "power": 60, "durationMs": 3000, "damageWindowStartMs": 2150, "energyDelta": -33 } } },
  { "templateId": "V0001_POKEMON_BULBASAUR", "data": { "templateId": "V0001_POKEMON_BULBASAUR" } }
]
```

(salvar em `pokemon/fixtures/mini-gm-pve.json` — a 3ª entrada é ruído que deve ser ignorado)

- [ ] **Step 2: Adicionar o teste que falha** (append em `pokemon/test/transform.test.js`)

```js
const miniGmPve = require('../fixtures/mini-gm-pve.json');

test('buildMovesPve: V####_MOVE_* → {power,energy(abs),durationMs}, moveId sem _FAST', () => {
  const { buildMovesPve } = require('../build/transform.js');
  const res = buildMovesPve(miniGmPve);
  assert.deepStrictEqual(res.map.ROCK_SMASH, { power: 17, energy: 12, durationMs: 1500 }); // fast: energyDelta 12
  assert.deepStrictEqual(res.map.WRAP, { power: 60, energy: 33, durationMs: 3000 });        // charged: |−33| = 33
  assert.strictEqual(res.map.ROCK_SMASH_FAST, undefined);  // chaveado sem o sufixo _FAST
  assert.strictEqual(res.count, 2);                         // ignora a entrada não-MOVE
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: FAIL — `buildMovesPve is not a function`.

- [ ] **Step 4: Implementação** (adicionar em `transform.js`, antes do `module.exports`)

```js
// Stats PvE de golpe do Game Master do PokeMiners (templates V####_MOVE_*, chave moveSettings).
// Chaveia pelo moveId do PvPoke: tira o sufixo _FAST. energy = magnitude de energyDelta.
function buildMovesPve(gameMaster) {
  const arr = Array.isArray(gameMaster) ? gameMaster : (gameMaster.template || gameMaster.itemTemplates);
  if (!Array.isArray(arr)) throw new Error('buildMovesPve: game master sem array de templates');
  const map = {};
  let count = 0;
  for (const t of arr) {
    const tid = t.templateId || (t.data && t.data.templateId) || '';
    if (!/^V\d{4}_MOVE_/.test(tid)) continue;
    const ms = t.data && t.data.moveSettings;
    if (!ms || typeof ms.movementId !== 'string') continue;
    const moveId = ms.movementId.replace(/_FAST$/, '');
    map[moveId] = {
      power: ms.power || 0,
      energy: Math.abs(ms.energyDelta || 0),
      durationMs: ms.durationMs || 0,
    };
    count++;
  }
  return { map, count };
}
```

E acrescentar `buildMovesPve` ao `module.exports`:

```js
module.exports = { buildSpecies, buildMoves, buildMovesPve, buildMovesPt, buildPvpRanks, LEAGUES, expandCpm };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pokemon/build/transform.js pokemon/fixtures/mini-gm-pve.json pokemon/test/transform.test.js
git commit -m "fase2: buildMovesPve (stats PvE de golpe do GAME_MASTER)"
```

---

### Task 4: `pve.js` — constantes + `dmgPerHit` (TDD)

Cria o módulo UMD `lib/meta/pve.js` (mesmo padrão de `pvp.js`) com as constantes e a fórmula de dano por golpe.

**Files:**
- Create: `pokemon/lib/meta/pve.js`
- Test: `pokemon/test/pve.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// pokemon/test/pve.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { dmgPerHit, effAtk } = require('../lib/meta/pve.js');

test('effAtk: (baseAtk + IV) * CPM(L40)', () => {
  assert.ok(Math.abs(effAtk({ atk: 100, def: 1, hp: 1 }) - (115 * 0.7903)) < 1e-9); // 90.8845
});

test('dmgPerHit: floor(0.5·power·(atk/DEF_REF)·stab) + 1', () => {
  // atk = 90.8845, DEF_REF 180 → atk/DEF_REF = 0.504914
  // sem STAB: floor(0.5·10·0.504914·1)+1 = floor(2.5246)+1 = 3
  assert.strictEqual(dmgPerHit(10, 90.8845, 1), 3);
  // com STAB 1.2: floor(0.5·10·0.504914·1.2)+1 = floor(3.0295)+1 = 4
  assert.strictEqual(dmgPerHit(10, 90.8845, 1.2), 4);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: FAIL — `Cannot find module '../lib/meta/pve.js'`.

- [ ] **Step 3: Implementação mínima** (cria o módulo UMD)

```js
// pokemon/lib/meta/pve.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokePve = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var PVE = { CPM: 0.7903, IV: 15, DEF_REF: 180, STAB: 1.2, INCOMING_K: 800, ER_WEIGHT: 0.7 };
  var RAID_TOP = 10, PVE_TOP = 35, GYM_ATK_TOP = 20, GYM_ATK_COVERAGE_MIN = 3,
      GYM_DEF_TOP = 50, GYM_DEF_IV_MIN = 13;

  function effAtk(base) { return (base.atk + PVE.IV) * PVE.CPM; }
  function effDef(base) { return (base.def + PVE.IV) * PVE.CPM; }
  function effHp(base)  { return (base.hp  + PVE.IV) * PVE.CPM; }

  // Dano de 1 golpe contra um alvo neutro de referência (efetividade = 1).
  function dmgPerHit(power, atk, stab) {
    return Math.floor(0.5 * power * (atk / PVE.DEF_REF) * stab) + 1;
  }

  return { PVE, RAID_TOP, PVE_TOP, GYM_ATK_TOP, GYM_ATK_COVERAGE_MIN, GYM_DEF_TOP, GYM_DEF_IV_MIN,
           effAtk, effDef, effHp, dmgPerHit };
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pve.js pokemon/test/pve.test.js
git commit -m "fase2: pve.js constantes + dmgPerHit"
```

---

### Task 5: `pve.js` — `cycleDps` (TDD)

DPS do ciclo fast+charged (estimativa weave): `n = energiaCarregado/energiaRápido` golpes rápidos por carregado.

**Files:**
- Modify: `pokemon/lib/meta/pve.js`
- Test: `pokemon/test/pve.test.js`

- [ ] **Step 1: Adicionar o teste que falha** (append em `pve.test.js`)

```js
const { cycleDps } = require('../lib/meta/pve.js');

test('cycleDps: ciclo fast+charged a L40, com STAB por tipo', () => {
  const base = { atk: 100, def: 100, hp: 100 };  // effAtk = 90.8845
  const fast    = { type: 'fighting', pve: { power: 10, energy: 10, durationMs: 1000 } };
  const charged = { type: 'fighting', pve: { power: 50, energy: 50, durationMs: 2000 } };
  // STAB nos dois (tipo ∈ ['fighting']): Df = dmgPerHit(10,90.8845,1.2)=4 ; Dc = dmgPerHit(50,90.8845,1.2)=
  //   floor(0.5·50·0.504914·1.2)+1 = floor(15.147)+1 = 16
  // n = 50/10 = 5 ; cycleDmg = 5·4 + 16 = 36 ; cycleTime = 5·1.0 + 2.0 = 7.0 s → DPS = 36/7 = 5.142857
  const dps = cycleDps(fast, charged, base, ['fighting']);
  assert.ok(Math.abs(dps - (36 / 7)) < 1e-9);
});

test('cycleDps: 0 se o golpe rápido não gera energia (evita divisão por zero)', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  const fast    = { type: 'normal', pve: { power: 5, energy: 0, durationMs: 1000 } };
  const charged = { type: 'normal', pve: { power: 50, energy: 50, durationMs: 2000 } };
  assert.strictEqual(cycleDps(fast, charged, base, ['normal']), 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: FAIL — `cycleDps is not a function`.

- [ ] **Step 3: Implementação** (adicionar em `pve.js`, antes do `return`)

```js
  // DPS do ciclo: n golpes rápidos por carregado (n = custo do carregado / ganho do rápido).
  // fast/charged = objetos de golpe com { type, pve:{power,energy,durationMs} }. types = tipos da espécie (STAB).
  function cycleDps(fast, charged, base, types) {
    if (!fast || !charged || !fast.pve || !charged.pve) return 0;
    if (!(fast.pve.energy > 0)) return 0;                 // sem geração de energia → ciclo indefinido
    var atk = effAtk(base);
    var sF = types.indexOf(fast.type) >= 0 ? PVE.STAB : 1;
    var sC = types.indexOf(charged.type) >= 0 ? PVE.STAB : 1;
    var dF = dmgPerHit(fast.pve.power, atk, sF), tF = fast.pve.durationMs / 1000;
    var dC = dmgPerHit(charged.pve.power, atk, sC), tC = charged.pve.durationMs / 1000;
    var n = charged.pve.energy / fast.pve.energy;
    var cycleTime = n * tF + tC;
    return cycleTime > 0 ? (n * dF + dC) / cycleTime : 0;
  }
```

E acrescentar `cycleDps` ao `return`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pve.js pokemon/test/pve.test.js
git commit -m "fase2: pve.js cycleDps (DPS weave fast+charged)"
```

---

### Task 6: `pve.js` — `tdoFor` + `erFor` (TDD)

TDO incorpora o bulk (Def·HP); ER combina DPS e TDO ponderando DPS.

**Files:**
- Modify: `pokemon/lib/meta/pve.js`
- Test: `pokemon/test/pve.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pve.test.js`)

```js
const { tdoFor, erFor } = require('../lib/meta/pve.js');

test('tdoFor: dps · HP · Def / INCOMING_K', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  // effHp = effDef = 115·0.7903 = 90.8845 ; tdo = 10 · 90.8845 · 90.8845 / 800
  const expected = 10 * (115 * 0.7903) * (115 * 0.7903) / 800;
  assert.ok(Math.abs(tdoFor(10, base) - expected) < 1e-6);
});

test('erFor: dps^0.7 · tdo^0.3 (pondera DPS sobre TDO)', () => {
  assert.ok(Math.abs(erFor(10, 100) - (Math.pow(10, 0.7) * Math.pow(100, 0.3))) < 1e-9);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: FAIL — `tdoFor is not a function`.

- [ ] **Step 3: Implementação** (adicionar em `pve.js`, antes do `return`)

```js
  // TDO (Total Damage Output): bulk via Def·HP. K constante → ranking invariante.
  function tdoFor(dps, base) {
    return dps * effHp(base) * effDef(base) / PVE.INCOMING_K;
  }
  // ER: combina DPS e TDO ponderando DPS (ER_WEIGHT).
  function erFor(dps, tdo) {
    if (dps <= 0 || tdo <= 0) return 0;
    return Math.pow(dps, PVE.ER_WEIGHT) * Math.pow(tdo, 1 - PVE.ER_WEIGHT);
  }
```

E acrescentar `tdoFor, erFor` ao `return`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pve.js pokemon/test/pve.test.js
git commit -m "fase2: pve.js tdoFor + erFor"
```

---

### Task 7: `pve.js` — `bestMoveset` (TDD)

Enumera o pool da espécie (`fastMoves × chargedMoves`), calcula DPS/TDO/ER de cada combo e devolve o melhor **geral** + o melhor **por tipo** (= tipo do golpe carregado). Usado pelo build.

**Files:**
- Modify: `pokemon/lib/meta/pve.js`
- Test: `pokemon/test/pve.test.js`

- [ ] **Step 1: Adicionar o teste que falha** (append em `pve.test.js`)

```js
const { bestMoveset } = require('../lib/meta/pve.js');

test('bestMoveset: melhor combo geral + por tipo (tipo = do carregado)', () => {
  const species = {
    baseStats: { atk: 200, def: 100, hp: 100 }, types: ['ice'],
    fastMoves: ['ICE_SHARD'], chargedMoves: ['AVALANCHE','BODY_SLAM'],
  };
  const movesById = {
    ICE_SHARD: { type: 'ice',    kind: 'fast',   pve: { power: 12, energy: 12, durationMs: 1200 } },
    AVALANCHE: { type: 'ice',    kind: 'charge', pve: { power: 90, energy: 45, durationMs: 2700 } },
    BODY_SLAM: { type: 'normal', kind: 'charge', pve: { power: 50, energy: 35, durationMs: 1900 } },
  };
  const r = bestMoveset(species, movesById);
  assert.ok(r.best, 'tem melhor combo');
  assert.strictEqual(r.byType.ice.moveset[0], 'ICE_SHARD');
  assert.strictEqual(r.byType.ice.moveset[1], 'AVALANCHE');   // STAB ice → maior ER no tipo ice
  assert.ok(r.byType.normal, 'tem entrada do tipo normal (Body Slam)');
  assert.ok(r.byType.ice.er > r.byType.normal.er);            // ice (STAB) vence
  assert.strictEqual(r.best.type, 'ice');
});

test('bestMoveset: sem golpe com dados PvE → null', () => {
  const species = { baseStats: { atk: 100, def: 100, hp: 100 }, types: ['grass'],
                    fastMoves: ['VINE_WHIP'], chargedMoves: ['SLUDGE_BOMB'] };
  assert.strictEqual(bestMoveset(species, {}).best, null);   // movesById vazio → nenhum combo válido
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: FAIL — `bestMoveset is not a function`.

- [ ] **Step 3: Implementação** (adicionar em `pve.js`, antes do `return`)

```js
  // Um id de golpe é usável em PvE só se existir em movesById COM bloco pve.
  function _hasPve(id, movesById) {
    var m = movesById[id];
    return !!(m && m.pve);
  }

  // Enumera fastMoves × chargedMoves; devolve { best, byType } por ER.
  // moveset guarda os IDS (vindos das chaves); byType é chaveado pelo tipo do carregado.
  function bestMoveset(species, movesById) {
    var base = species.baseStats, types = species.types || [];
    var fastIds = (species.fastMoves || []).filter(function (id) { return _hasPve(id, movesById); });
    var chgIds  = (species.chargedMoves || []).filter(function (id) { return _hasPve(id, movesById); });
    var byType = {}, best = null;
    for (var i = 0; i < fastIds.length; i++) {
      for (var j = 0; j < chgIds.length; j++) {
        var fId = fastIds[i], cId = chgIds[j];
        var F = movesById[fId], C = movesById[cId];
        var dps = cycleDps(F, C, base, types);
        if (!(dps > 0)) continue;
        var tdo = tdoFor(dps, base), er = erFor(dps, tdo);
        var rec = { moveset: [fId, cId], type: C.type, dps: dps, tdo: tdo, er: er };
        if (!byType[C.type] || er > byType[C.type].er) byType[C.type] = rec;
        if (!best || er > best.er) best = rec;
      }
    }
    return { best: best, byType: byType };
  }
```

E acrescentar `bestMoveset` ao `return`. (Os ids vêm das chaves de `movesById`, então os golpes não precisam carregar `moveId` embutido.)

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pve.js pokemon/test/pve.test.js
git commit -m "fase2: pve.js bestMoveset (enumera pool, melhor por tipo)"
```

---

### Task 8: `buildPveRanks` em `transform.js` (TDD)

Para cada espécie, calcula o melhor moveset (via `pve.js`), agrupa por tipo de ataque, e **ranqueia entre espécies por tipo** (erRank/dpsRank). Calcula `defBulkRank` global (baseDef·baseHP) e os `roles` de espécie. Emite entrada p/ atacantes **ou** candidatas a defensor.

**Files:**
- Modify: `pokemon/build/transform.js`
- Test: `pokemon/test/transform.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pokemon/test/transform.test.js`)

```js
test('buildPveRanks: ranqueia por tipo, marca roles e defBulkRank', () => {
  const { buildPveRanks } = require('../build/transform.js');
  // 2 atacantes ice (A forte, B fraco) + 1 muralha (W, bulk altíssimo, ataque fraco)
  const species = {
    a_strong: { baseStats: { atk: 300, def: 120, hp: 150 }, types: ['ice'],
                fastMoves: ['ICE_SHARD'], chargedMoves: ['AVALANCHE'] },
    b_weak:   { baseStats: { atk: 120, def: 100, hp: 120 }, types: ['ice'],
                fastMoves: ['ICE_SHARD'], chargedMoves: ['AVALANCHE'] },
    wall:     { baseStats: { atk: 60,  def: 250, hp: 450 }, types: ['normal'],
                fastMoves: ['POUND'], chargedMoves: ['BODY_SLAM'] },
  };
  const movesById = {
    ICE_SHARD: { type: 'ice',    pve: { power: 12, energy: 12, durationMs: 1200 } },
    AVALANCHE: { type: 'ice',    pve: { power: 90, energy: 45, durationMs: 2700 } },
    POUND:     { type: 'normal', pve: { power: 7,  energy: 6,  durationMs: 540 } },
    BODY_SLAM: { type: 'normal', pve: { power: 50, energy: 35, durationMs: 1900 } },
  };
  const out = buildPveRanks(species, movesById);
  // ranking ice: a_strong rank 1, b_weak rank 2
  assert.strictEqual(out.a_strong.byType.ice.erRank, 1);
  assert.strictEqual(out.b_weak.byType.ice.erRank, 2);
  assert.strictEqual(out.a_strong.byType.ice.dpsRank, 1);
  // defBulkRank: wall (250·450=112500) é o mais bulky
  assert.strictEqual(out.wall.defBulkRank, 1);
  // a_strong (Top 1 ice) ganha roles raid/pve
  assert.ok(out.a_strong.roles.includes('raid'));
  assert.ok(out.a_strong.roles.includes('pve'));
  // bestType/bestMoveset preenchidos
  assert.strictEqual(out.a_strong.bestType, 'ice');
  assert.deepStrictEqual(out.a_strong.bestMoveset, ['ICE_SHARD','AVALANCHE']);
});

test('buildPveRanks: espécie sem golpe PvE válido não recebe byType, mas pode entrar por bulk', () => {
  const { buildPveRanks } = require('../build/transform.js');
  const species = { onlywall: { baseStats: { atk: 10, def: 300, hp: 500 }, types: ['normal'],
                                fastMoves: ['X'], chargedMoves: ['Y'] } };  // X/Y sem pve → sem ataque
  const out = buildPveRanks(species, {});
  assert.ok(out.onlywall, 'entrou por ser candidata a defensor (defBulkRank 1)');
  assert.strictEqual(out.onlywall.defBulkRank, 1);
  assert.deepStrictEqual(out.onlywall.byType, {});
  assert.deepStrictEqual(out.onlywall.roles, []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: FAIL — `buildPveRanks is not a function`.

- [ ] **Step 3: Implementação** (adicionar em `transform.js`)

3a. No topo do arquivo, junto do require existente, importar o motor PvE e a carta de cobertura:

```js
const PokePve = require('../lib/meta/pve.js');

// Cobertura ofensiva: nº de tipos contra os quais cada tipo é super-eficaz (carta padrão).
// Usado p/ marcar gym_atk (atacante versátil contra defensores comuns).
const OFFENSIVE_COVERAGE = {
  normal:0, fire:4, water:3, electric:2, grass:3, ice:4, fighting:5, poison:2, ground:5,
  flying:3, psychic:2, bug:3, rock:4, ghost:2, dragon:1, dark:2, steel:3, fairy:3,
};
```

3b. Adicionar `buildPveRanks` (antes do `module.exports`):

```js
// Gera pve_ranks.json: ranking por tipo (erRank/dpsRank), roles de espécie e defBulkRank global.
function buildPveRanks(species, movesById, cfg) {
  cfg = cfg || {};
  const RAID = cfg.raidTop || PokePve.RAID_TOP;
  const PVET = cfg.pveTop  || PokePve.PVE_TOP;   // limiar de erRank p/ role 'pve' (não confundir com o objeto PVE de pve.js)
  const GATK = cfg.gymAtkTop || PokePve.GYM_ATK_TOP;
  const GCOV = cfg.gymAtkCoverageMin || PokePve.GYM_ATK_COVERAGE_MIN;
  const GDEF = cfg.gymDefTop || PokePve.GYM_DEF_TOP;

  const ids = Object.keys(species);
  // 1. melhor moveset por espécie + defBulk
  const calc = {};   // id → { best, byType, defBulk }
  for (const id of ids) {
    const sp = species[id];
    if (!sp || !sp.baseStats) continue;
    const bm = PokePve.bestMoveset(sp, movesById);
    calc[id] = { best: bm.best, byType: bm.byType, defBulk: sp.baseStats.def * sp.baseStats.hp };
  }

  // 2. ranking global por tipo (er e dps)
  const byTypeList = {};   // type → [{id, er, dps}]
  for (const id in calc) {
    const bt = calc[id].byType;
    for (const t in bt) (byTypeList[t] = byTypeList[t] || []).push({ id, er: bt[t].er, dps: bt[t].dps });
  }
  const erRankOf = {}, dpsRankOf = {};   // type → { id → rank }
  for (const t in byTypeList) {
    const byEr = byTypeList[t].slice().sort((a, b) => b.er - a.er);
    const byDps = byTypeList[t].slice().sort((a, b) => b.dps - a.dps);
    erRankOf[t] = {}; dpsRankOf[t] = {};
    byEr.forEach((x, i) => { erRankOf[t][x.id] = i + 1; });
    byDps.forEach((x, i) => { dpsRankOf[t][x.id] = i + 1; });
  }

  // 3. defBulkRank global
  const bulkSorted = Object.keys(calc).sort((a, b) => calc[b].defBulk - calc[a].defBulk);
  const defBulkRankOf = {};
  bulkSorted.forEach((id, i) => { defBulkRankOf[id] = i + 1; });

  // 4. monta entradas + roles
  const out = {};
  for (const id in calc) {
    const c = calc[id];
    const defBulkRank = defBulkRankOf[id];
    const byType = {};
    let bestErRank = Infinity, bestDpsCoverType = null, bestDpsCoverRank = Infinity;
    for (const t in c.byType) {
      const er = erRankOf[t][id], dr = dpsRankOf[t][id];
      byType[t] = { dps: c.byType[t].dps, tdo: c.byType[t].tdo, er: c.byType[t].er,
                    dpsRank: dr, erRank: er, moveset: c.byType[t].moveset };
      if (er < bestErRank) bestErRank = er;
      if (dr <= GATK && (OFFENSIVE_COVERAGE[t] || 0) >= GCOV && dr < bestDpsCoverRank) {
        bestDpsCoverRank = dr; bestDpsCoverType = t;
      }
    }
    const roles = [];
    if (bestErRank <= RAID) roles.push('raid');
    if (bestErRank <= PVET) roles.push('pve');
    if (bestDpsCoverType)   roles.push('gym_atk');

    const isAttacker = !!c.best;
    const isBulkCandidate = defBulkRank <= GDEF;
    if (!isAttacker && !isBulkCandidate) continue;   // nada a dizer sobre essa espécie

    out[id] = {
      bestMoveset: c.best ? c.best.moveset : null,
      bestType: c.best ? c.best.type : null,
      byType: byType,
      roles: roles,
      defBulkRank: defBulkRank,
    };
  }
  return out;
}
```

E acrescentar `buildPveRanks` ao `module.exports`:

```js
module.exports = { buildSpecies, buildMoves, buildMovesPve, buildMovesPt, buildPvpRanks, buildPveRanks, LEAGUES, expandCpm };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/build/transform.js pokemon/test/transform.test.js
git commit -m "fase2: buildPveRanks (ranking por tipo + roles + defBulkRank)"
```

---

### Task 9: `refresh-meta.js` — merge `pve` em moves + emite `pve_ranks.json` + gerar de verdade

Estende o orquestrador para anexar o bloco PvE aos golpes, gerar os rankings PvE e gravar, com validação que falha alto.

**Files:**
- Modify: `pokemon/build/refresh-meta.js`
- Regenera (gerado): `pokemon/data/species.json`, `pokemon/data/moves.json`, `pokemon/data/pve_ranks.json`, `pokemon/data/meta.json`

- [ ] **Step 1: Adicionar extração + emissão em `refresh-meta.js`**

1a. Em `main()`, na seção "Transformando…", após `const moves = T.buildMoves(gm);`, anexar o bloco PvE e montar `pve_ranks`:

```js
  const movesPveRes = T.buildMovesPve(gameMaster);
  for (const id in movesPveRes.map) if (moves[id]) moves[id].pve = movesPveRes.map[id];
  const pveCoverage = Object.keys(moves).length
    ? Object.keys(moves).filter(id => moves[id].pve).length / Object.keys(moves).length : 0;
  const pveRanks = T.buildPveRanks(species, moves);
```

1b. Adicionar validação (após o bloco de validação do `cpm`):

```js
  if (pveCoverage < 0.8)
    throw new Error('validação: cobertura PvE ' + (pveCoverage * 100).toFixed(1) + '% < 80% — schema mudou?');
  assertNonEmpty('pveRanks', pveRanks);
  if (!pveRanks.blissey || !(pveRanks.blissey.defBulkRank <= 5))
    throw new Error('validação: Blissey deveria estar entre os mais bulky — defBulkRank suspeito');
```

1c. Gravar — após `write('cpm.json', cpm);`:

```js
  write('pve_ranks.json', pveRanks);
```

(`species.json` e `moves.json` já são gravados pelos `write(...)` existentes — agora saem enriquecidos.)

1d. Incluir contagens em `meta.json`. No objeto `counts: {...}`, acrescentar:

```js
      pveRanked: Object.keys(pveRanks).length,
```

e, junto de `ptCoverage`, adicionar:

```js
    pveCoverage: Number(pveCoverage.toFixed(3)),
```

- [ ] **Step 2: Rodar de verdade e regenerar os datasets**

Run: `cd pokemon && npm run build`
Expected: "Baixando…", "Transformando…", grava os 7 arquivos (inclui `pve_ranks.json`; `species.json`/`moves.json` regenerados), "OK." sem erro.

- [ ] **Step 3: Conferir os datasets gerados**

Run:
```bash
cd pokemon && node -e "
const m=require('./data/moves.json'); const p=require('./data/pve_ranks.json');
console.log('ROCK_SMASH pve:', JSON.stringify(m.ROCK_SMASH.pve));
console.log('moves c/ pve:', Object.values(m).filter(x=>x.pve).length, '/', Object.keys(m).length);
console.log('pve_ranks espécies:', Object.keys(p).length);
console.log('blissey defBulkRank:', p.blissey.defBulkRank, '| roles:', JSON.stringify(p.blissey.roles));
console.log('mamoswine ice:', p.mamoswine && JSON.stringify(p.mamoswine.byType.ice));
"
```
Expected: `ROCK_SMASH pve: {\"power\":17,\"energy\":12,\"durationMs\":1500}`; cobertura PvE > 80%; centenas de espécies em `pve_ranks`; `blissey defBulkRank` pequeno (≤5); `mamoswine` tem `byType.ice` com `erRank`/`dpsRank` numéricos.

- [ ] **Step 4: Commit (script + datasets gerados)**

```bash
git add pokemon/build/refresh-meta.js pokemon/data/moves.json pokemon/data/species.json pokemon/data/pve_ranks.json pokemon/data/meta.json
git commit -m "fase2: refresh-meta anexa pve aos golpes e emite pve_ranks.json"
```

---

### Task 10: `pve.js` — `defBulk` + `evalMon` + `pveTags` (runtime) (TDD)

`evalMon` lê `pve_ranks` (roles de espécie) e calcula `gymDef` do **IV individual** (espécie bulk-candidata + Def/HP altos). `pveTags` deriva as tags.

**Files:**
- Modify: `pokemon/lib/meta/pve.js`
- Test: `pokemon/test/pve.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pve.test.js`)

```js
const { defBulk, evalMon, pveTags } = require('../lib/meta/pve.js');

test('defBulk: (baseDef+ivDef)·(baseHP+ivSta)', () => {
  assert.strictEqual(defBulk({ atk: 1, def: 100, hp: 200 }, { atk: 0, def: 15, sta: 15 }), 115 * 215);
});

function metaPve() {
  return {
    speciesIndex: { byId: {
      raider: { baseStats: { atk: 250, def: 120, hp: 150 } },
      wall:   { baseStats: { atk: 60,  def: 250, hp: 450 } },
    } },
    pveRanks: {
      raider: { bestMoveset: ['ICE_SHARD','AVALANCHE'], bestType: 'ice', roles: ['raid','pve','gym_atk'],
                byType: { ice: { dps: 18, er: 50, dpsRank: 2, erRank: 3, moveset: ['ICE_SHARD','AVALANCHE'] } },
                defBulkRank: 300 },
      wall:   { bestMoveset: ['POUND','BODY_SLAM'], bestType: 'normal', roles: [],
                byType: {}, defBulkRank: 2 },
    },
  };
}

test('evalMon: sem speciesId ou sem pveRanks → null', () => {
  assert.strictEqual(evalMon({ speciesId: null, ivs: {}, moveIds: [] }, metaPve()), null);
  assert.strictEqual(evalMon({ speciesId: 'raider', ivs: {}, moveIds: [] }, { speciesIndex: metaPve().speciesIndex }), null);
});

test('evalMon: atacante de raid com moveset recomendado → raid/pve/gymAtk + movesetOk', () => {
  const r = evalMon({ speciesId: 'raider', ivs: { atk: 15, def: 10, sta: 10 },
                      moveIds: ['ICE_SHARD','AVALANCHE'] }, metaPve());
  assert.strictEqual(r.raid, true);
  assert.strictEqual(r.pve, true);
  assert.strictEqual(r.gymAtk, true);
  assert.strictEqual(r.gymDef, false);          // não é candidata a defensor (defBulkRank 300)
  assert.strictEqual(r.movesetOk, true);
  assert.strictEqual(r.bestType, 'ice');
});

test('evalMon: muralha bulk-candidata + IV def/HP altos → gymDef true', () => {
  const hi = evalMon({ speciesId: 'wall', ivs: { atk: 0, def: 15, sta: 14 }, moveIds: [] }, metaPve());
  assert.strictEqual(hi.gymDef, true);          // defBulkRank 2 <= 50 E def 15>=13 E sta 14>=13
  const lo = evalMon({ speciesId: 'wall', ivs: { atk: 0, def: 5, sta: 5 }, moveIds: [] }, metaPve());
  assert.strictEqual(lo.gymDef, false);         // IVs def/HP baixos
});

test('pveTags: deriva raid/pve/gym_atk/gym_def', () => {
  assert.deepStrictEqual(
    pveTags({ raid: true, pve: true, gymAtk: false, gymDef: true }).sort(),
    ['gym_def', 'pve', 'raid']);
  assert.deepStrictEqual(pveTags(null), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: FAIL — `defBulk is not a function`.

- [ ] **Step 3: Implementação** (adicionar em `pve.js`, antes do `return`)

```js
  // Bulk defensivo com o IV individual (gym_def depende do SEU Def/HP).
  function defBulk(base, ivs) {
    return (base.def + ivs.def) * (base.hp + ivs.sta);
  }

  // moveset PvE "ok" = o mon tem os dois golpes do bestMoveset recomendado.
  function pveMovesetOk(myMoveIds, recommended) {
    if (!recommended || recommended.length < 2) return false;
    var mine = myMoveIds || [];
    return recommended.every(function (id) { return mine.indexOf(id) >= 0; });
  }

  // Avalia o mon em PvE. Retorna null sem speciesId/pveRanks. gymDef usa o IV individual.
  function evalMon(e, meta) {
    if (!e || !e.speciesId || !meta || !meta.pveRanks) return null;
    var entry = meta.pveRanks[e.speciesId];
    var byId = meta.speciesIndex && meta.speciesIndex.byId;
    var sp = byId && byId[e.speciesId];
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
      movesetOk: pveMovesetOk(e.moveIds, entry.bestMoveset),
    };
  }

  // Tags a partir do objeto pveMeta.
  function pveTags(pveMeta) {
    if (!pveMeta) return [];
    var tags = [];
    if (pveMeta.raid)   tags.push('raid');
    if (pveMeta.pve)    tags.push('pve');
    if (pveMeta.gymAtk) tags.push('gym_atk');
    if (pveMeta.gymDef) tags.push('gym_def');
    return tags;
  }
```

E acrescentar `defBulk, evalMon, pveTags` ao `return`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pve.js pokemon/test/pve.test.js
git commit -m "fase2: pve.js defBulk + evalMon + pveTags (runtime)"
```

---

### Task 11: Integrar PvE em `analysis.js` — `e.pveMeta`, tags, counts, proteção (TDD, não-regressão)

`analyze()` passa a calcular `e.pveMeta`, somar tags PvE e tratar meta-PvE como proteção. Sem `meta.pveRanks`, comportamento idêntico à Fase 1.

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/enrich.test.js`, `pokemon/test/counts.test.js`

- [ ] **Step 1: Adicionar os testes que falham**

1a. Append em `pokemon/test/enrich.test.js`:

```js
const pveRanksJson = require('../data/pve_ranks.json');

function fullMetaPve() {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  return { speciesIndex: buildSpeciesIndex(speciesJson), movesPt: {},
           pvpRanks: pvpRanksJson, cpm: realCpm, pveRanks: pveRanksJson };
}

// Acha, no dataset gerado, o dex de uma ESPÉCIE-BASE (sem sufixo de forma) com um dado role.
// matchSpecies casa por dex e prefere a forma base → garantimos que o mon construído cai nessa espécie.
function baseDexWithRole(role) {
  for (const id in pveRanksJson) {
    if (id.indexOf('_') >= 0) continue;                       // pula shadow/mega/regionais
    if ((pveRanksJson[id].roles || []).includes(role) && speciesJson[id]) return speciesJson[id].dex;
  }
  return null;
}

test('analyze com meta PvE: um atacante de raid real ganha e.pveMeta e tag raid', () => {
  const dex = baseDexWithRole('raid');
  assert.ok(dex, 'existe ao menos um atacante de raid (base) no dataset');
  const fd = { z: { mon_name:'X', mon_number:dex, mon_cp:3000, mon_attack:15, mon_defence:15, mon_stamina:15,
                    mon_height:1, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, fullMetaPve())[0];
  assert.ok(e.pveMeta, 'e.pveMeta presente');
  assert.ok(e.tags.includes('raid'), 'tem tag raid');
});

test('analyze com meta: defensor bulky protege duplicata de IV baixo (proteção gym_def)', () => {
  // Blissey (#242) tem defBulkRank ~2 (sempre entre os mais bulky). A duplicata tem IV 58%
  // (atk 0, def 13, sta 13) — normalmente TRANSFERIR, mas def/HP >=13 + espécie bulky → gym_def → protegida.
  const fd = {
    best: { mon_name:'Blissey', mon_number:242, mon_cp:3000, mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:1.5, mon_isShiny:'NO', mon_isLucky:'NO' },
    dupe: { mon_name:'Blissey', mon_number:242, mon_cp:2000, mon_attack:0,  mon_defence:13, mon_stamina:13, mon_height:1.5, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, fullMetaPve());
  const dupe = list.find(e => e.cp === 2000);
  assert.ok(dupe.pveMeta && dupe.pveMeta.gymDef, 'duplicata é gym_def');
  assert.notStrictEqual(dupe.verdict, 'TRANSFERIR');   // protegida pela meta PvE
});

test('analyze SEM meta: e.pveMeta null, sem tags PvE (não-regressão)', () => {
  const fd = { z: { mon_name:'Blissey', mon_number:242, mon_cp:3000, mon_attack:15, mon_defence:15, mon_stamina:15,
                    mon_height:1.5, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar)[0];
  assert.strictEqual(e.pveMeta, null);
  assert.ok(!e.tags.some(t => ['raid','pve','gym_atk','gym_def'].includes(t)));
});
```

> **Nota:** os testes são **auto-localizáveis** — não dependem de qual espécie específica é "raid" (isso pode mudar ao afinar constantes na Fase 4). Blissey é #242; seu bulk é intrinsecamente o maior entre obteníveis, então `gym_def` é estável.

1b. Append em `pokemon/test/counts.test.js`:

```js
const pveRanksJson = require('../data/pve_ranks.json');

test('contagens incluem raid/pve/gymAtk/gymDef', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  const meta = { speciesIndex: buildSpeciesIndex(speciesJson), movesPt: {}, pvpRanks: pvpRanksJson, cpm: realCpm, pveRanks: pveRanksJson };
  // localiza um atacante de raid base no dataset (mesma estratégia do enrich.test)
  let dex = null;
  for (const id in pveRanksJson) {
    if (id.indexOf('_') < 0 && (pveRanksJson[id].roles || []).includes('raid') && speciesJson[id]) { dex = speciesJson[id].dex; break; }
  }
  assert.ok(dex, 'existe atacante de raid base');
  const fd = { z: { mon_name:'X', mon_number:dex, mon_cp:3000, mon_attack:15, mon_defence:15, mon_stamina:15,
                    mon_height:1, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const c = computeCounts(analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta));
  assert.ok('raid' in c && 'pve' in c && 'gymAtk' in c && 'gymDef' in c);
  assert.strictEqual(c.raid, 1);
});

test('contagens sem meta: raid/pve/gymAtk/gymDef ficam 0 (não-regressão)', () => {
  const c = computeCounts(analyze(fd, getPokemonSize, refdata)); // fd do topo do arquivo
  assert.strictEqual(c.raid, 0);
  assert.strictEqual(c.pve, 0);
  assert.strictEqual(c.gymAtk, 0);
  assert.strictEqual(c.gymDef, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/enrich.test.js test/counts.test.js`
Expected: FAIL — `e.pveMeta` indefinido / `c.raid` indefinido.

- [ ] **Step 3: Implementação** — editar `pokemon/lib/analysis.js`

3a. Importar `pve.js` junto do import de `pvp.js` (após o bloco `PokePvp`):

```js
  var PokePve = (typeof require === 'function')
    ? require('./meta/pve.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokePve : null);
```

3b. Inicializar `pveMeta: null` em `enrichOne`, junto de `pvpMeta: null` (após `pvpMeta: null,`):

```js
      pveMeta: null,
```

3c. Adicionar helper `isPveMeta` (logo após `isPvpMeta`):

```js
  function isPveMeta(e) {
    return !!(e.pveMeta && (e.pveMeta.raid || e.pveMeta.pve || e.pveMeta.gymAtk || e.pveMeta.gymDef));
  }
```

3d. Incluir PvE em `isProtected`. Trocar a linha `|| isPvpMeta(e);` por:

```js
        || isPvpMeta(e) || isPveMeta(e);
```

3e. Estender `computeTags` para somar as tags PvE. Adicionar, antes do `return tags;`:

```js
    if (e.pveMeta && PokePve) for (const t of PokePve.pveTags(e.pveMeta)) tags.push(t);
```

3f. Em `analyze`, calcular `e.pveMeta` junto de `e.pvpMeta` (antes de tags/ação). Trocar a 1ª linha do laço por:

```js
      e.pvpMeta = (meta && meta.cpm && meta.pvpRanks && PokePvp) ? PokePvp.evalMon(e, meta) : null;
      e.pveMeta = (meta && meta.pveRanks && PokePve) ? PokePve.evalMon(e, meta) : null;
```

3g. Estender `computeCounts`. No objeto `c` inicial, adicionar os quatro contadores (após `pvpMaster:0`):

```js
                raid:0, pve:0, gymAtk:0, gymDef:0,
```

e dentro do laço, após as contagens `pvp_*`:

```js
      if (e.tags.includes('raid'))    c.raid++;
      if (e.tags.includes('pve'))     c.pve++;
      if (e.tags.includes('gym_atk')) c.gymAtk++;
      if (e.tags.includes('gym_def')) c.gymDef++;
```

3h. Exportar `isPveMeta` no `return` do factory (acrescentar à lista existente, junto de `isPvpMeta`).

- [ ] **Step 4: Rodar a suíte inteira (não-regressão)**

Run: `cd pokemon && node --test`
Expected: PASS — todos os testes existentes continuam verdes (Fase 0/1 inclusos), mais os novos.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/enrich.test.js pokemon/test/counts.test.js
git commit -m "fase2: integra PvE no analyze (e.pveMeta, tags, counts, protecao)"
```

---

### Task 12: `computeAction` — Fortalecer/Ensinar-TM para atacantes de Raid (TDD)

Estende a ação (spec §9: Fortalecer cobre "meta-relevante PvP **ou PvE**"). Se o mon não tem ação de PvP mas é atacante de **raid** ou **gym_atk**, vira **Fortalecer** (se `movesetOk`) ou **Ensinar/TM**. Veredito = INVESTIR.

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pokemon/test/verdict.test.js`)

```js
function pveRaider(over) {
  return Object.assign({
    ivPct: 80, tags: ['raid','pve'], pvpMeta: null,
    pveMeta: { raid: true, pve: true, gymAtk: false, gymDef: false, bestType: 'ice',
               bestMoveset: ['ICE_SHARD','AVALANCHE'], byType: { ice: { dps: 18, er: 50, dpsRank: 2, erRank: 3 } },
               movesetOk: true },
  }, over || {});
}

test('computeAction: atacante de raid + moveset ok → FORTALECER (PvE)', () => {
  const a = computeAction(pveRaider());
  assert.strictEqual(a.kind, 'FORTALECER');
  assert.strictEqual(a.role, 'raid');
  assert.match(a.reason, /Fortalecer/);
  assert.match(a.reason, /raid|Raid|Gelo|ice/i);
});

test('computeAction: atacante de raid + moveset ruim → ENSINAR_TM (PvE)', () => {
  const a = computeAction(pveRaider({ pveMeta: Object.assign(pveRaider().pveMeta, { movesetOk: false }) }));
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /Ensinar|TM/);
});

test('computeAction: PvP tem prioridade sobre PvE', () => {
  const e = pveRaider({ tags: ['pvp_great','raid'],
    pvpMeta: { great:{isMeta:true,speciesRank:5,ivRank:1,spPct:1,movesetOk:true},
               ultra:{isMeta:false}, master:{isMeta:false} } });
  const a = computeAction(e);
  assert.strictEqual(a.league, 'great');   // ramo PvP vence
});

test('computeAction: só pve/gym_def (sem raid/gym_atk) → null (não força INVESTIR)', () => {
  assert.strictEqual(computeAction({ ivPct: 50, tags: ['pve'], pvpMeta: null,
    pveMeta: { raid: false, pve: true, gymAtk: false, gymDef: false, movesetOk: false } }), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/verdict.test.js`
Expected: FAIL — ação PvE não existe (retorna null onde se espera FORTALECER).

- [ ] **Step 3: Implementação** — editar `pokemon/lib/analysis.js`

3a. Adicionar nomes de tipo em PT e um helper de ação PvE (perto de `computeAction`):

```js
  const TYPE_PT = { normal:'Normal', fire:'Fogo', water:'Água', electric:'Elétrico', grass:'Planta',
    ice:'Gelo', fighting:'Lutador', poison:'Venenoso', ground:'Terrestre', flying:'Voador',
    psychic:'Psíquico', bug:'Inseto', rock:'Pedra', ghost:'Fantasma', dragon:'Dragão',
    dark:'Sombrio', steel:'Aço', fairy:'Fada' };

  // Ação a partir do papel de atacante PvE (raid > gym_atk). null se o mon não é atacante.
  function _pveAction(e) {
    if (!e.pveMeta) return null;
    const role = e.pveMeta.raid ? 'raid' : (e.pveMeta.gymAtk ? 'gym_atk' : null);
    if (!role) return null;
    const tipo = TYPE_PT[e.pveMeta.bestType] || e.pveMeta.bestType || 'ataque';
    const papel = role === 'raid' ? 'Raid' : 'Ataque de Ginásio';
    if (e.pveMeta.movesetOk) {
      return { kind: 'FORTALECER', role: role,
        reason: 'Fortalecer p/ ' + papel + ' (' + tipo + ') — atacante recomendado (estimativa)' };
    }
    return { kind: 'ENSINAR_TM', role: role,
      reason: 'Ensinar/TM p/ ' + papel + ' (' + tipo + ') — falta o moveset de ataque recomendado' };
  }
```

3b. No fim de `computeAction`, antes do `return ...` final do ramo PvP, garantir o fallback PvE. Trocar a primeira linha de `computeAction` (`const lg = _bestPvpLeague(e);`) e o `if (!lg ...)` por:

```js
  function computeAction(e) {
    const lg = _bestPvpLeague(e);
    if (!lg || !e.pvpMeta) return _pveAction(e);   // sem ação PvP → tenta PvE
```

(o resto de `computeAction` — o cálculo de `L`/`ivInfo` e os returns FORTALECER/ENSINAR_TM de PvP — permanece igual.)

> **Ordem (spec §9):** PvP tem prioridade; só quando não há gancho de PvP a ação de PvE entra. `computeVerdict` já promove `FORTALECER`/`ENSINAR_TM` a INVESTIR (Fase 1) — vale para os dois.

- [ ] **Step 4: Rodar a suíte inteira (não-regressão)**

Run: `cd pokemon && node --test`
Expected: PASS — tudo verde. Sem `meta`, `e.pveMeta` é null → `_pveAction` retorna null → veredito idêntico.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "fase2: computeAction estende Fortalecer/Ensinar-TM p/ atacantes de raid"
```

---

### Task 13: `render.js` — selos 🔥/🛡️ + bloco "Competitivo" PvE (TDD)

**Files:**
- Modify: `pokemon/lib/render.js`, `pokemon/index.html`
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pokemon/test/render.test.js`; reusa o `pvpStub` existente, estendido com PvE)

```js
function pveStub(over) {
  return Object.assign({
    id: 'q', name: 'Mamoswine', verdict: 'INVESTIR', reason: 'x', ivPct: 90, cp: 3000,
    size: null, isHundo:false, isShiny:false, isShadow:false, isPurified:false, isLucky:false,
    isLegendary:false, isCostume:false, isXSComfort:false, isXLComfort:false, hasSecondCharge:false,
    tradeBoost:null, action:null, pvp:null, pvpMeta:null,
    moves:['Lança-Gelo','Avalanche'], ivs:{atk:15,def:15,sta:15}, height:2.5, weight:291,
    tags: ['raid','pve'],
    pveMeta: { raid:true, pve:true, gymAtk:false, gymDef:false, bestType:'ice',
               bestMoveset:['ICE_SHARD','AVALANCHE'], movesetOk:true,
               byType:{ ice:{ dps:18.2, er:50.1, dpsRank:5, erRank:7 } } },
  }, over || {});
}

test('badgesHtml: selo 🔥 com tag raid', () => {
  assert.match(badgesHtml(pveStub()), /🔥/);
});

test('badgesHtml: selo 🛡️ com tag gym_def', () => {
  assert.match(badgesHtml(pveStub({ tags:['gym_def'], pveMeta: Object.assign(pveStub().pveMeta, {raid:false,pve:false,gymDef:true}) })), /🛡️/);
});

test('detailHtml: bloco Competitivo mostra PvE (tipo + rank + estimativa)', () => {
  const html = detailHtml(pveStub());
  assert.match(html, /Competitivo/);
  assert.match(html, /Gelo|Raid/);
  assert.match(html, /estimativa/);
  assert.match(html, /rank 7|#7/);
});

test('detailHtml: sem pvpMeta nem pveMeta → sem bloco Competitivo (não-regressão)', () => {
  const html = detailHtml(pveStub({ tags:[], pveMeta:null, pvpMeta:null }));
  assert.doesNotMatch(html, /Competitivo/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/render.test.js`
Expected: FAIL — selos 🔥/🛡️ ou "estimativa" ausentes.

- [ ] **Step 3: Implementação** — editar `pokemon/lib/render.js`

3a. Em `badgesHtml`, após os selos `pvp_*`, adicionar os de PvE:

```js
    if (e.tags.includes('raid'))    b.push('<span class="badge b-pve">🔥</span>');
    else if (e.tags.includes('pve')) b.push('<span class="badge b-pve">🔥</span>');
    if (e.tags.includes('gym_def')) b.push('<span class="badge b-gymdef">🛡️</span>');
```

3b. Substituir a função `competitiveHtml` inteira (Fase 1) por esta — guarda PvP **e** PvE, blinda o laço PvP contra `pvpMeta` null e acrescenta a linha de PvE antes da checagem de `rows.length`:

```js
  const TYPE_PT_PVE = { normal:'Normal', fire:'Fogo', water:'Água', electric:'Elétrico', grass:'Planta',
    ice:'Gelo', fighting:'Lutador', poison:'Venenoso', ground:'Terrestre', flying:'Voador',
    psychic:'Psíquico', bug:'Inseto', rock:'Pedra', ghost:'Fantasma', dragon:'Dragão',
    dark:'Sombrio', steel:'Aço', fairy:'Fada' };

  function competitiveHtml(e) {
    if (!e.pvpMeta && !e.pveMeta) return '';
    const rows = [];
    if (e.pvpMeta) {
      ['great', 'ultra', 'master'].forEach(function (lg) {
        const L = e.pvpMeta[lg];
        if (!L || !L.isMeta) return;
        const sp = Math.round(L.spPct * 100);
        const mv = L.movesetOk ? 'moveset recomendado ✓' : 'falta o moveset recomendado';
        rows.push('<div class="comp-row"><strong>' + LEAGUE_LABEL[lg] + '</strong> — rank ' +
                  L.speciesRank + ' da espécie · seu IV PvP ' + sp + '% (rank ' + L.ivRank +
                  '/4096) · ' + mv + '</div>');
      });
    }
    if (e.pveMeta) {
      const pm = e.pveMeta;
      const t = pm.bestType;
      const bt = (t && pm.byType && pm.byType[t]) || null;
      const papeis = [];
      if (pm.raid) papeis.push('Raid');
      if (pm.pve) papeis.push('PvE');
      if (pm.gymAtk) papeis.push('Atq. Ginásio');
      if (pm.gymDef) papeis.push('Def. Ginásio');
      if (papeis.length) {
        const tipoPt = TYPE_PT_PVE[t] || t || '';
        const rankTxt = bt ? (' — melhor como ' + tipoPt + ' (rank ' + bt.erRank + ' do tipo, DPS rank ' + bt.dpsRank + ')') : '';
        const mv = pm.movesetOk ? ' · moveset de ataque ✓' : (pm.bestMoveset ? ' · falta moveset de ataque' : '');
        rows.push('<div class="comp-row"><strong>PvE</strong>: ' + papeis.join(' · ') + rankTxt + mv +
                  ' <span class="comp-est">(estimativa)</span></div>');
      }
    }
    if (!rows.length) return '';
    return '<div class="pk-competitive"><h4>Competitivo</h4>' + rows.join('') + '</div>';
  }
```

> `competitiveHtml` já é chamada por `detailHtml` (Fase 1); a assinatura não muda. O bloco PvP é o mesmo da Fase 1, só envolvido por `if (e.pvpMeta)`.

3c. Adicionar CSS em `pokemon/index.html` (dentro do `<style>`, perto de `.b-pvp`/`.pk-competitive`):

```css
.b-pve { background:rgba(239,108,0,.2); color:#ff9d4d; }
.b-gymdef { background:rgba(56,142,60,.2); color:#7bd389; }
.comp-est { font-size:10px; color:var(--muted); font-weight:400; }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/render.js pokemon/index.html pokemon/test/render.test.js
git commit -m "fase2: render selos 🔥/🛡️ + bloco Competitivo PvE"
```

---

### Task 14: `app.js` + `index.html` + `sw.js` — chips 🔥/🛡️, carregar pve_ranks, cache

**Files:**
- Modify: `pokemon/app.js`, `pokemon/index.html`, `pokemon/sw.js`

- [ ] **Step 1: `loadMeta` carrega `pve_ranks`** — em `pokemon/app.js`, trocar a função `loadMeta` por:

```js
  async function loadMeta() {
    try {
      const [species, movesPt, pvpRanks, cpm, pveRanks] = await Promise.all([
        fetch('./data/species.json').then(r => r.ok ? r.json() : null),
        fetch('./data/moves_pt.json').then(r => r.ok ? r.json() : null),
        fetch('./data/pvp_ranks.json').then(r => r.ok ? r.json() : null),
        fetch('./data/cpm.json').then(r => r.ok ? r.json() : null),
        fetch('./data/pve_ranks.json').then(r => r.ok ? r.json() : null),
      ]);
      if (!species || !movesPt) return null;
      return { speciesIndex: buildSpeciesIndex(species), movesPt,
               pvpRanks: pvpRanks || null, cpm: cpm || null, pveRanks: pveRanks || null };
    } catch (e) { console.warn('meta indisponível:', e); return null; }
  }
```

- [ ] **Step 2: Adicionar os chips 🔥/🛡️** — em `pokemon/app.js`, na `renderChips`, após as linhas `pvp_*` do array `defs`:

```js
      ['raid',    '🔥 Raid ' + c.raid,           e => e.tags.includes('raid')],
      ['gym_def', '🛡️ Def. Ginásio ' + c.gymDef, e => e.tags.includes('gym_def')],
```

- [ ] **Step 3: Incluir `pve.js` no `index.html`** — adicionar a tag **ANTES** de `lib/analysis.js` (crítico: `analysis.js` captura `globalThis.PokePve` ao executar). Após a linha `<script src="./lib/meta/pvp.js"></script>`:

```html
<script src="./lib/meta/pve.js"></script>
```

Ordem final: `sizes.js`, `lib/refdata.js`, `lib/meta/match.js`, `lib/meta/pvp.js`, `lib/meta/pve.js`, `lib/analysis.js`, `lib/render.js`, `lib/sort.js`, `app.js`.

- [ ] **Step 4: Service worker** — em `pokemon/sw.js`:

4a. Trocar `const CACHE = 'pokemon-leo-v9';` por `const CACHE = 'pokemon-leo-v10';`.

4b. No array `ASSETS`, adicionar `./lib/meta/pve.js` (após `./lib/meta/pvp.js`) e `./data/pve_ranks.json` (após `./data/cpm.json`). Resultado:

```js
const ASSETS = [
  './index.html', './app.js', './sizes.js',
  './lib/refdata.js', './lib/analysis.js', './lib/render.js', './lib/sort.js', './lib/meta/match.js', './lib/meta/pvp.js', './lib/meta/pve.js',
  './colecao.json', './manifest.json',
  './data/species.json', './data/moves.json', './data/moves_pt.json',
  './data/pvp_ranks.json', './data/cpm.json', './data/pve_ranks.json', './data/meta.json',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];
```

> O handler já trata `/data/` como network-first (Fase 0). Nada mais a mudar lá.

- [ ] **Step 5: Verificação manual no navegador**

Run: `cd pokemon && python -m http.server 8000` e abrir `http://localhost:8000`.
Expected:
- Página carrega sem regressão; aparecem chips `🔥 Raid` e `🛡️ Def. Ginásio` com contagem.
- No console: `window.__pokeApp.getMons().filter(m => m.tags.includes('raid')).length` ≥ 0 (depende da coleção).
- Clicar num atacante mostra o bloco "Competitivo" com a linha **PvE** (tipo + rank + "(estimativa)") e a linha de ação 🔥 quando aplicável.
- DevTools → Application → Cache Storage: `pokemon-leo-v10` contém `lib/meta/pve.js` e `data/pve_ranks.json`.

- [ ] **Step 6: Commit**

```bash
git add pokemon/app.js pokemon/index.html pokemon/sw.js
git commit -m "fase2: app chips 🔥/🛡️, carrega pve_ranks, sw v10 + pve.js/pve_ranks.json"
```

---

### Task 15: Verificação final da Fase 2

- [ ] **Step 1: Suíte completa verde**

Run: `cd pokemon && node --test`
Expected: PASS em todos os arquivos (`counts`, `grouping`, `refdata`, `enrich`, `render`, `verdict`, `transform`, `match`, `pvp`, `pve`, `tradeboost`, `sort`).

- [ ] **Step 2: Conferir os critérios de sucesso (spec §12)**

Checklist manual:
- `pokemon/data/pve_ranks.json` existe, gerado pelo script (não à mão); `moves.json` tem bloco `pve`; `species.json` tem `fastMoves`/`chargedMoves`.
- Nenhum mon meta-PvE (raid/pve/gym_atk/gym_def) cai em TRANSFERIR (testes de proteção verdes).
- Atacantes mostram tipo/rank/justificativa com rótulo "estimativa" (bloco Competitivo + linha de ação).
- Sem `meta.pveRanks`, tudo degrada para o comportamento da Fase 1 (testes de não-regressão verdes).
- Funciona offline: o SW v10 cacheia `pve.js` e `pve_ranks.json`.
- `meta.json` reporta `pveCoverage` e `counts.pveRanked`.

- [ ] **Step 3: Commit final (se algo pendente) e fim da Fase 2**

```bash
git add -A && git commit -m "fase2: verificação final" --allow-empty
```

---

## Self-review (cobertura do spec §8–§11)

| Requisito do spec | Onde no plano |
|---|---|
| §8 DPS/TDO/ER do Game Master, L40 neutro | Tasks 4–7 (`pve.js`), Task 8 (`buildPveRanks`) |
| §8 ranking por tipo de ataque | Task 8 (`byType` + erRank/dpsRank) |
| §8 tag `raid` (Top 10 ER) | Task 8 (role `raid`), Task 10/11 (tag) |
| §8 tag `pve` (Top N, mais larga) | Task 8 (role `pve`, `PVE_TOP=35`) |
| §8 tag `gym_atk` (DPS + tipagem versátil) | Task 8 (`OFFENSIVE_COVERAGE` + role) |
| §8 tag `gym_def` (bulk do IV individual) | Task 10 (`defBulk` + `evalMon` runtime) |
| §8 "estimativa", não simulação | Task 13 (rótulo "(estimativa)"), constantes documentadas |
| §9 Fortalecer/Ensinar-TM cobre PvE | Task 12 (`_pveAction`) |
| §9 meta-relevância protege (não transfere) | Task 11 (`isPveMeta` em `isProtected`) |
| §10 chips 🔥 Raid / 🛡️ Def. Ginásio | Task 14 |
| §10 selos no card | Task 13 (🔥/🛡️) |
| §10 bloco "Competitivo" no detalhe | Task 13 (linha PvE) |
| §11 commitável/testável/não-regressivo | todas as tasks (TDD + suíte verde) |
| `rocket` (tag) e ordenação por rank | **fora da Fase 2** (Fase 3 e Fase 4) |

## Notas para as próximas fases (fora deste plano)

- **Fase 3 (Rocket + eventos):** tag `rocket` (mecânica de spam — `moves.json` já tem `pvp`/`pve` de energia/duração), ações Aguardar Rocket (Frustração), Aguardar Evento (golpe legado via `eliteMoves`, já em `species.json`), Trocar/Reroll (lucky). `computeAction` ganha os ramos 3–5 do spec §9.
- **Fase 4 (Polimento):** ordenação por rank quando um chip competitivo está ativo (estender `lib/sort.js`); afinar constantes (`PVE`, `RAID_TOP`, `PVE_TOP`, `GYM_*`); bônus de Sombrio (×1.2 ataque) no DPS; filtrar formas não-obtíveis (`released` do PvPoke) do ranking; relatório de cobertura PvE.
