// Validação pura dos formulários de auth. Retorna { ok, erros: { campo: mensagem } }.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENHA_MIN = 6;
const NOMES_VALIDOS = ['Leo', 'Luis'];

export function validarLogin({ email, senha }) {
  const erros = {};
  if (!email || !EMAIL_RE.test(email.trim())) erros.email = 'Informe um e-mail válido.';
  if (!senha) erros.senha = 'Informe sua senha.';
  return { ok: Object.keys(erros).length === 0, erros };
}

export function validarCadastro({ email, senha, nomeMembro }) {
  const erros = {};
  if (!email || !EMAIL_RE.test(email.trim())) erros.email = 'Informe um e-mail válido.';
  if (!senha || senha.length < SENHA_MIN) erros.senha = `A senha precisa ter ao menos ${SENHA_MIN} caracteres.`;
  if (!NOMES_VALIDOS.includes(nomeMembro)) erros.nomeMembro = 'Escolha quem é você: Leo ou Luis.';
  return { ok: Object.keys(erros).length === 0, erros };
}
