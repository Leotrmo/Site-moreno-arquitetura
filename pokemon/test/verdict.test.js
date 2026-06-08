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
