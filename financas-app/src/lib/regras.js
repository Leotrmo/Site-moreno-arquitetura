// Deriva a chave de uma regra a partir da descrição: as ~2 primeiras "palavras"
// (separadas por espaço) em MAIÚSCULAS. Mantém a pontuação interna do token
// (ex.: 'UBER*') para que a chave seja uma SUBSTRING literal da descrição limpa
// — assim o `desc.includes(chave)` do categorizador casa de volta.
export function derivarChave(descricao) {
  return String(descricao)
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');
}
