# Camada de Meta Competitivo — Fase 1 (PvP por liga) — Plano de Implementação

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa-a-tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

**Goal:** Adicionar o motor de PvP por liga: um módulo `lib/meta/pvp.js` que calcula o rank de IV de cada cópia (Grande 1500 / Ultra 2500 / Mestre sem-cap) via stat product + CPM e cruza com `pvp_ranks.json` para responder "a espécie é meta?" e "essa cópia presta?". Disso saem as tags `pvp_great`/`pvp_ultra`/`pvp_master`, as ações **Fortalecer** e **Ensinar/TM**, os chips ⚔️ na lista e o bloco "Competitivo" no detalhe — sem regredir a triagem atual.

**Architecture:** Build-time estende o pipeline da Fase 0 para emitir `pokemon/data/cpm.json` (os CPMs vêm do PokeMiners GAME_MASTER, já baixado — o gamemaster do PvPoke **não** tem CPMs). Runtime ganha `lib/meta/pvp.js` (UMD, igual a `match.js`): funções puras de CP/stat-product, um "rank checker" memoizado por `(speciesId, liga)` e um avaliador por mon. `analysis.js` chama o avaliador dentro de `analyze()`, anexando `e.pvpMeta`, tags `pvp_*` e uma `e.action`. Meta-relevância vira mais uma forma de "protegido" (mon competitivo nunca é transferido). Sem `meta`, tudo degrada para o comportamento atual — não-regressão byte-a-byte no caminho sem dados.

**Tech Stack:** Node 18+ (global `fetch`, `node --test`), JavaScript (CommonJS no build, UMD no runtime), GitHub Actions (workflow da Fase 0 já regenera os dados).

**Referência:** `docs/superpowers/specs/2026-06-07-pokemon-meta-competitivo-design.md` (§7 "Motor de PvP por liga", §9 ações, §10 UI, §11 Fase 1). Estruturas de fonte confirmadas em `pokemon/build/SOURCES.md`.

---

## Fontes externas (já baixadas pela Fase 0 — nenhuma URL nova)

| Fonte | URL | Uso nesta fase |
|---|---|---|
| PokeMiners Game Master | `https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json` | **CPMs** (`PLAYER_LEVEL_SETTINGS.playerLevel.cpMultiplier`) → `data/cpm.json` |
| PvPoke gamemaster | (Fase 0) | `species.json` (baseStats — já gerado) |
| PvPoke rankings 1500/2500/10000 | (Fase 0) | `pvp_ranks.json` (rank + moveset por liga — já gerado) |

**GOTCHA confirmado na sondagem (ver Task 1):** o gamemaster do PvPoke NÃO tem `cpMultipliers`. Os CPMs vêm do GAME_MASTER do PokeMiners, em `PLAYER_LEVEL_SETTINGS.playerLevel.cpMultiplier` — um array de **80 floats**. Mapeamento decodificado:
- **Índices 0–54** = CPM dos **níveis inteiros 1–55** (ex.: `cpMultiplier[39] = 0.7903` = nível 40; `cpMultiplier[49] = 0.8403` = nível 50; `cpMultiplier[50] = 0.8453` = nível 51 Melhor-Amigo).
- **Índices 55–79** = padding repetido (`0.8653`) — **ignorar**.
- **Meios-níveis NÃO são armazenados.** Calcula-se por `cpm(L+0.5) = sqrt((cpm(L)² + cpm(L+1)²) / 2)` (verificado: L1.5 = `0.13513743`).

## Estrutura de arquivos (Fase 1)

```
pokemon/
  build/
    transform.js        ← + expandCpm (whole-level CPMs → lista com meios-níveis)
    refresh-meta.js     ← + emite data/cpm.json (com validação)
  data/
    cpm.json            ← NOVO dataset gerado (commitado): [{level,cpm}, ...] L1..L50 em passos de 0.5
  lib/meta/
    pvp.js              ← NOVO (UMD): cpFor, statProductFor, bestLevelUnderCap,
                          rankInfo (memoizado), movesetOk, pvpTags, evalMon
  lib/
    analysis.js         ← + e.pvpMeta, tags pvp_*, e.action, isPvpMeta em isProtected, counts
    render.js           ← + selos ⚔️G/⚔️U/⚔️M, linha de ação no card, bloco "Competitivo" no detalhe
  app.js                ← loadMeta carrega pvp_ranks+cpm; chips ⚔️ Grande/Ultra/Mestre
  index.html            ← <script src="lib/meta/pvp.js"> ANTES de lib/analysis.js
  sw.js                 ← + pvp.js e cpm.json nos ASSETS; bump v8 → v9
  fixtures/
    mini-cpm-whole.json ← NOVO: 11 CPMs inteiros (L1..L11) p/ testar expandCpm
  test/
    transform.test.js   ← + expandCpm
    pvp.test.js         ← NOVO: cpFor, statProductFor, bestLevelUnderCap, rankInfo,
                          movesetOk, pvpTags, evalMon
    enrich.test.js      ← + e.pvpMeta/tags/action no enrich (com meta) e não-regressão (sem meta)
    counts.test.js      ← + contagens pvpGreat/pvpUltra/pvpMaster
    render.test.js      ← + selos ⚔️ e bloco Competitivo
```

## Contrato de dados (build ↔ runtime)

```jsonc
// data/cpm.json — array ascendente por nível, níveis 1.0 .. 50.0 em passos de 0.5 (99 entradas)
[ { "level": 1,   "cpm": 0.094 },
  { "level": 1.5, "cpm": 0.13513743 },
  { "level": 2,   "cpm": 0.16639787 },
  // ...
  { "level": 50,  "cpm": 0.84029999 } ]
```

```jsonc
// Saída por mon (anexada em analysis.js como e.pvpMeta). null quando não há dados de meta.
// (NÃO confundir com e.pvp, que já existe e guarda mon_pvp_stats — vitórias/derrotas do export.)
e.pvpMeta = {
  great:  { isMeta: true,  speciesRank: 13, ivRank: 1,    spPct: 1,      movesetOk: true  },
  ultra:  { isMeta: false, speciesRank: null, ivRank: 412, spPct: 0.981, movesetOk: false },
  master: { isMeta: false, speciesRank: null, ivRank: 2550, spPct: 0.93, movesetOk: false }
}
// e.tags inclui (aditivo): 'pvp_great' | 'pvp_ultra' | 'pvp_master'
// e.action = { kind: 'FORTALECER' | 'ENSINAR_TM', league: 'great'|'ultra'|'master', reason: string } | null
```

## Constantes do motor (no topo de `lib/meta/pvp.js`, configuráveis — spec §7.1/§7.2)

```js
var CP_CAPS    = { great: 1500, ultra: 2500, master: Infinity };
var LEVEL_CAP  = 50;            // teto de nível considerado (alinha com os rankings do PvPoke)
var THRESHOLDS = {
  great:  { spPct: 0.99, ivRank: 50 },   // marca pvp_great se isMeta E (spPct>=0.99 OU ivRank<=50)
  ultra:  { spPct: 0.99, ivRank: 50 },
  master: { ivPct: 98 },                  // marca pvp_master se isMeta E ivPct (IV simples)>=98
};
```

Os cortes Top N da espécie (great/ultra: Top 100; master: Top 80) já são aplicados na Fase 0 em `buildPvpRanks` (`TOP_N` em `refresh-meta.js`). Aqui `isMeta` é simplesmente "a espécie tem entrada na liga em `pvp_ranks.json`".

---

### Task 1: Sondagem dos CPMs no GAME_MASTER + registro em SOURCES.md (investigação, sem TDD)

Objetivo: confirmar ao vivo a estrutura dos CPMs e **registrar em `SOURCES.md`** antes de codar (mesma disciplina da Fase 0). O código será escrito contra a realidade confirmada.

**Files:**
- Modify: `pokemon/build/SOURCES.md`

- [ ] **Step 1: Rodar a sondagem dos CPMs**

Run (na raiz do repo):
```bash
cd "I:\Meu Drive\Site-moreno-arquitetura\pokemon" && node -e "
(async()=>{
  const u=require('./build/sources.js');
  const g=await (await fetch(u.POKEMINERS_GAME_MASTER)).json();
  const pl=g.find(t=>/PLAYER_LEVEL_SETTINGS/.test(t.templateId||''));
  const cpm=pl.data.playerLevel.cpMultiplier;
  console.log('templateId:', pl.templateId, '| len:', cpm.length);
  console.log('idx0 (L1):', cpm[0], '| idx39 (L40):', cpm[39], '| idx49 (L50):', cpm[49], '| idx50 (L51):', cpm[50]);
  console.log('tail idx55..79 (padding):', cpm.slice(55).every(v=>v===cpm[79]) ? 'todos == '+cpm[79] : 'VARIAM (revisar!)');
  console.log('L1.5 esperado sqrt:', Math.sqrt((cpm[0]**2+cpm[1]**2)/2));
})()"
```

Expected (confirmações a anotar): `len: 80`; `idx0 = 0.094`; `idx39 = 0.7903`; `idx49 = 0.8403`; `idx50 = 0.8453`; tail "todos == 0.8653"; `L1.5 esperado sqrt ≈ 0.13513743`.

> Se o `len` ou os anchors divergirem (schema mudou), ajuste `expandCpm` (Task 2) e a validação (Task 3) conforme o que aparecer — registre o real no SOURCES.md.

- [ ] **Step 2: Anexar a seção ao `pokemon/build/SOURCES.md`** (no fim do arquivo)

```markdown

---

## 5. PokeMiners — CPMs (Fase 1)

URL: a mesma do Game Master (seção 3).

Template: `PLAYER_LEVEL_SETTINGS` → `data.playerLevel.cpMultiplier` — array de **80 floats**.

### Mapeamento decodificado (índice → nível)
- Índices **0–54** = CPM dos níveis inteiros **1–55** (índice `i` = nível `i+1`).
  - `cpMultiplier[0]  = 0.094`      → L1
  - `cpMultiplier[39] = 0.7903`     → L40
  - `cpMultiplier[49] = 0.8403`     → L50
  - `cpMultiplier[50] = 0.8453`     → L51 (Melhor-Amigo)
- Índices **55–79** = padding repetido (`0.8653`). **Ignorar.**
- **Meios-níveis não são armazenados.** Fórmula do jogo:
  `cpm(L+0.5) = sqrt((cpm(L)² + cpm(L+1)²) / 2)`.
  Verificado: L1.5 = `sqrt((0.094² + 0.16639787²)/2) = 0.13513743`.

### Fórmulas (padrão Pokémon GO)
- **CP** = `max(10, floor( (atk+iv_atk) * sqrt(def+iv_def) * sqrt(sta+iv_sta) * cpm² / 10 ))`
- **Stat product** (nível N) = `((atk+iv_atk)*cpm) * ((def+iv_def)*cpm) * floor((sta+iv_sta)*cpm)`

### (e) Confirmação
| Pergunta | Resposta |
|---|---|
| PvPoke gamemaster tem CPM? | **NÃO** (confirmado na Fase 0, seção 1). Usar PokeMiners. |
| Array tem meios-níveis? | **NÃO** — só inteiros 1–55 + padding. Meios-níveis via fórmula sqrt. |
| Padding no fim? | **SIM** — índices 55–79 repetem `0.8653`. |
```

- [ ] **Step 3: Commit**

```bash
git add pokemon/build/SOURCES.md
git commit -m "fase1: sondagem e registro dos CPMs (PokeMiners GAME_MASTER)"
```

---

### Task 2: `expandCpm` em `transform.js` (TDD)

Transforma os CPMs inteiros do GAME_MASTER numa lista ascendente com meios-níveis, pronta pro runtime.

**Files:**
- Modify: `pokemon/build/transform.js`
- Create: `pokemon/fixtures/mini-cpm-whole.json`
- Test: `pokemon/test/transform.test.js`

- [ ] **Step 1: Criar o fixture** (CPMs inteiros reais L1..L11 — primeiros 11 do array)

```json
[0.094, 0.16639787, 0.21573247, 0.25572005, 0.29024988, 0.3210876, 0.34921268, 0.3752356, 0.39956728, 0.4225, 0.44310755]
```

(salvar em `pokemon/fixtures/mini-cpm-whole.json`)

- [ ] **Step 2: Adicionar o teste que falha** (append em `pokemon/test/transform.test.js`)

```js
const wholeCpm = require('../fixtures/mini-cpm-whole.json');
const { expandCpm } = require('../build/transform.js');

test('expandCpm: inteiros + meios-níveis via fórmula sqrt, ascendente até maxLevel', () => {
  const list = expandCpm(wholeCpm, 10); // níveis 1..10 em passos de 0.5 → 19 entradas
  assert.strictEqual(list.length, 19);
  assert.deepStrictEqual(list[0], { level: 1, cpm: 0.094 });
  assert.strictEqual(list[2].level, 2);
  assert.strictEqual(list[2].cpm, 0.16639787);              // L2 inteiro, valor cru
  // L1.5 = sqrt((L1² + L2²)/2) = 0.13513743...
  assert.strictEqual(list[1].level, 1.5);
  assert.ok(Math.abs(list[1].cpm - 0.13513743215803847) < 1e-12);
  assert.strictEqual(list[list.length - 1].level, 10);      // último = maxLevel
});

test('expandCpm: falha alto se o array de CPM for curto demais p/ o maxLevel', () => {
  assert.throws(() => expandCpm([0.094, 0.16639787], 10), /cpMultiplier/);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: FAIL — `expandCpm is not a function`.

- [ ] **Step 4: Implementação** (adicionar em `transform.js` antes do `module.exports`)

```js
// Expande os CPMs inteiros do GAME_MASTER (índice i = nível i+1) numa lista
// ascendente {level, cpm} com meios-níveis, do nível 1 até maxLevel (passo 0.5).
// Meio-nível usa a fórmula do jogo: cpm(L+0.5) = sqrt((cpm(L)² + cpm(L+1)²)/2).
function expandCpm(cpMultiplier, maxLevel) {
  if (!Array.isArray(cpMultiplier) || cpMultiplier.length < maxLevel)
    throw new Error('expandCpm: cpMultiplier curto demais (precisa de ' + maxLevel + ' níveis)');
  var out = [];
  for (var L = 1; L <= maxLevel; L += 0.5) {
    var cpm;
    if (Number.isInteger(L)) {
      cpm = cpMultiplier[L - 1];                 // índice 0 = nível 1
    } else {
      var lo = cpMultiplier[Math.floor(L) - 1];
      var hi = cpMultiplier[Math.floor(L)];      // próximo inteiro
      cpm = Math.sqrt((lo * lo + hi * hi) / 2);
    }
    out.push({ level: L, cpm: cpm });
  }
  return out;
}
```

E acrescentar `expandCpm` ao `module.exports`:

```js
module.exports = { buildSpecies, buildMoves, buildMovesPt, buildPvpRanks, LEAGUES, expandCpm };
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd pokemon && node --test test/transform.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add pokemon/build/transform.js pokemon/fixtures/mini-cpm-whole.json pokemon/test/transform.test.js
git commit -m "fase1: expandCpm (CPMs inteiros -> lista com meios-niveis)"
```

---

### Task 3: `refresh-meta.js` emite `data/cpm.json` + validação + gerar de verdade

Estende o orquestrador da Fase 0 para extrair os CPMs do GAME_MASTER (já baixado), expandir e gravar `data/cpm.json`, com validação que falha alto.

**Files:**
- Modify: `pokemon/build/refresh-meta.js`
- Create (gerado): `pokemon/data/cpm.json`

- [ ] **Step 1: Adicionar extração + emissão em `refresh-meta.js`**

1a. Logo após a linha `const T = require('./transform.js');`, adicionar a constante de teto de nível:

```js
const CPM_MAX_LEVEL = 50;   // alinhado com LEVEL_CAP de lib/meta/pvp.js
```

1b. Adicionar um helper que extrai e expande os CPMs do GAME_MASTER. Inserir logo após a função `assertNonEmpty`:

```js
function buildCpm(gameMaster) {
  const arr = Array.isArray(gameMaster) ? gameMaster : (gameMaster.template || gameMaster.itemTemplates);
  if (!Array.isArray(arr)) throw new Error('buildCpm: game master sem array de templates');
  const pl = arr.find(t => /PLAYER_LEVEL_SETTINGS/.test(t.templateId || ''));
  const cpMultiplier = pl && pl.data && pl.data.playerLevel && pl.data.playerLevel.cpMultiplier;
  if (!Array.isArray(cpMultiplier))
    throw new Error('buildCpm: PLAYER_LEVEL_SETTINGS.playerLevel.cpMultiplier ausente');
  return T.expandCpm(cpMultiplier, CPM_MAX_LEVEL);
}
```

1c. Dentro de `main()`, na seção "Transformando…", após `const pvpRanks = ...`, adicionar:

```js
  const cpm = buildCpm(gameMaster);
```

1d. Adicionar a validação (junto das outras), após o bloco `assertNonEmpty(...)`:

```js
  if (!Array.isArray(cpm) || cpm.length === 0) throw new Error('validação: cpm vazio — abortando');
  if (Math.abs(cpm[0].cpm - 0.094) > 1e-9)
    throw new Error('validação: cpm[0] != 0.094 (L1) — schema do GAME_MASTER mudou?');
  for (let i = 1; i < cpm.length; i++)
    if (!(cpm[i].cpm > cpm[i - 1].cpm))
      throw new Error('validação: cpm não é estritamente crescente em ' + cpm[i].level);
```

1e. Gravar o arquivo — adicionar após `write('pvp_ranks.json', pvpRanks);`:

```js
  write('cpm.json', cpm);
```

> **Nota:** `write()` loga `Object.keys(obj).length`; para um array isso imprime o `length` (ok). Os datasets de meta seguem como objetos; só `cpm.json` é array — não precisa mudar `write`.

1f. Incluir `cpmLevels` em `counts` do `meta.json`. Trocar o objeto `counts: {...}` por:

```js
    counts: {
      species: Object.keys(species).length, moves: Object.keys(moves).length,
      movesPt: Object.keys(movesPtRes.map).length, pvpRanked: Object.keys(pvpRanks).length,
      cpmLevels: cpm.length,
    },
```

- [ ] **Step 2: Rodar de verdade e gerar `cpm.json`**

Run: `cd pokemon && npm run build`
Expected: imprime "Baixando…", "Transformando…", grava os 6 arquivos (inclui `cpm.json`), "OK." sem erro.

- [ ] **Step 3: Conferir o dataset gerado**

Run:
```bash
cd pokemon && node -e "const c=require('./data/cpm.json');console.log('entradas:',c.length,'| primeiro:',JSON.stringify(c[0]),'| último:',JSON.stringify(c[c.length-1]));console.log('L50 cpm:',c.find(x=>x.level===50).cpm);"
```
Expected: `entradas: 99 | primeiro: {"level":1,"cpm":0.094} | último: {"level":50,"cpm":0.8402...}` e `L50 cpm: 0.84029999`.

- [ ] **Step 4: Commit (script + dataset gerado)**

```bash
git add pokemon/build/refresh-meta.js pokemon/data/cpm.json pokemon/data/meta.json
git commit -m "fase1: refresh-meta emite data/cpm.json (CPMs do GAME_MASTER)"
```

---

### Task 4: `pvp.js` — `cpFor` (TDD)

Cria o módulo UMD `lib/meta/pvp.js` (mesmo padrão de `match.js`) com a fórmula de CP.

**Files:**
- Create: `pokemon/lib/meta/pvp.js`
- Test: `pokemon/test/pvp.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// pokemon/test/pvp.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { cpFor } = require('../lib/meta/pvp.js');

test('cpFor: fórmula padrão de CP (piso 10)', () => {
  // base 100/100/100, IV 15/15/15, cpm 0.5:
  // floor(115 * sqrt(115) * sqrt(115) * 0.25 / 10) = floor(115*115*0.25/10) = 330
  assert.strictEqual(cpFor({ atk: 100, def: 100, hp: 100 }, { atk: 15, def: 15, sta: 15 }, 0.5), 330);
  // piso de 10
  assert.strictEqual(cpFor({ atk: 1, def: 1, hp: 1 }, { atk: 0, def: 0, sta: 0 }, 0.094), 10);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: FAIL — `Cannot find module '../lib/meta/pvp.js'`.

- [ ] **Step 3: Implementação mínima** (cria o módulo UMD)

```js
// pokemon/lib/meta/pvp.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokePvp = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var CP_CAPS    = { great: 1500, ultra: 2500, master: Infinity };
  var LEVEL_CAP  = 50;
  var THRESHOLDS = {
    great:  { spPct: 0.99, ivRank: 50 },
    ultra:  { spPct: 0.99, ivRank: 50 },
    master: { ivPct: 98 },
  };

  // CP = max(10, floor( (atk) * sqrt(def) * sqrt(sta) * cpm² / 10 ))
  function cpFor(base, ivs, cpm) {
    var a = base.atk + ivs.atk;
    var d = base.def + ivs.def;
    var s = base.hp  + ivs.sta;
    var cp = Math.floor(a * Math.sqrt(d) * Math.sqrt(s) * cpm * cpm / 10);
    return cp < 10 ? 10 : cp;
  }

  return { CP_CAPS, LEVEL_CAP, THRESHOLDS, cpFor };
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pvp.js pokemon/test/pvp.test.js
git commit -m "fase1: pvp.js cpFor (formula de CP)"
```

---

### Task 5: `statProductFor` (TDD)

**Files:**
- Modify: `pokemon/lib/meta/pvp.js`
- Test: `pokemon/test/pvp.test.js`

- [ ] **Step 1: Adicionar o teste que falha** (append em `pvp.test.js`)

```js
const { statProductFor } = require('../lib/meta/pvp.js');

test('statProductFor: Atk·Def·floor(HP) no nível', () => {
  // base 100/100/100, IV 15/15/15, cpm 0.5:
  // Atk=57.5, Def=57.5, HP=floor(57.5)=57 → 57.5*57.5*57 = 188456.25
  assert.strictEqual(statProductFor({ atk: 100, def: 100, hp: 100 }, { atk: 15, def: 15, sta: 15 }, 0.5), 188456.25);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: FAIL — `statProductFor is not a function`.

- [ ] **Step 3: Implementação** (adicionar em `pvp.js`, antes do `return`)

```js
  // Stat product no nível: HP é truncado (igual ao jogo); Atk/Def ficam contínuos.
  function statProductFor(base, ivs, cpm) {
    var atk = (base.atk + ivs.atk) * cpm;
    var def = (base.def + ivs.def) * cpm;
    var hp  = Math.floor((base.hp + ivs.sta) * cpm);
    return atk * def * hp;
  }
```

E acrescentar `statProductFor` ao objeto retornado:

```js
  return { CP_CAPS, LEVEL_CAP, THRESHOLDS, cpFor, statProductFor };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pvp.js pokemon/test/pvp.test.js
git commit -m "fase1: pvp.js statProductFor"
```

---

### Task 6: `bestLevelUnderCap` (TDD)

Dado um IV e o cap de CP da liga, acha o nível (entrada `{level,cpm}`) de maior CPM cujo CP ≤ cap. Sem cap (master) → o nível mais alto da lista.

**Files:**
- Modify: `pokemon/lib/meta/pvp.js`
- Test: `pokemon/test/pvp.test.js`

- [ ] **Step 1: Adicionar o teste que falha**

```js
const { bestLevelUnderCap } = require('../lib/meta/pvp.js');

// CPMs sintéticos onde dá pra calcular o CP na mão (base 100/100/100, IV 0/0/0):
// cpm 0.1 → CP 10 ; cpm 0.5 → CP 250 ; cpm 0.9 → CP 810
const tinyCpm = [{ level: 1, cpm: 0.1 }, { level: 2, cpm: 0.5 }, { level: 3, cpm: 0.9 }];
const base100 = { atk: 100, def: 100, hp: 100 };
const iv000 = { atk: 0, def: 0, sta: 0 };

test('bestLevelUnderCap: maior nível com CP <= cap', () => {
  assert.deepStrictEqual(bestLevelUnderCap(base100, iv000, tinyCpm, 300), { level: 2, cpm: 0.5 }); // 810>300, 250<=300
  assert.deepStrictEqual(bestLevelUnderCap(base100, iv000, tinyCpm, 900), { level: 3, cpm: 0.9 }); // todos <=900
});

test('bestLevelUnderCap: cap Infinity (master) → nível mais alto', () => {
  assert.deepStrictEqual(bestLevelUnderCap(base100, iv000, tinyCpm, Infinity), { level: 3, cpm: 0.9 });
});

test('bestLevelUnderCap: nem o menor nível cabe → retorna o menor (piso)', () => {
  assert.deepStrictEqual(bestLevelUnderCap(base100, iv000, tinyCpm, 5), { level: 1, cpm: 0.1 }); // CP10>5
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: FAIL — `bestLevelUnderCap is not a function`.

- [ ] **Step 3: Implementação** (adicionar em `pvp.js`)

```js
  // Maior entrada {level,cpm} cujo CP <= cap. Lista assumida ascendente por cpm.
  // master (cap Infinity) → última entrada. Se nem a primeira cabe, retorna a primeira.
  function bestLevelUnderCap(base, ivs, cpmList, cap) {
    if (cap === Infinity) return cpmList[cpmList.length - 1];
    var best = cpmList[0];
    for (var i = 0; i < cpmList.length; i++) {
      if (cpFor(base, ivs, cpmList[i].cpm) <= cap) best = cpmList[i];
      else break;                       // CP cresce com o nível → pode parar no 1º que estoura
    }
    return best;
  }
```

E acrescentar ao `return`:

```js
  return { CP_CAPS, LEVEL_CAP, THRESHOLDS, cpFor, statProductFor, bestLevelUnderCap };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pvp.js pokemon/test/pvp.test.js
git commit -m "fase1: pvp.js bestLevelUnderCap"
```

---

### Task 7: `rankInfo` — distribuição dos 4096 IVs + rank do meu IV (memoizado) (TDD)

O "rank checker": para `(base, cap)` calcula o stat product dos 4096 IVs no melhor nível sob o cap, e responde `{ ivRank, spPct, sp, level, cp }` para um IV específico. Memoiza a distribuição por `cacheKey` (= `speciesId|cap`).

**Files:**
- Modify: `pokemon/lib/meta/pvp.js`
- Test: `pokemon/test/pvp.test.js`

- [ ] **Step 1: Adicionar o teste que falha**

```js
const { rankInfo } = require('../lib/meta/pvp.js');
const realCpm = require('../data/cpm.json');          // gerado na Task 3 (níveis 1..50)
const species = require('../data/species.json');       // Fase 0
const azuBase = species.azumarill.baseStats;           // { atk:112, def:152, hp:225 }

test('rankInfo master (sem cap): hundo é rank 1, spPct 1', () => {
  const r = rankInfo({ baseStats: azuBase, ivs: { atk: 15, def: 15, sta: 15 },
                       cap: Infinity, cpmList: realCpm, cacheKey: 'azumarill|master' });
  assert.strictEqual(r.ivRank, 1);
  assert.strictEqual(r.spPct, 1);
});

test('rankInfo Liga Grande (cap 1500): hundo NÃO é o ideal; 0/15/15 lidera', () => {
  // Propriedade real: sob cap, ataque baixo + def/HP altos vencem no stat product.
  const hundo = rankInfo({ baseStats: azuBase, ivs: { atk: 15, def: 15, sta: 15 },
                           cap: 1500, cpmList: realCpm, cacheKey: 'azumarill|great' });
  const lowAtk = rankInfo({ baseStats: azuBase, ivs: { atk: 0, def: 15, sta: 15 },
                            cap: 1500, cpmList: realCpm, cacheKey: 'azumarill|great' });
  assert.strictEqual(lowAtk.ivRank, 1);     // 0/15/15 é o melhor IV de Liga Grande
  assert.strictEqual(lowAtk.spPct, 1);
  assert.ok(hundo.ivRank > 1);              // hundo não lidera Grande
  assert.ok(hundo.spPct < 1);
  assert.ok(hundo.cp <= 1500);              // respeita o cap
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: FAIL — `rankInfo is not a function`.

- [ ] **Step 3: Implementação** (adicionar em `pvp.js`)

```js
  var _distCache = {};   // cacheKey → { sps:[...4096 desc], maxSp }

  // Distribuição (ordenada desc) dos stat products dos 4096 IVs, no melhor nível sob o cap.
  function _distribution(baseStats, cap, cpmList, cacheKey) {
    if (cacheKey && _distCache[cacheKey]) return _distCache[cacheKey];
    var sps = [];
    for (var a = 0; a <= 15; a++)
      for (var d = 0; d <= 15; d++)
        for (var s = 0; s <= 15; s++) {
          var ivs = { atk: a, def: d, sta: s };
          var lvl = bestLevelUnderCap(baseStats, ivs, cpmList, cap);
          sps.push(statProductFor(baseStats, ivs, lvl.cpm));
        }
    sps.sort(function (x, y) { return y - x; });   // desc
    var res = { sps: sps, maxSp: sps[0] };
    if (cacheKey) _distCache[cacheKey] = res;
    return res;
  }

  // rank = 1 + (nº de IVs com stat product ESTRITAMENTE maior). Empates compartilham rank.
  function _countStrictlyGreater(spsDesc, mySp) {
    var n = 0;
    for (var i = 0; i < spsDesc.length; i++) { if (spsDesc[i] > mySp) n++; else break; }
    return n;
  }

  function rankInfo(args) {
    var baseStats = args.baseStats, ivs = args.ivs, cap = args.cap,
        cpmList = args.cpmList, cacheKey = args.cacheKey;
    var dist = _distribution(baseStats, cap, cpmList, cacheKey);
    var lvl = bestLevelUnderCap(baseStats, ivs, cpmList, cap);
    var mySp = statProductFor(baseStats, ivs, lvl.cpm);
    return {
      ivRank: _countStrictlyGreater(dist.sps, mySp) + 1,
      spPct: mySp / dist.maxSp,
      sp: mySp,
      level: lvl.level,
      cp: cpFor(baseStats, ivs, lvl.cpm),
    };
  }
```

E acrescentar `rankInfo` ao `return`.

> **Perf:** a distribuição (4096 × busca de nível) é memoizada por `cacheKey`. Mons da mesma espécie/liga reusam. `master` usa `cap Infinity` (busca de nível trivial → última entrada). Para ~600 mons isso resolve em centenas de ms.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pvp.js pokemon/test/pvp.test.js
git commit -m "fase1: pvp.js rankInfo (distribuicao memoizada + rank do IV)"
```

---

### Task 8: `movesetOk` (TDD)

Compara os `moveIds` do mon com o moveset recomendado da liga: tem o golpe rápido recomendado E pelo menos um dos carregados recomendados.

**Files:**
- Modify: `pokemon/lib/meta/pvp.js`
- Test: `pokemon/test/pvp.test.js`

- [ ] **Step 1: Adicionar o teste que falha**

```js
const { movesetOk } = require('../lib/meta/pvp.js');

test('movesetOk: tem o rápido recomendado + ao menos 1 carregado recomendado', () => {
  const rec = ['COUNTER', 'ICE_PUNCH', 'POWER_UP_PUNCH']; // [rápido, carregado, carregado]
  assert.strictEqual(movesetOk(['COUNTER', 'ICE_PUNCH'], rec), true);          // rápido + 1 carregado
  assert.strictEqual(movesetOk(['COUNTER', 'ICE_PUNCH', 'POWER_UP_PUNCH'], rec), true);
  assert.strictEqual(movesetOk(['COUNTER'], rec), false);                       // falta carregado
  assert.strictEqual(movesetOk(['ICE_PUNCH', 'POWER_UP_PUNCH'], rec), false);   // falta o rápido
  assert.strictEqual(movesetOk([], rec), false);
  assert.strictEqual(movesetOk(['COUNTER', 'ICE_PUNCH'], []), false);           // sem recomendação → false
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: FAIL — `movesetOk is not a function`.

- [ ] **Step 3: Implementação** (adicionar em `pvp.js`)

```js
  // moveset recomendado = [rápido, carregado1, (carregado2?)]. "ok" = tem o rápido E >=1 carregado.
  function movesetOk(myMoveIds, recommended) {
    if (!recommended || recommended.length < 2) return false;
    var mine = myMoveIds || [];
    var fast = recommended[0];
    var charged = recommended.slice(1);
    if (mine.indexOf(fast) < 0) return false;
    return charged.some(function (c) { return mine.indexOf(c) >= 0; });
  }
```

E acrescentar `movesetOk` ao `return`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pvp.js pokemon/test/pvp.test.js
git commit -m "fase1: pvp.js movesetOk"
```

---

### Task 9: `evalMon` + `pvpTags` (TDD)

Junta tudo: para um mon enriquecido (`speciesId`, `ivs`, `moveIds`) e o `meta` (`speciesIndex`, `pvpRanks`, `cpm`), retorna o objeto `pvp` das 3 ligas. `pvpTags` deriva as tags `pvp_*` a partir do `pvp` + `ivPct` (aplica os THRESHOLDS).

**Files:**
- Modify: `pokemon/lib/meta/pvp.js`
- Test: `pokemon/test/pvp.test.js`

- [ ] **Step 1: Adicionar o teste que falha**

```js
const { evalMon, pvpTags } = require('../lib/meta/pvp.js');
const pvpRanks = require('../data/pvp_ranks.json');     // Fase 0

function metaObj() {
  return {
    speciesIndex: { byId: species },   // species.json é {speciesId: {baseStats,...}}
    pvpRanks: pvpRanks,
    cpm: realCpm,
  };
}

test('evalMon: sem speciesId → null (degrada)', () => {
  assert.strictEqual(evalMon({ speciesId: null, ivs: { atk: 0, def: 0, sta: 0 }, moveIds: [] }, metaObj()), null);
});

test('evalMon: sem cpm/pvpRanks → null', () => {
  const e = { speciesId: 'azumarill', ivs: { atk: 0, def: 15, sta: 15 }, moveIds: [] };
  assert.strictEqual(evalMon(e, { speciesIndex: { byId: species } }), null);
});

test('evalMon: Azumarill 0/15/15 com moveset recomendado → great isMeta, movesetOk', () => {
  const e = { speciesId: 'azumarill', ivs: { atk: 0, def: 15, sta: 15 },
              moveIds: ['BUBBLE', 'ICE_BEAM', 'PLAY_ROUGH'] };  // = moveset recomendado de Great
  const r = evalMon(e, metaObj());
  assert.strictEqual(r.great.isMeta, true);
  assert.strictEqual(r.great.speciesRank, pvpRanks.azumarill.great.rank);
  assert.strictEqual(r.great.movesetOk, true);
  assert.strictEqual(r.great.ivRank, 1);          // 0/15/15 lidera Grande
  assert.strictEqual(r.great.spPct, 1);
  assert.strictEqual(typeof r.master.ivRank, 'number');
});

test('pvpTags: aplica THRESHOLDS (great por spPct/ivRank; master por ivPct)', () => {
  // pvp sintético
  const pvp = {
    great:  { isMeta: true,  ivRank: 1,   spPct: 1,    movesetOk: true },
    ultra:  { isMeta: true,  ivRank: 999, spPct: 0.90, movesetOk: false }, // não passa limiar
    master: { isMeta: true,  ivRank: 50,  spPct: 0.97, movesetOk: false },
  };
  assert.deepStrictEqual(pvpTags(pvp, 100).sort(), ['pvp_great', 'pvp_master']); // ivPct 100>=98
  assert.deepStrictEqual(pvpTags(pvp, 90).sort(), ['pvp_great']);                // ivPct 90<98 → sem master
  assert.deepStrictEqual(pvpTags(null, 100), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: FAIL — `evalMon is not a function`.

- [ ] **Step 3: Implementação** (adicionar em `pvp.js`)

```js
  var LEAGUES = ['great', 'ultra', 'master'];

  // Avalia o mon nas 3 ligas. Retorna null se faltar speciesId, baseStats, pvpRanks ou cpm.
  function evalMon(e, meta) {
    if (!e || !e.speciesId || !meta || !meta.cpm || !meta.pvpRanks) return null;
    var byId = meta.speciesIndex && meta.speciesIndex.byId;
    var sp = byId && byId[e.speciesId];
    if (!sp || !sp.baseStats) return null;
    var ranks = meta.pvpRanks[e.speciesId] || {};
    var out = {};
    LEAGUES.forEach(function (lg) {
      var rankEntry = ranks[lg] || null;     // null = espécie fora do Top N daquela liga
      var info = rankInfo({
        baseStats: sp.baseStats, ivs: e.ivs, cap: CP_CAPS[lg],
        cpmList: meta.cpm, cacheKey: e.speciesId + '|' + lg,
      });
      out[lg] = {
        isMeta: !!rankEntry,
        speciesRank: rankEntry ? rankEntry.rank : null,
        ivRank: info.ivRank,
        spPct: info.spPct,
        movesetOk: rankEntry ? movesetOk(e.moveIds, rankEntry.moveset) : false,
      };
    });
    return out;
  }

  // Tags pvp_* a partir do objeto pvp + IV% simples (master usa ivPct).
  function pvpTags(pvp, ivPct) {
    if (!pvp) return [];
    var tags = [];
    ['great', 'ultra'].forEach(function (lg) {
      var L = pvp[lg];
      if (L && L.isMeta && (L.spPct >= THRESHOLDS[lg].spPct || L.ivRank <= THRESHOLDS[lg].ivRank))
        tags.push('pvp_' + lg);
    });
    var m = pvp.master;
    if (m && m.isMeta && ivPct >= THRESHOLDS.master.ivPct) tags.push('pvp_master');
    return tags;
  }
```

E acrescentar `evalMon, pvpTags` ao `return`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pvp.js pokemon/test/pvp.test.js
git commit -m "fase1: pvp.js evalMon + pvpTags"
```

---

### Task 10: Integrar PvP em `analysis.js` — `e.pvpMeta`, tags, counts, proteção (TDD, não-regressão)

`analyze()` passa a calcular `e.pvpMeta`, somar tags `pvp_*`, e considerar meta-relevância como proteção (mon competitivo nunca é transferido). Sem `meta`, comportamento idêntico ao de hoje.

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/enrich.test.js`, `pokemon/test/counts.test.js`

- [ ] **Step 1: Adicionar os testes que falham**

1a. Append em `pokemon/test/enrich.test.js`:

```js
const realCpm = require('../data/cpm.json');
const speciesJson = require('../data/species.json');
const pvpRanksJson = require('../data/pvp_ranks.json');

function fullMeta() {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  return { speciesIndex: buildSpeciesIndex(speciesJson), movesPt: {}, pvpRanks: pvpRanksJson, cpm: realCpm };
}

test('analyze com meta: Azumarill 0/15/15 ganha e.pvpMeta e tag pvp_great', () => {
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, fullMeta())[0];
  assert.ok(e.pvpMeta, 'e.pvpMeta presente');
  assert.strictEqual(e.pvpMeta.great.isMeta, true);
  assert.ok(e.tags.includes('pvp_great'));
});

test('analyze com meta: espécie meta nunca cai em TRANSFERIR (proteção)', () => {
  // Duas cópias de Azumarill; a pior normalmente seria TRANSFERIR, mas é meta → protegida.
  const fd = {
    best: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15, mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' },
    dupe: { mon_name:'Azumarill', mon_number:184, mon_cp:600,  mon_attack:2, mon_defence:3,  mon_stamina:4,  mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, fullMeta());
  assert.ok(list.every(e => e.verdict !== 'TRANSFERIR'));
});

test('analyze SEM meta: e.pvpMeta null, sem tags pvp_*, veredito intacto (não-regressão)', () => {
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:600, mon_attack:2, mon_defence:3, mon_stamina:4,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar)[0];
  assert.strictEqual(e.pvpMeta, null);
  assert.ok(!e.tags.some(t => t.indexOf('pvp_') === 0));
  assert.strictEqual(e.verdict, 'MANTER'); // única cópia → MANTER, como antes
});
```

> **Nota sobre o número da Pokédex:** Azumarill é #184. O `buildSpeciesIndex` casa por `dex`. Confira que `species.azumarill.dex === 184` (já é).

1b. Append em `pokemon/test/counts.test.js`:

```js
const realCpm = require('../data/cpm.json');
const speciesJson = require('../data/species.json');
const pvpRanksJson = require('../data/pvp_ranks.json');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

test('contagens incluem pvpGreat/pvpUltra/pvpMaster', () => {
  const meta = { speciesIndex: buildSpeciesIndex(speciesJson), movesPt: {}, pvpRanks: pvpRanksJson, cpm: realCpm };
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const c = computeCounts(analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta));
  assert.strictEqual(c.pvpGreat, 1);
  assert.ok('pvpUltra' in c && 'pvpMaster' in c);
});

test('contagens sem meta: pvp* ficam 0 (não-regressão)', () => {
  const c = computeCounts(analyze(fd, getPokemonSize, refdata)); // fd do topo do arquivo
  assert.strictEqual(c.pvpGreat, 0);
  assert.strictEqual(c.pvpUltra, 0);
  assert.strictEqual(c.pvpMaster, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/enrich.test.js test/counts.test.js`
Expected: FAIL — `e.pvpMeta` é `undefined`/`c.pvpGreat` indefinido.

- [ ] **Step 3: Implementação** — editar `pokemon/lib/analysis.js`

3a. Importar `pvp.js` junto do import de `match.js` (logo após a linha do `PokeMatch`):

```js
  var PokePvp = (typeof require === 'function')
    ? require('./meta/pvp.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokePvp : null);
```

3b. Inicializar `pvp: null` no objeto retornado por `enrichOne` (logo após `moveIds: [...]`, mantendo a vírgula):

```js
      // Fase 1 — avaliação PvP (preenchida por analyze quando há meta).
      // ATENÇÃO: chamar de pvpMeta, não pvp — pvp já existe (mon_pvp_stats, linha ~78).
      pvpMeta: null,
      action: null,
```

3c. Adicionar helper `isPvpMeta` (perto de `isProtected`):

```js
  function isPvpMeta(e) {
    return !!(e.pvpMeta && (e.pvpMeta.great.isMeta || e.pvpMeta.ultra.isMeta || e.pvpMeta.master.isMeta));
  }
```

3d. Incluir meta-relevância em `isProtected`. Trocar a linha final do `return` de `isProtected` (`|| e.isTradeEvo || e.isRegional;`) por:

```js
        || e.isTradeEvo || e.isRegional
        || isPvpMeta(e);
```

3e. Estender `computeTags` para somar as tags PvP. Trocar o corpo de `computeTags` por:

```js
  function computeTags(e) {
    const tags = [];
    if (e.isTradeEvo) tags.push('TROCAR_EVO');
    if (e.isRegional) tags.push('REGIONAL');
    if (e.pvpMeta && PokePvp) for (const t of PokePvp.pvpTags(e.pvpMeta, e.ivPct)) tags.push(t);
    return tags;
  }
```

3f. Em `analyze`, calcular `e.pvpMeta` ANTES de tags/veredito. Trocar o corpo do laço `for (const e of list) {...}` por:

```js
    for (const e of list) {
      e.pvpMeta = (meta && meta.cpm && meta.pvpRanks && PokePvp) ? PokePvp.evalMon(e, meta) : null;
      const v = computeVerdict(e);
      e.verdict = v.verdict;
      e.reason = v.reason;
      e.tags = computeTags(e);
      e.tradeBoost = tradeBoost(e);
    }
```

3g. Estender `computeCounts`. No objeto `c` inicial, adicionar os três contadores:

```js
    const c = { total: list.length, INVESTIR:0, MANTER:0, TRANSFERIR:0,
                hundos:0, shinies:0, shadows:0, purified:0, extremeSizes:0, legendaries:0, luckies:0, tradeBoost:0,
                pvpGreat:0, pvpUltra:0, pvpMaster:0 };
```

e dentro do laço de `computeCounts`, antes do `}` de fechamento do `for`:

```js
      if (e.tags.includes('pvp_great'))  c.pvpGreat++;
      if (e.tags.includes('pvp_ultra'))  c.pvpUltra++;
      if (e.tags.includes('pvp_master')) c.pvpMaster++;
```

3h. Exportar `isPvpMeta` no `return` do factory (acrescentar à lista existente):

```js
  return { ivPct, speciesKey, enrichOne, enrichCollection, isProtected, isPvpMeta, computeVerdict, computeTags, canBestFriendTrade, tradeBoost, analyze, computeCounts,
           TRADE_MIN_IV_PCT, TRADE_EXPECTED_IV_PCT };
```

> **Ordem importa:** `e.pvpMeta` precisa existir antes de `computeVerdict` (que chama `isProtected`→`isPvpMeta`) e antes de `computeTags`. O Step 3f garante isso.

- [ ] **Step 4: Rodar a suíte inteira (não-regressão)**

Run: `cd pokemon && node --test`
Expected: PASS — todos os testes existentes continuam verdes (incluindo os dois Xatus e os de verdict/render), mais os novos.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/enrich.test.js pokemon/test/counts.test.js
git commit -m "fase1: integra PvP no analyze (e.pvpMeta, tags pvp_*, counts, protecao meta)"
```

---

### Task 11: `computeAction` — Fortalecer / Ensinar-TM + reason (TDD)

A ação refina o veredito (spec §9). Fase 1 cobre as duas ações de PvP. Mon com cópia boa pra alguma liga (tem tag `pvp_*`) vira **Fortalecer** (se moveset ok) ou **Ensinar/TM** (se moveset ruim). Veredito dessas ações = **INVESTIR**.

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pokemon/test/verdict.test.js`)

```js
const { computeAction } = require('../lib/analysis.js');

function pvpMon(over) {
  return Object.assign({
    ivPct: 67, tags: ['pvp_great'],
    pvpMeta: {
      great:  { isMeta: true, speciesRank: 13, ivRank: 1, spPct: 1, movesetOk: true },
      ultra:  { isMeta: false, speciesRank: null, ivRank: 999, spPct: 0.5, movesetOk: false },
      master: { isMeta: false, speciesRank: null, ivRank: 999, spPct: 0.5, movesetOk: false },
    },
  }, over || {});
}

test('computeAction: cópia boa + moveset ok → FORTALECER (Liga Grande)', () => {
  const a = computeAction(pvpMon());
  assert.strictEqual(a.kind, 'FORTALECER');
  assert.strictEqual(a.league, 'great');
  assert.match(a.reason, /Fortalecer/);
  assert.match(a.reason, /Grande/);
});

test('computeAction: cópia boa + moveset ruim → ENSINAR_TM', () => {
  const a = computeAction(pvpMon({
    pvpMeta: {
      great:  { isMeta: true, speciesRank: 13, ivRank: 1, spPct: 1, movesetOk: false },
      ultra:  { isMeta: false, speciesRank: null, ivRank: 999, spPct: 0.5, movesetOk: false },
      master: { isMeta: false, speciesRank: null, ivRank: 999, spPct: 0.5, movesetOk: false },
    },
  }));
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /Ensinar|TM/);
});

test('computeAction: sem tag pvp_* → null', () => {
  assert.strictEqual(computeAction({ ivPct: 50, tags: [], pvpMeta: null }), null);
});

test('analyze: mon FORTALECER recebe veredito INVESTIR e e.action', () => {
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO', mon_move_1:'Bolha', mon_move_2:'Raio Congelante', mon_move_3:'Jogo Duro' } };
  const meta = (function () {
    const { buildSpeciesIndex } = require('../lib/meta/match.js');
    return {
      speciesIndex: buildSpeciesIndex(require('../data/species.json')),
      // nomes PT reais (confirmados em data/moves_pt.json): bolha/raio congelante/jogo duro
      movesPt: { 'bolha':'BUBBLE', 'raio congelante':'ICE_BEAM', 'jogo duro':'PLAY_ROUGH' },
      pvpRanks: require('../data/pvp_ranks.json'),
      cpm: require('../data/cpm.json'),
    };
  })();
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.ok(e.action && e.action.kind === 'FORTALECER');
  assert.strictEqual(e.verdict, 'INVESTIR');
});
```

> Nomes PT já confirmados em `data/moves_pt.json`: `bolha`→BUBBLE, `raio congelante`→ICE_BEAM, `jogo duro`→PLAY_ROUGH. O teste embute só esses 3 mapeamentos (independe do resto do dataset).

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/verdict.test.js`
Expected: FAIL — `computeAction is not a function`.

- [ ] **Step 3: Implementação** — editar `pokemon/lib/analysis.js`

3a. Adicionar o mapa de nomes de liga e `computeAction` (perto de `computeTags`):

```js
  const LEAGUE_PT = { great: 'Liga Grande', ultra: 'Liga Ultra', master: 'Liga Mestre' };
  const PVP_LEAGUE_ORDER = ['great', 'ultra', 'master'];

  // Escolhe a melhor liga em que a cópia é boa (tem tag pvp_<liga>), na ordem great>ultra>master.
  function _bestPvpLeague(e) {
    for (const lg of PVP_LEAGUE_ORDER) if (e.tags.includes('pvp_' + lg)) return lg;
    return null;
  }

  function computeAction(e) {
    const lg = _bestPvpLeague(e);
    if (!lg || !e.pvpMeta) return null;
    const L = e.pvpMeta[lg];
    const ligaPt = LEAGUE_PT[lg];
    const ivInfo = 'IV PvP ' + Math.round(L.spPct * 100) + '% (rank ' + L.ivRank + '/4096)';
    if (L.movesetOk) {
      return { kind: 'FORTALECER', league: lg,
        reason: 'Fortalecer p/ ' + ligaPt + ' — rank ' + L.speciesRank + ' da espécie, seu ' + ivInfo };
    }
    return { kind: 'ENSINAR_TM', league: lg,
      reason: 'Ensinar/TM p/ ' + ligaPt + ' — Top ' + L.speciesRank + ', falta o moveset recomendado' };
  }
```

3b. Em `computeVerdict`, dar prioridade à ação PvP (INVESTIR). Adicionar no **início** da função `computeVerdict`, antes de `if (isProtected(e)) {`:

```js
    if (e.action && (e.action.kind === 'FORTALECER' || e.action.kind === 'ENSINAR_TM'))
      return { verdict: 'INVESTIR', reason: e.action.reason };
```

3c. No laço de `analyze`, calcular `e.action` DEPOIS de `e.tags` e ANTES de `computeVerdict`. Trocar o corpo do laço (do Step 3f da Task 10) por:

```js
    for (const e of list) {
      e.pvpMeta = (meta && meta.cpm && meta.pvpRanks && PokePvp) ? PokePvp.evalMon(e, meta) : null;
      e.tags = computeTags(e);
      e.action = computeAction(e);
      const v = computeVerdict(e);
      e.verdict = v.verdict;
      e.reason = v.reason;
      e.tradeBoost = tradeBoost(e);
    }
```

> **Atenção:** `computeTags` agora roda antes de `computeVerdict` (precisa, pois `computeAction` lê `e.tags`). `computeTags` não depende de `e.verdict`, então a ordem é segura. As tags `TROCAR_EVO`/`REGIONAL` continuam idênticas.

3d. Acrescentar `computeAction` ao `return` do factory.

- [ ] **Step 4: Rodar a suíte inteira (não-regressão)**

Run: `cd pokemon && node --test`
Expected: PASS — tudo verde. Sem `meta`, `e.action` é null (sem tag pvp_*), `computeVerdict` ignora o novo ramo → veredito idêntico ao de hoje.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "fase1: computeAction (Fortalecer/Ensinar-TM) + veredito INVESTIR"
```

---

### Task 12: `render.js` — selos ⚔️ + linha de ação no card (TDD)

**Files:**
- Modify: `pokemon/lib/render.js`
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pokemon/test/render.test.js`)

```js
function pvpStub(over) {
  // mon enriquecido mínimo p/ render (sem rodar analyze)
  return Object.assign({
    id: 'p', name: 'Azumarill', verdict: 'INVESTIR', reason: 'x', ivPct: 67, cp: 1498,
    size: null, isHundo:false, isShiny:false, isShadow:false, isPurified:false, isLucky:false,
    isLegendary:false, isCostume:false, isXSComfort:false, isXLComfort:false, hasSecondCharge:false,
    tradeBoost:null,
    tags: ['pvp_great'],
    action: { kind:'FORTALECER', league:'great', reason:'Fortalecer p/ Liga Grande — rank 13' },
    pvp: null, // mon_pvp_stats (vitórias/derrotas) — ausente neste stub
    pvpMeta: { great:{isMeta:true,speciesRank:13,ivRank:1,spPct:1,movesetOk:true}, ultra:{isMeta:false}, master:{isMeta:false} },
  }, over || {});
}

test('badgesHtml: selo ⚔️G aparece com tag pvp_great', () => {
  const html = badgesHtml(pvpStub());
  assert.match(html, /⚔️/);
  assert.match(html, /G/);
});

test('badgesHtml: ⚔️U e ⚔️M com ultra/master', () => {
  assert.match(badgesHtml(pvpStub({ tags:['pvp_ultra'] })), /⚔️.?U/);
  assert.match(badgesHtml(pvpStub({ tags:['pvp_master'] })), /⚔️.?M/);
});

test('cardHtml: mostra a linha de ação quando há e.action', () => {
  const html = cardHtml(pvpStub());
  assert.match(html, /Fortalecer/);
  assert.match(html, /pk-action/);
});

test('cardHtml: sem ação → sem linha pk-action (não-regressão)', () => {
  const html = cardHtml(pvpStub({ action: null, tags: [] }));
  assert.doesNotMatch(html, /pk-action/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/render.test.js`
Expected: FAIL — selo ⚔️ / `pk-action` ausentes.

- [ ] **Step 3: Implementação** — editar `pokemon/lib/render.js`

3a. Em `badgesHtml`, antes do `return b.join('');`, adicionar os selos PvP:

```js
    if (e.tags.includes('pvp_great'))  b.push('<span class="badge b-pvp">⚔️G</span>');
    if (e.tags.includes('pvp_ultra'))  b.push('<span class="badge b-pvp">⚔️U</span>');
    if (e.tags.includes('pvp_master')) b.push('<span class="badge b-pvp">⚔️M</span>');
```

3b. Em `cardHtml`, adicionar a linha de ação após a linha do `reason` (e antes da `tradeBoost`):

```js
        (e.action ? '<div class="pk-action">⚔️ ' + esc(e.action.reason) + '</div>' : '') +
```

(inserir essa expressão na concatenação, logo após `'<div class="reason">' + esc(e.reason) + '</div>' +`)

3c. Adicionar o CSS dos novos elementos em `pokemon/index.html` (dentro do `<style>`, perto de `.trade-tip`):

```css
.b-pvp { background:rgba(245,197,24,.2); color:var(--gold); }
.pk-action { font-size:11.5px; color:var(--gold); font-weight:600; }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/render.js pokemon/index.html pokemon/test/render.test.js
git commit -m "fase1: render selos ⚔️ + linha de acao no card"
```

---

### Task 13: `render.js` — bloco "Competitivo" no detalhe (TDD)

**Files:**
- Modify: `pokemon/lib/render.js`
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pokemon/test/render.test.js`; reusa `pvpStub`)

```js
test('detailHtml: bloco Competitivo aparece quando há liga meta', () => {
  const e = pvpStub({ verdict:'INVESTIR', moves:['Bolha','Raio de Gelo'], height:0.5, weight:28.5,
                      ivs:{atk:0,def:15,sta:15}, pvp_recommended:{ great:['BUBBLE','ICE_BEAM','PLAY_ROUGH'] } });
  const html = detailHtml(e);
  assert.match(html, /Competitivo/);
  assert.match(html, /Liga Grande/);
  assert.match(html, /rank 13/);
});

test('detailHtml: sem pvp meta → sem bloco Competitivo (não-regressão)', () => {
  const e = pvpStub({ verdict:'MANTER', moves:['x'], height:0.5, weight:1, ivs:{atk:1,def:1,sta:1},
                      tags:[], action:null, pvpMeta:{ great:{isMeta:false}, ultra:{isMeta:false}, master:{isMeta:false} } });
  const html = detailHtml(e);
  assert.doesNotMatch(html, /Competitivo/);
});
```

> `detailHtml` já lê `e.moves`, `e.ivs`, `e.height`, `e.weight` e `e.pvp` (este último é `mon_pvp_stats`, vitórias/derrotas — NÃO mexer). O bloco novo usa `e.pvpMeta` (rank/spPct/ivRank por liga) — não precisa de `pvp_recommended`; o campo no stub é ignorado pelo render. O "ok do moveset" vem de `e.pvpMeta[lg].movesetOk`, mantendo o detalhe honesto sem depender de dados extras.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/render.test.js`
Expected: FAIL — "Competitivo" ausente.

- [ ] **Step 3: Implementação** — editar `pokemon/lib/render.js`

3a. Adicionar a função `competitiveHtml` (antes de `detailHtml`):

```js
  const LEAGUE_LABEL = { great: 'Liga Grande', ultra: 'Liga Ultra', master: 'Liga Mestre' };

  function competitiveHtml(e) {
    if (!e.pvpMeta) return '';
    const rows = [];
    ['great', 'ultra', 'master'].forEach(function (lg) {
      const L = e.pvpMeta[lg];
      if (!L || !L.isMeta) return;
      const sp = Math.round(L.spPct * 100);
      const mv = L.movesetOk ? 'moveset recomendado ✓' : 'falta o moveset recomendado';
      rows.push('<div class="comp-row"><strong>' + LEAGUE_LABEL[lg] + '</strong> — rank ' +
                L.speciesRank + ' da espécie · seu IV PvP ' + sp + '% (rank ' + L.ivRank +
                '/4096) · ' + mv + '</div>');
    });
    if (!rows.length) return '';
    return '<div class="pk-competitive"><h4>Competitivo</h4>' + rows.join('') + '</div>';
  }
```

3b. Em `detailHtml`, incluir o bloco. Trocar `const compare = ...;` por (manter a linha original do compare e adicionar a do competitive):

```js
    const compare = (e.verdict === 'TRANSFERIR' && e.betterCopy) ? compareHtml(e, e.betterCopy) : '';
    const competitive = competitiveHtml(e);
```

e, no HTML retornado, adicionar `competitive` antes de `compare`:

```js
        competitive +
        compare +
```

3c. Adicionar CSS em `pokemon/index.html` (perto do `.pk-compare`):

```css
.pk-competitive { margin-top:10px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:10px; }
.pk-competitive h4 { font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:var(--gold); margin-bottom:8px; font-weight:700; }
.pk-competitive .comp-row { font-size:12px; color:var(--text); padding:3px 0; }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/render.js pokemon/index.html pokemon/test/render.test.js
git commit -m "fase1: render bloco Competitivo no detalhe"
```

---

### Task 14: `app.js` + `index.html` + `sw.js` — chips ⚔️, carregar datasets, cache

Carrega `pvp_ranks.json` + `cpm.json` no `loadMeta`, registra os chips ⚔️, inclui `pvp.js` no HTML e no service worker.

**Files:**
- Modify: `pokemon/app.js`, `pokemon/index.html`, `pokemon/sw.js`

- [ ] **Step 1: `loadMeta` carrega `pvp_ranks` e `cpm`** — em `pokemon/app.js`, trocar a função `loadMeta` por:

```js
  async function loadMeta() {
    try {
      const [species, movesPt, pvpRanks, cpm] = await Promise.all([
        fetch('./data/species.json').then(r => r.ok ? r.json() : null),
        fetch('./data/moves_pt.json').then(r => r.ok ? r.json() : null),
        fetch('./data/pvp_ranks.json').then(r => r.ok ? r.json() : null),
        fetch('./data/cpm.json').then(r => r.ok ? r.json() : null),
      ]);
      if (!species || !movesPt) return null;
      return { speciesIndex: buildSpeciesIndex(species), movesPt, pvpRanks: pvpRanks || null, cpm: cpm || null };
    } catch (e) { console.warn('meta indisponível:', e); return null; }
  }
```

- [ ] **Step 2: Adicionar os chips ⚔️** — em `pokemon/app.js`, na função `renderChips`, acrescentar ao array `defs` (após a linha do `tradeiv`):

```js
      ['pvp_great',  '⚔️ Grande ' + c.pvpGreat,  e => e.tags.includes('pvp_great')],
      ['pvp_ultra',  '⚔️ Ultra ' + c.pvpUltra,   e => e.tags.includes('pvp_ultra')],
      ['pvp_master', '⚔️ Mestre ' + c.pvpMaster,  e => e.tags.includes('pvp_master')],
```

- [ ] **Step 3: Incluir `pvp.js` no `index.html`** — adicionar a tag **ANTES** de `lib/analysis.js` (crítico: `analysis.js` captura `globalThis.PokePvp` ao executar). Após a linha `<script src="./lib/meta/match.js"></script>`:

```html
<script src="./lib/meta/pvp.js"></script>
```

Ordem final: `sizes.js`, `lib/refdata.js`, `lib/meta/match.js`, `lib/meta/pvp.js`, `lib/analysis.js`, `lib/render.js`, `lib/sort.js`, `app.js`.

- [ ] **Step 4: Service worker** — em `pokemon/sw.js`:

4a. Trocar `const CACHE = 'pokemon-leo-v8';` por `const CACHE = 'pokemon-leo-v9';`.

4b. No array `ASSETS`, adicionar `./lib/meta/pvp.js` (após `./lib/meta/match.js`) e `./data/cpm.json` (após `./data/pvp_ranks.json`). Resultado:

```js
const ASSETS = [
  './index.html', './app.js', './sizes.js',
  './lib/refdata.js', './lib/analysis.js', './lib/render.js', './lib/sort.js', './lib/meta/match.js', './lib/meta/pvp.js',
  './colecao.json', './manifest.json',
  './data/species.json', './data/moves.json', './data/moves_pt.json',
  './data/pvp_ranks.json', './data/cpm.json', './data/meta.json',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];
```

> O handler já trata `/data/` como network-first (Fase 0). Nada mais a mudar lá.

- [ ] **Step 5: Verificação manual no navegador**

Run: `cd pokemon && python -m http.server 8000` e abrir `http://localhost:8000`.
Expected:
- Página carrega sem regressão visual; aparecem chips `⚔️ Grande/Ultra/Mestre` com contagem.
- No console: `window.__pokeApp.getMons().filter(m => m.tags.includes('pvp_great')).length` > 0 (se a coleção tiver mons meta).
- Clicar num mon competitivo mostra o bloco "Competitivo" e a linha de ação.
- DevTools → Application → Cache Storage: `pokemon-leo-v9` contém `lib/meta/pvp.js` e `data/cpm.json`.

- [ ] **Step 6: Commit**

```bash
git add pokemon/app.js pokemon/index.html pokemon/sw.js
git commit -m "fase1: app chips ⚔️, carrega pvp_ranks+cpm, sw v9 + pvp.js/cpm.json"
```

---

### Task 15: Verificação final da Fase 1

- [ ] **Step 1: Suíte completa verde**

Run: `cd pokemon && node --test`
Expected: PASS em todos os arquivos (`counts`, `grouping`, `refdata`, `enrich`, `render`, `verdict`, `transform`, `match`, `pvp`, `tradeboost`, `sort`).

- [ ] **Step 2: Conferir os critérios de sucesso da Fase 1 (spec §12)**

Checklist manual:
- `pokemon/data/cpm.json` existe, gerado pelo script (não à mão), 99 entradas, L50 = 0.84029999.
- Nenhum mon meta-relevante cai em TRANSFERIR (teste de proteção verde).
- Mons competitivos mostram liga/rank/justificativa rastreável (bloco Competitivo + linha de ação).
- Sem `meta` (ou sem `cpm.json`/`pvp_ranks.json`), tudo degrada para o comportamento atual (testes de não-regressão verdes).
- Funciona offline: o SW v9 cacheia `pvp.js` e `cpm.json`.

- [ ] **Step 3: Commit final (se algo pendente) e fim da Fase 1**

```bash
git add -A && git commit -m "fase1: verificação final" --allow-empty
```

---

## Notas para as próximas fases (fora deste plano)

- **Fase 2 (PvE):** `lib/meta/pve.js` com DPS/TDO/ER calculados no build (stats PvE do golpe vêm do GAME_MASTER do PokeMiners — `energyDelta`/`durationTurns`/`power`, ver SOURCES.md §3). Estender `moves.json` com bloco `pve`; emitir `pve_ranks.json`. Tags `raid`/`pve`/`gym_atk`/`gym_def`, chips 🔥🛡️.
- **Fase 3 (Rocket + eventos):** tag `rocket` (mecânica de spam do golpe), ações Aguardar Rocket (Frustração), Aguardar Evento (golpe legado via `eliteMoves`), Trocar/Reroll (lucky). `computeAction` ganha os ramos 3–5 do spec §9.
- **Fase 4 (Polimento):** ordenação por rank quando um chip competitivo está ativo (estender `lib/sort.js`), ajuste de limiares (`THRESHOLDS`), textos de justificativa, relatório de cobertura PT.
- O `LEVEL_CAP`/`CPM_MAX_LEVEL` = 50; para suportar Melhor-Amigo (nível 51), basta subir ambos e regenerar `cpm.json` (o índice 50 do GAME_MASTER já traz L51 = 0.8453).
```
