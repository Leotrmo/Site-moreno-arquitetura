// Traduz erros de autenticação do Supabase para mensagens amigáveis em PT-BR.
// Aceita o objeto de erro do supabase-js OU uma string; devolve SEMPRE uma string.

const MENSAGENS = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar.'],
  [/already registered|already been registered/i, 'Esse e-mail já está cadastrado. Tente entrar.'],
  [/password should be at least/i, 'A senha precisa ter ao menos 6 caracteres.'],
  [/unable to validate email|invalid format/i, 'E-mail inválido.'],
  [/rate limit|too many requests/i, 'Muitas tentativas. Espere um momento e tente de novo.'],
  [/failed to fetch|networkerror|network request failed/i, 'Sem conexão com o servidor. Verifique sua internet.'],
];

export function traduzErroAuth(erro) {
  if (!erro) return 'Algo deu errado. Tente de novo.';
  const msg = typeof erro === 'string' ? erro : (erro.message || '');
  for (const [re, texto] of MENSAGENS) {
    if (re.test(msg)) return texto;
  }
  return 'Algo deu errado. Tente de novo.';
}
