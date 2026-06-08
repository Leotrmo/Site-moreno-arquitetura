// pokemon/test/pvp.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { cpFor } = require('../lib/meta/pvp.js');

test('cpFor: fórmula padrão de CP (piso 10)', () => {
  // base 100/100/100, IV 15/15/15, cpm 0.5:
  // floor(115 * sqrt(115) * sqrt(115) * 0.25 / 10) = floor(115*115*0.25/10) = 330
  assert.strictEqual(cpFor({ atk: 100, def: 100, hp: 100 }, { atk: 15, def: 15, sta: 15 }, 0.5), 330);
  // piso de 10
  assert.strictEqual(cpFor({ atk: 1, def: 1, hp: 1 }, { atk: 0, def: 0, sta: 0 }, 0.094), 10);
});
