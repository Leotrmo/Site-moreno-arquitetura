import { CATEGORIAS } from './categorias.js';
import { mesMaisFrequente } from './shared.js';

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

function infoCategoria(id) {
  return CATEGORIAS.find((c) => c.id === id) || { id, emoji: '❓', label: id };
}

function formatBRL(n) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}R$ ${intFmt},${dec}`;
}

function faixaScore(v) {
  if (v >= 80) return { label: 'Saudável', cor: 'success' };
  if (v >= 60) return { label: 'Atenção', cor: 'warning' };
  if (v >= 40) return { label: 'Preocupante', cor: 'danger' };
  return { label: 'Crítico', cor: 'danger' };
}

// Função pura: agrega as transações de um mês contra o perfil e devolve a análise.
export function analisar(transacoes, perfil = {}) {
  const salarios = perfil.salarios || {};
  const rendaTotal = (Number(salarios.leo) || 0) + (Number(salarios.luis) || 0);
  const totalGastos = round2(transacoes.reduce((s, t) => s + t.valor, 0));
  const saldo = round2(rendaTotal - totalGastos);
  const taxaPoupanca = rendaTotal > 0 ? round1((saldo / rendaTotal) * 100) : 0;
  const mes = mesMaisFrequente(transacoes.map((t) => t.mesReferencia));

  // por categoria (ordenada desc por valor)
  const mapaCat = new Map();
  for (const t of transacoes) {
    const id = t.categoria || 'outros';
    const e = mapaCat.get(id) || { valor: 0, transacoes: 0 };
    e.valor += t.valor;
    e.transacoes += 1;
    mapaCat.set(id, e);
  }
  const porCategoria = [...mapaCat.entries()]
    .map(([id, e]) => {
      const info = infoCategoria(id);
      return {
        id, emoji: info.emoji, label: info.label,
        valor: round2(e.valor),
        pct: totalGastos > 0 ? round1((e.valor / totalGastos) * 100) : 0,
        transacoes: e.transacoes,
      };
    })
    .sort((a, b) => b.valor - a.valor);

  // por pessoa
  const porPessoa = {};
  for (const pessoa of ['leo', 'luis', 'compartilhado']) {
    const valor = round2(
      transacoes.filter((t) => t.pessoa === pessoa).reduce((s, t) => s + t.valor, 0),
    );
    porPessoa[pessoa] = {
      valor,
      pct: totalGastos > 0 ? round1((valor / totalGastos) * 100) : 0,
    };
  }

  // fixos vs variáveis
  const fixosConfigurados = round2(
    (perfil.fixos || []).reduce((s, f) => s + (Number(f.valor) || 0), 0),
  );
  const fixosDetectados = round2(
    transacoes.filter((t) => t.ehFixo).reduce((s, t) => s + t.valor, 0),
  );
  const fixos = {
    configurados: fixosConfigurados,
    detectados: fixosDetectados,
    pctDaRenda: rendaTotal > 0 ? round1((fixosConfigurados / rendaTotal) * 100) : 0,
  };
  const variaveis = round2(totalGastos - fixosDetectados);

  // parcelamentos ativos (ainda não quitados)
  const parcelamentos = transacoes
    .filter((t) => t.parcelaTotal && t.parcelaAtual && t.parcelaAtual < t.parcelaTotal)
    .map((t) => {
      const restante = t.parcelaTotal - t.parcelaAtual;
      return {
        descricao: t.descricao,
        parcela: `${t.parcelaAtual}/${t.parcelaTotal}`,
        valorMensal: round2(t.valor),
        restante,
        totalRestante: round2(t.valor * restante),
      };
    });

  // top 10 maiores gastos
  const topTransacoes = [...transacoes].sort((a, b) => b.valor - a.valor).slice(0, 10);

  // alertas
  const alertas = [];
  if (saldo < 0) {
    alertas.push({ nivel: 'critico', icon: '🔴', msg: `Déficit de ${formatBRL(-saldo)} este mês` });
  }
  const maiorCat = porCategoria[0];
  if (maiorCat && maiorCat.pct > 25) {
    alertas.push({ nivel: 'atencao', icon: '🟡', msg: `${maiorCat.label} representa ${Math.round(maiorCat.pct)}% dos gastos` });
  }
  const totalRestanteParc = round2(parcelamentos.reduce((s, p) => s + p.totalRestante, 0));
  if (totalRestanteParc > 0) {
    alertas.push({ nivel: 'info', icon: '💳', msg: `${formatBRL(totalRestanteParc)} ainda a pagar em parcelamentos` });
  }

  // score 0–100
  let valorScore = 0;
  if (taxaPoupanca >= 20) valorScore += 25;
  else if (taxaPoupanca >= 10) valorScore += 15;
  const pctFixos = rendaTotal > 0 ? (fixosConfigurados / rendaTotal) * 100 : 100;
  if (pctFixos < 50) valorScore += 20;
  else if (pctFixos <= 70) valorScore += 10;
  if (!alertas.some((a) => a.nivel === 'critico')) valorScore += 15;
  const mensalParc = parcelamentos.reduce((s, p) => s + p.valorMensal, 0);
  if (totalGastos > 0 && (mensalParc / totalGastos) * 100 < 15) valorScore += 10;
  if ((perfil.metas || []).length > 0) valorScore += 10;
  const score = { valor: valorScore, ...faixaScore(valorScore), detalhes: [] };

  // recomendações
  const recomendacoes = [];
  if (maiorCat) {
    recomendacoes.push(`Sua maior categoria é ${maiorCat.label} (${formatBRL(maiorCat.valor)}, ${Math.round(maiorCat.pct)}% dos gastos).`);
  }
  if (totalRestanteParc > 0) {
    recomendacoes.push(`Há ${formatBRL(totalRestanteParc)} em parcelamentos a pagar. Evite novas compras parceladas.`);
  }
  recomendacoes.push(
    taxaPoupanca >= 20
      ? `Ótima taxa de poupança (${taxaPoupanca}%). Continue assim!`
      : `Taxa de poupança baixa (${taxaPoupanca}%). Tente reduzir gastos variáveis.`,
  );

  return {
    mes, rendaTotal, totalGastos, saldo, taxaPoupanca,
    porCategoria, porPessoa, fixos, variaveis,
    parcelamentos, topTransacoes, alertas, score, recomendacoes,
  };
}
