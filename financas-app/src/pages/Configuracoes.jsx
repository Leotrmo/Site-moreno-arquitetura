import EmBreve from './EmBreve.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Configuracoes() {
  const { nomeMembro, signOut } = useAuth();
  return (
    <EmBreve titulo="Configurações">
      <p className="mb-4">Renda, contas fixas e metas chegam no Plano 6.</p>
      <p className="mb-4 text-slate-600">
        Logado como <strong>{nomeMembro ?? '—'}</strong>.
      </p>
      <button
        type="button"
        onClick={() => signOut()}
        className="rounded-lg bg-slate-200 text-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-300"
      >
        Sair
      </button>
    </EmBreve>
  );
}
