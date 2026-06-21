// pokemon/lib/import.js
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function looksLikeMon(entry) {
    return !!entry && typeof entry === 'object' &&
      typeof entry.mon_name === 'string' &&
      typeof entry.mon_cp === 'number' &&
      typeof entry.mon_number === 'number';
  }

  // Recebe o texto de um arquivo/textarea, valida o shape do export do SpooferPro
  // e resume. NÃO transforma os dados (o export já é o shape do colecao.json).
  function parseCollection(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, error: 'Não consegui ler o arquivo: não é um JSON válido.' };
    }
    const fd = data && data.fileData;
    if (!fd || typeof fd !== 'object' || Array.isArray(fd)) {
      return { ok: false, error: "Esse JSON não tem 'fileData' — não parece um export do SpooferPro." };
    }
    const ids = Object.keys(fd);
    if (ids.length === 0) {
      return { ok: false, error: "O export está vazio (nenhum Pokémon em 'fileData')." };
    }
    const sample = ids.slice(0, 3).map(id => fd[id]);
    if (!sample.every(looksLikeMon)) {
      return { ok: false, error: 'Esse JSON não parece uma coleção de Pokémon (faltam campos como mon_name/mon_cp).' };
    }
    return {
      ok: true,
      data,
      summary: {
        count: ids.length,
        exportTime: data.exportTime || '',
        fileName: data.fileName || '',
      },
    };
  }

  return { parseCollection };
});
