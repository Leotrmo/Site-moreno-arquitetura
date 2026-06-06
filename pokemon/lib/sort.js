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

  return { COMPARATORS, SORT_OPTIONS, getSorter };
});
