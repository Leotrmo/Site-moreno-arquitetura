import {
  parseValorBR,
  limparDescricao,
  inferirMesRefDoNome,
  inferirDataCompra,
  detectarParcela,
} from '../shared.js';

// Parser do Bradesco. Recebe o TEXTO JÁ DECODIFICADO (latin-1) — a decodificação
// do File é responsabilidade do adaptador de navegador em parsers/index.js.
// Registros são separados por '\r'; colunas por ';';
// usamos a 4ª coluna (Valor R$). Titular sempre Luis.
export function parseBradescoText(text, { nomeArquivo, mesReferencia } = {}) {
  const mesRef = mesReferencia || inferirMesRefDoNome(nomeArquivo);
  if (!mesRef) {
    throw new Error('Não foi possível inferir o mês de referência do extrato Bradesco');
  }

  const linhas = String(text)
    .split('\r')
    .map((l) => l.trim())
    .filter(Boolean);

  const inicio = linhas.findIndex((l) => l.startsWith('Data;Histórico'));
  if (inicio === -1) {
    throw new Error('Nenhuma transação encontrada. Verifique se é um extrato do Bradesco');
  }

  const out = [];
  for (let i = inicio + 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linha.startsWith('Total da fatura')) break; // descarta rodapé/lançamentos programados

    const campos = linha.split(';');
    if (campos.length < 4) continue;

    const ddmm = campos[0].trim();
    if (!/^\d{2}\/\d{2}$/.test(ddmm)) continue; // só linhas de transação (DD/MM)

    const historico = campos[1].trim();
    if (/SALDO ANTERIOR/i.test(historico)) continue;

    const valor = parseValorBR(campos[3]);
    if (!(valor > 0)) continue; // pula pagamentos/créditos (negativos) e zeros

    const parcela = detectarParcela(historico);
    const { descricao, descricaoOriginal } = limparDescricao(historico);

    out.push({
      data: inferirDataCompra(ddmm, mesRef),
      descricao,
      descricaoOriginal,
      valor,
      banco: 'bradesco',
      pessoa: 'luis',
      mesReferencia: mesRef,
      parcelaAtual: parcela ? parcela.atual : null,
      parcelaTotal: parcela ? parcela.total : null,
      categoria: null,
      ehFixo: false,
    });
  }

  if (out.length === 0) {
    throw new Error('Nenhuma transação encontrada. Verifique se é um extrato do Bradesco');
  }
  return out;
}
