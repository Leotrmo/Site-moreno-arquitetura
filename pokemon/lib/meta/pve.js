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

  return { PVE, RAID_TOP, PVE_TOP, GYM_ATK_TOP, GYM_ATK_COVERAGE_MIN, GYM_DEF_TOP, GYM_DEF_IV_MIN,
           effAtk, effDef, effHp, dmgPerHit };
});
