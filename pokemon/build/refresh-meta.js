// pokemon/build/refresh-meta.js — baixa, transforma, valida, grava (Node 18+)
const fs = require('fs');
const path = require('path');
const S = require('./sources.js');
const T = require('./transform.js');

const CPM_MAX_LEVEL = 50;   // alinhado com LEVEL_CAP de lib/meta/pvp.js

const TOP_N = { great: 100, ultra: 100, master: 80 };
const OUT = path.join(__dirname, '..', 'data');

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' em ' + url);
  return res.json();
}

function write(name, obj) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));
  console.log('  gravado', name, '(' + Object.keys(obj).length + ' chaves)');
}

function assertNonEmpty(label, obj) {
  if (!obj || Object.keys(obj).length === 0) throw new Error('validação: ' + label + ' vazio — abortando');
}

function buildCpm(gameMaster) {
  const arr = Array.isArray(gameMaster) ? gameMaster : (gameMaster.template || gameMaster.itemTemplates);
  if (!Array.isArray(arr)) throw new Error('buildCpm: game master sem array de templates');
  const pl = arr.find(t => /PLAYER_LEVEL_SETTINGS/.test(t.templateId || ''));
  const cpMultiplier = pl && pl.data && pl.data.playerLevel && pl.data.playerLevel.cpMultiplier;
  if (!Array.isArray(cpMultiplier))
    throw new Error('buildCpm: PLAYER_LEVEL_SETTINGS.playerLevel.cpMultiplier ausente');
  return T.expandCpm(cpMultiplier, CPM_MAX_LEVEL);
}

async function main() {
  console.log('Baixando fontes…');
  const [gm, rGreat, rUltra, rMaster, gameMaster, i18nPt] = await Promise.all([
    getJson(S.PVPOKE_GAMEMASTER),
    getJson(S.PVPOKE_RANKINGS.great),
    getJson(S.PVPOKE_RANKINGS.ultra),
    getJson(S.PVPOKE_RANKINGS.master),
    getJson(S.POKEMINERS_GAME_MASTER),
    getJson(S.POKEMINERS_I18N_PT),
  ]);

  console.log('Transformando…');
  const species = T.buildSpecies(gm);
  const moves = T.buildMoves(gm);
  const movesPveRes = T.buildMovesPve(gameMaster);
  for (const id in movesPveRes.map) if (moves[id]) moves[id].pve = movesPveRes.map[id];
  const pveCoverage = Object.keys(moves).length
    ? Object.keys(moves).filter(id => moves[id].pve).length / Object.keys(moves).length : 0;
  const pveRanks = T.buildPveRanks(species, moves);
  const movesPtRes = T.buildMovesPt(gameMaster, i18nPt);
  // Nome PT de exibição por golpe (moves.json vem do PvPoke; nomes vêm dos PokeMiners → merge aqui).
  for (const id in movesPtRes.namesPt) if (moves[id]) moves[id].namePt = movesPtRes.namesPt[id];
  const pvpRanks = T.buildPvpRanks({ great: rGreat, ultra: rUltra, master: rMaster }, TOP_N);
  const cpm = buildCpm(gameMaster);

  assertNonEmpty('species', species);
  assertNonEmpty('moves', moves);
  assertNonEmpty('movesPt', movesPtRes.map);
  assertNonEmpty('pvpRanks', pvpRanks);
  if (movesPtRes.coverage < 0.8)
    throw new Error('validação: cobertura PT ' + (movesPtRes.coverage * 100).toFixed(1) + '% < 80% — schema mudou?');
  const namePtCoverage = Object.keys(moves).length
    ? Object.keys(moves).filter(id => moves[id].namePt).length / Object.keys(moves).length : 0;
  if (namePtCoverage < 0.8)
    throw new Error('validação: cobertura namePt ' + (namePtCoverage * 100).toFixed(1) + '% < 80% — merge falhou?');
  if (!Array.isArray(cpm) || cpm.length === 0) throw new Error('validação: cpm vazio — abortando');
  if (Math.abs(cpm[0].cpm - 0.094) > 1e-9)
    throw new Error('validação: cpm[0] != 0.094 (L1) — schema do GAME_MASTER mudou?');
  for (let i = 1; i < cpm.length; i++)
    if (!(cpm[i].cpm > cpm[i - 1].cpm))
      throw new Error('validação: cpm não é estritamente crescente em ' + cpm[i].level);

  if (pveCoverage < 0.8)
    throw new Error('validação: cobertura PvE ' + (pveCoverage * 100).toFixed(1) + '% < 80% — schema mudou?');
  assertNonEmpty('pveRanks', pveRanks);
  if (!pveRanks.blissey || !(pveRanks.blissey.defBulkRank <= 5))
    throw new Error('validação: Blissey deveria estar entre os mais bulky — defBulkRank suspeito');

  write('species.json', species);
  write('moves.json', moves);
  write('moves_pt.json', movesPtRes.map);
  write('pvp_ranks.json', pvpRanks);
  write('cpm.json', cpm);
  write('pve_ranks.json', pveRanks);
  write('meta.json', {
    generatedAt: new Date().toISOString(),
    pvpokeSource: S.PVPOKE_GAMEMASTER,
    counts: {
      species: Object.keys(species).length, moves: Object.keys(moves).length,
      movesPt: Object.keys(movesPtRes.map).length, pvpRanked: Object.keys(pvpRanks).length,
      cpmLevels: cpm.length,
      pveRanked: Object.keys(pveRanks).length,
    },
    ptCoverage: Number(movesPtRes.coverage.toFixed(3)),
    pveCoverage: Number(pveCoverage.toFixed(3)),
    topN: TOP_N,
  });
  console.log('OK.');
}

main().catch(err => { console.error('FALHA:', err.message); process.exit(1); });
