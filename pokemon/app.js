// pokemon/app.js
(function () {
  let allMons = [];            // lista enriquecida
  let currentData = null;      // objeto de coleção carregado (p/ diff no import)
  const SORT_KEY = 'pokemon-sort';
  const DIR_KEY = 'pokemon-sort-dir';
  const MODE_KEY = 'pokemon-mode';
  const MODES = [['resumo','🏠 Resumo'],['limpar','🧹 Limpar'],['usar','⚔️ Usar'],['investir','💪 Investir']];
  const OBJECTIVES = [['pvp_great','⚔️ Grande'],['pvp_ultra','⚔️ Ultra'],['pvp_master','⚔️ Mestre'],['raid','🔥 Raid/PvE'],['colecao','✨ Coleção']];
  // Abre sempre no Resumo neutro (pedido do usuário); MODE_KEY é gravado p/ uso futuro.
  const state = { mode: 'resumo', objective: 'colecao', special: null, query: '', todos: false,
                  sort: loadSort(), dirRev: loadDir() };

  function loadSort() {
    const saved = localStorage.getItem(SORT_KEY);
    return SORT_OPTIONS.some(o => o.key === saved) ? saved : 'recomendado';
  }

  function loadDir() {
    return localStorage.getItem(DIR_KEY) === 'rev';
  }

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

  async function loadMeta() {
    try {
      const [species, movesPt, pvpRanks, cpm, pveRanks, moves] = await Promise.all([
        fetch('./data/species.json').then(r => r.ok ? r.json() : null),
        fetch('./data/moves_pt.json').then(r => r.ok ? r.json() : null),
        fetch('./data/pvp_ranks.json').then(r => r.ok ? r.json() : null),
        fetch('./data/cpm.json').then(r => r.ok ? r.json() : null),
        fetch('./data/pve_ranks.json').then(r => r.ok ? r.json() : null),
        fetch('./data/moves.json').then(r => r.ok ? r.json() : null),
      ]);
      if (!species || !movesPt) return null;
      return { speciesIndex: PokeMatch.buildSpeciesIndex(species), movesPt,
               pvpRanks: pvpRanks || null, cpm: cpm || null, pveRanks: pveRanks || null, moves: moves || null };
    } catch (e) { console.warn('meta indisponível:', e); return null; }
  }

  async function boot() {
    try {
      const data = loadStoredCollection()
        || await fetch('./colecao.json', { cache: 'no-store' }).then(r => r.json());
      currentData = data;
      const count = Object.keys((data && data.fileData) || {}).length;
      document.getElementById('updated').textContent = 'Leo · ' + (data.exportTime || '');
      document.getElementById('total').textContent = count + ' Pokémons';
      const meta = await loadMeta();   // null se datasets ausentes
      allMons = analyze(data.fileData, getPokemonSize,
                        { LEGENDARY, REGIONAL, TRADE_EVO }, getPokemonSizeScalar, meta);
      renderCounts();
      renderChips();
      renderSortOptions();
      renderModeBar();
      renderObjectiveBar();
      showView();
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
      ['tradeiv', '🔁 ' + c.tradeBoost + ' Trocar p/ IV', e => !!e.tradeBoost],
      ['pvp_great',  '⚔️ Grande ' + c.pvpGreat,  e => e.tags.includes('pvp_great')],
      ['pvp_ultra',  '⚔️ Ultra ' + c.pvpUltra,   e => e.tags.includes('pvp_ultra')],
      ['pvp_master', '⚔️ Mestre ' + c.pvpMaster,  e => e.tags.includes('pvp_master')],
      ['raid',    '🔥 Raid ' + c.raid,           e => e.tags.includes('raid')],
      ['gym_def', '🛡️ Def. Ginásio ' + c.gymDef, e => e.tags.includes('gym_def')],
      ['rocket',  '🚀 Rocket ' + c.rocket,    e => e.tags.includes('rocket')],
      ['evoluir', '⬆️ Evoluir ' + c.evoluir,  e => e.action && e.action.kind === 'EVOLUIR'],
    ];
    const resumoWrap = document.getElementById('chips');
    const filterWrap = document.getElementById('filter-chips');
    resumoWrap.innerHTML = ''; filterWrap.innerHTML = '';
    state._specialFns = {};
    for (const [key, label, fn] of defs) {
      state._specialFns[key] = fn;
      // chip do Resumo: navega pra lista (objetivo competitivo ou browse filtrado)
      const r = document.createElement('button');
      r.className = 'chip'; r.dataset.special = key; r.textContent = label;
      r.addEventListener('click', () => {
        if (COMP_RANK_KEYS.includes(key)) { state.objective = key; state.special = null; state.todos = false; goMode('usar'); }
        else { state.objective = 'colecao'; state.special = key; state.todos = true; goMode('usar'); }
      });
      resumoWrap.appendChild(r);
      // chip do painel Filtros: liga/desliga filtro na lista atual
      const f = document.createElement('button');
      f.className = 'chip'; f.dataset.special = key; f.textContent = label;
      f.addEventListener('click', () => {
        state.special = state.special === key ? null : key;
        syncChips(); applyFilters();
      });
      filterWrap.appendChild(f);
    }
  }

  function syncChips() {
    document.querySelectorAll('#filter-chips .chip').forEach(c =>
      c.classList.toggle('active', c.dataset.special === state.special));
  }

  function renderModeBar() {
    const wrap = document.getElementById('mode-bar');
    wrap.innerHTML = '';
    for (const [key, label] of MODES) {
      const b = document.createElement('button');
      b.className = 'mode-btn'; b.dataset.mode = key; b.textContent = label;
      b.addEventListener('click', () => goMode(key));
      wrap.appendChild(b);
    }
    syncModeBar();
  }

  function syncModeBar() {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === state.mode));
  }

  function showView() {
    const isResumo = state.mode === 'resumo';
    document.getElementById('view-resumo').hidden = !isResumo;
    document.getElementById('view-list').hidden = isResumo;
    document.getElementById('objective').hidden = state.mode !== 'usar';
  }

  function goMode(mode) {
    state.mode = mode;
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
    syncModeBar(); showView();
    if (mode === 'usar') renderObjectiveBar();
    if (mode !== 'resumo') applyFilters();
  }

  function renderObjectiveBar() {
    const wrap = document.getElementById('objective');
    wrap.innerHTML = '';
    for (const [key, label] of OBJECTIVES) {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.objective = key; b.textContent = label;
      b.classList.toggle('active', key === state.objective);
      b.addEventListener('click', () => {
        state.objective = key; state.todos = false;
        renderObjectiveBar(); applyFilters();
      });
      wrap.appendChild(b);
    }
  }

  function renderSortOptions() {
    const sel = document.getElementById('sort');
    sel.innerHTML = SORT_OPTIONS
      .map(o => '<option value="' + o.key + '">' + o.label + '</option>').join('');
    sel.value = state.sort;
    syncSortDir();
  }

  function syncSortDir() {
    const btn = document.getElementById('sort-dir');
    if (!btn) return;
    btn.textContent = state.dirRev ? '↑' : '↓';
    btn.classList.toggle('rev', state.dirRev);
    btn.setAttribute('aria-pressed', String(state.dirRev));
    btn.title = state.dirRev ? 'Ordem invertida (toque p/ normal)' : 'Ordem normal (toque p/ inverter)';
  }

  function lensForMode() {
    if (state.mode === 'usar') {
      if (state.objective && state.objective.indexOf('pvp_') === 0) return 'pvp';
      if (state.objective === 'colecao') return 'colecao';
    }
    return 'eficiencia';
  }

  function baseRows() {
    if (state.todos) return allMons;
    if (state.mode === 'limpar')   return allMons.filter(e => e.verdict === 'TRANSFERIR');
    if (state.mode === 'investir') return allMons.filter(e => e.verdict === 'INVESTIR');
    if (state.mode === 'usar') {
      if (COMP_RANK_KEYS.includes(state.objective)) return allMons.filter(e => e.tags.includes(state.objective));
      return allMons; // coleção: tudo, ranqueado pela lente colecao
    }
    return allMons;
  }

  function sorterForView() {
    if (state.mode === 'usar') {
      if (COMP_RANK_KEYS.includes(state.objective)) return competitiveRankSorter(state.objective);
      return lensSorter('colecao');
    }
    if (state.mode === 'limpar')   return getSorter('recomendado', true);  // transferir no topo
    if (state.mode === 'investir') return getSorter('recomendado', false); // investir no topo
    return getSorter(state.sort, state.dirRev);
  }

  function applyFilters() {
    if (state.mode === 'resumo') return;
    let rows = baseRows();
    if (state.special && state._specialFns[state.special]) rows = rows.filter(state._specialFns[state.special]);
    if (state.query) rows = rows.filter(e => e.name.toLowerCase().includes(state.query));
    rows = rows.slice().sort(sorterForView());

    const lens = lensForMode();
    const list = document.getElementById('list');
    list.innerHTML = rows.map(e => cardHtml(e, { mode: state.mode, lens })).join('');
    document.getElementById('empty').hidden = rows.length > 0;
    syncChips();
    toggleTransferMode();
  }

  // wiring
  document.querySelectorAll('[data-go-mode]').forEach(el =>
    el.addEventListener('click', () => goMode(el.dataset.goMode)));
  document.querySelectorAll('[data-go-todos]').forEach(el =>
    el.addEventListener('click', () => { state.todos = true; state.special = null; goMode('usar'); }));

  document.getElementById('search').addEventListener('input', e => {
    state.query = e.target.value.trim().toLowerCase();
    applyFilters();
  });
  document.getElementById('sort').addEventListener('change', e => {
    state.sort = e.target.value;
    try { localStorage.setItem(SORT_KEY, state.sort); } catch {}
    applyFilters();
  });
  document.getElementById('sort-dir').addEventListener('click', () => {
    state.dirRev = !state.dirRev;
    try { localStorage.setItem(DIR_KEY, state.dirRev ? 'rev' : 'nat'); } catch {}
    syncSortDir();
    applyFilters();
  });

  document.getElementById('open-filters').addEventListener('click', () => {
    const p = document.getElementById('filters-panel'); p.hidden = !p.hidden;
  });
  document.getElementById('filters-close').addEventListener('click', () =>
    document.getElementById('filters-panel').hidden = true);
  document.getElementById('filt-todos').addEventListener('change', e => {
    state.todos = e.target.checked; applyFilters();
  });
  document.getElementById('clear-filters').addEventListener('click', () => {
    state.special = null; state.query = ''; state.todos = false;
    document.getElementById('search').value = '';
    document.getElementById('filt-todos').checked = false;
    syncChips(); applyFilters();
  });

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

  const TF_KEY = 'pokemon-transfer-done';
  function tfGetDone() {
    try { return new Set(JSON.parse(localStorage.getItem(TF_KEY) || '[]')); }
    catch { return new Set(); }
  }
  function tfSaveDone(set) { localStorage.setItem(TF_KEY, JSON.stringify([...set])); }

  function toggleTransferMode() {
    const on = state.mode === 'limpar';
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

  window.__pokeApp = { boot, applyFilters, goMode, getState: () => state, getMons: () => allMons };
  boot();
})();
