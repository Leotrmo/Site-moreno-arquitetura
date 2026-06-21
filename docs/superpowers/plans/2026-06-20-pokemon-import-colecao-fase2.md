# /pokemon Fase 2 — Importar coleção do SpooferPro (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar o JSON exportado do SpooferPro direto no web app (no celular), guardando-o localmente e mostrando um resumo do que mudou — sem editar o `colecao.json` no GitHub.

**Architecture:** Lógica pura nova em `lib/import.js` (`parseCollection` valida o export; `diffCollections` compara dois snapshots via id estável). Um wrapper fino de `localStorage` em `app.js` guarda a coleção importada; `boot()` passa a ler do armazenamento com fallback pro `colecao.json` versionado. Um painel modal no `index.html` (ícone 📥 no cabeçalho) faz escolher arquivo / colar → prévia/confirmação → substituir. Storage = substituição total; o "histórico" é o diff mostrado na hora.

**Tech Stack:** Vanilla JS (sem build/bundler), padrão de módulo dual (Node `require` + global no browser), testes `node --test`, PWA com Service Worker cache-first.

**Spec:** `docs/superpowers/specs/2026-06-20-pokemon-import-colecao-fase2-design.md`

---

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `pokemon/lib/import.js` | **criar** | Puro: `parseCollection(text)` + `diffCollections(old,new)`. Sem DOM/storage/rede. |
| `pokemon/test/import.test.js` | **criar** | Testes `node --test` de parse + diff. |
| `pokemon/app.js` | modificar | Wrapper de storage (3 funções) + `currentData` + `boot()` lê stored-first + wiring do painel. |
| `pokemon/index.html` | modificar | Botão 📥, painel modal de import, `<script>` do módulo, CSS. |
| `pokemon/sw.js` | modificar | Bump `v23`→`v24` + `./lib/import.js` em `ASSETS`. |

**Convenções a respeitar (de `pokemon/CLAUDE.md`):**
- Padrão de módulo dual em `lib/` (factory que faz `module.exports` no Node e `Object.assign(root, api)` no browser).
- Ordem dos `<script>`: `import.js` não depende de outros `lib/`, basta vir **antes** de `app.js`.
- Regra de ouro do SW: mexeu em asset cache-first (`app.js`/`index.html`/`lib/**`) → **bump `CACHE`** e mantenha `ASSETS` em dia.
- Render anti-XSS: passar strings por `esc()` (global, de `render.js`) ao montar HTML.
- **Não rodar `npm install`** (quebra no Drive). Testes = `node --test` em `pokemon/`.

---

## Task 1: Módulo puro `parseCollection` (validação do export)

**Files:**
- Create: `pokemon/lib/import.js`
- Test: `pokemon/test/import.test.js`

- [ ] **Step 1: Escrever os testes que falham (parse)**

Criar `pokemon/test/import.test.js`:

```js
// pokemon/test/import.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseCollection } = require('../lib/import.js');

// helpers de fixture
function mon(extra) {
  return Object.assign({ mon_name: 'Pikachu', mon_cp: 500, mon_number: 25 }, extra || {});
}
function coll(fileData, top) {
  return Object.assign(
    { exportTime: '16 de jun.', fileName: 'Export-Leo', pokemonCount: Object.keys(fileData).length, fileData },
    top || {}
  );
}

test('parseCollection: válido devolve ok + summary + data', () => {
  const c = coll({ '1': mon(), '2': mon({ mon_name: 'Bulbasaur', mon_number: 1 }) });
  const res = parseCollection(JSON.stringify(c));
  assert.equal(res.ok, true);
  assert.equal(res.summary.count, 2);
  assert.equal(res.summary.exportTime, '16 de jun.');
  assert.equal(res.summary.fileName, 'Export-Leo');
  assert.equal(res.data.fileData['1'].mon_name, 'Pikachu');
});

test('parseCollection: JSON quebrado é rejeitado', () => {
  const res = parseCollection('{ não é json ');
  assert.equal(res.ok, false);
  assert.match(res.error, /JSON/);
});

test('parseCollection: sem fileData é rejeitado', () => {
  const res = parseCollection(JSON.stringify({ exportTime: 'x' }));
  assert.equal(res.ok, false);
  assert.match(res.error, /fileData/);
});

test('parseCollection: fileData vazio é rejeitado', () => {
  const res = parseCollection(JSON.stringify(coll({})));
  assert.equal(res.ok, false);
  assert.match(res.error, /vazio/);
});

test('parseCollection: entradas que não parecem Pokémon são rejeitadas', () => {
  const res = parseCollection(JSON.stringify(coll({ '1': { foo: 'bar' } })));
  assert.equal(res.ok, false);
  assert.match(res.error, /Pokémon|mon_name/);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd pokemon && node --test test/import.test.js`
Expected: FAIL — `Cannot find module '../lib/import.js'`.

- [ ] **Step 3: Criar `lib/import.js` com `parseCollection`**

Criar `pokemon/lib/import.js`:

```js
// pokemon/lib/import.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function looksLikeMon(entry) {
    return !!entry && typeof entry === 'object' &&
      typeof entry.mon_name === 'string' &&
      typeof entry.mon_cp === 'number' &&
      typeof entry.mon_number === 'number';
  }

  // Recebe o texto de um arquivo/textarea, valida o shape do export do SpooferPro
  // e resume. NÃO transforma os dados (o export já é o shape do colecao.json).
  function parseCollection(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'Não consegui ler o arquivo: não é um JSON válido.' };
    }
    const fd = data && data.fileData;
    if (!fd || typeof fd !== 'object' || Array.isArray(fd)) {
      return { ok: false, error: "Esse JSON não tem 'fileData' — não parece um export do SpooferPro." };
    }
    const ids = Object.keys(fd);
    if (ids.length === 0) {
      return { ok: false, error: "O export está vazio (nenhum Pokémon em 'fileData')." };
    }
    const sample = ids.slice(0, 3).map(id => fd[id]);
    if (!sample.every(looksLikeMon)) {
      return { ok: false, error: 'Esse JSON não parece uma coleção de Pokémon (faltam campos como mon_name/mon_cp).' };
    }
    return {
      ok: true,
      data,
      summary: {
        count: ids.length,
        exportTime: data.exportTime || '',
        fileName: data.fileName || '',
      },
    };
  }

  return { parseCollection };
});
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd pokemon && node --test test/import.test.js`
Expected: PASS — 5 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/import.js pokemon/test/import.test.js
git commit -m "feat(pokemon): parseCollection — valida export do SpooferPro (Fase 2)"
```

---

## Task 2: Módulo puro `diffCollections` (resumo de mudanças via id)

**Files:**
- Modify: `pokemon/lib/import.js`
- Test: `pokemon/test/import.test.js`

- [ ] **Step 1: Adicionar os testes que falham (diff)**

Acrescentar ao fim de `pokemon/test/import.test.js` (e incluir `diffCollections` no `require` do topo):

No topo, trocar a linha do require por:

```js
const { parseCollection, diffCollections } = require('../lib/import.js');
```

No fim do arquivo, adicionar:

```js
test('diffCollections: sem coleção anterior → first', () => {
  const res = diffCollections(null, coll({ '1': mon() }));
  assert.deepEqual(res, { first: true });
});

test('diffCollections: detecta novos, transferidos e fortalecidos', () => {
  const old = coll({
    'a': mon({ mon_cp: 500 }),   // vai fortalecer
    'b': mon({ mon_cp: 100 }),   // some → transferido
    'c': mon({ mon_cp: 800 }),   // inalterado
  });
  const neu = coll({
    'a': mon({ mon_cp: 1500 }),  // fortalecido (CP subiu)
    'c': mon({ mon_cp: 800 }),   // inalterado
    'd': mon({ mon_cp: 200 }),   // novo
  });
  assert.deepEqual(diffCollections(old, neu), { novos: 1, transferidos: 1, fortalecidos: 1 });
});

test('diffCollections: mesmo CP não conta como fortalecido', () => {
  const old = coll({ 'a': mon({ mon_cp: 500 }) });
  const neu = coll({ 'a': mon({ mon_cp: 500 }) });
  assert.deepEqual(diffCollections(old, neu), { novos: 0, transferidos: 0, fortalecidos: 0 });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd pokemon && node --test test/import.test.js`
Expected: FAIL — `diffCollections is not a function`.

- [ ] **Step 3: Implementar `diffCollections` em `lib/import.js`**

Em `pokemon/lib/import.js`, adicionar a função **antes** do `return` e incluí-la na exportação:

```js
  // Compara dois snapshots completos pelo id estável (chave de fileData = id do Pokémon GO).
  // Detecta novos / transferidos / fortalecidos. Evoluídos ficam de fora (o GO troca o id
  // ao evoluir). Defensivo: sem snapshot anterior, devolve { first: true }.
  function diffCollections(oldData, newData) {
    const newFd = (newData && newData.fileData) || {};
    const oldFd = oldData && oldData.fileData;
    if (!oldFd || Object.keys(oldFd).length === 0) {
      return { first: true };
    }
    let novos = 0, transferidos = 0, fortalecidos = 0;
    for (const id of Object.keys(newFd)) {
      if (!(id in oldFd)) { novos++; continue; }
      const oldCp = Number(oldFd[id].mon_cp) || 0;
      const newCp = Number(newFd[id].mon_cp) || 0;
      if (newCp > oldCp) fortalecidos++;
    }
    for (const id of Object.keys(oldFd)) {
      if (!(id in newFd)) transferidos++;
    }
    return { novos, transferidos, fortalecidos };
  }
```

E trocar a linha do `return` para:

```js
  return { parseCollection, diffCollections };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd pokemon && node --test test/import.test.js`
Expected: PASS — 8 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add pokemon/lib/import.js pokemon/test/import.test.js
git commit -m "feat(pokemon): diffCollections — resumo novos/transferidos/fortalecidos (Fase 2)"
```

---

## Task 3: Servir o módulo (SW + `<script>`)

**Files:**
- Modify: `pokemon/sw.js:1`, `pokemon/sw.js:4`
- Modify: `pokemon/index.html:413` (antes de `app.js`)

- [ ] **Step 1: Bump do cache do Service Worker**

Em `pokemon/sw.js`, linha 1, trocar:

```js
const CACHE = 'pokemon-leo-v23';
```

por:

```js
const CACHE = 'pokemon-leo-v24';
```

- [ ] **Step 2: Adicionar `import.js` à lista `ASSETS`**

Em `pokemon/sw.js`, linha 4, na lista de libs, trocar:

```js
  './lib/refdata.js', './lib/analysis.js', './lib/render.js', './lib/sort.js', './lib/meta/match.js', './lib/meta/pvp.js', './lib/meta/pve.js', './lib/meta/cost.js', './lib/meta/score.js',
```

por (acrescentando `./lib/import.js`):

```js
  './lib/refdata.js', './lib/analysis.js', './lib/render.js', './lib/sort.js', './lib/import.js', './lib/meta/match.js', './lib/meta/pvp.js', './lib/meta/pve.js', './lib/meta/cost.js', './lib/meta/score.js',
```

- [ ] **Step 3: Carregar o `<script>` antes de `app.js`**

Em `pokemon/index.html`, antes da linha `<script src="./app.js"></script>` (linha 414), inserir:

```html
<script src="./lib/import.js"></script>
```

A ordem fica: `… lib/sort.js → lib/import.js → app.js`.

- [ ] **Step 4: Sanidade — testes ainda verdes**

Run: `cd pokemon && node --test`
Expected: PASS — toda a suíte verde (≈245 testes, incluindo os 8 novos).

- [ ] **Step 5: Commit**

```bash
git add pokemon/sw.js pokemon/index.html
git commit -m "chore(pokemon): serve lib/import.js + bump SW v23->v24 (Fase 2)"
```

---

## Task 4: Wrapper de armazenamento + `boot()` lê stored-first

**Files:**
- Modify: `pokemon/app.js:3` (declarar `currentData`)
- Modify: `pokemon/app.js:18-20` (adicionar wrapper após `loadDir`)
- Modify: `pokemon/app.js:38-43` (mudar `boot()`)

- [ ] **Step 1: Declarar `currentData`**

Em `pokemon/app.js`, linha 3, trocar:

```js
  let allMons = [];            // lista enriquecida
```

por:

```js
  let allMons = [];            // lista enriquecida
  let currentData = null;      // objeto de coleção carregado (p/ diff no import)
```

- [ ] **Step 2: Adicionar o wrapper de armazenamento**

Em `pokemon/app.js`, logo após a função `loadDir()` (depois da linha 20, antes de `loadMeta`), inserir:

```js
  // ---- Armazenamento da coleção importada (localStorage; fallback = colecao.json) ----
  const COLLECTION_KEY = 'pokemon-colecao';
  function saveCollection(data) {
    try { localStorage.setItem(COLLECTION_KEY, JSON.stringify(data)); return true; }
    catch (e) { console.error('falha ao salvar coleção:', e); return false; }
  }
  function loadStoredCollection() {
    try { const s = localStorage.getItem(COLLECTION_KEY); return s ? JSON.parse(s) : null; }
    catch { return null; }
  }
  function clearStoredCollection() {
    try { localStorage.removeItem(COLLECTION_KEY); } catch {}
  }
```

- [ ] **Step 3: `boot()` lê do armazenamento (com contagem real)**

Em `pokemon/app.js`, na função `boot()`, trocar as linhas:

```js
      const res = await fetch('./colecao.json', { cache: 'no-store' });
      const data = await res.json();
      document.getElementById('updated').textContent = 'Leo · ' + (data.exportTime || '');
      document.getElementById('total').textContent = (data.pokemonCount || 0) + ' Pokémons';
```

por:

```js
      const data = loadStoredCollection()
        || await fetch('./colecao.json', { cache: 'no-store' }).then(r => r.json());
      currentData = data;
      const count = Object.keys((data && data.fileData) || {}).length;
      document.getElementById('updated').textContent = 'Leo · ' + (data.exportTime || '');
      document.getElementById('total').textContent = count + ' Pokémons';
```

- [ ] **Step 4: Sanidade — testes ainda verdes**

Run: `cd pokemon && node --test`
Expected: PASS — suíte verde (não há teste unitário de `app.js`; o objetivo é garantir que nada quebrou). O comportamento muda só quando houver coleção salva — verificado ao vivo na Task 7.

- [ ] **Step 5: Commit**

```bash
git add pokemon/app.js
git commit -m "feat(pokemon): boot lê coleção do armazenamento (stored-first) + wrapper (Fase 2)"
```

---

## Task 5: UI do painel de import (markup + CSS)

**Files:**
- Modify: `pokemon/index.html:116` (header `position: relative`)
- Modify: `pokemon/index.html:338` (bloco CSS antes de `</style>`)
- Modify: `pokemon/index.html:354-358` (botão 📥 no header)
- Modify: `pokemon/index.html:398` (painel após `filters-panel`)

- [ ] **Step 1: Header relativo (p/ ancorar o botão)**

Em `pokemon/index.html`, linha 116, trocar:

```css
header { text-align: center; padding-top: 12px; margin-bottom: 14px; }
```

por:

```css
header { position: relative; text-align: center; padding-top: 12px; margin-bottom: 14px; }
```

- [ ] **Step 2: CSS do botão e do painel**

Em `pokemon/index.html`, imediatamente antes de `</style>` (linha 338), inserir:

```css
/* Importação de coleção (Fase 2) */
.import-btn {
  position: absolute; top: 6px; right: 0;
  background: var(--amarelo); color: var(--preto);
  border: 2px solid var(--preto); border-radius: 6px; box-shadow: 0 2px 0 var(--preto);
  font-size: 16px; line-height: 1; padding: 6px 8px; cursor: pointer;
}
.import-btn:active { transform: translateY(2px); box-shadow: none; }
.import-panel { background: #fff; border: 3px solid var(--preto); border-radius: 8px;
  box-shadow: 0 3px 0 var(--preto); padding: 10px; margin-bottom: 12px;
  display: flex; flex-direction: column; gap: 10px; }
.import-panel[hidden] { display: none; }
.import-hint { font-size: 15px; color: var(--tinta-fraca); }
.import-file-label { text-align: center; }
.import-link { background: none; border: none; color: var(--azul-dado);
  font-family: 'VT323', monospace; font-size: 17px; text-decoration: underline;
  cursor: pointer; align-self: flex-start; padding: 0; }
.import-panel textarea { width: 100%; font-family: monospace; font-size: 13px;
  border: 2px solid var(--preto); border-radius: 6px; padding: 6px; resize: vertical; }
.import-error { color: var(--transferir); font-size: 16px; }
.import-result { font-size: 16px; display: flex; flex-direction: column; gap: 4px; }
.import-diff { font-weight: bold; }
.import-actions { display: flex; gap: 8px; }
.import-restore { color: var(--transferir); align-self: flex-start; }
```

- [ ] **Step 3: Botão 📥 no header**

Em `pokemon/index.html`, trocar o bloco `<header>` (linhas 354-358):

```html
        <header>
          <h1>🎮 Análise da Coleção</h1>
          <div class="subtitle" id="updated">carregando…</div>
          <div class="total-count" id="total">—</div>
        </header>
```

por:

```html
        <header>
          <button type="button" class="import-btn" id="import-open" aria-label="Importar coleção" title="Importar coleção">📥</button>
          <h1>🎮 Análise da Coleção</h1>
          <div class="subtitle" id="updated">carregando…</div>
          <div class="total-count" id="total">—</div>
        </header>
```

- [ ] **Step 4: Markup do painel de import**

Em `pokemon/index.html`, logo após o fechamento do `#filters-panel` (a `</div>` da linha 398), inserir:

```html
        <div id="import-panel" class="import-panel" hidden>
          <div class="filters-head"><strong>📥 Importar coleção</strong><button class="filter-btn" id="import-close">✕</button></div>
          <p class="import-hint">Escolha o arquivo .json exportado do SpooferPro.</p>
          <label class="filt-btn import-file-label">Escolher arquivo .json
            <input type="file" id="import-file" accept=".json,application/json" hidden>
          </label>
          <button class="import-link" id="import-paste-toggle" type="button">ou colar JSON</button>
          <div id="import-paste-wrap" hidden>
            <textarea id="import-text" rows="4" placeholder="Cole aqui o conteúdo do .json"></textarea>
            <button class="filt-btn" id="import-paste-use" type="button">Usar texto colado</button>
          </div>
          <p class="import-error" id="import-error" hidden></p>
          <div class="import-result" id="import-result" hidden></div>
          <div class="import-actions" id="import-actions" hidden>
            <button class="filt-btn" id="import-confirm" type="button">Confirmar</button>
            <button class="filter-btn" id="import-cancel" type="button">Cancelar</button>
          </div>
          <button class="import-link import-restore" id="import-restore" type="button">↩ Restaurar padrão</button>
        </div>
```

- [ ] **Step 5: Sanidade — testes ainda verdes (HTML não tem teste, só garante que nada do JS quebrou)**

Run: `cd pokemon && node --test`
Expected: PASS — suíte verde.

- [ ] **Step 6: Commit**

```bash
git add pokemon/index.html
git commit -m "feat(pokemon): UI do painel de import (botão 📥 + modal + CSS) (Fase 2)"
```

---

## Task 6: Wiring do painel de import (`app.js`)

**Files:**
- Modify: `pokemon/app.js:327` (inserir o bloco de wiring antes de `window.__pokeApp = …`)

- [ ] **Step 1: Adicionar o wiring do import**

Em `pokemon/app.js`, imediatamente **antes** da linha `window.__pokeApp = { … };` (linha 327), inserir:

```js
  // ---- Importação de coleção: painel, arquivo/colar, prévia/confirmação ----
  const importEls = {
    panel:       document.getElementById('import-panel'),
    file:        document.getElementById('import-file'),
    pasteToggle: document.getElementById('import-paste-toggle'),
    pasteWrap:   document.getElementById('import-paste-wrap'),
    text:        document.getElementById('import-text'),
    pasteUse:    document.getElementById('import-paste-use'),
    error:       document.getElementById('import-error'),
    result:      document.getElementById('import-result'),
    actions:     document.getElementById('import-actions'),
    confirm:     document.getElementById('import-confirm'),
    cancel:      document.getElementById('import-cancel'),
    restore:     document.getElementById('import-restore'),
  };
  let importPending = null;   // data validada aguardando confirmação

  function resetImport() {
    importPending = null;
    importEls.error.hidden = true;  importEls.error.textContent = '';
    importEls.result.hidden = true; importEls.result.innerHTML = '';
    importEls.actions.hidden = true;
    importEls.pasteWrap.hidden = true;
    importEls.text.value = '';
    importEls.file.value = '';
  }
  function openImport()  { resetImport(); importEls.panel.hidden = false; }
  function closeImport() { importEls.panel.hidden = true; }

  function showImportError(msg) {
    importPending = null;
    importEls.result.hidden = true; importEls.actions.hidden = true;
    importEls.error.textContent = msg;
    importEls.error.hidden = false;
  }

  function handleImportText(text) {
    const res = parseCollection(text);
    if (!res.ok) { showImportError(res.error); return; }
    importPending = res.data;
    const diff = diffCollections(currentData, res.data);
    const linhaMud = diff.first
      ? 'Primeira importação.'
      : '+' + diff.novos + ' novos · −' + diff.transferidos + ' transferidos · ' + diff.fortalecidos + ' fortalecidos';
    const atual = Object.keys((currentData && currentData.fileData) || {}).length;
    importEls.error.hidden = true;
    importEls.result.innerHTML =
      '<p><strong>' + esc(res.summary.fileName || 'arquivo') + '</strong></p>' +
      '<p>' + res.summary.count + ' Pokémon · exportado ' + esc(res.summary.exportTime || '?') + '</p>' +
      '<p class="import-diff">' + esc(linhaMud) + '</p>' +
      '<p>Substituir a coleção atual (' + atual + ')?</p>';
    importEls.result.hidden = false;
    importEls.actions.hidden = false;
  }

  document.getElementById('import-open').addEventListener('click', openImport);
  document.getElementById('import-close').addEventListener('click', closeImport);
  importEls.pasteToggle.addEventListener('click', () => {
    importEls.pasteWrap.hidden = !importEls.pasteWrap.hidden;
  });
  importEls.file.addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload  = () => handleImportText(String(reader.result || ''));
    reader.onerror = () => showImportError('Não consegui ler o arquivo.');
    reader.readAsText(f);
  });
  importEls.pasteUse.addEventListener('click', () => handleImportText(importEls.text.value));
  importEls.cancel.addEventListener('click', resetImport);
  importEls.confirm.addEventListener('click', () => {
    if (!importPending) return;
    if (!saveCollection(importPending)) {
      showImportError('Não consegui salvar no aparelho (armazenamento cheio?).');
      return;
    }
    closeImport();
    boot();   // recarrega: agora loadStoredCollection() devolve o import
  });
  importEls.restore.addEventListener('click', () => {
    if (!confirm('Restaurar a coleção padrão (descartar o import)?')) return;
    clearStoredCollection();
    closeImport();
    boot();
  });
```

- [ ] **Step 2: Sanidade — testes ainda verdes**

Run: `cd pokemon && node --test`
Expected: PASS — suíte verde.

- [ ] **Step 3: Commit**

```bash
git add pokemon/app.js
git commit -m "feat(pokemon): wiring do import (arquivo/colar → prévia → substituir) (Fase 2)"
```

---

## Task 7: Verificação ao vivo (mobile) + sanidade final

**Files:** nenhum (verificação).

- [ ] **Step 1: Suíte completa verde**

Run: `cd pokemon && node --test`
Expected: PASS — toda a suíte (≈245 testes).

- [ ] **Step 2: Sanidade do diff contra a coleção real (Node)**

Run:
```bash
cd pokemon && node -e "
const { parseCollection, diffCollections } = require('./lib/import.js');
const fs = require('fs');
const txt = fs.readFileSync('./colecao.json','utf8');
const a = parseCollection(txt);
console.log('parse real ok?', a.ok, 'count', a.summary && a.summary.count);
// diff de um snapshot contra ele mesmo = tudo zero
console.log('self-diff', diffCollections(a.data, a.data));
"
```
Expected: `parse real ok? true count 722` e `self-diff { novos: 0, transferidos: 0, fortalecidos: 0 }`.

- [ ] **Step 3: Verificação no navegador (preview)**

Subir o preview servindo `pokemon/` e abrir `index.html`. Verificar:
1. A página carrega (lista + cabeçalho "Leo · … / 722 Pokémons" — contagem real, não 723).
2. Tocar **📥** abre o painel.
3. **Colar** um JSON pequeno modificado (ex.: pegar `colecao.json`, remover 2 entradas e subir o `mon_cp` de 1) → a prévia mostra `fileName`, contagem e a linha de mudanças (`−2 transferidos · 1 fortalecido` etc.) → **Confirmar** substitui (cabeçalho/lista atualizam).
4. **Restaurar padrão** → confirma → volta à contagem original (722).
5. **Console sem erros**; um JSON inválido (ex.: `{}` colado) mostra erro em PT e **não** destrói a coleção.

Usar os tools `preview_*` (start, snapshot, console_logs, fill/click). Se a navegação por hash não recarregar o SW, forçar reload com `?cb=<timestamp>`.

- [ ] **Step 4: Screenshot de prova**

Tirar `preview_screenshot` do painel com a prévia de mudanças preenchida e compartilhar.

---

## Self-review (preenchido pelo autor do plano)

**Cobertura do spec:**
- §3 sem adapter → guardamos `data` como veio (Task 1/4). ✓
- §4.1 `parseCollection` → Task 1. ✓
- §4.1b `diffCollections` (novos/transferidos/fortalecidos, first) → Task 2. ✓
- §4.2 wrapper localStorage (`pokemon-colecao`) → Task 4. ✓
- §4.3 `boot()` stored-first + contagem real → Task 4. ✓
- §5 painel 📥, arquivo + colar, prévia/confirmação com `fileName`, restaurar → Tasks 5/6. ✓
- §6 validação (não-JSON / sem fileData / vazio / lixo) → Task 1 + testes. ✓
- §7 SW bump v24 + ASSETS + ordem de `<script>` → Task 3. ✓
- §8 testes parse + diff → Tasks 1/2; sanidade Task 7. ✓
- §9 verificação ao vivo → Task 7. ✓

**Placeholders:** nenhum TODO/TBD; todo passo tem código/comando completo.

**Consistência de tipos:** `parseCollection → {ok,data,summary{count,exportTime,fileName},error}`; `diffCollections → {first} | {novos,transferidos,fortalecidos}`; wrapper `saveCollection/loadStoredCollection/clearStoredCollection`; `currentData` usado no diff e setado em `boot`. Nomes batem entre Tasks 1/2/4/6.
