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

  // CP = max(10, floor( (atk+iv) * sqrt(def+iv) * sqrt(sta+iv) * cpm² / 10 ))
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

  // moveset recomendado = [rápido, carregado1, (carregado2?)]. "ok" = tem o rápido E >=1 carregado.
  function movesetOk(myMoveIds, recommended) {
    if (!recommended || recommended.length < 2) return false;
    var mine = myMoveIds || [];
    var fast = recommended[0];
    var charged = recommended.slice(1);
    if (mine.indexOf(fast) < 0) return false;
    return charged.some(function (c) { return mine.indexOf(c) >= 0; });
  }

  var LEAGUES = ['great', 'ultra', 'master'];

  // Avalia o mon nas 3 ligas. Retorna null se faltar speciesId, baseStats, pvpRanks ou cpm.
  function evalMon(e, meta) {
    if (!e || !e.speciesId || !meta || !meta.cpm || !meta.pvpRanks) return null;
    var byId = meta.speciesIndex && meta.speciesIndex.byId;
    var sp = byId && byId[e.speciesId];
    if (!sp || !sp.baseStats) return null;
    var ranks = meta.pvpRanks[e.speciesId] || {};
    var out = {};
    LEAGUES.forEach(function (lg) {
      var rankEntry = ranks[lg] || null;     // null = espécie fora do Top N daquela liga
      if (!rankEntry) {
        // Fora do meta: não calcula a distribuição dos 4096 (ivRank/spPct nunca são usados aqui).
        out[lg] = { isMeta: false, speciesRank: null, ivRank: null, spPct: null, movesetOk: false, moveset: null };
        return;
      }
      var info = rankInfo({
        baseStats: sp.baseStats, ivs: e.ivs, cap: CP_CAPS[lg],
        cpmList: meta.cpm, cacheKey: e.speciesId + '|' + lg,
      });
      out[lg] = {
        isMeta: true,
        speciesRank: rankEntry.rank,
        ivRank: info.ivRank,
        spPct: info.spPct,
        movesetOk: movesetOk(e.moveIds, rankEntry.moveset),
        moveset: rankEntry.moveset || null,
      };
    });
    return out;
  }

  // Tags pvp_* a partir do objeto pvp + IV% simples (master usa ivPct).
  function pvpTags(pvp, ivPct) {
    if (!pvp) return [];
    var tags = [];
    ['great', 'ultra'].forEach(function (lg) {
      var L = pvp[lg];
      if (L && L.isMeta && (L.spPct >= THRESHOLDS[lg].spPct || L.ivRank <= THRESHOLDS[lg].ivRank))
        tags.push('pvp_' + lg);
    });
    var m = pvp.master;
    if (m && m.isMeta && ivPct >= THRESHOLDS.master.ivPct) tags.push('pvp_master');
    return tags;
  }

  return { CP_CAPS, LEVEL_CAP, THRESHOLDS, LEAGUES, cpFor, statProductFor, bestLevelUnderCap, rankInfo, movesetOk, evalMon, pvpTags };
});
