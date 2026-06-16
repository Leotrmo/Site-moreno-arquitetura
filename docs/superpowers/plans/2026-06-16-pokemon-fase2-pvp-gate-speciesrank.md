# Fase 2 — Gate por `speciesRank` + entrada `_shadow` no PvP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matar o falso positivo PvP (Gyarados 100% em Liga Mestre) gateando as tags PvP por `speciesRank` e fazendo o `evalMon` do PvP preferir a entrada `_shadow` para Sombrios.

**Architecture:** Duas mudanças cirúrgicas em `pokemon/lib/meta/pvp.js` (módulo dual browser+Node), guiadas por testes em `pokemon/test/pvp.test.js`. Nenhum encanamento novo — `speciesRank` já vive em `pvp[lg].speciesRank`. `analysis.js` autocorrige sem edição. Housekeeping: bump do Service Worker e comentário de calibração.

**Tech Stack:** Vanilla JS (sem build), testes com `node:test` (`node --test`), rodados de dentro de `pokemon/`.

**Spec:** [docs/superpowers/specs/2026-06-16-pokemon-fase2-pvp-gate-speciesrank-design.md](../specs/2026-06-16-pokemon-fase2-pvp-gate-speciesrank-design.md)

---

## File Structure

| Arquivo | Mudança | Responsabilidade |
|---|---|---|
| `pokemon/lib/meta/pvp.js` | Modificar `evalMon` (~L107) e `pvpTags`/`THRESHOLDS` (L13-17, L133-144) | Avaliação PvP + tags |
| `pokemon/test/pvp.test.js` | Adicionar/atualizar testes | Cobertura das duas mudanças |
| `pokemon/sw.js` | Bump `CACHE` L1 `v18 → v19` | Invalidar cache do asset alterado |

**Premissa de ambiente:** todos os comandos rodam de dentro de `pokemon/`. O harness de teste `metaObj()` (já existe em `test/pvp.test.js:83`) liga `species.json` + `pvp_ranks.json` + `cpm.json`. Valores de fixture confirmados: `gyarados` master rank **57**, `gyarados_shadow` master rank **32** com moveset `["DRAGON_BREATH","AQUA_TAIL","TWISTER"]`, `azumarill` great rank **13** (sem entrada `_shadow`).

---

## Task 1: `evalMon` prefere a entrada `_shadow` (Mudança 1)

**Files:**
- Modify: `pokemon/lib/meta/pvp.js:107`
- Test: `pokemon/test/pvp.test.js` (adicionar após o teste da linha 144)

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `pokemon/test/pvp.test.js` (logo após o teste `evalMon: expõe o moveset recomendado...`, antes do `const { THRESHOLDS } = ...`):

```js
test('evalMon: Sombrio com entrada _shadow lê o rank/moveset da forma Sombria', () => {
  // Gyarados Sombrio 15/15/15: deve ler gyarados_shadow (master rank 32), não gyarados (57).
  const e = { speciesId: 'gyarados', isShadow: true, ivs: { atk: 15, def: 15, sta: 15 },
              moveIds: ['DRAGON_BREATH', 'AQUA_TAIL', 'TWISTER'] };
  const r = evalMon(e, metaObj());
  assert.strictEqual(r.master.speciesRank, pvpRanks.gyarados_shadow.master.rank); // 32, não 57
  assert.notStrictEqual(r.master.speciesRank, pvpRanks.gyarados.master.rank);     // != 57
  assert.deepStrictEqual(r.master.moveset, pvpRanks.gyarados_shadow.master.moveset);
  assert.strictEqual(r.master.movesetOk, true);  // tem o set Sombrio de Mestre
});

test('evalMon: Sombrio SEM entrada _shadow degrada para o rank base', () => {
  // azumarill não tem azumarill_shadow → mesmo Sombrio, lê a base.
  const e = { speciesId: 'azumarill', isShadow: true, ivs: { atk: 0, def: 15, sta: 15 }, moveIds: [] };
  const r = evalMon(e, metaObj());
  assert.strictEqual(r.great.speciesRank, pvpRanks.azumarill.great.rank); // 13 (base)
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/pvp.test.js`
Expected: FAIL no primeiro teste novo — `r.master.speciesRank` é `57` (lê a base `gyarados`), esperado `32`. O teste de fallback passa (já lê a base).

- [ ] **Step 3: Implementar a preferência por `_shadow`**

Em `pokemon/lib/meta/pvp.js`, substituir a linha 107:

```js
    var ranks = meta.pvpRanks[e.speciesId] || {};
```

por:

```js
    // Sombrio prefere a entrada _shadow (rank/moveset PvP da forma Sombria); degrada p/ a base
    // se não existir. baseStats continua da espécie base — Sombrio não muda o rank de IV.
    var pvpId = (e.isShadow && meta.pvpRanks[e.speciesId + '_shadow'])
      ? e.speciesId + '_shadow' : e.speciesId;
    var ranks = meta.pvpRanks[pvpId] || {};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/pvp.test.js`
Expected: PASS — ambos os testes novos verdes; nenhum teste antigo quebrado.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pvp.js pokemon/test/pvp.test.js
git commit -m "feat(pokemon): evalMon do PvP prefere a entrada _shadow para Sombrios"
```

---

## Task 2: `speciesRank` vira porta em `pvpTags`/`THRESHOLDS` (Mudança 2)

**Files:**
- Modify: `pokemon/lib/meta/pvp.js:10-17` (comentário + `THRESHOLDS`) e `pokemon/lib/meta/pvp.js:133-144` (`pvpTags`)
- Test: `pokemon/test/pvp.test.js:124-134` (atualizar) + novo teste

- [ ] **Step 1: Atualizar o teste existente e escrever o teste que falha**

Substituir o teste inteiro de `pvpTags` em `pokemon/test/pvp.test.js:124-134` por:

```js
test('pvpTags: aplica THRESHOLDS (great por spPct/ivRank + speciesRank; master por ivPct + speciesRank)', () => {
  // pvp sintético — agora com speciesRank em cada liga (gate novo da Fase 2).
  const pvp = {
    great:  { isMeta: true, speciesRank: 13, ivRank: 1,   spPct: 1,    movesetOk: true },
    ultra:  { isMeta: true, speciesRank: 30, ivRank: 999, spPct: 0.90, movesetOk: false }, // reprova na qualidade
    master: { isMeta: true, speciesRank: 15, ivRank: 50,  spPct: 0.97, movesetOk: false },
  };
  assert.deepStrictEqual(pvpTags(pvp, 100).sort(), ['pvp_great', 'pvp_master']); // ivPct 100>=95, ranks ok
  assert.deepStrictEqual(pvpTags(pvp, 90).sort(), ['pvp_great']);                // ivPct 90<95 → sem master
  assert.deepStrictEqual(pvpTags(null, 100), []);
});

test('pvpTags: speciesRank acima do corte → sem tag mesmo com cópia perfeita (mata o falso positivo)', () => {
  // Gyarados: great rank 92 (>50) e master rank 57 (>20) — cópia perfeita não salva.
  const pvp = {
    great:  { isMeta: true,  speciesRank: 92,  ivRank: 1,   spPct: 1,    movesetOk: true },
    ultra:  { isMeta: false, speciesRank: null, ivRank: null, spPct: null },
    master: { isMeta: true,  speciesRank: 57,  ivRank: 1,   spPct: 1,    movesetOk: false },
  };
  assert.deepStrictEqual(pvpTags(pvp, 100), []); // nem great (r92>50) nem master (r57>20)
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/pvp.test.js`
Expected: FAIL no segundo teste novo — sem o gate, `great` (spPct 1) e `master` (ivPct 100) ainda recebem tag, então retorna `['pvp_great','pvp_master']` em vez de `[]`. O primeiro teste atualizado passa (sem gate, ranks são ignorados).

- [ ] **Step 3: Implementar `maxRank` no `THRESHOLDS` + gate no `pvpTags`**

Em `pokemon/lib/meta/pvp.js`, substituir o bloco de comentário + `THRESHOLDS` (linhas 10-17):

```js
  // Limiares de "essa cópia presta?" — calibrados p/ shortlist útil (Fase 4):
  // ~20 picks PvP na coleção real de 592 mons [great 10 · ultra 9 · master 1].
  // spPct = stat product / melhor da liga; ivRank = posição entre os 4096 IVs.
  var THRESHOLDS = {
    great:  { spPct: 0.95, ivRank: 600 },
    ultra:  { spPct: 0.95, ivRank: 600 },
    master: { ivPct: 95 },
  };
```

por:

```js
  // Gate de tag PvP = relevância da espécie (speciesRank) ANDada com "essa cópia presta?".
  // Calibração moderada (Fase 2): ~13 picks na coleção real de 725 [great 7 · ultra 6 · master 0].
  // maxRank = corte de rank da espécie por liga; spPct = stat product / melhor da liga;
  // ivRank = posição entre os 4096 IVs (degenerado em Mestre → master usa ivPct cru).
  var THRESHOLDS = {
    great:  { spPct: 0.95, ivRank: 600, maxRank: 50 },
    ultra:  { spPct: 0.95, ivRank: 600, maxRank: 50 },
    master: { ivPct: 95,                maxRank: 20 },
  };
```

Depois, substituir a função `pvpTags` (linhas 132-144):

```js
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

por:

```js
  // Tags pvp_* = espécie relevante (speciesRank <= maxRank) E cópia boa.
  // great/ultra: qualidade = spPct OU ivRank. master: qualidade = ivPct cru (ivRank degenera sem cap).
  function pvpTags(pvp, ivPct) {
    if (!pvp) return [];
    var tags = [];
    ['great', 'ultra'].forEach(function (lg) {
      var L = pvp[lg];
      if (L && L.isMeta && L.speciesRank <= THRESHOLDS[lg].maxRank
          && (L.spPct >= THRESHOLDS[lg].spPct || L.ivRank <= THRESHOLDS[lg].ivRank))
        tags.push('pvp_' + lg);
    });
    var m = pvp.master;
    if (m && m.isMeta && m.speciesRank <= THRESHOLDS.master.maxRank
        && ivPct >= THRESHOLDS.master.ivPct)
      tags.push('pvp_master');
    return tags;
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/pvp.test.js`
Expected: PASS — os dois testes novos verdes. Conferir que os testes de afrouxamento (`pvp.test.js:148` e `:158`, que usam `speciesRank: 30 <= 50`) continuam verdes.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/pvp.js pokemon/test/pvp.test.js
git commit -m "feat(pokemon): gate de tag PvP por speciesRank (mata falso positivo de Mestre)"
```

---

## Task 3: Housekeeping — bump do SW + verificação da suíte inteira

**Files:**
- Modify: `pokemon/sw.js:1`

- [ ] **Step 1: Bump do cache do Service Worker**

Em `pokemon/sw.js`, substituir a linha 1:

```js
const CACHE = 'pokemon-leo-v18';
```

por:

```js
const CACHE = 'pokemon-leo-v19';
```

(Não há arquivo novo servido → `ASSETS` não muda.)

- [ ] **Step 2: Rodar a suíte INTEIRA**

Run: `npm test`
Expected: PASS — todos os ~237+ testes verdes (regra do roadmap: rodar a suíte inteira, não só `pvp.test.js`, porque shape compartilhado quebra testes cross-file).

- [ ] **Step 3: Verificação ponta-a-ponta na coleção real**

Run:
```bash
node -e "const fs=require('fs');const A=require('./lib/analysis.js');const PokeMatch=require('./lib/meta/match.js');const refd=require('./lib/refdata.js');const sizes=require('./sizes.js');const col=JSON.parse(fs.readFileSync('./colecao.json','utf8'));const meta={speciesIndex:PokeMatch.buildSpeciesIndex(require('./data/species.json')),movesPt:require('./data/moves_pt.json'),pvpRanks:require('./data/pvp_ranks.json'),cpm:require('./data/cpm.json'),pveRanks:require('./data/pve_ranks.json'),moves:require('./data/moves.json')};const list=A.analyze(col.fileData,sizes.getPokemonSize,{LEGENDARY:refd.LEGENDARY,REGIONAL:refd.REGIONAL,TRADE_EVO:refd.TRADE_EVO},sizes.getPokemonSizeScalar,meta);const c={g:0,u:0,m:0};for(const e of list){if(e.tags.includes('pvp_great'))c.g++;if(e.tags.includes('pvp_ultra'))c.u++;if(e.tags.includes('pvp_master'))c.m++;}console.log('pvp_great:',c.g,'pvp_ultra:',c.u,'pvp_master:',c.m);"
```
Expected: `pvp_great: 7 pvp_ultra: 6 pvp_master: 0` — Gyarados deixou de receber `pvp_master`.

- [ ] **Step 4: Commit**

```bash
git add pokemon/sw.js
git commit -m "chore(pokemon): bump SW v18->v19 (Fase 2 mexe em pvp.js cache-first)"
```

---

## Self-Review (preenchido na escrita do plano)

**Cobertura do spec:**
- Mudança 1 (`evalMon` prefere `_shadow`) → Task 1. ✅
- Mudança 2 (`speciesRank` em `pvpTags`/`THRESHOLDS`) → Task 2. ✅
- Corte moderado great/ultra ≤50, master ≤20 → Task 2 Step 3. ✅
- `analysis.js` sem edição (autocorrige) → confirmado pela verificação ponta-a-ponta na Task 3 Step 3. ✅
- Testes pvp.test.js (atualizar :124, novos shadow + exceeds-cut + fallback) → Tasks 1 e 2. ✅
- `verdict.test.js` sem mudança (montam tags à mão, speciesRank ≤ corte) → coberto pela suíte inteira na Task 3 Step 2. ✅
- Bump `sw.js` v18→v19 → Task 3. ✅
- Comentário de calibração → Task 2 Step 3. ✅
- Aceite: Gyarados perde `pvp_master`; great 7 / ultra 6 / master 0 → Task 3 Step 3. ✅

**Placeholders:** nenhum — todo passo tem código/comando exato.

**Consistência de tipos:** `maxRank` adicionado ao `THRESHOLDS` em Task 2 é lido em `pvpTags` no mesmo passo; `pvpId`/`ranks` em Task 1 mantêm o nome `ranks` que o resto de `evalMon` (L110 `ranks[lg]`) já usa.
