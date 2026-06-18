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

// Para cada linha parseada, procura uma série em aberto com descrição+valor+banco+
// pessoa iguais e sugere a próxima parcela. Linhas do Itaú serão salvas com a pessoa
// `deQuemItau`, então usamos ela no match. Uma série só é sugerida uma vez por arquivo.
export function detectarSugestoes(parsed, seriesAbertas, { deQuemItau = 'compartilhado' } = {}) {
  const usadas = new Set();
  const sugestoes = [];
  for (const t of parsed) {
    const pessoa = t.banco === 'itau' ? deQuemItau : t.pessoa;
    const serie = seriesAbertas.find(
      (s) =>
        !usadas.has(s.serieId) &&
        s.descricao === t.descricao &&
        s.valor === t.valor &&
        s.banco === t.banco &&
        s.pessoa === pessoa,
    );
    if (serie) {
      usadas.add(serie.serieId);
      sugestoes.push({
        hash: t.hash,
        serieId: serie.serieId,
        proximaParcela: serie.proximaParcela,
        total: serie.total,
      });
    }
  }
  return sugestoes;
}
