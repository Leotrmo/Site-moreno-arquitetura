import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValorBR, limparDescricao, inferirMesRefDoNome, inferirDataCompra, mesMaisFrequente } from '../src/lib/shared.js';

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

test('inferirMesRefDoNome lê DDMMYYYY do nome do Bradesco', () => {
  assert.equal(inferirMesRefDoNome('Bradesco_13062026_225114.csv'), '2026-06');
});

test('inferirMesRefDoNome retorna null sem data no nome', () => {
  assert.equal(inferirMesRefDoNome('fatura-1018241898.csv'), null);
});

test('inferirDataCompra resolve o ano de parcelas antigas', () => {
  assert.equal(inferirDataCompra('10/06', '2026-06'), '2026-06-10');
  assert.equal(inferirDataCompra('06/03', '2026-06'), '2026-03-06');
  // mês maior que o da fatura => ano anterior
  assert.equal(inferirDataCompra('28/11', '2026-06'), '2025-11-28');
});

test('mesMaisFrequente escolhe o mês com mais lançamentos', () => {
  const datas = ['2026-06-09', '2026-06-08', '2026-06-04', '2026-03-15'];
  assert.equal(mesMaisFrequente(datas), '2026-06');
});
