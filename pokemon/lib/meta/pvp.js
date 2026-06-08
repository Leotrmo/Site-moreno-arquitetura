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

  return { CP_CAPS, LEVEL_CAP, THRESHOLDS, cpFor, statProductFor, bestLevelUnderCap };
});
