import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhaParaTransacao, paraAnalise } from '../src/lib/transacaoAdapter.js';

const linha = {
  id: 'uuid-1',
  data: '2025-11-28',
  descricao: 'CONVERSE 7/10',
  descricao_original: 'CONVERSE *LOJA 7/10',
  valor: '60.00',
  banco: 'bradesco',
  pessoa: 'luis',
  categoria: 'vestuario',
  categoria_auto: false,
  eh_fixo: true,
  parcela_atual: 7,
  parcela_total: 10,
  mes_referencia: '2026-06',
};

test('linhaParaTransacao mapeia snake_case para camelCase do analisador', () => {
  const t = linhaParaTransacao(linha);
  assert.equal(t.descricao, 'CONVERSE 7/10');
  assert.equal(t.descricaoOriginal, 'CONVERSE *LOJA 7/10');
  assert.equal(t.valor, 60); // coerção numérica
  assert.equal(t.banco, 'bradesco');
  assert.equal(t.pessoa, 'luis');
  assert.equal(t.categoria, 'vestuario');
  assert.equal(t.ehFixo, true);
  assert.equal(t.parcelaAtual, 7);
  assert.equal(t.parcelaTotal, 10);
  assert.equal(t.mesReferencia, '2026-06');
});

test('linhaParaTransacao trata nulos de parcela/categoria/fixo', () => {
  const t = linhaParaTransacao({
    data: '2026-06-10', descricao: 'X', valor: 10, banco: 'itau', pessoa: 'compartilhado',
    categoria: null, eh_fixo: null, parcela_atual: null, parcela_total: null, mes_referencia: '2026-06',
  });
  assert.equal(t.categoria, null);
  assert.equal(t.ehFixo, false);
  assert.equal(t.parcelaAtual, null);
  assert.equal(t.parcelaTotal, null);
});

test('paraAnalise mapeia uma lista inteira', () => {
  const out = paraAnalise([linha, linha]);
  assert.equal(out.length, 2);
  assert.equal(out[0].mesReferencia, '2026-06');
});

test('linhaParaTransacao mapeia serie_id para serieId', () => {
  assert.equal(linhaParaTransacao({ ...linha, serie_id: 's9' }).serieId, 's9');
  assert.equal(linhaParaTransacao({ ...linha, serie_id: null }).serieId, null);
});
