import { AUTO_CATEGORIAS } from './categorias.js';

// Retorna o id da categoria, ou null se não reconhecer.
// Ordem: 1) regras aprendidas (Supabase), 2) palavras-chave automáticas, 3) null.
// `regras` é um array de { chave, categoria }.
export function categorizarAutomatico(descricao, regras = []) {
  const desc = String(descricao).toUpperCase();

  for (const regra of regras) {
    if (regra.chave && desc.includes(String(regra.chave).toUpperCase())) {
      return regra.categoria;
    }
  }

  for (const [categoria, palavras] of Object.entries(AUTO_CATEGORIAS)) {
    for (const p of palavras) {
      if (desc.includes(p.toUpperCase())) return categoria;
    }
  }

  return null;
}
