import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { validarLogin, validarCadastro } from '../auth/validation.js';
import { traduzErroAuth } from '../auth/authErrors.js';

export default function Login() {
  const { session, loading, signIn, signUp } = useAuth();
  const [modo, setModo] = useState('entrar'); // 'entrar' | 'criar'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nomeMembro, setNomeMembro] = useState('');
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Já logado → vai pro dashboard.
  if (!loading && session) return <Navigate to="/dashboard" replace />;

  async function aoEnviar(e) {
    e.preventDefault();
    setErroGeral('');
    const validacao =
      modo === 'entrar' ? validarLogin({ email, senha }) : validarCadastro({ email, senha, nomeMembro });
    setErros(validacao.erros);
    if (!validacao.ok) return;

    setEnviando(true);
    const { error } =
      modo === 'entrar' ? await signIn(email.trim(), senha) : await signUp(email.trim(), senha, nomeMembro);
    setEnviando(false);
    if (error) setErroGeral(traduzErroAuth(error));
    // Em caso de sucesso, onAuthStateChange atualiza a sessão e o <Navigate> acima redireciona.
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 bg-slate-50 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-teal-700">Finanças</h1>
        <p className="text-slate-500">Leo &amp; Luis</p>
      </div>

      <form
        onSubmit={aoEnviar}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4"
      >
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => { setModo('entrar'); setErros({}); setErroGeral(''); }}
            className={`flex-1 rounded-md py-1.5 ${modo === 'entrar' ? 'bg-white shadow text-teal-700' : 'text-slate-500'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => { setModo('criar'); setErros({}); setErroGeral(''); }}
            className={`flex-1 rounded-md py-1.5 ${modo === 'criar' ? 'bg-white shadow text-teal-700' : 'text-slate-500'}`}
          >
            Criar conta
          </button>
        </div>

        {modo === 'criar' && (
          <div>
            <label className="block text-sm text-slate-600 mb-1">Quem é você?</label>
            <div className="flex gap-2">
              {['Leo', 'Luis'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNomeMembro(n)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                    nomeMembro === n
                      ? 'border-teal-600 bg-teal-50 text-teal-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {erros.nomeMembro && <p className="text-sm text-red-600 mt-1">{erros.nomeMembro}</p>}
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-600 mb-1">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {erros.email && <p className="text-sm text-red-600 mt-1">{erros.email}</p>}
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">Senha</label>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {erros.senha && <p className="text-sm text-red-600 mt-1">{erros.senha}</p>}
        </div>

        {erroGeral && <p className="text-sm text-red-600">{erroGeral}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg bg-teal-700 text-white py-2.5 font-medium hover:bg-teal-800 disabled:opacity-60"
        >
          {enviando
            ? modo === 'entrar'
              ? 'Entrando…'
              : 'Criando conta…'
            : modo === 'entrar'
              ? 'Entrar'
              : 'Criar conta'}
        </button>
      </form>
    </main>
  );
}
