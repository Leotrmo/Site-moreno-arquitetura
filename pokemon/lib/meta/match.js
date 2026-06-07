// pokemon/lib/meta/match.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.PokeMatch = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function normalizeName(s) {
    return String(s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '') // tira acentos
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')                       // pontuação → espaço
      .trim().replace(/\s+/g, ' ');
  }

  return { normalizeName };
});
