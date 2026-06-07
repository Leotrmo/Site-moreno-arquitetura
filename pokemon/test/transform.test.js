// pokemon/test/transform.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const gm = require('../fixtures/mini-gamemaster.json');
const gameMaster = require('../fixtures/mini-game-master.json');
const i18nPt = require('../fixtures/mini-i18n-pt.json');
const { buildSpecies, buildMoves, buildMovesPt } = require('../build/transform.js');

test('buildSpecies: chaveado por speciesId, com dex/baseStats/types/family/eliteMoves/shadowEligible', () => {
  const s = buildSpecies(gm);
  assert.strictEqual(s.machop.dex, 66);
  assert.deepStrictEqual(s.machop.baseStats, { atk: 118, def: 96, hp: 150 });
  assert.deepStrictEqual(s.machop.types, ['fighting']);          // "none" removido
  assert.strictEqual(s.machop.family, 'FAMILY_MACHOP');
  assert.deepStrictEqual(s.machop.eliteMoves, ['KARATE_CHOP']);
  assert.strictEqual(s.machop.shadowEligible, true);
  assert.strictEqual(s.sandshrew.shadowEligible, false);         // sem tag
  assert.deepStrictEqual(s.sandshrew_alolan.types, ['ice', 'steel']);
});

test('buildSpecies: falha alto se faltar o array pokemon', () => {
  assert.throws(() => buildSpecies({}), /pokemon/);
});

test('buildMoves: classifica fast/charge e guarda type + stats PvP', () => {
  const m = buildMoves(gm);
  assert.deepStrictEqual(m.ROCK_SMASH, { type: 'fighting', kind: 'fast', pvp: { power: 9, energy: 7 } });
  assert.deepStrictEqual(m.CROSS_CHOP, { type: 'fighting', kind: 'charge', pvp: { power: 50, energy: 35 } });
  assert.strictEqual(m.TRANSFORM, undefined); // golpe unlisted é pulado
});

test('buildMovesPt: nome PT normalizado → uniqueId (sem sufixo _FAST)', () => {
  const { map, coverage } = buildMovesPt(gameMaster, i18nPt);
  assert.strictEqual(map['esmagamento de pedras'], 'ROCK_SMASH'); // _FAST removido
  assert.strictEqual(map['soco de gelo'], 'ICE_PUNCH');
  assert.strictEqual(Object.keys(map).length, 2);                 // uniqueId inteiro (406) não entra
  assert.ok(coverage > 0 && coverage <= 1);
});
