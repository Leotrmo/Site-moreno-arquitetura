// pokemon/test/pve.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { dmgPerHit, effAtk } = require('../lib/meta/pve.js');

test('effAtk: (baseAtk + IV) * CPM(L40)', () => {
  assert.ok(Math.abs(effAtk({ atk: 100, def: 1, hp: 1 }) - (115 * 0.7903)) < 1e-9); // 90.8845
});

test('dmgPerHit: floor(0.5·power·(atk/DEF_REF)·stab) + 1', () => {
  // atk = 90.8845, DEF_REF 180 → atk/DEF_REF = 0.504914
  // sem STAB: floor(0.5·10·0.504914·1)+1 = floor(2.5246)+1 = 3
  assert.strictEqual(dmgPerHit(10, 90.8845, 1), 3);
  // com STAB 1.2: floor(0.5·10·0.504914·1.2)+1 = floor(3.0295)+1 = 4
  assert.strictEqual(dmgPerHit(10, 90.8845, 1.2), 4);
});

const { cycleDps } = require('../lib/meta/pve.js');

test('cycleDps: ciclo fast+charged a L40, com STAB por tipo', () => {
  const base = { atk: 100, def: 100, hp: 100 };  // effAtk = 90.8845
  const fast    = { type: 'fighting', pve: { power: 10, energy: 10, durationMs: 1000 } };
  const charged = { type: 'fighting', pve: { power: 50, energy: 50, durationMs: 2000 } };
  // Df=dmgPerHit(10,90.8845,1.2)=4 ; Dc=dmgPerHit(50,90.8845,1.2)=16
  // n=50/10=5 ; cycleDmg=5·4+16=36 ; cycleTime=5·1.0+2.0=7.0 → DPS=36/7
  const dps = cycleDps(fast, charged, base, ['fighting']);
  assert.ok(Math.abs(dps - (36 / 7)) < 1e-9);
});

test('cycleDps: 0 se o golpe rápido não gera energia (evita divisão por zero)', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  const fast    = { type: 'normal', pve: { power: 5, energy: 0, durationMs: 1000 } };
  const charged = { type: 'normal', pve: { power: 50, energy: 50, durationMs: 2000 } };
  assert.strictEqual(cycleDps(fast, charged, base, ['normal']), 0);
});

const { tdoFor, erFor } = require('../lib/meta/pve.js');

test('tdoFor: dps · HP · Def / INCOMING_K', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  const expected = 10 * (115 * 0.7903) * (115 * 0.7903) / 800;
  assert.ok(Math.abs(tdoFor(10, base) - expected) < 1e-6);
});

test('erFor: dps^0.7 · tdo^0.3 (pondera DPS sobre TDO)', () => {
  assert.ok(Math.abs(erFor(10, 100) - (Math.pow(10, 0.7) * Math.pow(100, 0.3))) < 1e-9);
});

const { bestMoveset } = require('../lib/meta/pve.js');

test('bestMoveset: melhor combo geral + por tipo (tipo = do carregado)', () => {
  const species = {
    baseStats: { atk: 200, def: 100, hp: 100 }, types: ['ice'],
    fastMoves: ['ICE_SHARD'], chargedMoves: ['AVALANCHE','BODY_SLAM'],
  };
  const movesById = {
    ICE_SHARD: { type: 'ice',    kind: 'fast',   pve: { power: 12, energy: 12, durationMs: 1200 } },
    AVALANCHE: { type: 'ice',    kind: 'charge', pve: { power: 90, energy: 45, durationMs: 2700 } },
    BODY_SLAM: { type: 'normal', kind: 'charge', pve: { power: 50, energy: 35, durationMs: 1900 } },
  };
  const r = bestMoveset(species, movesById);
  assert.ok(r.best, 'tem melhor combo');
  assert.strictEqual(r.byType.ice.moveset[0], 'ICE_SHARD');
  assert.strictEqual(r.byType.ice.moveset[1], 'AVALANCHE');
  assert.ok(r.byType.normal, 'tem entrada do tipo normal (Body Slam)');
  assert.ok(r.byType.ice.er > r.byType.normal.er);
  assert.strictEqual(r.best.type, 'ice');
});

test('bestMoveset: sem golpe com dados PvE → null', () => {
  const species = { baseStats: { atk: 100, def: 100, hp: 100 }, types: ['grass'],
                    fastMoves: ['VINE_WHIP'], chargedMoves: ['SLUDGE_BOMB'] };
  assert.strictEqual(bestMoveset(species, {}).best, null);
});

const { defBulk, evalMon, pveTags } = require('../lib/meta/pve.js');

test('defBulk: (baseDef+ivDef)·(baseHP+ivSta)', () => {
  assert.strictEqual(defBulk({ atk: 1, def: 100, hp: 200 }, { atk: 0, def: 15, sta: 15 }), 115 * 215);
});

function metaPve() {
  return {
    speciesIndex: { byId: {
      raider: { baseStats: { atk: 250, def: 120, hp: 150 } },
      wall:   { baseStats: { atk: 60,  def: 250, hp: 450 } },
    } },
    pveRanks: {
      raider: { bestMoveset: ['ICE_SHARD','AVALANCHE'], bestType: 'ice', roles: ['raid','pve','gym_atk'],
                byType: { ice: { dps: 18, er: 50, dpsRank: 2, erRank: 3, moveset: ['ICE_SHARD','AVALANCHE'] } },
                defBulkRank: 300 },
      wall:   { bestMoveset: ['POUND','BODY_SLAM'], bestType: 'normal', roles: [],
                byType: {}, defBulkRank: 2 },
    },
  };
}

test('evalMon: sem speciesId ou sem pveRanks → null', () => {
  assert.strictEqual(evalMon({ speciesId: null, ivs: {}, moveIds: [] }, metaPve()), null);
  assert.strictEqual(evalMon({ speciesId: 'raider', ivs: {}, moveIds: [] }, { speciesIndex: metaPve().speciesIndex }), null);
});

test('evalMon: atacante de raid com moveset recomendado → raid/pve/gymAtk + movesetOk', () => {
  const r = evalMon({ speciesId: 'raider', ivs: { atk: 15, def: 10, sta: 10 },
                      moveIds: ['ICE_SHARD','AVALANCHE'] }, metaPve());
  assert.strictEqual(r.raid, true);
  assert.strictEqual(r.pve, true);
  assert.strictEqual(r.gymAtk, true);
  assert.strictEqual(r.gymDef, false);          // não é candidata a defensor (defBulkRank 300)
  assert.strictEqual(r.movesetOk, true);
  assert.strictEqual(r.bestType, 'ice');
});

test('evalMon: muralha bulk-candidata + IV def/HP altos → gymDef true', () => {
  const hi = evalMon({ speciesId: 'wall', ivs: { atk: 0, def: 15, sta: 14 }, moveIds: [] }, metaPve());
  assert.strictEqual(hi.gymDef, true);          // defBulkRank 2 <= 50 E def 15>=13 E sta 14>=13
  const lo = evalMon({ speciesId: 'wall', ivs: { atk: 0, def: 5, sta: 5 }, moveIds: [] }, metaPve());
  assert.strictEqual(lo.gymDef, false);         // IVs def/HP baixos
});

test('pveTags: deriva raid/pve/gym_atk/gym_def', () => {
  assert.deepStrictEqual(
    pveTags({ raid: true, pve: true, gymAtk: false, gymDef: true }).sort(),
    ['gym_def', 'pve', 'raid']);
  assert.deepStrictEqual(pveTags(null), []);
});
