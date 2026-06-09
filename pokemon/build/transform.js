// pokemon/build/transform.js — transformações puras (Node-only, CommonJS)
const { normalizeName } = require('../lib/meta/match.js');
const PokePve = require('../lib/meta/pve.js');

// Cobertura ofensiva: nº de tipos contra os quais cada tipo é super-eficaz (carta padrão).
// Usado p/ marcar gym_atk (atacante versátil contra defensores comuns).
const OFFENSIVE_COVERAGE = {
  normal:0, fire:4, water:3, electric:2, grass:3, ice:4, fighting:5, poison:2, ground:5,
  flying:3, psychic:2, bug:3, rock:4, ghost:2, dragon:1, dark:2, steel:3, fairy:3,
};

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
      fastMoves: p.fastMoves || [],
      chargedMoves: p.chargedMoves || [],
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
    const pvp = { power: mv.power, energy: isFast ? mv.energyGain : mv.energy };
    if (isFast && mv.cooldown) pvp.turns = mv.cooldown / 500;   // duração PvP em turnos
    out[mv.moveId] = { type: mv.type, kind: isFast ? 'fast' : 'charge', pvp: pvp };
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

// Stats PvE de golpe do Game Master do PokeMiners (templates V####_MOVE_*, chave moveSettings).
// Chaveia pelo moveId do PvPoke: tira o sufixo _FAST. energy = magnitude de energyDelta.
function buildMovesPve(gameMaster) {
  const arr = Array.isArray(gameMaster) ? gameMaster : (gameMaster.template || gameMaster.itemTemplates);
  if (!Array.isArray(arr)) throw new Error('buildMovesPve: game master sem array de templates');
  const map = {};
  let count = 0;
  for (const t of arr) {
    const tid = t.templateId || (t.data && t.data.templateId) || '';
    if (!/^V\d{4}_MOVE_/.test(tid)) continue;
    const ms = t.data && t.data.moveSettings;
    if (!ms || typeof ms.movementId !== 'string') continue;
    const moveId = ms.movementId.replace(/_FAST$/, '');
    map[moveId] = {
      power: ms.power || 0,
      energy: Math.abs(ms.energyDelta || 0),
      durationMs: ms.durationMs || 0,
    };
    count++;
  }
  return { map, count };
}

// Formas não-obteníveis como cópia permanente: Mega/Primal saem do pool de ranking PvE.
const MEGA_RE = /_mega(_x|_y)?$|_primal$/;
const isShadowId = (id) => /_shadow$/.test(id);

// Gera pve_ranks.json: ranking por tipo (erRank/dpsRank), roles de espécie e defBulkRank global.
function buildPveRanks(species, movesById, cfg) {
  cfg = cfg || {};
  const RAID = cfg.raidTop || PokePve.RAID_TOP;
  const PVET = cfg.pveTop  || PokePve.PVE_TOP;   // limiar de erRank p/ role 'pve' (não confundir com o objeto PVE de pve.js)
  const GATK = cfg.gymAtkTop || PokePve.GYM_ATK_TOP;
  const GCOV = cfg.gymAtkCoverageMin || PokePve.GYM_ATK_COVERAGE_MIN;
  const GDEF = cfg.gymDefTop || PokePve.GYM_DEF_TOP;

  const ids = Object.keys(species);
  // 1. melhor moveset por espécie + defBulk
  const calc = {};   // id → { best, byType, defBulk }
  for (const id of ids) {
    if (MEGA_RE.test(id)) continue;                 // Mega/Primal fora do pool
    const sp = species[id];
    if (!sp || !sp.baseStats) continue;
    const bm = PokePve.bestMoveset(sp, movesById, isShadowId(id));   // bônus Sombrio nas entradas _shadow
    calc[id] = { best: bm.best, byType: bm.byType, defBulk: sp.baseStats.def * sp.baseStats.hp };
  }

  // 2. ranking global por tipo (er e dps)
  const byTypeList = {};   // type → [{id, er, dps}]
  for (const id in calc) {
    const bt = calc[id].byType;
    for (const t in bt) (byTypeList[t] = byTypeList[t] || []).push({ id, er: bt[t].er, dps: bt[t].dps });
  }
  const erRankOf = {}, dpsRankOf = {};   // type → { id → rank }
  for (const t in byTypeList) {
    const byEr = byTypeList[t].slice().sort((a, b) => (b.er - a.er) || a.id.localeCompare(b.id));
    const byDps = byTypeList[t].slice().sort((a, b) => (b.dps - a.dps) || a.id.localeCompare(b.id));
    erRankOf[t] = {}; dpsRankOf[t] = {};
    byEr.forEach((x, i) => { erRankOf[t][x.id] = i + 1; });
    byDps.forEach((x, i) => { dpsRankOf[t][x.id] = i + 1; });
  }

  // 3. defBulkRank global
  const bulkSorted = Object.keys(calc).sort((a, b) => (calc[b].defBulk - calc[a].defBulk) || a.localeCompare(b));
  const defBulkRankOf = {};
  bulkSorted.forEach((id, i) => { defBulkRankOf[id] = i + 1; });

  // 4. monta entradas + roles
  const out = {};
  for (const id in calc) {
    const c = calc[id];
    const defBulkRank = defBulkRankOf[id];
    const byType = {};
    let bestErRank = Infinity, bestDpsCoverType = null, bestDpsCoverRank = Infinity;
    for (const t in c.byType) {
      const er = erRankOf[t][id], dr = dpsRankOf[t][id];
      byType[t] = { dps: c.byType[t].dps, tdo: c.byType[t].tdo, er: c.byType[t].er,
                    dpsRank: dr, erRank: er, moveset: c.byType[t].moveset };
      if (er < bestErRank) bestErRank = er;
      if (dr <= GATK && (OFFENSIVE_COVERAGE[t] || 0) >= GCOV && dr < bestDpsCoverRank) {
        bestDpsCoverRank = dr; bestDpsCoverType = t;
      }
    }
    const roles = [];
    if (bestErRank <= RAID) roles.push('raid');
    if (bestErRank <= PVET) roles.push('pve');
    if (bestDpsCoverType)   roles.push('gym_atk');

    const isAttacker = !!c.best;
    const isBulkCandidate = defBulkRank <= GDEF;
    if (!isAttacker && !isBulkCandidate) continue;   // nada a dizer sobre essa espécie

    out[id] = {
      bestMoveset: c.best ? c.best.moveset : null,
      bestType: c.best ? c.best.type : null,
      byType: byType,
      roles: roles,
      defBulkRank: defBulkRank,
    };
  }
  return out;
}

module.exports = { buildSpecies, buildMoves, buildMovesPve, buildMovesPt, buildPvpRanks, buildPveRanks, LEAGUES, expandCpm };
