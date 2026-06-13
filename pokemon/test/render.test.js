// pokemon/test/render.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze } = require('../lib/analysis.js');
const { cardHtml, badgesHtml } = require('../lib/render.js');
const { compareHtml } = require('../lib/render.js');

function one(over) {
  const fd = { x: Object.assign({ mon_name:'Machop', mon_number:66, mon_cp:500,
    mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' }, over) };
  return analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar)[0];
}

function oneFull(over) {
  const fd = { x: Object.assign({ mon_name:'Machop', mon_number:66, mon_cp:500,
    mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:0.8, mon_isShiny:'NO', mon_isLucky:'NO' }, over) };
  return analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar)[0];
}

test('card mostra nome, veredito e id', () => {
  const html = cardHtml(one());
  assert.match(html, /Machop/);
  assert.match(html, /INVESTIR/);
  assert.match(html, /data-id="x"/);
  assert.match(html, /data-verdict="INVESTIR"/);
});

test('selos: shiny, sombrio e tamanho aparecem', () => {
  const html = badgesHtml(one({ mon_isShiny:'YES', mon_alignment:'SHADOW', mon_number:633, mon_height:0.35, mon_attack:9, mon_defence:0, mon_stamina:7 }));
  assert.match(html, /✨/);
  assert.match(html, /👻/);
  assert.match(html, /XS|XXS/);
});

test('escapa nomes (sem injeção de HTML)', () => {
  const html = cardHtml(one({ mon_name:'<b>x</b>' }));
  assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('badge XS aparece para XS comfort', () => {
  // Xatu #178 base 1.5, height 0.95 → XS comfort
  const html = badgesHtml(oneFull({ mon_name:'Xatu', mon_number:178, mon_height:0.95 }));
  assert.match(html, />XS</);
});

test('badge XL aparece para XL comfort', () => {
  // Machop #66 base 0.8, height 1.2 → scalar 1.5 → XL comfort
  const html = badgesHtml(oneFull({ mon_height:1.2 }));
  assert.match(html, />XL</);
});

test('badge ⚡ aparece quando tem 2º carregado', () => {
  const html = badgesHtml(oneFull({ mon_move_3:'Soco Dinâmico' }));
  assert.match(html, /⚡/);
});

test('XS comfort não aparece quando size é XXS (extremo)', () => {
  // Wailmer #320 base 2.0, height 0.5 → scalar 0.25 → XXS (não XS comfort)
  const html = badgesHtml(oneFull({ mon_name:'Wailmer', mon_number:320, mon_height:0.5, mon_attack:14, mon_defence:14, mon_stamina:14 }));
  assert.match(html, />XXS</);
  assert.doesNotMatch(html, />XS</); // não tem badge XS solto
});

function pair(thisOver, bestOver) {
  const fd = {
    a: Object.assign({ mon_name:'Xatu', mon_number:178, mon_cp:1482, mon_attack:13, mon_defence:14, mon_stamina:8,  mon_height:1.17, mon_isShiny:'NO', mon_isLucky:'NO' }, thisOver),
    b: Object.assign({ mon_name:'Xatu', mon_number:178, mon_cp:909,  mon_attack:13, mon_defence:11, mon_stamina:12, mon_height:0.95, mon_isShiny:'NO', mon_isLucky:'NO' }, bestOver),
  };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar);
  return { thisOne: list.find(e => e.id === 'a'), best: list.find(e => e.id === 'b') };
}

test('compareHtml mostra ambos os PCs sem ✔/✖', () => {
  const { thisOne, best } = pair();
  const html = compareHtml(thisOne, best);
  assert.match(html, /1482/);
  assert.match(html, /909/);
  // PC não recebe marcador
  const pcRow = html.split('\n').find(l => /PC/.test(l)) || html;
  assert.doesNotMatch(pcRow, /class="[^"]*\b(win|lose)\b/);
});

test('compareHtml: IV total — vencedor recebe .win, perdedor .lose', () => {
  const { thisOne, best } = pair();
  const html = compareHtml(thisOne, best);
  // thisOne IV 77%, best IV 80% → best vence
  assert.match(html, /80%[^<]*<\/span>[\s\S]*?class="[^"]*\bwin\b/);
  // não vou assertar posição exata, mas ambos os marcadores aparecem
  assert.match(html, /\bwin\b/);
  assert.match(html, /\blose\b/);
});

test('compareHtml: linhas empatadas ficam neutras (Atk 13 vs 13)', () => {
  const { thisOne, best } = pair();
  const html = compareHtml(thisOne, best);
  // Atk é 13 nos dois — não deve ter win/lose na linha de Atk
  // Estratégia: a linha de Atk não pode conter "win" ou "lose"
  const atkRowMatch = html.match(/Atk[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(atkRowMatch, 'linha de Atk não encontrada');
  assert.doesNotMatch(atkRowMatch[0], /\b(win|lose)\b/);
});

test('compareHtml lista ataques de cada lado', () => {
  const { thisOne, best } = pair({ mon_move_1:'Bicada', mon_move_2:'Vento Ominoso' }, { mon_move_1:'Golpe de Ar', mon_move_2:'Ás dos Ares' });
  const html = compareHtml(thisOne, best);
  assert.match(html, /Bicada/);
  assert.match(html, /Vento Ominoso/);
  assert.match(html, /Golpe de Ar/);
  assert.match(html, /Ás dos Ares/);
});

test('compareHtml: 2º carregado — ✔ pra quem tem, ✖ pra quem não tem', () => {
  const { thisOne, best } = pair({ mon_move_3:'Sky Attack' }, {});
  const html = compareHtml(thisOne, best);
  // O lado com move_3 deve ter classe win em 2º carregado
  assert.match(html, /2º carr[\s\S]*?\bwin\b/);
});

const { detailHtml } = require('../lib/render.js');

test('detailHtml inclui comparador quando verdict é TRANSFERIR', () => {
  const fd = {
    trash: { mon_name:'Pidgey', mon_number:16, mon_cp:80,  mon_attack:2,  mon_defence:5,  mon_stamina:7,  mon_height:0.3, mon_weight:3.5, mon_isShiny:'NO', mon_isLucky:'NO' },
    best:  { mon_name:'Pidgey', mon_number:16, mon_cp:300, mon_attack:14, mon_defence:14, mon_stamina:14, mon_height:0.3, mon_weight:3.5, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const list = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar);
  const trash = list.find(e => e.id === 'trash');
  assert.strictEqual(trash.verdict, 'TRANSFERIR');
  const html = detailHtml(trash);
  assert.match(html, /pk-compare/);
  assert.match(html, /Este vs o melhor/);
});

test('badge e dica de troca aparecem para candidato a troca de IV', () => {
  // Bidoof única cópia IV baixo → tradeBoost
  const fd = { only: { mon_name:'Bidoof', mon_number:399, mon_cp:90, mon_attack:3, mon_defence:4, mon_stamina:5, mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar)[0];
  assert.ok(e.tradeBoost);
  const html = cardHtml(e);
  assert.match(html, /🔁/);
  assert.match(html, /trade-tip/);
  assert.match(html, /Melhor Amigo/);
});

test('sem badge nem dica de troca quando IV já é alto', () => {
  // Machop hundo (default) → sem tradeBoost
  const html = cardHtml(oneFull());
  assert.doesNotMatch(html, /trade-tip/);
  assert.doesNotMatch(html, /b-tradeiv/);
});

test('detailHtml NÃO inclui comparador para MANTER/INVESTIR', () => {
  const fd = { only: { mon_name:'Bidoof', mon_number:399, mon_cp:90, mon_attack:3, mon_defence:4, mon_stamina:5, mon_height:0.5, mon_weight:9.0, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar)[0];
  assert.strictEqual(e.verdict, 'MANTER');
  const html = detailHtml(e);
  assert.doesNotMatch(html, /pk-compare/);
});

function pvpStub(over) {
  // mon enriquecido mínimo p/ render (sem rodar analyze)
  return Object.assign({
    id: 'p', name: 'Azumarill', verdict: 'INVESTIR', reason: 'x', ivPct: 67, cp: 1498,
    size: null, isHundo:false, isShiny:false, isShadow:false, isPurified:false, isLucky:false,
    isLegendary:false, isCostume:false, isXSComfort:false, isXLComfort:false, hasSecondCharge:false,
    tradeBoost:null,
    tags: ['pvp_great'],
    action: { kind:'FORTALECER', league:'great', reason:'Fortalecer p/ Liga Grande — rank 13' },
    pvp: null, // mon_pvp_stats (vitórias/derrotas) — ausente neste stub
    pvpMeta: { great:{isMeta:true,speciesRank:13,ivRank:1,spPct:1,movesetOk:true}, ultra:{isMeta:false}, master:{isMeta:false} },
  }, over || {});
}

test('badgesHtml: selo ⚔️G aparece com tag pvp_great', () => {
  const html = badgesHtml(pvpStub());
  assert.match(html, /⚔️/);
  assert.match(html, /G/);
});

test('badgesHtml: ⚔️U e ⚔️M com ultra/master', () => {
  assert.match(badgesHtml(pvpStub({ tags:['pvp_ultra'] })), /⚔️.?U/);
  assert.match(badgesHtml(pvpStub({ tags:['pvp_master'] })), /⚔️.?M/);
});

test('cardHtml: mostra a linha de ação quando há e.action', () => {
  const html = cardHtml(pvpStub());
  assert.match(html, /Fortalecer/);
  assert.match(html, /pk-action/);
});

test('cardHtml: sem ação → sem linha pk-action (não-regressão)', () => {
  const html = cardHtml(pvpStub({ action: null, tags: [] }));
  assert.doesNotMatch(html, /pk-action/);
});

test('detailHtml: bloco Competitivo aparece quando há liga meta', () => {
  const e = pvpStub({ verdict:'INVESTIR', moves:['Bolha','Raio de Gelo'], height:0.5, weight:28.5,
                      ivs:{atk:0,def:15,sta:15}, pvp_recommended:{ great:['BUBBLE','ICE_BEAM','PLAY_ROUGH'] } });
  const html = detailHtml(e);
  assert.match(html, /Competitivo/);
  assert.match(html, /Liga Grande/);
  assert.match(html, /rank 13/);
});

test('detailHtml: sem pvp meta → sem bloco Competitivo (não-regressão)', () => {
  const e = pvpStub({ verdict:'MANTER', moves:['x'], height:0.5, weight:1, ivs:{atk:1,def:1,sta:1},
                      tags:[], action:null, pvpMeta:{ great:{isMeta:false}, ultra:{isMeta:false}, master:{isMeta:false} } });
  const html = detailHtml(e);
  assert.doesNotMatch(html, /Competitivo/);
});

function pveStub(over) {
  return Object.assign({
    id: 'q', name: 'Mamoswine', verdict: 'INVESTIR', reason: 'x', ivPct: 90, cp: 3000,
    size: null, isHundo:false, isShiny:false, isShadow:false, isPurified:false, isLucky:false,
    isLegendary:false, isCostume:false, isXSComfort:false, isXLComfort:false, hasSecondCharge:false,
    tradeBoost:null, action:null, pvp:null, pvpMeta:null,
    moves:['Lança-Gelo','Avalanche'], ivs:{atk:15,def:15,sta:15}, height:2.5, weight:291,
    tags: ['raid','pve'],
    pveMeta: { raid:true, pve:true, gymAtk:false, gymDef:false, bestType:'ice',
               bestMoveset:['ICE_SHARD','AVALANCHE'], movesetOk:true,
               byType:{ ice:{ dps:18.2, er:50.1, dpsRank:5, erRank:7 } } },
  }, over || {});
}

test('badgesHtml: selo 🔥 com tag raid', () => {
  assert.match(badgesHtml(pveStub()), /🔥/);
});

test('badgesHtml: selo 🛡️ com tag gym_def', () => {
  assert.match(badgesHtml(pveStub({ tags:['gym_def'], pveMeta: Object.assign(pveStub().pveMeta, {raid:false,pve:false,gymDef:true}) })), /🛡️/);
});

test('detailHtml: bloco Competitivo mostra PvE (tipo + rank + estimativa)', () => {
  const html = detailHtml(pveStub());
  assert.match(html, /Competitivo/);
  assert.match(html, /Gelo|Raid/);
  assert.match(html, /estimativa/);
  assert.match(html, /rank 7|#7/);
});

test('detailHtml: sem pvpMeta nem pveMeta → sem bloco Competitivo (não-regressão)', () => {
  const html = detailHtml(pveStub({ tags:[], pveMeta:null, pvpMeta:null }));
  assert.doesNotMatch(html, /Competitivo/);
});

test('badgesHtml: selo 🚀 aparece com tag rocket', () => {
  const html = badgesHtml(pveStub({ tags: ['rocket'] }));
  assert.match(html, /🚀/);
});

test('badgesHtml: sem tag rocket → sem 🚀 (não-regressão)', () => {
  const html = badgesHtml(pveStub({ tags: [] }));
  assert.doesNotMatch(html, /🚀/);
});

test('cardHtml: ícone da ação por kind (🚀 AGUARDAR_ROCKET, 🗓️ AGUARDAR_EVENTO, 🔁 TROCAR)', () => {
  assert.match(cardHtml(pvpStub({ action: { kind:'AGUARDAR_ROCKET', reason:'Aguardar Rocket — x' } })), /🚀/);
  assert.match(cardHtml(pvpStub({ action: { kind:'AGUARDAR_EVENTO', reason:'Aguardar Evento — x' } })), /🗓️/);
  assert.match(cardHtml(pvpStub({ action: { kind:'TROCAR', reason:'Trocar — x' } })), /🔁/);
  // combate mantém ⚔️
  assert.match(cardHtml(pvpStub({ action: { kind:'FORTALECER', reason:'Fortalecer — x' } })), /⚔️/);
});

test('detailHtml: linha PvP lista o moveset recomendado com ✓/(falta)', () => {
  const e = pvpStub({ verdict:'INVESTIR', moves:['Bolha','Raio Congelante'], height:0.5, weight:28.5,
    ivs:{atk:0,def:15,sta:15},
    pvpMeta: { great: { isMeta:true, speciesRank:13, ivRank:1, spPct:1, movesetOk:false,
                        movesetView: [ { name:'Bolha', has:true, kind:'fast' }, { name:'Raio Congelante', has:true, kind:'charge' },
                                       { name:'Jogo Duro', has:false, kind:'charge' } ] },
               ultra:{isMeta:false}, master:{isMeta:false} } });
  const html = detailHtml(e);
  assert.match(html, /recomendado: ⚡ Bolha ✓ · 💥 Raio Congelante ✓ · 💥 Jogo Duro \(falta\)/);
  assert.doesNotMatch(html, /falta o moveset recomendado/);
});

test('detailHtml: linha PvP sem movesetView → texto antigo (fallback)', () => {
  const e = pvpStub({ verdict:'INVESTIR', moves:['x'], height:0.5, weight:28.5, ivs:{atk:0,def:15,sta:15} });
  const html = detailHtml(e);
  assert.match(html, /moveset recomendado ✓/);   // movesetOk:true no stub default
});

test('detailHtml: linha PvE lista o moveset recomendado com ✓/(falta)', () => {
  const e = pveStub({ pveMeta: Object.assign(pveStub().pveMeta, {
    movesetOk: false,
    movesetView: [ { name:'Lança de Gelo', has:true, kind:'fast' }, { name:'Avalanche', has:false, kind:'charge' } ],
  }) });
  const html = detailHtml(e);
  assert.match(html, /recomendado: ⚡ Lança de Gelo ✓ · 💥 Avalanche \(falta\)/);
  assert.match(html, /estimativa/);
});

test('detailHtml: linha PvE sem movesetView → texto antigo (fallback)', () => {
  const html = detailHtml(pveStub());
  assert.match(html, /moveset de ataque ✓/);   // movesetOk:true no stub default
});

test('detailHtml: moveset recomendado mostra ⚡ (ágil) e 💥 (carregado)', () => {
  const e = pvpStub({
    moves:['Bolha','Raio de Gelo'], height:0.5, weight:28.5, ivs:{atk:0,def:15,sta:15},
    pvpMeta: { great:{ isMeta:true, speciesRank:13, ivRank:1, spPct:1, movesetOk:true,
                       movesetView:[ {name:'Bolha',has:true,kind:'fast'},
                                     {name:'Raio de Gelo',has:true,kind:'charge'},
                                     {name:'Focinhada',has:false,kind:'charge'} ] },
               ultra:{isMeta:false}, master:{isMeta:false} },
  });
  const html = detailHtml(e);
  assert.match(html, /⚡\s*Bolha/);
  assert.match(html, /💥\s*Raio de Gelo/);
  assert.match(html, /💥\s*Focinhada \(falta\)/);
});

test('cardHtml: linha moveset-tip aparece quando há e.movesetTip', () => {
  const html = cardHtml(pvpStub({ movesetTip:{ move:'PLAY_ROUGH', league:'great',
    reason:'Desbloquear 2º carregado p/ Liga Grande: Focinhada' } }));
  assert.match(html, /moveset-tip/);
  assert.match(html, /Desbloquear 2º carregado/);
  assert.match(html, /💥/);
});

test('cardHtml: sem movesetTip → sem linha moveset-tip (não-regressão)', () => {
  const html = cardHtml(pvpStub());
  assert.doesNotMatch(html, /moveset-tip/);
});
