import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivarChave } from '../src/lib/regras.js';
import { categorizarAutomatico } from '../src/lib/categorizador.js';

test('derivarChave pega as 2 primeiras palavras em maiúsculas', () => {
  assert.equal(derivarChave('CONDOR SITIO CERCADOCURITIBABRA'), 'CONDOR SITIO');
});

test('derivarChave lida com uma palavra só', () => {
  assert.equal(derivarChave('IFOOD'), 'IFOOD');
});

test('derivarChave colapsa espaços e normaliza a caixa, preservando pontuação interna', () => {
  assert.equal(derivarChave('  uber*   trip  sao paulo '), 'UBER* TRIP');
});

test('a chave derivada casa no categorizador (ida e volta)', () => {
  const desc = 'XYZ COMERCIO DE ROUPAS LTDA';
  // não casa em nenhuma palavra-chave automática
  assert.equal(categorizarAutomatico(desc, []), null);
  // com a regra derivada, passa a casar
  const regras = [{ chave: derivarChave(desc), categoria: 'vestuario' }];
  assert.equal(categorizarAutomatico(desc, regras), 'vestuario');
});
