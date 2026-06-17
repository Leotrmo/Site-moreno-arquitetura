import { categorizarAutomatico } from './categorizador.js';

// Transforma as transações parseadas (camelCase, saída dos parsers) em linhas
// prontas para o INSERT em `transacoes` (snake_case) e calcula as contagens do
// preview do upload.
//
// - autoCategorizar (default true): aplica categorizarAutomatico; quando uma
//   categoria é encontrada, marca categoria_auto=true (revisável no Q&A).
//   Desligado, tudo entra como pendente (categoria=null, categoria_auto=false).
// - deQuemItau: sobrescreve `pessoa` SÓ nas linhas do Itaú (cartão compartilhado);
//   Bradesco mantém o que veio do parser ('luis').
// - mesReferencia: carimbado em TODAS as linhas (o hash não depende dele, então
//   trocar o mês não afeta a deduplicação).
export function prepararUpload({
  parsed,
  hashesExistentes,
  regras = [],
  householdId,
  mesReferencia,
  deQuemItau = 'compartilhado',
  arquivoOrigem = null,
  autoCategorizar = true,
}) {
  const existentes = hashesExistentes instanceof Set ? hashesExistentes : new Set(hashesExistentes);
  let novas = 0;
  let jaProcessadas = 0;
  let autoCategorizadas = 0;

  const linhas = parsed.map((t) => {
    const jaExiste = existentes.has(t.hash);
    if (jaExiste) jaProcessadas += 1;
    else novas += 1;

    const categoria = autoCategorizar ? categorizarAutomatico(t.descricao, regras) : null;
    const categoriaAuto = categoria != null;
    if (!jaExiste && categoriaAuto) autoCategorizadas += 1;

    const pessoa = t.banco === 'itau' ? deQuemItau : t.pessoa;

    return {
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
      arquivo_origem: arquivoOrigem,
      mes_referencia: mesReferencia,
      hash_origem: t.hash,
    };
  });

  return {
    linhas,
    resumo: {
      encontradas: parsed.length,
      jaProcessadas,
      novas,
      autoCategorizadas,
    },
  };
}
