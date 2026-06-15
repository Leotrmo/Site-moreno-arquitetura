import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorizarAutomatico } from '../src/lib/categorizador.js';

test('categoriza por palavra-chave', () => {
  assert.equal(categorizarAutomatico('IFOOD *LANCHERIA'), 'alimentacao');
  assert.equal(categorizarAutomatico('CONDOR SITIO CERCADO'), 'mercado');
  assert.equal(categorizarAutomatico('MP *SHELLBOX'), 'transporte');
});

test('precedência: 99FOOD vence 99, UBER EATS vence UBER', () => {
  assert.equal(categorizarAutomatico('99FOOD *PIZZA DA KOMBI'), 'alimentacao');
  assert.equal(categorizarAutomatico('UBER EATS'), 'alimentacao');
  assert.equal(categorizarAutomatico('UBER *TRIP'), 'transporte');
});

test('regra aprendida tem prioridade sobre palavra-chave', () => {
  const regras = [{ chave: 'CONDOR', categoria: 'lazer' }];
  assert.equal(categorizarAutomatico('CONDOR SITIO CERCADO', regras), 'lazer');
});

test('retorna null quando não reconhece', () => {
  assert.equal(categorizarAutomatico('ESTABELECIMENTO DESCONHECIDO XYZ'), null);
});
