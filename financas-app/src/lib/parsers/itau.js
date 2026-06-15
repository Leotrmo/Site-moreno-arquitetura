import { limparDescricao, mesMaisFrequente } from '../shared.js';

// Parser do Itaú. Recebe o TEXTO JÁ DECODIFICADO (utf-8). Datas em ISO (AAAA-MM-DD),
// valores com PONTO decimal, positivo = gasto. Cartão compartilhado.
// Usa primeiro e último vírgula para isolar data/valor (descrição pode conter vírgula).
export function parseItauText(text, { mesReferencia } = {}) {
  const linhas = String(text)
    .replace(new RegExp('^' + String.fromCharCode(0xFEFF)), '') // remove BOM
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const corpo = linhas.length && linhas[0].toLowerCase().startsWith('data,')
    ? linhas.slice(1)
    : linhas;

  const intermediario = [];
  for (const linha of corpo) {
    const idx1 = linha.indexOf(',');
    const idx2 = linha.lastIndexOf(',');
    if (idx1 === -1 || idx1 === idx2) continue;

    const data = linha.slice(0, idx1).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;

    const lancamento = linha.slice(idx1 + 1, idx2).trim();
    const valor = Number(linha.slice(idx2 + 1).trim());
    if (!(valor > 0)) continue; // pula PAGAMENTO COM SALDO e quaisquer negativos

    const { descricao, descricaoOriginal } = limparDescricao(lancamento);
    intermediario.push({ data, descricao, descricaoOriginal, valor });
  }

  const mesRef = mesReferencia || mesMaisFrequente(intermediario.map((r) => r.data));

  const out = intermediario.map((r) => ({
    data: r.data,
    descricao: r.descricao,
    descricaoOriginal: r.descricaoOriginal,
    valor: r.valor,
    banco: 'itau',
    pessoa: 'compartilhado',
    mesReferencia: mesRef,
    parcelaAtual: null,
    parcelaTotal: null,
    categoria: null,
    ehFixo: false,
  }));

  if (out.length === 0) {
    throw new Error('Nenhuma transação encontrada. Verifique se é um extrato do Itaú');
  }
  return out;
}
