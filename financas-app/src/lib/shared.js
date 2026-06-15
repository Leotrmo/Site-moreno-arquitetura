// Converte valor em formato brasileiro ('1.234,56') para number.
// O /g é obrigatório: sem ele, milhares com mais de um ponto quebram.
export function parseValorBR(s) {
  return parseFloat(String(s).trim().replace(/\./g, '').replace(',', '.'));
}

// Normaliza a descrição preservando o original.
// Conservador: remove APENAS o sufixo de país (BRA/USA/ARG/EUR), nunca a cidade
// colada — o match por palavra-chave funciona mesmo com a cidade junto.
export function limparDescricao(raw) {
  const descricaoOriginal = String(raw).trim().replace(/\s+/g, ' ');
  const descricao = descricaoOriginal
    .toUpperCase()
    .replace(/\s*(?:BRA|USA|ARG|EUR)\s*$/i, '')
    .trim();
  return { descricao, descricaoOriginal };
}
