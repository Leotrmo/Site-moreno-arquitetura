import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisar } from '../src/lib/analisador.js';

function tx(over) {
  return {
    data: '2026-06-10', descricao: 'X', valor: 0, banco: 'itau', pessoa: 'compartilhado',
    categoria: 'outros', ehFixo: false, parcelaAtual: null, parcelaTotal: null,
    mesReferencia: '2026-06', ...over,
  };
}

const perfil = {
  salarios: { leo: 5000, luis: 4000 },
  fixos: [{ nome: 'Aluguel', valor: 1500, pessoa: 'leo' }],
  metas: [{ nome: 'Reserva', valor: 15000, prazoMeses: 12 }],
};

const transacoes = [
  tx({ descricao: 'CONDOR', valor: 200, pessoa: 'compartilhado', categoria: 'mercado' }),
  tx({ descricao: 'ALUGUEL', valor: 1500, pessoa: 'leo', categoria: 'moradia', ehFixo: true }),
  tx({ descricao: 'IFOOD', valor: 100, pessoa: 'luis', categoria: 'alimentacao', banco: 'bradesco' }),
  tx({ descricao: 'CONVERSE 7/10', valor: 60, pessoa: 'luis', categoria: 'vestuario',
       parcelaAtual: 7, parcelaTotal: 10, data: '2025-11-28' }),
];

test('resumo: renda, gastos, saldo e taxa de poupança', () => {
  const a = analisar(transacoes, perfil);
  assert.equal(a.mes, '2026-06');
  assert.equal(a.rendaTotal, 9000);
  assert.equal(a.totalGastos, 1860);
  assert.equal(a.saldo, 7140);
  assert.equal(a.taxaPoupanca, 79.3);
});

test('por categoria ordenada desc e por pessoa', () => {
  const a = analisar(transacoes, perfil);
  assert.equal(a.porCategoria.length, 4);
  assert.equal(a.porCategoria[0].id, 'moradia');
  assert.equal(a.porCategoria[0].valor, 1500);
  assert.equal(a.porCategoria[0].label, 'Moradia');
  assert.equal(a.porPessoa.leo.valor, 1500);
  assert.equal(a.porPessoa.luis.valor, 160);
  assert.equal(a.porPessoa.compartilhado.valor, 200);
});

test('fixos vs variáveis e parcelamentos ativos', () => {
  const a = analisar(transacoes, perfil);
  assert.equal(a.fixos.configurados, 1500);
  assert.equal(a.fixos.detectados, 1500);
  assert.equal(a.variaveis, 360);
  assert.equal(a.parcelamentos.length, 1);
  assert.equal(a.parcelamentos[0].restante, 3);
  assert.equal(a.parcelamentos[0].totalRestante, 180);
});

test('top transações, alertas e score saudável', () => {
  const a = analisar(transacoes, perfil);
  assert.equal(a.topTransacoes[0].valor, 1500);
  assert.equal(a.topTransacoes.length, 4);
  assert.ok(!a.alertas.some((al) => al.nivel === 'critico'));
  assert.ok(a.alertas.some((al) => al.nivel === 'atencao')); // moradia 80%
  assert.ok(a.alertas.some((al) => al.nivel === 'info'));     // parcelamento
  assert.equal(a.score.valor, 80);
  assert.equal(a.score.label, 'Saudável');
  assert.equal(a.score.cor, 'success');
  assert.ok(a.recomendacoes.length >= 2);
});

test('déficit gera alerta crítico e score baixo', () => {
  const pobre = { salarios: { leo: 1000, luis: 0 }, fixos: [{ nome: 'x', valor: 900 }], metas: [] };
  const t = [tx({ descricao: 'COMPRA', valor: 2000, pessoa: 'leo', categoria: 'mercado' })];
  const a = analisar(t, pobre);
  assert.equal(a.saldo, -1000);
  assert.ok(a.alertas.some((al) => al.nivel === 'critico'));
  assert.equal(a.score.cor, 'danger');
  assert.ok(a.score.valor < 40);
});
