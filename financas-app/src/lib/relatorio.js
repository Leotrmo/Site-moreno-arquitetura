import { analisar } from './analisador.js';
import { linhaParaTransacao } from './transacaoAdapter.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Meses distintos com dados, em ordem decrescente (mais recente primeiro).
export function mesesComDados(transacoes) {
  const set = new Set(transacoes.map((t) => t.mes_referencia).filter(Boolean));
  return [...set].sort().reverse();
}

// Um ponto por mês (ordem ascendente) com totais e score, rodando o analisador
// por mês sobre as linhas adaptadas.
export function serieMensal(transacoes, perfil = {}) {
  const meses = [...new Set(transacoes.map((t) => t.mes_referencia).filter(Boolean))].sort();
  return meses.map((mes) => {
    const doMes = transacoes.filter((t) => t.mes_referencia === mes).map(linhaParaTransacao);
    const a = analisar(doMes, perfil);
    return {
      mes,
      totalGastos: a.totalGastos,
      saldo: a.saldo,
      taxaPoupanca: a.taxaPoupanca,
      score: a.score.valor,
    };
  });
}

// Matriz categoria × mês (valor por categoria em cada mês), ordenada por total desc.
export function comparativoCategorias(transacoes) {
  const meses = [...new Set(transacoes.map((t) => t.mes_referencia).filter(Boolean))].sort();
  const mapa = new Map(); // categoria -> { mes -> valor }
  for (const t of transacoes) {
    const cat = t.categoria || 'outros';
    const porMes = mapa.get(cat) || {};
    porMes[t.mes_referencia] = (porMes[t.mes_referencia] || 0) + (Number(t.valor) || 0);
    mapa.set(cat, porMes);
  }
  const categorias = [...mapa.entries()]
    .map(([categoria, porMes]) => ({
      categoria,
      valores: meses.map((m) => round2(porMes[m] || 0)),
      total: round2(meses.reduce((s, m) => s + (porMes[m] || 0), 0)),
    }))
    .sort((a, b) => b.total - a.total);
  return { meses, categorias };
}
