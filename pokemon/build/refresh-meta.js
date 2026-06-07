// pokemon/build/refresh-meta.js — baixa, transforma, valida, grava (Node 18+)
const fs = require('fs');
const path = require('path');
const S = require('./sources.js');
const T = require('./transform.js');

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
  const movesPtRes = T.buildMovesPt(gameMaster, i18nPt);
  const pvpRanks = T.buildPvpRanks({ great: rGreat, ultra: rUltra, master: rMaster }, TOP_N);

  assertNonEmpty('species', species);
  assertNonEmpty('moves', moves);
  assertNonEmpty('movesPt', movesPtRes.map);
  assertNonEmpty('pvpRanks', pvpRanks);
  if (movesPtRes.coverage < 0.8)
    throw new Error('validação: cobertura PT ' + (movesPtRes.coverage * 100).toFixed(1) + '% < 80% — schema mudou?');

  write('species.json', species);
  write('moves.json', moves);
  write('moves_pt.json', movesPtRes.map);
  write('pvp_ranks.json', pvpRanks);
  write('meta.json', {
    generatedAt: new Date().toISOString(),
    pvpokeSource: S.PVPOKE_GAMEMASTER,
    counts: {
      species: Object.keys(species).length, moves: Object.keys(moves).length,
      movesPt: Object.keys(movesPtRes.map).length, pvpRanked: Object.keys(pvpRanks).length,
    },
    ptCoverage: Number(movesPtRes.coverage.toFixed(3)),
    topN: TOP_N,
  });
  console.log('OK.');
}

main().catch(err => { console.error('FALHA:', err.message); process.exit(1); });
