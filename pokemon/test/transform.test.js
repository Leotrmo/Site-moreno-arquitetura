// pokemon/test/transform.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const gm = require('../fixtures/mini-gamemaster.json');
const gameMaster = require('../fixtures/mini-game-master.json');
const i18nPt = require('../fixtures/mini-i18n-pt.json');
const ranks = require('../fixtures/mini-rankings.json');
const { buildSpecies, buildMoves, buildMovesPt, buildPvpRanks } = require('../build/transform.js');

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

test('buildPvpRanks: junta as 3 ligas por speciesId, com rank 1-based e corte Top N', () => {
  const r = buildPvpRanks({ great: ranks, ultra: [], master: [] }, { great: 2, ultra: 2, master: 2 });
  assert.deepStrictEqual(r.medicham.great, { rank: 1, score: 94, moveset: ['COUNTER', 'ICE_PUNCH', 'POWER_UP_PUNCH'] });
  assert.strictEqual(r.azumarill.great.rank, 2);
  assert.strictEqual(r.machop, undefined);       // fora do Top 2 e sem outras ligas → não entra
  assert.strictEqual(r.medicham.ultra, null);    // ausente na liga ultra
});

const wholeCpm = require('../fixtures/mini-cpm-whole.json');
const { expandCpm } = require('../build/transform.js');

test('expandCpm: inteiros + meios-níveis via fórmula sqrt, ascendente até maxLevel', () => {
  const list = expandCpm(wholeCpm, 10); // níveis 1..10 em passos de 0.5 → 19 entradas
  assert.strictEqual(list.length, 19);
  assert.deepStrictEqual(list[0], { level: 1, cpm: 0.094 });
  assert.strictEqual(list[2].level, 2);
  assert.strictEqual(list[2].cpm, 0.16639787);              // L2 inteiro, valor cru
  // L1.5 = sqrt((L1² + L2²)/2) = 0.13513743...
  assert.strictEqual(list[1].level, 1.5);
  assert.ok(Math.abs(list[1].cpm - 0.13513743215803847) < 1e-12);
  assert.strictEqual(list[list.length - 1].level, 10);      // último = maxLevel
});

test('expandCpm: falha alto se o array de CPM for curto demais p/ o maxLevel', () => {
  assert.throws(() => expandCpm([0.094, 0.16639787], 10), /cpMultiplier/);
});

test('buildSpecies: inclui fastMoves e chargedMoves do pool da espécie', () => {
  const gm = { pokemon: [{
    dex: 66, speciesId: 'machop', baseStats: { atk:137, def:82, hp:172 },
    types: ['fighting','none'], family: { id:'FAMILY_MACHOP' },
    fastMoves: ['KARATE_CHOP','LOW_KICK','ROCK_SMASH'],
    chargedMoves: ['BRICK_BREAK','CROSS_CHOP','LOW_SWEEP'],
    eliteMoves: ['LOW_KICK'], tags: ['shadoweligible'],
  }] };
  const out = require('../build/transform.js').buildSpecies(gm);
  assert.deepStrictEqual(out.machop.fastMoves, ['KARATE_CHOP','LOW_KICK','ROCK_SMASH']);
  assert.deepStrictEqual(out.machop.chargedMoves, ['BRICK_BREAK','CROSS_CHOP','LOW_SWEEP']);
  // não-regressão: campos antigos intactos
  assert.deepStrictEqual(out.machop.baseStats, { atk:137, def:82, hp:172 });
  assert.deepStrictEqual(out.machop.types, ['fighting']);
});

test('buildSpecies: pools ausentes viram arrays vazios (não quebra)', () => {
  const gm = { pokemon: [{ dex: 1, speciesId: 'x', baseStats:{atk:1,def:1,hp:1}, types:['grass'] }] };
  const out = require('../build/transform.js').buildSpecies(gm);
  assert.deepStrictEqual(out.x.fastMoves, []);
  assert.deepStrictEqual(out.x.chargedMoves, []);
});

const miniGmPve = require('../fixtures/mini-gm-pve.json');

test('buildMovesPve: V####_MOVE_* → {power,energy(abs),durationMs}, moveId sem _FAST', () => {
  const { buildMovesPve } = require('../build/transform.js');
  const res = buildMovesPve(miniGmPve);
  assert.deepStrictEqual(res.map.ROCK_SMASH, { power: 17, energy: 12, durationMs: 1500 }); // fast: energyDelta 12
  assert.deepStrictEqual(res.map.WRAP, { power: 60, energy: 33, durationMs: 3000 });        // charged: |−33| = 33
  assert.strictEqual(res.map.ROCK_SMASH_FAST, undefined);  // chaveado sem o sufixo _FAST
  assert.strictEqual(res.count, 2);                         // ignora a entrada não-MOVE
});

test('buildPveRanks: ranqueia por tipo, marca roles e defBulkRank', () => {
  const { buildPveRanks } = require('../build/transform.js');
  const species = {
    a_strong: { baseStats: { atk: 300, def: 120, hp: 150 }, types: ['ice'],
                fastMoves: ['ICE_SHARD'], chargedMoves: ['AVALANCHE'] },
    b_weak:   { baseStats: { atk: 120, def: 100, hp: 120 }, types: ['ice'],
                fastMoves: ['ICE_SHARD'], chargedMoves: ['AVALANCHE'] },
    wall:     { baseStats: { atk: 60,  def: 250, hp: 450 }, types: ['normal'],
                fastMoves: ['POUND'], chargedMoves: ['BODY_SLAM'] },
  };
  const movesById = {
    ICE_SHARD: { type: 'ice',    pve: { power: 12, energy: 12, durationMs: 1200 } },
    AVALANCHE: { type: 'ice',    pve: { power: 90, energy: 45, durationMs: 2700 } },
    POUND:     { type: 'normal', pve: { power: 7,  energy: 6,  durationMs: 540 } },
    BODY_SLAM: { type: 'normal', pve: { power: 50, energy: 35, durationMs: 1900 } },
  };
  const out = buildPveRanks(species, movesById);
  assert.strictEqual(out.a_strong.byType.ice.erRank, 1);
  assert.strictEqual(out.b_weak.byType.ice.erRank, 2);
  assert.strictEqual(out.a_strong.byType.ice.dpsRank, 1);
  assert.strictEqual(out.wall.defBulkRank, 1);
  assert.ok(out.a_strong.roles.includes('raid'));
  assert.ok(out.a_strong.roles.includes('pve'));
  assert.strictEqual(out.a_strong.bestType, 'ice');
  assert.deepStrictEqual(out.a_strong.bestMoveset, ['ICE_SHARD','AVALANCHE']);
});

test('buildPveRanks: espécie sem golpe PvE válido não recebe byType, mas pode entrar por bulk', () => {
  const { buildPveRanks } = require('../build/transform.js');
  const species = { onlywall: { baseStats: { atk: 10, def: 300, hp: 500 }, types: ['normal'],
                                fastMoves: ['X'], chargedMoves: ['Y'] } };
  const out = buildPveRanks(species, {});
  assert.ok(out.onlywall, 'entrou por ser candidata a defensor (defBulkRank 1)');
  assert.strictEqual(out.onlywall.defBulkRank, 1);
  assert.deepStrictEqual(out.onlywall.byType, {});
  assert.deepStrictEqual(out.onlywall.roles, []);
});

test('buildPveRanks: filtra Mega/Primal do pool e dá bônus a Sombrio', () => {
  const { buildPveRanks } = require('../build/transform.js');
  const species = {
    chomp:        { baseStats: { atk: 200, def: 120, hp: 140 }, types: ['dragon'],
                    fastMoves: ['DRAGON_TAIL'], chargedMoves: ['OUTRAGE'] },
    chomp_shadow: { baseStats: { atk: 200, def: 120, hp: 140 }, types: ['dragon'],
                    fastMoves: ['DRAGON_TAIL'], chargedMoves: ['OUTRAGE'] },
    chomp_mega:   { baseStats: { atk: 320, def: 200, hp: 140 }, types: ['dragon'],
                    fastMoves: ['DRAGON_TAIL'], chargedMoves: ['OUTRAGE'] },
    groudon_primal: { baseStats: { atk: 300, def: 200, hp: 180 }, types: ['ground'],
                    fastMoves: ['MUD_SHOT'], chargedMoves: ['EARTHQUAKE'] },
  };
  const movesById = {
    DRAGON_TAIL: { type: 'dragon', pve: { power: 13, energy: 9,  durationMs: 1100 } },
    OUTRAGE:     { type: 'dragon', pve: { power: 110, energy: 60, durationMs: 3900 } },
    MUD_SHOT:    { type: 'ground', pve: { power: 3,  energy: 9,  durationMs: 600 } },
    EARTHQUAKE:  { type: 'ground', pve: { power: 120, energy: 65, durationMs: 3600 } },
  };
  const out = buildPveRanks(species, movesById);
  assert.ok(!out.chomp_mega, 'Mega não entra no pool');
  assert.ok(!out.groudon_primal, 'Primal não entra no pool');
  assert.ok(out.chomp_shadow.byType.dragon.er > out.chomp.byType.dragon.er, 'Sombrio com bônus > base');
  assert.strictEqual(out.chomp_shadow.byType.dragon.erRank, 1, 'Sombrio ranqueia acima da base');
  assert.strictEqual(out.chomp.byType.dragon.erRank, 2);
});

test('buildMoves: guarda pvp.turns (cooldown/500) só p/ golpes rápidos', () => {
  const { buildMoves } = require('../build/transform.js');
  const gmInline = { moves: [
    { moveId: 'MUD_SHOT',  type: 'ground',   power: 3,  energy: 0,  energyGain: 9, cooldown: 1000 },
    { moveId: 'COUNTER',   type: 'fighting', power: 8,  energy: 0,  energyGain: 7, cooldown: 1000 },
    { moveId: 'BODY_SLAM', type: 'normal',   power: 60, energy: 35, energyGain: 0, cooldown: 1900 },
  ] };
  const m = buildMoves(gmInline);
  assert.strictEqual(m.MUD_SHOT.pvp.turns, 2);          // 1000 / 500
  assert.strictEqual(m.COUNTER.pvp.turns, 2);
  assert.strictEqual(m.BODY_SLAM.pvp.turns, undefined); // carregado não guarda turns
});

test('buildMovesPt: namesPt mapeia moveId → nome PT cru (com acentos, pré-normalização)', () => {
  const { namesPt } = buildMovesPt(gameMaster, i18nPt);
  assert.deepStrictEqual(namesPt, {
    ROCK_SMASH: 'Esmagamento de Pedras',
    ICE_PUNCH: 'Soco de Gelo',
  });
});
