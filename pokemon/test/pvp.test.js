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
