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
