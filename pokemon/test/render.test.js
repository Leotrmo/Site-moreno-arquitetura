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
