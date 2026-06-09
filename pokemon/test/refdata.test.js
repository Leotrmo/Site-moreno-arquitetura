// pokemon/test/refdata.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { LEGENDARY, REGIONAL, TRADE_EVO, TYPE_PT } = require('../lib/refdata.js');

test('lendários conhecidos estão no conjunto', () => {
  for (const n of [150 /*Mewtwo*/, 245 /*Suicune*/, 251 /*Celebi*/, 380 /*Latias*/,
                   492 /*Shaymin*/, 648 /*Meloetta*/, 718 /*Zygarde*/, 719 /*Diancie*/]) {
    assert.ok(LEGENDARY.has(n), 'esperava lendário: ' + n);
  }
});

test('não-lendários não estão no conjunto', () => {
  for (const n of [25 /*Pikachu*/, 16 /*Pidgey*/, 66 /*Machop*/, 129 /*Magikarp*/]) {
    assert.ok(!LEGENDARY.has(n), 'não devia ser lendário: ' + n);
  }
});

test('evolução por troca inclui Kadabra (64) e Machoke (67)', () => {
  assert.ok(TRADE_EVO.has(64));
  assert.ok(TRADE_EVO.has(67));
});

test('regional inclui Durant (632)', () => {
  assert.ok(REGIONAL.has(632));
});

test('refdata exporta TYPE_PT (fonte única dos nomes de tipo em PT)', () => {
  assert.strictEqual(TYPE_PT.fire, 'Fogo');
  assert.strictEqual(TYPE_PT.dark, 'Sombrio');
  assert.strictEqual(Object.keys(TYPE_PT).length, 18);
});
