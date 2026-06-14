// pokemon/test/evo_owned.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze } = require('../lib/analysis.js');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

// Só venusaur é atacante de raid (meta). bulbasaur herda via projeção da evolução.
function metaVenusaurRaid() {
  return {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: {},
    pveRanks: { venusaur: { roles: ['raid', 'pve'], bestType: 'grass',
      bestMoveset: ['VINE_WHIP', 'FRENZY_PLANT'],
      byType: { grass: { erRank: 11 } }, defBulkRank: 999 } },
  };
}
const bulba = (over) => Object.assign({ mon_name: 'Bulbasaur', mon_number: 1,
  mon_attack: 13, mon_defence: 13, mon_stamina: 13, mon_height: 0.7,   // 86%
  mon_isShiny: 'NO', mon_isLucky: 'NO' }, over);
const venu = (over) => Object.assign({ mon_name: 'Venusaur', mon_number: 3,
  mon_attack: 15, mon_defence: 15, mon_stamina: 15, mon_height: 2.0,
  mon_isShiny: 'NO', mon_isLucky: 'NO' }, over);

test('sem possuir a evolução: Bulbasaur bom → EVOLUIR', () => {
  const fd = { b: bulba() };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, metaVenusaurRaid())
    .find(x => x.id === 'b');
  assert.strictEqual(e.evoOwned, false);
  assert.strictEqual(e.action && e.action.kind, 'EVOLUIR');
});

test('já possuo Venusaur keeper: Bulbasaur duplicado → NÃO EVOLUIR (evoOwned)', () => {
  const fd = { b: bulba(), v: venu() };   // Venusaur é raid-meta → keeper
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, metaVenusaurRaid());
  const b = list.find(x => x.id === 'b');
  assert.strictEqual(b.evoOwned, true);
  assert.notStrictEqual(b.action && b.action.kind, 'EVOLUIR');
});
