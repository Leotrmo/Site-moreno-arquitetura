import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValorBR } from '../src/lib/shared.js';

test('parseValorBR converte decimal brasileiro', () => {
  assert.equal(parseValorBR('30,14'), 30.14);
  assert.equal(parseValorBR('416,28'), 416.28);
});

test('parseValorBR remove separador de milhar e aceita negativo', () => {
  assert.equal(parseValorBR('3.350,07'), 3350.07);
  assert.equal(parseValorBR('-3350,07'), -3350.07);
});
