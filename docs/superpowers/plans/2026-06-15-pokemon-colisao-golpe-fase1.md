# Fase 1 — Colisão de golpe (resolução escopada por espécie) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolver o nome PT de um golpe para o ID correto **dentro dos golpes que a espécie pode ter**, eliminando as 4 colisões de nome (`jato d agua`, `furacao`, Weather Ball, Techno Blast) sem regredir os casos atuais.

**Architecture:** Nova função pura `matchMoveInSpecies` em `lib/meta/match.js` que casa o nome PT contra o `namePt` (com fallback override → inglês) de cada golpe permitido da espécie. `analysis.js` (`enrichOne`) passa a chamá-la com a lista de golpes da espécie + `meta.moves` + `MOVE_PT_OVERRIDE`, caindo no `matchMove` global (`meta.movesPt`) quando não há espécie/lista/casamento — garantindo zero regressão.

**Tech Stack:** Vanilla JS, padrão de módulo dual (browser global + `require` nos testes), testes com `node:test`. Sem libs.

**Spec:** `docs/superpowers/specs/2026-06-15-pokemon-revisao-recomendacao-roadmap-design.md` (§4).

---

## Estrutura de arquivos

| Arquivo | Papel nesta fase |
|---|---|
| `pokemon/lib/meta/match.js` | **Modificar.** Adiciona `matchMoveInSpecies` (+ helper `_displayPt`) e expõe no retorno. |
| `pokemon/lib/analysis.js` | **Modificar.** Novo helper `resolveMoveIds`; `enrichOne` usa-o em vez do `.map(matchMove)` inline. |
| `pokemon/test/match.test.js` | **Modificar.** Testes unitários da resolução escopada (colisão + fallback + override). |
| `pokemon/test/enrich.test.js` | **Modificar.** Teste de payoff ponta-a-ponta (Gyarados real). |
| `pokemon/sw.js` | **Modificar.** Bump `pokemon-leo-v17 → v18` (assets cache-first mudaram). |

Nenhum arquivo novo é servido → `ASSETS` em `sw.js` **não** muda.

---

## Task 1: `matchMoveInSpecies` em match.js (resolução escopada)

**Files:**
- Modify: `pokemon/lib/meta/match.js`
- Test: `pokemon/test/match.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao final de `pokemon/test/match.test.js`:

```js
const { matchMoveInSpecies } = require('../lib/meta/match.js');

// IDs com nome PT colidente; uma espécie nunca tem mais de um deles na lista.
const movesById = {
  HYDRO_PUMP:           { namePt: "Jato d'Água" },
  HYDRO_PUMP_BLASTOISE: { namePt: "Jato d'Água" },
  WATERFALL:            { namePt: 'Cachoeira' },
  HURRICANE:            { namePt: 'Furacão' },
  DRILL_RUN:            { namePt: 'Perfurar' },
};

test('matchMoveInSpecies: resolve dentro dos golpes da espécie (mata a colisão)', () => {
  // Gyarados tem HYDRO_PUMP na lista, não a variante Blastoise.
  assert.strictEqual(
    matchMoveInSpecies("Jato d'Água", ['WATERFALL', 'HYDRO_PUMP', 'AQUA_TAIL'], movesById, {}),
    'HYDRO_PUMP');
});

test('matchMoveInSpecies: nome fora da lista da espécie → null (deixa o fallback agir)', () => {
  assert.strictEqual(
    matchMoveInSpecies("Jato d'Água", ['WATERFALL', 'AQUA_TAIL'], movesById, {}),
    null);
});

test('matchMoveInSpecies: usa override quando falta namePt', () => {
  const mb = { CHILLING_WATER: {} }; // sem namePt
  assert.strictEqual(
    matchMoveInSpecies('Água Refrescante', ['CHILLING_WATER'], mb, { CHILLING_WATER: 'Água Refrescante' }),
    'CHILLING_WATER');
});

test('matchMoveInSpecies: degrada gracioso (sem nome/lista → null)', () => {
  assert.strictEqual(matchMoveInSpecies('', ['HYDRO_PUMP'], movesById, {}), null);
  assert.strictEqual(matchMoveInSpecies("Jato d'Água", [], movesById, {}), null);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd pokemon && node --test test/match.test.js`
Expected: FAIL — `matchMoveInSpecies is not a function` (ainda não exportada).

- [ ] **Step 3: Implementar `matchMoveInSpecies` em match.js**

Em `pokemon/lib/meta/match.js`, **antes** do `return { ... }` final, adicione:

```js
  // Nome PT de exibição de um moveId p/ casamento: namePt → override → o próprio id
  // (que normalizeName reduz a "close combat" etc.). Mesma cadeia do _moveName de analysis.js.
  function _displayPt(id, movesById, override) {
    var m = movesById && movesById[id];
    return (m && m.namePt) || (override && override[id]) || id;
  }

  // Casa um nome PT de golpe APENAS dentro dos golpes que a espécie pode ter (allowedIds).
  // Mata colisões de nome PT entre IDs (ex.: "Jato d'Água" → HYDRO_PUMP, nunca a variante
  // HYDRO_PUMP_BLASTOISE, que não está na lista do Gyarados). null se nada casar.
  function matchMoveInSpecies(ptName, allowedIds, movesById, override) {
    if (!ptName || !allowedIds || !allowedIds.length) return null;
    var key = normalizeName(ptName);
    for (var i = 0; i < allowedIds.length; i++) {
      if (normalizeName(_displayPt(allowedIds[i], movesById, override)) === key) return allowedIds[i];
    }
    return null;
  }
```

E **inclua `matchMoveInSpecies` no objeto de retorno**. Troque a linha:

```js
  return { normalizeName, buildSpeciesIndex, matchSpecies, matchMove };
```

por:

```js
  return { normalizeName, buildSpeciesIndex, matchSpecies, matchMove, matchMoveInSpecies };
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd pokemon && node --test test/match.test.js`
Expected: PASS (todos os testes do arquivo verdes).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/meta/match.js pokemon/test/match.test.js
git commit -m "feat(pokemon): matchMoveInSpecies — resolve golpe escopado pela espécie

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Wiring em enrichOne (escopado primeiro, fallback global)

**Files:**
- Modify: `pokemon/lib/analysis.js` (helper novo + `enrichOne` ~linha 127)
- Test: `pokemon/test/enrich.test.js`

- [ ] **Step 1: Escrever o teste de payoff que falha**

Adicione ao final de `pokemon/test/enrich.test.js`:

```js
// --- 2026-06-15 Fase 1: resolução escopada mata a colisão "Jato d'Água" ---
const movesJson = require('../data/moves.json');

function metaScoped() {
  return {
    speciesIndex: buildSpeciesIndex(speciesJson),
    movesPt: {},                 // vazio de propósito: força o caminho escopado
    moves: movesJson,
    pvpRanks: pvpRanksJson, cpm: realCpm, pveRanks: pveRanksJson,
  };
}

test('payoff: Gyarados "Cachoeira"+"Jato d\'Água" → HYDRO_PUMP e pveMeta.movesetOk', () => {
  const fd = { g: { mon_name:'Gyarados', mon_number:130, mon_cp:3000,
                    mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:6.5,
                    mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Cachoeira', mon_move_2:"Jato d'Água" } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, metaScoped())[0];
  assert.ok(e.moveIds.includes('HYDRO_PUMP'), 'resolveu HYDRO_PUMP');
  assert.ok(!e.moveIds.includes('HYDRO_PUMP_BLASTOISE'), 'NÃO pegou a variante Blastoise');
  assert.strictEqual(e.pveMeta.movesetOk, true);   // antes do fix: false (moveIds vazio)
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd pokemon && node --test test/enrich.test.js`
Expected: FAIL — com `movesPt:{}` e sem caminho escopado, `moveIds` fica `[]`, então `pveMeta.movesetOk` é `false` e `moveIds.includes('HYDRO_PUMP')` falha.

- [ ] **Step 3: Adicionar o helper `resolveMoveIds` em analysis.js**

Em `pokemon/lib/analysis.js`, logo **após** a função `speciesScalar` (~linha 29, antes de `ivPct`), adicione:

```js
  // Resolve os nomes PT dos golpes do mon em moveIds. Prioriza o casamento ESCOPADO pela
  // espécie (mata colisões: "Jato d'Água" → HYDRO_PUMP, não HYDRO_PUMP_BLASTOISE); cai no
  // matchMove global (meta.movesPt) quando falta espécie/lista/meta.moves ou nada casa.
  function resolveMoveIds(mon, sid, meta) {
    if (!meta || !PokeMatch) return [];
    var sp = (sid && meta.speciesIndex && meta.speciesIndex.byId) ? meta.speciesIndex.byId[sid] : null;
    var allowed = sp ? (sp.fastMoves || []).concat(sp.chargedMoves || []) : null;
    return [mon.mon_move_1, mon.mon_move_2, mon.mon_move_3].map(function (name) {
      if (!name) return null;
      if (allowed && allowed.length && meta.moves && PokeMatch.matchMoveInSpecies) {
        var hit = PokeMatch.matchMoveInSpecies(name, allowed, meta.moves, MOVE_PT_OVERRIDE);
        if (hit) return hit;
      }
      return meta.movesPt ? PokeMatch.matchMove(name, meta.movesPt) : null;
    }).filter(Boolean);
  }
```

- [ ] **Step 4: Trocar a montagem inline de `moveIds` em `enrichOne`**

Em `pokemon/lib/analysis.js`, dentro de `enrichOne`, substitua o bloco atual:

```js
      moveIds: (meta && meta.movesPt && PokeMatch)
        ? [mon.mon_move_1, mon.mon_move_2, mon.mon_move_3]
            .map(function (m) { return PokeMatch.matchMove(m, meta.movesPt); })
            .filter(Boolean)
        : [],
```

por:

```js
      moveIds: resolveMoveIds(mon, sid, meta),
```

- [ ] **Step 5: Rodar o arquivo de teste e confirmar que passa**

Run: `cd pokemon && node --test test/enrich.test.js`
Expected: PASS — incluindo o novo teste de payoff e todos os de não-regressão (`enrich anexa ... moveIds`, `enrich sem meta`, Azumarill, Golem/rocket, movesetView/movesetTip).

- [ ] **Step 6: Rodar a SUÍTE INTEIRA (shape compartilhado quebra testes cross-file)**

Run: `cd pokemon && npm test`
Expected: todos os ~237+ testes verdes. Se algum teste de outro arquivo (`pvp`, `pve`, `verdict`, `render`, `sort`...) quebrar, é regressão de `moveIds` — investigar antes de prosseguir, não seguir com vermelho.

- [ ] **Step 7: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/enrich.test.js
git commit -m "fix(pokemon): enrichOne resolve golpe escopado pela espécie (corrige colisão Jato d'Água)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Bump do Service Worker

**Files:**
- Modify: `pokemon/sw.js:1`

- [ ] **Step 1: Bump da versão do cache**

Em `pokemon/sw.js`, troque:

```js
const CACHE = 'pokemon-leo-v17';
```

por:

```js
const CACHE = 'pokemon-leo-v18';
```

(`ASSETS` não muda — nenhum arquivo servido foi adicionado/removido.)

- [ ] **Step 2: Sanidade — suíte inteira ainda verde**

Run: `cd pokemon && npm test`
Expected: todos verdes (o bump não afeta testes, mas confirma que nada foi tocado por engano).

- [ ] **Step 3: Commit**

```bash
git add pokemon/sw.js
git commit -m "chore(pokemon): bump cache do SW (v17→v18) p/ resolução escopada de golpe

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (cobertura × spec §4)

- **Resolução escopada por espécie** → Task 1 (`matchMoveInSpecies`) + Task 2 (wiring). ✓
- **Fallback global sem regressão** → `resolveMoveIds` mantém `matchMove(meta.movesPt)`; Task 2 Step 6 roda a suíte inteira. ✓
- **15 golpes sem `namePt` via override** → Task 1 testa `CHILLING_WATER` com `MOVE_PT_OVERRIDE`. ✓
- **Casos de borda (nome/lista ausente → null → fallback)** → Task 1 Step 1 (degrada gracioso) + `resolveMoveIds` guard. ✓
- **Payoff Gyarados real** → Task 2 Step 1. ✓
- **Bump do SW (regra de ouro)** → Task 3. ✓
- **`moves_pt.json` permanece** → não é tocado em nenhuma task. ✓

Sem placeholders; nomes consistentes (`matchMoveInSpecies`, `resolveMoveIds`) entre tasks.
```
