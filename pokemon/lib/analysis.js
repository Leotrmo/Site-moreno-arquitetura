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
    // No JSON, a mesma espécie às vezes vem com mon_form "X_NORMAL" e às vezes
    // sem mon_form. Ambos são a forma base e devem agrupar juntos; só formas
    // especiais (regionais/Hisui/etc.) ganham chave própria.
    const f = mon.mon_form;
    if (!f || /_NORMAL$/.test(f)) return mon.mon_number + '_BASE';
    return mon.mon_number + '_' + f;
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

  return { ivPct, speciesKey, enrichOne, enrichCollection, isProtected, computeVerdict, computeTags, analyze, computeCounts };
});
