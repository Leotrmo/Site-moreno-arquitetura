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

  function cmpRow(label, vThis, vBest, winner) {
    // winner: 'this' | 'best' | null (neutro). null para linhas que nunca marcam (PC, ataques, badges).
    const cThis = winner === 'this' ? 'val win' : (winner === 'best' ? 'val lose' : 'val');
    const cBest = winner === 'best' ? 'val win' : (winner === 'this' ? 'val lose' : 'val');
    return (
      '<div class="row-wrap">' +
        '<div class="row">' +
          '<span class="lbl">' + esc(label) + '</span>' +
          '<span class="' + cThis + '">' + vThis + '</span>' +
          '<span class="vs">vs</span>' +
          '<span class="' + cBest + '">' + vBest + '</span>' +
        '</div>' +
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
      '<div class="row-wrap">' +
        '<div class="row">' +
          '<span class="lbl">Ataques</span>' +
          '<span class="val moves">' + movesThis + '</span>' +
          '<span class="vs">vs</span>' +
          '<span class="val moves">' + movesBest + '</span>' +
        '</div>' +
      '</div>'
    );
    rows.push(cmpRow('Badges', badgeListPlain(thisOne), badgeListPlain(best), null));
    return (
      '<div class="pk-compare">\n' +
        '<h4>Este vs o melhor da espécie</h4>\n' +
        '<div class="row-wrap"><div class="row header"><span class="lbl"></span><span class="val">Este</span><span class="vs"></span><span class="val">Melhor</span></div></div>\n' +
        rows.join('\n') + '\n' +
      '</div>'
    );
  }

  return { esc, badgesHtml, cardHtml, detailHtml, ivClass, compareHtml };
});
