// pokemon/test/enrich.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { enrichOne } = require('../lib/analysis.js');

const baseMon = (over) => Object.assign({
  mon_name: 'Machop', mon_number: 66, mon_cp: 500,
  mon_attack: 15, mon_defence: 15, mon_stamina: 15,
  mon_height: 0.8, mon_isShiny: 'NO', mon_isLucky: 'NO',
}, over || {});

test('IV% = soma/45', () => {
  assert.strictEqual(enrichOne(baseMon(), getPokemonSize, refdata).ivPct, 100);
  assert.strictEqual(enrichOne(baseMon({ mon_attack:0, mon_defence:8, mon_stamina:3 }), getPokemonSize, refdata).ivPct, 24);
});

test('flags de shiny/lucky/sombrio/purificado/fantasia', () => {
  assert.strictEqual(enrichOne(baseMon({ mon_isShiny:'YES' }), getPokemonSize, refdata).isShiny, true);
  assert.strictEqual(enrichOne(baseMon({ mon_isLucky:'YES' }), getPokemonSize, refdata).isLucky, true);
  assert.strictEqual(enrichOne(baseMon({ mon_alignment:'SHADOW' }), getPokemonSize, refdata).isShadow, true);
  assert.strictEqual(enrichOne(baseMon({ mon_alignment:'PURIFIED' }), getPokemonSize, refdata).isPurified, true);
  assert.strictEqual(enrichOne(baseMon({ mon_costume:'X2021' }), getPokemonSize, refdata).isCostume, true);
});

test('hundo e quase-perfeito', () => {
  assert.strictEqual(enrichOne(baseMon(), getPokemonSize, refdata).isHundo, true);
  assert.strictEqual(enrichOne(baseMon({ mon_attack:14 }), getPokemonSize, refdata).isNearPerfect, true); // 44/45 = 98%
  assert.strictEqual(enrichOne(baseMon({ mon_attack:10, mon_defence:10, mon_stamina:10 }), getPokemonSize, refdata).isNearPerfect, false); // 67%
});

test('lendário vem do refdata', () => {
  assert.strictEqual(enrichOne(baseMon({ mon_number:150 }), getPokemonSize, refdata).isLegendary, true);
  assert.strictEqual(enrichOne(baseMon({ mon_number:66 }), getPokemonSize, refdata).isLegendary, false);
});

const { getPokemonSizeScalar } = require('../sizes.js');

test('sizeScalar = altura / altura-base', () => {
  // Xatu #178, base 1.5m
  assert.strictEqual(getPokemonSizeScalar(178, 0.95).toFixed(3), '0.633');
  assert.strictEqual(getPokemonSizeScalar(178, 1.17).toFixed(3), '0.780');
});

test('sizeScalar usa BASE_H_FORMS quando há forma', () => {
  // SANDSHREW_ALOLA base 0.7m
  assert.strictEqual(getPokemonSizeScalar(27, 0.35, 'SANDSHREW_ALOLA').toFixed(3), '0.500');
});

test('sizeScalar retorna null quando espécie desconhecida', () => {
  assert.strictEqual(getPokemonSizeScalar(99999, 1.0), null);
});
