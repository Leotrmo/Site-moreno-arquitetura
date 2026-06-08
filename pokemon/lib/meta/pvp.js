// pokemon/lib/meta/pvp.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokePvp = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var CP_CAPS    = { great: 1500, ultra: 2500, master: Infinity };
  var LEVEL_CAP  = 50;
  var THRESHOLDS = {
    great:  { spPct: 0.99, ivRank: 50 },
    ultra:  { spPct: 0.99, ivRank: 50 },
    master: { ivPct: 98 },
  };

  // CP = max(10, floor( (atk) * sqrt(def) * sqrt(sta) * cpm² / 10 ))
  function cpFor(base, ivs, cpm) {
    var a = base.atk + ivs.atk;
    var d = base.def + ivs.def;
    var s = base.hp  + ivs.sta;
    var cp = Math.floor(a * Math.sqrt(d) * Math.sqrt(s) * cpm * cpm / 10);
    return cp < 10 ? 10 : cp;
  }

  // Stat product no nível: HP é truncado (igual ao jogo); Atk/Def ficam contínuos.
  function statProductFor(base, ivs, cpm) {
    var atk = (base.atk + ivs.atk) * cpm;
    var def = (base.def + ivs.def) * cpm;
    var hp  = Math.floor((base.hp + ivs.sta) * cpm);
    return atk * def * hp;
  }

  // Maior entrada {level,cpm} cujo CP <= cap. Lista assumida ascendente por cpm.
  // master (cap Infinity) → última entrada. Se nem a primeira cabe, retorna a primeira.
  function bestLevelUnderCap(base, ivs, cpmList, cap) {
    if (cap === Infinity) return cpmList[cpmList.length - 1];
    var best = cpmList[0];
    for (var i = 0; i < cpmList.length; i++) {
      if (cpFor(base, ivs, cpmList[i].cpm) <= cap) best = cpmList[i];
      else break;                       // CP cresce com o nível → pode parar no 1º que estoura
    }
    return best;
  }

  var _distCache = {};   // cacheKey → { sps:[...4096 desc], maxSp }

  // Distribuição (ordenada desc) dos stat products dos 4096 IVs, no melhor nível sob o cap.
  function _distribution(baseStats, cap, cpmList, cacheKey) {
    if (cacheKey && _distCache[cacheKey]) return _distCache[cacheKey];
    var sps = [];
    for (var a = 0; a <= 15; a++)
      for (var d = 0; d <= 15; d++)
        for (var s = 0; s <= 15; s++) {
          var ivs = { atk: a, def: d, sta: s };
          var lvl = bestLevelUnderCap(baseStats, ivs, cpmList, cap);
          sps.push(statProductFor(baseStats, ivs, lvl.cpm));
        }
    sps.sort(function (x, y) { return y - x; });   // desc
    var res = { sps: sps, maxSp: sps[0] };
    if (cacheKey) _distCache[cacheKey] = res;
    return res;
  }

  // rank = 1 + (nº de IVs com stat product ESTRITAMENTE maior). Empates compartilham rank.
  function _countStrictlyGreater(spsDesc, mySp) {
    var n = 0;
    for (var i = 0; i < spsDesc.length; i++) { if (spsDesc[i] > mySp) n++; else break; }
    return n;
  }

  function rankInfo(args) {
    var baseStats = args.baseStats, ivs = args.ivs, cap = args.cap,
        cpmList = args.cpmList, cacheKey = args.cacheKey;
    var dist = _distribution(baseStats, cap, cpmList, cacheKey);
    var lvl = bestLevelUnderCap(baseStats, ivs, cpmList, cap);
    var mySp = statProductFor(baseStats, ivs, lvl.cpm);
    return {
      ivRank: _countStrictlyGreater(dist.sps, mySp) + 1,
      spPct: mySp / dist.maxSp,
      sp: mySp,
      level: lvl.level,
      cp: cpFor(baseStats, ivs, lvl.cpm),
    };
  }

  return { CP_CAPS, LEVEL_CAP, THRESHOLDS, cpFor, statProductFor, bestLevelUnderCap, rankInfo };
});
