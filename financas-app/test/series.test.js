import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levantarSeriesAbertas } from '../src/lib/series.js';

// Linha snake_case da tabela transacoes (só os campos usados).
const row = (over = {}) => ({
  descricao: 'JIM.COM',
  valor: 392.3,
  banco: 'itau',
  pessoa: 'compartilhado',
  serie_id: null,
  parcela_atual: null,
  parcela_total: null,
  ...over,
});

test('levantarSeriesAbertas ignora linhas sem serie_id ou sem total', () => {
  const abertas = levantarSeriesAbertas([
    row(),
    row({ serie_id: 's1', parcela_atual: 1, parcela_total: null }),
  ]);
  assert.deepEqual(abertas, []);
});

test('levantarSeriesAbertas devolve série em aberto com a próxima parcela', () => {
  const abertas = levantarSeriesAbertas([
    row({ serie_id: 's1', parcela_atual: 1, parcela_total: 3 }),
  ]);
  assert.equal(abertas.length, 1);
  assert.equal(abertas[0].serieId, 's1');
  assert.equal(abertas[0].descricao, 'JIM.COM');
  assert.equal(abertas[0].valor, 392.3);
  assert.equal(abertas[0].banco, 'itau');
  assert.equal(abertas[0].pessoa, 'compartilhado');
  assert.equal(abertas[0].total, 3);
  assert.equal(abertas[0].proximaParcela, 2);
});

test('levantarSeriesAbertas usa a MAIOR parcela_atual do grupo', () => {
  const abertas = levantarSeriesAbertas([
    row({ serie_id: 's1', parcela_atual: 1, parcela_total: 3 }),
    row({ serie_id: 's1', parcela_atual: 2, parcela_total: 3 }),
  ]);
  assert.equal(abertas.length, 1);
  assert.equal(abertas[0].proximaParcela, 3);
});

test('levantarSeriesAbertas exclui séries já completas', () => {
  const abertas = levantarSeriesAbertas([
    row({ serie_id: 's1', parcela_atual: 3, parcela_total: 3 }),
  ]);
  assert.deepEqual(abertas, []);
});

import { detectarSugestoes } from '../src/lib/series.js';

// Linha parseada camelCase (saída dos parsers + hash).
const parsed = (over = {}) => ({
  hash: 'h1',
  descricao: 'JIM.COM',
  valor: 392.3,
  banco: 'itau',
  pessoa: 'compartilhado',
  ...over,
});

const serieAberta = (over = {}) => ({
  serieId: 's1',
  descricao: 'JIM.COM',
  valor: 392.3,
  banco: 'itau',
  pessoa: 'compartilhado',
  total: 3,
  proximaParcela: 2,
  ...over,
});

test('detectarSugestoes casa por descrição+valor+banco+pessoa', () => {
  const sug = detectarSugestoes([parsed()], [serieAberta()]);
  assert.equal(sug.length, 1);
  assert.equal(sug[0].hash, 'h1');
  assert.equal(sug[0].serieId, 's1');
  assert.equal(sug[0].proximaParcela, 2);
  assert.equal(sug[0].total, 3);
});

test('detectarSugestoes NÃO casa quando o valor difere', () => {
  const sug = detectarSugestoes([parsed({ valor: 200 })], [serieAberta()]);
  assert.deepEqual(sug, []);
});

test('detectarSugestoes usa deQuemItau como pessoa no match do Itaú', () => {
  // série foi salva com pessoa 'leo'; a linha do Itaú será salva como 'leo'.
  const sug = detectarSugestoes(
    [parsed({ pessoa: 'compartilhado' })],
    [serieAberta({ pessoa: 'leo' })],
    { deQuemItau: 'leo' },
  );
  assert.equal(sug.length, 1);
});

test('detectarSugestoes não sugere a mesma série para duas linhas iguais', () => {
  const sug = detectarSugestoes(
    [parsed({ hash: 'a' }), parsed({ hash: 'b' })],
    [serieAberta()],
  );
  assert.equal(sug.length, 1);
  assert.equal(sug[0].hash, 'a');
});
