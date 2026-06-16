import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traduzErroAuth } from '../src/auth/authErrors.js';

test('credenciais inválidas', () => {
  assert.equal(
    traduzErroAuth({ message: 'Invalid login credentials' }),
    'E-mail ou senha incorretos.',
  );
});

test('e-mail já cadastrado', () => {
  assert.equal(
    traduzErroAuth({ message: 'User already registered' }),
    'Esse e-mail já está cadastrado. Tente entrar.',
  );
});

test('senha curta', () => {
  assert.equal(
    traduzErroAuth({ message: 'Password should be at least 6 characters' }),
    'A senha precisa ter ao menos 6 caracteres.',
  );
});

test('aceita string crua e mapeia falha de rede', () => {
  assert.equal(
    traduzErroAuth('Failed to fetch'),
    'Sem conexão com o servidor. Verifique sua internet.',
  );
});

test('fallback genérico para erro desconhecido ou nulo', () => {
  assert.equal(traduzErroAuth({ message: 'algo bizarro' }), 'Algo deu errado. Tente de novo.');
  assert.equal(traduzErroAuth(null), 'Algo deu errado. Tente de novo.');
});
