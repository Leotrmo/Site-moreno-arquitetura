import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararUpload } from '../src/lib/upload.js';

// Fábrica de transação parseada (formato camelCase de saída dos parsers).
const tx = (over = {}) => ({
  hash: 'h1',
  data: '2026-06-08',
  descricao: 'IFOOD CLUB',
  descricaoOriginal: 'iFood Club',
  valor: 42.5,
  banco: 'itau',
  pessoa: 'compartilhado',
  mesReferencia: '2026-06',
  parcelaAtual: null,
  parcelaTotal: null,
  categoria: null,
  ehFixo: false,
  ...over,
});

test('prepararUpload mapeia para as colunas snake_case do banco', () => {
  const { linhas } = prepararUpload({
    parsed: [tx()],
    chavesExistentes: new Set(),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    deQuemItau: 'compartilhado',
    arquivoOrigem: 'fatura.csv',
    autoCategorizar: false,
  });
  assert.equal(linhas.length, 1);
  const l = linhas[0];
  assert.equal(l.household_id, 'HH');
  assert.equal(l.descricao_original, 'iFood Club');
  assert.equal(l.mes_referencia, '2026-06');
  assert.equal(l.hash_origem, 'h1');
  assert.equal(l.arquivo_origem, 'fatura.csv');
  assert.equal(l.eh_fixo, false);
  assert.equal(l.categoria, null); // autoCategorizar=false
  assert.equal(l.categoria_auto, false);
});

test('prepararUpload conta já processadas pela chave conteúdo+mês', () => {
  // h1 já existe NO MESMO mês (2026-06) → já processada; h2 é nova.
  const parsed = [tx({ hash: 'h1' }), tx({ hash: 'h2' })];
  const { resumo } = prepararUpload({
    parsed,
    chavesExistentes: new Set(['h1|2026-06']),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    autoCategorizar: false,
  });
  assert.equal(resumo.encontradas, 2);
  assert.equal(resumo.jaProcessadas, 1);
  assert.equal(resumo.novas, 1);
});

test('prepararUpload: MESMO conteúdo em MÊS diferente NÃO é duplicata (parcela)', () => {
  // h1 existe em 2026-03; importando em 2026-04 → chave h1|2026-04 é nova.
  const parsed = [tx({ hash: 'h1' })];
  const { linhas, resumo } = prepararUpload({
    parsed,
    chavesExistentes: new Set(['h1|2026-03']),
    householdId: 'HH',
    mesReferencia: '2026-04',
    autoCategorizar: false,
  });
  assert.equal(linhas.length, 1);
  assert.equal(resumo.novas, 1);
  assert.equal(resumo.jaProcessadas, 0);
  assert.equal(linhas[0].mes_referencia, '2026-04');
});

test('prepararUpload: MESMO conteúdo no MESMO mês É duplicata (re-export)', () => {
  const parsed = [tx({ hash: 'h1' })];
  const { linhas, resumo } = prepararUpload({
    parsed,
    chavesExistentes: new Set(['h1|2026-06']),
    householdId: 'HH',
    mesReferencia: '2026-06',
    autoCategorizar: false,
  });
  assert.equal(linhas.length, 0);
  assert.equal(resumo.jaProcessadas, 1);
});

test('prepararUpload: linha com incluir=false (repetição não confirmada) é deixada de fora', () => {
  const parsed = [tx({ hash: 'a' }), tx({ hash: 'b', incluir: false })];
  const { linhas, ignoradas, resumo } = prepararUpload({
    parsed, chavesExistentes: new Set(), householdId: 'HH',
    mesReferencia: '2026-06', autoCategorizar: false,
  });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].hash_origem, 'a');
  assert.equal(ignoradas.length, 0); // não vai pra ignorados: só não importa agora
  assert.equal(resumo.novas, 1);
});

test('prepararUpload auto-categoriza e conta só as novas categorizadas', () => {
  // 'IFOOD' casa em alimentacao pelo dicionário AUTO_CATEGORIAS; hash novo.
  const parsed = [tx({ hash: 'novo', descricao: 'IFOOD CLUB' })];
  const { linhas, resumo } = prepararUpload({
    parsed,
    chavesExistentes: new Set(),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    autoCategorizar: true,
  });
  assert.equal(linhas[0].categoria, 'alimentacao');
  assert.equal(linhas[0].categoria_auto, true);
  assert.equal(resumo.autoCategorizadas, 1);
});

test('prepararUpload aplica "de quem" só ao Itaú; Bradesco fica Luis', () => {
  const parsed = [
    tx({ hash: 'a', banco: 'itau', pessoa: 'compartilhado' }),
    tx({ hash: 'b', banco: 'bradesco', pessoa: 'luis' }),
  ];
  const { linhas } = prepararUpload({
    parsed,
    chavesExistentes: new Set(),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    deQuemItau: 'leo',
    autoCategorizar: false,
  });
  assert.equal(linhas[0].pessoa, 'leo'); // itau sobrescrito pelo "de quem"
  assert.equal(linhas[1].pessoa, 'luis'); // bradesco mantém
});

test('prepararUpload carimba o mês de referência escolhido em todas as linhas', () => {
  const parsed = [tx({ hash: 'a', mesReferencia: '2026-05' })];
  const { linhas } = prepararUpload({
    parsed,
    chavesExistentes: new Set(),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    autoCategorizar: false,
  });
  assert.equal(linhas[0].mes_referencia, '2026-06');
});

test('prepararUpload carrega serie_id e respeita parcela manual', () => {
  const parsed = [tx({ hash: 'p', serieId: 's1', parcelaAtual: 2, parcelaTotal: 3 })];
  const { linhas } = prepararUpload({
    parsed, chavesExistentes: new Set(), householdId: 'HH',
    mesReferencia: '2026-06', autoCategorizar: false,
  });
  assert.equal(linhas[0].serie_id, 's1');
  assert.equal(linhas[0].parcela_atual, 2);
  assert.equal(linhas[0].parcela_total, 3);
});

test('prepararUpload roteia linha ignorada para "ignoradas" e não para "linhas"', () => {
  const parsed = [tx({ hash: 'a' }), tx({ hash: 'b', ignorada: true, descricao: 'CONTESTADA' })];
  const { linhas, ignoradas, resumo } = prepararUpload({
    parsed, chavesExistentes: new Set(), householdId: 'HH',
    mesReferencia: '2026-06', autoCategorizar: false,
  });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].hash_origem, 'a');
  assert.equal(ignoradas.length, 1);
  assert.equal(ignoradas[0].hash_origem, 'b');
  assert.equal(ignoradas[0].descricao, 'CONTESTADA');
  assert.equal(ignoradas[0].household_id, 'HH');
  assert.equal(resumo.novas, 1);
});

test('prepararUpload exclui hashes já ignorados e conta jaIgnoradas', () => {
  const parsed = [tx({ hash: 'a' }), tx({ hash: 'velho' })];
  const { linhas, resumo } = prepararUpload({
    parsed, chavesExistentes: new Set(), hashesIgnorados: new Set(['velho']),
    householdId: 'HH', mesReferencia: '2026-06', autoCategorizar: false,
  });
  assert.equal(linhas.length, 1);
  assert.equal(resumo.jaIgnoradas, 1);
  assert.equal(resumo.novas, 1);
});

test('prepararUpload honra override manual de categoria e pessoa', () => {
  const parsed = [tx({ hash: 'm', banco: 'itau', categoriaManual: 'lazer', pessoaOverride: 'leo' })];
  const { linhas } = prepararUpload({
    parsed, chavesExistentes: new Set(), householdId: 'HH',
    mesReferencia: '2026-06', deQuemItau: 'compartilhado', autoCategorizar: true,
  });
  assert.equal(linhas[0].categoria, 'lazer');
  assert.equal(linhas[0].categoria_auto, false); // manual não é auto
  assert.equal(linhas[0].pessoa, 'leo');          // override vence deQuemItau
});
