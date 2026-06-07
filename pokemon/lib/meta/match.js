// pokemon/lib/meta/match.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokeMatch = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function normalizeName(s) {
    return String(s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acentos
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')                       // pontuação → espaço
      .trim().replace(/\s+/g, ' ');
  }

  // sufixos de forma (mon_form do export → sufixo do speciesId no PvPoke)
  var REGION_SUFFIX = {
    ALOLA: 'alolan', GALAR: 'galarian', HISUI: 'hisuian', PALDEA: 'paldean',
  };
  function _regionSuffixOf(speciesId) {
    var parts = speciesId.split('_');
    var last = parts[parts.length - 1];
    return ['alolan', 'galarian', 'hisuian', 'paldean'].indexOf(last) >= 0 ? last : null;
  }

  function buildSpeciesIndex(speciesJson) {
    var byDex = {}; // dex → [speciesId,...]
    Object.keys(speciesJson).forEach(function (id) {
      var dex = speciesJson[id].dex;
      (byDex[dex] = byDex[dex] || []).push(id);
    });
    return { byDex: byDex, byId: speciesJson };
  }

  function matchSpecies(mon, index) {
    var ids = index.byDex[mon.mon_number];
    if (!ids || !ids.length) return null;
    var form = mon.mon_form || '';
    var wantRegion = null;
    for (var k in REGION_SUFFIX) if (form.indexOf('_' + k) >= 0) wantRegion = REGION_SUFFIX[k];
    if (wantRegion) {
      var hit = ids.filter(function (id) { return _regionSuffixOf(id) === wantRegion; });
      if (hit.length) return hit[0];
    }
    // base: speciesId sem sufixo de região
    var base = ids.filter(function (id) { return !_regionSuffixOf(id); });
    return (base[0] || ids[0]);
  }

  return { normalizeName, buildSpeciesIndex, matchSpecies };
});
