// Converte a linha snake_case da tabela `transacoes` (saída de useTransacoes)
// para o shape camelCase que `analisar()` consome.
export function linhaParaTransacao(row) {
  return {
    id: row.id ?? null,
    data: row.data,
    descricao: row.descricao,
    descricaoOriginal: row.descricao_original ?? null,
    valor: Number(row.valor) || 0,
    banco: row.banco,
    pessoa: row.pessoa,
    categoria: row.categoria ?? null,
    ehFixo: row.eh_fixo ?? false,
    parcelaAtual: row.parcela_atual ?? null,
    parcelaTotal: row.parcela_total ?? null,
    serieId: row.serie_id ?? null,
    mesReferencia: row.mes_referencia,
  };
}

export function paraAnalise(linhas) {
  return linhas.map(linhaParaTransacao);
}
