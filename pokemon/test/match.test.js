// pokemon/test/match.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeName, buildSpeciesIndex, matchSpecies } = require('../lib/meta/match.js');

test('normalizeName: minúsculo, sem acento, sem pontuação, espaço único', () => {
  assert.strictEqual(normalizeName('Esmagamento de Pedras'), 'esmagamento de pedras');
  assert.strictEqual(normalizeName('Soco de Gelo'), 'soco de gelo');
  assert.strictEqual(normalizeName('  Investida   Trovão!! '), 'investida trovao');
  assert.strictEqual(normalizeName('Aerial Ace'), 'aerial ace');
});

const speciesJson = {
  machop:            { dex: 66, baseStats: {}, types: ['fighting'] },
  sandshrew:         { dex: 27, baseStats: {}, types: ['ground'] },
  sandshrew_alolan:  { dex: 27, baseStats: {}, types: ['ice', 'steel'] },
};

test('matchSpecies: forma base casa pelo dex (sem mon_form)', () => {
  const idx = buildSpeciesIndex(speciesJson);
  assert.strictEqual(matchSpecies({ mon_number: 66 }, idx), 'machop');
  assert.strictEqual(matchSpecies({ mon_number: 27 }, idx), 'sandshrew');                 // base, não alolan
  assert.strictEqual(matchSpecies({ mon_number: 27, mon_form: 'SANDSHREW_NORMAL' }, idx), 'sandshrew');
});

test('matchSpecies: forma regional casa pelo sufixo', () => {
  const idx = buildSpeciesIndex(speciesJson);
  assert.strictEqual(matchSpecies({ mon_number: 27, mon_form: 'SANDSHREW_ALOLA' }, idx), 'sandshrew_alolan');
});

test('matchSpecies: desconhecido → null (degrada gracioso)', () => {
  const idx = buildSpeciesIndex(speciesJson);
  assert.strictEqual(matchSpecies({ mon_number: 99999 }, idx), null);
});

const { matchMove } = require('../lib/meta/match.js');
const movesPt = { 'esmagamento de pedras': 'ROCK_SMASH', 'soco de gelo': 'ICE_PUNCH' };

test('matchMove: nome PT (com variação de caixa/acentos) → moveId', () => {
  assert.strictEqual(matchMove('Esmagamento de Pedras', movesPt), 'ROCK_SMASH');
  assert.strictEqual(matchMove('soco de  gelo', movesPt), 'ICE_PUNCH');
});

test('matchMove: golpe sem casar → null', () => {
  assert.strictEqual(matchMove('Golpe Inexistente', movesPt), null);
  assert.strictEqual(matchMove(undefined, movesPt), null);
});

const { matchMoveInSpecies } = require('../lib/meta/match.js');

// IDs com nome PT colidente; uma espécie nunca tem mais de um deles na lista.
const movesById = {
  HYDRO_PUMP:           { namePt: "Jato d'Água" },
  HYDRO_PUMP_BLASTOISE: { namePt: "Jato d'Água" },
  WATERFALL:            { namePt: 'Cachoeira' },
  HURRICANE:            { namePt: 'Furacão' },
  DRILL_RUN:            { namePt: 'Perfurar' },
};

test('matchMoveInSpecies: resolve dentro dos golpes da espécie (mata a colisão)', () => {
  // Gyarados tem HYDRO_PUMP na lista, não a variante Blastoise.
  assert.strictEqual(
    matchMoveInSpecies("Jato d'Água", ['WATERFALL', 'HYDRO_PUMP', 'AQUA_TAIL'], movesById, {}),
    'HYDRO_PUMP');
});

test('matchMoveInSpecies: nome fora da lista da espécie → null (deixa o fallback agir)', () => {
  assert.strictEqual(
    matchMoveInSpecies("Jato d'Água", ['WATERFALL', 'AQUA_TAIL'], movesById, {}),
    null);
});

test('matchMoveInSpecies: usa override quando falta namePt', () => {
  const mb = { CHILLING_WATER: {} }; // sem namePt
  assert.strictEqual(
    matchMoveInSpecies('Água Refrescante', ['CHILLING_WATER'], mb, { CHILLING_WATER: 'Água Refrescante' }),
    'CHILLING_WATER');
});

test('matchMoveInSpecies: degrada gracioso (sem nome/lista → null)', () => {
  assert.strictEqual(matchMoveInSpecies('', ['HYDRO_PUMP'], movesById, {}), null);
  assert.strictEqual(matchMoveInSpecies("Jato d'Água", [], movesById, {}), null);
});
