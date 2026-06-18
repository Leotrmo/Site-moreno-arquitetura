// Funções puras de séries de parcelas. Operam sobre linhas snake_case da tabela
// `transacoes` (entrada) e linhas parseadas camelCase (na detecção, Task 3).

// Uma "série em aberto" = grupo de transações com mesmo serie_id e parcela_total
// definido, onde a maior parcela_atual ainda é menor que o total.
export function levantarSeriesAbertas(transacoes) {
  const grupos = new Map(); // serie_id -> acumulado
  for (const t of transacoes) {
    if (!t.serie_id || t.parcela_total == null) continue;
    const atual = t.parcela_atual ?? 0;
    const g = grupos.get(t.serie_id);
    if (!g) {
      grupos.set(t.serie_id, {
        serieId: t.serie_id,
        descricao: t.descricao,
        valor: Number(t.valor) || 0,
        banco: t.banco,
        pessoa: t.pessoa,
        total: t.parcela_total,
        maxAtual: atual,
      });
    } else {
      g.maxAtual = Math.max(g.maxAtual, atual);
    }
  }
  const abertas = [];
  for (const g of grupos.values()) {
    if (g.maxAtual < g.total) {
      abertas.push({
        serieId: g.serieId,
        descricao: g.descricao,
        valor: g.valor,
        banco: g.banco,
        pessoa: g.pessoa,
        total: g.total,
        proximaParcela: g.maxAtual + 1,
      });
    }
  }
  return abertas;
}
