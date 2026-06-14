// pokemon/test/moveset_pt.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const refdata = require('../lib/refdata.js');
const { computeAction } = require('../lib/analysis.js');

test('refdata expõe MOVE_PT_OVERRIDE com nomes PT', () => {
  assert.strictEqual(refdata.MOVE_PT_OVERRIDE.CHILLING_WATER, 'Água Refrescante');
  assert.strictEqual(refdata.MOVE_PT_OVERRIDE.FUTURE_SIGHT, 'Premonição');
});

test('computeAction: golpe recomendado sem namePt usa override PT (não inglês)', () => {
  const e = {
    ivPct: 67, tags: ['pvp_great'], isShadow: false, betterCopy: null,
    moveIds: ['COUNTER'], eliteMoves: [],
    pvpMeta: {
      great:  { isMeta: true, speciesRank: 5, ivRank: 1, spPct: 1, movesetOk: false,
                moveset: ['COUNTER', 'CHILLING_WATER'] },
      ultra:  { isMeta: false }, master: { isMeta: false },
    },
    pveMeta: null,
  };
  const meta = { moves: { COUNTER: { namePt: 'Contra-ataque' } } }; // CHILLING_WATER sem namePt
  const a = computeAction(e, meta);
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /Água Refrescante/);
  assert.doesNotMatch(a.reason, /Chilling/);
});
