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

  return { ivPct, speciesKey, enrichOne, enrichCollection };
});
