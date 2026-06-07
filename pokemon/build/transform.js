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

module.exports = { buildSpecies };
