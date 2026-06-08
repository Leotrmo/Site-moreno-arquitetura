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
