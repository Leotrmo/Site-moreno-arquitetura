import { useState } from 'react';
import { useTransacoes } from '../data/TransacoesContext.jsx';
import { CATEGORIAS } from '../lib/categorias.js';
import { derivarChave } from '../lib/regras.js';

const PESSOAS = [
  { id: 'compartilhado', label: 'Compart.' },
  { id: 'leo', label: 'Leo' },
  { id: 'luis', label: 'Luis' },
];

function formatBRL(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(iso) {
  const [a, m, d] = String(iso).split('-');
  return `${d}/${m}/${a}`;
}

function CardTransacao({ tx, onConfirmar, onSalvarRegra }) {
  const [pessoa, setPessoa] = useState(tx.pessoa);
  const [salvarRegra, setSalvarRegra] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const chave = derivarChave(tx.descricao);

  async function escolher(categoria) {
    if (enviando) return;
    setEnviando(true);
    try {
      if (salvarRegra) {
        await onSalvarRegra({ chave, categoria, pessoaPadrao: pessoa });
      }
      await onConfirmar(tx.id, { categoria, pessoa });
      // Em sucesso, o card some (a transação deixa de ser pendente/revisável).
    } catch {
      setEnviando(false);
    }
  }

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3 ${enviando ? 'opacity-50' : ''}`}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-800 truncate">{tx.descricao_original || tx.descricao}</p>
          <p className="text-sm text-slate-400">
            {formatData(tx.data)} · {tx.banco === 'itau' ? 'Itaú' : 'Bradesco'}
          </p>
        </div>
        <p className="font-semibold text-slate-800 shrink-0">{formatBRL(tx.valor)}</p>
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-1">De quem foi?</p>
        <div className="flex gap-1.5">
          {PESSOAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPessoa(p.id)}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-medium ${
                pessoa === p.id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {CATEGORIAS.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={enviando}
            onClick={() => escolher(c.id)}
            className={`rounded-lg border py-2 text-[11px] flex flex-col items-center gap-0.5 ${
              tx.categoria === c.id
                ? 'border-teal-600 bg-teal-50 text-teal-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="text-base">{c.emoji}</span>
            {c.label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-500">
        <input type="checkbox" checked={salvarRegra} onChange={(e) => setSalvarRegra(e.target.checked)} />
        Salvar regra para "{chave}"
      </label>
    </div>
  );
}

export default function Categorizar() {
  const { pendentes, autoRevisaveis, atualizarCategoria, salvarRegra, loading } = useTransacoes();
  const [revisar, setRevisar] = useState(false);

  const fila = revisar ? [...pendentes, ...autoRevisaveis] : pendentes;

  if (loading) return <p className="text-slate-500">Carregando…</p>;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Categorizar</h1>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <input type="checkbox" checked={revisar} onChange={(e) => setRevisar(e.target.checked)} />
          Revisar auto
        </label>
      </div>

      {fila.length === 0 ? (
        <div className="text-center text-slate-400 py-16">
          <p className="text-4xl mb-2">🎉</p>
          <p>Tudo categorizado!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {fila.map((tx) => (
            <CardTransacao
              key={tx.id}
              tx={tx}
              onConfirmar={atualizarCategoria}
              onSalvarRegra={salvarRegra}
            />
          ))}
        </div>
      )}
    </section>
  );
}
