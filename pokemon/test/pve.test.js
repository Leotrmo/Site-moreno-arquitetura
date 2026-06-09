// pokemon/test/pve.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { dmgPerHit, effAtk } = require('../lib/meta/pve.js');

test('effAtk: (baseAtk + IV) * CPM(L40)', () => {
  assert.ok(Math.abs(effAtk({ atk: 100, def: 1, hp: 1 }) - (115 * 0.7903)) < 1e-9); // 90.8845
});

test('dmgPerHit: floor(0.5·power·(atk/DEF_REF)·stab) + 1', () => {
  // atk = 90.8845, DEF_REF 180 → atk/DEF_REF = 0.504914
  // sem STAB: floor(0.5·10·0.504914·1)+1 = floor(2.5246)+1 = 3
  assert.strictEqual(dmgPerHit(10, 90.8845, 1), 3);
  // com STAB 1.2: floor(0.5·10·0.504914·1.2)+1 = floor(3.0295)+1 = 4
  assert.strictEqual(dmgPerHit(10, 90.8845, 1.2), 4);
});

const { cycleDps } = require('../lib/meta/pve.js');

test('cycleDps: ciclo fast+charged a L40, com STAB por tipo', () => {
  const base = { atk: 100, def: 100, hp: 100 };  // effAtk = 90.8845
  const fast    = { type: 'fighting', pve: { power: 10, energy: 10, durationMs: 1000 } };
  const charged = { type: 'fighting', pve: { power: 50, energy: 50, durationMs: 2000 } };
  // Df=dmgPerHit(10,90.8845,1.2)=4 ; Dc=dmgPerHit(50,90.8845,1.2)=16
  // n=50/10=5 ; cycleDmg=5·4+16=36 ; cycleTime=5·1.0+2.0=7.0 → DPS=36/7
  const dps = cycleDps(fast, charged, base, ['fighting']);
  assert.ok(Math.abs(dps - (36 / 7)) < 1e-9);
});

test('cycleDps: 0 se o golpe rápido não gera energia (evita divisão por zero)', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  const fast    = { type: 'normal', pve: { power: 5, energy: 0, durationMs: 1000 } };
  const charged = { type: 'normal', pve: { power: 50, energy: 50, durationMs: 2000 } };
  assert.strictEqual(cycleDps(fast, charged, base, ['normal']), 0);
});

const { tdoFor, erFor } = require('../lib/meta/pve.js');

test('tdoFor: dps · HP · Def / INCOMING_K', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  const expected = 10 * (115 * 0.7903) * (115 * 0.7903) / 800;
  assert.ok(Math.abs(tdoFor(10, base) - expected) < 1e-6);
});

test('erFor: dps^0.7 · tdo^0.3 (pondera DPS sobre TDO)', () => {
  assert.ok(Math.abs(erFor(10, 100) - (Math.pow(10, 0.7) * Math.pow(100, 0.3))) < 1e-9);
});

const { bestMoveset } = require('../lib/meta/pve.js');

test('bestMoveset: melhor combo geral + por tipo (tipo = do carregado)', () => {
  const species = {
    baseStats: { atk: 200, def: 100, hp: 100 }, types: ['ice'],
    fastMoves: ['ICE_SHARD'], chargedMoves: ['AVALANCHE','BODY_SLAM'],
  };
  const movesById = {
    ICE_SHARD: { type: 'ice',    kind: 'fast',   pve: { power: 12, energy: 12, durationMs: 1200 } },
    AVALANCHE: { type: 'ice',    kind: 'charge', pve: { power: 90, energy: 45, durationMs: 2700 } },
    BODY_SLAM: { type: 'normal', kind: 'charge', pve: { power: 50, energy: 35, durationMs: 1900 } },
  };
  const r = bestMoveset(species, movesById);
  assert.ok(r.best, 'tem melhor combo');
  assert.strictEqual(r.byType.ice.moveset[0], 'ICE_SHARD');
  assert.strictEqual(r.byType.ice.moveset[1], 'AVALANCHE');
  assert.ok(r.byType.normal, 'tem entrada do tipo normal (Body Slam)');
  assert.ok(r.byType.ice.er > r.byType.normal.er);
  assert.strictEqual(r.best.type, 'ice');
});

test('bestMoveset: sem golpe com dados PvE → null', () => {
  const species = { baseStats: { atk: 100, def: 100, hp: 100 }, types: ['grass'],
                    fastMoves: ['VINE_WHIP'], chargedMoves: ['SLUDGE_BOMB'] };
  assert.strictEqual(bestMoveset(species, {}).best, null);
});

const { defBulk, evalMon, pveTags } = require('../lib/meta/pve.js');

test('defBulk: (baseDef+ivDef)·(baseHP+ivSta)', () => {
  assert.strictEqual(defBulk({ atk: 1, def: 100, hp: 200 }, { atk: 0, def: 15, sta: 15 }), 115 * 215);
});

function metaPve() {
  return {
    speciesIndex: { byId: {
      raider: { baseStats: { atk: 250, def: 120, hp: 150 } },
      wall:   { baseStats: { atk: 60,  def: 250, hp: 450 } },
    } },
    pveRanks: {
      raider: { bestMoveset: ['ICE_SHARD','AVALANCHE'], bestType: 'ice', roles: ['raid','pve','gym_atk'],
                byType: { ice: { dps: 18, er: 50, dpsRank: 2, erRank: 3, moveset: ['ICE_SHARD','AVALANCHE'] } },
                defBulkRank: 300 },
      wall:   { bestMoveset: ['POUND','BODY_SLAM'], bestType: 'normal', roles: [],
                byType: {}, defBulkRank: 2 },
    },
  };
}

test('evalMon: sem speciesId ou sem pveRanks → null', () => {
  assert.strictEqual(evalMon({ speciesId: null, ivs: {}, moveIds: [] }, metaPve()), null);
  assert.strictEqual(evalMon({ speciesId: 'raider', ivs: {}, moveIds: [] }, { speciesIndex: metaPve().speciesIndex }), null);
});

test('evalMon: atacante de raid com moveset recomendado → raid/pve/gymAtk + movesetOk', () => {
  const r = evalMon({ speciesId: 'raider', ivs: { atk: 15, def: 10, sta: 10 },
                      moveIds: ['ICE_SHARD','AVALANCHE'] }, metaPve());
  assert.strictEqual(r.raid, true);
  assert.strictEqual(r.pve, true);
  assert.strictEqual(r.gymAtk, true);
  assert.strictEqual(r.gymDef, false);          // não é candidata a defensor (defBulkRank 300)
  assert.strictEqual(r.movesetOk, true);
  assert.strictEqual(r.bestType, 'ice');
});

test('evalMon: muralha bulk-candidata + IV def/HP altos → gymDef true', () => {
  const hi = evalMon({ speciesId: 'wall', ivs: { atk: 0, def: 15, sta: 14 }, moveIds: [] }, metaPve());
  assert.strictEqual(hi.gymDef, true);          // defBulkRank 2 <= 50 E def 15>=13 E sta 14>=13
  const lo = evalMon({ speciesId: 'wall', ivs: { atk: 0, def: 5, sta: 5 }, moveIds: [] }, metaPve());
  assert.strictEqual(lo.gymDef, false);         // IVs def/HP baixos
});

test('pveTags: deriva raid/pve/gym_atk/gym_def', () => {
  assert.deepStrictEqual(
    pveTags({ raid: true, pve: true, gymAtk: false, gymDef: true }).sort(),
    ['gym_def', 'pve', 'raid']);
  assert.deepStrictEqual(pveTags(null), []);
});

const { rocketSpam, ROCKET_SPAM_TURNS } = require('../lib/meta/pve.js');

// movesById sintético. pvp.energy do rápido = energia por ATIVAÇÃO; do carregado = custo.
// "ativaçõesParaCarregar" = custo do carregado mais barato / energia do rápido mais forte.
const rkMoves = {
  STRONG_FAST: { type: 'ground', kind: 'fast',   pvp: { power: 3,  energy: 12, turns: 1 } },
  WEAK_FAST:   { type: 'normal', kind: 'fast',   pvp: { power: 5,  energy: 3,  turns: 1 } },
  CHEAP_CHG:   { type: 'rock',   kind: 'charge', pvp: { power: 50, energy: 35 } },
  PRICEY_CHG:  { type: 'rock',   kind: 'charge', pvp: { power: 110,energy: 55 } },
};

test('rocketSpam: rápido forte + carregado barato → true (35/12 = 2.92 <= 4)', () => {
  assert.strictEqual(rocketSpam(['STRONG_FAST', 'CHEAP_CHG'], rkMoves), true);
});

test('rocketSpam: rápido fraco + carregado caro → false (55/3 = 18.3 > 4)', () => {
  assert.strictEqual(rocketSpam(['WEAK_FAST', 'PRICEY_CHG'], rkMoves), false);
});

test('rocketSpam: usa o carregado MAIS BARATO e o rápido MAIS FORTE disponíveis', () => {
  // tem os dois carregados; o barato (35) manda → 35/12 = 2.92 <= 4 → true
  assert.strictEqual(rocketSpam(['STRONG_FAST', 'CHEAP_CHG', 'PRICEY_CHG'], rkMoves), true);
});

test('rocketSpam: degrada gracioso (sem moves, sem movesById, só rápido, id desconhecido)', () => {
  assert.strictEqual(rocketSpam([], rkMoves), false);
  assert.strictEqual(rocketSpam(['STRONG_FAST'], null), false);
  assert.strictEqual(rocketSpam(['STRONG_FAST'], rkMoves), false);     // sem carregado
  assert.strictEqual(rocketSpam(['CHEAP_CHG'], rkMoves), false);       // sem rápido
  assert.strictEqual(rocketSpam(['ZZZ_UNKNOWN'], rkMoves), false);     // id fora do movesById
});

test('ROCKET_SPAM_TURNS é o limiar configurável (calibrado p/ 10)', () => {
  assert.strictEqual(ROCKET_SPAM_TURNS, 10);
});

const { SHADOW_ATK_MULT } = require('../lib/meta/pve.js');

test('cycleDps: Sombrio aplica 1.2x no ataque (DPS maior)', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  const fast    = { type: 'fighting', pve: { power: 10, energy: 10, durationMs: 1000 } };
  const charged = { type: 'fighting', pve: { power: 50, energy: 50, durationMs: 2000 } };
  const normal = cycleDps(fast, charged, base, ['fighting']);
  const shadow = cycleDps(fast, charged, base, ['fighting'], true);
  assert.ok(shadow > normal, 'Sombrio tem DPS maior que a base');
});

test('tdoFor: Sombrio reduz o bulk (toma 1.2x de dano)', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  assert.ok(tdoFor(10, base, true) < tdoFor(10, base, false), 'TDO Sombrio < TDO base');
});

test('bestMoveset: Sombrio supera a base de mesmos stats (ER maior)', () => {
  const sp = { baseStats: { atk: 200, def: 120, hp: 140 }, types: ['ice'],
               fastMoves: ['ICE_SHARD'], chargedMoves: ['AVALANCHE'] };
  const movesById = {
    ICE_SHARD: { type: 'ice', pve: { power: 12, energy: 12, durationMs: 1200 } },
    AVALANCHE: { type: 'ice', pve: { power: 90, energy: 45, durationMs: 2700 } },
  };
  const baseBm   = bestMoveset(sp, movesById, false);
  const shadowBm = bestMoveset(sp, movesById, true);
  assert.ok(shadowBm.best.er > baseBm.best.er, 'ER Sombrio > ER base');
});

test('SHADOW_ATK_MULT exportado = 1.2', () => {
  assert.strictEqual(SHADOW_ATK_MULT, 1.2);
});

const { evalMon: evalMonAlias } = require('../lib/meta/pve.js');

test('evalMon: mon Sombrio usa a entrada _shadow quando existe', () => {
  const meta = {
    pveRanks: {
      gengar:        { roles: [],            bestType: 'ghost', bestMoveset: ['SHADOW_CLAW','SHADOW_BALL'], byType: {}, defBulkRank: 900 },
      gengar_shadow: { roles: ['raid','pve'], bestType: 'ghost', bestMoveset: ['SHADOW_CLAW','SHADOW_BALL'], byType: {}, defBulkRank: 900 },
    },
    speciesIndex: { byId: { gengar: { baseStats: { atk: 1, def: 1, hp: 1 } }, gengar_shadow: { baseStats: { atk: 1, def: 1, hp: 1 } } } },
  };
  const e = { speciesId: 'gengar', isShadow: true, ivs: { atk: 15, def: 15, sta: 15 }, moveIds: [] };
  const r = evalMonAlias(e, meta);
  assert.strictEqual(r.raid, true, 'pegou a role raid da entrada _shadow');
});

test('evalMon: mon NÃO Sombrio ignora a entrada _shadow (usa a base)', () => {
  const meta = {
    pveRanks: {
      gengar:        { roles: [],            bestType: 'ghost', bestMoveset: null, byType: {}, defBulkRank: 900 },
      gengar_shadow: { roles: ['raid','pve'], bestType: 'ghost', bestMoveset: null, byType: {}, defBulkRank: 900 },
    },
    speciesIndex: { byId: { gengar: { baseStats: { atk: 1, def: 1, hp: 1 } } } },
  };
  const e = { speciesId: 'gengar', isShadow: false, ivs: { atk: 15, def: 15, sta: 15 }, moveIds: [] };
  const r = evalMonAlias(e, meta);
  assert.strictEqual(r.raid, false, 'usou a base, sem role');
});

test('evalMon: expõe defBulkRank no retorno', () => {
  const meta = {
    pveRanks: { blissey: { roles: [], bestType: null, bestMoveset: null, byType: {}, defBulkRank: 2 } },
    speciesIndex: { byId: { blissey: { baseStats: { atk: 60, def: 80, hp: 510 } } } },
  };
  const e = { speciesId: 'blissey', isShadow: false, ivs: { atk: 15, def: 15, sta: 15 }, moveIds: [] };
  assert.strictEqual(evalMonAlias(e, meta).defBulkRank, 2);
});

test('rocketSpam: turnos do golpe rápido contam (2 turnos sobe o turnsToCharge)', () => {
  // Mesmo rápido (energia 12) e carregado (70): a versão de 2 turnos passa do limiar (10), a de 1 turno não.
  const slow2 = {
    F: { type: 'ground', kind: 'fast',   pvp: { power: 3, energy: 12, turns: 2 } },  // 70/(12/2)=11.67 > 10
    C: { type: 'rock',   kind: 'charge', pvp: { power: 90, energy: 70 } },
  };
  const fast1 = {
    F: { type: 'ground', kind: 'fast',   pvp: { power: 3, energy: 12, turns: 1 } },  // 70/12=5.83 <= 10
    C: { type: 'rock',   kind: 'charge', pvp: { power: 90, energy: 70 } },
  };
  assert.strictEqual(rocketSpam(['F', 'C'], slow2), false);
  assert.strictEqual(rocketSpam(['F', 'C'], fast1), true);
});

test('rocketSpam: sem duração (turns ausente) usa ativações (fallback gracioso)', () => {
  const noT = {
    F: { type: 'x', kind: 'fast',   pvp: { power: 3, energy: 12 } },
    C: { type: 'y', kind: 'charge', pvp: { power: 50, energy: 35 } },
  };
  assert.strictEqual(rocketSpam(['F', 'C'], noT), true);   // 35/12 = 2.92 <= 4
});
