// pokemon/test/verdict.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze } = require('../lib/analysis.js');

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
