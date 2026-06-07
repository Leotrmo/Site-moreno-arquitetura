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

module.exports = { buildSpecies, buildMoves };
