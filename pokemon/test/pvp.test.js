// pokemon/test/pvp.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { cpFor } = require('../lib/meta/pvp.js');

const { statProductFor } = require('../lib/meta/pvp.js');

test('cpFor: fórmula padrão de CP (piso 10)', () => {
  // base 100/100/100, IV 15/15/15, cpm 0.5:
  // floor(115 * sqrt(115) * sqrt(115) * 0.25 / 10) = floor(115*115*0.25/10) = 330
  assert.strictEqual(cpFor({ atk: 100, def: 100, hp: 100 }, { atk: 15, def: 15, sta: 15 }, 0.5), 330);
  // piso de 10
  assert.strictEqual(cpFor({ atk: 1, def: 1, hp: 1 }, { atk: 0, def: 0, sta: 0 }, 0.094), 10);
});

test('statProductFor: Atk·Def·floor(HP) no nível', () => {
  // base 100/100/100, IV 15/15/15, cpm 0.5:
  // Atk=57.5, Def=57.5, HP=floor(57.5)=57 → 57.5*57.5*57 = 188456.25
  assert.strictEqual(statProductFor({ atk: 100, def: 100, hp: 100 }, { atk: 15, def: 15, sta: 15 }, 0.5), 188456.25);
});

const { bestLevelUnderCap } = require('../lib/meta/pvp.js');

// CPMs sintéticos onde dá pra calcular o CP na mão (base 100/100/100, IV 0/0/0):
// cpm 0.1 → CP 10 ; cpm 0.5 → CP 250 ; cpm 0.9 → CP 810
const tinyCpm = [{ level: 1, cpm: 0.1 }, { level: 2, cpm: 0.5 }, { level: 3, cpm: 0.9 }];
const base100 = { atk: 100, def: 100, hp: 100 };
const iv000 = { atk: 0, def: 0, sta: 0 };

test('bestLevelUnderCap: maior nível com CP <= cap', () => {
  assert.deepStrictEqual(bestLevelUnderCap(base100, iv000, tinyCpm, 300), { level: 2, cpm: 0.5 }); // 810>300, 250<=300
  assert.deepStrictEqual(bestLevelUnderCap(base100, iv000, tinyCpm, 900), { level: 3, cpm: 0.9 }); // todos <=900
});

test('bestLevelUnderCap: cap Infinity (master) → nível mais alto', () => {
  assert.deepStrictEqual(bestLevelUnderCap(base100, iv000, tinyCpm, Infinity), { level: 3, cpm: 0.9 });
});

test('bestLevelUnderCap: nem o menor nível cabe → retorna o menor (piso)', () => {
  assert.deepStrictEqual(bestLevelUnderCap(base100, iv000, tinyCpm, 5), { level: 1, cpm: 0.1 }); // CP10>5
});

const { rankInfo } = require('../lib/meta/pvp.js');
const realCpm = require('../data/cpm.json');          // gerado na Task 3 (níveis 1..50)
const species = require('../data/species.json');       // Fase 0
const azuBase = species.azumarill.baseStats;           // { atk:112, def:152, hp:225 }

test('rankInfo master (sem cap): hundo é rank 1, spPct 1', () => {
  const r = rankInfo({ baseStats: azuBase, ivs: { atk: 15, def: 15, sta: 15 },
                       cap: Infinity, cpmList: realCpm, cacheKey: 'azumarill|master' });
  assert.strictEqual(r.ivRank, 1);
  assert.strictEqual(r.spPct, 1);
});

test('rankInfo Liga Grande (cap 1500): hundo NÃO é o ideal; 0/15/15 lidera', () => {
  // Propriedade real: sob cap, ataque baixo + def/HP altos vencem no stat product.
  const hundo = rankInfo({ baseStats: azuBase, ivs: { atk: 15, def: 15, sta: 15 },
                           cap: 1500, cpmList: realCpm, cacheKey: 'azumarill|great' });
  const lowAtk = rankInfo({ baseStats: azuBase, ivs: { atk: 0, def: 15, sta: 15 },
                            cap: 1500, cpmList: realCpm, cacheKey: 'azumarill|great' });
  assert.strictEqual(lowAtk.ivRank, 1);     // 0/15/15 é o melhor IV de Liga Grande
  assert.strictEqual(lowAtk.spPct, 1);
  assert.ok(hundo.ivRank > 1);              // hundo não lidera Grande
  assert.ok(hundo.spPct < 1);
  assert.ok(hundo.cp <= 1500);              // respeita o cap
});

const { movesetOk } = require('../lib/meta/pvp.js');

test('movesetOk: tem o rápido recomendado + ao menos 1 carregado recomendado', () => {
  const rec = ['COUNTER', 'ICE_PUNCH', 'POWER_UP_PUNCH']; // [rápido, carregado, carregado]
  assert.strictEqual(movesetOk(['COUNTER', 'ICE_PUNCH'], rec), true);          // rápido + 1 carregado
  assert.strictEqual(movesetOk(['COUNTER', 'ICE_PUNCH', 'POWER_UP_PUNCH'], rec), true);
  assert.strictEqual(movesetOk(['COUNTER'], rec), false);                       // falta carregado
  assert.strictEqual(movesetOk(['ICE_PUNCH', 'POWER_UP_PUNCH'], rec), false);   // falta o rápido
  assert.strictEqual(movesetOk([], rec), false);
  assert.strictEqual(movesetOk(['COUNTER', 'ICE_PUNCH'], []), false);           // sem recomendação → false
});

const { evalMon, pvpTags } = require('../lib/meta/pvp.js');
const pvpRanks = require('../data/pvp_ranks.json');     // Fase 0

function metaObj() {
  return {
    speciesIndex: { byId: species },   // species.json é {speciesId: {baseStats,...}}
    pvpRanks: pvpRanks,
    cpm: realCpm,
  };
}

test('evalMon: sem speciesId → null (degrada)', () => {
  assert.strictEqual(evalMon({ speciesId: null, ivs: { atk: 0, def: 0, sta: 0 }, moveIds: [] }, metaObj()), null);
});

test('evalMon: sem cpm/pvpRanks → null', () => {
  const e = { speciesId: 'azumarill', ivs: { atk: 0, def: 15, sta: 15 }, moveIds: [] };
  assert.strictEqual(evalMon(e, { speciesIndex: { byId: species } }), null);
});

test('evalMon: Azumarill 0/15/15 com moveset recomendado → great isMeta, movesetOk', () => {
  const e = { speciesId: 'azumarill', ivs: { atk: 0, def: 15, sta: 15 },
              moveIds: ['BUBBLE', 'ICE_BEAM', 'PLAY_ROUGH'] };  // = moveset recomendado de Great
  const r = evalMon(e, metaObj());
  assert.strictEqual(r.great.isMeta, true);
  assert.strictEqual(r.great.speciesRank, pvpRanks.azumarill.great.rank);
  assert.strictEqual(r.great.movesetOk, true);
  assert.strictEqual(r.great.ivRank, 1);          // 0/15/15 lidera Grande
  assert.strictEqual(r.great.spPct, 1);
  // otimização: ligas fora do meta não calculam rankInfo → ivRank null
  if (r.master.isMeta) assert.strictEqual(typeof r.master.ivRank, 'number');
  else assert.strictEqual(r.master.ivRank, null);
});

test('evalMon: liga fora do meta → ivRank/spPct null (sem calcular distribuição)', () => {
  // magikarp não é meta de nenhuma liga
  const e = { speciesId: 'magikarp', ivs: { atk: 15, def: 15, sta: 15 }, moveIds: [] };
  const r = evalMon(e, metaObj());
  assert.strictEqual(r.great.isMeta, false);
  assert.strictEqual(r.great.ivRank, null);
  assert.strictEqual(r.great.spPct, null);
  assert.strictEqual(r.great.movesetOk, false);
});

test('pvpTags: aplica THRESHOLDS (great por spPct/ivRank; master por ivPct)', () => {
  // pvp sintético
  const pvp = {
    great:  { isMeta: true,  ivRank: 1,   spPct: 1,    movesetOk: true },
    ultra:  { isMeta: true,  ivRank: 999, spPct: 0.90, movesetOk: false }, // não passa limiar
    master: { isMeta: true,  ivRank: 50,  spPct: 0.97, movesetOk: false },
  };
  assert.deepStrictEqual(pvpTags(pvp, 100).sort(), ['pvp_great', 'pvp_master']); // ivPct 100>=98
  assert.deepStrictEqual(pvpTags(pvp, 90).sort(), ['pvp_great']);                // ivPct 90<98 → sem master
  assert.deepStrictEqual(pvpTags(null, 100), []);
});

test('evalMon: expõe o moveset recomendado da liga (great) e null fora do meta', () => {
  const e = { speciesId: 'azumarill', ivs: { atk: 0, def: 15, sta: 15 }, moveIds: ['BUBBLE','ICE_BEAM'] };
  const r = evalMon(e, metaObj());
  assert.ok(Array.isArray(r.great.moveset), 'great.moveset é array (espécie meta na Grande)');
  assert.ok(r.great.moveset.length >= 2);
  // liga em que a espécie não é meta → moveset null
  const offLeague = ['great','ultra','master'].find(lg => !r[lg].isMeta);
  if (offLeague) assert.strictEqual(r[offLeague].moveset, null);
});
