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

test('descartar: TRANSFERIR vem antes de MANTER e de INVESTIR', () => {
  const list = [
    mon({ name: 'B', verdict: 'INVESTIR' }),
    mon({ name: 'A', verdict: 'MANTER' }),
    mon({ name: 'C', verdict: 'TRANSFERIR' }),
  ];
  list.sort(getSorter('descartar'));
  assert.deepStrictEqual(list.map(m => m.verdict), ['TRANSFERIR', 'MANTER', 'INVESTIR']);
});

test('descartar: dentro do mesmo veredito, menor IV primeiro', () => {
  const list = [
    mon({ name: 'high', verdict: 'TRANSFERIR', ivPct: 98 }),
    mon({ name: 'low', verdict: 'TRANSFERIR', ivPct: 70 }),
  ];
  list.sort(getSorter('descartar'));
  assert.deepStrictEqual(names(list), ['low', 'high']);
});

test('descartar é o espelho de recomendado sobre os mesmos mons', () => {
  const list = [
    mon({ name: 'A', verdict: 'INVESTIR', ivPct: 90 }),
    mon({ name: 'B', verdict: 'MANTER', ivPct: 80 }),
    mon({ name: 'C', verdict: 'TRANSFERIR', ivPct: 60 }),
  ];
  const rec = names(list.slice().sort(getSorter('recomendado')));
  const desc = names(list.slice().sort(getSorter('descartar')));
  assert.deepStrictEqual(desc, rec.slice().reverse());
});

test('nome: empate de nome desempata por maior IV', () => {
  const list = [
    mon({ name: 'Eevee', ivPct: 60 }),
    mon({ name: 'Eevee', ivPct: 90 }),
  ];
  list.sort(getSorter('nome'));
  assert.deepStrictEqual(list.map(m => m.ivPct), [90, 60]);
});

const { rankFor, competitiveRankSorter, COMP_RANK_KEYS } = require('../lib/sort.js');

const mkPvp = (ivRank) => ({ great: { isMeta: true, ivRank }, ultra: { isMeta: false }, master: { isMeta: false } });

test('rankFor: pvp usa ivRank; ausente → Infinity', () => {
  assert.strictEqual(rankFor({ pvpMeta: mkPvp(12) }, 'pvp_great'), 12);
  assert.strictEqual(rankFor({ pvpMeta: null }, 'pvp_great'), Infinity);
});

test('rankFor: raid usa o menor erRank entre os tipos', () => {
  const e = { pveMeta: { byType: { ice: { erRank: 9 }, water: { erRank: 4 } } } };
  assert.strictEqual(rankFor(e, 'raid'), 4);
});

test('rankFor: gym_def usa defBulkRank', () => {
  assert.strictEqual(rankFor({ pveMeta: { defBulkRank: 2 } }, 'gym_def'), 2);
});

test('competitiveRankSorter: ordena por rank asc, desempata por IV% e nome', () => {
  const a = { name: 'Azu', ivPct: 90, pvpMeta: mkPvp(40) };
  const b = { name: 'Bel', ivPct: 95, pvpMeta: mkPvp(10) };
  const c = { name: 'Cce', ivPct: 80, pvpMeta: mkPvp(10) };
  const sorted = [a, b, c].slice().sort(competitiveRankSorter('pvp_great'));
  assert.deepStrictEqual(sorted.map(x => x.name), ['Bel', 'Cce', 'Azu']); // rank 10 antes de 40; IV 95 antes de 80
});

test('COMP_RANK_KEYS lista as dimensões ranqueáveis', () => {
  assert.ok(COMP_RANK_KEYS.includes('pvp_great'));
  assert.ok(COMP_RANK_KEYS.includes('raid'));
  assert.ok(COMP_RANK_KEYS.includes('gym_def'));
  assert.ok(!COMP_RANK_KEYS.includes('rocket')); // rocket não tem rank
});
