import { useMemo, useState, useEffect } from 'react';
import { useTransacoes } from '../data/TransacoesContext.jsx';
import { paraAnalise } from '../lib/transacaoAdapter.js';
import { CATEGORIAS } from '../lib/categorias.js';
import { formatBRL, formatData } from '../lib/formato.js';
import {
  intervaloDePreset,
  filtrarLancamentos,
  ordenarLancamentos,
  resumoLancamentos,
} from '../lib/lancamentos.js';

const CAT = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));
const PRESETS = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'mes', label: 'Este mês' },
  { id: '3meses', label: '3 meses' },
  { id: 'ano', label: 'Ano' },
  { id: 'personalizado', label: 'Período' },
];
const BANCOS = [
  { id: 'todos', label: 'Todos' },
  { id: 'itau', label: 'Itaú' },
  { id: 'bradesco', label: 'Bradesco' },
];
const PESSOAS = [
  { id: 'todos', label: 'Todos' },
  { id: 'leo', label: 'Leo' },
  { id: 'luis', label: 'Luis' },
  { id: 'compartilhado', label: 'Compart.' },
];
const PARCELADO = [
  { id: 'todos', label: 'Todos' },
  { id: 'sim', label: 'Parcelado' },
  { id: 'nao', label: 'À vista' },
];
const ORDENS = [
  { campo: 'data', label: 'Data' },
  { campo: 'valor', label: 'Valor' },
  { campo: 'descricao', label: 'Descrição' },
];

function nomeBanco(b) { return b === 'itau' ? 'Itaú' : 'Bradesco'; }
function nomePessoa(p) { return p === 'leo' ? 'Leo' : p === 'luis' ? 'Luis' : 'Compart.'; }
function rotuloCategoria(id) {
  if (id == null) return 'Sem categoria';
  const c = CAT[id];
  return c ? `${c.emoji} ${c.label}` : id;
}

export default function Lancamentos() {
  const { transacoes, loading, erro } = useTransacoes();

  const [preset, setPreset] = useState('tudo');
  const [custom, setCustom] = useState({ de: '', ate: '' });
  const [banco, setBanco] = useState('todos');
  const [pessoa, setPessoa] = useState('todos');
  const [categoria, setCategoria] = useState('todas');
  const [parcelado, setParcelado] = useState('todos');
  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState({ campo: 'data', direcao: 'desc' });
  const [painelAberto, setPainelAberto] = useState(false);

  // Debounce da busca (~200ms).
  useEffect(() => {
    const id = setTimeout(() => setBusca(buscaInput), 200);
    return () => clearTimeout(id);
  }, [buscaInput]);

  const todas = useMemo(() => paraAnalise(transacoes), [transacoes]);
  const periodo = useMemo(() => {
    if (preset === 'personalizado') return { de: custom.de || null, ate: custom.ate || null };
    return intervaloDePreset(preset);
  }, [preset, custom]);

  const visiveis = useMemo(
    () => ordenarLancamentos(
      filtrarLancamentos(todas, { periodo, banco, pessoa, categoria, parcelado, busca }),
      ordem,
    ),
    [todas, periodo, banco, pessoa, categoria, parcelado, busca, ordem],
  );
  const resumo = useMemo(() => resumoLancamentos(visiveis), [visiveis]);

  const nSecundarios =
    [banco, pessoa, parcelado].filter((v) => v !== 'todos').length + (categoria !== 'todas' ? 1 : 0);
  const temFiltro = nSecundarios > 0 || preset !== 'tudo' || busca.trim() !== '';

  function limparTudo() {
    setPreset('tudo'); setCustom({ de: '', ate: '' });
    setBanco('todos'); setPessoa('todos'); setCategoria('todas'); setParcelado('todos');
    setBuscaInput(''); setBusca('');
  }
  function trocarOrdem(campo) {
    setOrdem((o) => (o.campo === campo
      ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' }
      : { campo, direcao: 'desc' }));
  }

  if (loading) return <p className="text-slate-500">Carregando…</p>;
  if (erro) return <p className="text-red-600">{erro}</p>;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Lançamentos</h1>

      {/* Busca + botão Filtros */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3">
          <span className="text-slate-400">🔎</span>
          <input
            type="text"
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            placeholder="Buscar descrição…"
            className="flex-1 py-2 text-sm outline-none bg-transparent"
          />
          {buscaInput && (
            <button type="button" onClick={() => setBuscaInput('')} className="text-slate-400" aria-label="Limpar busca">✕</button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPainelAberto((v) => !v)}
          className={`px-3 rounded-xl border text-sm font-medium ${nSecundarios > 0 ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}
        >
          Filtros{nSecundarios > 0 ? ` · ${nSecundarios}` : ''}
        </button>
      </div>

      {/* Chips de período */}
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${preset === p.id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Intervalo custom */}
      {preset === 'personalizado' && (
        <div className="flex items-center gap-2 text-sm">
          <input type="month" value={custom.de} onChange={(e) => setCustom((c) => ({ ...c, de: e.target.value }))} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5" />
          <span className="text-slate-400">até</span>
          <input type="month" value={custom.ate} onChange={(e) => setCustom((c) => ({ ...c, ate: e.target.value }))} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5" />
        </div>
      )}

      {/* Painel de filtros secundários */}
      {painelAberto && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <Grupo label="Banco" opcoes={BANCOS} valor={banco} onPick={setBanco} />
          <Grupo label="Pessoa" opcoes={PESSOAS} valor={pessoa} onPick={setPessoa} />
          <Grupo label="Parcelado" opcoes={PARCELADO} valor={parcelado} onPick={setParcelado} />
          <div>
            <p className="text-xs text-slate-400 mb-1">Categoria</p>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="todas">Todas</option>
              <option value="sem">Sem categoria</option>
              {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Chips de filtros ativos + limpar */}
      {temFiltro && (
        <div className="flex gap-1.5 flex-wrap items-center">
          {preset !== 'tudo' && <ChipAtivo label={PRESETS.find((p) => p.id === preset).label} onClear={() => { setPreset('tudo'); setCustom({ de: '', ate: '' }); }} />}
          {banco !== 'todos' && <ChipAtivo label={nomeBanco(banco)} onClear={() => setBanco('todos')} />}
          {pessoa !== 'todos' && <ChipAtivo label={nomePessoa(pessoa)} onClear={() => setPessoa('todos')} />}
          {categoria !== 'todas' && <ChipAtivo label={rotuloCategoria(categoria === 'sem' ? null : categoria)} onClear={() => setCategoria('todas')} />}
          {parcelado !== 'todos' && <ChipAtivo label={PARCELADO.find((p) => p.id === parcelado).label} onClear={() => setParcelado('todos')} />}
          {busca.trim() !== '' && <ChipAtivo label={`"${busca}"`} onClear={() => { setBuscaInput(''); setBusca(''); }} />}
          <button type="button" onClick={limparTudo} className="text-xs text-teal-700 underline">Limpar tudo</button>
        </div>
      )}

      {/* Barra de total + ordenação */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-2">
        <p className="text-sm text-slate-500">
          {resumo.count} {resumo.count === 1 ? 'lançamento' : 'lançamentos'} ·{' '}
          <span className="font-medium text-slate-700">{formatBRL(resumo.soma)}</span>
        </p>
        <div className="flex gap-1">
          {ORDENS.map((o) => (
            <button
              key={o.campo}
              type="button"
              onClick={() => trocarOrdem(o.campo)}
              className={`px-2 py-1 rounded-lg text-xs ${ordem.campo === o.campo ? 'bg-slate-100 text-slate-700 font-medium' : 'text-slate-400'}`}
            >
              {o.label}{ordem.campo === o.campo ? (ordem.direcao === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {visiveis.length === 0 ? (
        <div className="text-center text-slate-400 py-16">
          <p className="text-4xl mb-2">🔍</p>
          <p>Nenhum lançamento com esses filtros.</p>
          {temFiltro && <button type="button" onClick={limparTudo} className="text-teal-700 font-medium">Limpar tudo</button>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {visiveis.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2.5 flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{t.descricao}</p>
                <p className="text-xs text-slate-400">
                  {formatData(t.data)} · {nomePessoa(t.pessoa)} · {rotuloCategoria(t.categoria)} · {nomeBanco(t.banco)}
                  {t.parcelaTotal ? ` · ${t.parcelaAtual ?? '?'}/${t.parcelaTotal}` : ''}
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-800 shrink-0">{formatBRL(t.valor)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Grupo({ label, opcoes, valor, onPick }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o.id)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${valor === o.id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipAtivo({ label, onClear }) {
  return (
    <button type="button" onClick={onClear} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs flex items-center gap-1">
      {label} <span className="text-slate-400">✕</span>
    </button>
  );
}
