import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { levantarSeriesAbertas } from '../lib/series.js';

const TransacoesContext = createContext(null);

// 'AAAA-MM' do mês atual (default do seletor de mês).
function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

export function TransacoesProvider({ children }) {
  const { householdId } = useAuth();
  const [transacoes, setTransacoes] = useState([]);
  const [regras, setRegras] = useState([]);
  const [ignorados, setIgnorados] = useState([]);
  const [mesReferencia, setMesReferencia] = useState(mesAtual());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  // Carga inicial (todas as transações + regras do household) + subscription
  // realtime. Escopado ao household; refaz quando o householdId muda.
  useEffect(() => {
    if (!householdId) return undefined;
    let ativo = true;
    setLoading(true);

    async function carregar() {
      const [tx, rg, ig] = await Promise.all([
        supabase.from('transacoes').select('*').eq('household_id', householdId),
        supabase.from('regras_categoria').select('*').eq('household_id', householdId),
        supabase.from('lancamentos_ignorados').select('hash_origem').eq('household_id', householdId),
      ]);
      if (!ativo) return;
      if (tx.error || rg.error || ig.error) {
        setErro('Não foi possível carregar os dados.');
      } else {
        setTransacoes(tx.data ?? []);
        setRegras(rg.data ?? []);
        setIgnorados(ig.data ?? []);
        setErro('');
      }
      setLoading(false);
    }
    carregar();

    const canal = supabase
      .channel(`transacoes:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transacoes',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          setTransacoes((atual) => {
            if (payload.eventType === 'DELETE') {
              return atual.filter((t) => t.id !== payload.old.id);
            }
            const linha = payload.new;
            const idx = atual.findIndex((t) => t.id === linha.id);
            if (idx === -1) return [...atual, linha];
            const copia = atual.slice();
            copia[idx] = linha;
            return copia;
          });
        },
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [householdId]);

  // Insere as linhas novas (ON CONFLICT DO NOTHING pela chave de dedup). O realtime
  // ecoa as inserções e o merge por id evita duplicar no estado local.
  const salvarTransacoes = useCallback(async (linhas) => {
    if (!linhas.length) return { count: 0 };
    const { error } = await supabase
      .from('transacoes')
      .upsert(linhas, { onConflict: 'household_id,hash_origem,mes_referencia', ignoreDuplicates: true });
    if (error) throw error;
    return { count: linhas.length };
  }, []);

  // Persiste as linhas ignoradas permanentemente (carimba quem ignorou).
  const salvarIgnorados = useCallback(async (linhas) => {
    if (!linhas.length) return;
    const { data: sessao } = await supabase.auth.getUser();
    const ignoradoPor = sessao?.user?.id ?? null;
    const comAutor = linhas.map((l) => ({ ...l, ignorado_por: ignoradoPor }));
    const { error } = await supabase
      .from('lancamentos_ignorados')
      .upsert(comAutor, { onConflict: 'household_id,hash_origem', ignoreDuplicates: true });
    if (error) throw error;
    setIgnorados((atual) => [
      ...atual,
      ...linhas.map((l) => ({ hash_origem: l.hash_origem })),
    ]);
  }, []);

  // Confirma/corrige uma categoria no Q&A: marca categoria_auto=false (sai da revisão).
  // Atualização otimista para o card sumir na hora; o realtime confirma.
  const atualizarCategoria = useCallback(async (id, { categoria, pessoa }) => {
    setTransacoes((atual) =>
      atual.map((t) =>
        t.id === id ? { ...t, categoria, pessoa: pessoa ?? t.pessoa, categoria_auto: false } : t,
      ),
    );
    const patch = { categoria, categoria_auto: false };
    if (pessoa) patch.pessoa = pessoa;
    const { error } = await supabase.from('transacoes').update(patch).eq('id', id);
    if (error) throw error;
  }, []);

  // Salva (ou atualiza) uma regra aprendida.
  const salvarRegra = useCallback(
    async ({ chave, categoria, pessoaPadrao }) => {
      if (!chave) return;
      const linha = {
        household_id: householdId,
        chave,
        categoria,
        pessoa_padrao: pessoaPadrao ?? null,
      };
      const { data, error } = await supabase
        .from('regras_categoria')
        .upsert(linha, { onConflict: 'household_id,chave' })
        .select();
      if (error) throw error;
      setRegras((atual) => {
        const nova = data?.[0] ?? linha;
        const idx = atual.findIndex((r) => r.chave === chave);
        if (idx === -1) return [...atual, nova];
        const copia = atual.slice();
        copia[idx] = nova;
        return copia;
      });
    },
    [householdId],
  );

  const pendentes = useMemo(() => transacoes.filter((t) => t.categoria == null), [transacoes]);
  const autoRevisaveis = useMemo(
    () => transacoes.filter((t) => t.categoria != null && t.categoria_auto),
    [transacoes],
  );
  // Dedup composta: a mesma linha (hash de conteúdo) só é duplicata no MESMO mês.
  const chavesExistentes = useMemo(
    () => new Set(transacoes.map((t) => `${t.hash_origem}|${t.mes_referencia}`)),
    [transacoes],
  );
  // Em quais meses cada conteúdo já apareceu (p/ marcar "já vi em [mês]" na revisão).
  const mesesPorHash = useMemo(() => {
    const m = new Map();
    for (const t of transacoes) {
      const arr = m.get(t.hash_origem);
      if (arr) {
        if (!arr.includes(t.mes_referencia)) arr.push(t.mes_referencia);
      } else {
        m.set(t.hash_origem, [t.mes_referencia]);
      }
    }
    return m;
  }, [transacoes]);
  const hashesIgnorados = useMemo(
    () => new Set(ignorados.map((i) => i.hash_origem)),
    [ignorados],
  );
  const seriesAbertas = useMemo(() => levantarSeriesAbertas(transacoes), [transacoes]);
  const transacoesDoMes = useCallback(
    (mes) => transacoes.filter((t) => t.mes_referencia === mes),
    [transacoes],
  );

  const valor = {
    transacoes,
    pendentes,
    autoRevisaveis,
    chavesExistentes,
    mesesPorHash,
    hashesIgnorados,
    seriesAbertas,
    salvarIgnorados,
    transacoesDoMes,
    regras,
    mesReferencia,
    setMesReferencia,
    salvarTransacoes,
    atualizarCategoria,
    salvarRegra,
    loading,
    erro,
  };

  return <TransacoesContext.Provider value={valor}>{children}</TransacoesContext.Provider>;
}

export function useTransacoes() {
  const ctx = useContext(TransacoesContext);
  if (!ctx) throw new Error('useTransacoes deve ser usado dentro de <TransacoesProvider>');
  return ctx;
}
