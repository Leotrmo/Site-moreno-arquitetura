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
