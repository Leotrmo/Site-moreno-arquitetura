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
    if (e.size === 'XXS' || e.size === 'XXL') b.push('<span class="badge b-size">' + e.size + '</span>');
    else if (e.isXSComfort) b.push('<span class="badge b-size">XS</span>');
    else if (e.isXLComfort) b.push('<span class="badge b-size">XL</span>');
    if (e.hasSecondCharge) b.push('<span class="badge b-2nd">⚡</span>');
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
