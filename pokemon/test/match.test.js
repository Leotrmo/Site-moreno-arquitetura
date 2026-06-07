// pokemon/test/match.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeName } = require('../lib/meta/match.js');

test('normalizeName: minúsculo, sem acento, sem pontuação, espaço único', () => {
  assert.strictEqual(normalizeName('Esmagamento de Pedras'), 'esmagamento de pedras');
  assert.strictEqual(normalizeName('Soco de Gelo'), 'soco de gelo');
  assert.strictEqual(normalizeName('  Investida   Trovão!! '), 'investida trovao');
  assert.strictEqual(normalizeName('Aerial Ace'), 'aerial ace');
});
