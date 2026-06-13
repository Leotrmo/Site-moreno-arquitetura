# Recomendação de ataques: ágil/carregado + 2º carregado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar no moveset recomendado quais golpes são ágeis (⚡) e carregados (💥), e recomendar ativamente o desbloqueio do 2º ataque carregado em PvP — sem alterar veredito/ação.

**Architecture:** Duas mudanças paralelas e independentes. (1) `_movesetView` (analysis.js) passa a carregar `kind` por golpe; `movesetLabel` (render.js) usa `kind` para prefixar ícones. (2) Nova função pura `_secondChargeTip` (analysis.js) anexa `e.movesetTip` quando o mon, numa liga PvP meta, já tem moveset funcional mas falta exatamente o 2º carregado; `cardHtml` (render.js) renderiza a linha, com CSS novo em `index.html`. Nada toca em verdict/tags/`movesetOk`/motores.

**Tech Stack:** JS vanilla (IIFE/UMD), `node:test` + `node:assert`, datasets JSON reais nos testes de meta (`enrich.test.js`), service worker manual.

**Spec:** `docs/superpowers/specs/2026-06-13-pokemon-ataques-agil-carregado-design.md`

---

## File Structure

- **Modify** `pokemon/lib/analysis.js` — `_movesetView` ganha `kind`; nova `_secondChargeTip`; anexa `e.movesetTip` em `analyze`; inicializa `movesetTip: null` no objeto de `enrichOne`.
- **Modify** `pokemon/lib/render.js` — `movesetLabel` prefixa ícones por `kind`; `cardHtml` renderiza a linha `.moveset-tip`.
- **Modify** `pokemon/index.html` — CSS `.moveset-tip` (espelha `.trade-tip`).
- **Modify** `pokemon/sw.js` — bump do cache `v15` → `v16`.
- **Test** `pokemon/test/enrich.test.js` — `movesetView.kind` e `_secondChargeTip` via `analyze` com `meta` real.
- **Test** `pokemon/test/render.test.js` — ícones em `detailHtml`; linha `.moveset-tip` em `cardHtml`.

Convenção do projeto: golpes em ordem `[ágil, carregado1, carregado2]`; `kind` é `'fast'`/`'charge'` em `meta.moves[id]`. `movesetOk` = tem o ágil **e** ≥1 carregado (positional, não usa `kind`).

---

## Task 1: `movesetView` carrega `kind`

**Files:**
- Modify: `pokemon/lib/analysis.js` (função `_movesetView`, ~linha 372)
- Test: `pokemon/test/enrich.test.js`

- [ ] **Step 1: Adicionar helper de meta + teste falho**

No fim de `pokemon/test/enrich.test.js`, adicione o helper compartilhado (usado também na Task 3) e o primeiro teste:

```js
// --- 2026-06-13: ágil/carregado + 2º carregado ---
// Azumarill é meta em great com moveset de 3 golpes (["BUBBLE","ICE_BEAM","PLAY_ROUGH"]).
// Lê o moveset real do dataset e monta meta.moves com kind/namePt controlados.
function metaAzumarill() {
  const ms = pvpRanksJson['azumarill'].great.moveset; // [ágil, carregado1, carregado2]
  const moves = {};
  moves[ms[0]] = { type:'water', kind:'fast',   pvp:{power:8,energy:11},  namePt:'Bolha' };
  moves[ms[1]] = { type:'ice',   kind:'charge', pvp:{power:90,energy:55}, namePt:'Raio de Gelo' };
  moves[ms[2]] = { type:'fairy', kind:'charge', pvp:{power:90,energy:60}, namePt:'Focinhada' };
  return {
    ms,
    meta: {
      speciesIndex: buildSpeciesIndex(speciesJson),
      movesPt: { 'bolha': ms[0], 'raio de gelo': ms[1], 'focinhada': ms[2] },
      pvpRanks: pvpRanksJson, cpm: realCpm, moves,
    },
  };
}

test('analyze com meta: movesetView carrega kind (1º ágil, demais carregados)', () => {
  const { meta } = metaAzumarill();
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Bolha', mon_move_2:'Raio de Gelo' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  const view = e.pvpMeta.great.movesetView;
  assert.ok(view && view.length === 3, 'movesetView com 3 golpes');
  assert.strictEqual(view[0].kind, 'fast');
  assert.strictEqual(view[1].kind, 'charge');
  assert.strictEqual(view[2].kind, 'charge');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/enrich.test.js`
Expected: FAIL — `view[0].kind` é `undefined` (movesetView ainda não carrega `kind`).

- [ ] **Step 3: Implementar `kind` no `_movesetView`**

Em `pokemon/lib/analysis.js`, substitua a função `_movesetView`:

```js
  // Visão de exibição do moveset recomendado: [{ name, has, kind }] (render não conhece meta).
  function _movesetView(rec, mine, meta) {
    if (!rec || !rec.length) return null;
    const m = mine || [];
    return rec.map(function (id) {
      const mv = meta && meta.moves && meta.moves[id];
      return { name: _moveName(id, meta), has: m.indexOf(id) >= 0, kind: (mv && mv.kind) || 'charge' };
    });
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/enrich.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/enrich.test.js
git commit -m "feat: movesetView carrega kind (ágil/carregado) por golpe"
```

---

## Task 2: Ícones ⚡/💥 no `movesetLabel`

**Files:**
- Modify: `pokemon/lib/render.js` (função `movesetLabel`, ~linha 76)
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Teste falho de ícones (via `detailHtml`)**

No fim de `pokemon/test/render.test.js`, adicione (`detailHtml` já está importado no arquivo, ~linha 121):

```js
test('detailHtml: moveset recomendado mostra ⚡ (ágil) e 💥 (carregado)', () => {
  const e = pvpStub({
    moves:['Bolha','Raio de Gelo'], height:0.5, weight:28.5, ivs:{atk:0,def:15,sta:15},
    pvpMeta: { great:{ isMeta:true, speciesRank:13, ivRank:1, spPct:1, movesetOk:true,
                       movesetView:[ {name:'Bolha',has:true,kind:'fast'},
                                     {name:'Raio de Gelo',has:true,kind:'charge'},
                                     {name:'Focinhada',has:false,kind:'charge'} ] },
               ultra:{isMeta:false}, master:{isMeta:false} },
  });
  const html = detailHtml(e);
  assert.match(html, /⚡\s*Bolha/);
  assert.match(html, /💥\s*Raio de Gelo/);
  assert.match(html, /💥\s*Focinhada \(falta\)/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/render.test.js`
Expected: FAIL — sem `⚡`/`💥` no HTML (movesetLabel ainda não usa `kind`).

- [ ] **Step 3: Implementar ícones no `movesetLabel`**

Em `pokemon/lib/render.js`, substitua a função `movesetLabel`:

```js
  // "⚡ Bolha ✓ · 💥 Jogo Duro (falta)" a partir do movesetView ([{name,has,kind}]).
  function movesetLabel(view) {
    return view.map(function (m) {
      const icon = m.kind === 'fast' ? '⚡' : '💥';
      return icon + ' ' + esc(m.name) + (m.has ? ' ✓' : ' (falta)');
    }).join(' · ');
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/render.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/render.js pokemon/test/render.test.js
git commit -m "feat: ícones ⚡/💥 distinguem ágil de carregado no moveset"
```

---

## Task 3: `_secondChargeTip` + `e.movesetTip` (recomendação do 2º carregado)

**Files:**
- Modify: `pokemon/lib/analysis.js` (nova função; anexo em `analyze` ~linha 510; default em `enrichOne` linha 120)
- Test: `pokemon/test/enrich.test.js`

- [ ] **Step 1: Testes falhos dos 3 casos (usa `metaAzumarill` da Task 1)**

No fim de `pokemon/test/enrich.test.js`, adicione:

```js
test('analyze: mon meta com 1 só carregado ganha e.movesetTip nomeando o 2º carregado', () => {
  const { meta, ms } = metaAzumarill();
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Bolha', mon_move_2:'Raio de Gelo' } }; // ágil + carregado1, falta carregado2
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.ok(e.movesetTip, 'tem movesetTip');
  assert.strictEqual(e.movesetTip.move, ms[2]);          // PLAY_ROUGH
  assert.match(e.movesetTip.reason, /2º carregado/);
  assert.match(e.movesetTip.reason, /Focinhada/);
});

test('analyze: mon meta com os 2 carregados → sem movesetTip', () => {
  const { meta } = metaAzumarill();
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Bolha', mon_move_2:'Raio de Gelo', mon_move_3:'Focinhada' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.movesetTip, null);
});

test('analyze: mon meta sem nenhum carregado → sem movesetTip (Ensinar/TM já cobre)', () => {
  const { meta } = metaAzumarill();
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Bolha' } }; // só ágil → movesetOk false
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.movesetTip, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/enrich.test.js`
Expected: FAIL — `e.movesetTip` é `undefined` (função/anexo ainda não existem).

- [ ] **Step 3: Adicionar `_secondChargeTip`**

Em `pokemon/lib/analysis.js`, logo após a função `_attachMovesetViews` (~linha 387), adicione:

```js
  // Aviso informativo (PvP): mon já tem moveset funcional mas falta o 2º carregado recomendado.
  // Não altera veredito/ação — só sugere desbloquear o 2º carregado. null se não se aplica.
  function _secondChargeTip(e, meta) {
    const lg = _bestPvpLeague(e);
    if (!lg || !e.pvpMeta) return null;
    const L = e.pvpMeta[lg];
    if (!L || !L.isMeta || !L.movesetOk || !L.moveset || L.moveset.length < 3) return null;
    const mine = e.moveIds || [];
    const charged = L.moveset.slice(1);                  // [carregado1, carregado2]
    const missing = charged.filter(function (c) { return mine.indexOf(c) < 0; });
    if (missing.length !== 1) return null;               // 0 = completo; 2 não ocorre (movesetOk exige >=1)
    return { move: missing[0], league: lg,
      reason: 'Desbloquear 2º carregado p/ ' + LEAGUE_PT[lg] + ': ' + _moveName(missing[0], meta) };
  }
```

- [ ] **Step 4: Anexar `e.movesetTip` em `analyze`**

Em `pokemon/lib/analysis.js`, na função `analyze`, logo após `e.tradeBoost = tradeBoost(e);` (~linha 510):

```js
      e.tradeBoost = tradeBoost(e);
      e.movesetTip = _secondChargeTip(e, meta);
```

- [ ] **Step 5: Inicializar `movesetTip: null` no objeto de `enrichOne`**

Em `pokemon/lib/analysis.js`, na linha 120, logo após `tradeBoost: null,`:

```js
      tradeBoost: null,
      movesetTip: null,
```

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test pokemon/test/enrich.test.js`
Expected: PASS (3 testes novos verdes).

- [ ] **Step 7: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/enrich.test.js
git commit -m "feat: e.movesetTip recomenda desbloquear o 2º carregado (PvP, informativo)"
```

---

## Task 4: Renderizar a linha `.moveset-tip` no card + CSS

**Files:**
- Modify: `pokemon/lib/render.js` (função `cardHtml`, ~linha 68)
- Modify: `pokemon/index.html` (CSS, ~linha 241)
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Testes falhos (linha presente / ausente)**

No fim de `pokemon/test/render.test.js`, adicione:

```js
test('cardHtml: linha moveset-tip aparece quando há e.movesetTip', () => {
  const html = cardHtml(pvpStub({ movesetTip:{ move:'PLAY_ROUGH', league:'great',
    reason:'Desbloquear 2º carregado p/ Liga Grande: Focinhada' } }));
  assert.match(html, /moveset-tip/);
  assert.match(html, /Desbloquear 2º carregado/);
  assert.match(html, /💥/);
});

test('cardHtml: sem movesetTip → sem linha moveset-tip (não-regressão)', () => {
  const html = cardHtml(pvpStub());
  assert.doesNotMatch(html, /moveset-tip/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test pokemon/test/render.test.js`
Expected: FAIL — sem `moveset-tip` no HTML.

- [ ] **Step 3: Renderizar a linha em `cardHtml`**

Em `pokemon/lib/render.js`, na função `cardHtml`, logo após a linha do `trade-tip` (linha 68), adicione a linha do `moveset-tip`:

```js
        (e.tradeBoost ? '<div class="trade-tip">🔁 ' + esc(e.tradeBoost.reason) + '</div>' : '') +
        (e.movesetTip ? '<div class="moveset-tip">💥 ' + esc(e.movesetTip.reason) + '</div>' : '') +
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test pokemon/test/render.test.js`
Expected: PASS.

- [ ] **Step 5: Adicionar CSS `.moveset-tip`**

Em `pokemon/index.html`, logo após a regra `.trade-tip` (linha 241):

```css
.trade-tip { font-size: 16px; line-height: 1.15; color: var(--petroleo); }
.moveset-tip { font-size: 16px; line-height: 1.15; color: var(--petroleo); }
```

- [ ] **Step 6: Commit**

```bash
git add pokemon/lib/render.js pokemon/index.html pokemon/test/render.test.js
git commit -m "feat: card mostra linha 'Desbloquear 2º carregado' (.moveset-tip)"
```

---

## Task 5: Bump do service worker + verificação final

**Files:**
- Modify: `pokemon/sw.js` (linha 1)

- [ ] **Step 1: Bump do cache v15 → v16**

Em `pokemon/sw.js`, linha 1:

```js
const CACHE = 'pokemon-leo-v16';
```

- [ ] **Step 2: Rodar a suíte Node completa**

Run: `node --test pokemon/test/`
Expected: PASS — todos os testes verdes, sem regressão.

- [ ] **Step 3: Verificação no navegador (lição da Fase 4 — `app.js` é wiring sem teste)**

Abrir `pokemon/index.html` com a coleção real e conferir:
- Bloco Competitivo de um mon meta: moveset com `⚡` no ágil e `💥` nos carregados.
- Um mon meta PvP com **só 1 carregado** (ex.: Azumarill com Bolha + Raio de Gelo, sem Focinhada): card mostra a linha `💥 Desbloquear 2º carregado p/ Liga Grande: <golpe>`.
- Um mon meta com os 2 carregados: **sem** a linha de 2º carregado.
- Linha PvE continua com `⚡`/`💥` (1 ágil + 1 carregado) e sem 2º carregado.

- [ ] **Step 4: Commit**

```bash
git add pokemon/sw.js
git commit -m "chore: bump do cache do SW (v16) para ágil/carregado + 2º carregado"
```

---

## Self-Review (preenchido)

**Spec coverage:**
- §3 (movesetView ganha `kind`) → Task 1.
- §4 (ícones ⚡/💥) → Task 2.
- §5 (`_secondChargeTip` + `e.movesetTip` + render) → Tasks 3 e 4.
- §6 (tabela de disparo) → 3 testes da Task 3 cobrem: 1 carregado (dispara), 2 carregados (null), 0 carregados (null). Casos "não-meta" e "moveset<3" são barrados pelos guards de `_secondChargeTip` (cobertos por código; não há liga meta com moveset<3 no dataset para testar via `analyze`).
- §7 (o que não muda) → nenhum task toca verdict/tags/`movesetOk`/motores; testes de não-regressão existentes (`enrich`/`verdict`/`render`) rodam na Task 5.
- §8 (bordas) → default `'charge'` (Task 1, Step 3); guards (Task 3, Step 3).
- §10 (verificação) → Task 5, Steps 2–3.

**Placeholder scan:** sem TBD/TODO; todo passo de código tem o código.

**Type consistency:** `movesetView` item = `{ name, has, kind }` (Task 1) consumido por `movesetLabel` via `m.kind` (Task 2). `e.movesetTip` = `{ move, league, reason }` (Task 3) consumido por `cardHtml` via `e.movesetTip.reason` (Task 4). `_secondChargeTip`/`_bestPvpLeague`/`LEAGUE_PT`/`_moveName` já existem ou são criados na própria Task 3.
