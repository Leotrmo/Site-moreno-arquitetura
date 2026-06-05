# Revisão da análise TRANSFERIR — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar a revisão da análise automática da página de Pokémons descrita em `docs/superpowers/specs/2026-06-05-revisao-analise-transferir-design.md`: expandir proteções (XS/XL comfort, 2º carregado, trade evo, regional) e adicionar comparador lado-a-lado no card TRANSFERIR.

**Architecture:** Mudanças incrementais em três arquivos de lógica (`pokemon/sizes.js`, `pokemon/lib/analysis.js`, `pokemon/lib/render.js`) e CSS em `pokemon/index.html`. Cada nova proteção é uma flag booleana no objeto enriquecido, agregada por `isProtected`. O comparador renderiza um snippet HTML dentro do `detailHtml` existente, ativado apenas para cards com veredito TRANSFERIR.

**Tech Stack:** JavaScript vanilla (sem build step), Node.js built-in test runner (`node --test`), HTML/CSS estático.

---

## File Structure

| Arquivo | Mudança | Responsabilidade |
|---|---|---|
| `pokemon/sizes.js` | Modificar | Adicionar `getPokemonSizeScalar(num, height, form)` ao lado do `getPokemonSize` existente. |
| `pokemon/lib/analysis.js` | Modificar | Adicionar campos `sizeScalar`, `isXSComfort`, `isXLComfort`, `hasSecondCharge` em `enrichOne`. Expandir `isProtected`. Reescrever `specialReason` com prioridade. Anexar `betterCopy` em `enrichCollection`. Ajustar texto da razão TRANSFERIR em `computeVerdict`. |
| `pokemon/lib/render.js` | Modificar | Adicionar badges XS/XL/⚡ em `badgesHtml`. Adicionar função `compareHtml(thisOne, best)`. Modificar `detailHtml` para incluir comparador quando `verdict === 'TRANSFERIR'`. |
| `pokemon/index.html` | Modificar | CSS para `.pk-compare` (tabela grid 3 colunas, marcadores ✔/✖). |
| `pokemon/test/enrich.test.js` | Modificar | Testes para sizeScalar, isXSComfort, isXLComfort, hasSecondCharge. |
| `pokemon/test/verdict.test.js` | Modificar | Testes para novas proteções e caso-pivô dos dois Xatus. |
| `pokemon/test/render.test.js` | Modificar | Testes para novas badges e comparador. |

---

## Task 1: Expor `getPokemonSizeScalar` em `sizes.js`

**Files:**
- Modify: `pokemon/sizes.js:178-195`
- Test: `pokemon/test/enrich.test.js` (já existe)

- [ ] **Step 1: Escrever o teste falhando**

Adicionar ao final de `pokemon/test/enrich.test.js`:

```js
const { getPokemonSizeScalar } = require('../sizes.js');

test('sizeScalar = altura / altura-base', () => {
  // Xatu #178, base 1.5m
  assert.strictEqual(getPokemonSizeScalar(178, 0.95).toFixed(3), '0.633');
  assert.strictEqual(getPokemonSizeScalar(178, 1.17).toFixed(3), '0.780');
});

test('sizeScalar usa BASE_H_FORMS quando há forma', () => {
  // SANDSHREW_ALOLA base 0.7m
  assert.strictEqual(getPokemonSizeScalar(27, 0.35, 'SANDSHREW_ALOLA').toFixed(3), '0.500');
});

test('sizeScalar retorna null quando espécie desconhecida', () => {
  assert.strictEqual(getPokemonSizeScalar(99999, 1.0), null);
});
```

- [ ] **Step 2: Rodar teste e confirmar que falha**

Comando: `cd pokemon && npm test`
Esperado: 3 testes novos falhando com `TypeError: getPokemonSizeScalar is not a function`.

- [ ] **Step 3: Implementar `getPokemonSizeScalar` em `sizes.js`**

Substituir o bloco final de `pokemon/sizes.js` (linhas 178–195) por:

```js
function resolveBaseHeight(monNumber, monForm) {
  if (monForm) {
    const formKey = Object.keys(BASE_H_FORMS).find(k => monForm.includes(k));
    if (formKey) return BASE_H_FORMS[formKey];
  }
  return BASE_H[monNumber] || null;
}

/**
 * Calcula a categoria de tamanho de um Pokémon.
 * @returns {string|null} 'XXS'|'XS'|'XL'|'XXL' ou null para Normal/desconhecido
 */
function getPokemonSize(monNumber, monHeight, monForm) {
  const baseH = resolveBaseHeight(monNumber, monForm);
  if (!baseH) return null;
  const scalar = monHeight / baseH;
  for (const t of SIZE_THRESHOLDS) {
    if (scalar < t.max) return t.label;
  }
  return 'XXL';
}

/**
 * Calcula o size scalar (altura / altura-base).
 * @returns {number|null} número ou null se espécie/forma desconhecida.
 */
function getPokemonSizeScalar(monNumber, monHeight, monForm) {
  const baseH = resolveBaseHeight(monNumber, monForm);
  if (!baseH) return null;
  return monHeight / baseH;
}

if (typeof module !== 'undefined') module.exports = { getPokemonSize, getPokemonSizeScalar, BASE_H };
```

- [ ] **Step 4: Rodar testes e confirmar que passam**

Comando: `cd pokemon && npm test`
Esperado: todos os testes passam, inclusive os 3 novos.

- [ ] **Step 5: Commit**

```bash
git add pokemon/sizes.js pokemon/test/enrich.test.js
git commit -m "pokemon: expõe getPokemonSizeScalar em sizes.js"
```

---

## Task 2: Adicionar `sizeScalar`, `isXSComfort`, `isXLComfort`, `hasSecondCharge` em `enrichOne`

**Files:**
- Modify: `pokemon/lib/analysis.js:21-58` (função `enrichOne`)
- Test: `pokemon/test/enrich.test.js`

- [ ] **Step 1: Escrever os testes falhando**

No topo de `pokemon/test/enrich.test.js`, a linha `const { getPokemonSize } = require('../sizes.js');` precisa virar:

```js
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
```

(O `getPokemonSizeScalar` foi exportado na Task 1.)

Adicionar ao final do arquivo:

```js
test('isXSComfort: scalar < 0.70 e size XS', () => {
  // Xatu #178 base 1.5, height 0.95 → scalar 0.633 → XS
  const xs = enrichOne({ mon_name:'Xatu', mon_number:178, mon_cp:909, mon_attack:13, mon_defence:11, mon_stamina:12, mon_height:0.95, mon_isShiny:'NO', mon_isLucky:'NO' }, getPokemonSize, refdata, getPokemonSizeScalar);
  assert.strictEqual(xs.size, 'XS');
  assert.strictEqual(xs.isXSComfort, true);
});

test('isXSComfort: scalar 0.78 (fronteira XS) NÃO entra', () => {
  // Xatu #178 base 1.5, height 1.17 → scalar 0.780 → XS no jogo, mas fronteira
  const xs = enrichOne({ mon_name:'Xatu', mon_number:178, mon_cp:1482, mon_attack:13, mon_defence:14, mon_stamina:8, mon_height:1.17, mon_isShiny:'NO', mon_isLucky:'NO' }, getPokemonSize, refdata, getPokemonSizeScalar);
  assert.strictEqual(xs.isXSComfort, false);
});

test('isXLComfort: scalar > 1.40 e size XL', () => {
  // Machop #66 base 0.8, height 1.20 → scalar 1.5 → XL
  const xl = enrichOne(baseMon({ mon_height:1.2 }), getPokemonSize, refdata, getPokemonSizeScalar);
  assert.strictEqual(xl.size, 'XL');
  assert.strictEqual(xl.isXLComfort, true);
});

test('hasSecondCharge: presente quando mon_move_3 existe', () => {
  assert.strictEqual(enrichOne(baseMon(), getPokemonSize, refdata, getPokemonSizeScalar).hasSecondCharge, false);
  assert.strictEqual(enrichOne(baseMon({ mon_move_3:'Soco Dinâmico' }), getPokemonSize, refdata, getPokemonSizeScalar).hasSecondCharge, true);
});

test('sizeScalar é exposto no objeto enriquecido', () => {
  const e = enrichOne(baseMon({ mon_height:0.8 }), getPokemonSize, refdata, getPokemonSizeScalar);
  // Machop #66 base 0.8 → scalar 1.0
  assert.strictEqual(e.sizeScalar.toFixed(2), '1.00');
});
```

Os testes existentes (que ainda chamam `enrichOne` com 3 args) continuam funcionando — `getSizeScalar === undefined` será silenciosamente ignorado quando a implementação chegar (Step 3). Não precisa modificar testes antigos.

- [ ] **Step 2: Rodar testes e confirmar que falham**

Comando: `cd pokemon && npm test`
Esperado: testes novos falhando com `assert.strictEqual` recebendo `undefined` para `isXSComfort`, `isXLComfort`, `hasSecondCharge`, `sizeScalar`.

- [ ] **Step 3: Implementar mudanças em `enrichOne`**

Em `pokemon/lib/analysis.js`, no topo do arquivo (logo antes de `function ivPct`):

```js
function speciesScalar(getSizeScalar, mon) {
  if (typeof getSizeScalar !== 'function') return null;
  return getSizeScalar(mon.mon_number, mon.mon_height, mon.mon_form) || null;
}
```

Modificar `enrichOne` (linhas 21–58 originais) — adicionar parâmetro opcional `getSizeScalar` e os novos campos:

```js
function enrichOne(mon, getSize, refdata, getSizeScalar) {
  const iv = ivPct(mon);
  const size = getSize(mon.mon_number, mon.mon_height, mon.mon_form);
  const scalar = speciesScalar(getSizeScalar, mon);
  return {
    raw: mon,
    name: mon.mon_name,
    number: mon.mon_number,
    form: mon.mon_form || null,
    cp: mon.mon_cp,
    ivPct: iv,
    ivs: { atk: mon.mon_attack, def: mon.mon_defence, sta: mon.mon_stamina },
    moves: [mon.mon_move_1, mon.mon_move_2, mon.mon_move_3].filter(Boolean),
    height: mon.mon_height,
    weight: mon.mon_weight,
    pvp: mon.mon_pvp_stats || null,
    size: size,
    sizeScalar: scalar,
    isShiny: mon.mon_isShiny === 'YES',
    isLucky: mon.mon_isLucky === 'YES',
    isShadow: mon.mon_alignment === 'SHADOW',
    isPurified: mon.mon_alignment === 'PURIFIED',
    isLegendary: refdata.LEGENDARY.has(mon.mon_number),
    isCostume: !!mon.mon_costume,
    isExtremeSize: size === 'XXS' || size === 'XXL',
    isXSComfort: size === 'XS' && scalar !== null && scalar < 0.70,
    isXLComfort: size === 'XL' && scalar !== null && scalar > 1.40,
    hasSecondCharge: !!mon.mon_move_3,
    isHundo: iv === 100,
    isNearPerfect: iv >= 96,
    isRegional: refdata.REGIONAL.has(mon.mon_number),
    isTradeEvo: refdata.TRADE_EVO.has(mon.mon_number),
    speciesKey: speciesKey(mon),
    id: null,
    isBestOfSpecies: false,
    isOnlyCopy: false,
    betterCopy: null,
    verdict: null,
    reason: null,
    tags: [],
  };
}
```

(Os testes da Step 1 já passam `getPokemonSizeScalar` como 4º argumento.)

- [ ] **Step 4: Rodar testes e confirmar que passam**

Comando: `cd pokemon && npm test`
Esperado: todos passam. Confira em particular: `isXSComfort: scalar 0.78 NÃO entra` deve passar (fronteira não conta).

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/enrich.test.js
git commit -m "pokemon: enriquece com sizeScalar, isXS/XLComfort, hasSecondCharge"
```

---

## Task 3: Propagar `getSizeScalar` em `analyze` e `enrichCollection`

**Files:**
- Modify: `pokemon/lib/analysis.js:60-76` (`enrichCollection`), `:122-131` (`analyze`)

- [ ] **Step 1: Escrever o teste falhando**

Adicionar em `pokemon/test/enrich.test.js`:

```js
const { analyze } = require('../lib/analysis.js');

test('analyze propaga sizeScalar via getSizeScalar opcional', () => {
  const fd = { x: { mon_name:'Xatu', mon_number:178, mon_cp:909, mon_attack:13, mon_defence:11, mon_stamina:12, mon_height:0.95, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar);
  assert.strictEqual(list[0].isXSComfort, true);
});
```

- [ ] **Step 2: Rodar teste e confirmar que falha**

Comando: `cd pokemon && npm test`
Esperado: `isXSComfort` virá `false` porque `enrichCollection` ainda não passa `getSizeScalar`.

- [ ] **Step 3: Implementar propagação**

Em `pokemon/lib/analysis.js`, modificar `enrichCollection` para aceitar e propagar `getSizeScalar`:

```js
function enrichCollection(fileData, getSize, refdata, getSizeScalar) {
  const list = Object.keys(fileData).map(id => {
    const e = enrichOne(fileData[id], getSize, refdata, getSizeScalar);
    e.id = id;
    return e;
  });
  const groups = {};
  for (const e of list) (groups[e.speciesKey] = groups[e.speciesKey] || []).push(e);
  for (const key in groups) {
    const g = groups[key];
    g.sort((a, b) => (b.ivPct - a.ivPct) || (b.cp - a.cp));
    g[0].isBestOfSpecies = true;
    const only = g.length === 1;
    for (const e of g) {
      e.isOnlyCopy = only;
      if (!e.isBestOfSpecies) e.betterCopy = g[0];
    }
  }
  return list;
}
```

E `analyze`:

```js
function analyze(fileData, getSize, refdata, getSizeScalar) {
  const list = enrichCollection(fileData, getSize, refdata, getSizeScalar);
  for (const e of list) {
    const v = computeVerdict(e);
    e.verdict = v.verdict;
    e.reason = v.reason;
    e.tags = computeTags(e);
  }
  return list;
}
```

- [ ] **Step 4: Rodar teste e confirmar que passa**

Comando: `cd pokemon && npm test`
Esperado: todos passam, incluindo o novo.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/enrich.test.js
git commit -m "pokemon: analyze propaga getSizeScalar e anexa betterCopy"
```

---

## Task 4: Expandir `isProtected` com novas proteções

**Files:**
- Modify: `pokemon/lib/analysis.js:78-81`
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Escrever os testes falhando**

Adicionar ao final de `pokemon/test/verdict.test.js`:

```js
const { getPokemonSizeScalar } = require('../sizes.js');

function verdictOfFull(fileData, id) {
  const list = analyze(fileData, getPokemonSize, refdata, getPokemonSizeScalar);
  return list.find(e => e.id === id);
}

test('XS comfort (scalar 0.63) protege duplicata pior', () => {
  // Xatu 1 XS comfort vs Xatu 2 normal com IV maior
  const fd = {
    a: { mon_name:'Xatu', mon_number:178, mon_cp:909,  mon_attack:13, mon_defence:11, mon_stamina:12, mon_height:0.95, mon_isShiny:'NO', mon_isLucky:'NO' }, // XS comfort
    b: { mon_name:'Xatu', mon_number:178, mon_cp:1500, mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:1.5,  mon_isShiny:'NO', mon_isLucky:'NO' }, // 100%
  };
  // a tem IV menor mas é XS comfort → MANTER
  assert.strictEqual(verdictOfFull(fd,'a').verdict, 'MANTER');
  assert.match(verdictOfFull(fd,'a').reason, /XS/);
});

test('XL comfort protege duplicata pior', () => {
  const fd = {
    big:  { mon_name:'Machop', mon_number:66, mon_cp:100, mon_attack:0, mon_defence:0, mon_stamina:0, mon_height:1.2, mon_isShiny:'NO', mon_isLucky:'NO' }, // scalar 1.5 = XL comfort
    best: { mon_name:'Machop', mon_number:66, mon_cp:500, mon_attack:14,mon_defence:14,mon_stamina:14, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOfFull(fd,'big').verdict, 'MANTER');
  assert.match(verdictOfFull(fd,'big').reason, /XL/);
});

test('XS fronteira (scalar 0.78) NÃO protege', () => {
  // Xatu height 1.17 → scalar 0.78 → XS, mas fora do comfort
  const fd = {
    edge: { mon_name:'Xatu', mon_number:178, mon_cp:1482, mon_attack:13, mon_defence:14, mon_stamina:8, mon_height:1.17, mon_isShiny:'NO', mon_isLucky:'NO' }, // 77.8%
    best: { mon_name:'Xatu', mon_number:178, mon_cp:1500, mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:1.5,  mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOfFull(fd,'edge').verdict, 'TRANSFERIR');
});

test('mon_move_3 (2º carregado) protege duplicata pior', () => {
  const fd = {
    inv:  { mon_name:'Pidgey', mon_number:16, mon_cp:80,  mon_attack:0, mon_defence:0, mon_stamina:0, mon_height:0.3, mon_move_1:'Tackle', mon_move_2:'Quick Attack', mon_move_3:'Air Cutter', mon_isShiny:'NO', mon_isLucky:'NO' },
    best: { mon_name:'Pidgey', mon_number:16, mon_cp:500, mon_attack:14,mon_defence:14,mon_stamina:14, mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOfFull(fd,'inv').verdict, 'MANTER');
  assert.match(verdictOfFull(fd,'inv').reason, /2º|investido/i);
});

test('Trade evo protege duplicata pior', () => {
  // Machoke #67 está em TRADE_EVO
  const fd = {
    te:   { mon_name:'Machoke', mon_number:67, mon_cp:80,  mon_attack:0, mon_defence:0, mon_stamina:0, mon_height:1.5, mon_isShiny:'NO', mon_isLucky:'NO' },
    best: { mon_name:'Machoke', mon_number:67, mon_cp:900, mon_attack:14,mon_defence:14,mon_stamina:14, mon_height:1.5, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOfFull(fd,'te').verdict, 'MANTER');
  assert.match(verdictOfFull(fd,'te').reason, /[Tt]rade|troca/);
});

test('Regional protege duplicata pior', () => {
  // Tauros #128 está em REGIONAL
  const fd = {
    rg:   { mon_name:'Tauros', mon_number:128, mon_cp:80,  mon_attack:0, mon_defence:0, mon_stamina:0, mon_height:1.4, mon_isShiny:'NO', mon_isLucky:'NO' },
    best: { mon_name:'Tauros', mon_number:128, mon_cp:900, mon_attack:14,mon_defence:14,mon_stamina:14, mon_height:1.4, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOfFull(fd,'rg').verdict, 'MANTER');
  assert.match(verdictOfFull(fd,'rg').reason, /[Rr]egional/);
});
```

**Antes de rodar, verifique:** `refdata.TRADE_EVO` contém 67 (Machoke) e `refdata.REGIONAL` contém 128 (Tauros). Se não, ajuste o número do Pokémon para um que esteja nos Sets.

- [ ] **Step 2: Rodar testes e confirmar que falham**

Comando: `cd pokemon && npm test`
Esperado: falhas — os Pokémons protegidos ainda caem em TRANSFERIR porque `isProtected` não inclui os novos sinais.

- [ ] **Step 3: Expandir `isProtected`**

Em `pokemon/lib/analysis.js`, substituir `isProtected` (linhas 78–81):

```js
function isProtected(e) {
  return e.isShiny || e.isLucky || e.isShadow || e.isLegendary
      || e.isCostume || e.isExtremeSize || e.isHundo || e.isNearPerfect
      || e.isXSComfort || e.isXLComfort
      || e.hasSecondCharge
      || e.isTradeEvo || e.isRegional;
}
```

- [ ] **Step 4: Rodar testes**

Comando: `cd pokemon && npm test`
Esperado: testes de proteção passam; testes de razão (`match /XS/`, `/XL/`, `/2º|investido/i`, `/[Tt]rade|troca/`, `/[Rr]egional/`) **podem ainda falhar** se `specialReason` não retornar esses textos. Se falharem, é o esperado — Task 5 resolve.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "pokemon: isProtected inclui XS/XL comfort, 2º carregado, trade evo, regional"
```

---

## Task 5: Reescrever `specialReason` com novas razões e prioridade

**Files:**
- Modify: `pokemon/lib/analysis.js:89-97`

- [ ] **Step 1: Os testes de razão da Task 4 servem como testes desta task**

Os testes `match /XS/`, `/XL/`, `/2º|investido/i`, `/[Tt]rade|troca/`, `/[Rr]egional/` da Task 4 já estão no arquivo. Eles devem estar falhando agora porque `specialReason` não cobre os novos casos.

- [ ] **Step 2: Rodar testes para confirmar falha**

Comando: `cd pokemon && npm test`
Esperado: pelo menos os 5 testes de razão (XS, XL, 2º carregado, Trade evo, Regional) falham.

- [ ] **Step 3: Implementar `specialReason` com prioridade**

Em `pokemon/lib/analysis.js`, substituir a função `specialReason` (linhas 89–97):

```js
// Prioridade (mais forte → mais fraca): Hundo > Quase-perfeito > Shiny >
// Lendário > Lucky > Shadow > Costume > XXS/XXL > XS/XL comfort >
// 2º carregado > Trade evo > Regional.
function specialReason(e) {
  if (e.isHundo)        return 'Perfeito (15/15/15)';
  if (e.isNearPerfect)  return 'Quase perfeito (' + e.ivPct + '%)';
  if (e.isShiny)        return 'Shiny — protegido';
  if (e.isLegendary)    return 'Lendário/mítico';
  if (e.isLucky)        return 'Lucky — protegido';
  if (e.isShadow)       return 'Sombrio — protegido';
  if (e.isCostume)      return 'Fantasia — colecionável';
  if (e.isExtremeSize)  return 'Tamanho ' + e.size + ' — raro';
  if (e.isXSComfort)    return 'XS — colecionável';
  if (e.isXLComfort)    return 'XL — colecionável';
  if (e.hasSecondCharge)return 'Tem 2º carregado — investido';
  if (e.isTradeEvo)     return 'Trade evolution — guarde pra troca';
  if (e.isRegional)     return 'Regional — raro de pegar';
  return 'Especial';
}
```

- [ ] **Step 4: Rodar testes e confirmar que passam**

Comando: `cd pokemon && npm test`
Esperado: todos os testes da Task 4 e desta task passam.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js
git commit -m "pokemon: specialReason cobre todas as novas proteções com prioridade"
```

---

## Task 6: Texto da razão TRANSFERIR — "Você já tem um {nome} melhor"

**Files:**
- Modify: `pokemon/lib/analysis.js:99-113` (função `computeVerdict`)
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Escrever o teste falhando**

Adicionar em `pokemon/test/verdict.test.js`:

```js
test('TRANSFERIR mostra mensagem clara apontando para o melhor', () => {
  const fd = {
    best:  { mon_name:'Pidgey', mon_number:16, mon_cp:300, mon_attack:14, mon_defence:14, mon_stamina:14, mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' },
    trash: { mon_name:'Pidgey', mon_number:16, mon_cp:80,  mon_attack:2,  mon_defence:5,  mon_stamina:7,  mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const t = verdictOfFull(fd,'trash');
  assert.strictEqual(t.verdict, 'TRANSFERIR');
  assert.match(t.reason, /Você já tem um Pidgey melhor/);
});
```

- [ ] **Step 2: Rodar teste e confirmar que falha**

Comando: `cd pokemon && npm test`
Esperado: `reason` continua sendo `"Duplicata pior · IV X% · nada especial"`.

- [ ] **Step 3: Atualizar `computeVerdict`**

Em `pokemon/lib/analysis.js`, substituir o último `if` de `computeVerdict` (linhas 110–112):

```js
    if (e.ivPct < 80)
      return { verdict: 'TRANSFERIR', reason: 'Você já tem um ' + e.name + ' melhor' };
    return { verdict: 'MANTER', reason: 'Duplicata ok (IV ' + e.ivPct + '%)' };
```

- [ ] **Step 4: Rodar testes**

Comando: `cd pokemon && npm test`
Esperado: novo teste passa. **Atenção:** o teste antigo `'duplicata pior, IV<80, nada especial → TRANSFERIR'` (linha 27 do verdict.test.js original) ainda passa porque só checa `verdict === 'TRANSFERIR'`, não a razão.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "pokemon: razão TRANSFERIR aponta para o melhor da espécie"
```

---

## Task 7: Badges XS, XL e ⚡ em `render.js`

**Files:**
- Modify: `pokemon/lib/render.js:13-29` (função `badgesHtml`)
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Escrever os testes falhando**

Adicionar em `pokemon/test/render.test.js`:

```js
const { getPokemonSizeScalar } = require('../sizes.js');

function oneFull(over) {
  const fd = { x: Object.assign({ mon_name:'Machop', mon_number:66, mon_cp:500,
    mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' }, over) };
  return analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar)[0];
}

test('badge XS aparece para XS comfort', () => {
  // Xatu #178 base 1.5, height 0.95 → XS comfort
  const html = badgesHtml(oneFull({ mon_name:'Xatu', mon_number:178, mon_height:0.95 }));
  assert.match(html, />XS</);
});

test('badge XL aparece para XL comfort', () => {
  // Machop #66 base 0.8, height 1.2 → scalar 1.5 → XL comfort
  const html = badgesHtml(oneFull({ mon_height:1.2 }));
  assert.match(html, />XL</);
});

test('badge ⚡ aparece quando tem 2º carregado', () => {
  const html = badgesHtml(oneFull({ mon_move_3:'Soco Dinâmico' }));
  assert.match(html, /⚡/);
});

test('XS comfort não aparece quando size é XXS (extremo)', () => {
  // Wailmer #320 base 2.0, height 0.5 → scalar 0.25 → XXS (não XS comfort)
  const html = badgesHtml(oneFull({ mon_name:'Wailmer', mon_number:320, mon_height:0.5, mon_attack:14, mon_defence:14, mon_stamina:14 }));
  assert.match(html, />XXS</);
  assert.doesNotMatch(html, />XS</); // não tem badge XS solto
});
```

- [ ] **Step 2: Rodar testes e confirmar que falham**

Comando: `cd pokemon && npm test`
Esperado: os 3 primeiros testes falham (sem badge XS/XL/⚡); o último pode passar acidentalmente — verifique a regex.

**Nota sobre o último teste:** `>XS<` faz match em `>XXS<` também? Não — `>XS<` exige exatamente os caracteres `>`, `X`, `S`, `<` em sequência. Em `>XXS<` a sequência é `>`, `X`, `X`, `S`, `<` — não bate. Confirmado: o teste é correto.

- [ ] **Step 3: Modificar `badgesHtml`**

Em `pokemon/lib/render.js`, substituir `badgesHtml` (linhas 13–29):

```js
function badgesHtml(e) {
  const b = [];
  if (e.isHundo)    b.push('<span class="badge b-hundo">★</span>');
  if (e.isShiny)    b.push('<span class="badge b-shiny">✨</span>');
  if (e.isShadow)   b.push('<span class="badge b-shadow">👻</span>');
  if (e.isPurified) b.push('<span class="badge b-purified">💧</span>');
  if (e.isLucky)    b.push('<span class="badge b-lucky">🍀</span>');
  if (e.isLegendary)b.push('<span class="badge b-legendary">👑</span>');
  if (e.isCostume)  b.push('<span class="badge b-costume">🎭</span>');
  if (e.size === 'XXS' || e.size === 'XXL') b.push('<span class="badge b-size">' + e.size + '</span>');
  else if (e.isXSComfort) b.push('<span class="badge b-size">XS</span>');
  else if (e.isXLComfort) b.push('<span class="badge b-size">XL</span>');
  if (e.hasSecondCharge) b.push('<span class="badge b-2nd">⚡</span>');
  if (e.tags.includes('TROCAR_EVO')) b.push('<span class="badge b-trade">🤝</span>');
  if (e.tags.includes('REGIONAL'))   b.push('<span class="badge b-regional">🌍</span>');
  return b.join('');
}
```

- [ ] **Step 4: Rodar testes e confirmar que passam**

Comando: `cd pokemon && npm test`
Esperado: todos passam.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/render.js pokemon/test/render.test.js
git commit -m "pokemon: badges XS, XL e ⚡ no render"
```

---

## Task 8: CSS do comparador em `index.html`

**Files:**
- Modify: `pokemon/index.html` (bloco `<style>`)

- [ ] **Step 1: Adicionar CSS no bloco `<style>` (depois das regras de `.pk-detail`)**

Procure em `pokemon/index.html` por uma regra existente com `.pk-detail` ou `.pk {`. Adicione logo após:

```css
/* Comparador (card TRANSFERIR expandido) */
.pk-compare { margin-top:10px; background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:10px; }
.pk-compare h4 { font-size:11px; text-transform:uppercase; letter-spacing:.4px; color:var(--text-dim); margin-bottom:8px; font-weight:700; }
.pk-compare .row { display:grid; grid-template-columns: 80px 1fr 24px 1fr; gap:6px; align-items:center; padding:4px 0; border-bottom:1px solid var(--border); font-size:12px; }
.pk-compare .row:last-child { border-bottom:0; }
.pk-compare .lbl { color:var(--text-dim); }
.pk-compare .val { color:var(--text); font-weight:600; }
.pk-compare .vs  { text-align:center; color:var(--text-dim); font-size:10px; }
.pk-compare .win { color:var(--green); }
.pk-compare .lose { color:var(--red); }
.pk-compare .moves { font-weight:400; font-size:11px; line-height:1.3; }
.pk-compare .header { color:var(--text-dim); font-size:10px; text-transform:uppercase; letter-spacing:.4px; }
```

**Nota:** não há teste automatizado para CSS — verificação manual no Step 3.

- [ ] **Step 2: Verificar que os testes existentes continuam passando**

Comando: `cd pokemon && npm test`
Esperado: nenhuma regressão (HTML/CSS isolado, sem efeito nos testes).

- [ ] **Step 3: Abrir `pokemon/index.html` no navegador**

Comando (Windows PowerShell): `Start-Process "pokemon/index.html"`

Esperado: a página carrega normalmente sem erros no console. (O comparador ainda não aparece — falta as Tasks 9–10.)

- [ ] **Step 4: Commit**

```bash
git add pokemon/index.html
git commit -m "pokemon: CSS do comparador (.pk-compare)"
```

---

## Task 9: Função `compareHtml(thisOne, best)` em `render.js`

**Files:**
- Modify: `pokemon/lib/render.js` (adicionar função antes do `return` final)
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Escrever os testes falhando**

Adicionar em `pokemon/test/render.test.js`:

```js
const { compareHtml } = require('../lib/render.js');

function pair(thisOver, bestOver) {
  const fd = {
    a: Object.assign({ mon_name:'Xatu', mon_number:178, mon_cp:1482, mon_attack:13, mon_defence:14, mon_stamina:8,  mon_height:1.17, mon_isShiny:'NO', mon_isLucky:'NO' }, thisOver),
    b: Object.assign({ mon_name:'Xatu', mon_number:178, mon_cp:909,  mon_attack:13, mon_defence:11, mon_stamina:12, mon_height:0.95, mon_isShiny:'NO', mon_isLucky:'NO' }, bestOver),
  };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar);
  return { thisOne: list.find(e => e.id === 'a'), best: list.find(e => e.id === 'b') };
}

test('compareHtml mostra ambos os PCs sem ✔/✖', () => {
  const { thisOne, best } = pair();
  const html = compareHtml(thisOne, best);
  assert.match(html, /1482/);
  assert.match(html, /909/);
  // PC não recebe marcador
  const pcRow = html.split('\n').find(l => /PC/.test(l)) || html;
  assert.doesNotMatch(pcRow, /class="[^"]*\b(win|lose)\b/);
});

test('compareHtml: IV total — vencedor recebe .win, perdedor .lose', () => {
  const { thisOne, best } = pair();
  const html = compareHtml(thisOne, best);
  // thisOne IV 77%, best IV 80% → best vence
  assert.match(html, /80%[^<]*<\/span>[\s\S]*?class="[^"]*\bwin\b/);
  // não vou assertar posição exata, mas ambos os marcadores aparecem
  assert.match(html, /\bwin\b/);
  assert.match(html, /\blose\b/);
});

test('compareHtml: linhas empatadas ficam neutras (Atk 13 vs 13)', () => {
  const { thisOne, best } = pair();
  const html = compareHtml(thisOne, best);
  // Atk é 13 nos dois — não deve ter win/lose na linha de Atk
  // Estratégia: a linha de Atk não pode conter "win" ou "lose"
  const atkRowMatch = html.match(/Atk[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(atkRowMatch, 'linha de Atk não encontrada');
  assert.doesNotMatch(atkRowMatch[0], /\b(win|lose)\b/);
});

test('compareHtml lista ataques de cada lado', () => {
  const { thisOne, best } = pair({ mon_move_1:'Bicada', mon_move_2:'Vento Ominoso' }, { mon_move_1:'Golpe de Ar', mon_move_2:'Ás dos Ares' });
  const html = compareHtml(thisOne, best);
  assert.match(html, /Bicada/);
  assert.match(html, /Vento Ominoso/);
  assert.match(html, /Golpe de Ar/);
  assert.match(html, /Ás dos Ares/);
});

test('compareHtml: 2º carregado — ✔ pra quem tem, ✖ pra quem não tem', () => {
  const { thisOne, best } = pair({ mon_move_3:'Sky Attack' }, {});
  const html = compareHtml(thisOne, best);
  // O lado com move_3 deve ter classe win em 2º carregado
  assert.match(html, /2º carr[\s\S]*?\bwin\b/);
});
```

- [ ] **Step 2: Rodar testes e confirmar que falham**

Comando: `cd pokemon && npm test`
Esperado: `compareHtml is not a function` ou similar.

- [ ] **Step 3: Implementar `compareHtml`**

Em `pokemon/lib/render.js`, adicionar antes do `return { ... }` final:

```js
function cmpRow(label, vThis, vBest, winner) {
  // winner: 'this' | 'best' | null (neutro). null para linhas que nunca marcam (PC, ataques, badges).
  const cThis = winner === 'this' ? 'val win' : (winner === 'best' ? 'val lose' : 'val');
  const cBest = winner === 'best' ? 'val win' : (winner === 'this' ? 'val lose' : 'val');
  return (
    '<div class="row">' +
      '<span class="lbl">' + esc(label) + '</span>' +
      '<span class="' + cThis + '">' + vThis + '</span>' +
      '<span class="vs">vs</span>' +
      '<span class="' + cBest + '">' + vBest + '</span>' +
    '</div>'
  );
}

function winnerByNumber(a, b) {
  if (a === b) return null;
  return a > b ? 'this' : 'best';
}

function winnerBySpecialSize(a, b) {
  // 'XS' | 'XL' | 'XXS' | 'XXL' ganha contra null/normal. Tamanho igual = neutro.
  const aSpecial = !!a;
  const bSpecial = !!b;
  if (aSpecial === bSpecial) return null; // ambos especiais ou ambos normais
  return aSpecial ? 'this' : 'best';
}

function winnerByBool(a, b) {
  if (a === b) return null;
  return a ? 'this' : 'best';
}

function sizeLabel(e) {
  if (e.size) return e.size;
  return 'Normal';
}

function badgeListPlain(e) {
  const parts = [];
  if (e.isHundo) parts.push('Hundo');
  if (e.isShiny) parts.push('Shiny');
  if (e.isLucky) parts.push('Lucky');
  if (e.isShadow) parts.push('Sombrio');
  if (e.isLegendary) parts.push('Lendário');
  if (e.isCostume) parts.push('Fantasia');
  if (e.isTradeEvo) parts.push('Trade');
  if (e.isRegional) parts.push('Regional');
  return parts.length ? parts.join(' · ') : '—';
}

function compareHtml(thisOne, best) {
  if (!best) return '';
  const rows = [];
  rows.push(cmpRow('PC',     thisOne.cp, best.cp, null));
  rows.push(cmpRow('IV total', thisOne.ivPct + '%', best.ivPct + '%', winnerByNumber(thisOne.ivPct, best.ivPct)));
  rows.push(cmpRow('Atk',    thisOne.ivs.atk, best.ivs.atk, winnerByNumber(thisOne.ivs.atk, best.ivs.atk)));
  rows.push(cmpRow('Def',    thisOne.ivs.def, best.ivs.def, winnerByNumber(thisOne.ivs.def, best.ivs.def)));
  rows.push(cmpRow('HP',     thisOne.ivs.sta, best.ivs.sta, winnerByNumber(thisOne.ivs.sta, best.ivs.sta)));
  rows.push(cmpRow('Tamanho', esc(sizeLabel(thisOne)), esc(sizeLabel(best)), winnerBySpecialSize(thisOne.size, best.size)));
  rows.push(cmpRow('2º carr.', thisOne.hasSecondCharge ? 'sim' : 'não', best.hasSecondCharge ? 'sim' : 'não', winnerByBool(thisOne.hasSecondCharge, best.hasSecondCharge)));
  // Ataques: linha sem marcador
  const movesThis = thisOne.moves.map(esc).join('<br>') || '—';
  const movesBest = best.moves.map(esc).join('<br>') || '—';
  rows.push(
    '<div class="row">' +
      '<span class="lbl">Ataques</span>' +
      '<span class="val moves">' + movesThis + '</span>' +
      '<span class="vs">vs</span>' +
      '<span class="val moves">' + movesBest + '</span>' +
    '</div>'
  );
  rows.push(cmpRow('Badges', badgeListPlain(thisOne), badgeListPlain(best), null));
  return (
    '<div class="pk-compare">' +
      '<h4>Este vs o melhor da espécie</h4>' +
      '<div class="row header"><span class="lbl"></span><span class="val">Este</span><span class="vs"></span><span class="val">Melhor</span></div>' +
      rows.join('') +
    '</div>'
  );
}
```

E atualizar o `return` final do módulo para incluir `compareHtml`:

```js
return { esc, badgesHtml, cardHtml, detailHtml, ivClass, compareHtml };
```

- [ ] **Step 4: Rodar testes e confirmar que passam**

Comando: `cd pokemon && npm test`
Esperado: todos passam.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/render.js pokemon/test/render.test.js
git commit -m "pokemon: compareHtml — comparador lado-a-lado"
```

---

## Task 10: Wire do comparador em `detailHtml` (só para TRANSFERIR)

**Files:**
- Modify: `pokemon/lib/render.js:59-70` (função `detailHtml`)
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Escrever o teste falhando**

Adicionar em `pokemon/test/render.test.js`:

```js
const { detailHtml } = require('../lib/render.js');

test('detailHtml inclui comparador quando verdict é TRANSFERIR', () => {
  const fd = {
    trash: { mon_name:'Pidgey', mon_number:16, mon_cp:80,  mon_attack:2,  mon_defence:5,  mon_stamina:7,  mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' },
    best:  { mon_name:'Pidgey', mon_number:16, mon_cp:300, mon_attack:14, mon_defence:14, mon_stamina:14, mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar);
  const trash = list.find(e => e.id === 'trash');
  assert.strictEqual(trash.verdict, 'TRANSFERIR');
  const html = detailHtml(trash);
  assert.match(html, /pk-compare/);
  assert.match(html, /Este vs o melhor/);
});

test('detailHtml NÃO inclui comparador para MANTER/INVESTIR', () => {
  const fd = { only: { mon_name:'Bidoof', mon_number:399, mon_cp:90, mon_attack:3, mon_defence:4, mon_stamina:5, mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar)[0];
  assert.strictEqual(e.verdict, 'MANTER');
  const html = detailHtml(e);
  assert.doesNotMatch(html, /pk-compare/);
});
```

- [ ] **Step 2: Rodar testes e confirmar que falham**

Comando: `cd pokemon && npm test`
Esperado: o primeiro teste falha (comparador não aparece).

- [ ] **Step 3: Modificar `detailHtml`**

Em `pokemon/lib/render.js`, substituir `detailHtml` (linhas 59–70):

```js
function detailHtml(e) {
  const moves = e.moves.map(esc).join(' · ');
  const pvp = e.pvp ? (e.pvp.pvp_won + '/' + e.pvp.pvp_total + ' vitórias') : '—';
  const compare = (e.verdict === 'TRANSFERIR' && e.betterCopy) ? compareHtml(e, e.betterCopy) : '';
  return (
    '<div class="pk-detail">' +
      '<div>IVs: <strong>' + e.ivs.atk + '/' + e.ivs.def + '/' + e.ivs.sta + '</strong></div>' +
      '<div>Golpes: ' + (moves || '—') + '</div>' +
      '<div>Altura: ' + e.height.toFixed(2) + ' m · Peso: ' + e.weight.toFixed(1) + ' kg</div>' +
      '<div>Batalhas: ' + pvp + '</div>' +
      compare +
    '</div>'
  );
}
```

- [ ] **Step 4: Rodar testes e confirmar que passam**

Comando: `cd pokemon && npm test`
Esperado: todos passam.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/render.js pokemon/test/render.test.js
git commit -m "pokemon: detailHtml inclui comparador em TRANSFERIR"
```

---

## Task 11: Caso-pivô — integration test dos dois Xatus

**Files:**
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Escrever o teste de integração**

Adicionar em `pokemon/test/verdict.test.js`:

```js
test('CASO PIVÔ: Xatu XS (80% IV) é mantido; Xatu normal (77.8%) é transferido', () => {
  // Reproduz exatamente o caso das screenshots:
  // Xatu 1: PC 909, IV 80% (13/11/12), altura 0.95m → XS comfort
  // Xatu 2: PC 1482, IV 77.8% (13/14/8), altura 1.17m → XS fronteira (não comfort)
  const fd = {
    xatu_xs:     { mon_name:'Xatu', mon_number:178, mon_cp:909,  mon_attack:13, mon_defence:11, mon_stamina:12, mon_height:0.95, mon_isShiny:'NO', mon_isLucky:'NO' },
    xatu_normal: { mon_name:'Xatu', mon_number:178, mon_cp:1482, mon_attack:13, mon_defence:14, mon_stamina:8,  mon_height:1.17, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar);
  const xs = list.find(e => e.id === 'xatu_xs');
  const nm = list.find(e => e.id === 'xatu_normal');

  // Xatu 1 (XS) → MANTER, protegido por XS comfort
  assert.strictEqual(xs.verdict, 'MANTER');
  assert.match(xs.reason, /XS/);
  assert.strictEqual(xs.isXSComfort, true);

  // Xatu 2 (normal) → TRANSFERIR com razão clara apontando o melhor
  assert.strictEqual(nm.verdict, 'TRANSFERIR');
  assert.match(nm.reason, /Você já tem um Xatu melhor/);
  // betterCopy aponta pro xatu_xs
  assert.strictEqual(nm.betterCopy && nm.betterCopy.id, 'xatu_xs');
});
```

- [ ] **Step 2: Rodar teste**

Comando: `cd pokemon && npm test`
Esperado: passa (todas as mudanças necessárias já foram implementadas nas Tasks 1–10).

- [ ] **Step 3: Commit**

```bash
git add pokemon/test/verdict.test.js
git commit -m "pokemon: teste de integração do caso-pivô dos dois Xatus"
```

---

## Task 12: Atualizar `app.js` (passar `getPokemonSizeScalar` para `analyze`)

**Files:**
- Modify: `pokemon/app.js`

- [ ] **Step 1: Encontrar a chamada de `analyze` em `app.js`**

Comando: `grep -n "analyze(" pokemon/app.js`
Esperado: encontrar 1 linha. Anote o número da linha.

- [ ] **Step 2: Encontrar onde `getPokemonSize` é importado/usado**

Comando: `grep -n "getPokemonSize\|sizes.js" pokemon/app.js`
Esperado: import no topo (algo como `<script src="sizes.js">` no HTML ou referência global).

- [ ] **Step 3: Modificar a chamada de `analyze`**

Adicionar `getPokemonSizeScalar` como 4º argumento. Exemplo:

```js
// Antes:
const list = analyze(data.fileData, getPokemonSize, refdata);
// Depois:
const list = analyze(data.fileData, getPokemonSize, refdata, getPokemonSizeScalar);
```

**Por que isso funciona no browser:** `sizes.js` é carregado via `<script src="sizes.js">` (classic script). Declarações `function getPokemonSize(...)` e `function getPokemonSizeScalar(...)` em top-level de script clássico são hoisted como variáveis globais — exatamente como `getPokemonSize` já é acessado hoje. Nenhuma mudança de import é necessária em `app.js`.

- [ ] **Step 4: Rodar testes e abrir no navegador**

Comando: `cd pokemon && npm test`
Esperado: testes passam (não tocam em app.js, mas é seguro re-rodar).

Comando (Windows): `Start-Process "pokemon/index.html"`
Esperado:
- A página carrega sem erros no console.
- Abra DevTools (F12) > Console. Verifique se há erros.
- Procure manualmente por um Xatu na lista (use a busca). Confirme que o veredito mostra MANTER para os XS e TRANSFERIR para duplicatas normais piores.

- [ ] **Step 5: Commit**

```bash
git add pokemon/app.js
git commit -m "pokemon: app.js passa getPokemonSizeScalar para analyze"
```

---

## Task 13: Smoke test manual + screenshot do comparador

**Files:**
- (nenhum arquivo modificado — só validação)

- [ ] **Step 1: Abrir `pokemon/index.html` no navegador**

Comando (Windows): `Start-Process "pokemon/index.html"`

- [ ] **Step 2: Validar lista TRANSFERIR**

Clique na aba/chip "TRANSFERIR". Confirme:
- A lista é **menor** que antes (mais Pokémons protegidos).
- Cada card mostra `"Você já tem um {nome} melhor"`.

- [ ] **Step 3: Validar comparador**

Clique em qualquer card TRANSFERIR. Confirme:
- O detalhe expandido inclui a tabela do comparador.
- Linhas IV total, Atk, Def, HP, Tamanho, 2º carr. têm marcador verde/vermelho onde aplicável.
- Linha de PC NÃO tem marcador (mesmo se os valores diferem).
- Linhas empatadas (ex: Atk igual) ficam neutras.
- Lista de ataques aparece dos dois lados.

- [ ] **Step 4: Validar caso-pivô (Xatus)**

Se houver os dois Xatu na coleção do usuário (`colecao.json`):
- Buscar "Xatu" na lista.
- Confirmar que o XS (PC 909) está em MANTER com razão "XS — colecionável".
- Confirmar que o outro (PC 1482) está em TRANSFERIR.
- Expandir o card TRANSFERIR e conferir que o comparador mostra os dois Xatu.

- [ ] **Step 5: Sem erros no console**

DevTools (F12) > Console. Esperado: nenhum erro vermelho.

- [ ] **Step 6: Commit final (vazio, marco)**

Se houve algum ajuste no smoke test, comite. Caso contrário, pule.

---

## Self-Review (executado pelo autor do plano)

### Cobertura da spec
- ✅ **Seção 1 (proteções):** XS comfort (Task 2), XL comfort (Task 2), 2º carregado (Task 2), TRADE_EVO + REGIONAL (Task 4). Todas integradas em `isProtected` (Task 4).
- ✅ **Seção 2 (regra do veredito):** estrutura mantida; só `computeVerdict` ganha texto novo (Task 6). Threshold `<80%` mantido. Desempate IV-desc, PC-desc mantido.
- ✅ **Seção 3 (card + comparador):** texto principal (Task 6), CSS (Task 8), `compareHtml` (Task 9), wiring (Task 10). ✔/✖ na regra correta (Task 9 — `winnerByNumber`, `winnerBySpecialSize`, `winnerByBool`). PC sem marcador (Task 9 — argumento `null`).
- ✅ **Seção 4.1 (campos novos):** Task 2.
- ✅ **Seção 4.2 (razões):** Task 5 — prioridade na ordem da spec.
- ✅ **Seção 4.3 (badges):** Task 7.
- ✅ **Seção 4.4 (testes):** Tasks 2, 4, 7, 9, 10, 11 cobrem todos os casos da spec.
- ✅ **Seção 4.5 (fora de escopo):** nenhuma task implementa legacy moves, PvP rank, mudanças em INVESTIR, ou 4º veredito.

### Placeholder scan
Sem "TBD", "TODO", "implementar depois". Todas as steps mostram código completo ou comandos exatos.

### Type/nome consistência
- `getPokemonSizeScalar` consistente em todas as tasks.
- `compareHtml` consistente.
- `isXSComfort` / `isXLComfort` / `hasSecondCharge` / `betterCopy` / `sizeScalar` consistentes.
- Mensagem "Você já tem um {nome} melhor" idêntica em Task 6 e Task 11.

---

## Próximos passos

Plano completo salvo em `docs/superpowers/plans/2026-06-05-revisao-analise-transferir.md`. Duas opções de execução:

1. **Subagent-Driven (recomendado):** dispatch de subagente fresco por task, review entre tasks, iteração rápida.
2. **Inline Execution:** executar as tasks nesta sessão com batch + checkpoints.
