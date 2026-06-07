// pokemon/test/match.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeName, buildSpeciesIndex, matchSpecies } = require('../lib/meta/match.js');

test('normalizeName: minúsculo, sem acento, sem pontuação, espaço único', () => {
  assert.strictEqual(normalizeName('Esmagamento de Pedras'), 'esmagamento de pedras');
  assert.strictEqual(normalizeName('Soco de Gelo'), 'soco de gelo');
  assert.strictEqual(normalizeName('  Investida   Trovão!! '), 'investida trovao');
  assert.strictEqual(normalizeName('Aerial Ace'), 'aerial ace');
});

const speciesJson = {
  machop:            { dex: 66, baseStats: {}, types: ['fighting'] },
  sandshrew:         { dex: 27, baseStats: {}, types: ['ground'] },
  sandshrew_alolan:  { dex: 27, baseStats: {}, types: ['ice', 'steel'] },
};

test('matchSpecies: forma base casa pelo dex (sem mon_form)', () => {
  const idx = buildSpeciesIndex(speciesJson);
  assert.strictEqual(matchSpecies({ mon_number: 66 }, idx), 'machop');
  assert.strictEqual(matchSpecies({ mon_number: 27 }, idx), 'sandshrew');                 // base, não alolan
  assert.strictEqual(matchSpecies({ mon_number: 27, mon_form: 'SANDSHREW_NORMAL' }, idx), 'sandshrew');
});

test('matchSpecies: forma regional casa pelo sufixo', () => {
  const idx = buildSpeciesIndex(speciesJson);
  assert.strictEqual(matchSpecies({ mon_number: 27, mon_form: 'SANDSHREW_ALOLA' }, idx), 'sandshrew_alolan');
});

test('matchSpecies: desconhecido → null (degrada gracioso)', () => {
  const idx = buildSpeciesIndex(speciesJson);
  assert.strictEqual(matchSpecies({ mon_number: 99999 }, idx), null);
});
