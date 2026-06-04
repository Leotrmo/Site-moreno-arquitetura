// pokemon/test/grouping.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { enrichCollection } = require('../lib/analysis.js');

const fileData = {
  'a': { mon_name:'Deino', mon_number:633, mon_cp:329, mon_attack:9, mon_defence:0, mon_stamina:7, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' }, // 36%
  'b': { mon_name:'Deino', mon_number:633, mon_cp:67,  mon_attack:0, mon_defence:8, mon_stamina:3, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' }, // 24%
  'c': { mon_name:'Machop', mon_number:66, mon_cp:584, mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' }, // único
};

test('marca melhor cópia, única cópia e id', () => {
  const list = enrichCollection(fileData, getPokemonSize, refdata);
  const byId = Object.fromEntries(list.map(e => [e.id, e]));
  assert.strictEqual(byId['a'].isBestOfSpecies, true);   // 36% > 24%
  assert.strictEqual(byId['b'].isBestOfSpecies, false);
  assert.strictEqual(byId['a'].isOnlyCopy, false);
  assert.strictEqual(byId['c'].isOnlyCopy, true);
  assert.strictEqual(byId['c'].isBestOfSpecies, true);
});

test('formas especiais não se misturam com a base', () => {
  const fd = {
    'x': { mon_name:'Grimer', mon_number:88, mon_form:'GRIMER_ALOLA', mon_cp:961, mon_attack:14, mon_defence:12, mon_stamina:15, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' },
    'y': { mon_name:'Grimer', mon_number:88, mon_form:'GRIMER_NORMAL', mon_cp:500, mon_attack:5, mon_defence:5, mon_stamina:5, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const list = enrichCollection(fd, getPokemonSize, refdata);
  for (const e of list) assert.strictEqual(e.isOnlyCopy, true); // Alola (especial) e Normal (base) são espécies distintas
});

test('forma base: "X_NORMAL" e sem mon_form agrupam juntos', () => {
  const fd = {
    'n': { mon_name:'Charmander', mon_number:4, mon_form:'CHARMANDER_NORMAL', mon_cp:500, mon_attack:14, mon_defence:14, mon_stamina:14, mon_height:0.6, mon_isShiny:'NO', mon_isLucky:'NO' }, // 93%
    'p': { mon_name:'Charmander', mon_number:4, mon_cp:80, mon_attack:2, mon_defence:5, mon_stamina:7, mon_height:0.6, mon_isShiny:'NO', mon_isLucky:'NO' }, // 31%, sem mon_form
  };
  const list = enrichCollection(fd, getPokemonSize, refdata);
  const byId = Object.fromEntries(list.map(e => [e.id, e]));
  assert.strictEqual(byId['n'].isOnlyCopy, false); // agrupados → nenhum é "única cópia"
  assert.strictEqual(byId['p'].isOnlyCopy, false);
  assert.strictEqual(byId['n'].isBestOfSpecies, true);  // 93% > 31%
  assert.strictEqual(byId['p'].isBestOfSpecies, false);
});
