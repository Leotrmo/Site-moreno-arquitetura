// pokemon/test/import.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseCollection } = require('../lib/import.js');

// helpers de fixture
function mon(extra) {
  return Object.assign({ mon_name: 'Pikachu', mon_cp: 500, mon_number: 25 }, extra || {});
}
function coll(fileData, top) {
  return Object.assign(
    { exportTime: '16 de jun.', fileName: 'Export-Leo', pokemonCount: Object.keys(fileData).length, fileData },
    top || {}
  );
}

test('parseCollection: válido devolve ok + summary + data', () => {
  const c = coll({ '1': mon(), '2': mon({ mon_name: 'Bulbasaur', mon_number: 1 }) });
  const res = parseCollection(JSON.stringify(c));
  assert.equal(res.ok, true);
  assert.equal(res.summary.count, 2);
  assert.equal(res.summary.exportTime, '16 de jun.');
  assert.equal(res.summary.fileName, 'Export-Leo');
  assert.equal(res.data.fileData['1'].mon_name, 'Pikachu');
});

test('parseCollection: JSON quebrado é rejeitado', () => {
  const res = parseCollection('{ não é json ');
  assert.equal(res.ok, false);
  assert.match(res.error, /JSON/);
});

test('parseCollection: sem fileData é rejeitado', () => {
  const res = parseCollection(JSON.stringify({ exportTime: 'x' }));
  assert.equal(res.ok, false);
  assert.match(res.error, /fileData/);
});

test('parseCollection: fileData vazio é rejeitado', () => {
  const res = parseCollection(JSON.stringify(coll({})));
  assert.equal(res.ok, false);
  assert.match(res.error, /vazio/);
});

test('parseCollection: entradas que não parecem Pokémon são rejeitadas', () => {
  const res = parseCollection(JSON.stringify(coll({ '1': { foo: 'bar' } })));
  assert.equal(res.ok, false);
  assert.match(res.error, /Pokémon|mon_name/);
});
