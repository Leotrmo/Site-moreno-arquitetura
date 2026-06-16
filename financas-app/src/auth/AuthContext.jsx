import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [membro, setMembro] = useState(null); // { householdId, nomeMembro }
  const [loading, setLoading] = useState(true);

  // Sessão atual + escuta de mudanças (login/logout). Uma assinatura só.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Com sessão, busca household_id + nome_membro. A linha em household_members é criada
  // pelo trigger no cadastro; se vier vazia logo após o signUp, tenta de novo 1 vez.
  useEffect(() => {
    let ativo = true;
    if (!session) {
      setMembro(null);
      return;
    }
    async function carregarMembro(tentativa = 0) {
      const { data, error } = await supabase
        .from('household_members')
        .select('household_id, nome_membro')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!ativo) return;
      if (data) {
        setMembro({ householdId: data.household_id, nomeMembro: data.nome_membro });
      } else if (!error && tentativa < 1) {
        setTimeout(() => carregarMembro(tentativa + 1), 800);
      } else {
        setMembro({ householdId: null, nomeMembro: session.user.user_metadata?.nome_membro ?? null });
      }
    }
    carregarMembro();
    return () => {
      ativo = false;
    };
  }, [session]);

  const valor = {
    session,
    user: session?.user ?? null,
    loading,
    householdId: membro?.householdId ?? null,
    nomeMembro: membro?.nomeMembro ?? null,
    signIn: (email, senha) => supabase.auth.signInWithPassword({ email, password: senha }),
    signUp: (email, senha, nomeMembro) =>
      supabase.auth.signUp({ email, password: senha, options: { data: { nome_membro: nomeMembro } } }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
