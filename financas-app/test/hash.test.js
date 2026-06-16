import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashTransacao, finalizar } from '../src/lib/hash.js';

const base = { banco: 'itau', data: '2026-06-08', descricao: 'CONDOR', valor: 15.6 };

test('hashTransacao é determinístico', () => {
  assert.equal(hashTransacao({ ...base, ocorrencia: 0 }), hashTransacao({ ...base, ocorrencia: 0 }));
});

test('hashTransacao muda com a ocorrência', () => {
  assert.notEqual(hashTransacao({ ...base, ocorrencia: 0 }), hashTransacao({ ...base, ocorrencia: 1 }));
});

test('finalizar dá hashes distintos a duplicatas idênticas', () => {
  const out = finalizar([{ ...base }, { ...base }]);
  assert.equal(out.length, 2);
  assert.notEqual(out[0].hash, out[1].hash);
});

test('finalizar é estável entre execuções (mesmo input → mesmos hashes)', () => {
  const a = finalizar([{ ...base }, { ...base }]).map((t) => t.hash);
  const b = finalizar([{ ...base }, { ...base }]).map((t) => t.hash);
  assert.deepEqual(a, b);
});
