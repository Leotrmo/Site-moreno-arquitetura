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

// Extrai 'AAAA-MM' de um nome tipo 'Bradesco_DDMMYYYY_HHMMSS.csv'.
export function inferirMesRefDoNome(nome) {
  const m = String(nome).match(/(\d{2})(\d{2})(20\d{2})(?:_|\D)/); // DD MM YYYY (ano 20xx), seguido de _ ou não-dígito
  if (!m) return null;
  const [, , mm, yyyy] = m;
  return `${yyyy}-${mm}`;
}

// Resolve a data completa de uma compra 'DD/MM' dado o mês da fatura.
// Parcelas datadas de meses à frente do mês da fatura são do ano anterior.
export function inferirDataCompra(ddmm, mesRef) {
  const [dd, mm] = ddmm.split('/');
  const [anoRef, mesRefNum] = mesRef.split('-').map(Number);
  const ano = Number(mm) > mesRefNum ? anoRef - 1 : anoRef;
  return `${ano}-${mm}-${dd}`;
}

// Mês ('AAAA-MM') mais frequente em uma lista de datas ISO.
export function mesMaisFrequente(datasISO) {
  const cont = new Map();
  for (const d of datasISO) {
    const ym = d.slice(0, 7);
    cont.set(ym, (cont.get(ym) ?? 0) + 1);
  }
  let melhor = null;
  let max = -1;
  for (const [ym, n] of cont) {
    if (n > max) {
      max = n;
      melhor = ym;
    }
  }
  return melhor;
}
