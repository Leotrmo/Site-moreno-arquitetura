// pokemon/lib/meta/cost.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokeCost = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // PokePvp: reusa cpFor / bestLevelUnderCap / CP_CAPS / LEVEL_CAP (matemática de CP/nível).
  var PokePvp = (typeof require === 'function')
    ? require('./pvp.js')
    : (typeof globalThis !== 'undefined' ? globalThis.PokePvp : null);

  // Custo por meio-nível (cada power-up = +0.5), pela banda do nível DE ORIGEM (maxFrom inclusive):
  // poeira/doce até L40; poeira/Doce XL de L40 a L50. Fonte: GAME_MASTER, corroborado por
  // Bulbapedia + calculadora pública pogo-powerup. Totais validados nos testes.
  var STEP_BANDS = [
    { maxFrom: 2.5,  dust: 200,   candy: 1,  xl: 0 },
    { maxFrom: 4.5,  dust: 400,   candy: 1,  xl: 0 },
    { maxFrom: 6.5,  dust: 600,   candy: 1,  xl: 0 },
    { maxFrom: 8.5,  dust: 800,   candy: 1,  xl: 0 },
    { maxFrom: 10.5, dust: 1000,  candy: 1,  xl: 0 },
    { maxFrom: 12.5, dust: 1300,  candy: 2,  xl: 0 },
    { maxFrom: 14.5, dust: 1600,  candy: 2,  xl: 0 },
    { maxFrom: 16.5, dust: 1900,  candy: 2,  xl: 0 },
    { maxFrom: 18.5, dust: 2200,  candy: 2,  xl: 0 },
    { maxFrom: 20.5, dust: 2500,  candy: 2,  xl: 0 },
    { maxFrom: 22.5, dust: 3000,  candy: 3,  xl: 0 },
    { maxFrom: 24.5, dust: 3500,  candy: 3,  xl: 0 },
    { maxFrom: 25.5, dust: 4000,  candy: 3,  xl: 0 },
    { maxFrom: 26.5, dust: 4000,  candy: 4,  xl: 0 },
    { maxFrom: 28.5, dust: 4500,  candy: 4,  xl: 0 },
    { maxFrom: 30.5, dust: 5000,  candy: 4,  xl: 0 },
    { maxFrom: 32.5, dust: 6000,  candy: 6,  xl: 0 },
    { maxFrom: 34.5, dust: 7000,  candy: 8,  xl: 0 },
    { maxFrom: 36.5, dust: 8000,  candy: 10, xl: 0 },
    { maxFrom: 38.5, dust: 9000,  candy: 12, xl: 0 },
    { maxFrom: 39.5, dust: 10000, candy: 15, xl: 0 },
    { maxFrom: 40.5, dust: 10000, candy: 0,  xl: 10 },
    { maxFrom: 41.5, dust: 11000, candy: 0,  xl: 10 },
    { maxFrom: 42.5, dust: 11000, candy: 0,  xl: 12 },
    { maxFrom: 43.5, dust: 12000, candy: 0,  xl: 12 },
    { maxFrom: 44.5, dust: 12000, candy: 0,  xl: 15 },
    { maxFrom: 45.5, dust: 13000, candy: 0,  xl: 15 },
    { maxFrom: 46.5, dust: 13000, candy: 0,  xl: 17 },
    { maxFrom: 47.5, dust: 14000, candy: 0,  xl: 17 },
    { maxFrom: 48.5, dust: 14000, candy: 0,  xl: 20 },
    { maxFrom: 49.5, dust: 15000, candy: 0,  xl: 20 },
  ];

  var SHADOW_MULT = 1.2;        // Sombrio: +20% poeira e doce, por power-up, arredondado p/ cima.
  var PVE_TARGET_LEVEL = 40;    // teto de investimento PvE (raid/gym_atk).

  function _stepBand(fromLevel) {
    for (var i = 0; i < STEP_BANDS.length; i++)
      if (fromLevel <= STEP_BANDS[i].maxFrom + 1e-9) return STEP_BANDS[i];
    return null;                // fromLevel > 49.5 → sem passo (já no teto).
  }

  // Custo p/ subir de fromLevel a toLevel (meios-níveis). from>=to → tudo 0.
  // Sombrio: ×1.2 por power-up, Math.ceil (igual ao jogo).
  function powerUpCost(fromLevel, toLevel, isShadow) {
    var dust = 0, candy = 0, xl = 0;
    for (var L = fromLevel; L < toLevel - 1e-9; L += 0.5) {
      var b = _stepBand(L);
      if (!b) break;
      if (isShadow) {
        dust  += Math.ceil(b.dust  * SHADOW_MULT);
        candy += Math.ceil(b.candy * SHADOW_MULT);
        xl    += Math.ceil(b.xl    * SHADOW_MULT);
      } else { dust += b.dust; candy += b.candy; xl += b.xl; }
    }
    return { dust: dust, candy: candy, xlCandy: xl };
  }

  // Nível atual derivado do CP (o export não traz nível): nível cujo cpFor mais se aproxima do CP.
  function levelForCp(baseStats, ivs, cp, cpmList) {
    if (!baseStats || !ivs || typeof cp !== 'number' || !cpmList || !cpmList.length || !PokePvp) return null;
    var best = null, bestDiff = Infinity;
    for (var i = 0; i < cpmList.length; i++) {
      var diff = Math.abs(PokePvp.cpFor(baseStats, ivs, cpmList[i].cpm) - cp);
      if (diff < bestDiff) { bestDiff = diff; best = cpmList[i].level; }
    }
    return best;
  }

  // Conta golpes faltantes do moveset-alvo em {normal, elite} (elite = está em eliteMoves).
  function tmCost(missingMoveIds, eliteMoves) {
    var normal = 0, elite = 0, el = eliteMoves || [];
    (missingMoveIds || []).forEach(function (id) {
      if (el.indexOf(id) >= 0) elite++; else normal++;
    });
    return { normal: normal, elite: elite };
  }

  function _kDust(d) {
    if (d >= 10000) return Math.round(d / 1000) + 'k';
    if (d >= 1000)  return (Math.round(d / 100) / 10) + 'k';
    return String(d);
  }
  function _tmTxt(tm) {
    var n = tm.normal + tm.elite;
    return n + ' TM' + (tm.elite > 0 ? ' (' + tm.elite + ' Elite)' : '');
  }

  // String enxuta; omite componentes zero; '' quando tudo zero ou est null.
  function format(est) {
    if (!est) return '';
    var parts = [];
    if (est.dust > 0)    parts.push('~' + _kDust(est.dust) + ' poeira');
    if (est.candy > 0)   parts.push(est.candy + (est.candy === 1 ? ' doce' : ' doces'));
    if (est.xlCandy > 0) parts.push(est.xlCandy + ' Doce XL');
    if (est.tm && (est.tm.normal + est.tm.elite) > 0) parts.push(_tmTxt(est.tm));
    return parts.join(' · ');
  }

  // Nível-alvo por contexto. pvp great/ultra → nível que estoura o CP cap; master → L50; pve → L40.
  function _targetLevel(context, baseStats, ivs, cpmList) {
    if (!context || !PokePvp) return null;
    if (context.kind === 'pve') return PVE_TARGET_LEVEL;
    if (context.kind === 'pvp') {
      if (context.league === 'master') return PokePvp.LEVEL_CAP;
      var cap = PokePvp.CP_CAPS[context.league];
      if (cap == null) return null;
      return PokePvp.bestLevelUnderCap(baseStats, ivs, cpmList, cap).level;
    }
    return null;
  }

  // Estimativa completa, ou null (faltou baseStats/ivs/cp/cpm/contexto → degradação graciosa).
  function estimate(input) {
    if (!input || !input.baseStats || !input.ivs || typeof input.cp !== 'number' || !input.cpm) return null;
    var from = levelForCp(input.baseStats, input.ivs, input.cp, input.cpm);
    if (from == null) return null;
    var to = _targetLevel(input.context, input.baseStats, input.ivs, input.cpm);
    if (to == null) return null;
    var pu = powerUpCost(from, to, !!input.isShadow);
    return {
      fromLevel: from, toLevel: to,
      dust: pu.dust, candy: pu.candy, xlCandy: pu.xlCandy,
      tm: tmCost(input.missingMoves || [], input.eliteMoves || []),
      shadow: !!input.isShadow,
    };
  }

  return { STEP_BANDS, SHADOW_MULT, PVE_TARGET_LEVEL, powerUpCost, levelForCp, tmCost, estimate, format };
});
