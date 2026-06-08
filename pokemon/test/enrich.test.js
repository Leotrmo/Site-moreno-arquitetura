// pokemon/test/enrich.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { enrichOne, analyze } = require('../lib/analysis.js');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

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

test('enrich anexa speciesId e moveIds quando meta é fornecido', () => {
  const meta = {
    speciesIndex: buildSpeciesIndex({ machop: { dex: 66, baseStats: {}, types: ['fighting'] } }),
    movesPt: { 'soco dinamico': 'DYNAMIC_PUNCH', 'lampada quebrada': 'X' },
  };
  const mon = { mon_name: 'Machop', mon_number: 66, mon_cp: 500, mon_attack: 15, mon_defence: 15,
                mon_stamina: 15, mon_height: 0.8, mon_isShiny: 'NO', mon_isLucky: 'NO',
                mon_move_1: 'Soco Dinâmico' };
  const e = enrichOne(mon, getPokemonSize, refdata, getPokemonSizeScalar, meta);
  assert.strictEqual(e.speciesId, 'machop');
  assert.deepStrictEqual(e.moveIds, ['DYNAMIC_PUNCH']);  // só golpes que casaram
});

test('enrich sem meta: speciesId/moveIds nulos, resto intacto (não-regressão)', () => {
  const e = enrichOne({ mon_name: 'Machop', mon_number: 66, mon_cp: 500, mon_attack: 15,
                        mon_defence: 15, mon_stamina: 15, mon_height: 0.8, mon_isShiny: 'NO',
                        mon_isLucky: 'NO' }, getPokemonSize, refdata, getPokemonSizeScalar);
  assert.strictEqual(e.speciesId, null);
  assert.deepStrictEqual(e.moveIds, []);
  assert.strictEqual(e.ivPct, 100); // comportamento atual preservado
});

const realCpm = require('../data/cpm.json');
const speciesJson = require('../data/species.json');
const pvpRanksJson = require('../data/pvp_ranks.json');

function fullMeta() {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  return { speciesIndex: buildSpeciesIndex(speciesJson), movesPt: {}, pvpRanks: pvpRanksJson, cpm: realCpm };
}

test('analyze com meta: Azumarill 0/15/15 ganha e.pvpMeta e tag pvp_great', () => {
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, fullMeta())[0];
  assert.ok(e.pvpMeta, 'e.pvpMeta presente');
  assert.strictEqual(e.pvpMeta.great.isMeta, true);
  assert.ok(e.tags.includes('pvp_great'));
});

test('analyze com meta: espécie meta nunca cai em TRANSFERIR (proteção)', () => {
  const fd = {
    best: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15, mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' },
    dupe: { mon_name:'Azumarill', mon_number:184, mon_cp:600,  mon_attack:2, mon_defence:3,  mon_stamina:4,  mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, fullMeta());
  assert.ok(list.every(e => e.verdict !== 'TRANSFERIR'));
});

test('analyze SEM meta: e.pvpMeta null, sem tags pvp_*, veredito intacto (não-regressão)', () => {
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:600, mon_attack:2, mon_defence:3, mon_stamina:4,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar)[0];
  assert.strictEqual(e.pvpMeta, null);
  assert.ok(!e.tags.some(t => t.indexOf('pvp_') === 0));
  assert.strictEqual(e.verdict, 'MANTER'); // única cópia → MANTER, como antes
});
