// pokemon/build/transform.js — transformações puras (Node-only, CommonJS)
const { normalizeName } = require('../lib/meta/match.js');

function buildSpecies(gamemaster) {
  if (!gamemaster || !Array.isArray(gamemaster.pokemon))
    throw new Error('buildSpecies: gamemaster.pokemon ausente');
  const out = {};
  for (const p of gamemaster.pokemon) {
    if (!p.speciesId) continue;
    out[p.speciesId] = {
      dex: p.dex,
      baseStats: p.baseStats,
      types: (p.types || []).filter(t => t && t !== 'none'),
      family: p.family ? p.family.id : null,
      eliteMoves: p.eliteMoves || [],
      shadowEligible: Array.isArray(p.tags) && p.tags.includes('shadoweligible'),
    };
  }
  return out;
}

function buildMoves(gamemaster) {
  if (!gamemaster || !Array.isArray(gamemaster.moves))
    throw new Error('buildMoves: gamemaster.moves ausente');
  const out = {};
  for (const mv of gamemaster.moves) {
    if (!mv.moveId || mv.unlisted) continue;       // pula não-listados (ex.: Transform)
    const isFast = mv.energyGain > 0;              // fast gera energia; charge gasta (energy > 0)
    out[mv.moveId] = {
      type: mv.type,
      kind: isFast ? 'fast' : 'charge',
      pvp: { power: mv.power, energy: isFast ? mv.energyGain : mv.energy },
    };
  }
  return out;
}

function _i18nMoveNames(i18nPt) {
  const data = Array.isArray(i18nPt) ? i18nPt : i18nPt.data;
  if (!Array.isArray(data)) throw new Error('buildMovesPt: i18n.data ausente');
  const byNum = {}; // "241" → "Esmagamento de Pedras"
  for (let i = 0; i < data.length - 1; i += 2) {
    const m = /^move_name_0*(\d+)$/.exec(data[i]);
    if (m) byNum[m[1]] = data[i + 1];
  }
  return byNum;
}

function buildMovesPt(gameMaster, i18nPt) {
  const arr = Array.isArray(gameMaster) ? gameMaster : (gameMaster.template || gameMaster.itemTemplates);
  if (!Array.isArray(arr)) throw new Error('buildMovesPt: game master sem array de templates');
  const ptByNum = _i18nMoveNames(i18nPt);
  const map = {};
  let total = 0, hit = 0;
  for (const t of arr) {
    const tid = t.templateId || (t.data && t.data.templateId) || '';
    const m = /^COMBAT_V0*(\d+)_MOVE_/.exec(tid);
    const cm = (t.data && t.data.combatMove) || t.combatMove; // combatMove fica sob entry.data
    if (!m || !cm || typeof cm.uniqueId !== 'string') continue; // pula uniqueId não-string (12 casos)
    total++;
    const num = m[1];
    const moveId = cm.uniqueId.replace(/_FAST$/, '');
    const pt = ptByNum[num];
    if (!pt) continue;
    hit++;
    map[normalizeName(pt)] = moveId;
  }
  return { map, coverage: total ? hit / total : 0 };
}

const LEAGUES = ['great', 'ultra', 'master'];

function buildPvpRanks(rankingsByLeague, topN) {
  const out = {};
  for (const lg of LEAGUES) {
    const arr = rankingsByLeague[lg] || [];
    if (!Array.isArray(arr)) throw new Error('buildPvpRanks: ranking ' + lg + ' não é array');
    const cut = topN[lg];
    for (let i = 0; i < arr.length && i < cut; i++) {
      const e = arr[i];
      if (!e.speciesId) continue;
      (out[e.speciesId] = out[e.speciesId] || { great: null, ultra: null, master: null });
      out[e.speciesId][lg] = { rank: i + 1, score: e.score, moveset: e.moveset || [] };
    }
  }
  return out;
}

// Expande os CPMs inteiros do GAME_MASTER (índice i = nível i+1) numa lista
// ascendente {level, cpm} com meios-níveis, do nível 1 até maxLevel (passo 0.5).
// Meio-nível usa a fórmula do jogo: cpm(L+0.5) = sqrt((cpm(L)² + cpm(L+1)²)/2).
function expandCpm(cpMultiplier, maxLevel) {
  if (!Array.isArray(cpMultiplier) || cpMultiplier.length < maxLevel)
    throw new Error('expandCpm: cpMultiplier curto demais (precisa de ' + maxLevel + ' níveis)');
  var out = [];
  for (var L = 1; L <= maxLevel; L += 0.5) {
    var cpm;
    if (Number.isInteger(L)) {
      cpm = cpMultiplier[L - 1];                 // índice 0 = nível 1
    } else {
      var lo = cpMultiplier[Math.floor(L) - 1];
      var hi = cpMultiplier[Math.floor(L)];      // próximo inteiro
      cpm = Math.sqrt((lo * lo + hi * hi) / 2);
    }
    out.push({ level: L, cpm: cpm });
  }
  return out;
}

module.exports = { buildSpecies, buildMoves, buildMovesPt, buildPvpRanks, LEAGUES, expandCpm };
