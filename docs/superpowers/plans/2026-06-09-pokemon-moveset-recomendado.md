# Exibir o Moveset Recomendado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A UI da página /pokemon passa a dizer QUAIS golpes compõem o moveset recomendado (em PT, ex.: "Lança-chamas"), tanto na razão da ação no card quanto no bloco Competitivo do detalhe.

**Architecture:** O build emite nomes PT de exibição (`namePt` por golpe no `moves.json`, via i18n PokeMiners já baixado). O `analysis.js` monta visões prontas (`movesetView` = `[{name, has}]`) e razões de ação que nomeiam golpes faltantes; o `render.js` só exibe a visão (não conhece `meta`). Nenhuma tag, verdict ou `kind` de ação muda — só textos e exibição.

**Tech Stack:** JavaScript vanilla (UMD, browser + Node), `node --test` + `node:assert`, datasets estáticos gerados por `pokemon/build/refresh-meta.js` (Node 18+, requer rede).

**Spec:** `docs/superpowers/specs/2026-06-09-pokemon-moveset-recomendado-design.md`

**Branch:** `claude/pokemon-moveset-recomendado` (já criada, spec commitado nela).

**Convenções do repo que você precisa saber:**
- Working dir = raiz do repo (`I:\Meu Drive\Site-moreno-arquitetura`). Suite completa: `node --test pokemon/test/`. Arquivo único: `node --test pokemon/test/<arquivo>.test.js`.
- Código das libs é UMD ES5-ish (`var`/`function`, sem arrow em `lib/`); build (`pokemon/build/`) usa Node moderno (`const`, arrows). Siga o estilo do arquivo que estiver editando.
- Comentários em PT, explicando restrição/regra (não o óbvio).
- NÃO commitar o diretório `.claude/` (untracked).

---

### Task 1: build — `buildMovesPt` retorna `namesPt` (moveId → nome PT cru)

**Files:**
- Modify: `pokemon/build/transform.js` (função `buildMovesPt`, ~linhas 57–77)
- Test: `pokemon/test/transform.test.js`

`buildMovesPt` já pareia moveId ↔ nome PT ao varrer os templates `COMBAT_V####_MOVE_` +
i18n, mas hoje guarda só o mapa normalizado (sem acentos, p/ casamento) e descarta o nome
cru. Vamos expô-lo.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `pokemon/test/transform.test.js` (os fixtures `gameMaster` e
`i18nPt` já são requeridos no topo do arquivo):

```js
test('buildMovesPt: namesPt mapeia moveId → nome PT cru (com acentos, pré-normalização)', () => {
  const { namesPt } = buildMovesPt(gameMaster, i18nPt);
  assert.deepStrictEqual(namesPt, {
    ROCK_SMASH: 'Esmagamento de Pedras',
    ICE_PUNCH: 'Soco de Gelo',
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/transform.test.js`
Expected: FAIL — `namesPt` é `undefined` (destructuring de propriedade inexistente).

- [ ] **Step 3: Implementação mínima**

Em `pokemon/build/transform.js`, alterar `buildMovesPt` (mudanças: declarar `namesPt`,
preencher no loop, retornar):

```js
function buildMovesPt(gameMaster, i18nPt) {
  const arr = Array.isArray(gameMaster) ? gameMaster : (gameMaster.template || gameMaster.itemTemplates);
  if (!Array.isArray(arr)) throw new Error('buildMovesPt: game master sem array de templates');
  const ptByNum = _i18nMoveNames(i18nPt);
  const map = {};
  const namesPt = {};   // moveId → nome PT cru (exibição; map é normalizado p/ casamento)
  let total = 0, hit = 0;
  for (const t of arr) {
    const tid = t.templateId || (t.data && t.data.templateId) || '';
    const m = /^COMBAT_V0*(\d+)_MOVE_/.exec(tid);
    const cm = (t.data && t.data.combatMove) || t.combatMove; // combatMove fica sob entry.data
    if (!m || !cm || typeof cm.uniqueId !== 'string') continue; // pula uniqueId não-string (12 casos)
    total++;
    const num = m[1];
    const moveId = cm.uniqueId.replace(/_FAST$/, '');
    const pt = ptByNum[num];
    if (!pt) continue;
    hit++;
    map[normalizeName(pt)] = moveId;
    namesPt[moveId] = pt;
  }
  return { map, namesPt, coverage: total ? hit / total : 0 };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/transform.test.js`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Commit**

```bash
git add pokemon/build/transform.js pokemon/test/transform.test.js
git commit -m "moveset-rec: buildMovesPt expõe namesPt (moveId -> nome PT cru)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: build — merge `namePt` no `moves.json` + regenerar datasets

**Files:**
- Modify: `pokemon/build/refresh-meta.js` (~linhas 57 e 66)
- Regenerated: `pokemon/data/*.json`

`refresh-meta.js` é o orquestrador (roda `main()` no require e baixa da rede — não tem
harness de teste unitário). Cobertura aqui = validação "falha alto" no próprio script +
inspeção do dataset gerado (spec §8).

- [ ] **Step 1: Merge no orquestrador**

Em `pokemon/build/refresh-meta.js`, logo após a linha
`const movesPtRes = T.buildMovesPt(gameMaster, i18nPt);`, adicionar:

```js
  // Nome PT de exibição por golpe (moves.json vem do PvPoke; nomes vêm dos PokeMiners → merge aqui).
  for (const id in movesPtRes.namesPt) if (moves[id]) moves[id].namePt = movesPtRes.namesPt[id];
```

- [ ] **Step 2: Validação "falha alto"**

No bloco de validações, logo após o check de `movesPtRes.coverage < 0.8`, adicionar:

```js
  const namePtCoverage = Object.keys(moves).length
    ? Object.keys(moves).filter(id => moves[id].namePt).length / Object.keys(moves).length : 0;
  if (namePtCoverage < 0.8)
    throw new Error('validação: cobertura namePt ' + (namePtCoverage * 100).toFixed(1) + '% < 80% — merge falhou?');
```

- [ ] **Step 3: Regenerar os datasets (requer rede)**

Run: `npm --prefix pokemon run build`
Expected: termina com `OK.` e linhas `gravado <arquivo>.json (...)`. Se falhar com erro
de validação, NÃO prossiga — investigue (schema upstream pode ter mudado).

- [ ] **Step 4: Inspecionar o dataset gerado**

Run: `node -e "const m=require('./pokemon/data/moves.json'); console.log(m.FLAMETHROWER); console.log(m.COUNTER)"`
Expected: cada entrada tem `namePt` em PT (ex.: `namePt: 'Lança-chamas'` e
`namePt: 'Contra-ataque'` — o texto exato vem do i18n; o essencial é existir e estar em PT).

- [ ] **Step 5: Suite completa**

Run: `node --test pokemon/test/`
Expected: PASS. Atenção: a regeneração atualiza os datasets a partir do upstream (rankings
podem mudar). Se um teste que usa dados reais quebrar (ex.: Azumarill/Blissey), examine se
foi deriva de meta upstream e REPORTE antes de ajustar qualquer teste — não mascare.

- [ ] **Step 6: Commit (código + datasets)**

```bash
git add pokemon/build/refresh-meta.js pokemon/data/
git commit -m "moveset-rec: moves.json ganha namePt (merge do i18n no refresh-meta) + datasets regenerados

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: analysis — `_moveName`/`_faltaTxt`; razão ENSINAR_TM (PvP) e AGUARDAR_EVENTO nomeiam golpes

**Files:**
- Modify: `pokemon/lib/analysis.js` (helpers ~linha 246; `_notReadyAction` ~linha 272; `computeAction` ~linha 300)
- Test: `pokemon/test/verdict.test.js`

`computeAction(e)` é função pura SEM acesso a `meta` (testes chamam direto). Ela ganha um
2º parâmetro opcional `meta`; sem ele, nomes caem no fallback inglês (`_humanMove`).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `pokemon/test/verdict.test.js` (os helpers `pvpMon` e `computeAction`
já existem no arquivo):

```js
// ---------------------------------------------------------------------------
// Moveset recomendado — razões nomeiam os golpes faltantes (spec 2026-06-09)
// ---------------------------------------------------------------------------

function ensinarMon(moveIds) {
  return pvpMon({
    moveIds: moveIds, eliteMoves: [],
    pvpMeta: {
      great:  { isMeta: true, speciesRank: 13, ivRank: 1, spPct: 1, movesetOk: false,
                moveset: ['COUNTER', 'ICE_PUNCH', 'POWER_UP_PUNCH'] },
      ultra:  { isMeta: false }, master: { isMeta: false },
    },
  });
}
const NOMES_PT = { moves: {
  COUNTER: { namePt: 'Contra-ataque' },
  ICE_PUNCH: { namePt: 'Soco de Gelo' },
  POWER_UP_PUNCH: { namePt: 'Soco Energizado' },
  CLOSE_COMBAT: { namePt: 'Combate Corpo a Corpo' },
} };

test('computeAction: ENSINAR_TM PvP sem nenhum carregado → "faltam X e Y" em PT', () => {
  const a = computeAction(ensinarMon(['COUNTER']), NOMES_PT);
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /faltam Soco de Gelo e Soco Energizado/);
});

test('computeAction: ENSINAR_TM PvP só com o rápido faltando → singular "falta"', () => {
  const a = computeAction(ensinarMon(['ICE_PUNCH', 'POWER_UP_PUNCH']), NOMES_PT);
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /falta Contra-ataque/);
  assert.doesNotMatch(a.reason, /faltam/);
});

test('computeAction: sem meta → nome do golpe em inglês humanizado (fallback)', () => {
  const a = computeAction(ensinarMon(['ICE_PUNCH', 'POWER_UP_PUNCH']));
  assert.match(a.reason, /falta Counter/);
});

test('computeAction: ENSINAR_TM sem moveset no rankEntry → texto genérico (fallback)', () => {
  const a = computeAction(pvpMon({
    pvpMeta: {
      great:  { isMeta: true, speciesRank: 13, ivRank: 1, spPct: 1, movesetOk: false },
      ultra:  { isMeta: false }, master: { isMeta: false },
    },
  }), NOMES_PT);
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /falta o moveset recomendado/);
});

test('computeAction: AGUARDAR_EVENTO nomeia o golpe legado em PT', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 95, betterCopy: null,
    moveIds: ['COUNTER'], eliteMoves: ['CLOSE_COMBAT'],
    tags: ['pvp_great'],
    pvpMeta: { great:  { isMeta: true, speciesRank: 5, ivRank: 1, spPct: 1, movesetOk: false,
                         moveset: ['COUNTER', 'CLOSE_COMBAT'] },
               ultra:  { isMeta: false, moveset: null }, master: { isMeta: false, moveset: null } },
    pveMeta: null,
  };
  const a = computeAction(e, NOMES_PT);
  assert.strictEqual(a.kind, 'AGUARDAR_EVENTO');
  assert.match(a.reason, /Combate Corpo a Corpo/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/verdict.test.js`
Expected: FAIL nos 5 testes novos (razões ainda dizem "falta o moveset recomendado";
AGUARDAR_EVENTO ainda diz "Close Combat"). Os testes antigos seguem passando.

- [ ] **Step 3: Implementar**

Em `pokemon/lib/analysis.js`, logo após `_humanMove` (~linha 249), adicionar três helpers
(estilo da lib: `function`, sem arrow):

```js
  // Nome de exibição de um moveId: namePt (moves.json) → senão inglês humanizado.
  function _moveName(id, meta) {
    const m = meta && meta.moves && meta.moves[id];
    return (m && m.namePt) || _humanMove(id);
  }

  // Golpes que faltam segundo o critério do movesetOk PvP: o rápido se não o tem;
  // os carregados (todos) se não tem nenhum deles.
  function _missingPvpMoves(mine, rec) {
    if (!rec || rec.length < 2) return [];
    const m = mine || [];
    const out = [];
    if (m.indexOf(rec[0]) < 0) out.push(rec[0]);
    const charged = rec.slice(1);
    if (!charged.some(function (c) { return m.indexOf(c) >= 0; })) out.push.apply(out, charged);
    return out;
  }

  // "falta X" / "faltam X e Y" / "faltam X, Y e Z" com nomes de exibição.
  function _faltaTxt(ids, meta) {
    const names = ids.map(function (id) { return _moveName(id, meta); });
    const lista = names.length > 1
      ? names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1]
      : names[0];
    return (names.length > 1 ? 'faltam ' : 'falta ') + lista;
  }
```

`_notReadyAction` ganha `meta` e usa `_moveName` (substituir a função inteira):

```js
  // Ação quando o moveset NÃO está pronto: AGUARDAR_EVENTO (golpe legado falta) senão ENSINAR_TM.
  function _notReadyAction(e, ensinarReason, meta) {
    const leg = _missingLegacyMove(e);
    if (leg) {
      return { kind: 'AGUARDAR_EVENTO', legacyMove: leg,
        reason: 'Aguardar Evento — moveset ótimo precisa do golpe legado "' + _moveName(leg, meta) +
                '"; espere Dia Comunitário / Elite TM' };
    }
    return { kind: 'ENSINAR_TM', reason: ensinarReason };
  }
```

`computeAction` ganha `meta` opcional e nomeia os faltantes no ramo PvP (substituir a
função inteira; o ramo AGUARDAR_ROCKET e o final não mudam):

```js
  function computeAction(e, meta) {
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
      const missing = _missingPvpMoves(e.moveIds, L.moveset);
      return _notReadyAction(e,
        'Ensinar/TM p/ ' + ligaPt + ' — Top ' + L.speciesRank + ', ' +
        (missing.length ? _faltaTxt(missing, meta) : 'falta o moveset recomendado'), meta);
    }
    const pve = _pveAction(e, meta);
    if (pve) return pve;
    // P5: Trocar/Reroll (duplicata pior: shiny lucky ou meta IV baixo).
    return _trocaAction(e);
  }
```

Nota: `_pveAction(e, meta)` — o argumento extra é ignorado até a Task 4 (JS); inofensivo.

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/verdict.test.js`
Expected: PASS (novos e antigos — os antigos chamam `computeAction(e)` sem meta e os
regex `/Ensinar|TM/` continuam casando com os textos novos).

- [ ] **Step 5: Suite completa + commit**

Run: `node --test pokemon/test/`
Expected: PASS.

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "moveset-rec: razoes ENSINAR_TM (PvP) e AGUARDAR_EVENTO nomeiam golpes em PT

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: analysis — razão ENSINAR_TM (PvE) nomeia os golpes faltantes

**Files:**
- Modify: `pokemon/lib/analysis.js` (`_pveAction`, ~linha 230)
- Test: `pokemon/test/verdict.test.js`

PvE exige os DOIS golpes do `bestMoveset` (semântica do `pveMovesetOk`); faltante = todo
golpe recomendado que o mon não tem.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `pokemon/test/verdict.test.js` (o helper `pveRaider` já existe;
`NOMES_PT` foi criado na Task 3 — se executar tasks fora de ordem, copie-o da Task 3):

```js
test('computeAction: ENSINAR_TM PvE sem nenhum golpe → "faltam X e Y" em PT', () => {
  const e = pveRaider({
    moveIds: [],
    pveMeta: Object.assign(pveRaider().pveMeta, { movesetOk: false }),
  });
  const meta = { moves: { ICE_SHARD: { namePt: 'Lança de Gelo' }, AVALANCHE: { namePt: 'Avalanche' } } };
  const a = computeAction(e, meta);
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /faltam Lança de Gelo e Avalanche/);
  assert.match(a.reason, /estimativa/);
});

test('computeAction: ENSINAR_TM PvE com o rápido → "falta Avalanche" (singular)', () => {
  const e = pveRaider({
    moveIds: ['ICE_SHARD'],
    pveMeta: Object.assign(pveRaider().pveMeta, { movesetOk: false }),
  });
  const meta = { moves: { ICE_SHARD: { namePt: 'Lança de Gelo' }, AVALANCHE: { namePt: 'Avalanche' } } };
  const a = computeAction(e, meta);
  assert.match(a.reason, /falta Avalanche/);
  assert.doesNotMatch(a.reason, /faltam/);
});

test('computeAction: ENSINAR_TM PvE sem bestMoveset → texto genérico (fallback)', () => {
  const e = pveRaider({
    pveMeta: Object.assign(pveRaider().pveMeta, { movesetOk: false, bestMoveset: null }),
  });
  const a = computeAction(e, { moves: {} });
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /falta o moveset de ataque/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/verdict.test.js`
Expected: FAIL nos 2 primeiros (razão ainda é o texto genérico); o 3º já deve passar
(é o comportamento atual — vira guarda de regressão).

- [ ] **Step 3: Implementar**

Substituir `_pveAction` inteira em `pokemon/lib/analysis.js`:

```js
  // Ação a partir do papel de atacante PvE (raid > gym_atk). null se o mon não é atacante.
  function _pveAction(e, meta) {
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
    // PvE exige os dois golpes do bestMoveset; lista os que faltam.
    const mine = e.moveIds || [];
    const missing = (e.pveMeta.bestMoveset || []).filter(function (id) { return mine.indexOf(id) < 0; });
    return _notReadyAction(e,
      'Ensinar/TM p/ ' + papel + ' (' + tipo + ')' + rankTxt + ' — ' +
      (missing.length ? _faltaTxt(missing, meta) : 'falta o moveset de ataque') + ' (estimativa)', meta);
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/verdict.test.js`
Expected: PASS (o teste antigo "atacante de raid + moveset ruim → ENSINAR_TM" segue
casando: agora a razão diz "faltam Ice Shard e Avalanche", e `/Ensinar|TM/` continua ok).

- [ ] **Step 5: Suite completa + commit**

Run: `node --test pokemon/test/`
Expected: PASS.

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "moveset-rec: razao ENSINAR_TM (PvE) nomeia golpes faltantes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: analysis — `analyze` anexa `movesetView` e passa `meta` ao `computeAction`

**Files:**
- Modify: `pokemon/lib/analysis.js` (`analyze`, ~linha 335; helpers novos perto de `_faltaTxt`)
- Test: `pokemon/test/verdict.test.js`

`movesetView` = `[{ name, has }]` na ordem do moveset recomendado — é a ÚNICA coisa que o
render vai ler (render não conhece `meta`). Anexado no `analyze` porque é lá que
`e.pvpMeta`/`e.pveMeta` são preenchidos.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `pokemon/test/verdict.test.js` (padrão de meta sintético + dados
reais de `species.json`, como o teste e2e do Machamp Sombrio que já existe no arquivo):

```js
test('analyze: anexa movesetView por liga PvP (nomes PT + has)', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  // pvpRanks SINTÉTICO → moveset recomendado determinístico (não depende do dataset real).
  const meta = {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'bolha': 'BUBBLE', 'raio congelante': 'ICE_BEAM' },
    pvpRanks: { azumarill: { great: { rank: 13, score: 90, moveset: ['BUBBLE', 'ICE_BEAM', 'PLAY_ROUGH'] },
                             ultra: null, master: null } },
    cpm: require('../data/cpm.json'),
    moves: { BUBBLE: { namePt: 'Bolha' }, ICE_BEAM: { namePt: 'Raio Congelante' },
             PLAY_ROUGH: { namePt: 'Jogo Duro' } },
  };
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO', mon_move_1:'Bolha', mon_move_2:'Raio Congelante' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.deepStrictEqual(e.pvpMeta.great.movesetView, [
    { name: 'Bolha', has: true },
    { name: 'Raio Congelante', has: true },
    { name: 'Jogo Duro', has: false },
  ]);
  assert.strictEqual(e.pvpMeta.ultra.movesetView, null);   // liga fora do meta → null
});

test('analyze: anexa movesetView no pveMeta e passa meta ao computeAction', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  const meta = {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'palmada': 'COUNTER' },
    pveRanks: { machamp: { roles: ['raid','pve'], bestType: 'fighting',
      bestMoveset: ['COUNTER','CROSS_CHOP'],
      byType: { fighting: { dps: 18, tdo: 500, er: 50, dpsRank: 3, erRank: 3, moveset: ['COUNTER','CROSS_CHOP'] } },
      defBulkRank: 999 } },
    moves: { COUNTER: { namePt: 'Contra-ataque' }, CROSS_CHOP: { namePt: 'Golpe Cruzado' } },
  };
  const fd = { s: { mon_name:'Machamp', mon_number:68, mon_cp:1500, mon_attack:15, mon_defence:15, mon_stamina:14,
                    mon_height:1.6, mon_isShiny:'NO', mon_isLucky:'NO', mon_move_1:'Palmada' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.deepStrictEqual(e.pveMeta.movesetView, [
    { name: 'Contra-ataque', has: true },
    { name: 'Golpe Cruzado', has: false },
  ]);
  // analyze repassa meta → a razão da ação sai com nome PT. Não asserimos o kind:
  // hoje CROSS_CHOP não é elite do Machamp (→ ENSINAR_TM), mas se o upstream mudar
  // isso vira AGUARDAR_EVENTO — e a razão dele também nomeia o golpe em PT.
  assert.match(e.action.reason, /Golpe Cruzado/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/verdict.test.js`
Expected: FAIL — `movesetView` é `undefined`; no 2º teste a razão sai "Cross Chop"
(inglês) porque `analyze` ainda chama `computeAction(e)` sem meta.

- [ ] **Step 3: Implementar**

Em `pokemon/lib/analysis.js`, após `_faltaTxt`, adicionar:

```js
  // Visão de exibição do moveset recomendado: [{ name, has }] (render não conhece meta).
  function _movesetView(rec, mine, meta) {
    if (!rec || !rec.length) return null;
    const m = mine || [];
    return rec.map(function (id) {
      return { name: _moveName(id, meta), has: m.indexOf(id) >= 0 };
    });
  }

  function _attachMovesetViews(e, meta) {
    if (e.pvpMeta) for (const lg of PVP_LEAGUE_ORDER) {
      const L = e.pvpMeta[lg];
      if (L) L.movesetView = (L.isMeta && L.moveset) ? _movesetView(L.moveset, e.moveIds, meta) : null;
    }
    if (e.pveMeta)
      e.pveMeta.movesetView = _movesetView(e.pveMeta.bestMoveset, e.moveIds, meta);
  }
```

E no loop do `analyze`, duas mudanças:

```js
      e.pvpMeta = (meta && meta.cpm && meta.pvpRanks && PokePvp) ? PokePvp.evalMon(e, meta) : null;
      e.pveMeta = (meta && meta.pveRanks && PokePve) ? PokePve.evalMon(e, meta) : null;
      _attachMovesetViews(e, meta);
      e.isRocketReady = (meta && meta.moves && PokePve)
        ? PokePve.rocketSpam(e.moveIds, meta.moves) : false;
      e.tags = computeTags(e);
      e.action = computeAction(e, meta);
```

(Únicas linhas novas/alteradas: `_attachMovesetViews(e, meta);` e `computeAction(e, meta)`.)

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/verdict.test.js`
Expected: PASS.

- [ ] **Step 5: Suite completa + commit**

Run: `node --test pokemon/test/`
Expected: PASS.

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "moveset-rec: analyze anexa movesetView (pvp por liga + pve) e repassa meta as acoes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: render — bloco Competitivo lista o moveset com ✓/(falta)

**Files:**
- Modify: `pokemon/lib/render.js` (`competitiveHtml`, ~linhas 75–108)
- Test: `pokemon/test/render.test.js`

Marcador por golpe é binário — `✓` (tem) ou `(falta)` (não tem) — independente do
`movesetOk` (spec §7). Sem `movesetView` (analyze antigo/meta ausente), mantém os textos
atuais como fallback.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `pokemon/test/render.test.js` (os stubs `pvpStub` e `pveStub` já
existem no arquivo):

```js
test('detailHtml: linha PvP lista o moveset recomendado com ✓/(falta)', () => {
  const e = pvpStub({ verdict:'INVESTIR', moves:['Bolha','Raio Congelante'], height:0.5, weight:28.5,
    ivs:{atk:0,def:15,sta:15},
    pvpMeta: { great: { isMeta:true, speciesRank:13, ivRank:1, spPct:1, movesetOk:false,
                        movesetView: [ { name:'Bolha', has:true }, { name:'Raio Congelante', has:true },
                                       { name:'Jogo Duro', has:false } ] },
               ultra:{isMeta:false}, master:{isMeta:false} } });
  const html = detailHtml(e);
  assert.match(html, /recomendado: Bolha ✓ · Raio Congelante ✓ · Jogo Duro \(falta\)/);
  assert.doesNotMatch(html, /falta o moveset recomendado/);
});

test('detailHtml: linha PvP sem movesetView → texto antigo (fallback)', () => {
  const e = pvpStub({ verdict:'INVESTIR', moves:['x'], height:0.5, weight:28.5, ivs:{atk:0,def:15,sta:15} });
  const html = detailHtml(e);
  assert.match(html, /moveset recomendado ✓/);   // movesetOk:true no stub default
});

test('detailHtml: linha PvE lista o moveset recomendado com ✓/(falta)', () => {
  const e = pveStub({ pveMeta: Object.assign(pveStub().pveMeta, {
    movesetOk: false,
    movesetView: [ { name:'Lança de Gelo', has:true }, { name:'Avalanche', has:false } ],
  }) });
  const html = detailHtml(e);
  assert.match(html, /recomendado: Lança de Gelo ✓ · Avalanche \(falta\)/);
  assert.match(html, /estimativa/);
});

test('detailHtml: linha PvE sem movesetView → texto antigo (fallback)', () => {
  const html = detailHtml(pveStub());
  assert.match(html, /moveset de ataque ✓/);   // movesetOk:true no stub default
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/render.test.js`
Expected: FAIL nos testes 1 e 3 ("recomendado:" não existe); 2 e 4 já passam (guardas de
regressão do fallback).

- [ ] **Step 3: Implementar**

Em `pokemon/lib/render.js`, antes de `competitiveHtml`, adicionar:

```js
  // "Bolha ✓ · Jogo Duro (falta)" a partir do movesetView ([{name,has}]).
  function movesetLabel(view) {
    return view.map(function (m) { return esc(m.name) + (m.has ? ' ✓' : ' (falta)'); }).join(' · ');
  }
```

Na linha PvP de `competitiveHtml`, trocar:

```js
        const mv = L.movesetOk ? 'moveset recomendado ✓' : 'falta o moveset recomendado';
```

por:

```js
        const mv = L.movesetView
          ? 'recomendado: ' + movesetLabel(L.movesetView)
          : (L.movesetOk ? 'moveset recomendado ✓' : 'falta o moveset recomendado');
```

Na linha PvE, trocar:

```js
        const mv = pm.movesetOk ? ' · moveset de ataque ✓' : (pm.bestMoveset ? ' · falta moveset de ataque' : '');
```

por:

```js
        const mv = pm.movesetView
          ? ' · recomendado: ' + movesetLabel(pm.movesetView)
          : (pm.movesetOk ? ' · moveset de ataque ✓' : (pm.bestMoveset ? ' · falta moveset de ataque' : ''));
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/render.test.js`
Expected: PASS.

- [ ] **Step 5: Suite completa + commit**

Run: `node --test pokemon/test/`
Expected: PASS.

```bash
git add pokemon/lib/render.js pokemon/test/render.test.js
git commit -m "moveset-rec: bloco Competitivo lista o moveset recomendado com check/falta

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: sw cache v14 + verificação no navegador (coleção real)

**Files:**
- Modify: `pokemon/sw.js:1` (CACHE `pokemon-leo-v13` → `pokemon-leo-v14`)

Lição da Fase 4: `app.js`/wiring de DOM não tem cobertura de teste — a verificação de
fase DEVE abrir o navegador, não só rodar Node.

- [ ] **Step 1: Bump do cache**

Em `pokemon/sw.js`, linha 1: `const CACHE = 'pokemon-leo-v14';`

- [ ] **Step 2: Suite completa**

Run: `node --test pokemon/test/`
Expected: PASS (todos).

- [ ] **Step 3: Verificação no navegador**

Servir a pasta `pokemon/` por HTTP com as ferramentas de preview (preview_start) e
verificar na coleção real:
1. A página carrega e os chips competitivos têm contagens > 0 (Grande/Ultra/Mestre/Raid/
   Rocket) — confirma que a camada de meta está viva (regressão do bug de wiring).
2. Um card com ação Ensinar/TM mostra o(s) golpe(s) faltante(s) **em PT** (não mais
   "falta o moveset recomendado" genérico, exceto fallbacks).
3. Expandir o detalhe de um mon com tag competitiva: o bloco Competitivo mostra
   `recomendado: <golpes>` com `✓`/`(falta)` por golpe, em PT com acentos.
4. Console sem erros (preview_console_logs).
5. Screenshot do card + detalhe como prova.

Se algo falhar: diagnosticar no código-fonte, corrigir, re-rodar suite e repetir.

- [ ] **Step 4: Commit final**

```bash
git add pokemon/sw.js
git commit -m "moveset-rec: sw cache v13 -> v14

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Verificação final do plano

- Invariante do spec-mãe §12.2 (meta nunca TRANSFERIR): nenhuma lógica de verdict/tag foi
  tocada — apenas textos de razão e exibição. A suite existente guarda isso.
- Após o merge, a GitHub Action `refresh-meta.yml` regenera os datasets com `namePt`
  automaticamente (o merge vive no `refresh-meta.js`).
