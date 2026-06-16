import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarLogin, validarCadastro } from '../src/auth/validation.js';

test('login válido não tem erros', () => {
  assert.deepEqual(validarLogin({ email: 'leo@x.com', senha: '123456' }), { ok: true, erros: {} });
});

test('login: e-mail inválido e senha vazia', () => {
  const r = validarLogin({ email: 'nada', senha: '' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.email);
  assert.ok(r.erros.senha);
});

test('cadastro: senha < 6 reprova, mas nome Leo é aceito', () => {
  const r = validarCadastro({ email: 'leo@x.com', senha: '123', nomeMembro: 'Leo' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.senha);
  assert.equal(r.erros.nomeMembro, undefined);
});

test('cadastro: nome fora de Leo/Luis reprova', () => {
  const r = validarCadastro({ email: 'leo@x.com', senha: '123456', nomeMembro: 'Fulano' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.nomeMembro);
});

test('cadastro válido (Luis) não tem erros', () => {
  assert.deepEqual(
    validarCadastro({ email: 'luis@x.com', senha: 'segredo', nomeMembro: 'Luis' }),
    { ok: true, erros: {} },
  );
});
