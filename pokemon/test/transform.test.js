// pokemon/test/transform.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const gm = require('../fixtures/mini-gamemaster.json');
const { buildSpecies } = require('../build/transform.js');

test('buildSpecies: chaveado por speciesId, com dex/baseStats/types/family/eliteMoves/shadowEligible', () => {
  const s = buildSpecies(gm);
  assert.strictEqual(s.machop.dex, 66);
  assert.deepStrictEqual(s.machop.baseStats, { atk: 118, def: 96, hp: 150 });
  assert.deepStrictEqual(s.machop.types, ['fighting']);          // "none" removido
  assert.strictEqual(s.machop.family, 'FAMILY_MACHOP');
  assert.deepStrictEqual(s.machop.eliteMoves, ['KARATE_CHOP']);
  assert.strictEqual(s.machop.shadowEligible, true);
  assert.strictEqual(s.sandshrew.shadowEligible, false);         // sem tag
  assert.deepStrictEqual(s.sandshrew_alolan.types, ['ice', 'steel']);
});

test('buildSpecies: falha alto se faltar o array pokemon', () => {
  assert.throws(() => buildSpecies({}), /pokemon/);
});
