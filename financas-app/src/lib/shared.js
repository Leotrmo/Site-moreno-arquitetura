// Converte valor em formato brasileiro ('1.234,56') para number.
// O /g é obrigatório: sem ele, milhares com mais de um ponto quebram.
export function parseValorBR(s) {
  return parseFloat(String(s).trim().replace(/\./g, '').replace(',', '.'));
}
