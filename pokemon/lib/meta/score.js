// pokemon/lib/meta/score.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokeScore = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // PokeCost: reusa estimate (custo de investimento — Fase 3).
  var PokeCost = (typeof require === 'function')
    ? require('./cost.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokeCost : null);

  // Constantes de calibração (ajustáveis; os testes checam ordem relativa, não absolutos).
  var TAU_PVP = 20;        // decaimento do speciesRank PvP
  var TAU_PVE = 12;        // decaimento do erRank PvE
  var MOVESET_MISS = 0.5;  // prontidão quando falta o moveset-alvo
  var CANDY_W = 250, XL_W = 1000, TM_W = 2000, ELITE_W = 10000;  // poeira-equivalente
  var COST_NORM = 50000;   // normalização do custo-escalar

  // Pesos de colecionismo (OR probabilístico). Maior = mais raro/valioso.
  var COLECAO_W = {
    isHundo: 0.90, isShiny: 0.85, isNearPerfect: 0.60, isLegendary: 0.60,
    isCostume: 0.55, isExtremeSize: 0.50, isRegional: 0.50, isLucky: 0.40,
    isShadow: 0.30, isXSComfort: 0.25, isXLComfort: 0.25, isTradeEvo: 0.20,
    hasSecondCharge: 0.10,
  };

  function _clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  // META: decaimento exponencial de um rank (1 = melhor). Rank inválido/null → 0.
  function rankDecay(rank, tau) {
    if (typeof rank !== 'number' || !(rank >= 1)) return 0;
    return Math.exp(-(rank - 1) / tau);
  }

  // QUALIDADE PvE ponderada em ataque: (atkBase + atkIv) / (atkBase + 15). Base domina
  // → hundo ≈ 15/x/x (a "ironia": o 100% é quase desperdiçado no único modo onde a espécie é útil).
  function qualityPve(atkBase, atkIv) {
    if (typeof atkBase !== 'number' || atkBase <= 0) return 0;
    var iv = (typeof atkIv === 'number') ? atkIv : 0;
    return _clamp01((atkBase + iv) / (atkBase + 15));
  }

  // CUSTO-ESCALAR (≥1): poeira-equivalente do est do PokeCost. null/zero → 1 (sem penalidade).
  function costScalar(est) {
    if (!est) return 1;
    var tm = est.tm || { normal: 0, elite: 0 };
    var dustEq = (est.dust || 0)
               + (est.candy || 0)   * CANDY_W
               + (est.xlCandy || 0) * XL_W
               + (tm.normal || 0)   * TM_W
               + (tm.elite || 0)    * ELITE_W;
    return 1 + dustEq / COST_NORM;
  }

  // PRONTIDÃO (0,1]: fatorMoveset × fatorNível. est (do PokeCost) dá from/to nível.
  function readiness(movesetOk, est) {
    var fMove = movesetOk ? 1 : MOVESET_MISS;
    var fLvl = 1;
    if (est && typeof est.fromLevel === 'number' && typeof est.toLevel === 'number' && est.toLevel > 0)
      fLvl = _clamp01(est.fromLevel / est.toLevel);
    return fMove * fLvl;
  }

  // scoreColecao: OR probabilístico das flags ativas → [0,1], empilha com retorno decrescente.
  function scoreColecao(e) {
    if (!e) return 0;
    var keep = 1;
    for (var k in COLECAO_W) {
      if (k === 'isNearPerfect' && e.isHundo) continue;   // não dobra a "perfeição"
      if (e[k]) keep *= (1 - COLECAO_W[k]);
    }
    return 1 - keep;
  }

  // --- golpes faltantes p/ o custo de TM (espelha analysis.js; mantém score.js puro) ---
  function _missingPvp(moveIds, rec) {
    if (!rec || rec.length < 2) return [];
    var mine = moveIds || [], out = [];
    if (mine.indexOf(rec[0]) < 0) out.push(rec[0]);          // falta o rápido
    var charged = rec.slice(1);
    if (!charged.some(function (c) { return mine.indexOf(c) >= 0; }))
      out.push.apply(out, charged);                          // não tem nenhum carregado
    return out;
  }
  function _missingPve(moveIds, rec) {
    if (!rec || rec.length < 2) return [];
    var mine = moveIds || [];
    return rec.filter(function (id) { return mine.indexOf(id) < 0; });   // PvE exige os dois
  }

  function _baseStats(e, meta) {
    var byId = meta && meta.speciesIndex && meta.speciesIndex.byId;
    var sp = byId && e && byId[e.speciesId];
    return (sp && sp.baseStats) || null;
  }

  // Uma estimativa de custo p/ o objetivo (context) — ou null (degradação graciosa).
  function _estimate(e, meta, context, missing) {
    if (!PokeCost || !meta || !meta.cpm || !e) return null;
    var bs = _baseStats(e, meta);
    if (!bs || !e.ivs || typeof e.cp !== 'number') return null;
    return PokeCost.estimate({
      baseStats: bs, ivs: e.ivs, cp: e.cp, isShadow: !!e.isShadow,
      context: context, missingMoves: missing || [], eliteMoves: e.eliteMoves || [], cpm: meta.cpm,
    });
  }

  // score PvP de uma liga: META(rank decaído) × QUALIDADE(spPct) × PRONTIDÃO ÷ CUSTO. ×100.
  function scorePvpLeague(e, meta, league) {
    var L = e && e.pvpMeta && e.pvpMeta[league];
    if (!L || !L.isMeta || typeof L.speciesRank !== 'number') return 0;
    var metaF = rankDecay(L.speciesRank, TAU_PVP);
    var qual = (typeof L.spPct === 'number') ? _clamp01(L.spPct) : 0;
    var missing = _missingPvp(e.moveIds, L.moveset);
    var est = _estimate(e, meta, { kind: 'pvp', league: league }, missing);
    var ready = readiness(L.movesetOk, est);
    return metaF * qual * ready / costScalar(est) * 100;
  }

  // score PvE: META(erRank decaído) × QUALIDADE(ataque) × PRONTIDÃO ÷ CUSTO. ×100.
  function scorePve(e, meta) {
    var P = e && e.pveMeta;
    if (!P) return 0;
    if (!(P.raid || P.pve || P.gymAtk)) return 0;            // gym_def (defensivo) não pontua aqui
    var bt = (P.bestType && P.byType) ? P.byType[P.bestType] : null;
    var erRank = (bt && typeof bt.erRank === 'number') ? bt.erRank : null;
    if (erRank == null) return 0;
    var metaF = rankDecay(erRank, TAU_PVE);
    var bs = _baseStats(e, meta);
    var qual = qualityPve(bs ? bs.atk : null, (e.ivs && typeof e.ivs.atk === 'number') ? e.ivs.atk : 0);
    var missing = _missingPve(e.moveIds, P.bestMoveset);
    var est = _estimate(e, meta, { kind: 'pve' }, missing);
    var ready = readiness(P.movesetOk, est);
    return metaF * qual * ready / costScalar(est) * 100;
  }

  var LEAGUES = ['great', 'ultra', 'master'];

  // Agregador: scores por objetivo + melhor objetivo de INVESTIMENTO (colecao fica fora do best).
  function scoreMon(e, meta) {
    if (!e) return null;
    var pvp = {};
    LEAGUES.forEach(function (lg) { pvp[lg] = scorePvpLeague(e, meta, lg); });
    var pve = scorePve(e, meta);
    var colecao = scoreColecao(e) * 100;
    var cands = [
      { objective: 'pvp_great',  value: pvp.great },
      { objective: 'pvp_ultra',  value: pvp.ultra },
      { objective: 'pvp_master', value: pvp.master },
      { objective: 'pve',        value: pve },
    ];
    var best = cands[0];
    for (var i = 1; i < cands.length; i++) if (cands[i].value > best.value) best = cands[i];
    return { pvp: pvp, pve: pve, colecao: colecao,
             best: { objective: best.objective, value: best.value } };
  }

  return {
    TAU_PVP, TAU_PVE, MOVESET_MISS, CANDY_W, XL_W, TM_W, ELITE_W, COST_NORM, COLECAO_W, LEAGUES,
    rankDecay, qualityPve, costScalar, readiness, scoreColecao,
    scorePvpLeague, scorePve, scoreMon,
  };
});
