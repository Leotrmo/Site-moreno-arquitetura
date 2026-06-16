import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSVText } from '../src/lib/parsers/index.js';

const BOM = String.fromCharCode(0xFEFF);
const ITAU = BOM + 'data,lançamento,valor\n'
  + '2026-06-08,CONDOR SITIO CERCADOCURITIBABRA,15.6\n'
  + '2026-06-08,CONDOR SITIO CERCADOCURITIBABRA,15.6\n'; // duplicata idêntica

test('parseCSVText (itau) finaliza com hash em cada transação', () => {
  const r = parseCSVText(ITAU, 'itau', { mesReferencia: '2026-06' });
  assert.equal(r.length, 2);
  assert.ok(r.every((t) => typeof t.hash === 'string' && t.hash.length > 0));
});

test('parseCSVText dá hashes distintos a duplicatas idênticas', () => {
  const r = parseCSVText(ITAU, 'itau', { mesReferencia: '2026-06' });
  assert.notEqual(r[0].hash, r[1].hash);
});

test('parseCSVText é estável entre execuções (dedup ao re-baixar)', () => {
  const a = parseCSVText(ITAU, 'itau', { mesReferencia: '2026-06' }).map((t) => t.hash);
  const b = parseCSVText(ITAU, 'itau', { mesReferencia: '2026-06' }).map((t) => t.hash);
  assert.deepEqual(a, b);
});

test('parseCSVText rejeita banco desconhecido', () => {
  assert.throws(() => parseCSVText(ITAU, 'nubank', { mesReferencia: '2026-06' }), /Banco desconhecido/);
});
