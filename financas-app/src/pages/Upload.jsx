import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTransacoes } from '../data/TransacoesContext.jsx';
import { parseCSV } from '../lib/parsers/index.js';
import { prepararUpload } from '../lib/upload.js';
import { supabase } from '../lib/supabase.js';

const BANCOS = [
  { id: 'itau', label: 'Itaú' },
  { id: 'bradesco', label: 'Bradesco' },
];
const PESSOAS = [
  { id: 'compartilhado', label: 'Compartilhado' },
  { id: 'leo', label: 'Leo' },
  { id: 'luis', label: 'Luis' },
];

export default function Upload() {
  const { householdId } = useAuth();
  const { hashesExistentes, regras, salvarTransacoes } = useTransacoes();

  const [banco, setBanco] = useState('itau');
  const [deQuem, setDeQuem] = useState('compartilhado');
  const [autoCategorizar, setAutoCategorizar] = useState(true);
  const [arquivo, setArquivo] = useState(null);
  const [mesReferencia, setMesReferencia] = useState('');
  const [parsed, setParsed] = useState(null);
  const [erro, setErro] = useState('');
  const [analisando, setAnalisando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState('');

  async function aoAnalisar(e) {
    e.preventDefault();
    setErro('');
    setSucesso('');
    if (!arquivo) {
      setErro('Escolha um arquivo.');
      return;
    }
    setAnalisando(true);
    try {
      const tx = await parseCSV(arquivo, banco);
      setParsed(tx);
      setMesReferencia(tx[0]?.mesReferencia ?? '');
    } catch (err) {
      setParsed(null);
      setErro(err.message || 'Falha ao ler o arquivo.');
    } finally {
      setAnalisando(false);
    }
  }

  // Preview reativo: recalcula quando muda mês, "de quem" ou o toggle de auto.
  const resultado =
    parsed && mesReferencia
      ? prepararUpload({
          parsed,
          hashesExistentes,
          regras,
          householdId,
          mesReferencia,
          deQuemItau: deQuem,
          arquivoOrigem: arquivo?.name ?? null,
          autoCategorizar,
        })
      : null;

  async function aoSalvar() {
    if (!resultado) return;
    setSalvando(true);
    setErro('');
    try {
      await salvarTransacoes(resultado.linhas);
      await supabase.from('arquivos_processados').upsert(
        {
          household_id: householdId,
          nome_arquivo: arquivo.name,
          banco,
          mes_referencia: mesReferencia,
          total_transacoes: resultado.resumo.encontradas,
        },
        { onConflict: 'household_id,nome_arquivo', ignoreDuplicates: true },
      );
      setSucesso(`${resultado.resumo.novas} novas transações salvas.`);
      setParsed(null);
      setArquivo(null);
    } catch {
      setErro('Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Subir extrato</h1>

      <form
        onSubmit={aoAnalisar}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4"
      >
        <div>
          <label className="block text-sm text-slate-600 mb-1">Banco</label>
          <div className="flex gap-2">
            {BANCOS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setBanco(b.id)}
                className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                  banco === b.id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {banco === 'itau' && (
          <div>
            <label className="block text-sm text-slate-600 mb-1">De quem é esse cartão?</label>
            <div className="flex gap-2">
              {PESSOAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDeQuem(p.id)}
                  className={`flex-1 rounded-lg border py-2 text-xs font-medium ${
                    deQuem === p.id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-600 mb-1">Arquivo CSV</label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              setArquivo(e.target.files?.[0] ?? null);
              setParsed(null);
              setSucesso('');
            }}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-teal-700"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={autoCategorizar}
            onChange={(e) => setAutoCategorizar(e.target.checked)}
          />
          Categorizar automaticamente o que der
        </label>

        {erro && <p className="text-sm text-red-600">{erro}</p>}
        {sucesso && <p className="text-sm text-teal-700">{sucesso}</p>}

        <button
          type="submit"
          disabled={analisando}
          className="w-full rounded-lg bg-teal-700 text-white py-2.5 font-medium hover:bg-teal-800 disabled:opacity-60"
        >
          {analisando ? 'Analisando…' : 'Analisar arquivo'}
        </button>
      </form>

      {resultado && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">Mês de referência (fatura)</label>
            <input
              type="month"
              value={mesReferencia}
              onChange={(e) => setMesReferencia(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-2xl font-bold text-slate-800">{resultado.resumo.encontradas}</p>
              <p className="text-xs text-slate-500">encontradas</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-2xl font-bold text-slate-400">{resultado.resumo.jaProcessadas}</p>
              <p className="text-xs text-slate-500">já processadas</p>
            </div>
            <div className="rounded-xl bg-teal-50 p-3">
              <p className="text-2xl font-bold text-teal-700">{resultado.resumo.novas}</p>
              <p className="text-xs text-slate-500">novas</p>
            </div>
            <div className="rounded-xl bg-teal-50 p-3">
              <p className="text-2xl font-bold text-teal-700">{resultado.resumo.autoCategorizadas}</p>
              <p className="text-xs text-slate-500">auto-categorizadas</p>
            </div>
          </div>

          <button
            onClick={aoSalvar}
            disabled={salvando || resultado.resumo.novas === 0}
            className="w-full rounded-lg bg-teal-700 text-white py-2.5 font-medium hover:bg-teal-800 disabled:opacity-60"
          >
            {salvando
              ? 'Salvando…'
              : resultado.resumo.novas === 0
                ? 'Nada novo para salvar'
                : `Salvar ${resultado.resumo.novas} novas`}
          </button>
        </div>
      )}
    </section>
  );
}
