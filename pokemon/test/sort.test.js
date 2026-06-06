// pokemon/test/sort.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getSorter, SORT_OPTIONS, COMPARATORS } = require('../lib/sort.js');

// Mons "enriquecidos" mínimos, só com os campos que os comparadores usam.
function mon(over) {
  return Object.assign({ name: 'Machop', number: 66, cp: 500, ivPct: 80, verdict: 'MANTER' }, over);
}

function names(list) { return list.map(m => m.name); }

test('SORT_OPTIONS sempre inclui "recomendado" como primeira opção', () => {
  assert.strictEqual(SORT_OPTIONS[0].key, 'recomendado');
});

test('getSorter cai em "recomendado" para chave inválida ou ausente', () => {
  assert.strictEqual(getSorter('xpto'), COMPARATORS.recomendado);
  assert.strictEqual(getSorter(undefined), COMPARATORS.recomendado);
});

test('ordena por nome (A-Z), ignorando acentos e maiúsculas', () => {
  const list = [mon({ name: 'Zubat' }), mon({ name: 'abra' }), mon({ name: 'Éevee' }), mon({ name: 'Charmander' })];
  list.sort(getSorter('nome'));
  assert.deepStrictEqual(names(list), ['abra', 'Charmander', 'Éevee', 'Zubat']);
});

test('ordena por número do Pokédex (crescente)', () => {
  const list = [mon({ number: 150 }), mon({ number: 1 }), mon({ number: 25 })];
  list.sort(getSorter('numero'));
  assert.deepStrictEqual(list.map(m => m.number), [1, 25, 150]);
});

test('ordena por PC (maior primeiro)', () => {
  const list = [mon({ cp: 500 }), mon({ cp: 3000 }), mon({ cp: 1200 })];
  list.sort(getSorter('cp'));
  assert.deepStrictEqual(list.map(m => m.cp), [3000, 1200, 500]);
});

test('ordena por IV (maior primeiro)', () => {
  const list = [mon({ ivPct: 80 }), mon({ ivPct: 100 }), mon({ ivPct: 96 })];
  list.sort(getSorter('iv'));
  assert.deepStrictEqual(list.map(m => m.ivPct), [100, 96, 80]);
});

test('recomendado: INVESTIR vem antes de MANTER e de TRANSFERIR', () => {
  const list = [
    mon({ name: 'C', verdict: 'TRANSFERIR' }),
    mon({ name: 'A', verdict: 'MANTER' }),
    mon({ name: 'B', verdict: 'INVESTIR' }),
  ];
  list.sort(getSorter('recomendado'));
  assert.deepStrictEqual(list.map(m => m.verdict), ['INVESTIR', 'MANTER', 'TRANSFERIR']);
});

test('recomendado: dentro do mesmo veredito, maior IV primeiro', () => {
  const list = [
    mon({ name: 'low', verdict: 'MANTER', ivPct: 70 }),
    mon({ name: 'high', verdict: 'MANTER', ivPct: 98 }),
  ];
  list.sort(getSorter('recomendado'));
  assert.deepStrictEqual(names(list), ['high', 'low']);
});

test('nome: empate de nome desempata por maior IV', () => {
  const list = [
    mon({ name: 'Eevee', ivPct: 60 }),
    mon({ name: 'Eevee', ivPct: 90 }),
  ];
  list.sort(getSorter('nome'));
  assert.deepStrictEqual(list.map(m => m.ivPct), [90, 60]);
});
