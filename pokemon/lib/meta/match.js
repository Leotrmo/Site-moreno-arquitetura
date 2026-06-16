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

  function matchMove(ptName, movesPt) {
    if (!ptName) return null;
    var key = normalizeName(ptName);
    return Object.prototype.hasOwnProperty.call(movesPt, key) ? movesPt[key] : null;
  }

  // Nome PT de exibição de um moveId p/ casamento: namePt → override → o próprio id
  // (que normalizeName reduz a "close combat" etc.). Mesma cadeia do _moveName de analysis.js.
  function _displayPt(id, movesById, override) {
    var m = movesById && movesById[id];
    return (m && m.namePt) || (override && override[id]) || id;
  }

  // Casa um nome PT de golpe APENAS dentro dos golpes que a espécie pode ter (allowedIds).
  // Mata colisões de nome PT entre IDs (ex.: "Jato d'Água" → HYDRO_PUMP, nunca a variante
  // HYDRO_PUMP_BLASTOISE, que não está na lista do Gyarados). null se nada casar.
  function matchMoveInSpecies(ptName, allowedIds, movesById, override) {
    if (!ptName || !allowedIds || !allowedIds.length) return null;
    var key = normalizeName(ptName);
    for (var i = 0; i < allowedIds.length; i++) {
      if (normalizeName(_displayPt(allowedIds[i], movesById, override)) === key) return allowedIds[i];
    }
    return null;
  }

  return { normalizeName, buildSpeciesIndex, matchSpecies, matchMove, matchMoveInSpecies };
});
