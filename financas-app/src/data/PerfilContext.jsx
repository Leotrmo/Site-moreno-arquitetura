import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';

const PerfilContext = createContext(null);

export function PerfilProvider({ children }) {
  const { householdId } = useAuth();
  const [perfil, setPerfil] = useState({}); // perfil.dados (jsonb); {} = não configurado
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  // Carga da linha `perfil` do household. Sem realtime no v1.
  useEffect(() => {
    if (!householdId) return undefined;
    let ativo = true;
    setLoading(true);
    async function carregar() {
      const { data, error } = await supabase
        .from('perfil')
        .select('dados')
        .eq('household_id', householdId)
        .maybeSingle();
      if (!ativo) return;
      if (error) {
        setErro('Não foi possível carregar as configurações.');
      } else {
        setPerfil(data?.dados ?? {});
        setErro('');
      }
      setLoading(false);
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, [householdId]);

  // Upsert do jsonb inteiro (uma linha por household, household_id é unique).
  const salvarPerfil = useCallback(
    async (dados) => {
      const { error } = await supabase
        .from('perfil')
        .upsert(
          { household_id: householdId, dados, atualizado_em: new Date().toISOString() },
          { onConflict: 'household_id' },
        );
      if (error) throw error;
      setPerfil(dados);
    },
    [householdId],
  );

  const valor = { perfil, salvarPerfil, loading, erro };
  return <PerfilContext.Provider value={valor}>{children}</PerfilContext.Provider>;
}

export function usePerfil() {
  const ctx = useContext(PerfilContext);
  if (!ctx) throw new Error('usePerfil deve ser usado dentro de <PerfilProvider>');
  return ctx;
}
