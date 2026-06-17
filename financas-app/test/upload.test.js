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
    hashesExistentes: new Set(),
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

test('prepararUpload conta já processadas vs novas pelo hash', () => {
  const parsed = [tx({ hash: 'h1' }), tx({ hash: 'h2' })];
  const { resumo } = prepararUpload({
    parsed,
    hashesExistentes: new Set(['h1']),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    autoCategorizar: false,
  });
  assert.equal(resumo.encontradas, 2);
  assert.equal(resumo.jaProcessadas, 1);
  assert.equal(resumo.novas, 1);
});

test('prepararUpload auto-categoriza e conta só as novas categorizadas', () => {
  // 'IFOOD' casa em alimentacao pelo dicionário AUTO_CATEGORIAS; hash novo.
  const parsed = [tx({ hash: 'novo', descricao: 'IFOOD CLUB' })];
  const { linhas, resumo } = prepararUpload({
    parsed,
    hashesExistentes: new Set(),
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
    hashesExistentes: new Set(),
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
    hashesExistentes: new Set(),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    autoCategorizar: false,
  });
  assert.equal(linhas[0].mes_referencia, '2026-06');
});
