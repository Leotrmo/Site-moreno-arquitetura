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

  var TYPE_PT = ((typeof require === 'function')
    ? require('./refdata.js') : (typeof globalThis !== 'undefined' ? globalThis : {})).TYPE_PT || {};

  // Fase 5: acesso a categorize (Node: require; browser: global de analysis.js, carregado antes).
  var Analysis = ((typeof require === 'function')
    ? require('./analysis.js') : (typeof globalThis !== 'undefined' ? globalThis : {}));

  const CATEGORY_ICON = {
    invest_both: '💪', invest_pve: '💪', invest_pvp: '💪', invest: '💪',
    trophy: '🏆', keep: '🛡️', transfer: '❌', feed: '🍬',
  };
  const CATEGORY_CLASS = {
    invest_both: 'cat-invest', invest_pve: 'cat-invest', invest_pvp: 'cat-invest', invest: 'cat-invest',
    trophy: 'cat-trophy', keep: 'cat-keep', transfer: 'cat-transfer', feed: 'cat-feed',
  };

  // Score do eixo da lente p/ exibir ao lado da categoria (null = não exibe número).
  function _lensAxisScore(e, lens) {
    const s = e.scores;
    if (!s) return null;
    if (lens === 'pvp') return Math.max(s.pvp.great || 0, s.pvp.ultra || 0, s.pvp.master || 0);
    if (lens === 'colecao') return s.colecao || 0;
    if (lens === 'xp') return null;
    return (s.best && typeof s.best.value === 'number') ? s.best.value : null; // eficiencia
  }
  function _fmtScore(n) { return (n < 10) ? n.toFixed(1) : String(Math.round(n)); }

  // Linha de categoria por card; só mostra número p/ categorias positivas (invest/trophy).
  function categoryLineHtml(e, lens) {
    const cat = Analysis.categorize ? Analysis.categorize(e, lens) : null;
    if (!cat) return '';
    const positive = cat.key.indexOf('invest') === 0 || cat.key === 'trophy';
    const sc = positive ? _lensAxisScore(e, lens) : null;
    const scTxt = (sc != null) ? ' · ' + _fmtScore(sc) : '';
    return '<div class="pk-category ' + (CATEGORY_CLASS[cat.key] || 'cat-keep') + '">' +
           (CATEGORY_ICON[cat.key] || '') + ' ' + esc(cat.label) + scTxt + '</div>';
  }

  // Quebra de scores no detalhe (power-user). '' quando não há e.scores.
  function scoresHtml(e) {
    if (!e.scores) return '';
    const s = e.scores, r = Math.round;
    return '<div class="pk-scores"><strong>Scores</strong> — ⚔️ G ' + r(s.pvp.great) +
           ' · U ' + r(s.pvp.ultra) + ' · M ' + r(s.pvp.master) +
           ' · 🔥 PvE ' + r(s.pve) + ' · ✨ Col ' + r(s.colecao) + '</div>';
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
    if (e.tradeBoost) b.push('<span class="badge b-tradeiv">🔁 IV</span>');
    if (e.tags.includes('pvp_great'))  b.push('<span class="badge b-pvp">⚔️G</span>');
    if (e.tags.includes('pvp_ultra'))  b.push('<span class="badge b-pvp">⚔️U</span>');
    if (e.tags.includes('pvp_master')) b.push('<span class="badge b-pvp">⚔️M</span>');
    if (e.tags.includes('raid'))    b.push('<span class="badge b-pve">🔥</span>');
    else if (e.tags.includes('pve')) b.push('<span class="badge b-pve">🔥</span>');
    if (e.tags.includes('gym_def')) b.push('<span class="badge b-gymdef">🛡️</span>');
    if (e.tags.includes('rocket')) b.push('<span class="badge b-rocket">🚀</span>');
    return b.join('');
  }

  const VERDICT_CLASS = { INVESTIR:'invest', MANTER:'keep', TRANSFERIR:'transfer' };
  const VERDICT_LABEL = { INVESTIR:'💪 INVESTIR', MANTER:'🛡️ MANTER', TRANSFERIR:'❌ TRANSFERIR' };
  const ACTION_ICON = { FORTALECER:'⚔️', ENSINAR_TM:'⚔️', EVOLUIR:'⬆️', AGUARDAR_ROCKET:'🚀', AGUARDAR_EVENTO:'🗓️', TROCAR:'🔁' };

  function ivClass(iv) {
    if (iv === 100) return 'iv-perfect';
    if (iv >= 96) return 'iv-great';
    if (iv >= 80) return 'iv-good';
    return 'iv-low';
  }

  function cardHtml(e, lens) {
    lens = lens || 'eficiencia';
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
        categoryLineHtml(e, lens) +
        '<div class="reason">' + esc(e.reason) + '</div>' +
        (e.action ? '<div class="pk-action">' + (ACTION_ICON[e.action.kind] || '⚔️') + ' ' + esc(e.action.reason) + '</div>' : '') +
        (e.tradeBoost ? '<div class="trade-tip">🔁 ' + esc(e.tradeBoost.reason) + '</div>' : '') +
        (e.movesetTip ? '<div class="moveset-tip">💥 ' + esc(e.movesetTip.reason) + '</div>' : '') +
      '</div>'
    );
  }

  const LEAGUE_LABEL = { great: 'Liga Grande', ultra: 'Liga Ultra', master: 'Liga Mestre' };

  // "⚡ Bolha ✓ · 💥 Jogo Duro (falta)" a partir do movesetView ([{name,has,kind}]).
  function movesetLabel(view) {
    return view.map(function (m) {
      const icon = m.kind === 'fast' ? '⚡' : '💥';
      return icon + ' ' + esc(m.name) + (m.has ? ' ✓' : ' (falta)');
    }).join(' · ');
  }

  function competitiveHtml(e) {
    if (!e.pvpMeta && !e.pveMeta) return '';
    const rows = [];
    if (e.pvpMeta) {
      ['great', 'ultra', 'master'].forEach(function (lg) {
        const L = e.pvpMeta[lg];
        if (!L || !L.isMeta) return;
        const sp = Math.round(L.spPct * 100);
        const mv = L.movesetView
          ? 'recomendado: ' + movesetLabel(L.movesetView)
          : (L.movesetOk ? 'moveset recomendado ✓' : 'falta o moveset recomendado');
        rows.push('<div class="comp-row"><strong>' + LEAGUE_LABEL[lg] + '</strong> — rank ' +
                  L.speciesRank + ' da espécie · seu IV PvP ' + sp + '% (rank ' + L.ivRank +
                  '/4096) · ' + mv + '</div>');
      });
    }
    if (e.pveMeta) {
      const pm = e.pveMeta;
      const t = pm.bestType;
      const bt = (t && pm.byType && pm.byType[t]) || null;
      const papeis = [];
      if (pm.raid) papeis.push('Raid');
      if (pm.pve) papeis.push('PvE');
      if (pm.gymAtk) papeis.push('Atq. Ginásio');
      if (pm.gymDef) papeis.push('Def. Ginásio');
      if (papeis.length) {
        const tipoPt = TYPE_PT[t] || t || '';
        const rankTxt = bt ? (' — melhor como ' + tipoPt + ' (rank ' + bt.erRank + ' do tipo, DPS rank ' + bt.dpsRank + ')') : '';
        const mv = pm.movesetView
          ? ' · recomendado: ' + movesetLabel(pm.movesetView)
          : (pm.movesetOk ? ' · moveset de ataque ✓' : (pm.bestMoveset ? ' · falta moveset de ataque' : ''));
        rows.push('<div class="comp-row"><strong>PvE</strong>: ' + papeis.join(' · ') + rankTxt + mv +
                  ' <span class="comp-est">(estimativa)</span></div>');
      }
    }
    if (!rows.length) return '';
    return '<div class="pk-competitive"><h4>Competitivo</h4>' + rows.join('') + '</div>';
  }

  function detailHtml(e) {
    const moves = e.moves.map(esc).join(' · ');
    const pvp = e.pvp ? (e.pvp.pvp_won + '/' + e.pvp.pvp_total + ' vitórias') : '—';
    const compare = (e.verdict === 'TRANSFERIR' && e.betterCopy) ? compareHtml(e, e.betterCopy) : '';
    const competitive = competitiveHtml(e);
    const scores = scoresHtml(e);
    return (
      '<div class="pk-detail">' +
        '<div>IVs: <strong>' + e.ivs.atk + '/' + e.ivs.def + '/' + e.ivs.sta + '</strong></div>' +
        '<div>Golpes: ' + (moves || '—') + '</div>' +
        '<div>Altura: ' + e.height.toFixed(2) + ' m · Peso: ' + e.weight.toFixed(1) + ' kg</div>' +
        '<div>Batalhas: ' + pvp + '</div>' +
        scores +
        competitive +
        compare +
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
