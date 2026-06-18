// pokemon/test/category.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { categorize, analyze } = require('../lib/analysis.js');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

// scores sintéticos na escala REAL (pve/pvp single-digit; colecao 0–100).
function scores(o) {
  o = o || {};
  return {
    pvp: { great: o.great || 0, ultra: o.ultra || 0, master: o.master || 0 },
    pve: o.pve || 0,
    colecao: o.colecao || 0,
    best: { objective: o.bestObj || 'pve', value: o.bestVal || 0 },
  };
}
function mon(over) { return Object.assign({ verdict: 'MANTER', scores: scores() }, over); }

// --- Eficiência (5 categorias) ---
test('Eficiência: pve≥T e pvp≥T → invest_both', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ pve: 5, great: 5 }) }), 'eficiencia').key, 'invest_both');
});
test('Eficiência: pve≥T e pvp<T → invest_pve', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ pve: 5, great: 1 }) }), 'eficiencia').key, 'invest_pve');
});
test('Eficiência: pvp≥T e pve<T → invest_pvp', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ pve: 1, ultra: 5 }) }), 'eficiencia').key, 'invest_pvp');
});
test('Eficiência: nada cruza T → keep', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ pve: 1, great: 1 }) }), 'eficiencia').key, 'keep');
});
test('lens default (sem arg) = eficiencia', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ pve: 5 }) })).key, 'invest_pve');
});

// --- Invariante conservador ---
test('verdict TRANSFERIR → transfer mesmo com scores altos', () => {
  const e = mon({ verdict: 'TRANSFERIR', scores: scores({ pve: 9, ultra: 26, colecao: 95 }) });
  assert.strictEqual(categorize(e, 'eficiencia').key, 'transfer');
  assert.strictEqual(categorize(e, 'pvp').key, 'transfer');
  assert.strictEqual(categorize(e, 'colecao').key, 'transfer');
});
test('mon protegido (não-TRANSFERIR) nunca vira transfer/feed em lente nenhuma', () => {
  const e = mon({ verdict: 'MANTER', scores: scores({ colecao: 85 }) });
  for (const lens of ['eficiencia', 'pvp', 'colecao', 'xp']) {
    const k = categorize(e, lens).key;
    assert.ok(k !== 'transfer' && k !== 'feed', 'lente ' + lens + ' deu ' + k);
  }
});

// --- Reenquadramento por lente ---
test('lente PvP: pvpBest≥T → invest; senão keep', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ master: 5 }) }), 'pvp').key, 'invest');
  assert.strictEqual(categorize(mon({ scores: scores({ master: 1 }) }), 'pvp').key, 'keep');
});
test('lente Coleção: colecao≥T_COL → trophy; Lucky simples → keep', () => {
  assert.strictEqual(categorize(mon({ scores: scores({ colecao: 60 }) }), 'colecao').key, 'trophy');
  assert.strictEqual(categorize(mon({ scores: scores({ colecao: 40 }) }), 'colecao').key, 'keep');
});
test('lente XP: verdict TRANSFERIR → feed; senão keep', () => {
  assert.strictEqual(categorize(mon({ verdict: 'TRANSFERIR' }), 'xp').key, 'feed');
  assert.strictEqual(categorize(mon({ verdict: 'MANTER' }), 'xp').key, 'keep');
});

// --- Degradação (sem scores) ---
test('sem scores: rótulo por veredito, sem lançar', () => {
  assert.strictEqual(categorize({ verdict: 'INVESTIR', scores: null }, 'eficiencia').key, 'invest');
  assert.strictEqual(categorize({ verdict: 'MANTER', scores: null }, 'eficiencia').key, 'keep');
  assert.strictEqual(categorize({ verdict: 'TRANSFERIR', scores: null }, 'eficiencia').key, 'transfer');
  assert.strictEqual(categorize({ verdict: 'TRANSFERIR', scores: null }, 'xp').key, 'feed');
});

// --- Aceite ponta-a-ponta (dados reais) ---
function realMeta() {
  return {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: require('../data/moves_pt.json'),
    pvpRanks: require('../data/pvp_ranks.json'),
    pveRanks: require('../data/pve_ranks.json'),
    cpm: require('../data/cpm.json'),
    moves: require('../data/moves.json'),
  };
}
test('ACEITE: Shadow Gyarados hundo (set de raid) → Investir só PvE; reenquadra por lente', () => {
  const meta = realMeta();
  const fd = { g: { mon_name: 'Gyarados', mon_number: 130, mon_cp: 2700,
    mon_attack: 15, mon_defence: 15, mon_stamina: 15, mon_height: 6.5,
    mon_alignment: 'SHADOW', mon_isShiny: 'NO', mon_isLucky: 'NO',
    mon_move_1: 'Cachoeira', mon_move_2: "Jato d'Água" } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.category.key, 'invest_pve');            // e.category = eficiencia (default)
  assert.strictEqual(categorize(e, 'eficiencia').key, 'invest_pve');
  assert.strictEqual(categorize(e, 'pvp').key, 'keep');        // pvp fraco (0.75 < 2)
  assert.strictEqual(categorize(e, 'colecao').key, 'trophy');  // hundo+sombrio (colecao 93)
});
