// pokemon/test/render.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze } = require('../lib/analysis.js');
const { cardHtml, badgesHtml } = require('../lib/render.js');

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
