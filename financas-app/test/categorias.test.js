import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIAS, AUTO_CATEGORIAS } from '../src/lib/categorias.js';

test('CATEGORIAS tem 15 itens com id/emoji/label', () => {
  assert.equal(CATEGORIAS.length, 15);
  for (const c of CATEGORIAS) {
    assert.ok(c.id && c.emoji && c.label, `categoria incompleta: ${JSON.stringify(c)}`);
  }
});

test('AUTO_CATEGORIAS referencia ids válidos de categoria', () => {
  const ids = new Set(CATEGORIAS.map((c) => c.id));
  for (const id of Object.keys(AUTO_CATEGORIAS)) {
    assert.ok(ids.has(id), `id desconhecido em AUTO_CATEGORIAS: ${id}`);
  }
});
