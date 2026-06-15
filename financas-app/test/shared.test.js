import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValorBR, limparDescricao } from '../src/lib/shared.js';

test('parseValorBR converte decimal brasileiro', () => {
  assert.equal(parseValorBR('30,14'), 30.14);
  assert.equal(parseValorBR('416,28'), 416.28);
});

test('parseValorBR remove separador de milhar e aceita negativo', () => {
  assert.equal(parseValorBR('3.350,07'), 3350.07);
  assert.equal(parseValorBR('-3350,07'), -3350.07);
});

test('limparDescricao colapsa espaços e mantém o original', () => {
  const r = limparDescricao('EC          *SHELLBOXRIO DE JANEIRBRA');
  assert.equal(r.descricaoOriginal, 'EC *SHELLBOXRIO DE JANEIRBRA');
  assert.equal(r.descricao, 'EC *SHELLBOXRIO DE JANEIR'); // só o sufixo BRA sai
});

test('limparDescricao não destrói o nome do estabelecimento', () => {
  const r = limparDescricao('CONDOR SITIO CERCADOCURITIBABRA');
  assert.equal(r.descricao, 'CONDOR SITIO CERCADOCURITIBA'); // cidade colada permanece
});

test('limparDescricao sem sufixo de país mantém o texto', () => {
  const r = limparDescricao('Mensalidade - Plano do cartão');
  assert.equal(r.descricao, 'MENSALIDADE - PLANO DO CARTÃO');
});
