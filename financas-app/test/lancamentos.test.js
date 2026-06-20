import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  intervaloDePreset,
  filtrarLancamentos,
  ordenarLancamentos,
  resumoLancamentos,
} from '../src/lib/lancamentos.js';

// transação camelCase, como sai de paraAnalise()
function tx(over) {
  return {
    id: 'id-1', data: '2026-06-10', descricao: 'MERCADO X', descricaoOriginal: 'MERCADO X LTDA',
    valor: 100, banco: 'itau', pessoa: 'compartilhado', categoria: 'mercado',
    ehFixo: false, parcelaAtual: null, parcelaTotal: null, serieId: null,
    mesReferencia: '2026-06', ...over,
  };
}
function ids(lista) { return lista.map((t) => t.id); }

// --- intervaloDePreset ---
test('intervaloDePreset: tudo = sem limites', () => {
  assert.deepEqual(intervaloDePreset('tudo', new Date(2026, 5, 19)), { de: null, ate: null });
});
test('intervaloDePreset: mes = mês de hoje nas duas pontas', () => {
  assert.deepEqual(intervaloDePreset('mes', new Date(2026, 5, 19)), { de: '2026-06', ate: '2026-06' });
});
test('intervaloDePreset: 3meses = mês atual + 2 anteriores (vira o ano)', () => {
  assert.deepEqual(intervaloDePreset('3meses', new Date(2026, 0, 15)), { de: '2025-11', ate: '2026-01' });
});
test('intervaloDePreset: ano = jan a dez do ano de hoje', () => {
  assert.deepEqual(intervaloDePreset('ano', new Date(2026, 5, 19)), { de: '2026-01', ate: '2026-12' });
});
test('intervaloDePreset: preset desconhecido cai em tudo', () => {
  assert.deepEqual(intervaloDePreset('xpto', new Date(2026, 5, 19)), { de: null, ate: null });
});

// --- filtrarLancamentos ---
const base = [
  tx({ id: 'a', mesReferencia: '2026-04', banco: 'itau', pessoa: 'leo', categoria: 'alimentacao', descricao: 'IFOOD', descricaoOriginal: 'IFOOD APP', valor: 50 }),
  tx({ id: 'b', mesReferencia: '2026-05', banco: 'bradesco', pessoa: 'luis', categoria: 'mercado', descricao: 'CONDOR', descricaoOriginal: 'CONDOR SUPER', valor: 200 }),
  tx({ id: 'c', mesReferencia: '2026-06', banco: 'itau', pessoa: 'compartilhado', categoria: null, descricao: 'XPTO', descricaoOriginal: 'XPTO', valor: 30 }),
  tx({ id: 'd', mesReferencia: '2026-06', banco: 'itau', pessoa: 'leo', categoria: 'parcelamento', descricao: 'JIM.COM', descricaoOriginal: 'JIM.COM', valor: 392.30, parcelaTotal: 10, parcelaAtual: 3 }),
  tx({ id: 'e', mesReferencia: '2026-06', banco: 'bradesco', pessoa: 'luis', categoria: 'vestuario', descricao: 'CONVERSE', descricaoOriginal: 'CONVERSE', valor: 60, serieId: 's1' }),
];

test('filtro vazio devolve tudo', () => {
  assert.equal(filtrarLancamentos(base, {}).length, base.length);
});
test('período de–até (inclusivo) por mesReferencia', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { periodo: { de: '2026-05', ate: '2026-06' } })), ['b', 'c', 'd', 'e']);
});
test('período só com de (sem teto)', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { periodo: { de: '2026-06', ate: null } })), ['c', 'd', 'e']);
});
test('filtro banco', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { banco: 'bradesco' })), ['b', 'e']);
});
test('filtro pessoa', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { pessoa: 'leo' })), ['a', 'd']);
});
test('filtro categoria por id', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { categoria: 'mercado' })), ['b']);
});
test('categoria "sem" pega pendentes (categoria null)', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { categoria: 'sem' })), ['c']);
});
test('parcelado "sim" pega parcelaTotal OU serieId', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { parcelado: 'sim' })), ['d', 'e']);
});
test('parcelado "nao" exclui parcelados e séries', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { parcelado: 'nao' })), ['a', 'b', 'c']);
});
test('busca casa em descricao (case-insensitive)', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { busca: 'ifood' })), ['a']);
});
test('busca casa em descricaoOriginal', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { busca: 'super' })), ['b']);
});
test('busca só com espaços = inativa', () => {
  assert.equal(filtrarLancamentos(base, { busca: '   ' }).length, base.length);
});
test('combinação AND de vários filtros', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { banco: 'itau', pessoa: 'leo', periodo: { de: '2026-06', ate: null } })), ['d']);
});

// --- ordenarLancamentos ---
const tres = [
  tx({ id: 'x', data: '2026-06-01', valor: 50, descricao: 'banana' }),
  tx({ id: 'y', data: '2026-06-03', valor: 10, descricao: 'Abacaxi' }),
  tx({ id: 'z', data: '2026-06-02', valor: 30, descricao: 'caju' }),
];
test('ordenar por data desc (default)', () => {
  assert.deepEqual(ids(ordenarLancamentos(tres, {})), ['y', 'z', 'x']);
});
test('ordenar por data asc', () => {
  assert.deepEqual(ids(ordenarLancamentos(tres, { campo: 'data', direcao: 'asc' })), ['x', 'z', 'y']);
});
test('ordenar por valor asc', () => {
  assert.deepEqual(ids(ordenarLancamentos(tres, { campo: 'valor', direcao: 'asc' })), ['y', 'z', 'x']);
});
test('ordenar por descricao asc (ignora caixa, pt-BR)', () => {
  assert.deepEqual(ids(ordenarLancamentos(tres, { campo: 'descricao', direcao: 'asc' })), ['y', 'x', 'z']);
});
test('ordenação é estável em empate (preserva ordem de entrada)', () => {
  const e = [tx({ id: '1', valor: 10 }), tx({ id: '2', valor: 10 }), tx({ id: '3', valor: 10 })];
  assert.deepEqual(ids(ordenarLancamentos(e, { campo: 'valor', direcao: 'asc' })), ['1', '2', '3']);
});
test('ordenar não muta a lista de entrada', () => {
  const entrada = [...tres];
  ordenarLancamentos(entrada, { campo: 'valor', direcao: 'asc' });
  assert.deepEqual(ids(entrada), ['x', 'y', 'z']);
});

// --- resumoLancamentos ---
test('resumo: contagem e soma', () => {
  const r = resumoLancamentos([tx({ valor: 10 }), tx({ valor: 20.5 }), tx({ valor: 30 })]);
  assert.equal(r.count, 3);
  assert.equal(r.soma, 60.5);
});
test('resumo de lista vazia', () => {
  assert.deepEqual(resumoLancamentos([]), { count: 0, soma: 0 });
});
