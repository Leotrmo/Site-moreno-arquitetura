// Hash não-criptográfico (djb2) — só precisa ser estável e bem distribuído.
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; // h * 33 + c, mantém 32-bit unsigned
  }
  return h.toString(36);
}

// Hash de CONTEÚDO (não usa nome de arquivo nem índice): estável ao re-baixar o extrato.
export function hashTransacao({ banco, data, descricao, valor, ocorrencia = 0 }) {
  return djb2(`${banco}:${data}:${descricao}:${valor}:${ocorrencia}`);
}

// Atribui hash a cada transação. Duplicatas idênticas (mesmo banco/data/descricao/valor)
// recebem um contador de ocorrência crescente para não colidirem.
export function finalizar(transacoes) {
  const contador = new Map();
  return transacoes.map((t) => {
    const chave = `${t.banco}:${t.data}:${t.descricao}:${t.valor}`;
    const ocorrencia = contador.get(chave) ?? 0;
    contador.set(chave, ocorrencia + 1);
    return { ...t, hash: hashTransacao({ ...t, ocorrencia }) };
  });
}
