import { useState } from 'react';
import { formatBRL, formatData, nomeMes } from '../lib/formato.js';

const CATEGORIAS_RAPIDAS = ['alimentacao', 'transporte', 'saude', 'lazer', 'casa', 'vestuario'];

// itens: [{ hash, data, descricao, valor, banco, pessoa,
//           parcelaAtual, parcelaTotal, serieId, ignorada,
//           categoriaManual, pessoaOverride, sugestao? }]
// sugestao (quando há): { serieId, proximaParcela, total }
export default function RevisaoImportacao({ itens, seriesAbertas, onChange, onConfirmar, onCancelar, salvando }) {
  const aVazar = itens.filter((i) => !i.ignorada && i.incluir !== false).length;

  function patch(hash, campos) {
    onChange(itens.map((i) => (i.hash === hash ? { ...i, ...campos } : i)));
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-slate-800">Revisar lançamentos</h2>
        <span className="text-xs text-slate-500">{aVazar} a salvar</span>
      </div>

      {itens.map((it) => (
        <LinhaRevisao
          key={it.hash}
          item={it}
          seriesAbertas={seriesAbertas}
          onPatch={(campos) => patch(it.hash, campos)}
        />
      ))}

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancelar}
          className="flex-1 rounded-lg border border-slate-200 text-slate-600 py-2.5 text-sm"
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={onConfirmar}
          disabled={salvando || aVazar === 0}
          className="flex-[2] rounded-lg bg-teal-700 text-white py-2.5 font-medium disabled:opacity-60"
        >
          {salvando ? 'Salvando…' : `Confirmar e salvar ${aVazar} itens`}
        </button>
      </div>
    </div>
  );
}

function LinhaRevisao({ item, seriesAbertas, onPatch }) {
  const [editandoParcela, setEditandoParcela] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const temParcela = item.parcelaAtual != null && item.parcelaTotal != null;

  if (item.ignorada) {
    return (
      <div className="rounded-xl border border-slate-100 p-3 opacity-50">
        <div className="flex justify-between line-through">
          <span className="font-medium text-slate-700">{item.descricao}</span>
          <span className="font-bold text-slate-500">{formatBRL(item.valor)}</span>
        </div>
        <button
          type="button"
          onClick={() => onPatch({ ignorada: false })}
          className="mt-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700"
        >
          ignorada ↺ desfazer
        </button>
      </div>
    );
  }

  // Repetição: conteúdo idêntico que já apareceu em outro(s) mês(es). Pede confirmação:
  // é uma nova parcela (importar) ou a mesma compra de sempre (ignorar para sempre)?
  if (item.jaVistaEm?.length > 0 && !item.incluir) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
        <div className="flex justify-between items-baseline">
          <div>
            <span className="font-medium text-slate-800">{item.descricao}</span>
            <span className="ml-2 text-xs text-slate-400">{formatData(item.data)}</span>
          </div>
          <span className="font-bold text-teal-700 whitespace-nowrap">{formatBRL(item.valor)}</span>
        </div>
        <p className="text-xs text-amber-800">
          👀 Essa já apareceu em {item.jaVistaEm.map(nomeMes).join(', ')}. É uma nova parcela deste mês?
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onPatch({ incluir: true })}
            className="text-xs px-2 py-1 rounded bg-teal-700 text-white"
          >
            Importar (é nova parcela)
          </button>
          <button
            type="button"
            onClick={() => onPatch({ ignorada: true })}
            className="text-xs px-2 py-1 rounded-full border border-slate-300 text-slate-600"
          >
            É a mesma compra — ignorar sempre
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 p-3 space-y-2">
      {item.sugestao && (
        <div className="rounded-lg bg-amber-50 border border-amber-300 p-2 text-xs text-amber-800">
          💡 Parece a {item.sugestao.proximaParcela}/{item.sugestao.total} de uma série.
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() =>
                onPatch({
                  serieId: item.sugestao.serieId,
                  parcelaAtual: item.sugestao.proximaParcela,
                  parcelaTotal: item.sugestao.total,
                  sugestao: null,
                })
              }
              className="px-2 py-0.5 rounded bg-teal-700 text-white"
            >
              ✓ É a {item.sugestao.proximaParcela}/{item.sugestao.total}
            </button>
            <button
              type="button"
              onClick={() => onPatch({ sugestao: null })}
              className="px-2 py-0.5 rounded border border-amber-300"
            >
              Não é
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-baseline">
        <div>
          <span className="font-medium text-slate-800">{item.descricao}</span>
          <span className="ml-2 text-xs text-slate-400">{formatData(item.data)}</span>
        </div>
        <span className="font-bold text-teal-700 whitespace-nowrap">{formatBRL(item.valor)}</span>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {temParcela && !editandoParcela ? (
          <button
            type="button"
            onClick={() => setEditandoParcela(true)}
            className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700"
          >
            {item.parcelaAtual}/{item.parcelaTotal} ✎
          </button>
        ) : editandoParcela ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <input
              type="number" min="1" value={item.parcelaAtual ?? ''}
              onChange={(e) => onPatch({ parcelaAtual: Number(e.target.value) || null, serieId: item.serieId ?? crypto.randomUUID() })}
              className="w-12 border border-slate-200 rounded px-1 py-0.5 text-center"
            />
            /
            <input
              type="number" min="1" value={item.parcelaTotal ?? ''}
              onChange={(e) => onPatch({ parcelaTotal: Number(e.target.value) || null })}
              className="w-12 border border-slate-200 rounded px-1 py-0.5 text-center"
            />
            <button type="button" onClick={() => setEditandoParcela(false)} className="text-teal-700">ok</button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => { setEditandoParcela(true); onPatch({ serieId: item.serieId ?? crypto.randomUUID() }); }}
            className="text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-dashed border-slate-300"
          >
            + parcela
          </button>
        )}

        <button
          type="button"
          onClick={() => setVinculando((v) => !v)}
          className="text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-dashed border-slate-300"
        >
          vincular série
        </button>

        <button
          type="button"
          onClick={() => onPatch({ ignorada: true })}
          className="text-xs px-2 py-0.5 rounded-full text-slate-400"
        >
          ignorar
        </button>
      </div>

      {vinculando && (
        <div className="rounded-lg bg-slate-50 p-2 space-y-1">
          {seriesAbertas.length === 0 && <p className="text-xs text-slate-400">Nenhuma série em aberto.</p>}
          {seriesAbertas.map((s) => (
            <button
              key={s.serieId}
              type="button"
              onClick={() => {
                onPatch({ serieId: s.serieId, parcelaAtual: s.proximaParcela, parcelaTotal: s.total, sugestao: null });
                setVinculando(false);
              }}
              className="block w-full text-left text-xs px-2 py-1 rounded hover:bg-white"
            >
              {s.descricao} · {formatBRL(s.valor)} · próxima {s.proximaParcela}/{s.total}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {CATEGORIAS_RAPIDAS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPatch({ categoriaManual: item.categoriaManual === c ? undefined : c })}
            className={`text-[11px] px-2 py-0.5 rounded-full border ${
              item.categoriaManual === c ? 'bg-teal-700 text-white border-teal-700' : 'border-slate-200 text-slate-500'
            }`}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
