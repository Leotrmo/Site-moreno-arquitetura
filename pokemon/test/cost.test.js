// pokemon/test/cost.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const Cost = require('../lib/meta/cost.js');

test('powerUpCost: 20→40 não-Sombrio bate o total conhecido', () => {
  assert.deepStrictEqual(Cost.powerUpCost(20, 40, false), { dust: 225000, candy: 248, xlCandy: 0 });
});

test('powerUpCost: 40→50 usa Doce XL e zera doce comum', () => {
  assert.deepStrictEqual(Cost.powerUpCost(40, 50, false), { dust: 250000, candy: 0, xlCandy: 296 });
});

test('powerUpCost: Sombrio encarece (≈ +20% por power-up)', () => {
  const base = Cost.powerUpCost(20, 40, false);
  const sh = Cost.powerUpCost(20, 40, true);
  assert.strictEqual(sh.dust, 270000);        // 225000 * 1.2
  assert.strictEqual(sh.candy, 312);          // 248 doces com ceil(×1.2) por power-up
  assert.ok(sh.candy > base.candy);           // doce também sobe
});

test('powerUpCost: from >= to → tudo zero', () => {
  assert.deepStrictEqual(Cost.powerUpCost(35, 35, false), { dust: 0, candy: 0, xlCandy: 0 });
  assert.deepStrictEqual(Cost.powerUpCost(40, 30, false), { dust: 0, candy: 0, xlCandy: 0 });
});

const PokePvp = require('../lib/meta/pvp.js');
const CPM = require('../data/cpm.json');

test('levelForCp: inverte o CP de volta ao nível (auto-consistente)', () => {
  const base = { atk: 237, def: 186, hp: 216 };   // Gyarados
  const ivs = { atk: 15, def: 15, sta: 15 };
  const cpmAt25 = CPM.find(e => e.level === 25).cpm;
  const cp = PokePvp.cpFor(base, ivs, cpmAt25);
  assert.strictEqual(Cost.levelForCp(base, ivs, cp, CPM), 25);
});

test('levelForCp: dados faltando → null', () => {
  assert.strictEqual(Cost.levelForCp(null, { atk: 0, def: 0, sta: 0 }, 100, CPM), null);
  assert.strictEqual(Cost.levelForCp({ atk: 1, def: 1, hp: 1 }, { atk: 0, def: 0, sta: 0 }, 'x', CPM), null);
  assert.strictEqual(Cost.levelForCp({ atk: 1, def: 1, hp: 1 }, { atk: 0, def: 0, sta: 0 }, 100, null), null);
});

test('tmCost: classifica faltantes em normal vs elite', () => {
  assert.deepStrictEqual(Cost.tmCost(['AQUA_TAIL', 'TWISTER'], ['AQUA_TAIL']), { normal: 1, elite: 1 });
  assert.deepStrictEqual(Cost.tmCost([], []), { normal: 0, elite: 0 });
  assert.deepStrictEqual(Cost.tmCost(['ICE_BEAM'], []), { normal: 1, elite: 0 });
});

test('format: enxuto, omite zeros, pluraliza e marca Elite', () => {
  assert.strictEqual(
    Cost.format({ dust: 75000, candy: 0, xlCandy: 0, tm: { normal: 1, elite: 0 } }),
    '~75k poeira · 1 TM');
  assert.strictEqual(
    Cost.format({ dust: 270000, candy: 0, xlCandy: 296, tm: { normal: 0, elite: 0 } }),
    '~270k poeira · 296 Doce XL');
  assert.strictEqual(
    Cost.format({ dust: 7500, candy: 1, xlCandy: 0, tm: { normal: 2, elite: 1 } }),
    '~7.5k poeira · 1 doce · 3 TM (1 Elite)');
});

test('format: tudo zero ou null → string vazia', () => {
  assert.strictEqual(Cost.format(null), '');
  assert.strictEqual(Cost.format({ dust: 0, candy: 0, xlCandy: 0, tm: { normal: 0, elite: 0 } }), '');
});

const SPECIES = require('../data/species.json');

function gyaradosInput(over) {
  const base = SPECIES['gyarados'].baseStats;     // {atk:237,def:186,hp:216}
  const ivs = { atk: 15, def: 15, sta: 15 };
  const cpAt25 = PokePvp.cpFor(base, ivs, CPM.find(e => e.level === 25).cpm);
  return Object.assign({
    baseStats: base, ivs: ivs, cp: cpAt25, isShadow: false,
    context: { kind: 'pvp', league: 'master' }, missingMoves: [], eliteMoves: [], cpm: CPM,
  }, over || {});
}

test('estimate: contexto master vai até L50 e usa Doce XL', () => {
  const est = Cost.estimate(gyaradosInput());
  assert.strictEqual(est.fromLevel, 25);
  assert.strictEqual(est.toLevel, 50);
  assert.ok(est.xlCandy > 0);
});

test('estimate: Sombrio reflete a sobretaxa (mais poeira que o normal)', () => {
  const normal = Cost.estimate(gyaradosInput({ isShadow: false }));
  const shadow = Cost.estimate(gyaradosInput({ isShadow: true }));
  assert.ok(shadow.dust > normal.dust);
  assert.strictEqual(shadow.shadow, true);
});

test('estimate: contexto great usa bestLevelUnderCap p/ o nível-alvo', () => {
  const base = SPECIES['gyarados'].baseStats;
  const ivs = { atk: 15, def: 15, sta: 15 };
  const est = Cost.estimate(gyaradosInput({ context: { kind: 'pvp', league: 'great' } }));
  assert.strictEqual(est.toLevel, PokePvp.bestLevelUnderCap(base, ivs, CPM, 1500).level);
  assert.strictEqual(est.xlCandy, 0);   // alvo great fica abaixo de L40 p/ Gyarados
});

test('estimate: contexto pve mira L40 (sem Doce XL)', () => {
  const est = Cost.estimate(gyaradosInput({ context: { kind: 'pve' } }));
  assert.strictEqual(est.toLevel, 40);
  assert.strictEqual(est.xlCandy, 0);
});

test('estimate: dados faltando → null (degradação graciosa)', () => {
  assert.strictEqual(Cost.estimate(null), null);
  assert.strictEqual(Cost.estimate(gyaradosInput({ baseStats: null })), null);
  assert.strictEqual(Cost.estimate(gyaradosInput({ cp: undefined })), null);
  assert.strictEqual(Cost.estimate(gyaradosInput({ context: null })), null);
});
