import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Enquanto a sessão carrega, mostra loader. Sem sessão, manda para o login (/).
export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50 text-slate-500">
        Carregando…
      </div>
    );
  }
  if (!session) return <Navigate to="/" replace />;
  return children;
}
