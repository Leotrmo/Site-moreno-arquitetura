// pokemon/test/verdict.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze, computeAction } = require('../lib/analysis.js');

function verdictOf(fileData, id) {
  const list = analyze(fileData, getPokemonSize, refdata);
  return list.find(e => e.id === id);
}

test('hundo → INVESTIR', () => {
  const fd = { h: { mon_name:'Slowking', mon_number:199, mon_cp:1417, mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:2.0, mon_isShiny:'NO', mon_isLucky:'NO' } };
  assert.strictEqual(verdictOf(fd,'h').verdict, 'INVESTIR');
});

test('shiny com IV baixo → MANTER (nunca transferir)', () => {
  const fd = {
    s: { mon_name:'Deino', mon_number:633, mon_cp:329, mon_attack:9, mon_defence:0, mon_stamina:7, mon_height:0.8, mon_isShiny:'YES', mon_isLucky:'NO' }, // 36% shiny
    d: { mon_name:'Deino', mon_number:633, mon_cp:67,  mon_attack:0, mon_defence:8, mon_stamina:3, mon_height:0.8, mon_isShiny:'NO',  mon_isLucky:'NO' }, // 24% comum
  };
  assert.strictEqual(verdictOf(fd,'s').verdict, 'MANTER');
  assert.match(verdictOf(fd,'s').reason, /[Ss]hiny/);
});

test('duplicata pior, IV<80, nada especial → TRANSFERIR', () => {
  const fd = {
    best:  { mon_name:'Pidgey', mon_number:16, mon_cp:300, mon_attack:14, mon_defence:14, mon_stamina:14, mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' }, // 93%
    trash: { mon_name:'Pidgey', mon_number:16, mon_cp:80,  mon_attack:2,  mon_defence:5,  mon_stamina:7,  mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' }, // 31%
  };
  assert.strictEqual(verdictOf(fd,'trash').verdict, 'TRANSFERIR');
  assert.strictEqual(verdictOf(fd,'best').verdict, 'INVESTIR'); // melhor cópia, IV>=90
});

test('única cópia ruim → MANTER (guarda 1 de cada)', () => {
  const fd = { only: { mon_name:'Bidoof', mon_number:399, mon_cp:90, mon_attack:3, mon_defence:4, mon_stamina:5, mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } }; // 27%
  assert.strictEqual(verdictOf(fd,'only').verdict, 'MANTER');
  assert.match(verdictOf(fd,'only').reason, /[Úú]nica/);
});

test('sombrio com IV baixo → MANTER (protegido)', () => {
  const fd = {
    sh:  { mon_name:'Grimer', mon_number:88, mon_form:'GRIMER_ALOLA', mon_cp:300, mon_attack:2, mon_defence:2, mon_stamina:2, mon_height:0.8, mon_alignment:'SHADOW', mon_isShiny:'NO', mon_isLucky:'NO' }, // 13%
    nm:  { mon_name:'Grimer', mon_number:88, mon_form:'GRIMER_ALOLA', mon_cp:900, mon_attack:14,mon_defence:12,mon_stamina:15, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOf(fd,'sh').verdict, 'MANTER');
});

test('XXL protege; XL não impede transferir', () => {
  // Wailord 321 base 14.5m. height grande → XXL ; pequeno → normal.
  const fd = {
    xxl:  { mon_name:'Wailmer', mon_number:320, mon_cp:100, mon_attack:1, mon_defence:1, mon_stamina:1, mon_height:9.9, mon_isShiny:'NO', mon_isLucky:'NO' }, // base 2.0 → 4.95x = XXL
    best: { mon_name:'Wailmer', mon_number:320, mon_cp:900, mon_attack:14,mon_defence:14,mon_stamina:14, mon_height:2.0, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOf(fd,'xxl').verdict, 'MANTER'); // protegido por XXL apesar de IV baixo
});

function verdictOfFull(fileData, id) {
  const list = analyze(fileData, getPokemonSize, refdata, getPokemonSizeScalar);
  return list.find(e => e.id === id);
}

test('XS comfort (scalar 0.63) protege duplicata pior', () => {
  // Xatu 1 XS comfort vs Xatu 2 normal com IV maior
  const fd = {
    a: { mon_name:'Xatu', mon_number:178, mon_cp:909,  mon_attack:13, mon_defence:11, mon_stamina:12, mon_height:0.95, mon_isShiny:'NO', mon_isLucky:'NO' }, // XS comfort
    b: { mon_name:'Xatu', mon_number:178, mon_cp:1500, mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:1.5,  mon_isShiny:'NO', mon_isLucky:'NO' }, // 100%
  };
  // a tem IV menor mas é XS comfort → MANTER
  assert.strictEqual(verdictOfFull(fd,'a').verdict, 'MANTER');
  assert.match(verdictOfFull(fd,'a').reason, /XS/);
});

test('XL comfort protege duplicata pior', () => {
  const fd = {
    big:  { mon_name:'Machop', mon_number:66, mon_cp:100, mon_attack:0, mon_defence:0, mon_stamina:0, mon_height:1.2, mon_isShiny:'NO', mon_isLucky:'NO' }, // scalar 1.5 = XL comfort
    best: { mon_name:'Machop', mon_number:66, mon_cp:500, mon_attack:14,mon_defence:14,mon_stamina:14, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOfFull(fd,'big').verdict, 'MANTER');
  assert.match(verdictOfFull(fd,'big').reason, /XL/);
});

test('XS fronteira (scalar 0.78) NÃO protege', () => {
  // Xatu height 1.17 → scalar 0.78 → XS, mas fora do comfort
  const fd = {
    edge: { mon_name:'Xatu', mon_number:178, mon_cp:1482, mon_attack:13, mon_defence:14, mon_stamina:8, mon_height:1.17, mon_isShiny:'NO', mon_isLucky:'NO' }, // 77.8%
    best: { mon_name:'Xatu', mon_number:178, mon_cp:1500, mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:1.5,  mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOfFull(fd,'edge').verdict, 'TRANSFERIR');
});

test('mon_move_3 (2º carregado) protege duplicata pior', () => {
  const fd = {
    inv:  { mon_name:'Pidgey', mon_number:16, mon_cp:80,  mon_attack:0, mon_defence:0, mon_stamina:0, mon_height:0.3, mon_move_1:'Tackle', mon_move_2:'Quick Attack', mon_move_3:'Air Cutter', mon_isShiny:'NO', mon_isLucky:'NO' },
    best: { mon_name:'Pidgey', mon_number:16, mon_cp:500, mon_attack:14,mon_defence:14,mon_stamina:14, mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOfFull(fd,'inv').verdict, 'MANTER');
  assert.match(verdictOfFull(fd,'inv').reason, /2º|investido/i);
});

test('Trade evo protege duplicata pior', () => {
  // Machoke #67 está em TRADE_EVO
  const fd = {
    te:   { mon_name:'Machoke', mon_number:67, mon_cp:80,  mon_attack:0, mon_defence:0, mon_stamina:0, mon_height:1.5, mon_isShiny:'NO', mon_isLucky:'NO' },
    best: { mon_name:'Machoke', mon_number:67, mon_cp:900, mon_attack:14,mon_defence:14,mon_stamina:14, mon_height:1.5, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOfFull(fd,'te').verdict, 'MANTER');
  assert.match(verdictOfFull(fd,'te').reason, /[Tt]rade|troca/);
});

test('Regional protege duplicata pior', () => {
  // Tauros #128 está em REGIONAL
  const fd = {
    rg:   { mon_name:'Tauros', mon_number:128, mon_cp:80,  mon_attack:0, mon_defence:0, mon_stamina:0, mon_height:1.4, mon_isShiny:'NO', mon_isLucky:'NO' },
    best: { mon_name:'Tauros', mon_number:128, mon_cp:900, mon_attack:14,mon_defence:14,mon_stamina:14, mon_height:1.4, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  assert.strictEqual(verdictOfFull(fd,'rg').verdict, 'MANTER');
  assert.match(verdictOfFull(fd,'rg').reason, /[Rr]egional/);
});

test('TRANSFERIR mostra mensagem clara apontando para o melhor', () => {
  const fd = {
    best:  { mon_name:'Pidgey', mon_number:16, mon_cp:300, mon_attack:14, mon_defence:14, mon_stamina:14, mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' },
    trash: { mon_name:'Pidgey', mon_number:16, mon_cp:80,  mon_attack:2,  mon_defence:5,  mon_stamina:7,  mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const t = verdictOfFull(fd,'trash');
  assert.strictEqual(t.verdict, 'TRANSFERIR');
  assert.match(t.reason, /Você já tem um Pidgey melhor/);
});

test('CASO PIVÔ: Xatu XS (80% IV) é mantido; Xatu normal (77.8%) é transferido', () => {
  // Reproduz exatamente o caso das screenshots:
  // Xatu 1: PC 909, IV 80% (13/11/12), altura 0.95m → XS comfort
  // Xatu 2: PC 1482, IV 77.8% (13/14/8), altura 1.17m → XS fronteira (não comfort)
  const fd = {
    xatu_xs:     { mon_name:'Xatu', mon_number:178, mon_cp:909,  mon_attack:13, mon_defence:11, mon_stamina:12, mon_height:0.95, mon_isShiny:'NO', mon_isLucky:'NO' },
    xatu_normal: { mon_name:'Xatu', mon_number:178, mon_cp:1482, mon_attack:13, mon_defence:14, mon_stamina:8,  mon_height:1.17, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar);
  const xs = list.find(e => e.id === 'xatu_xs');
  const nm = list.find(e => e.id === 'xatu_normal');

  // Xatu 1 (XS) → MANTER, protegido por XS comfort
  assert.strictEqual(xs.verdict, 'MANTER');
  assert.match(xs.reason, /XS/);
  assert.strictEqual(xs.isXSComfort, true);

  // Xatu 2 (normal) → TRANSFERIR com razão clara apontando o melhor
  assert.strictEqual(nm.verdict, 'TRANSFERIR');
  assert.match(nm.reason, /Você já tem um Xatu melhor/);
  // betterCopy aponta pro xatu_xs
  assert.strictEqual(nm.betterCopy && nm.betterCopy.id, 'xatu_xs');
});

// ---------------------------------------------------------------------------
// Fase 1 — computeAction (Fortalecer / Ensinar-TM)
// ---------------------------------------------------------------------------

function pvpMon(over) {
  return Object.assign({
    ivPct: 67, tags: ['pvp_great'],
    pvpMeta: {
      great:  { isMeta: true, speciesRank: 13, ivRank: 1, spPct: 1, movesetOk: true },
      ultra:  { isMeta: false, speciesRank: null, ivRank: 999, spPct: 0.5, movesetOk: false },
      master: { isMeta: false, speciesRank: null, ivRank: 999, spPct: 0.5, movesetOk: false },
    },
  }, over || {});
}

test('computeAction: cópia boa + moveset ok → FORTALECER (Liga Grande)', () => {
  const a = computeAction(pvpMon());
  assert.strictEqual(a.kind, 'FORTALECER');
  assert.strictEqual(a.league, 'great');
  assert.match(a.reason, /Fortalecer/);
  assert.match(a.reason, /Grande/);
});

test('computeAction: cópia boa + moveset ruim → ENSINAR_TM', () => {
  const a = computeAction(pvpMon({
    pvpMeta: {
      great:  { isMeta: true, speciesRank: 13, ivRank: 1, spPct: 1, movesetOk: false },
      ultra:  { isMeta: false, speciesRank: null, ivRank: 999, spPct: 0.5, movesetOk: false },
      master: { isMeta: false, speciesRank: null, ivRank: 999, spPct: 0.5, movesetOk: false },
    },
  }));
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /Ensinar|TM/);
});

test('computeAction: sem tag pvp_* → null', () => {
  assert.strictEqual(computeAction({ ivPct: 50, tags: [], pvpMeta: null }), null);
});

test('analyze: mon FORTALECER recebe veredito INVESTIR e e.action', () => {
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO', mon_move_1:'Bolha', mon_move_2:'Raio Congelante', mon_move_3:'Jogo Duro' } };
  const meta = (function () {
    const { buildSpeciesIndex } = require('../lib/meta/match.js');
    return {
      speciesIndex: buildSpeciesIndex(require('../data/species.json')),
      movesPt: { 'bolha':'BUBBLE', 'raio congelante':'ICE_BEAM', 'jogo duro':'PLAY_ROUGH' },
      pvpRanks: require('../data/pvp_ranks.json'),
      cpm: require('../data/cpm.json'),
    };
  })();
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.ok(e.action && e.action.kind === 'FORTALECER');
  assert.strictEqual(e.verdict, 'INVESTIR');
});

// ---------------------------------------------------------------------------
// Fase 2 — computeAction: Fortalecer/Ensinar-TM para atacantes de Raid (PvE)
// ---------------------------------------------------------------------------

function pveRaider(over) {
  return Object.assign({
    ivPct: 80, tags: ['raid','pve'], pvpMeta: null,
    pveMeta: { raid: true, pve: true, gymAtk: false, gymDef: false, bestType: 'ice',
               bestMoveset: ['ICE_SHARD','AVALANCHE'], byType: { ice: { dps: 18, er: 50, dpsRank: 2, erRank: 3 } },
               movesetOk: true },
  }, over || {});
}

test('computeAction: atacante de raid + moveset ok → FORTALECER (PvE)', () => {
  const a = computeAction(pveRaider());
  assert.strictEqual(a.kind, 'FORTALECER');
  assert.strictEqual(a.role, 'raid');
  assert.match(a.reason, /Fortalecer/);
  assert.match(a.reason, /raid|Raid|Gelo|ice/i);
});

test('computeAction: atacante de raid + moveset ruim → ENSINAR_TM (PvE)', () => {
  const a = computeAction(pveRaider({ pveMeta: Object.assign(pveRaider().pveMeta, { movesetOk: false }) }));
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /Ensinar|TM/);
});

test('computeAction: PvP tem prioridade sobre PvE', () => {
  const e = pveRaider({ tags: ['pvp_great','raid'],
    pvpMeta: { great:{isMeta:true,speciesRank:5,ivRank:1,spPct:1,movesetOk:true},
               ultra:{isMeta:false}, master:{isMeta:false} } });
  const a = computeAction(e);
  assert.strictEqual(a.league, 'great');   // ramo PvP vence
});

test('computeAction: só pve/gym_def (sem raid/gym_atk) → null (não força INVESTIR)', () => {
  assert.strictEqual(computeAction({ ivPct: 50, tags: ['pve'], pvpMeta: null,
    pveMeta: { raid: false, pve: true, gymAtk: false, gymDef: false, movesetOk: false } }), null);
});

// ---------------------------------------------------------------------------
// Fase 3 — AGUARDAR_ROCKET (Sombrio meta com Frustração)
// ---------------------------------------------------------------------------

function shadowFrustMon(over) {
  return Object.assign({
    isShadow: true, isShiny: false, ivPct: 90, betterCopy: null,
    moveIds: ['COUNTER', 'FRUSTRATION'], eliteMoves: [],
    tags: ['pvp_great'],
    pvpMeta: { great:  { isMeta: true, speciesRank: 5, ivRank: 1, spPct: 1, movesetOk: false, moveset: ['COUNTER','CLOSE_COMBAT'] },
               ultra:  { isMeta: false, moveset: null },
               master: { isMeta: false, moveset: null } },
    pveMeta: null,
  }, over || {});
}

test('computeAction: Sombrio meta com Frustração → AGUARDAR_ROCKET (pré-empta tudo)', () => {
  const a = computeAction(shadowFrustMon());
  assert.strictEqual(a.kind, 'AGUARDAR_ROCKET');
  assert.match(a.reason, /Rocket|Frustra/i);
});

test('computeAction: Sombrio meta SEM Frustração não vira AGUARDAR_ROCKET', () => {
  const a = computeAction(shadowFrustMon({ moveIds: ['COUNTER', 'CLOSE_COMBAT'] }));
  assert.notStrictEqual(a && a.kind, 'AGUARDAR_ROCKET');
});

test('computeAction: NÃO-Sombrio com Frustração no moveId não vira AGUARDAR_ROCKET', () => {
  const a = computeAction(shadowFrustMon({ isShadow: false }));
  assert.notStrictEqual(a && a.kind, 'AGUARDAR_ROCKET');
});

// ---------------------------------------------------------------------------
// Fase 3 — AGUARDAR_EVENTO (moveset ótimo exige golpe legado)
// ---------------------------------------------------------------------------

test('computeAction: PvP, falta golpe recomendado que é legado → AGUARDAR_EVENTO', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 95, betterCopy: null,
    moveIds: ['COUNTER'],                 // tem o rápido, falta o carregado
    eliteMoves: ['CLOSE_COMBAT'],         // o carregado recomendado é legado
    tags: ['pvp_great'],
    pvpMeta: { great:  { isMeta: true, speciesRank: 5, ivRank: 1, spPct: 1, movesetOk: false,
                         moveset: ['COUNTER', 'CLOSE_COMBAT'] },
               ultra:  { isMeta: false, moveset: null }, master: { isMeta: false, moveset: null } },
    pveMeta: null,
  };
  const a = computeAction(e);
  assert.strictEqual(a.kind, 'AGUARDAR_EVENTO');
  assert.match(a.reason, /legado|Evento|evento/);
});

test('computeAction: PvP, falta golpe recomendado que é TM normal → ENSINAR_TM (não evento)', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 95, betterCopy: null,
    moveIds: ['COUNTER'], eliteMoves: [],   // nada legado
    tags: ['pvp_great'],
    pvpMeta: { great:  { isMeta: true, speciesRank: 5, ivRank: 1, spPct: 1, movesetOk: false,
                         moveset: ['COUNTER', 'CLOSE_COMBAT'] },
               ultra:  { isMeta: false, moveset: null }, master: { isMeta: false, moveset: null } },
    pveMeta: null,
  };
  assert.strictEqual(computeAction(e).kind, 'ENSINAR_TM');
});

test('computeAction: PvE raid, bestMoveset exige golpe legado que falta → AGUARDAR_EVENTO', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 90, betterCopy: null,
    moveIds: ['DRAGON_TAIL'], eliteMoves: ['OUTRAGE'],
    tags: ['raid','pve'], pvpMeta: null,
    pveMeta: { raid: true, pve: true, gymAtk: false, gymDef: false, bestType: 'dragon',
               bestMoveset: ['DRAGON_TAIL','OUTRAGE'], movesetOk: false,
               byType: { dragon: { dps: 18, er: 50, dpsRank: 2, erRank: 3 } } },
  };
  assert.strictEqual(computeAction(e).kind, 'AGUARDAR_EVENTO');
});

// ---------------------------------------------------------------------------
// Fase 3 — TROCAR (reroll de IV meta / shiny duplicado p/ Lucky)
// ---------------------------------------------------------------------------

test('computeAction: duplicata pior meta com IV baixo → TROCAR (reroll)', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 60, betterCopy: { id: 'best' },
    moveIds: ['BUBBLE'], eliteMoves: [], tags: ['pve'], pvpMeta: null,
    pveMeta: { raid: false, pve: true, gymAtk: false, gymDef: false, movesetOk: false, bestMoveset: null, byType: {} },
  };
  const a = computeAction(e);
  assert.strictEqual(a.kind, 'TROCAR');
  assert.match(a.reason, /reroll|IV/i);
});

test('computeAction: shiny duplicado (pior) → TROCAR (lucky), mesmo sem meta', () => {
  const e = {
    isShadow: false, isShiny: true, ivPct: 70, betterCopy: { id: 'best' },
    moveIds: [], eliteMoves: [], tags: [], pvpMeta: null, pveMeta: null,
  };
  const a = computeAction(e);
  assert.strictEqual(a.kind, 'TROCAR');
  assert.match(a.reason, /[Ll]ucky|shiny/);
});

test('computeAction: meta IV baixo mas é a MELHOR cópia (sem betterCopy) → não TROCAR', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 60, betterCopy: null,
    moveIds: ['BUBBLE'], eliteMoves: [], tags: ['pve'], pvpMeta: null,
    pveMeta: { raid: false, pve: true, gymAtk: false, gymDef: false, movesetOk: false, bestMoveset: null, byType: {} },
  };
  assert.strictEqual(computeAction(e), null); // sem gancho de ação → null (motivo atual mantém)
});

// ---------------------------------------------------------------------------
// Fase 4 — justificativa PvE com rank do tipo (rastreável)
// ---------------------------------------------------------------------------

test('computeAction: justificativa de Raid inclui o rank do tipo (rastreável)', () => {
  const e = {
    tags: ['raid'], isShadow: false, ivPct: 90, betterCopy: null, moveIds: ['ICE_SHARD','AVALANCHE'], eliteMoves: [],
    pvpMeta: null,
    pveMeta: { raid: true, pve: true, gymAtk: false, gymDef: false, movesetOk: true,
               bestType: 'ice', bestMoveset: ['ICE_SHARD','AVALANCHE'],
               byType: { ice: { erRank: 8, dpsRank: 6 } }, defBulkRank: 300 },
  };
  const a = computeAction(e);
  assert.strictEqual(a.kind, 'FORTALECER');
  assert.match(a.reason, /Top 8/);   // rank do tipo aparece na justificativa
  assert.match(a.reason, /Gelo/);
});

// ---------------------------------------------------------------------------
// Moveset recomendado — razões nomeiam os golpes faltantes (spec 2026-06-09)
// ---------------------------------------------------------------------------

function ensinarMon(moveIds) {
  return pvpMon({
    moveIds: moveIds, eliteMoves: [],
    pvpMeta: {
      great:  { isMeta: true, speciesRank: 13, ivRank: 1, spPct: 1, movesetOk: false,
                moveset: ['COUNTER', 'ICE_PUNCH', 'POWER_UP_PUNCH'] },
      ultra:  { isMeta: false }, master: { isMeta: false },
    },
  });
}
const NOMES_PT = { moves: {
  COUNTER: { namePt: 'Contra-ataque' },
  ICE_PUNCH: { namePt: 'Soco de Gelo' },
  POWER_UP_PUNCH: { namePt: 'Soco Energizado' },
  CLOSE_COMBAT: { namePt: 'Combate Corpo a Corpo' },
} };

test('computeAction: ENSINAR_TM PvP sem nenhum carregado → "faltam X e Y" em PT', () => {
  const a = computeAction(ensinarMon(['COUNTER']), NOMES_PT);
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /faltam Soco de Gelo e Soco Energizado/);
});

test('computeAction: ENSINAR_TM PvP só com o rápido faltando → singular "falta"', () => {
  const a = computeAction(ensinarMon(['ICE_PUNCH', 'POWER_UP_PUNCH']), NOMES_PT);
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /falta Contra-ataque/);
  assert.doesNotMatch(a.reason, /faltam/);
});

test('computeAction: sem meta → nome do golpe em inglês humanizado (fallback)', () => {
  const a = computeAction(ensinarMon(['ICE_PUNCH', 'POWER_UP_PUNCH']));
  assert.match(a.reason, /falta Counter/);
});

test('computeAction: ENSINAR_TM sem moveset no rankEntry → texto genérico (fallback)', () => {
  const a = computeAction(pvpMon({
    pvpMeta: {
      great:  { isMeta: true, speciesRank: 13, ivRank: 1, spPct: 1, movesetOk: false },
      ultra:  { isMeta: false }, master: { isMeta: false },
    },
  }), NOMES_PT);
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /falta o moveset recomendado/);
});

test('computeAction: AGUARDAR_EVENTO nomeia o golpe legado em PT', () => {
  const e = {
    isShadow: false, isShiny: false, ivPct: 95, betterCopy: null,
    moveIds: ['COUNTER'], eliteMoves: ['CLOSE_COMBAT'],
    tags: ['pvp_great'],
    pvpMeta: { great:  { isMeta: true, speciesRank: 5, ivRank: 1, spPct: 1, movesetOk: false,
                         moveset: ['COUNTER', 'CLOSE_COMBAT'] },
               ultra:  { isMeta: false, moveset: null }, master: { isMeta: false, moveset: null } },
    pveMeta: null,
  };
  const a = computeAction(e, NOMES_PT);
  assert.strictEqual(a.kind, 'AGUARDAR_EVENTO');
  assert.match(a.reason, /Combate Corpo a Corpo/);
});

test('analyze (e2e): Sombrio raid-meta com Frustração → AGUARDAR_ROCKET + MANTER', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  // species.json/movesPt reais p/ o casamento; pveRanks SINTÉTICO que força a espécie a
  // ser atacante de raid → determinístico (não depende dos limiares do dataset real).
  const meta = {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'palmada':'COUNTER', 'frustracao':'FRUSTRATION', 'frustração':'FRUSTRATION' },
    pveRanks: { machamp: { roles:['raid','pve'], bestType:'fighting',
      bestMoveset:['COUNTER','CROSS_CHOP'],
      byType:{ fighting:{ dps:18, tdo:500, er:50, dpsRank:3, erRank:3, moveset:['COUNTER','CROSS_CHOP'] } },
      defBulkRank: 999 } },
  };
  // Machamp #68 Sombrio com Frustração, IV baixo (33%) p/ o veredito cair em MANTER (não INVESTIR).
  const fd = { s: { mon_name:'Machamp', mon_number:68, mon_cp:1500, mon_attack:5, mon_defence:5, mon_stamina:5,
                    mon_height:1.6, mon_alignment:'SHADOW', mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Palmada', mon_move_2:'Frustração' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.speciesId, 'machamp');
  assert.deepStrictEqual(e.moveIds, ['COUNTER', 'FRUSTRATION']);
  assert.strictEqual(e.pveMeta && e.pveMeta.raid, true);          // virou atacante de raid (meta)
  assert.strictEqual(e.action && e.action.kind, 'AGUARDAR_ROCKET'); // pré-empta Fortalecer
  assert.strictEqual(e.verdict, 'MANTER');                          // protegido (Sombrio), não INVESTIR/TRANSFERIR
});

// ---------------------------------------------------------------------------
// metaEvo — relevância de meta herdada da linha evolutiva (pré-evolução de meta)
// ---------------------------------------------------------------------------

test('computeAction: Sombrio com Frustração meta-via-evolução → AGUARDAR_ROCKET', () => {
  // Sem pvpMeta/pveMeta próprios; só metaEvo (uma evolução é meta) destrava o gancho.
  const a = computeAction({
    isShadow: true, isShiny: false, ivPct: 90, betterCopy: null,
    moveIds: ['KARATE_CHOP', 'FRUSTRATION'], eliteMoves: [], tags: [],
    pvpMeta: null, pveMeta: null, metaEvo: true,
  });
  assert.strictEqual(a.kind, 'AGUARDAR_ROCKET');
  assert.match(a.reason, /Rocket|Frustra/i);
});

test('computeAction: Frustração sem meta própria nem metaEvo → não AGUARDAR_ROCKET', () => {
  const a = computeAction({
    isShadow: true, isShiny: false, ivPct: 90, betterCopy: null,
    moveIds: ['KARATE_CHOP', 'FRUSTRATION'], eliteMoves: [], tags: [],
    pvpMeta: null, pveMeta: null, metaEvo: false,
  });
  assert.notStrictEqual(a && a.kind, 'AGUARDAR_ROCKET');
});

test('analyze (e2e): Machop Sombrio (Frustração) herda meta do Shadow Machamp → AGUARDAR_ROCKET', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  // species.json real (família/base stats reais da linha Machop); pveRanks SINTÉTICO que
  // torna SÓ a evolução Sombria (machamp_shadow) meta — o Machop em si não tem entrada.
  const meta = {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'golpe de carate': 'KARATE_CHOP', 'frustracao': 'FRUSTRATION' },
    pveRanks: { machamp_shadow: { roles: ['pve', 'gym_atk'], bestType: 'fighting',
      bestMoveset: ['COUNTER', 'CROSS_CHOP'], byType: {}, defBulkRank: 999 } },
  };
  const fd = { m: { mon_name:'Machop', mon_number:66, mon_cp:584, mon_attack:15, mon_defence:15, mon_stamina:15,
                    mon_height:0.8, mon_alignment:'SHADOW', mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Golpe de Caratê', mon_move_2:'Frustração' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.speciesId, 'machop');
  assert.strictEqual(e.pveMeta, null);                  // o Machop em si não é meta
  assert.strictEqual(e.metaEvo, true);                  // mas a evolução Sombria é
  assert.strictEqual(e.action && e.action.kind, 'AGUARDAR_ROCKET');
  assert.strictEqual(e.verdict, 'INVESTIR');            // hundo → INVESTIR
});

test('analyze (e2e): Machop NÃO-Sombrio não herda meta da evolução Sombria', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  const meta = {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'golpe de carate': 'KARATE_CHOP', 'soco dinamico': 'DYNAMIC_PUNCH' },
    pveRanks: { machamp_shadow: { roles: ['pve', 'gym_atk'], bestType: 'fighting',
      bestMoveset: ['COUNTER', 'CROSS_CHOP'], byType: {}, defBulkRank: 999 } },
  };
  const fd = { m: { mon_name:'Machop', mon_number:66, mon_cp:300, mon_attack:5, mon_defence:5, mon_stamina:5,
                    mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO',
                    mon_move_1:'Golpe de Caratê', mon_move_2:'Soco Dinâmico' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.metaEvo, false);  // só machamp_shadow é meta; a forma base não herda
});

// ---------------------------------------------------------------------------
// EVOLUIR — sinalizar quando vale evoluir (evolução é meta + cópia boa)
// ---------------------------------------------------------------------------

const evoProjPvP  = { target: 'Azumarill', targetId: 'azumarill', kind: 'pvp',
                      league: 'great', speciesRank: 13, spPct: 0.97, role: null, erRank: null, tipo: null };
const evoProjPvE  = { target: 'Machamp', targetId: 'machamp', kind: 'pve',
                      league: null, speciesRank: null, spPct: null, role: 'raid', erRank: 8, tipo: 'Lutador' };

function evoMon(over) {
  return Object.assign({
    isShadow: false, moveIds: [], tags: [], betterCopy: null, pvpMeta: null, pveMeta: null,
    isCostume: false, isExtremeSize: false, isXSComfort: false, isXLComfort: false,
    evoProj: evoProjPvE, evoOwned: false, ivPct: 91,
  }, over || {});
}

test('computeAction: evoProj PvE + cópia limpa → EVOLUIR (mensagem PvE)', () => {
  const a = computeAction(evoMon());
  assert.strictEqual(a.kind, 'EVOLUIR');
  assert.strictEqual(a.target, 'Machamp');
  assert.match(a.reason, /Evoluir → Machamp/);
  assert.match(a.reason, /Top 8/);
  assert.match(a.reason, /Lutador/);
});

test('computeAction: evoProj PvP → EVOLUIR (mensagem PvP com rank e IV PvP)', () => {
  const a = computeAction(evoMon({ evoProj: evoProjPvP }));
  assert.strictEqual(a.kind, 'EVOLUIR');
  assert.match(a.reason, /Evoluir → Azumarill/);
  assert.match(a.reason, /Liga Grande/);
  assert.match(a.reason, /rank 13/);
  assert.match(a.reason, /97%/);
});

test('computeAction: sem evoProj → NÃO EVOLUIR', () => {
  assert.strictEqual(computeAction(evoMon({ evoProj: null })), null);
});

test('computeAction: forma própria já meta → NÃO EVOLUIR (gancho de moveset cuida)', () => {
  const a = computeAction(evoMon({
    tags: ['pvp_great'], moveIds: ['COUNTER'],
    pvpMeta: { great: { isMeta: true, movesetOk: true, spPct: 0.98, ivRank: 1, speciesRank: 1 },
               ultra: {}, master: {} },
  }));
  assert.strictEqual(a.kind, 'FORTALECER');
});

test('computeAction: colecionável de tamanho (XS comfort) → NÃO EVOLUIR', () => {
  assert.strictEqual(computeAction(evoMon({ isXSComfort: true })), null);
});

test('computeAction: fantasia (costume) → NÃO EVOLUIR', () => {
  assert.strictEqual(computeAction(evoMon({ isCostume: true })), null);
});

test('computeAction: shiny SOBREVIVE à evolução → EVOLUIR (não travado por shiny)', () => {
  const a = computeAction(evoMon({ isShiny: true }));
  assert.strictEqual(a.kind, 'EVOLUIR');
});

test('computeAction: já possuo a evolução como keeper (evoOwned) → NÃO EVOLUIR', () => {
  assert.strictEqual(computeAction(evoMon({ evoOwned: true })), null);
});

test('computeAction: Sombrio com Frustração + evoProj → AGUARDAR_ROCKET pré-empta EVOLUIR', () => {
  // Prioridade: o gancho Rocket (P1) vem antes do evoluir (P1b). metaEvo destrava isMetaRelevant.
  const a = computeAction(evoMon({ isShadow: true, moveIds: ['KARATE_CHOP', 'FRUSTRATION'], metaEvo: true }));
  assert.strictEqual(a.kind, 'AGUARDAR_ROCKET');
});

test('analyze (e2e): Machop melhor cópia → EVOLUIR p/ Machamp (evolução é meta)', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  // pveRanks SINTÉTICO: só a evolução base (machamp) é meta; o Machop não tem entrada.
  const meta = {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'golpe de carate': 'KARATE_CHOP' },
    pveRanks: { machamp: { roles: ['raid', 'gym_atk'], bestType: 'fighting',
      bestMoveset: ['COUNTER', 'CROSS_CHOP'], byType: {}, defBulkRank: 999 } },
  };
  const fd = { m: { mon_name:'Machop', mon_number:66, mon_cp:500, mon_attack:12, mon_defence:12, mon_stamina:12,
                    mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO', mon_move_1:'Golpe de Caratê' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.pveMeta, null);                       // o Machop em si não é meta
  assert.strictEqual(e.metaEvo, true);                       // a evolução base é
  assert.strictEqual(e.action && e.action.kind, 'EVOLUIR');
  assert.strictEqual(e.action.target, 'Machamp');
  assert.strictEqual(e.metaEvoTarget, 'Machamp');
});

test('analyze (e2e): evolução regional não cruza região (Grimer de Alola → Muk de Alola)', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  // Só Muk de Alola (muk_alolan) é meta; o Muk comum NÃO. O alvo tem que ser o de Alola.
  const meta = {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: {},
    pveRanks: { muk_alolan: { roles: ['raid'], bestType: 'dark',
      bestMoveset: ['BITE', 'CRUNCH'], byType: {}, defBulkRank: 999 } },
  };
  const fd = { m: { mon_name:'Grimer', mon_number:88, mon_form:'GRIMER_ALOLA', mon_cp:500,
                    mon_attack:14, mon_defence:14, mon_stamina:14, mon_height:0.7,
                    mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.strictEqual(e.metaEvo, true);
  assert.strictEqual(e.action && e.action.kind, 'EVOLUIR');
  assert.match(e.metaEvoTarget, /Alolan/);                   // Muk Alolan, não Muk comum
});

// ---------------------------------------------------------------------------
// Task 4 — PvE: razão ENSINAR_TM nomeia golpes faltantes
// ---------------------------------------------------------------------------

test('computeAction: ENSINAR_TM PvE sem nenhum golpe → "faltam X e Y" em PT', () => {
  const e = pveRaider({
    moveIds: [],
    pveMeta: Object.assign(pveRaider().pveMeta, { movesetOk: false }),
  });
  const meta = { moves: { ICE_SHARD: { namePt: 'Lança de Gelo' }, AVALANCHE: { namePt: 'Avalanche' } } };
  const a = computeAction(e, meta);
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /faltam Lança de Gelo e Avalanche/);
  assert.match(a.reason, /estimativa/);
});

test('computeAction: ENSINAR_TM PvE com o rápido → "falta Avalanche" (singular)', () => {
  const e = pveRaider({
    moveIds: ['ICE_SHARD'],
    pveMeta: Object.assign(pveRaider().pveMeta, { movesetOk: false }),
  });
  const meta = { moves: { ICE_SHARD: { namePt: 'Lança de Gelo' }, AVALANCHE: { namePt: 'Avalanche' } } };
  const a = computeAction(e, meta);
  assert.match(a.reason, /falta Avalanche/);
  assert.doesNotMatch(a.reason, /faltam/);
});

test('computeAction: ENSINAR_TM PvE sem bestMoveset → texto genérico (fallback)', () => {
  const e = pveRaider({
    pveMeta: Object.assign(pveRaider().pveMeta, { movesetOk: false, bestMoveset: null }),
  });
  const a = computeAction(e, { moves: {} });
  assert.strictEqual(a.kind, 'ENSINAR_TM');
  assert.match(a.reason, /falta o moveset de ataque/);
});

// ---------------------------------------------------------------------------
// Task 5 — analyze: movesetView anexado (pvp por liga + pve) e meta repassado
// ---------------------------------------------------------------------------

test('analyze: anexa movesetView por liga PvP (nomes PT + has)', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  // pvpRanks SINTÉTICO → moveset recomendado determinístico (não depende do dataset real).
  const meta = {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'bolha': 'BUBBLE', 'raio congelante': 'ICE_BEAM' },
    pvpRanks: { azumarill: { great: { rank: 13, score: 90, moveset: ['BUBBLE', 'ICE_BEAM', 'PLAY_ROUGH'] },
                             ultra: null, master: null } },
    cpm: require('../data/cpm.json'),
    moves: { BUBBLE: { namePt: 'Bolha', kind: 'fast' }, ICE_BEAM: { namePt: 'Raio Congelante', kind: 'charge' },
             PLAY_ROUGH: { namePt: 'Jogo Duro', kind: 'charge' } },
  };
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO', mon_move_1:'Bolha', mon_move_2:'Raio Congelante' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.deepStrictEqual(e.pvpMeta.great.movesetView, [
    { name: 'Bolha', has: true, kind: 'fast' },
    { name: 'Raio Congelante', has: true, kind: 'charge' },
    { name: 'Jogo Duro', has: false, kind: 'charge' },
  ]);
  assert.strictEqual(e.pvpMeta.ultra.movesetView, null);   // liga fora do meta → null
});

test('analyze: anexa movesetView no pveMeta e passa meta ao computeAction', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  const meta = {
    speciesIndex: buildSpeciesIndex(require('../data/species.json')),
    movesPt: { 'palmada': 'COUNTER' },
    pveRanks: { machamp: { roles: ['raid','pve'], bestType: 'fighting',
      bestMoveset: ['COUNTER','CROSS_CHOP'],
      byType: { fighting: { dps: 18, tdo: 500, er: 50, dpsRank: 3, erRank: 3, moveset: ['COUNTER','CROSS_CHOP'] } },
      defBulkRank: 999 } },
    moves: { COUNTER: { namePt: 'Contra-ataque', kind: 'fast' }, CROSS_CHOP: { namePt: 'Golpe Cruzado', kind: 'charge' } },
  };
  const fd = { s: { mon_name:'Machamp', mon_number:68, mon_cp:1500, mon_attack:15, mon_defence:15, mon_stamina:14,
                    mon_height:1.6, mon_isShiny:'NO', mon_isLucky:'NO', mon_move_1:'Palmada' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta)[0];
  assert.deepStrictEqual(e.pveMeta.movesetView, [
    { name: 'Contra-ataque', has: true, kind: 'fast' },
    { name: 'Golpe Cruzado', has: false, kind: 'charge' },
  ]);
  // analyze repassa meta → a razão da ação sai com nome PT. Não asserimos o kind:
  // hoje CROSS_CHOP não é elite do Machamp (→ ENSINAR_TM), mas se o upstream mudar
  // isso vira AGUARDAR_EVENTO — e a razão dele também nomeia o golpe em PT.
  assert.match(e.action.reason, /Golpe Cruzado/);
});
