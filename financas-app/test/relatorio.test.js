import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesesComDados, serieMensal, comparativoCategorias } from '../src/lib/relatorio.js';

// linhas snake_case, como vêm de useTransacoes
function row(over) {
  return {
    data: '2026-06-10', descricao: 'X', valor: 100, banco: 'itau', pessoa: 'compartilhado',
    categoria: 'mercado', eh_fixo: false, parcela_atual: null, parcela_total: null,
    mes_referencia: '2026-06', ...over,
  };
}

const transacoes = [
  row({ mes_referencia: '2026-05', valor: 200, categoria: 'mercado' }),
  row({ mes_referencia: '2026-06', valor: 100, categoria: 'mercado' }),
  row({ mes_referencia: '2026-06', valor: 50, categoria: 'lazer' }),
];
const perfil = { salarios: { leo: 5000, luis: 0 }, fixos: [], metas: [] };

test('mesesComDados lista meses distintos em ordem decrescente', () => {
  assert.deepEqual(mesesComDados(transacoes), ['2026-06', '2026-05']);
});

test('serieMensal devolve um ponto por mês ( asc) com totais e score', () => {
  const s = serieMensal(transacoes, perfil);
  assert.equal(s.length, 2);
  assert.equal(s[0].mes, '2026-05');
  assert.equal(s[0].totalGastos, 200);
  assert.equal(s[1].mes, '2026-06');
  assert.equal(s[1].totalGastos, 150);
  assert.equal(s[1].saldo, 4850); // 5000 - 150
  assert.equal(typeof s[1].score, 'number');
});

test('comparativoCategorias monta matriz categoria × mês', () => {
  const { meses, categorias } = comparativoCategorias(transacoes);
  assert.deepEqual(meses, ['2026-05', '2026-06']);
  const mercado = categorias.find((c) => c.categoria === 'mercado');
  assert.deepEqual(mercado.valores, [200, 100]); // mai, jun
  assert.equal(mercado.total, 300);
  // ordenado por total desc: mercado (300) antes de lazer (50)
  assert.equal(categorias[0].categoria, 'mercado');
});
