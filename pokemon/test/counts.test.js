// pokemon/test/counts.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { getPokemonSize, getPokemonSizeScalar } = require('../sizes.js');
const refdata = require('../lib/refdata.js');
const { analyze, computeCounts } = require('../lib/analysis.js');

const fd = {
  a: { mon_name:'Slowking', mon_number:199, mon_cp:1417, mon_attack:15,mon_defence:15,mon_stamina:15, mon_height:2.0, mon_isShiny:'NO',  mon_isLucky:'NO' },  // hundo → INVESTIR, hundo++
  b: { mon_name:'Deino', mon_number:633, mon_cp:329, mon_attack:9,mon_defence:0,mon_stamina:7, mon_height:0.8, mon_isShiny:'YES', mon_isLucky:'NO' },        // shiny → MANTER, shiny++
  c: { mon_name:'Deino', mon_number:633, mon_cp:67,  mon_attack:0,mon_defence:8,mon_stamina:3, mon_height:0.8, mon_isShiny:'NO',  mon_isLucky:'NO' },        // dupe ruim → TRANSFERIR
};

test('contagens por veredito e por destaque', () => {
  const list = analyze(fd, getPokemonSize, refdata);
  const c = computeCounts(list);
  assert.strictEqual(c.total, 3);
  assert.strictEqual(c.INVESTIR, 1);
  assert.strictEqual(c.MANTER, 1);
  assert.strictEqual(c.TRANSFERIR, 1);
  assert.strictEqual(c.hundos, 1);
  assert.strictEqual(c.shinies, 1);
});

const realCpm = require('../data/cpm.json');
const speciesJson = require('../data/species.json');
const pvpRanksJson = require('../data/pvp_ranks.json');
const { buildSpeciesIndex } = require('../lib/meta/match.js');

test('contagens incluem pvpGreat/pvpUltra/pvpMaster', () => {
  const meta = { speciesIndex: buildSpeciesIndex(speciesJson), movesPt: {}, pvpRanks: pvpRanksJson, cpm: realCpm };
  const fd = { z: { mon_name:'Azumarill', mon_number:184, mon_cp:1498, mon_attack:0, mon_defence:15, mon_stamina:15,
                    mon_height:0.5, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const c = computeCounts(analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta));
  assert.strictEqual(c.pvpGreat, 1);
  assert.ok('pvpUltra' in c && 'pvpMaster' in c);
});

test('contagens sem meta: pvp* ficam 0 (não-regressão)', () => {
  const c = computeCounts(analyze(fd, getPokemonSize, refdata)); // fd do topo do arquivo
  assert.strictEqual(c.pvpGreat, 0);
  assert.strictEqual(c.pvpUltra, 0);
  assert.strictEqual(c.pvpMaster, 0);
});

const pveRanksJson = require('../data/pve_ranks.json');

test('contagens incluem raid/pve/gymAtk/gymDef', () => {
  const { buildSpeciesIndex } = require('../lib/meta/match.js');
  const meta = { speciesIndex: buildSpeciesIndex(speciesJson), movesPt: {}, pvpRanks: pvpRanksJson, cpm: realCpm, pveRanks: pveRanksJson };
  let dex = null;
  for (const id in pveRanksJson) {
    if (id.indexOf('_') < 0 && (pveRanksJson[id].roles || []).includes('raid') && speciesJson[id]) { dex = speciesJson[id].dex; break; }
  }
  assert.ok(dex, 'existe atacante de raid base');
  const fd = { z: { mon_name:'X', mon_number:dex, mon_cp:3000, mon_attack:15, mon_defence:15, mon_stamina:15,
                    mon_height:1, mon_isShiny:'NO', mon_isLucky:'NO' } };
  const c = computeCounts(analyze(fd, getPokemonSize, refdata, getPokemonSizeScalar, meta));
  assert.ok('raid' in c && 'pve' in c && 'gymAtk' in c && 'gymDef' in c);
  assert.strictEqual(c.raid, 1);
});

test('contagens sem meta: raid/pve/gymAtk/gymDef ficam 0 (não-regressão)', () => {
  const c = computeCounts(analyze(fd, getPokemonSize, refdata)); // fd do topo do arquivo
  assert.strictEqual(c.raid, 0);
  assert.strictEqual(c.pve, 0);
  assert.strictEqual(c.gymAtk, 0);
  assert.strictEqual(c.gymDef, 0);
});
