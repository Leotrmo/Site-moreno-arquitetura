const test = require('node:test');
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
  assert.ok(sh.candy > base.candy);           // doce também sobe
});

test('powerUpCost: from >= to → tudo zero', () => {
  assert.deepStrictEqual(Cost.powerUpCost(35, 35, false), { dust: 0, candy: 0, xlCandy: 0 });
  assert.deepStrictEqual(Cost.powerUpCost(40, 30, false), { dust: 0, candy: 0, xlCandy: 0 });
});
