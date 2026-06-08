// pokemon/lib/meta/pve.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokePve = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  var PVE = { CPM: 0.7903, IV: 15, DEF_REF: 180, STAB: 1.2, INCOMING_K: 800, ER_WEIGHT: 0.7 };
  var RAID_TOP = 10, PVE_TOP = 35, GYM_ATK_TOP = 20, GYM_ATK_COVERAGE_MIN = 3,
      GYM_DEF_TOP = 50, GYM_DEF_IV_MIN = 13;

  function effAtk(base) { return (base.atk + PVE.IV) * PVE.CPM; }
  function effDef(base) { return (base.def + PVE.IV) * PVE.CPM; }
  function effHp(base)  { return (base.hp  + PVE.IV) * PVE.CPM; }

  // Dano de 1 golpe contra um alvo neutro de referência (efetividade = 1).
  function dmgPerHit(power, atk, stab) {
    return Math.floor(0.5 * power * (atk / PVE.DEF_REF) * stab) + 1;
  }

  // DPS do ciclo: n golpes rápidos por carregado (n = custo do carregado / ganho do rápido).
  // fast/charged = objetos de golpe com { type, pve:{power,energy,durationMs} }. types = tipos da espécie (STAB).
  function cycleDps(fast, charged, base, types) {
    if (!fast || !charged || !fast.pve || !charged.pve) return 0;
    if (!(fast.pve.energy > 0)) return 0;                 // sem geração de energia → ciclo indefinido
    var atk = effAtk(base);
    var sF = types.indexOf(fast.type) >= 0 ? PVE.STAB : 1;
    var sC = types.indexOf(charged.type) >= 0 ? PVE.STAB : 1;
    var dF = dmgPerHit(fast.pve.power, atk, sF), tF = fast.pve.durationMs / 1000;
    var dC = dmgPerHit(charged.pve.power, atk, sC), tC = charged.pve.durationMs / 1000;
    var n = charged.pve.energy / fast.pve.energy;
    var cycleTime = n * tF + tC;
    return cycleTime > 0 ? (n * dF + dC) / cycleTime : 0;
  }

  // TDO (Total Damage Output): bulk via Def·HP. K constante → ranking invariante.
  function tdoFor(dps, base) {
    return dps * effHp(base) * effDef(base) / PVE.INCOMING_K;
  }
  // ER: combina DPS e TDO ponderando DPS (ER_WEIGHT).
  function erFor(dps, tdo) {
    if (dps <= 0 || tdo <= 0) return 0;
    return Math.pow(dps, PVE.ER_WEIGHT) * Math.pow(tdo, 1 - PVE.ER_WEIGHT);
  }

  // Um id de golpe é usável em PvE só se existir em movesById COM bloco pve.
  function _hasPve(id, movesById) {
    var m = movesById[id];
    return !!(m && m.pve);
  }

  // Enumera fastMoves × chargedMoves; devolve { best, byType } por ER.
  // moveset guarda os IDS (vindos das chaves); byType é chaveado pelo tipo do carregado.
  function bestMoveset(species, movesById) {
    var base = species.baseStats, types = species.types || [];
    var fastIds = (species.fastMoves || []).filter(function (id) { return _hasPve(id, movesById); });
    var chgIds  = (species.chargedMoves || []).filter(function (id) { return _hasPve(id, movesById); });
    var byType = {}, best = null;
    for (var i = 0; i < fastIds.length; i++) {
      for (var j = 0; j < chgIds.length; j++) {
        var fId = fastIds[i], cId = chgIds[j];
        var F = movesById[fId], C = movesById[cId];
        var dps = cycleDps(F, C, base, types);
        if (!(dps > 0)) continue;
        var tdo = tdoFor(dps, base), er = erFor(dps, tdo);
        var rec = { moveset: [fId, cId], type: C.type, dps: dps, tdo: tdo, er: er };
        if (!byType[C.type] || er > byType[C.type].er) byType[C.type] = rec;
        if (!best || er > best.er) best = rec;
      }
    }
    return { best: best, byType: byType };
  }

  return { PVE, RAID_TOP, PVE_TOP, GYM_ATK_TOP, GYM_ATK_COVERAGE_MIN, GYM_DEF_TOP, GYM_DEF_IV_MIN,
           effAtk, effDef, effHp, dmgPerHit, cycleDps, tdoFor, erFor, bestMoveset };
});
