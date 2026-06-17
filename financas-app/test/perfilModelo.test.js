import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perfilPadrao, normalizarPerfil, perfilVazio } from '../src/lib/perfilModelo.js';

test('perfilPadrao traz salários zerados e os 5 fixos pré-populados', () => {
  const p = perfilPadrao();
  assert.equal(p.salarios.leo, 0);
  assert.equal(p.salarios.luis, 0);
  assert.equal(p.salarios.diaPagamento, 5);
  assert.equal(p.fixos.length, 5);
  assert.equal(p.fixos[0].nome, 'Condomínio');
  assert.equal(p.fixos[0].valor, 525);
  assert.deepEqual(p.metas, []);
});

test('normalizarPerfil completa chaves ausentes sem reinjetar fixos apagados', () => {
  assert.deepEqual(normalizarPerfil({}), {
    salarios: { leo: 0, luis: 0, diaPagamento: 5 },
    fixos: [],
    metas: [],
  });
  const p = normalizarPerfil({ salarios: { leo: 5000 }, fixos: [] });
  assert.equal(p.salarios.leo, 5000);
  assert.equal(p.salarios.luis, 0);
  assert.deepEqual(p.fixos, []); // não volta a pré-popular
});

test('normalizarPerfil preserva fixos e metas existentes', () => {
  const p = normalizarPerfil({ fixos: [{ nome: 'Aluguel', valor: 1500, pessoa: 'leo' }], metas: [{ nome: 'Reserva', valor: 10000, prazoMeses: 12 }] });
  assert.equal(p.fixos[0].nome, 'Aluguel');
  assert.equal(p.metas[0].valor, 10000);
});

test('perfilVazio distingue {} de objeto com dados', () => {
  assert.equal(perfilVazio({}), true);
  assert.equal(perfilVazio(null), true);
  assert.equal(perfilVazio(undefined), true);
  assert.equal(perfilVazio({ salarios: {} }), false);
});
