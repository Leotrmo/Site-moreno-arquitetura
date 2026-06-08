# Camada de Meta Competitivo — Fase 3 (Rocket + ações Aguardar/Trocar) — Plano de Implementação

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa-a-tarefa. Os passos usam checkbox (`- [ ]`) para rastreio.

**Goal:** Fechar o motor de decisão competitivo: (1) a tag **`rocket`** (moveset de *spam* — rápido que gera energia rápido + carregado barato), com selo 🚀, chip 🚀 Rocket e contagem; e (2) as três ações que faltavam sobre a triagem — **Aguardar Rocket** (Sombrio com Frustração), **Aguardar Evento** (moveset ótimo exige golpe legado) e **Trocar/Reroll** (cópia meta fraca ou shiny duplicado p/ Lucky) — refinando `computeAction` sem regredir Fortalecer/Ensinar-TM das Fases 1/2.

**Architecture:** A tag `rocket` é uma **avaliação de runtime** do moveset do próprio mon (`e.moveIds` × `moves.json`), independente de a espécie ser meta — vive como função pura `rocketSpam` em `lib/meta/pve.js` e é cabeada em `analysis.js` (`e.isRocketReady` → tag `rocket` → selo/chip/contagem). Isso exige **carregar `moves.json` no runtime** (`meta.moves`), o que hoje não acontece. As três ações entram em `computeAction` (analysis.js) como uma reestruturação por prioridade decrescente; precisam de duas informações novas no mon: o **moveset recomendado** da liga PvP (já existe em `pvp.js`, só não é exposto) e os **`eliteMoves`** da espécie (já em `species.json`, só não anexados ao mon). Tudo é **aditivo**: sem `meta.moves`/sem dados, o comportamento das Fases 1/2 é byte-a-byte preservado.

**Tech Stack:** JavaScript (UMD no runtime, CommonJS nos módulos de build), `node --test`, site estático. Nenhuma URL/fonte externa nova; nenhum passo de build novo (os datasets já contêm tudo: `moves.json` tem `pvp`/`pve`, `species.json` tem `eliteMoves`).

**Referência:** `docs/superpowers/specs/2026-06-07-pokemon-meta-competitivo-design.md` (§8 tag `rocket`, §9 as 6 ações, §10 UI, §11 Fase 3). Padrões herdados de `docs/superpowers/plans/2026-06-08-pokemon-meta-fase2-pve.md`.

---

## Decisões de design (leitura do spec — conflito §9 resolvido aqui)

O §9 do spec tem uma **lista numerada** (1 Fortalecer · 2 Ensinar/TM · 3 Aguardar Rocket · 4 Aguardar Evento · 5 Trocar) e uma **tabela "Quando"** que se contradizem: pela lista, Ensinar/TM (2) venceria sempre Aguardar Evento (4), e Aguardar Evento nunca dispararia. A **tabela "Quando" é a fonte de verdade** (descreve as condições reais); a lista é um esboço. Resolução adotada em `computeAction`, **primeira que casa vence**:

| Prioridade | Ação | `kind` | Veredito | Condição |
|---|---|---|---|---|
| 1 | **Aguardar Rocket** | `AGUARDAR_ROCKET` | MANTER | meta-relevante (PvP ou PvE) **E** `isShadow` **E** tem `FRUSTRATION` nos `moveIds` |
| 2 | **Fortalecer/Evoluir** | `FORTALECER` | INVESTIR | tem gancho de meta (liga/papel) **E** `movesetOk` |
| 3 | **Aguardar Evento** | `AGUARDAR_EVENTO` | MANTER | gancho de meta **E** `movesetOk=false` **E** um golpe recomendado que falta está nos `eliteMoves` (legado/Elite TM) |
| 4 | **Ensinar/TM** | `ENSINAR_TM` | INVESTIR | gancho de meta **E** `movesetOk=false` (golpe que falta é TM normal) |
| 5 | **Trocar/Reroll** | `TROCAR` | MANTER | é **duplicata pior** (`e.betterCopy` existe) **E** ( `isShiny` → lucky trade ) **OU** ( meta-relevante + `ivPct < 80` → reroll ) |
| — | (sem gancho) | `null` | — | nada acima → mantém o motivo atual |

**Por que `AGUARDAR_ROCKET` no topo (acima de Fortalecer):** a Frustração ocupa um slot de carregado e **só pode ser trocada em evento Rocket especial** (Charged TM de Frustração). Enquanto isso, o Sombrio não atinge o moveset ótimo — então a recomendação honesta é "aguardar", não "fortalecer já". É a única ação que pré-empta Fortalecer.

**Por que `TROCAR` exige `e.betterCopy` (é duplicata pior):** evita sugerir trocar sua *melhor* cópia e mantém a não-regressão — os stubs dos testes das Fases 1/2 não têm `betterCopy`, então `computeAction` devolve o mesmo de antes para eles. `TROCAR` (MANTER) também nunca rebaixa um mon meta para TRANSFERIR (critério de sucesso §12.2 preservado: meta continua protegido).

**Veredito:** `computeVerdict` só promove `FORTALECER`/`ENSINAR_TM` → INVESTIR (inalterado). As ações novas (`AGUARDAR_*`, `TROCAR`) são MANTER: caem no caminho `isProtected` (todo mon meta/sombrio/shiny já é protegido → MANTER, ou INVESTIR se hundo/quase-perfeito). A linha de ação no card mostra `e.action.reason` independentemente do veredito — então a justificativa aparece sem mexer no veredito.

## Heurística da tag `rocket` (spec §8: "spam — rápido com alta geração de energia/curto + carregado de baixo custo")

Batalhas Rocket usam a mecânica de **batalha de treinador** (escudos + golpes carregados), igual ao PvP — então a tag usa os stats **PvP** dos golpes (`moves.json[id].pvp`): `fast.pvp.energy` = energia ganha por turno; `charged.pvp.energy` = custo. Métrica única e intuitiva:

```
turnosParaCarregar = (custo do carregado mais barato) / (energia/turno do rápido mais forte)
rocket = turnosParaCarregar <= ROCKET_SPAM_TURNS     // padrão 12; afinado na Fase 4
```

Poucos turnos para o 1º carregado = pressão de *spam*. `ROCKET_SPAM_TURNS = 12` é o limiar inicial (constante no topo de `pve.js`, configurável). Os testes unitários usam **golpes sintéticos** que cruzam/erram o limiar com folga (não números mágicos do dataset real); a contagem na coleção real é conferida na Task 11 (verificação), não fixada em teste.

## Estrutura de arquivos (Fase 3)

```
pokemon/
  lib/meta/
    pve.js        ← + ROCKET_SPAM_TURNS + rocketSpam(moveIds, movesById)  [Task 1]
    pvp.js        ← evalMon expõe `moveset` (recomendado) em pvpMeta[lg]   [Task 5]
  lib/
    analysis.js   ← + e.isRocketReady + e.eliteMoves; tag 'rocket'; count rocket;
                    computeAction reestruturado (AGUARDAR_ROCKET/EVENTO, TROCAR)  [Tasks 2,6,7,8,9]
    render.js     ← + selo 🚀; ícone da linha de ação por kind (🚀/🗓️/🔁/⚔️)  [Tasks 4,9]
  app.js          ← loadMeta carrega moves.json → meta.moves; chip 🚀 Rocket  [Task 3]
  index.html      ← CSS .b-rocket  [Task 10]
  sw.js           ← bump v10 → v11  [Task 10]
  test/
    pve.test.js      ← + rocketSpam  [Task 1]
    pvp.test.js      ← + moveset exposto no evalMon  [Task 5]
    enrich.test.js   ← + e.isRocketReady/tag rocket (com meta) + não-regressão (sem meta.moves)  [Task 2]
    counts.test.js   ← + contagem rocket  [Task 2]
    verdict.test.js  ← + AGUARDAR_ROCKET, AGUARDAR_EVENTO, TROCAR (unit + via analyze)  [Tasks 6,7,8,9]
    render.test.js   ← + selo 🚀 + ícone de ação por kind  [Tasks 4,9]
```

## Contrato de dados (o que muda)

```jsonc
// meta (runtime) — NOVO campo: moves (o moves.json inteiro, chaveado por moveId)
meta = { speciesIndex, movesPt, pvpRanks, cpm, pveRanks, moves /* NOVO */ }

// pvpMeta[lg] (saída de pvp.evalMon) — NOVO campo aditivo: moveset (recomendado) | null
out.great = { isMeta, speciesRank, ivRank, spPct, movesetOk, moveset: ['COUNTER','ICE_PUNCH', ...] | null }

// e (mon enriquecido) — NOVOS campos
e.isRocketReady = true|false          // moveset de spam (Task 2)
e.eliteMoves    = ['KARATE_CHOP', ...]// golpes legado/Elite TM da espécie, do species.json (Task 6)
// e.tags pode incluir (aditivo): 'rocket'
// e.action pode ser { kind:'AGUARDAR_ROCKET'|'AGUARDAR_EVENTO'|'TROCAR', reason, ... }
```

---

### Task 1: `pve.js` — `ROCKET_SPAM_TURNS` + `rocketSpam` (TDD)

Função pura: o mon tem moveset de *spam*? Olha os `moveIds` do mon em `movesById` (= `moves.json`), usando stats **PvP**.

**Files:**
- Modify: `pokemon/lib/meta/pve.js`
- Test: `pokemon/test/pve.test.js`

- [ ] **Step 1: Adicionar o teste que falha** (append em `pokemon/test/pve.test.js`)

```js
const { rocketSpam, ROCKET_SPAM_TURNS } = require('../lib/meta/pve.js');

// movesById sintético: rápido forte (4 energia/turno) + carregado barato (35) e caro (60).
const rkMoves = {
  MUD_SHOT:    { type: 'ground', kind: 'fast',   pvp: { power: 3,  energy: 4 } },
  WEAK_FAST:   { type: 'normal', kind: 'fast',   pvp: { power: 5,  energy: 2 } },
  CHEAP_CHG:   { type: 'rock',   kind: 'charge', pvp: { power: 50, energy: 35 } },
  PRICEY_CHG:  { type: 'rock',   kind: 'charge', pvp: { power: 110,energy: 60 } },
};

test('rocketSpam: rápido forte + carregado barato → true (35/4 = 8.75 <= 12)', () => {
  assert.strictEqual(rocketSpam(['MUD_SHOT', 'CHEAP_CHG'], rkMoves), true);
});

test('rocketSpam: rápido fraco + carregado caro → false (60/2 = 30 > 12)', () => {
  assert.strictEqual(rocketSpam(['WEAK_FAST', 'PRICEY_CHG'], rkMoves), false);
});

test('rocketSpam: usa o carregado MAIS BARATO e o rápido MAIS FORTE disponíveis', () => {
  // tem os dois carregados; o barato (35) manda → 35/4 = 8.75 <= 12 → true
  assert.strictEqual(rocketSpam(['MUD_SHOT', 'CHEAP_CHG', 'PRICEY_CHG'], rkMoves), true);
});

test('rocketSpam: degrada gracioso (sem moves, sem movesById, só rápido, id desconhecido)', () => {
  assert.strictEqual(rocketSpam([], rkMoves), false);
  assert.strictEqual(rocketSpam(['MUD_SHOT'], null), false);
  assert.strictEqual(rocketSpam(['MUD_SHOT'], rkMoves), false);        // sem carregado
  assert.strictEqual(rocketSpam(['CHEAP_CHG'], rkMoves), false);       // sem rápido
  assert.strictEqual(rocketSpam(['ZZZ_UNKNOWN'], rkMoves), false);     // id fora do movesById
});

test('ROCKET_SPAM_TURNS é o limiar configurável (padrão 12)', () => {
  assert.strictEqual(ROCKET_SPAM_TURNS, 12);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: FAIL — `rocketSpam is not a function`.

- [ ] **Step 3: Implementação** (em `pokemon/lib/meta/pve.js`, adicionar antes do `return`)

```js
  // Tag 'rocket' (spec §8): moveset de spam — rápido que gera energia rápido + carregado barato.
  // Batalhas Rocket usam a mecânica de batalha de treinador (PvP) → usa stats pvp dos golpes.
  // turnosParaCarregar = custo do carregado mais barato / energia-por-turno do rápido mais forte.
  function rocketSpam(moveIds, movesById) {
    if (!moveIds || !moveIds.length || !movesById) return false;
    var fastEnergy = 0, cheapestCharged = Infinity;
    for (var i = 0; i < moveIds.length; i++) {
      var m = movesById[moveIds[i]];
      if (!m || !m.pvp) continue;
      if (m.kind === 'fast') {
        if (m.pvp.energy > fastEnergy) fastEnergy = m.pvp.energy;
      } else if (m.kind === 'charge') {
        if (m.pvp.energy > 0 && m.pvp.energy < cheapestCharged) cheapestCharged = m.pvp.energy;
      }
    }
    if (!(fastEnergy > 0) || cheapestCharged === Infinity) return false;
    return (cheapestCharged / fastEnergy) <= ROCKET_SPAM_TURNS;
  }
```

3b. Adicionar a constante `ROCKET_SPAM_TURNS` na linha das outras constantes (logo após `GYM_DEF_IV_MIN = 13;`):

```js
  var RAID_TOP = 10, PVE_TOP = 35, GYM_ATK_TOP = 20, GYM_ATK_COVERAGE_MIN = 3,
      GYM_DEF_TOP = 50, GYM_DEF_IV_MIN = 13, ROCKET_SPAM_TURNS = 12;
```

3c. Acrescentar `ROCKET_SPAM_TURNS` e `rocketSpam` ao objeto do `return`:

```js
  return { PVE, RAID_TOP, PVE_TOP, GYM_ATK_TOP, GYM_ATK_COVERAGE_MIN, GYM_DEF_TOP, GYM_DEF_IV_MIN, ROCKET_SPAM_TURNS,
           effAtk, effDef, effHp, dmgPerHit, cycleDps, tdoFor, erFor, bestMoveset,
           defBulk, evalMon, pveTags, rocketSpam };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pve.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pve.js pokemon/test/pve.test.js
git commit -m "fase3: pve.js rocketSpam (heurística de moveset de spam, PvP)"
```

---

### Task 2: `analysis.js` — `e.isRocketReady` + tag `rocket` + contagem (TDD)

Cabeia `rocketSpam` no runtime (precisa de `meta.moves`), deriva a tag `rocket` e conta. Tudo aditivo: sem `meta.moves`, fica `false`/sem tag.

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/enrich.test.js`, `pokemon/test/counts.test.js`

- [ ] **Step 1: Adicionar os testes que falham**

1a. Em `pokemon/test/enrich.test.js` (append):

```js
// --- Fase 3: tag rocket (moveset de spam, runtime via meta.moves) ---
const { buildSpeciesIndex } = require('../lib/meta/match.js');

function metaRocket() {
  return {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'tiro de lama': 'MUD_SHOT', 'borda rochosa': 'ROCK_SLIDE' },
    moves: {
      MUD_SHOT:   { type: 'ground', kind: 'fast',   pvp: { power: 3,  energy: 4 } },
      ROCK_SLIDE: { type: 'rock',   kind: 'charge', pvp: { power: 75, energy: 45 } }, // 45/4 = 11.25 <= 12
    },
  };
}

test('analyze: mon com moveset de spam recebe e.isRocketReady=true e tag rocket', () => {
  // Golem #76: Tiro de Lama + Borda Rochosa
  const fd = { r: { mon_name:'Golem', mon_number:76, mon_cp:2000, mon_attack:10, mon_defence:10, mon_stamina:10,
                    mon_height:1.4, mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Tiro de Lama', mon_move_2:'Borda Rochosa' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, metaRocket())[0];
  assert.strictEqual(e.isRocketReady, true);
  assert.ok(e.tags.includes('rocket'));
});

test('analyze: sem meta.moves → isRocketReady=false e sem tag rocket (não-regressão)', () => {
  const fd = { r: { mon_name:'Golem', mon_number:76, mon_cp:2000, mon_attack:10, mon_defence:10, mon_stamina:10,
                    mon_height:1.4, mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Tiro de Lama', mon_move_2:'Borda Rochosa' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar)[0]; // sem meta
  assert.strictEqual(e.isRocketReady, false);
  assert.ok(!e.tags.includes('rocket'));
});
```

> Se `enrich.test.js` ainda não importar `getPokemonSizeScalar`/`analyze`/`refdata`, reuse os `require` já presentes no topo do arquivo (mesmos das outras suites). Não duplique imports.

1b. Em `pokemon/test/counts.test.js` (append, reusando os `require` já no topo):

```js
test('contagens incluem rocket', () => {
  const meta = {
    speciesIndex: buildSpeciesIndex(speciesJson), movesPt: { 'tiro de lama':'MUD_SHOT', 'borda rochosa':'ROCK_SLIDE' },
    moves: { MUD_SHOT:{ type:'ground', kind:'fast', pvp:{power:3,energy:4} },
             ROCK_SLIDE:{ type:'rock', kind:'charge', pvp:{power:75,energy:45} } },
  };
  const fd = { z: { mon_name:'Golem', mon_number:76, mon_cp:2000, mon_attack:10, mon_defence:10, mon_stamina:10,
                    mon_height:1.4, mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Tiro de Lama', mon_move_2:'Borda Rochosa' } };
  const c = computeCounts(analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta));
  assert.ok('rocket' in c);
  assert.strictEqual(c.rocket, 1);
});

test('contagens sem meta: rocket fica 0 (não-regressão)', () => {
  const c = computeCounts(analyze(fd, getPokemonSize, refdata)); // fd do topo do arquivo
  assert.strictEqual(c.rocket, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/enrich.test.js test/counts.test.js`
Expected: FAIL — `e.isRocketReady` é `undefined` / `c.rocket` é `undefined`.

- [ ] **Step 3: Implementação** (em `pokemon/lib/analysis.js`)

3a. Em `enrichOne`, no objeto retornado, adicionar o campo default (junto dos outros "preenchidos por analyze", ex.: após `pveMeta: null,`):

```js
      isRocketReady: false,
```

3b. Em `analyze`, dentro do loop, após `e.pveMeta = ...`, calcular o spam:

```js
      e.isRocketReady = (meta && meta.moves && PokePve)
        ? PokePve.rocketSpam(e.moveIds, meta.moves) : false;
```

3c. Em `computeTags`, adicionar a tag (após o bloco `pveTags`):

```js
    if (e.isRocketReady) tags.push('rocket');
```

3d. Em `computeCounts`, adicionar `rocket: 0` ao objeto `c` inicial (junto de `raid:0, pve:0, gymAtk:0, gymDef:0`) e incrementar no loop (junto dos `if (e.tags.includes('raid'))...`):

```js
      if (e.tags.includes('rocket')) c.rocket++;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/enrich.test.js test/counts.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/enrich.test.js pokemon/test/counts.test.js
git commit -m "fase3: analysis cabeia tag rocket (e.isRocketReady) + contagem"
```

---

### Task 3: `app.js` — carregar `moves.json` no runtime + chip 🚀 Rocket

O runtime ainda não baixa `moves.json` (só o build usa). Carrega e passa como `meta.moves`; adiciona o chip. (Sem teste unitário — `app.js` é wiring de DOM/fetch; a lógica já está coberta nas Tasks 1–2. Verificação manual na Task 11.)

**Files:**
- Modify: `pokemon/app.js`

- [ ] **Step 1: `loadMeta` baixa `moves.json`** — em `pokemon/app.js`, no `Promise.all` dentro de `loadMeta`, adicionar o fetch e desestruturar:

```js
      const [species, movesPt, pvpRanks, cpm, pveRanks, moves] = await Promise.all([
        fetch('./data/species.json').then(r => r.ok ? r.json() : null),
        fetch('./data/moves_pt.json').then(r => r.ok ? r.json() : null),
        fetch('./data/pvp_ranks.json').then(r => r.ok ? r.json() : null),
        fetch('./data/cpm.json').then(r => r.ok ? r.json() : null),
        fetch('./data/pve_ranks.json').then(r => r.ok ? r.json() : null),
        fetch('./data/moves.json').then(r => r.ok ? r.json() : null),
      ]);
      if (!species || !movesPt) return null;
      return { speciesIndex: buildSpeciesIndex(species), movesPt,
               pvpRanks: pvpRanks || null, cpm: cpm || null, pveRanks: pveRanks || null, moves: moves || null };
```

- [ ] **Step 2: Chip 🚀 Rocket** — no array `defs` de `renderChips`, adicionar após a linha do `gym_def`:

```js
      ['rocket',  '🚀 Rocket ' + c.rocket,    e => e.tags.includes('rocket')],
```

- [ ] **Step 3: Sanidade rápida (Node, sem navegador)** — confirma que o caminho `analyze` com `meta.moves` produz a tag na coleção real:

```bash
cd pokemon && node -e "
const { getPokemonSize, getPokemonSizeScalar } = require('./sizes.js');
const refdata = require('./lib/refdata.js');
const { analyze, computeCounts } = require('./lib/analysis.js');
const { buildSpeciesIndex } = require('./lib/meta/match.js');
const meta = { speciesIndex: buildSpeciesIndex(require('./data/species.json')),
  movesPt: require('./data/moves_pt.json'), pvpRanks: require('./data/pvp_ranks.json'),
  cpm: require('./data/cpm.json'), pveRanks: require('./data/pve_ranks.json'), moves: require('./data/moves.json') };
const col = require('./colecao.json');
const c = computeCounts(analyze(col.fileData, getPokemonSize, refdata, getPokemonSizeScalar, meta));
console.log('rocket na coleção:', c.rocket, '/', c.total);
"
```
Expected: imprime um número de `rocket` plausível (>0 e bem menor que o total). Anote o valor para a Task 11.

- [ ] **Step 4: Commit**

```bash
git add pokemon/app.js
git commit -m "fase3: app carrega moves.json (meta.moves) + chip 🚀 Rocket"
```

---

### Task 4: `render.js` — selo 🚀 + CSS `.b-rocket` (TDD)

**Files:**
- Modify: `pokemon/lib/render.js`
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Adicionar o teste que falha** (append em `pokemon/test/render.test.js`, reusando o helper `pveStub`/`pvpStub` ou um stub mínimo)

```js
test('badgesHtml: selo 🚀 aparece com tag rocket', () => {
  const html = badgesHtml(pveStub({ tags: ['rocket'] }));
  assert.match(html, /🚀/);
});

test('badgesHtml: sem tag rocket → sem 🚀 (não-regressão)', () => {
  const html = badgesHtml(pveStub({ tags: [] }));
  assert.doesNotMatch(html, /🚀/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/render.test.js`
Expected: FAIL — não há `🚀` no HTML.

- [ ] **Step 3: Implementação** — em `pokemon/lib/render.js`, função `badgesHtml`, adicionar após a linha do `gym_def`:

```js
    if (e.tags.includes('rocket')) b.push('<span class="badge b-rocket">🚀</span>');
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/render.js pokemon/test/render.test.js
git commit -m "fase3: render selo 🚀 (tag rocket)"
```

---

### Task 5: `pvp.js` — expor o `moveset` recomendado em `pvpMeta[lg]` (TDD)

`AGUARDAR_EVENTO` (Task 7) precisa saber **qual** golpe recomendado falta e se é legado. Hoje `evalMon` só devolve `movesetOk` (booleano). Expõe a lista recomendada (`rankEntry.moveset`) — aditivo, não regride (os testes existentes checam props individuais, não a forma inteira).

**Files:**
- Modify: `pokemon/lib/meta/pvp.js`
- Test: `pokemon/test/pvp.test.js`

- [ ] **Step 1: Adicionar o teste que falha** (append em `pokemon/test/pvp.test.js`, reusando `metaObj()` do arquivo)

```js
test('evalMon: expõe o moveset recomendado da liga (great) e null fora do meta', () => {
  const e = { speciesId: 'azumarill', ivs: { atk: 0, def: 15, sta: 15 }, moveIds: ['BUBBLE','ICE_BEAM'] };
  const r = evalMon(e, metaObj());
  assert.ok(Array.isArray(r.great.moveset), 'great.moveset é array (espécie meta na Grande)');
  assert.ok(r.great.moveset.length >= 2);
  // liga em que a espécie não é meta → moveset null
  const offLeague = ['great','ultra','master'].find(lg => !r[lg].isMeta);
  if (offLeague) assert.strictEqual(r[offLeague].moveset, null);
});
```

> `metaObj()` em `pvp.test.js` usa `data/pvp_ranks.json` real; Azumarill é meta na Grande. Se o `speciesId`/liga mudar no dataset, ajuste o mon do teste para um que seja meta na Grande (qualquer entrada com `great` em `pvp_ranks.json`).

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: FAIL — `r.great.moveset` é `undefined`.

- [ ] **Step 3: Implementação** — em `pokemon/lib/meta/pvp.js`, função `evalMon`, nos **dois** ramos de `out[lg]`:

3a. No ramo "fora do meta" (`if (!rankEntry)`):

```js
        out[lg] = { isMeta: false, speciesRank: null, ivRank: null, spPct: null, movesetOk: false, moveset: null };
```

3b. No ramo meta (objeto após `var info = rankInfo(...)`), adicionar `moveset`:

```js
      out[lg] = {
        isMeta: true,
        speciesRank: rankEntry.rank,
        ivRank: info.ivRank,
        spPct: info.spPct,
        movesetOk: movesetOk(e.moveIds, rankEntry.moveset),
        moveset: rankEntry.moveset || null,
      };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/pvp.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pvp.js pokemon/test/pvp.test.js
git commit -m "fase3: pvp.evalMon expõe moveset recomendado por liga"
```

---

### Task 6: `analysis.js` — `e.eliteMoves` + ação `AGUARDAR_ROCKET` (TDD)

Anexa os `eliteMoves` da espécie ao mon (do `species.json`, p/ a Task 7) e adiciona a ação de maior prioridade: Sombrio meta com Frustração.

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pokemon/test/verdict.test.js`)

```js
// ---------------------------------------------------------------------------
// Fase 3 — AGUARDAR_ROCKET (Sombrio meta com Frustração)
// ---------------------------------------------------------------------------

function shadowFrustMon(over) {
  return Object.assign({
    isShadow: true, isShiny: false, ivPct: 90, betterCopy: null,
    moveIds: ['COUNTER', 'FRUSTRATION'], eliteMoves: [],
    tags: ['pvp_great'],
    pvpMeta: { great:  { isMeta: true, speciesRank: 5, ivRank: 1, spPct: 1, movesetOk: false, moveset: ['COUNTER','CLOSE_COMBAT'] },
               ultra:  { isMeta: false, moveset: null },
               master: { isMeta: false, moveset: null } },
    pveMeta: null,
  }, over || {});
}

test('computeAction: Sombrio meta com Frustração → AGUARDAR_ROCKET (pré-empta tudo)', () => {
  const a = computeAction(shadowFrustMon());
  assert.strictEqual(a.kind, 'AGUARDAR_ROCKET');
  assert.match(a.reason, /Rocket|Frustra/i);
});

test('computeAction: Sombrio meta SEM Frustração não vira AGUARDAR_ROCKET', () => {
  const a = computeAction(shadowFrustMon({ moveIds: ['COUNTER', 'CLOSE_COMBAT'] }));
  assert.notStrictEqual(a && a.kind, 'AGUARDAR_ROCKET'); // tem o moveset → FORTALECER
});

test('computeAction: NÃO-Sombrio com Frustração no moveId não vira AGUARDAR_ROCKET', () => {
  const a = computeAction(shadowFrustMon({ isShadow: false }));
  assert.notStrictEqual(a && a.kind, 'AGUARDAR_ROCKET');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/verdict.test.js`
Expected: FAIL — `computeAction` devolve `ENSINAR_TM` (não existe `AGUARDAR_ROCKET`).

- [ ] **Step 3: Implementação** (em `pokemon/lib/analysis.js`)

3a. Anexar `eliteMoves` ao mon — em `enrichOne`, junto de `speciesId`/`moveIds`, adicionar:

```js
      eliteMoves: (meta && meta.speciesIndex && meta.speciesIndex.byId && PokeMatch)
        ? (function () {
            var sid = (meta && meta.speciesIndex && PokeMatch) ? PokeMatch.matchSpecies(mon, meta.speciesIndex) : null;
            var sp = sid && meta.speciesIndex.byId[sid];
            return (sp && sp.eliteMoves) ? sp.eliteMoves : [];
          })()
        : [],
```

> Por que recalcular `sid` aqui: `speciesId` é definido no mesmo literal (ainda não disponível). Como em Fase 0 `matchSpecies` é barato e já é chamado para `speciesId`, repetir é aceitável. (Alternativa de refactor: extrair `sid` para uma `const` antes do `return` — mantenha o estilo do arquivo se preferir.)

3b. Adicionar os helpers e reescrever `computeAction`. Primeiro, os helpers (antes de `computeAction`):

```js
  // Sombrio com Frustração: o golpe Frustração só sai em evento Rocket (Charged TM especial).
  function _isShadowFrustration(e) {
    return !!(e.isShadow && (e.moveIds || []).indexOf('FRUSTRATION') >= 0);
  }
```

3c. Em `computeAction`, inserir o ramo de maior prioridade **no topo** da função (antes de `const lg = _bestPvpLeague(e);`):

```js
    // P1 (Fase 3): Sombrio meta com Frustração → aguardar evento Rocket (pré-empta Fortalecer).
    if ((isPvpMeta(e) || isPveMeta(e)) && _isShadowFrustration(e)) {
      return { kind: 'AGUARDAR_ROCKET',
        reason: 'Aguardar Rocket — Sombrio com Frustração; troque o golpe em evento (Charged TM)' };
    }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/verdict.test.js`
Expected: PASS (e os testes de Fase 1/2 continuam verdes — não-Sombrios não entram no ramo novo).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "fase3: e.eliteMoves + ação AGUARDAR_ROCKET (Sombrio+Frustração)"
```

---

### Task 7: `analysis.js` — ação `AGUARDAR_EVENTO` (golpe legado) (TDD)

Quando o moveset não está pronto (`movesetOk=false`) e o golpe recomendado que falta é **legado/Elite TM** (`eliteMoves`), rebaixa de `ENSINAR_TM` (INVESTIR) para `AGUARDAR_EVENTO` (MANTER). Vale para o gancho PvP (usa `pvpMeta[lg].moveset`) e PvE (usa `pveMeta.bestMoveset`).

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pokemon/test/verdict.test.js`)

```js
// ---------------------------------------------------------------------------
// Fase 3 — AGUARDAR_EVENTO (moveset ótimo exige golpe legado)
// ---------------------------------------------------------------------------

test('computeAction: PvP, falta golpe recomendado que é legado → AGUARDAR_EVENTO', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 95, betterCopy: null,
    moveIds: ['COUNTER'],                 // tem o rápido, falta o carregado
    eliteMoves: ['CLOSE_COMBAT'],         // o carregado recomendado é legado
    tags: ['pvp_great'],
    pvpMeta: { great:  { isMeta: true, speciesRank: 5, ivRank: 1, spPct: 1, movesetOk: false,
                         moveset: ['COUNTER', 'CLOSE_COMBAT'] },
               ultra:  { isMeta: false, moveset: null }, master: { isMeta: false, moveset: null } },
    pveMeta: null,
  };
  const a = computeAction(e);
  assert.strictEqual(a.kind, 'AGUARDAR_EVENTO');
  assert.match(a.reason, /legado|Evento|evento/);
});

test('computeAction: PvP, falta golpe recomendado que é TM normal → ENSINAR_TM (não evento)', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 95, betterCopy: null,
    moveIds: ['COUNTER'], eliteMoves: [],   // nada legado
    tags: ['pvp_great'],
    pvpMeta: { great:  { isMeta: true, speciesRank: 5, ivRank: 1, spPct: 1, movesetOk: false,
                         moveset: ['COUNTER', 'CLOSE_COMBAT'] },
               ultra:  { isMeta: false, moveset: null }, master: { isMeta: false, moveset: null } },
    pveMeta: null,
  };
  assert.strictEqual(computeAction(e).kind, 'ENSINAR_TM');
});

test('computeAction: PvE raid, bestMoveset exige golpe legado que falta → AGUARDAR_EVENTO', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 90, betterCopy: null,
    moveIds: ['DRAGON_TAIL'], eliteMoves: ['OUTRAGE'],
    tags: ['raid','pve'], pvpMeta: null,
    pveMeta: { raid: true, pve: true, gymAtk: false, gymDef: false, bestType: 'dragon',
               bestMoveset: ['DRAGON_TAIL','OUTRAGE'], movesetOk: false,
               byType: { dragon: { dps: 18, er: 50, dpsRank: 2, erRank: 3 } } },
  };
  assert.strictEqual(computeAction(e).kind, 'AGUARDAR_EVENTO');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/verdict.test.js`
Expected: FAIL — devolve `ENSINAR_TM` onde deveria devolver `AGUARDAR_EVENTO`.

- [ ] **Step 3: Implementação** (em `pokemon/lib/analysis.js`)

3a. Adicionar os helpers (perto de `_isShadowFrustration`):

```js
  // Humaniza um moveId p/ exibição: 'CLOSE_COMBAT' → 'Close Combat'.
  function _humanMove(id) {
    return String(id || '').toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // Moveset recomendado do gancho ativo (PvP da melhor liga; senão PvE bestMoveset).
  function _recommendedMoveset(e) {
    const lg = _bestPvpLeague(e);
    if (lg && e.pvpMeta && e.pvpMeta[lg] && e.pvpMeta[lg].moveset) return e.pvpMeta[lg].moveset;
    if (e.pveMeta && e.pveMeta.bestMoveset) return e.pveMeta.bestMoveset;
    return null;
  }

  // 1º golpe recomendado que o mon NÃO tem E que é legado/Elite TM. null se não houver.
  function _missingLegacyMove(e) {
    const rec = _recommendedMoveset(e);
    if (!rec || !rec.length) return null;
    const mine = e.moveIds || [];
    const elite = e.eliteMoves || [];
    for (let i = 0; i < rec.length; i++) {
      if (mine.indexOf(rec[i]) < 0 && elite.indexOf(rec[i]) >= 0) return rec[i];
    }
    return null;
  }

  // Ação quando o moveset NÃO está pronto: AGUARDAR_EVENTO (golpe legado falta) senão ENSINAR_TM.
  function _notReadyAction(e, ensinarReason) {
    const leg = _missingLegacyMove(e);
    if (leg) {
      return { kind: 'AGUARDAR_EVENTO', legacyMove: leg,
        reason: 'Aguardar Evento — moveset ótimo precisa do golpe legado "' + _humanMove(leg) +
                '"; espere Dia Comunitário / Elite TM' };
    }
    return { kind: 'ENSINAR_TM', reason: ensinarReason };
  }
```

3b. Trocar os dois pontos onde hoje se devolve `ENSINAR_TM` direto por `_notReadyAction(...)`:

No ramo PvP de `computeAction` (substituir o `return { kind: 'ENSINAR_TM', league: lg, ... }`):

```js
    return _notReadyAction(e,
      'Ensinar/TM p/ ' + ligaPt + ' — Top ' + L.speciesRank + ', falta o moveset recomendado');
```

Em `_pveAction` (substituir o `return { kind: 'ENSINAR_TM', role: role, ... }`):

```js
    return _notReadyAction(e,
      'Ensinar/TM p/ ' + papel + ' (' + tipo + ') — falta o moveset de ataque recomendado');
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/verdict.test.js`
Expected: PASS. (Os testes Fase 1/2 de `ENSINAR_TM` continuam verdes: seus stubs têm `eliteMoves` ausente/`[]` e `moveset` ausente → `_missingLegacyMove` devolve null → cai em `ENSINAR_TM`.)

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "fase3: ação AGUARDAR_EVENTO (golpe legado em eliteMoves)"
```

---

### Task 8: `analysis.js` — ação `TROCAR` (reroll / lucky) (TDD)

Última prioridade: duplicata pior (`e.betterCopy`) que é shiny (lucky trade) **ou** espécie meta com IV baixo (reroll). Exigir `betterCopy` garante não-regressão dos stubs sem duplicata.

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Adicionar os testes que falham** (append em `pokemon/test/verdict.test.js`)

```js
// ---------------------------------------------------------------------------
// Fase 3 — TROCAR (reroll de IV meta / shiny duplicado p/ Lucky)
// ---------------------------------------------------------------------------

test('computeAction: duplicata pior meta com IV baixo → TROCAR (reroll)', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 60, betterCopy: { id: 'best' },
    moveIds: ['BUBBLE'], eliteMoves: [], tags: ['pve'], pvpMeta: null,
    pveMeta: { raid: false, pve: true, gymAtk: false, gymDef: false, movesetOk: false, bestMoveset: null, byType: {} },
  };
  const a = computeAction(e);
  assert.strictEqual(a.kind, 'TROCAR');
  assert.match(a.reason, /reroll|IV/i);
});

test('computeAction: shiny duplicado (pior) → TROCAR (lucky), mesmo sem meta', () => {
  const e = {
    isShadow: false, isShiny: true, ivPct: 70, betterCopy: { id: 'best' },
    moveIds: [], eliteMoves: [], tags: [], pvpMeta: null, pveMeta: null,
  };
  const a = computeAction(e);
  assert.strictEqual(a.kind, 'TROCAR');
  assert.match(a.reason, /[Ll]ucky|shiny/);
});

test('computeAction: meta IV baixo mas é a MELHOR cópia (sem betterCopy) → não TROCAR', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 60, betterCopy: null,
    moveIds: ['BUBBLE'], eliteMoves: [], tags: ['pve'], pvpMeta: null,
    pveMeta: { raid: false, pve: true, gymAtk: false, gymDef: false, movesetOk: false, bestMoveset: null, byType: {} },
  };
  assert.strictEqual(computeAction(e), null); // sem gancho de ação → null (motivo atual mantém)
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/verdict.test.js`
Expected: FAIL — devolve `null` onde deveria devolver `TROCAR`.

- [ ] **Step 3: Implementação** (em `pokemon/lib/analysis.js`)

3a. Helper (perto dos outros de Fase 3):

```js
  // Trocar/Reroll: só faz sentido em duplicata pior (você tem uma cópia melhor da espécie).
  function _trocaAction(e) {
    if (!e.betterCopy) return null;
    if (e.isShiny) {
      return { kind: 'TROCAR', reason: 'Trocar shiny duplicado p/ Lucky (Melhor Amigo)' };
    }
    if ((isPvpMeta(e) || isPveMeta(e)) && e.ivPct < 80) {
      return { kind: 'TROCAR',
        reason: 'Trocar p/ reroll de IV — espécie meta, cópia fraca (IV ' + e.ivPct + '%)' };
    }
    return null;
  }
```

3b. No fim de `computeAction`, onde hoje cai em `_pveAction(e)` quando não há liga PvP, garantir que `TROCAR` seja o **último** recurso. Reescrever o fluxo final de `computeAction` para:

```js
  function computeAction(e) {
    // P1 (Fase 3): Sombrio meta com Frustração → aguardar evento Rocket (pré-empta Fortalecer).
    if ((isPvpMeta(e) || isPveMeta(e)) && _isShadowFrustration(e)) {
      return { kind: 'AGUARDAR_ROCKET',
        reason: 'Aguardar Rocket — Sombrio com Frustração; troque o golpe em evento (Charged TM)' };
    }
    // P2–P4: gancho de moveset (PvP tem prioridade; senão PvE) → Fortalecer / Aguardar Evento / Ensinar-TM.
    const lg = _bestPvpLeague(e);
    if (lg && e.pvpMeta) {
      const L = e.pvpMeta[lg];
      const ligaPt = LEAGUE_PT[lg];
      const ivInfo = 'IV PvP ' + Math.round(L.spPct * 100) + '% (rank ' + L.ivRank + '/4096)';
      if (L.movesetOk) {
        return { kind: 'FORTALECER', league: lg,
          reason: 'Fortalecer p/ ' + ligaPt + ' — rank ' + L.speciesRank + ' da espécie, seu ' + ivInfo };
      }
      return _notReadyAction(e,
        'Ensinar/TM p/ ' + ligaPt + ' — Top ' + L.speciesRank + ', falta o moveset recomendado');
    }
    const pve = _pveAction(e);
    if (pve) return pve;
    // P5: Trocar/Reroll (duplicata pior: shiny lucky ou meta IV baixo).
    return _trocaAction(e);
  }
```

> Isso substitui o corpo atual de `computeAction` (o ramo `if (!lg || !e.pvpMeta) return _pveAction(e);` some — o novo fluxo já tenta PvE e depois TROCAR). `_pveAction` permanece como está (agora chamando `_notReadyAction`).

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/verdict.test.js`
Expected: PASS.

> **Atenção à não-regressão de um teste existente:** o teste `computeAction: só pve/gym_def (sem raid/gym_atk) → null` (Fase 2) passa um mon **sem `betterCopy`** → `_trocaAction` devolve null → `computeAction` devolve null. Continua verde. Se algum dia esse stub ganhar `betterCopy` + IV<80, ele passará a devolver `TROCAR` (comportamento correto da Fase 3).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "fase3: ação TROCAR (reroll meta / shiny duplicado p/ Lucky)"
```

---

### Task 9: `render.js` — ícone da linha de ação por `kind` + integração via `analyze` (TDD)

A linha de ação hoje é sempre prefixada por `⚔️`. Dá um ícone por tipo de ação (🚀 Rocket, 🗓️ Evento, 🔁 Trocar, ⚔️ combate) e cobre o fluxo ponta-a-ponta.

**Files:**
- Modify: `pokemon/lib/render.js`
- Test: `pokemon/test/render.test.js`, `pokemon/test/verdict.test.js`

- [ ] **Step 1: Adicionar os testes que falham**

1a. Em `pokemon/test/render.test.js` (append):

```js
test('cardHtml: ícone da ação por kind (🚀 AGUARDAR_ROCKET, 🗓️ AGUARDAR_EVENTO, 🔁 TROCAR)', () => {
  assert.match(cardHtml(pvpStub({ action: { kind:'AGUARDAR_ROCKET', reason:'Aguardar Rocket — x' } })), /🚀/);
  assert.match(cardHtml(pvpStub({ action: { kind:'AGUARDAR_EVENTO', reason:'Aguardar Evento — x' } })), /🗓️/);
  assert.match(cardHtml(pvpStub({ action: { kind:'TROCAR', reason:'Trocar — x' } })), /🔁/);
  // combate mantém ⚔️
  assert.match(cardHtml(pvpStub({ action: { kind:'FORTALECER', reason:'Fortalecer — x' } })), /⚔️/);
});
```

1b. Em `pokemon/test/verdict.test.js` (append) — fluxo via `analyze` com meta real, confirmando que um Sombrio com Frustração recebe `AGUARDAR_ROCKET` e veredito MANTER:

```js
test('analyze: Sombrio meta com Frustração → e.action AGUARDAR_ROCKET e veredito MANTER', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  const meta = {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'palmada':'COUNTER', 'frustracao':'FRUSTRATION', 'frustração':'FRUSTRATION' },
    pvpRanks: require('../data/pvp_ranks.json'), cpm: require('../data/cpm.json'),
    pveRanks: require('../data/pve_ranks.json'), moves: require('../data/moves.json'),
  };
  // Machamp #68 (atacante de raid/lutador meta). Sombrio + Frustração.
  const fd = { s: { mon_name:'Machamp', mon_number:68, mon_cp:2800, mon_attack:14, mon_defence:13, mon_stamina:14,
                    mon_height:1.6, mon_alignment:'SHADOW', mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Palmada', mon_move_2:'Frustração' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  if (e.pvpMeta || e.pveMeta) {                    // se Machamp casou como meta (esperado)
    assert.strictEqual(e.action && e.action.kind, 'AGUARDAR_ROCKET');
    assert.strictEqual(e.verdict, 'MANTER');        // protegido (Sombrio/meta), não INVESTIR/TRANSFERIR
  }
});
```

> O `if` torna o teste robusto a mudanças do dataset (se Machamp deixar de casar como meta, o teste não quebra falsamente). A intenção principal — AGUARDAR_ROCKET → MANTER — é verificada quando há meta.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd pokemon && node --test test/render.test.js test/verdict.test.js`
Expected: FAIL — falta o ícone 🚀/🗓️/🔁 na linha de ação.

- [ ] **Step 3: Implementação** — em `pokemon/lib/render.js`:

3a. Adicionar o mapa de ícones (perto do topo do `factory`, junto de `VERDICT_LABEL`):

```js
  const ACTION_ICON = { FORTALECER:'⚔️', ENSINAR_TM:'⚔️', AGUARDAR_ROCKET:'🚀', AGUARDAR_EVENTO:'🗓️', TROCAR:'🔁' };
```

3b. Em `cardHtml`, trocar a linha da ação (hoje `'<div class="pk-action">⚔️ ' + esc(e.action.reason) + '</div>'`) por:

```js
        (e.action ? '<div class="pk-action">' + (ACTION_ICON[e.action.kind] || '⚔️') + ' ' + esc(e.action.reason) + '</div>' : '') +
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd pokemon && node --test test/render.test.js test/verdict.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/render.js pokemon/test/render.test.js pokemon/test/verdict.test.js
git commit -m "fase3: render ícone de ação por kind + e2e AGUARDAR_ROCKET via analyze"
```

---

### Task 10: `index.html` (CSS) + `sw.js` (bump v11)

**Files:**
- Modify: `pokemon/index.html`, `pokemon/sw.js`

- [ ] **Step 1: CSS `.b-rocket`** — em `pokemon/index.html`, junto das outras regras de badge (perto de `.b-pve`/`.b-gymdef`), adicionar:

```css
.b-rocket { background:rgba(123,97,255,.2); color:#b9a7ff; }
```

> `moves.json` já está nos `ASSETS` do service worker (Fase 2) e o `<script src="./lib/meta/pve.js">` já é carregado antes de `analysis.js` — nada a mudar em `index.html` além do CSS.

- [ ] **Step 2: Bump do service worker** — em `pokemon/sw.js`, linha 1:

```js
const CACHE = 'pokemon-leo-v11';
```

- [ ] **Step 3: Conferir que nada mais precisa entrar nos ASSETS** — `moves.json` já consta; nenhum arquivo novo foi criado nesta fase (só edições). Sem mudança no array `ASSETS`.

- [ ] **Step 4: Commit**

```bash
git add pokemon/index.html pokemon/sw.js
git commit -m "fase3: CSS .b-rocket + sw v10→v11"
```

---

### Task 11: Verificação ponta-a-ponta na coleção real (sem TDD — verificação)

Roda a suíte inteira e analisa a coleção real para conferir contagens plausíveis e ausência de regressão.

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte completa verde**

Run: `cd pokemon && node --test`
Expected: 0 falhas. Anote o total de testes (deve ser ≥ os 143 da Fase 2 + os novos).

- [ ] **Step 2: Análise da coleção real (contagens + amostras)**

Run:
```bash
cd pokemon && node -e "
const { getPokemonSize, getPokemonSizeScalar } = require('./sizes.js');
const refdata = require('./lib/refdata.js');
const { analyze, computeCounts } = require('./lib/analysis.js');
const { buildSpeciesIndex } = require('./lib/meta/match.js');
const meta = { speciesIndex: buildSpeciesIndex(require('./data/species.json')),
  movesPt: require('./data/moves_pt.json'), pvpRanks: require('./data/pvp_ranks.json'),
  cpm: require('./data/cpm.json'), pveRanks: require('./data/pve_ranks.json'), moves: require('./data/moves.json') };
const col = require('./colecao.json');
const t0 = Date.now();
const list = analyze(col.fileData, getPokemonSize, refdata, getPokemonSizeScalar, meta);
const c = computeCounts(list);
console.log('analyze:', (Date.now()-t0)+'ms', '| total', c.total);
console.log('rocket:', c.rocket, '| raid:', c.raid, '| pve:', c.pve, '| gymDef:', c.gymDef);
const by = {};
for (const e of list) if (e.action) by[e.action.kind] = (by[e.action.kind]||0)+1;
console.log('ações:', JSON.stringify(by));
// invariante crítico do spec (§12.2): nenhum mon meta vai p/ TRANSFERIR
const leak = list.filter(e => e.verdict==='TRANSFERIR' && (e.pvpMeta||e.pveMeta) &&
  (require('./lib/analysis.js').isPvpMeta(e) || require('./lib/analysis.js').isPveMeta(e)));
console.log('meta em TRANSFERIR (deve ser 0):', leak.length);
// amostra de cada ação nova
for (const k of ['AGUARDAR_ROCKET','AGUARDAR_EVENTO','TROCAR']) {
  const ex = list.find(e => e.action && e.action.kind===k);
  console.log(k, '→', ex ? (ex.name+': '+ex.action.reason) : '(nenhum na coleção)');
}
"
```
Expected:
- `analyze` roda rápido (dezenas a centenas de ms; sem regressão de perf).
- `rocket` > 0 e bem menor que o total (é um subconjunto de spam).
- `meta em TRANSFERIR (deve ser 0): 0` — invariante do spec preservado.
- As ações novas aparecem (ou "(nenhum na coleção)", o que é aceitável se a coleção não tiver o caso — o mecanismo está testado por unidade).

> Se `meta em TRANSFERIR` > 0, é regressão — pare e investigue `isProtected`/`computeVerdict` antes de seguir.

- [ ] **Step 3: (Opcional) abrir no navegador** — servir e conferir os chips/selos visualmente:

```bash
cd pokemon && python -m http.server 8000
```
Abrir `http://localhost:8000/` e confirmar: chip `🚀 Rocket N`, selos 🚀 nos cards, e a linha de ação com ícones 🚀/🗓️/🔁 onde aplicável. Forçar atualização do SW (recarregar) por causa do bump v11.

- [ ] **Step 4: Sem commit** (só verificação). Se algum ajuste fino for necessário, faça em um commit `fase3: ajuste …` dedicado.

---

### Task 12: Atualizar a memória do projeto

**Files:**
- Modify: `C:\Users\leona\.claude\projects\I--Meu-Drive-Site-moreno-arquitetura\memory\pokemon-meta-competitivo.md` (e a linha no `MEMORY.md` se necessário).

- [ ] **Step 1: Registrar a Fase 3 concluída** — adicionar um parágrafo "**Fase 3 (Rocket + ações Aguardar/Trocar) — IMPLEMENTADA**" resumindo: tag `rocket` (heurística PvP `rocketSpam`, `ROCKET_SPAM_TURNS=12`), `meta.moves` agora carregado no runtime, ações `AGUARDAR_ROCKET`/`AGUARDAR_EVENTO`/`TROCAR` com a prioridade adotada (decisão de design do conflito §9), selo 🚀 + chip 🚀 Rocket + ícones de ação, sw v11. Atualizar a frase de pendências para deixar só a **Fase 4** (polimento: limiares, ordenação por rank, bônus Sombrio no DPS, formas não-obtíveis, textos, `TYPE_PT` duplicado entre analysis.js/render.js, desempate dos sorts de ranking). Citar o número do PR quando aberto.

- [ ] **Step 2: Commit** (no repo, o doc de memória é fora do repo — não commitar; só salvar o arquivo).

---

## Auto-revisão (writing-plans)

**1. Cobertura do spec (§8 tag rocket; §9 ações; §10 UI; §11 Fase 3):**
- tag `rocket` (§8): Tasks 1–4 (motor, wiring, chip, selo). ✓
- Aguardar Rocket (§9): Task 6. ✓
- Aguardar Evento (§9): Task 7 (usa `eliteMoves` como proxy de "golpe legado"). ✓
- Trocar/Reroll (§9): Task 8. ✓
- UI — chip 🚀, selo 🚀, ícones de ação (§10): Tasks 3, 4, 9, 10. ✓
- Não-regressão / mon sem meta degrada (§3/§9): testes "sem meta.moves" e exigência de `betterCopy`/dados em cada ação. ✓
- Invariante "meta nunca Transferir" (§12.2): verificado na Task 11. ✓

**2. Placeholders:** nenhum "TBD"/"etc." em passos de código; todo passo de código tem o código real. ✓

**3. Consistência de tipos/nomes:** `rocketSpam(moveIds, movesById)` (Task 1) usado em analysis com `meta.moves` (Task 2) e carregado em `app.js` como `moves` (Task 3) — mesmo nome. `kind`s: `AGUARDAR_ROCKET`/`AGUARDAR_EVENTO`/`TROCAR` idênticos entre analysis (Tasks 6–8) e o `ACTION_ICON` do render (Task 9). `pvpMeta[lg].moveset` exposto na Task 5 e consumido por `_recommendedMoveset` na Task 7. `e.eliteMoves` anexado na Task 6 e lido na Task 7. ✓

**Decisão registrada:** a prioridade das ações resolve o conflito interno do spec §9 (lista numerada × tabela) a favor da tabela; documentada no topo deste plano para revisão.
