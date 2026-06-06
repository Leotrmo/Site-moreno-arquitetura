// pokemon/app.js
(function () {
  let allMons = [];            // lista enriquecida
  const SORT_KEY = 'pokemon-sort';
  const state = { verdict: null, special: null, query: '', sort: loadSort() };

  function loadSort() {
    const saved = localStorage.getItem(SORT_KEY);
    return SORT_OPTIONS.some(o => o.key === saved) ? saved : 'recomendado';
  }

  async function boot() {
    try {
      const res = await fetch('./colecao.json', { cache: 'no-store' });
      const data = await res.json();
      document.getElementById('updated').textContent = 'Leo · ' + (data.exportTime || '');
      document.getElementById('total').textContent = (data.pokemonCount || 0) + ' Pokémons';
      allMons = analyze(data.fileData, getPokemonSize, { LEGENDARY, REGIONAL, TRADE_EVO }, getPokemonSizeScalar);
      renderCounts();
      renderChips();
      renderSortOptions();
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

  function renderSortOptions() {
    const sel = document.getElementById('sort');
    sel.innerHTML = SORT_OPTIONS
      .map(o => '<option value="' + o.key + '">' + o.label + '</option>').join('');
    sel.value = state.sort;
  }

  function applyFilters() {
    let rows = allMons;
    if (state.verdict) rows = rows.filter(e => e.verdict === state.verdict);
    if (state.special && state._specialFns[state.special]) rows = rows.filter(state._specialFns[state.special]);
    if (state.query) rows = rows.filter(e => e.name.toLowerCase().includes(state.query));
    rows = rows.slice().sort(getSorter(state.sort));

    const list = document.getElementById('list');
    list.innerHTML = rows.map(cardHtml).join('');
    document.getElementById('empty').hidden = rows.length > 0;

    syncChips();
    toggleTransferMode();
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
  document.getElementById('sort').addEventListener('change', e => {
    state.sort = e.target.value;
    try { localStorage.setItem(SORT_KEY, state.sort); } catch {}
    applyFilters();
  });
  document.getElementById('clear-filters').addEventListener('click', () => {
    state.verdict = null; state.special = null; state.query = '';
    document.getElementById('search').value = '';
    applyFilters();
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

  window.__pokeApp = { boot, applyFilters, getState: () => state, getMons: () => allMons };
  boot();
})();
