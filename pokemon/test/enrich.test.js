// pokemon/test/enrich.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { enrichOne, analyze } = require('../lib/analysis.js');

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

test('isXSComfort: scalar < 0.70 e size XS', () => {
  // Xatu #178 base 1.5, height 0.95 → scalar 0.633 → XS
  const xs = enrichOne({ mon_name:'Xatu', mon_number:178, mon_cp:909, mon_attack:13, mon_defence:11, mon_stamina:12, mon_height:0.95, mon_isShiny:'NO', mon_isLucky:'NO' }, getPokemonSize, refdata, getPokemonSizeScalar);
  assert.strictEqual(xs.size, 'XS');
  assert.strictEqual(xs.isXSComfort, true);
});

test('isXSComfort: scalar 0.78 (fronteira XS) NÃO entra', () => {
  // Xatu #178 base 1.5, height 1.17 → scalar 0.780 → XS no jogo, mas fronteira
  const xs = enrichOne({ mon_name:'Xatu', mon_number:178, mon_cp:1482, mon_attack:13, mon_defence:14, mon_stamina:8, mon_height:1.17, mon_isShiny:'NO', mon_isLucky:'NO' }, getPokemonSize, refdata, getPokemonSizeScalar);
  assert.strictEqual(xs.isXSComfort, false);
});

test('isXLComfort: scalar > 1.40 e size XL', () => {
  // Machop #66 base 0.8, height 1.20 → scalar 1.5 → XL
  const xl = enrichOne(baseMon({ mon_height:1.2 }), getPokemonSize, refdata, getPokemonSizeScalar);
  assert.strictEqual(xl.size, 'XL');
  assert.strictEqual(xl.isXLComfort, true);
});

test('hasSecondCharge: presente quando mon_move_3 existe', () => {
  assert.strictEqual(enrichOne(baseMon(), getPokemonSize, refdata, getPokemonSizeScalar).hasSecondCharge, false);
  assert.strictEqual(enrichOne(baseMon({ mon_move_3:'Soco Dinâmico' }), getPokemonSize, refdata, getPokemonSizeScalar).hasSecondCharge, true);
});

test('sizeScalar é exposto no objeto enriquecido', () => {
  const e = enrichOne(baseMon({ mon_height:0.8 }), getPokemonSize, refdata, getPokemonSizeScalar);
  // Machop #66 base 0.8 → scalar 1.0
  assert.strictEqual(e.sizeScalar.toFixed(2), '1.00');
});

test('analyze propaga sizeScalar via getSizeScalar opcional', () => {
  const fd = { x: { mon_name:'Xatu', mon_number:178, mon_cp:909, mon_attack:13, mon_defence:11, mon_stamina:12, mon_height:0.95, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar);
  assert.strictEqual(list[0].isXSComfort, true);
});
