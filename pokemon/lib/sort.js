// pokemon/lib/sort.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // Mesma ordem de prioridade usada na análise: o que investir primeiro.
  const VERDICT_ORDER = { INVESTIR: 0, MANTER: 1, TRANSFERIR: 2 };

  function byName(a, b) {
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  }

  // Cada comparador usa critérios de desempate para uma ordem estável e previsível.
  const COMPARATORS = {
    recomendado: (a, b) =>
      (VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]) || (b.ivPct - a.ivPct) || byName(a, b),
    nome:   (a, b) => byName(a, b) || (b.ivPct - a.ivPct),
    numero: (a, b) => (a.number - b.number) || byName(a, b) || (b.ivPct - a.ivPct),
    cp:     (a, b) => (b.cp - a.cp) || byName(a, b),
    iv:     (a, b) => (b.ivPct - a.ivPct) || (b.cp - a.cp) || byName(a, b),
  };

  // Ordem em que as opções aparecem no seletor da tela.
  const SORT_OPTIONS = [
    { key: 'recomendado', label: '⭐ Recomendado' },
    { key: 'nome',        label: '🔤 Nome (A-Z)' },
    { key: 'numero',      label: '# Nº do Pokédex' },
    { key: 'cp',          label: '⚔️ PC (maior)' },
    { key: 'iv',          label: '📊 IV (maior)' },
  ];

  function getSorter(key) {
    return COMPARATORS[key] || COMPARATORS.recomendado;
  }

  // Dimensões competitivas com rank (rocket não tem rank → fora).
  const COMP_RANK_KEYS = ['pvp_great', 'pvp_ultra', 'pvp_master', 'raid', 'gym_def'];

  // Rank do mon na dimensão do chip ativo. Menor = melhor. Ausente → Infinity (vai p/ o fim).
  function rankFor(e, key) {
    if (key === 'pvp_great' || key === 'pvp_ultra' || key === 'pvp_master') {
      const lg = key.slice(4);
      const L = e.pvpMeta && e.pvpMeta[lg];
      return (L && L.isMeta && typeof L.ivRank === 'number') ? L.ivRank : Infinity;
    }
    if (key === 'raid') {
      const bt = e.pveMeta && e.pveMeta.byType;
      if (!bt) return Infinity;
      let best = Infinity;
      for (const t in bt) if (typeof bt[t].erRank === 'number' && bt[t].erRank < best) best = bt[t].erRank;
      return best;
    }
    if (key === 'gym_def') {
      return (e.pveMeta && typeof e.pveMeta.defBulkRank === 'number') ? e.pveMeta.defBulkRank : Infinity;
    }
    return Infinity;
  }

  // Comparador: rank asc, desempate IV% desc, depois nome.
  function competitiveRankSorter(key) {
    return (a, b) => (rankFor(a, key) - rankFor(b, key)) || (b.ivPct - a.ivPct) || byName(a, b);
  }

  return { COMPARATORS, SORT_OPTIONS, getSorter, COMP_RANK_KEYS, rankFor, competitiveRankSorter };
});
