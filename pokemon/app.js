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

  // placeholders preenchidos nas próximas tasks:
  function toggleTransferMode() {}

  window.__pokeApp = { boot, applyFilters, getState: () => state, getMons: () => allMons };
  boot();
})();
