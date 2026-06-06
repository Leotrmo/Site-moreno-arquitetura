// pokemon/test/tradeboost.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze, computeCounts, TRADE_MIN_IV_PCT, TRADE_EXPECTED_IV_PCT } = require('../lib/analysis.js');

function find(fileData, id) {
  const list = analyze(fileData, getPokemonSize, refdata, getPokemonSizeScalar);
  return list.find(e => e.id === id);
}

test('constantes da troca: piso 33% e esperado 67%', () => {
  assert.strictEqual(TRADE_MIN_IV_PCT, 33);
  assert.strictEqual(TRADE_EXPECTED_IV_PCT, 67);
});

test('única cópia com IV muito baixo → tradeBoost com ganho garantido', () => {
  // Bidoof 3/4/5 = 27% < 33% → ganho garantido na troca Melhor Amigo
  const fd = { only: { mon_name:'Bidoof', mon_number:399, mon_cp:90, mon_attack:3, mon_defence:4, mon_stamina:5, mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = find(fd, 'only');
  assert.strictEqual(e.verdict, 'MANTER');
  assert.ok(e.tradeBoost, 'deveria sugerir troca');
  assert.strictEqual(e.tradeBoost.guaranteed, true);
  assert.match(e.tradeBoost.reason, /garantido/);
});

test('IV mediano (abaixo de 67%) → tradeBoost sem garantia, só esperado', () => {
  // Stantler 8/8/8 = 53% → entre 33% e 67%
  const fd = { m: { mon_name:'Stantler', mon_number:234, mon_cp:600, mon_attack:8, mon_defence:8, mon_stamina:8, mon_height:1.4, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = find(fd, 'm');
  assert.ok(e.tradeBoost);
  assert.strictEqual(e.tradeBoost.guaranteed, false);
  assert.match(e.tradeBoost.reason, /esperado/);
});

test('IV já acima do esperado (≥67%) → sem tradeBoost', () => {
  // Stantler 12/12/12 = 80%
  const fd = { hi: { mon_name:'Stantler', mon_number:234, mon_cp:1000, mon_attack:12, mon_defence:12, mon_stamina:12, mon_height:1.4, mon_isShiny:'NO', mon_isLucky:'NO' } };
  assert.strictEqual(find(fd, 'hi').tradeBoost, null);
});

test('sombrio com IV baixo → NÃO sugere troca (sombrio não pode ser trocado)', () => {
  const fd = { sh: { mon_name:'Grimer', mon_number:88, mon_form:'GRIMER_ALOLA', mon_cp:300, mon_attack:2, mon_defence:2, mon_stamina:2, mon_height:0.8, mon_alignment:'SHADOW', mon_isShiny:'NO', mon_isLucky:'NO' } };
  const e = find(fd, 'sh');
  assert.strictEqual(e.verdict, 'MANTER');
  assert.strictEqual(e.tradeBoost, null);
});

test('shiny e lucky com IV baixo → NÃO sugere troca (colecionável)', () => {
  const fd = {
    sh:    { mon_name:'Deino', mon_number:633, mon_cp:329, mon_attack:9, mon_defence:0, mon_stamina:7, mon_height:0.8, mon_isShiny:'YES', mon_isLucky:'NO' },
    lucky: { mon_name:'Bidoof', mon_number:399, mon_cp:90, mon_attack:3, mon_defence:4, mon_stamina:5, mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'YES' },
  };
  assert.strictEqual(find(fd, 'sh').tradeBoost, null);
  assert.strictEqual(find(fd, 'lucky').tradeBoost, null);
});

test('lendário com IV baixo → NÃO sugere troca casual', () => {
  const fd = { leg: { mon_name:'Mewtwo', mon_number:150, mon_cp:1000, mon_attack:5, mon_defence:5, mon_stamina:5, mon_height:2.0, mon_isShiny:'NO', mon_isLucky:'NO' } };
  assert.strictEqual(find(fd, 'leg').tradeBoost, null);
});

test('duplicata pior (TRANSFERIR) → NÃO sugere troca (você só transfere)', () => {
  const fd = {
    best:  { mon_name:'Pidgey', mon_number:16, mon_cp:300, mon_attack:14, mon_defence:14, mon_stamina:14, mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' },
    trash: { mon_name:'Pidgey', mon_number:16, mon_cp:80,  mon_attack:2,  mon_defence:5,  mon_stamina:7,  mon_height:0.3, mon_isShiny:'NO', mon_isLucky:'NO' },
  };
  const trash = find(fd, 'trash');
  assert.strictEqual(trash.verdict, 'TRANSFERIR');
  assert.strictEqual(trash.tradeBoost, null);
});

test('computeCounts soma os candidatos a troca', () => {
  const fd = {
    a: { mon_name:'Bidoof', mon_number:399, mon_cp:90, mon_attack:3, mon_defence:4, mon_stamina:5, mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' }, // candidato
    b: { mon_name:'Stantler', mon_number:234, mon_cp:600, mon_attack:8, mon_defence:8, mon_stamina:8, mon_height:1.4, mon_isShiny:'NO', mon_isLucky:'NO' }, // candidato
    c: { mon_name:'Slowking', mon_number:199, mon_cp:1417, mon_attack:15, mon_defence:15, mon_stamina:15, mon_height:2.0, mon_isShiny:'NO', mon_isLucky:'NO' }, // hundo, não
  };
  const c = computeCounts(analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar));
  assert.strictEqual(c.tradeBoost, 2);
});
