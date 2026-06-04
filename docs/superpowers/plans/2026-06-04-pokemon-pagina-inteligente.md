# Nova /pokemon — Página Inteligente · Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever `moreno.arq.br/pokemon` como uma página orientada a dados que lê um JSON e decide sozinha, para cada Pokémon, se é caso de Investir / Manter / Transferir — protegendo automaticamente shiny, lucky, sombrio, lendário, fantasia, tamanho XXS/XXL e hundos.

**Architecture:** Página estática (sem build, sem servidor). Toda a lógica de análise é JavaScript puro em módulos no padrão UMD (funcionam no navegador como globais e no Node via `require`), o que permite testes com `node --test`. O HTML/CSS faz só a apresentação. A página busca `pokemon/colecao.json`; atualizar = trocar esse arquivo.

**Tech Stack:** HTML + CSS + JavaScript vanilla. Testes com `node:test` (nativo do Node 24, sem dependências). PWA com service worker.

**Spec:** `docs/superpowers/specs/2026-06-04-pokemon-pagina-inteligente-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `pokemon/colecao.json` | Dado vivo (export do app). A página sempre lê este caminho. | Criar (cópia do export atual) |
| `pokemon/package.json` | Habilita `npm test` → `node --test`. Sem dependências. | Criar |
| `pokemon/sizes.js` | Cálculo de tamanho (XXS→XXL). Já existe. | Reusar (ler como global no browser, `require` no Node) |
| `pokemon/lib/refdata.js` | Conjuntos de referência: lendários/míticos, regionais, evolução-por-troca. | Criar |
| `pokemon/lib/analysis.js` | Núcleo: enriquece cada Pokémon, agrupa por espécie, calcula veredito, tags e contagens. | Criar |
| `pokemon/lib/render.js` | Funções puras que devolvem HTML (selos, card). | Criar |
| `pokemon/test/*.test.js` | Testes da lógica pura. | Criar |
| `pokemon/app.js` | Cola do navegador: fetch, render, filtros, busca, detalhe, modo transferir. | Criar |
| `pokemon/index.html` | Estrutura + CSS. Remove a caixa "como abrir no celular". | Reescrever |
| `pokemon/sw.js` | Service worker: network-first também no JSON; bump de versão. | Modificar |
| `pokemon/analise.html` | Cópia antiga e obsoleta. | Apagar |

**Convenção UMD usada em `lib/*.js`** (igual ao `sizes.js` atual):
```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node
  else Object.assign(root, api);                                            // Browser (globais)
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /* ... define e retorna { ... } ... */
});
```

---

## Fase 0 — Scaffold e dado

### Task 0: Projeto de teste + dado inicial

**Files:**
- Create: `pokemon/package.json`
- Create: `pokemon/colecao.json` (cópia de `pokemon/Pokemons-LeoTrevisan-04-06-2026.json`)
- Create: `pokemon/test/.gitkeep`

- [ ] **Step 1: Criar `pokemon/package.json`**

```json
{
  "name": "pokemon-analise",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Copiar o export atual para o caminho fixo**

Run (PowerShell):
```powershell
Copy-Item "pokemon/Pokemons-LeoTrevisan-04-06-2026.json" "pokemon/colecao.json"
```
Expected: `pokemon/colecao.json` existe e tem o mesmo tamanho do original.

- [ ] **Step 3: Garantir a pasta de testes**

Run (PowerShell):
```powershell
New-Item -ItemType File "pokemon/test/.gitkeep" -Force
```

- [ ] **Step 4: Verificar que o test runner roda (sem testes ainda)**

Run: `npm --prefix pokemon test`
Expected: termina sem erro (0 testes encontrados é OK).

- [ ] **Step 5: Commit**

```powershell
git add pokemon/package.json pokemon/colecao.json pokemon/test/.gitkeep
git commit -m "pokemon: scaffold de teste (node --test) e colecao.json fixo"
```

---

## Fase 1 — Dados de referência

### Task 1: `refdata.js` (lendários, regionais, evolução por troca)

**Files:**
- Create: `pokemon/lib/refdata.js`
- Test: `pokemon/test/refdata.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// pokemon/test/refdata.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { LEGENDARY, REGIONAL, TRADE_EVO } = require('../lib/refdata.js');

test('lendários conhecidos estão no conjunto', () => {
  for (const n of [150 /*Mewtwo*/, 245 /*Suicune*/, 251 /*Celebi*/, 380 /*Latias*/,
                   492 /*Shaymin*/, 648 /*Meloetta*/, 718 /*Zygarde*/, 719 /*Diancie*/]) {
    assert.ok(LEGENDARY.has(n), 'esperava lendário: ' + n);
  }
});

test('não-lendários não estão no conjunto', () => {
  for (const n of [25 /*Pikachu*/, 16 /*Pidgey*/, 66 /*Machop*/, 129 /*Magikarp*/]) {
    assert.ok(!LEGENDARY.has(n), 'não devia ser lendário: ' + n);
  }
});

test('evolução por troca inclui Kadabra (64) e Machoke (67)', () => {
  assert.ok(TRADE_EVO.has(64));
  assert.ok(TRADE_EVO.has(67));
});

test('regional inclui Durant (632)', () => {
  assert.ok(REGIONAL.has(632));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix pokemon test`
Expected: FAIL — `Cannot find module '../lib/refdata.js'`.

- [ ] **Step 3: Implementar `refdata.js`**

```js
// pokemon/lib/refdata.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // Lendários e míticos (Gen 1–9). Usado para proteção "nunca transferir".
  const LEGENDARY = new Set([
    144,145,146,150,151,                                 // Gen 1
    243,244,245,249,250,251,                             // Gen 2
    377,378,379,380,381,382,383,384,385,386,             // Gen 3
    480,481,482,483,484,485,486,487,488,489,490,491,492,493, // Gen 4
    494,638,639,640,641,642,643,644,645,646,647,648,649, // Gen 5
    716,717,718,719,720,721,                             // Gen 6
    772,773,785,786,787,788,789,790,791,792,793,794,795,796,797,798,799,
    800,801,802,803,804,805,806,807,808,809,             // Gen 7 (inclui Ultra Beasts)
    888,889,890,891,892,893,894,895,896,897,898,905,     // Gen 8
    1001,1002,1003,1004,1007,1008,1014,1015,1016,1017,   // Gen 9 (parcial)
  ]);

  // Region-exclusivos de alto valor de troca (lista comum em GO; extensível).
  const REGIONAL = new Set([
    83,115,122,128,                                      // Farfetch'd, Kangaskhan, Mr.Mime, Tauros
    214,222,                                             // Heracross, Corsola
    324,335,336,337,338,357,369,                         // Torkoal, Zangoose, Seviper, Lunatone, Solrock, Tropius, Relicanth
    417,441,455,                                         // Pachirisu, Chatot, Carnivine
    550,556,561,                                         // Basculin, Maractus, Sigilyph
    618,631,632,                                         // Stunfisk, Heatmor, Durant
    667,                                                 // Litleo (regional? mantém p/ exemplo)
    707,                                                 // Klefki
  ]);

  // Evoluem por troca (poupam doces ao trocar).
  const TRADE_EVO = new Set([
    64,  // Kadabra → Alakazam
    67,  // Machoke → Machamp
    75,  // Graveler → Golem
    93,  // Haunter → Gengar
    525, // Boldore → Gigalith
    533, // Gurdurr → Conkeldurr
    588, // Karrablast → Escavalier
    616, // Shelmet → Accelgor
    708, // Phantump → Trevenant
    710, // Pumpkaboo → Gourgeist
  ]);

  return { LEGENDARY, REGIONAL, TRADE_EVO };
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix pokemon test`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```powershell
git add pokemon/lib/refdata.js pokemon/test/refdata.test.js
git commit -m "pokemon: dados de referência (lendários, regionais, evolução por troca)"
```

---

## Fase 2 — Motor de análise (lógica pura, TDD)

### Task 2: IV% e flags básicas (`enrichOne`)

**Files:**
- Create: `pokemon/lib/analysis.js`
- Test: `pokemon/test/enrich.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// pokemon/test/enrich.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { enrichOne } = require('../lib/analysis.js');

const baseMon = (over) => Object.assign({
  mon_name: 'Machop', mon_number: 66, mon_cp: 500,
  mon_attack: 15, mon_defence: 15, mon_stamina: 15,
  mon_height: 0.8, mon_isShiny: 'NO', mon_isLucky: 'NO',
}, over || {});

test('IV% = soma/45', () => {
  assert.strictEqual(enrichOne(baseMon(), getPokemonSize, refdata).ivPct, 100);
  assert.strictEqual(enrichOne(baseMon({ mon_attack:0, mon_defence:8, mon_stamina:3 }), getPokemonSize, refdata).ivPct, 24);
});

test('flags de shiny/lucky/sombrio/purificado/fantasia', () => {
  assert.strictEqual(enrichOne(baseMon({ mon_isShiny:'YES' }), getPokemonSize, refdata).isShiny, true);
  assert.strictEqual(enrichOne(baseMon({ mon_isLucky:'YES' }), getPokemonSize, refdata).isLucky, true);
  assert.strictEqual(enrichOne(baseMon({ mon_alignment:'SHADOW' }), getPokemonSize, refdata).isShadow, true);
  assert.strictEqual(enrichOne(baseMon({ mon_alignment:'PURIFIED' }), getPokemonSize, refdata).isPurified, true);
  assert.strictEqual(enrichOne(baseMon({ mon_costume:'X2021' }), getPokemonSize, refdata).isCostume, true);
});

test('hundo e quase-perfeito', () => {
  assert.strictEqual(enrichOne(baseMon(), getPokemonSize, refdata).isHundo, true);
  assert.strictEqual(enrichOne(baseMon({ mon_attack:14 }), getPokemonSize, refdata).isNearPerfect, true); // 44/45 = 98%
  assert.strictEqual(enrichOne(baseMon({ mon_attack:10, mon_defence:10, mon_stamina:10 }), getPokemonSize, refdata).isNearPerfect, false); // 67%
});

test('lendário vem do refdata', () => {
  assert.strictEqual(enrichOne(baseMon({ mon_number:150 }), getPokemonSize, refdata).isLegendary, true);
  assert.strictEqual(enrichOne(baseMon({ mon_number:66 }), getPokemonSize, refdata).isLegendary, false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix pokemon test`
Expected: FAIL — `Cannot find module '../lib/analysis.js'`.

- [ ] **Step 3: Implementar `analysis.js` (parte 1)**

```js
// pokemon/lib/analysis.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function ivPct(mon) {
    return Math.round((mon.mon_attack + mon.mon_defence + mon.mon_stamina) / 45 * 100);
  }

  function speciesKey(mon) {
    return mon.mon_number + '_' + (mon.mon_form || 'BASE');
  }

  function enrichOne(mon, getSize, refdata) {
    const iv = ivPct(mon);
    const size = getSize(mon.mon_number, mon.mon_height, mon.mon_form);
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
      isShiny: mon.mon_isShiny === 'YES',
      isLucky: mon.mon_isLucky === 'YES',
      isShadow: mon.mon_alignment === 'SHADOW',
      isPurified: mon.mon_alignment === 'PURIFIED',
      isLegendary: refdata.LEGENDARY.has(mon.mon_number),
      isCostume: !!mon.mon_costume,
      isExtremeSize: size === 'XXS' || size === 'XXL',
      isHundo: iv === 100,
      isNearPerfect: iv >= 96,
      isRegional: refdata.REGIONAL.has(mon.mon_number),
      isTradeEvo: refdata.TRADE_EVO.has(mon.mon_number),
      speciesKey: speciesKey(mon),
      // preenchidos por enrichCollection:
      id: null,
      isBestOfSpecies: false,
      isOnlyCopy: false,
      // preenchidos por analyze:
      verdict: null,
      reason: null,
      tags: [],
    };
  }

  return { ivPct, speciesKey, enrichOne };
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix pokemon test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add pokemon/lib/analysis.js pokemon/test/enrich.test.js
git commit -m "pokemon: enriquecimento por Pokémon (IV, tamanho, flags)"
```

---

### Task 3: Agrupamento por espécie (`enrichCollection`)

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/grouping.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// pokemon/test/grouping.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { enrichCollection } = require('../lib/analysis.js');

const fileData = {
  'a': { mon_name:'Deino', mon_number:633, mon_cp:329, mon_attack:9, mon_defence:0, mon_stamina:7, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' }, // 36%
  'b': { mon_name:'Deino', mon_number:633, mon_cp:67,  mon_attack:0, mon_defence:8, mon_stamina:3, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' }, // 24%
  'c': { mon_name:'Machop', mon_number:66, mon_cp:584, mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' }, // único
};

test('marca melhor cópia, única cópia e id', () => {
  const list = enrichCollection(fileData, getPokemonSize, refdata);
  const byId = Object.fromEntries(list.map(e => [e.id, e]));
  assert.strictEqual(byId['a'].isBestOfSpecies, true);   // 36% > 24%
  assert.strictEqual(byId['b'].isBestOfSpecies, false);
  assert.strictEqual(byId['a'].isOnlyCopy, false);
  assert.strictEqual(byId['c'].isOnlyCopy, true);
  assert.strictEqual(byId['c'].isBestOfSpecies, true);
});

test('formas diferentes não se misturam', () => {
  const fd = {
    'x': { mon_name:'Grimer', mon_number:88, mon_form:'GRIMER_ALOLA', mon_cp:961, mon_attack:14, mon_defence:12, mon_stamina:15, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' },
    'y': { mon_name:'Grimer', mon_number:88, mon_form:'GRIMER_NORMAL', mon_cp:500, mon_attack:5, mon_defence:5, mon_stamina:5, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const list = enrichCollection(fd, getPokemonSize, refdata);
  for (const e of list) assert.strictEqual(e.isOnlyCopy, true); // cada forma é "única"
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix pokemon test`
Expected: FAIL — `enrichCollection is not a function`.

- [ ] **Step 3: Implementar `enrichCollection` em `analysis.js`**

Adicionar dentro do factory, antes do `return`:
```js
  function enrichCollection(fileData, getSize, refdata) {
    const list = Object.keys(fileData).map(id => {
      const e = enrichOne(fileData[id], getSize, refdata);
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
      for (const e of g) e.isOnlyCopy = only;
    }
    return list;
  }
```
E incluir `enrichCollection` no objeto retornado:
```js
  return { ivPct, speciesKey, enrichOne, enrichCollection };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix pokemon test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add pokemon/lib/analysis.js pokemon/test/grouping.test.js
git commit -m "pokemon: agrupamento por espécie (melhor cópia / única cópia)"
```

---

### Task 4: Veredito (`computeVerdict`) + `analyze`

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/verdict.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// pokemon/test/verdict.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze } = require('../lib/analysis.js');

function verdictOf(fileData, id) {
  const list = analyze(fileData, getPokemonSize, refdata);
  return list.find(e => e.id === id);
}

test('hundo → INVESTIR', () => {
  const fd = { h: { mon_name:'Slowking', mon_number:199, mon_cp:1417, mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:2.0, mon_isShiny:'NO', mon_isLucky:'NO' } };
  assert.strictEqual(verdictOf(fd,'h').verdict, 'INVESTIR');
});

test('shiny com IV baixo → MANTER (nunca transferir)', () => {
  const fd = {
    s: { mon_name:'Deino', mon_number:633, mon_cp:329, mon_attack:9, mon_defence:0, mon_stamina:7, mon_height:0.8, mon_isShiny:'YES', mon_isLucky:'NO' }, // 36% shiny
    d: { mon_name:'Deino', mon_number:633, mon_cp:67,  mon_attack:0, mon_defence:8, mon_stamina:3, mon_height:0.8, mon_isShiny:'NO',  mon_isLucky:'NO' }, // 24% comum
  };
  assert.strictEqual(verdictOf(fd,'s').verdict, 'MANTER');
  assert.match(verdictOf(fd,'s').reason, /[Ss]hiny/);
});

test('duplicata pior, IV<80, nada especial → TRANSFERIR', () => {
  const fd = {
    best:  { mon_name:'Pidgey', mon_number:16, mon_cp:300, mon_attack:14, mon_defence:14, mon_stamina:14, mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' }, // 93%
    trash: { mon_name:'Pidgey', mon_number:16, mon_cp:80,  mon_attack:2,  mon_defence:5,  mon_stamina:7,  mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' }, // 31%
  };
  assert.strictEqual(verdictOf(fd,'trash').verdict, 'TRANSFERIR');
  assert.strictEqual(verdictOf(fd,'best').verdict, 'INVESTIR'); // melhor cópia, IV>=90
});

test('única cópia ruim → MANTER (guarda 1 de cada)', () => {
  const fd = { only: { mon_name:'Bidoof', mon_number:399, mon_cp:90, mon_attack:3, mon_defence:4, mon_stamina:5, mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } }; // 27%
  assert.strictEqual(verdictOf(fd,'only').verdict, 'MANTER');
  assert.match(verdictOf(fd,'only').reason, /[Úú]nica/);
});

test('sombrio com IV baixo → MANTER (protegido)', () => {
  const fd = {
    sh:  { mon_name:'Grimer', mon_number:88, mon_form:'GRIMER_ALOLA', mon_cp:300, mon_attack:2, mon_defence:2, mon_stamina:2, mon_height:0.8, mon_alignment:'SHADOW', mon_isShiny:'NO', mon_isLucky:'NO' }, // 13%
    nm:  { mon_name:'Grimer', mon_number:88, mon_form:'GRIMER_ALOLA', mon_cp:900, mon_attack:14,mon_defence:12,mon_stamina:15, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOf(fd,'sh').verdict, 'MANTER');
});

test('XXL protege; XL não impede transferir', () => {
  // Wailord 321 base 14.5m. height grande → XXL ; pequeno → normal.
  const fd = {
    xxl:  { mon_name:'Wailmer', mon_number:320, mon_cp:100, mon_attack:1, mon_defence:1, mon_stamina:1, mon_height:9.9, mon_isShiny:'NO', mon_isLucky:'NO' }, // base 2.0 → 4.95x = XXL
    best: { mon_name:'Wailmer', mon_number:320, mon_cp:900, mon_attack:14,mon_defence:14,mon_stamina:14, mon_height:2.0, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOf(fd,'xxl').verdict, 'MANTER'); // protegido por XXL apesar de IV baixo
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix pokemon test`
Expected: FAIL — `analyze is not a function`.

- [ ] **Step 3: Implementar veredito, motivos, tags e `analyze`**

Adicionar dentro do factory, antes do `return`:
```js
  function isProtected(e) {
    return e.isShiny || e.isLucky || e.isShadow || e.isLegendary
        || e.isCostume || e.isExtremeSize || e.isHundo || e.isNearPerfect;
  }

  function investReason(e) {
    if (e.isHundo) return 'Perfeito (15/15/15)';
    if (e.isNearPerfect) return 'Quase perfeito (' + e.ivPct + '%)';
    return 'Melhor cópia · IV ' + e.ivPct + '%';
  }

  function specialReason(e) {
    if (e.isShiny) return 'Shiny — protegido';
    if (e.isLegendary) return 'Lendário/mítico';
    if (e.isLucky) return 'Lucky — protegido';
    if (e.isShadow) return 'Sombrio — protegido';
    if (e.isCostume) return 'Fantasia — colecionável';
    if (e.isExtremeSize) return 'Tamanho ' + e.size + ' — raro';
    return 'Especial';
  }

  function computeVerdict(e) {
    if (isProtected(e)) {
      if (e.isHundo || e.isNearPerfect || (e.isBestOfSpecies && e.ivPct >= 90))
        return { verdict: 'INVESTIR', reason: investReason(e) };
      return { verdict: 'MANTER', reason: specialReason(e) };
    }
    if (e.isOnlyCopy || e.isBestOfSpecies) {
      if (e.isBestOfSpecies && e.ivPct >= 90)
        return { verdict: 'INVESTIR', reason: investReason(e) };
      return { verdict: 'MANTER', reason: e.isOnlyCopy ? 'Única cópia da espécie' : 'Melhor cópia (IV ' + e.ivPct + '%)' };
    }
    if (e.ivPct < 80)
      return { verdict: 'TRANSFERIR', reason: 'Duplicata pior · IV ' + e.ivPct + '% · nada especial' };
    return { verdict: 'MANTER', reason: 'Duplicata ok (IV ' + e.ivPct + '%)' };
  }

  function computeTags(e) {
    const tags = [];
    if (e.isTradeEvo) tags.push('TROCAR_EVO');
    if (e.isRegional) tags.push('REGIONAL');
    return tags;
  }

  function analyze(fileData, getSize, refdata) {
    const list = enrichCollection(fileData, getSize, refdata);
    for (const e of list) {
      const v = computeVerdict(e);
      e.verdict = v.verdict;
      e.reason = v.reason;
      e.tags = computeTags(e);
    }
    return list;
  }
```
E atualizar o retorno:
```js
  return { ivPct, speciesKey, enrichOne, enrichCollection, isProtected, computeVerdict, computeTags, analyze };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix pokemon test`
Expected: PASS (todos os testes de veredito).

- [ ] **Step 5: Commit**

```powershell
git add pokemon/lib/analysis.js pokemon/test/verdict.test.js
git commit -m "pokemon: motor de veredito (investir/manter/transferir) + tags"
```

---

### Task 5: Contagens (`computeCounts`)

**Files:**
- Modify: `pokemon/lib/analysis.js`
- Test: `pokemon/test/counts.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// pokemon/test/counts.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze, computeCounts } = require('../lib/analysis.js');

const fd = {
  a: { mon_name:'Slowking', mon_number:199, mon_cp:1417, mon_attack:15,mon_defence:15,mon_stamina:15, mon_height:2.0, mon_isShiny:'NO',  mon_isLucky:'NO' },  // hundo → INVESTIR, hundo++
  b: { mon_name:'Deino', mon_number:633, mon_cp:329, mon_attack:9,mon_defence:0,mon_stamina:7, mon_height:0.8, mon_isShiny:'YES', mon_isLucky:'NO' },        // shiny → MANTER, shiny++
  c: { mon_name:'Deino', mon_number:633, mon_cp:67,  mon_attack:0,mon_defence:8,mon_stamina:3, mon_height:0.8, mon_isShiny:'NO',  mon_isLucky:'NO' },        // dupe ruim → TRANSFERIR
};

test('contagens por veredito e por destaque', () => {
  const list = analyze(fd, getPokemonSize, refdata);
  const c = computeCounts(list);
  assert.strictEqual(c.total, 3);
  assert.strictEqual(c.INVESTIR, 1);
  assert.strictEqual(c.MANTER, 1);
  assert.strictEqual(c.TRANSFERIR, 1);
  assert.strictEqual(c.hundos, 1);
  assert.strictEqual(c.shinies, 1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix pokemon test`
Expected: FAIL — `computeCounts is not a function`.

- [ ] **Step 3: Implementar `computeCounts`**

Adicionar dentro do factory:
```js
  function computeCounts(list) {
    const c = { total: list.length, INVESTIR:0, MANTER:0, TRANSFERIR:0,
                hundos:0, shinies:0, shadows:0, purified:0, extremeSizes:0, legendaries:0, luckies:0 };
    for (const e of list) {
      c[e.verdict]++;
      if (e.isHundo) c.hundos++;
      if (e.isShiny) c.shinies++;
      if (e.isShadow) c.shadows++;
      if (e.isPurified) c.purified++;
      if (e.isExtremeSize) c.extremeSizes++;
      if (e.isLegendary) c.legendaries++;
      if (e.isLucky) c.luckies++;
    }
    return c;
  }
```
Atualizar o retorno para incluir `computeCounts`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix pokemon test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add pokemon/lib/analysis.js pokemon/test/counts.test.js
git commit -m "pokemon: contagens (vereditos + destaques)"
```

---

## Fase 3 — Renderização (funções puras → string HTML, TDD)

### Task 6: `render.js` — selos e card

**Files:**
- Create: `pokemon/lib/render.js`
- Test: `pokemon/test/render.test.js`

- [ ] **Step 1: Escrever o teste que falha**

```js
// pokemon/test/render.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze } = require('../lib/analysis.js');
const { cardHtml, badgesHtml } = require('../lib/render.js');

function one(over) {
  const fd = { x: Object.assign({ mon_name:'Machop', mon_number:66, mon_cp:500,
    mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' }, over) };
  return analyze(fd, getPokemonSize, refdata)[0];
}

test('card mostra nome, veredito e id', () => {
  const html = cardHtml(one());
  assert.match(html, /Machop/);
  assert.match(html, /INVESTIR/);
  assert.match(html, /data-id="x"/);
  assert.match(html, /data-verdict="INVESTIR"/);
});

test('selos: shiny, sombrio e tamanho aparecem', () => {
  const html = badgesHtml(one({ mon_isShiny:'YES', mon_alignment:'SHADOW', mon_number:633, mon_height:0.35, mon_attack:9, mon_defence:0, mon_stamina:7 }));
  assert.match(html, /✨/);
  assert.match(html, /👻/);
  assert.match(html, /XS|XXS/);
});

test('escapa nomes (sem injeção de HTML)', () => {
  const html = cardHtml(one({ mon_name:'<b>x</b>' }));
  assert.doesNotMatch(html, /<b>x<\/b>/);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm --prefix pokemon test`
Expected: FAIL — `Cannot find module '../lib/render.js'`.

- [ ] **Step 3: Implementar `render.js`**

```js
// pokemon/lib/render.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  }

  function badgesHtml(e) {
    const b = [];
    if (e.isHundo)    b.push('<span class="badge b-hundo">★</span>');
    if (e.isShiny)    b.push('<span class="badge b-shiny">✨</span>');
    if (e.isShadow)   b.push('<span class="badge b-shadow">👻</span>');
    if (e.isPurified) b.push('<span class="badge b-purified">💧</span>');
    if (e.isLucky)    b.push('<span class="badge b-lucky">🍀</span>');
    if (e.isLegendary)b.push('<span class="badge b-legendary">👑</span>');
    if (e.isCostume)  b.push('<span class="badge b-costume">🎭</span>');
    if (e.size)       b.push('<span class="badge b-size">' + e.size + '</span>');
    if (e.tags.includes('TROCAR_EVO')) b.push('<span class="badge b-trade">🤝</span>');
    if (e.tags.includes('REGIONAL'))   b.push('<span class="badge b-regional">🌍</span>');
    return b.join('');
  }

  const VERDICT_CLASS = { INVESTIR:'invest', MANTER:'keep', TRANSFERIR:'transfer' };
  const VERDICT_LABEL = { INVESTIR:'💪 INVESTIR', MANTER:'🛡️ MANTER', TRANSFERIR:'❌ TRANSFERIR' };

  function ivClass(iv) {
    if (iv === 100) return 'iv-perfect';
    if (iv >= 96) return 'iv-great';
    if (iv >= 80) return 'iv-good';
    return 'iv-low';
  }

  function cardHtml(e) {
    return (
      '<div class="pk ' + VERDICT_CLASS[e.verdict] + '" data-id="' + esc(e.id) +
        '" data-verdict="' + e.verdict + '" data-name="' + esc(e.name.toLowerCase()) + '">' +
        '<div class="pk-top">' +
          '<span class="pk-name">' + esc(e.name) + '</span>' +
          '<span class="verdict v-' + VERDICT_CLASS[e.verdict] + '">' + VERDICT_LABEL[e.verdict] + '</span>' +
        '</div>' +
        '<div class="pk-stats">' +
          '<span class="iv ' + ivClass(e.ivPct) + '">' + e.ivPct + '%</span>' +
          '<span class="cp">CP ' + e.cp + '</span>' +
          badgesHtml(e) +
        '</div>' +
        '<div class="reason">' + esc(e.reason) + '</div>' +
      '</div>'
    );
  }

  function detailHtml(e) {
    const moves = e.moves.map(esc).join(' · ');
    const pvp = e.pvp ? (e.pvp.pvp_won + '/' + e.pvp.pvp_total + ' vitórias') : '—';
    return (
      '<div class="pk-detail">' +
        '<div>IVs: <strong>' + e.ivs.atk + '/' + e.ivs.def + '/' + e.ivs.sta + '</strong></div>' +
        '<div>Golpes: ' + (moves || '—') + '</div>' +
        '<div>Altura: ' + e.height.toFixed(2) + ' m · Peso: ' + e.weight.toFixed(1) + ' kg</div>' +
        '<div>Batalhas: ' + pvp + '</div>' +
      '</div>'
    );
  }

  return { esc, badgesHtml, cardHtml, detailHtml, ivClass };
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm --prefix pokemon test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add pokemon/lib/render.js pokemon/test/render.test.js
git commit -m "pokemon: renderização pura (card, selos, detalhe)"
```

---

## Fase 4 — Página e interatividade (navegador, verificação visual)

> A partir daqui a verificação é no navegador. Para servir localmente (o `fetch` não funciona via `file://`):
> Run: `npx --yes serve@latest -l 3000 pokemon` e abra `http://localhost:3000`.

### Task 7: Novo `index.html` — estrutura + CSS (remove a caixa "como abrir")

**Files:**
- Rewrite: `pokemon/index.html`

- [ ] **Step 1: Reescrever `index.html`**

**O que manter do arquivo atual:** o `<head>` inteiro (linhas ~1–10: meta tags PWA, manifest, apple-touch-icon, title) e, dentro do `<style>`, as variáveis `:root`, os resets (`*`, `html`, `body`, `.container`) e os estilos de `header`, `.refresh-btn`, `h1`, `.subtitle`, `.total-count`, `@keyframes refresh-spin` (linhas ~12–69). **Apagar** o resto do `<style>` (classes de componentes antigos) — será substituído pelos estilos do Step 2. **Substituir todo o `<body>`** por esta estrutura (a caixa `id="howto"` **não** é recriada):

```html
<body>
<header>
  <button type="button" class="refresh-btn" onclick="forcarAtualizacao(this)" aria-label="Atualizar" title="Atualizar">🔄</button>
  <h1>🎮 Análise da Coleção</h1>
  <div class="subtitle" id="updated">carregando…</div>
  <div class="total-count" id="total">—</div>
</header>

<div class="container">
  <!-- O que fazer agora -->
  <div class="hero" id="hero">
    <button class="hero-card t" data-filter-verdict="TRANSFERIR"><span class="n" id="c-transfer">—</span><span class="l">❌ Transferir</span></button>
    <button class="hero-card i" data-filter-verdict="INVESTIR"><span class="n" id="c-invest">—</span><span class="l">💪 Investir</span></button>
    <button class="hero-card k" data-filter-verdict="MANTER"><span class="n" id="c-keep">—</span><span class="l">🛡️ Manter</span></button>
  </div>

  <!-- Atalhos de destaque -->
  <div class="chips" id="chips"></div>

  <!-- Busca + filtros -->
  <div class="toolbar">
    <input type="search" id="search" placeholder="🔎 Buscar por nome…" autocomplete="off">
    <button class="filt-btn" id="clear-filters" hidden>✕ limpar filtros</button>
  </div>

  <!-- Barra do modo transferir (só aparece no filtro Transferir) -->
  <div class="transfer-controls" id="transfer-controls" hidden>
    <button class="filter-btn" id="tf-filter">🔍 Ver pendentes</button>
    <button class="filter-btn" id="tf-clear">↩ Limpar marcações</button>
    <span class="transfer-progress" id="tf-progress"></span>
  </div>

  <div id="empty" class="empty" hidden>Nenhum Pokémon com esse filtro.</div>
  <div class="mon-list" id="list"></div>
</div>

<script src="./sizes.js"></script>
<script src="./lib/refdata.js"></script>
<script src="./lib/analysis.js"></script>
<script src="./lib/render.js"></script>
<script src="./app.js"></script>

<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return; reloaded = true; location.reload();
      });
    }).catch(() => {});
  }
  function forcarAtualizacao(btn) {
    if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
    const done = () => location.reload();
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(done).catch(done);
    } else { done(); }
  }
</script>
</body>
```

- [ ] **Step 2: Adicionar/ajustar o CSS** (no `<style>`, reaproveitando as variáveis de cor já existentes). Acrescentar:

```css
.hero { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin:18px 0; }
.hero-card { background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px 8px; cursor:pointer; color:var(--text); display:flex; flex-direction:column; gap:4px; align-items:center; }
.hero-card.active { outline:2px solid currentColor; }
.hero-card .n { font-size:24px; font-weight:800; line-height:1; }
.hero-card .l { font-size:11px; color:var(--text-dim); text-transform:uppercase; letter-spacing:.4px; }
.hero-card.t .n { color:var(--red); } .hero-card.i .n { color:var(--green); } .hero-card.k .n { color:var(--text); }

.chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:14px; }
.chip { background:var(--surface-2); border:1px solid var(--border); border-radius:20px; padding:5px 11px; font-size:12px; cursor:pointer; color:var(--text-dim); }
.chip.active { color:var(--text); border-color:var(--gold); }

.toolbar { display:flex; gap:8px; margin-bottom:12px; }
#search { flex:1; background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:10px 12px; color:var(--text); font-size:14px; }
.filt-btn, .filter-btn { background:var(--surface-2); border:1px solid var(--border); border-radius:10px; padding:8px 12px; color:var(--text); font-size:13px; cursor:pointer; }

.pk { background:var(--surface); padding:11px 13px; border-radius:10px; border-left:4px solid var(--border); display:flex; flex-direction:column; gap:6px; cursor:pointer; }
.pk.invest { border-left-color:var(--green); } .pk.keep { border-left-color:var(--text-dim); } .pk.transfer { border-left-color:var(--red); }
.pk-top { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.pk-name { font-weight:700; }
.verdict { font-weight:800; font-size:11px; padding:3px 9px; border-radius:20px; }
.v-invest { background:rgba(52,211,153,.18); color:var(--green); }
.v-keep { background:rgba(139,149,163,.2); color:#b6bfca; }
.v-transfer { background:rgba(239,68,68,.18); color:var(--red); }
.pk-stats { display:flex; gap:6px; align-items:center; flex-wrap:wrap; font-size:12px; }
.cp { color:var(--text-dim); }
.iv { font-weight:700; } .iv-perfect { color:var(--gold); } .iv-great { color:var(--green); } .iv-good { color:var(--blue); } .iv-low { color:var(--text-dim); }
.badge { font-size:11px; padding:2px 6px; border-radius:6px; font-weight:700; background:var(--surface-3); }
.b-shiny { background:rgba(236,72,153,.2); color:var(--shiny); }
.b-shadow { background:rgba(167,139,250,.2); color:var(--purple); }
.b-lucky { background:rgba(6,182,212,.2); color:var(--lucky); }
.b-hundo { background:rgba(245,197,24,.2); color:var(--gold); }
.b-legendary { background:rgba(167,139,250,.2); color:var(--purple); }
.b-size, .b-purified, .b-costume, .b-trade, .b-regional { background:rgba(96,165,250,.18); color:var(--blue); }
.reason { font-size:11.5px; color:var(--text-dim); }
.pk-detail { font-size:12px; color:var(--text-dim); display:flex; flex-direction:column; gap:3px; padding-top:6px; border-top:1px solid var(--border); }
.pk.done { opacity:.5; }
.dup-check, .pk .tf-check { margin-left:8px; }
.empty { text-align:center; color:var(--text-dim); padding:30px 10px; }
```

- [ ] **Step 3: Verificar no navegador**

Run: `npx --yes serve@latest -l 3000 pokemon`
Abra `http://localhost:3000`. Expected: header e seções vazias aparecem (lista vazia ainda — sem `app.js` lógica). Sem erros de "howto". A caixa "como abrir no celular" não existe.

- [ ] **Step 4: Commit**

```powershell
git add pokemon/index.html
git commit -m "pokemon: nova estrutura da página (hero, chips, busca, lista) sem a caixa de instruções"
```

---

### Task 8: `app.js` — carregar dados e renderizar

**Files:**
- Create: `pokemon/app.js`

- [ ] **Step 1: Implementar carregamento + render inicial**

```js
// pokemon/app.js
(function () {
  let allMons = [];            // lista enriquecida
  const state = { verdict: null, special: null, query: '' };

  async function boot() {
    try {
      const res = await fetch('./colecao.json', { cache: 'no-store' });
      const data = await res.json();
      document.getElementById('updated').textContent = 'Leo · ' + (data.exportTime || '');
      document.getElementById('total').textContent = (data.pokemonCount || 0) + ' Pokémons';
      allMons = analyze(data.fileData, getPokemonSize, { LEGENDARY, REGIONAL, TRADE_EVO });
      renderCounts();
      renderChips();
      applyFilters();
    } catch (err) {
      document.getElementById('updated').textContent = 'erro ao carregar dados';
      console.error(err);
    }
  }

  function renderCounts() {
    const c = computeCounts(allMons);
    document.getElementById('c-transfer').textContent = c.TRANSFERIR;
    document.getElementById('c-invest').textContent = c.INVESTIR;
    document.getElementById('c-keep').textContent = c.MANTER;
    return c;
  }

  function renderChips() {
    const c = computeCounts(allMons);
    const defs = [
      ['hundo', '★ ' + c.hundos + ' Hundos', e => e.isHundo],
      ['shiny', '✨ ' + c.shinies + ' Shinies', e => e.isShiny],
      ['shadow', '👻 ' + c.shadows + ' Sombrios', e => e.isShadow],
      ['size', '📏 ' + c.extremeSizes + ' XXS/XXL', e => e.isExtremeSize],
      ['legendary', '👑 ' + c.legendaries + ' Lendários', e => e.isLegendary],
      ['lucky', '🍀 ' + c.luckies + ' Lucky', e => e.isLucky],
    ];
    const wrap = document.getElementById('chips');
    wrap.innerHTML = '';
    state._specialFns = {};
    for (const [key, label, fn] of defs) {
      state._specialFns[key] = fn;
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.special = key;
      b.textContent = label;
      b.addEventListener('click', () => {
        state.special = state.special === key ? null : key;
        syncChips(); applyFilters();
      });
      wrap.appendChild(b);
    }
  }

  function syncChips() {
    document.querySelectorAll('.chip').forEach(c =>
      c.classList.toggle('active', c.dataset.special === state.special));
    document.querySelectorAll('.hero-card').forEach(h =>
      h.classList.toggle('active', h.dataset.filterVerdict === state.verdict));
    document.getElementById('clear-filters').hidden = !(state.verdict || state.special || state.query);
  }

  function applyFilters() {
    let rows = allMons;
    if (state.verdict) rows = rows.filter(e => e.verdict === state.verdict);
    if (state.special && state._specialFns[state.special]) rows = rows.filter(state._specialFns[state.special]);
    if (state.query) rows = rows.filter(e => e.name.toLowerCase().includes(state.query));
    rows = rows.slice().sort(sortRows);

    const list = document.getElementById('list');
    list.innerHTML = rows.map(cardHtml).join('');
    document.getElementById('empty').hidden = rows.length > 0;

    syncChips();
    toggleTransferMode();
  }

  const VERDICT_ORDER = { INVESTIR:0, MANTER:1, TRANSFERIR:2 };
  function sortRows(a, b) {
    return (VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]) || (b.ivPct - a.ivPct);
  }

  // wiring
  document.querySelectorAll('.hero-card').forEach(card => {
    card.addEventListener('click', () => {
      const v = card.dataset.filterVerdict;
      state.verdict = state.verdict === v ? null : v;
      applyFilters();
    });
  });
  document.getElementById('search').addEventListener('input', e => {
    state.query = e.target.value.trim().toLowerCase();
    applyFilters();
  });
  document.getElementById('clear-filters').addEventListener('click', () => {
    state.verdict = null; state.special = null; state.query = '';
    document.getElementById('search').value = '';
    applyFilters();
  });

  // placeholders preenchidos nas próximas tasks:
  function toggleTransferMode() {}

  window.__pokeApp = { boot, applyFilters, getState: () => state, getMons: () => allMons };
  boot();
})();
```

- [ ] **Step 2: Verificar no navegador**

Run: `npx --yes serve@latest -l 3000 pokemon`
Abra `http://localhost:3000`. Expected:
- Header mostra data (de `exportTime`) e total (614).
- Hero mostra três números que somam o total.
- Chips mostram contagens (ex.: "★ 4 Hundos", "✨ 7 Shinies", "👻 32 Sombrios").
- Lista renderiza cards com veredito e selos.
- Clicar num hero-card filtra; clicar de novo desfaz. Busca por nome funciona.

- [ ] **Step 3: Conferência de segurança (anti-regressão)**

No console do navegador, rodar:
```js
__pokeApp.getMons().filter(e => e.verdict === 'TRANSFERIR' &&
  (e.isShiny||e.isLucky||e.isShadow||e.isLegendary||e.isCostume||e.isExtremeSize||e.isHundo||e.isNearPerfect)).length
```
Expected: `0` (nenhum especial marcado para transferir). Critério de sucesso #2.

- [ ] **Step 4: Commit**

```powershell
git add pokemon/app.js
git commit -m "pokemon: carregamento de dados, contadores, chips, lista e filtros"
```

---

### Task 9: Detalhe ao tocar no card

**Files:**
- Modify: `pokemon/app.js`

- [ ] **Step 1: Adicionar expand/collapse no clique do card**

Em `app.js`, dentro da IIFE, adicionar delegação de evento na lista (depois do wiring existente):
```js
  document.getElementById('list').addEventListener('click', e => {
    const card = e.target.closest('.pk');
    if (!card) return;
    if (e.target.closest('.tf-check')) return; // botão de transferir não expande
    const id = card.dataset.id;
    const mon = allMons.find(m => m.id === id);
    if (!mon) return;
    const existing = card.querySelector('.pk-detail');
    if (existing) { existing.remove(); return; }
    card.insertAdjacentHTML('beforeend', detailHtml(mon));
  });
```

- [ ] **Step 2: Verificar no navegador**

Recarregue `http://localhost:3000`. Expected: tocar num card abre os detalhes (IVs exatos, golpes, altura/peso, batalhas); tocar de novo fecha.

- [ ] **Step 3: Commit**

```powershell
git add pokemon/app.js
git commit -m "pokemon: detalhe do Pokémon ao tocar no card"
```

---

### Task 10: Modo transferir (checklist + progresso)

**Files:**
- Modify: `pokemon/app.js`

- [ ] **Step 1: Implementar checklist persistente por id**

Em `app.js`, substituir o `function toggleTransferMode() {}` por:
```js
  const TF_KEY = 'pokemon-transfer-done';
  function tfGetDone() {
    try { return new Set(JSON.parse(localStorage.getItem(TF_KEY) || '[]')); }
    catch { return new Set(); }
  }
  function tfSaveDone(set) { localStorage.setItem(TF_KEY, JSON.stringify([...set])); }

  function toggleTransferMode() {
    const on = state.verdict === 'TRANSFERIR';
    document.getElementById('transfer-controls').hidden = !on;
    if (!on) return;
    const done = tfGetDone();
    // injeta botão ✓ e estado em cada card visível
    document.querySelectorAll('#list .pk').forEach(card => {
      const id = card.dataset.id;
      if (done.has(id)) card.classList.add('done');
      if (!card.querySelector('.tf-check')) {
        const btn = document.createElement('button');
        btn.className = 'tf-check filter-btn';
        btn.textContent = '✓ já transferi';
        btn.addEventListener('click', ev => {
          ev.stopPropagation();
          const d = tfGetDone();
          if (d.has(id)) { d.delete(id); card.classList.remove('done'); }
          else { d.add(id); card.classList.add('done'); }
          tfSaveDone(d); tfUpdateProgress();
        });
        card.querySelector('.pk-top').appendChild(btn);
      }
    });
    tfUpdateProgress();
  }

  let tfFilterPend = false;
  function tfUpdateProgress() {
    const done = tfGetDone();
    const cards = [...document.querySelectorAll('#list .pk')];
    const doneVisible = cards.filter(c => done.has(c.dataset.id)).length;
    document.getElementById('tf-progress').textContent =
      doneVisible + ' transferidos · ' + (cards.length - doneVisible) + ' restantes';
    cards.forEach(c => { c.style.display = (tfFilterPend && done.has(c.dataset.id)) ? 'none' : ''; });
  }

  document.getElementById('tf-filter').addEventListener('click', function () {
    tfFilterPend = !tfFilterPend;
    this.textContent = tfFilterPend ? '👁 Ver todos' : '🔍 Ver pendentes';
    tfUpdateProgress();
  });
  document.getElementById('tf-clear').addEventListener('click', () => {
    if (!confirm('Limpar todas as marcações de transferência?')) return;
    tfSaveDone(new Set());
    document.querySelectorAll('#list .pk.done').forEach(c => c.classList.remove('done'));
    tfUpdateProgress();
  });
```

- [ ] **Step 2: Verificar no navegador**

Recarregue e clique no hero **❌ Transferir**. Expected:
- Aparece a barra com "Ver pendentes", "Limpar marcações" e progresso.
- Cada card tem botão "✓ já transferi"; marcar deixa o card apagado e atualiza o progresso.
- Recarregar a página mantém as marcações (localStorage).
- "Ver pendentes" oculta os já marcados.

- [ ] **Step 3: Commit**

```powershell
git add pokemon/app.js
git commit -m "pokemon: modo transferir com checklist persistente e progresso"
```

---

## Fase 5 — Limpeza e PWA

### Task 11: Service worker (network-first no JSON) + botão refresh

**Files:**
- Modify: `pokemon/sw.js`
- Verify: `pokemon/index.html` (script de SW + `forcarAtualizacao`)

- [ ] **Step 1: Atualizar `sw.js`**

```js
const CACHE = 'pokemon-leo-v6';
const ASSETS = [
  './index.html', './app.js', './sizes.js',
  './lib/refdata.js', './lib/analysis.js', './lib/render.js',
  './colecao.json', './manifest.json',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isData = url.pathname.endsWith('/colecao.json') || url.pathname.endsWith('colecao.json');

  if (isHTML || isData) {
    // Network-first: sempre tenta o mais novo; cai no cache se offline.
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
    );
    return;
  }
  // Cache-first para o resto (ícones, libs, etc.)
  e.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
```

- [ ] **Step 2: Confirmar o registro do SW e o `forcarAtualizacao` (já incluídos na Task 7)**

Verificar que o `index.html` contém o `<script>` final de registro do service worker e a função `forcarAtualizacao` (adicionados na Task 7). Conferir também que o CSS mantém `.refresh-btn.spinning { animation: refresh-spin 0.8s linear infinite; opacity:0.7; }` e o `@keyframes refresh-spin` (vindos do tema antigo preservado na Task 7). Se faltar a regra `.spinning`, adicioná-la ao `<style>`. Nenhuma outra mudança no HTML aqui.

- [ ] **Step 3: Verificar no navegador**

Run: `npx --yes serve@latest -l 3000 pokemon`. Em aba anônima, abra, depois edite `pokemon/colecao.json` (ex.: mude `pokemonCount`), clique 🔄. Expected: o número atualiza. Offline (DevTools → Network → Offline) recarrega a última versão do cache.

- [ ] **Step 4: Commit**

```powershell
git add pokemon/sw.js pokemon/index.html
git commit -m "pokemon: service worker network-first no JSON (v6) + refresh"
```

---

### Task 12: Apagar `analise.html` e o export antigo

**Files:**
- Delete: `pokemon/analise.html`
- Delete: `pokemon/Pokemons-LeoTrevisan-04-06-2026.json` (já copiado para `colecao.json`)

- [ ] **Step 1: Remover os arquivos obsoletos**

Run (PowerShell):
```powershell
Remove-Item "pokemon/analise.html"
Remove-Item "pokemon/Pokemons-LeoTrevisan-04-06-2026.json"
```

- [ ] **Step 2: Conferir referências órfãs**

Garantir que nada aponta para os arquivos removidos (busca por `analise.html` e `Pokemons-LeoTrevisan`). Expected: nenhuma referência em `pokemon/` além de histórico/spec.

- [ ] **Step 3: Commit**

```powershell
git add -A pokemon/
git commit -m "pokemon: remove analise.html obsoleto e export antigo (vira colecao.json)"
```

---

## Fase 6 — Verificação final

### Task 13: Bateria completa + critérios de sucesso

**Files:** nenhum (verificação)

- [ ] **Step 1: Rodar todos os testes**

Run: `npm --prefix pokemon test`
Expected: PASS em todos os arquivos `test/*.test.js`.

- [ ] **Step 2: Checklist no navegador** (`npx --yes serve@latest -l 3000 pokemon`)

- [ ] A caixa "como abrir no celular" **não** existe.
- [ ] Header mostra data (de `exportTime`) e total corretos.
- [ ] Hero: Transferir + Investir + Manter = total.
- [ ] Chips filtram (hundos, shinies, sombrios, XXS/XXL, lendários, lucky) e mostram contagem.
- [ ] Busca por nome funciona; "limpar filtros" reseta.
- [ ] Card mostra veredito + motivo + selos; tocar abre detalhe.
- [ ] Nenhum especial em "Transferir" (rodar a checagem do console da Task 8/Step 3 → `0`).
- [ ] Modo transferir: marcar/desmarcar, progresso, "ver pendentes", persistência após reload.
- [ ] Sombrio/purificado e tamanho aparecem sempre que aplicável.

- [ ] **Step 3: Simular atualização do Leo**

Substituir `pokemon/colecao.json` por outro export (ou editar contagens), recarregar. Expected: todos os números, selos e vereditos mudam sem tocar no HTML. Critério de sucesso #1.

- [ ] **Step 4: Commit final (se houver ajustes)**

```powershell
git add -A pokemon/
git commit -m "pokemon: ajustes finais da verificação"
```

- [ ] **Step 5: Abrir PR**

```powershell
git push -u origin claude/pokemon-pagina-inteligente
gh pr create --fill --base main
```

---

## Notas de escopo

- **Fora do v1** (conforme spec §3): ranking de IV por liga PvP; "novidades" automáticas por diff de exports.
- **Tag 🔄 Evoluir** foi deixada para depois (exige um dataset de evolução Gen 1–9). As tags 🤝 Trocar-evo e 🌍 Regional usam listas pequenas já incluídas em `refdata.js`. Quando quiser a tag Evoluir, adicionar um conjunto `CAN_EVOLVE`/mapa de evolução em `refdata.js` e estender `computeTags`.
- **Datasets de referência** (`refdata.js`) são a maior fonte de imprecisão. Os testes cobrem casos conhecidos; ampliar conforme necessário (especialmente regionais).
```
