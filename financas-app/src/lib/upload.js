import { categorizarAutomatico } from './categorizador.js';

// Mapeia as linhas REVISADAS (camelCase) para linhas de INSERT (snake_case) e separa
// as ignoradas. Espera receber só linhas novas, mas filtra defensivamente por
// hashesExistentes e hashesIgnorados.
//
// Campos de override que a tela de revisão pode setar por linha:
// - serieId: id da série de parcelas (ou novo, gerado na UI)
// - parcelaAtual/parcelaTotal: já fluíam (Bradesco vem do parser; Itaú vem da revisão)
// - ignorada: true -> vai para `ignoradas` (tabela lancamentos_ignorados)
// - categoriaManual: categoria escolhida na revisão (desliga categoria_auto)
// - pessoaOverride: pessoa escolhida na revisão (vence o default deQuemItau)
export function prepararUpload({
  parsed,
  hashesExistentes,
  hashesIgnorados = [],
  regras = [],
  householdId,
  mesReferencia,
  deQuemItau = 'compartilhado',
  arquivoOrigem = null,
  autoCategorizar = true,
}) {
  const existentes = hashesExistentes instanceof Set ? hashesExistentes : new Set(hashesExistentes);
  const ignorados = hashesIgnorados instanceof Set ? hashesIgnorados : new Set(hashesIgnorados);

  let novas = 0;
  let jaProcessadas = 0;
  let jaIgnoradas = 0;
  let autoCategorizadas = 0;
  const linhas = [];
  const ignoradas = [];

  for (const t of parsed) {
    if (existentes.has(t.hash)) {
      jaProcessadas += 1;
      continue;
    }
    if (ignorados.has(t.hash)) {
      jaIgnoradas += 1;
      continue;
    }
    if (t.ignorada) {
      ignoradas.push({
        household_id: householdId,
        hash_origem: t.hash,
        descricao: t.descricao,
        valor: t.valor,
        banco: t.banco,
      });
      continue;
    }

    novas += 1;

    let categoria;
    let categoriaAuto;
    if (t.categoriaManual != null) {
      categoria = t.categoriaManual;
      categoriaAuto = false;
    } else {
      categoria = autoCategorizar ? categorizarAutomatico(t.descricao, regras) : null;
      categoriaAuto = categoria != null;
      if (categoriaAuto) autoCategorizadas += 1;
    }

    const pessoa = t.pessoaOverride ?? (t.banco === 'itau' ? deQuemItau : t.pessoa);

    linhas.push({
      household_id: householdId,
      data: t.data,
      descricao: t.descricao,
      descricao_original: t.descricaoOriginal,
      valor: t.valor,
      banco: t.banco,
      pessoa,
      categoria,
      categoria_auto: categoriaAuto,
      eh_fixo: t.ehFixo ?? false,
      parcela_atual: t.parcelaAtual ?? null,
      parcela_total: t.parcelaTotal ?? null,
      serie_id: t.serieId ?? null,
      arquivo_origem: arquivoOrigem,
      mes_referencia: mesReferencia,
      hash_origem: t.hash,
    });
  }

  return {
    linhas,
    ignoradas,
    resumo: { encontradas: parsed.length, jaProcessadas, jaIgnoradas, novas, autoCategorizadas },
  };
}
