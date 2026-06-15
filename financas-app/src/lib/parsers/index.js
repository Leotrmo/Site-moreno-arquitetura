import { parseBradescoText } from './bradesco.js';
import { parseItauText } from './itau.js';
import { finalizar } from '../hash.js';

// Faz o dispatch por banco sobre TEXTO já decodificado e adiciona o hash de dedup.
export function parseCSVText(text, banco, opts = {}) {
  let rows;
  if (banco === 'bradesco') {
    rows = parseBradescoText(text, opts);
  } else if (banco === 'itau') {
    rows = parseItauText(text, opts);
  } else {
    throw new Error(`Banco desconhecido: ${banco}`);
  }
  return finalizar(rows);
}

// Adaptador de navegador: lê o File, decodifica com o encoding certo e delega.
// (Não coberto por testes Node — depende de File/TextDecoder do navegador.)
export async function parseCSV(file, banco, mesReferencia) {
  const buffer = await file.arrayBuffer();
  const encoding = banco === 'bradesco' ? 'iso-8859-1' : 'utf-8';
  const text = new TextDecoder(encoding).decode(buffer);
  return parseCSVText(text, banco, { nomeArquivo: file.name, mesReferencia });
}
