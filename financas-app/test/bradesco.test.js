import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBradescoText } from '../src/lib/parsers/bradesco.js';

// Fixture ANONIMIZADA com a estrutura real: registros separados por '\r',
// cabeçalho-lixo antes do header, pagamento negativo, SALDO ANTERIOR,
// parcela antiga (28/11) e rodapé 'Total da fatura' seguido de seção a descartar.
const FIX = [
  'Data: 13/06/2026 10:51:02',
  'Situação da Fatura: ABERTA',
  'TITULAR EXEMPLO ;;; 0000',
  'Data;Histórico;Valor(US$);Valor(R$);',
  '10/06;SALDO ANTERIOR ;0,00;3350,07',
  '10/06;CONDOR SITIO CERCADO ;0,00;30,14',
  '09/06;PICPAY*EXEMPLO 1/3;0,00;416,28',
  '09/06;PAGTO ANTECIPADO PIX ;0,00;-3350,07',
  '28/11;Converse All Sta 7/10;0,00;59,98',
  'Total da fatura em Real: ;;;2847,51',
  'Lançamentos programados',
  'Data;Histórico;Valor(US$);Valor(R$);',
  '13/04/2026;PICPAY*EXEMPLO Sa 3/3;;373,91',
].join('\r');

test('parseBradesco ignora cabeçalho, SALDO, negativos e o rodapé', () => {
  const r = parseBradescoText(FIX, { nomeArquivo: 'Bradesco_13062026_225114.csv' });
  assert.equal(r.length, 3); // CONDOR, PICPAY 1/3, Converse
  const descricoes = r.map((t) => t.descricao);
  assert.ok(descricoes.some((d) => d.startsWith('CONDOR')));
  assert.ok(!descricoes.some((d) => d.includes('SALDO')));
  assert.ok(!descricoes.some((d) => d.includes('PAGTO')));
});

test('parseBradesco mapeia campos e infere ano de parcela antiga', () => {
  const r = parseBradescoText(FIX, { nomeArquivo: 'Bradesco_13062026_225114.csv' });
  const condor = r.find((t) => t.descricao.startsWith('CONDOR'));
  assert.equal(condor.data, '2026-06-10');
  assert.equal(condor.valor, 30.14);
  assert.equal(condor.pessoa, 'luis');
  assert.equal(condor.banco, 'bradesco');
  assert.equal(condor.mesReferencia, '2026-06');
  assert.equal(condor.parcelaAtual, null);

  const picpay = r.find((t) => t.descricao.includes('PICPAY'));
  assert.equal(picpay.parcelaAtual, 1);
  assert.equal(picpay.parcelaTotal, 3);
  assert.equal(picpay.valor, 416.28);

  const converse = r.find((t) => t.descricao.includes('CONVERSE'));
  assert.equal(converse.data, '2025-11-28'); // mês > junho => ano anterior
  assert.equal(converse.parcelaTotal, 10);
});

test('parseBradesco lança erro se não achar o header', () => {
  assert.throws(() => parseBradescoText('lixo qualquer', { nomeArquivo: 'Bradesco_13062026_2.csv' }),
    /Nenhuma transação encontrada/);
});
