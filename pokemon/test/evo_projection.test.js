// pokemon/test/evo_projection.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze } = require('../lib/analysis.js');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

// pveRanks SINTÉTICO: só a evolução base (machamp) é atacante de raid; Machop não tem entrada.
function metaMachampRaid() {
  return {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'golpe de carate': 'KARATE_CHOP' },
    pveRanks: { machamp: { roles: ['raid', 'gym_atk'], bestType: 'fighting',
      bestMoveset: ['COUNTER', 'CROSS_CHOP'],
      byType: { fighting: { dps: 18, tdo: 500, er: 50, dpsRank: 3, erRank: 6 } }, defBulkRank: 999 } },
  };
}
function machop(over) {
  return Object.assign({ mon_name: 'Machop', mon_number: 66, mon_cp: 500,
    mon_height: 0.8, mon_isShiny: 'NO', mon_isLucky: 'NO', mon_move_1: 'Golpe de Caratê' }, over);
}

test('projeção PvE com IV alto → e.evoProj (kind pve) + metaEvo + alvo', () => {
  const fd = { m: machop({ mon_attack: 14, mon_defence: 14, mon_stamina: 13 }) }; // 91%
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, metaMachampRaid())[0];
  assert.strictEqual(e.pveMeta, null);                 // o Machop em si não é meta
  assert.ok(e.evoProj, 'tem evoProj');
  assert.strictEqual(e.evoProj.kind, 'pve');
  assert.strictEqual(e.evoProj.role, 'raid');
  assert.strictEqual(e.evoProj.targetId, 'machamp');
  assert.strictEqual(e.metaEvo, true);
  assert.strictEqual(e.metaEvoTarget, 'Machamp');
});

test('projeção PvE com IV abaixo do piso (58%) → SEM evoProj (corta Zweilous-like)', () => {
  const fd = { m: machop({ mon_attack: 9, mon_defence: 9, mon_stamina: 8 }) }; // 9+9+8 = 26/45 → 58%
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, metaMachampRaid())[0];
  assert.strictEqual(e.evoProj, null);
  assert.strictEqual(e.metaEvo, false);
});

test('evolução não-meta → SEM evoProj', () => {
  const meta = { speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: {}, pveRanks: {} };  // ninguém é meta
  const fd = { m: machop({ mon_attack: 15, mon_defence: 15, mon_stamina: 15 }) };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.evoProj, null);
  assert.strictEqual(e.metaEvo, false);
});

test('projeção PvP vence e escolhe o melhor candidato (Azurill → Azumarill, não Marill)', () => {
  // Azurill (FAMILY_MARILL) tem candidatos marill + azumarill; só azumarill é meta (great).
  // 0/15/15 (bulky) → azumarill é pick de Liga Grande. Usa dados reais de pvp/cpm.
  const meta = { speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: {}, pvpRanks: require('../data/pvp_ranks.json'), cpm: require('../data/cpm.json') };
  const fd = { a: { mon_name: 'Azurill', mon_number: 298, mon_cp: 200,
    mon_attack: 0, mon_defence: 15, mon_stamina: 15, mon_height: 0.2, mon_isShiny: 'NO', mon_isLucky: 'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.ok(e.evoProj, 'tem evoProj');
  assert.strictEqual(e.evoProj.kind, 'pvp');
  assert.strictEqual(e.evoProj.league, 'great');
  assert.strictEqual(e.evoProj.targetId, 'azumarill');   // venceu o marill (não-meta)
  assert.strictEqual(e.metaEvoTarget, 'Azumarill');
});

test('evolução regional respeita a região (Grimer Alola → Muk Alolan)', () => {
  const meta = { speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: {}, pveRanks: { muk_alolan: { roles: ['raid'], bestType: 'dark',
      bestMoveset: ['BITE', 'CRUNCH'], byType: { dark: { erRank: 9 } }, defBulkRank: 999 } } };
  const fd = { g: { mon_name: 'Grimer', mon_number: 88, mon_form: 'GRIMER_ALOLA', mon_cp: 500,
    mon_attack: 14, mon_defence: 14, mon_stamina: 14, mon_height: 0.7, mon_isShiny: 'NO', mon_isLucky: 'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.ok(e.evoProj);
  assert.strictEqual(e.evoProj.targetId, 'muk_alolan');
  assert.match(e.metaEvoTarget, /Alolan/);
});
