import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItauText } from '../src/lib/parsers/itau.js';

// Fixture ANONIMIZADA: utf-8 com BOM, valores com ponto decimal,
// PAGAMENTO COM SALDO negativo a ignorar, descrição com cidade+país colados.
const BOM = String.fromCharCode(0xFEFF); // simula o BOM do Itaú sem caractere invisível
const FIX = BOM + 'data,lançamento,valor\n'
  + '2026-06-09,PAGAMENTO COM SALDO,-1826.59\n'
  + '2026-06-09,EC          *SHELLBOXRIO DE JANEIRBRA,97.13\n'
  + '2026-06-08,CONDOR SITIO CERCADOCURITIBABRA,15.6\n'
  + '2026-06-04,Mensalidade - Plano do cartão,80\n'
  + '2026-03-15,JIM.COM* 50747091 ELISAO JOSE DOSBRA,392.3';

test('parseItau ignora cabeçalho e valores negativos', () => {
  const r = parseItauText(FIX, { mesReferencia: '2026-06' });
  assert.equal(r.length, 4); // PAGAMENTO COM SALDO fora
  assert.ok(!r.some((t) => t.descricao.includes('PAGAMENTO COM SALDO')));
});

test('parseItau limpa sufixo de país mas mantém o estabelecimento', () => {
  const r = parseItauText(FIX, { mesReferencia: '2026-06' });
  const shell = r.find((t) => t.descricao.includes('SHELLBOX'));
  assert.equal(shell.descricao, 'EC *SHELLBOXRIO DE JANEIR');
  assert.equal(shell.descricaoOriginal, 'EC *SHELLBOXRIO DE JANEIRBRA');
  assert.equal(shell.valor, 97.13);
  assert.equal(shell.banco, 'itau');
  assert.equal(shell.pessoa, 'compartilhado');
});

test('parseItau usa o mês informado como referência de todas as linhas', () => {
  const r = parseItauText(FIX, { mesReferencia: '2026-06' });
  // a compra de março continua com mesReferencia da fatura (junho)
  const marco = r.find((t) => t.data === '2026-03-15');
  assert.equal(marco.mesReferencia, '2026-06');
  assert.equal(marco.valor, 392.3);
});

test('parseItau infere o mês mais frequente quando não informado', () => {
  const r = parseItauText(FIX); // sem mesReferencia
  assert.ok(r.every((t) => t.mesReferencia === '2026-06'));
});
