import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBRL, formatData, nomeMes, shiftMes } from '../src/lib/formato.js';

test('formatBRL formata em reais com milhar e 2 casas', () => {
  assert.equal(formatBRL(1234.5), 'R$ 1.234,50');
  assert.equal(formatBRL(0), 'R$ 0,00');
  assert.equal(formatBRL(-50), '-R$ 50,00');
  assert.equal(formatBRL(1000000), 'R$ 1.000.000,00');
});

test('formatData converte ISO para DD/MM/AAAA', () => {
  assert.equal(formatData('2026-06-10'), '10/06/2026');
  assert.equal(formatData('2025-11-28'), '28/11/2025');
});

test('nomeMes converte AAAA-MM para abreviação PT-BR', () => {
  assert.equal(nomeMes('2026-06'), 'jun/2026');
  assert.equal(nomeMes('2026-01'), 'jan/2026');
  assert.equal(nomeMes('2026-12'), 'dez/2026');
});

test('shiftMes anda meses respeitando virada de ano', () => {
  assert.equal(shiftMes('2026-06', 1), '2026-07');
  assert.equal(shiftMes('2026-12', 1), '2027-01');
  assert.equal(shiftMes('2026-01', -1), '2025-12');
});
