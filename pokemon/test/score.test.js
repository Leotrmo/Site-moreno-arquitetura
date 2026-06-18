// pokemon/test/score.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const Score = require('../lib/meta/score.js');
const PokePvp = require('../lib/meta/pvp.js');
const PokePve = require('../lib/meta/pve.js');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

// --- Folhas puras ---------------------------------------------------------

test('rankDecay: rank 1 → 1, decai monotônico, rank inválido → 0', () => {
  assert.strictEqual(Score.rankDecay(1, 20), 1);
  assert.ok(Score.rankDecay(10, 20) < Score.rankDecay(5, 20));
  assert.ok(Score.rankDecay(32, 20) > 0 && Score.rankDecay(32, 20) < 0.5);
  assert.strictEqual(Score.rankDecay(null, 20), 0);
  assert.strictEqual(Score.rankDecay(0, 20), 0);
  assert.strictEqual(Score.rankDecay(undefined, 12), 0);
});

test('qualityPve: ponderada em ataque; hundo ≈ 15/x/x p/ base de ataque alta', () => {
  // Gyarados atkBase 237: hundo (iv 15) = 252/252 = 1.0; iv 0 = 237/252 ≈ 0.94.
  assert.strictEqual(Score.qualityPve(237, 15), 1);
  assert.ok(Score.qualityPve(237, 0) > 0.93);            // a "ironia": atk IV quase não muda PvE
  assert.ok(Score.qualityPve(237, 15) - Score.qualityPve(237, 0) < 0.07);
  assert.strictEqual(Score.qualityPve(null, 15), 0);     // sem base → 0
  assert.strictEqual(Score.qualityPve(0, 15), 0);
});

test('costScalar: null → 1; cresce com cada recurso; sempre ≥ 1', () => {
  assert.strictEqual(Score.costScalar(null), 1);
  assert.strictEqual(Score.costScalar({ dust: 0, candy: 0, xlCandy: 0, tm: { normal: 0, elite: 0 } }), 1);
  const base = Score.costScalar({ dust: 50000, candy: 0, xlCandy: 0, tm: { normal: 0, elite: 0 } });
  assert.ok(base > 1);
  // cada recurso a mais encarece
  assert.ok(Score.costScalar({ dust: 50000, candy: 100, xlCandy: 0, tm: { normal: 0, elite: 0 } }) > base);
  assert.ok(Score.costScalar({ dust: 50000, candy: 0, xlCandy: 50, tm: { normal: 0, elite: 0 } }) > base);
  assert.ok(Score.costScalar({ dust: 50000, candy: 0, xlCandy: 0, tm: { normal: 2, elite: 0 } }) > base);
  // Elite TM pesa mais que TM normal
  const n = Score.costScalar({ dust: 0, candy: 0, xlCandy: 0, tm: { normal: 1, elite: 0 } });
  const e = Score.costScalar({ dust: 0, candy: 0, xlCandy: 0, tm: { normal: 0, elite: 1 } });
  assert.ok(e > n);
});

test('readiness: moveset ok + nível-alvo → 1; falta moveset ou nível baixo derruba', () => {
  // pronto: tem moveset, fromLevel == toLevel
  assert.strictEqual(Score.readiness(true, { fromLevel: 40, toLevel: 40 }), 1);
  // falta moveset → cai p/ MOVESET_MISS (0.5)
  assert.strictEqual(Score.readiness(false, { fromLevel: 40, toLevel: 40 }), 0.5);
  // nível baixo: fromLevel/toLevel
  assert.ok(Math.abs(Score.readiness(true, { fromLevel: 20, toLevel: 40 }) - 0.5) < 1e-9);
  // combina: sem moveset E nível baixo
  assert.ok(Math.abs(Score.readiness(false, { fromLevel: 20, toLevel: 40 }) - 0.25) < 1e-9);
  // sem est (cost null) → fatorNível = 1
  assert.strictEqual(Score.readiness(true, null), 1);
  assert.strictEqual(Score.readiness(false, null), 0.5);
});

test('scoreColecao: [0,1]; empilha; sem flags → 0; nearPerfect não dobra com hundo', () => {
  assert.strictEqual(Score.scoreColecao({}), 0);
  const hundo = Score.scoreColecao({ isHundo: true });
  assert.ok(Math.abs(hundo - 0.90) < 1e-9);
  const shinyHundo = Score.scoreColecao({ isHundo: true, isShiny: true });
  assert.ok(shinyHundo > hundo && shinyHundo <= 1);      // empilha, mas fica ≤ 1
  // isNearPerfect é ignorado quando já é hundo (não soma a perfeição duas vezes)
  const both = Score.scoreColecao({ isHundo: true, isNearPerfect: true });
  assert.ok(Math.abs(both - hundo) < 1e-9);
  // near-perfect sozinho conta
  assert.ok(Score.scoreColecao({ isNearPerfect: true }) > 0);
  assert.strictEqual(Score.scoreColecao(null), 0);
});

// --- Integração com dados reais -------------------------------------------

function realMeta() {
  return {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    pvpRanks: require('../data/pvp_ranks.json'),
    pveRanks: require('../data/pve_ranks.json'),
    cpm: require('../data/cpm.json'),
    moves: require('../data/moves.json'),
  };
}

// Monta um mon enriquecido mínimo (o que score.js consome) com pvpMeta/pveMeta reais.
function makeMon(meta, over) {
  const e = Object.assign({
    speciesId: 'gyarados',
    ivs: { atk: 15, def: 15, sta: 15 },
    ivPct: 100,
    isShadow: true,
    moveIds: ['WATERFALL', 'HYDRO_PUMP'],   // set de raid capturado
    eliteMoves: [],
  }, over || {});
  const base = meta.speciesIndex.byId[e.speciesId].baseStats;
  const cpmAt25 = meta.cpm.find(x => x.level === 25).cpm;
  if (typeof e.cp !== 'number') e.cp = PokePvp.cpFor(base, e.ivs, cpmAt25);
  e.pvpMeta = PokePvp.evalMon(e, meta);
  e.pveMeta = PokePve.evalMon(e, meta);
  return e;
}

test('scorePvpLeague: espécie fora do meta da liga → 0', () => {
  const meta = realMeta();
  const e = makeMon(meta);
  // Gyarados Sombrio não tem entrada great → score 0.
  assert.strictEqual(Score.scorePvpLeague(e, meta, 'great'), 0);
  // master existe (rank 32) → score > 0.
  assert.ok(Score.scorePvpLeague(e, meta, 'master') > 0);
});

test('scorePve: atacante (erRank válido) → > 0; sem papel atacante → 0', () => {
  const meta = realMeta();
  const e = makeMon(meta);
  assert.ok(Score.scorePve(e, meta) > 0);
  // sem pveMeta → 0
  assert.strictEqual(Score.scorePve({ pveMeta: null }, meta), 0);
  // pveMeta só defensivo → 0
  assert.strictEqual(Score.scorePve({ pveMeta: { raid: false, pve: false, gymAtk: false, gymDef: true } }, meta), 0);
});

test('scoreMon: shape completo (pvp por liga, pve, colecao, best)', () => {
  const meta = realMeta();
  const e = makeMon(meta);
  const s = Score.scoreMon(e, meta);
  assert.ok(s && s.pvp && typeof s.pvp.great === 'number'
              && typeof s.pvp.ultra === 'number' && typeof s.pvp.master === 'number');
  assert.strictEqual(typeof s.pve, 'number');
  assert.strictEqual(typeof s.colecao, 'number');
  assert.ok(s.best && typeof s.best.objective === 'string' && typeof s.best.value === 'number');
  assert.strictEqual(Score.scoreMon(null, meta), null);
});

test('ACEITE: Shadow Gyarados hundo (set de raid) → scorePvE > scorePvP[master]', () => {
  const meta = realMeta();
  const e = makeMon(meta);          // gyarados Sombrio 15/15/15, moveIds Waterfall+Hydro Pump
  const s = Score.scoreMon(e, meta);
  assert.ok(s.pve > s.pvp.master,
    'PvE (' + s.pve.toFixed(3) + ') deveria superar PvP master (' + s.pvp.master.toFixed(3) + ')');
  // best de INVESTIMENTO (colecao fora) = PvE
  assert.strictEqual(s.best.objective, 'pve');
});

// --- Wiring em analysis.js (e2e leve; não depende de casar nome PT de golpe) ---

const { analyze } = require('../lib/analysis.js');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');

test('analyze: anexa e.scores com shape de objetivos (wiring)', () => {
  const meta = realMeta();
  const fd = { g: { mon_name: 'Gyarados', mon_number: 130, mon_cp: 2700,
                    mon_attack: 15, mon_defence: 15, mon_stamina: 15, mon_height: 6.5,
                    mon_alignment: 'SHADOW', mon_isShiny: 'NO', mon_isLucky: 'NO',
                    mon_move_1: 'Cachoeira', mon_move_2: "Jato d'Água" } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.ok(e.scores, 'e.scores deveria existir');
  assert.strictEqual(typeof e.scores.pve, 'number');
  assert.ok(e.scores.pvp && typeof e.scores.pvp.master === 'number');
  assert.ok(e.scores.best && typeof e.scores.best.objective === 'string');
});
