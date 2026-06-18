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

  // Critério principal de cada ordenação, na direção "natural" (a que o rótulo anuncia).
  // O desempate por nome (A-Z) é aplicado depois, em getSorter, e NÃO inverte com a direção —
  // assim alternar a direção vira o critério (veredito/IV/PC/nº) sem bagunçar a ordem alfabética.
  const PRIMARY = {
    recomendado: (a, b) => (VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict]) || (b.ivPct - a.ivPct),
    nome:        (a, b) => byName(a, b) || (b.ivPct - a.ivPct),
    numero:      (a, b) => (a.number - b.number) || (b.ivPct - a.ivPct),
    cp:          (a, b) => (b.cp - a.cp) || (b.ivPct - a.ivPct),
    iv:          (a, b) => (b.ivPct - a.ivPct) || (b.cp - a.cp),
  };

  // Mantido por compatibilidade: os comparadores completos na direção natural.
  const COMPARATORS = {};
  for (const k in PRIMARY) COMPARATORS[k] = (a, b) => PRIMARY[k](a, b) || byName(a, b);

  // Ordem em que as opções aparecem no seletor da tela. O sentido entre parênteses
  // é a direção natural; o botão ↑/↓ ao lado inverte qualquer uma delas.
  const SORT_OPTIONS = [
    { key: 'recomendado', label: '⭐ Recomendado (investir → transferir)' },
    { key: 'nome',        label: '🔤 Nome (A-Z)' },
    { key: 'numero',      label: '# Nº do Pokédex (menor)' },
    { key: 'cp',          label: '⚔️ PC (maior)' },
    { key: 'iv',          label: '📊 IV (maior)' },
  ];

  // reversed=true inverte só o critério principal; o desempate por nome segue A-Z.
  function getSorter(key, reversed) {
    const primary = PRIMARY[key] || PRIMARY.recomendado;
    const sign = reversed ? -1 : 1;
    return (a, b) => (sign * primary(a, b)) || byName(a, b);
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

  // ---- Fase 5: ordenação pela lente ativa. pvp/colecao/eficiencia por score desc;
  // xp pior-primeiro (IV asc). Mon sem scores → -Infinity (vai p/ o fim em desc).
  function _pvpBestScore(e) {
    var s = e.scores;
    if (!s || !s.pvp) return -Infinity;
    return Math.max(s.pvp.great || 0, s.pvp.ultra || 0, s.pvp.master || 0);
  }
  function _lensScore(e, lens) {
    var s = e.scores;
    if (lens === 'pvp') return _pvpBestScore(e);
    if (lens === 'colecao') return (s && typeof s.colecao === 'number') ? s.colecao : -Infinity;
    return (s && s.best && typeof s.best.value === 'number') ? s.best.value : -Infinity; // eficiencia
  }
  function lensSorter(lens) {
    if (lens === 'xp') {
      // "o que alimentar p/ doce/XP": fodder (verdict TRANSFERIR) primeiro, depois pior-IV (asc).
      return function (a, b) {
        var fa = a.verdict === 'TRANSFERIR' ? 0 : 1;
        var fb = b.verdict === 'TRANSFERIR' ? 0 : 1;
        return (fa - fb) || (a.ivPct - b.ivPct) || (a.cp - b.cp) || byName(a, b);
      };
    }
    return function (a, b) {
      return (_lensScore(b, lens) - _lensScore(a, lens)) || (b.ivPct - a.ivPct) || byName(a, b);
    };
  }

  return { COMPARATORS, SORT_OPTIONS, getSorter, COMP_RANK_KEYS, rankFor, competitiveRankSorter, lensSorter };
});
