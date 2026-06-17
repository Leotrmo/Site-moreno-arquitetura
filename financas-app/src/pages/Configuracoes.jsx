import { useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { usePerfil } from '../data/PerfilContext.jsx';
import { perfilPadrao, normalizarPerfil, perfilVazio } from '../lib/perfilModelo.js';

const PESSOAS = [
  { id: 'compartilhado', label: 'Compart.' },
  { id: 'leo', label: 'Leo' },
  { id: 'luis', label: 'Luis' },
];

export default function Configuracoes() {
  const { nomeMembro, signOut } = useAuth();
  const { perfil, salvarPerfil, loading } = usePerfil();

  if (loading) return <p className="text-slate-500">Carregando…</p>;

  return (
    <FormConfig
      nomeMembro={nomeMembro}
      signOut={signOut}
      salvarPerfil={salvarPerfil}
      inicial={perfilVazio(perfil) ? perfilPadrao() : normalizarPerfil(perfil)}
    />
  );
}

// Form separado para que o estado inicial (useState) só seja lido DEPOIS do perfil
// carregar (o componente pai só monta este após loading=false).
function FormConfig({ nomeMembro, signOut, salvarPerfil, inicial }) {
  const [salarios, setSalarios] = useState(inicial.salarios);
  const [fixos, setFixos] = useState(inicial.fixos);
  const [metas, setMetas] = useState(inicial.metas);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState('');
  const [erro, setErro] = useState('');

  function setSalario(campo, v) {
    setSalarios((s) => ({ ...s, [campo]: v }));
    setSucesso('');
  }
  function setFixo(i, campo, v) {
    setFixos((arr) => arr.map((f, idx) => (idx === i ? { ...f, [campo]: v } : f)));
    setSucesso('');
  }
  function addFixo() {
    setFixos((arr) => [...arr, { nome: '', valor: '', pessoa: 'compartilhado' }]);
  }
  function removeFixo(i) {
    setFixos((arr) => arr.filter((_, idx) => idx !== i));
  }
  function setMeta(i, campo, v) {
    setMetas((arr) => arr.map((m, idx) => (idx === i ? { ...m, [campo]: v } : m)));
    setSucesso('');
  }
  function addMeta() {
    setMetas((arr) => [...arr, { nome: '', valor: '', prazoMeses: '' }]);
  }
  function removeMeta(i) {
    setMetas((arr) => arr.filter((_, idx) => idx !== i));
  }

  async function aoSalvar() {
    setSalvando(true);
    setErro('');
    setSucesso('');
    const dados = {
      salarios: {
        leo: Number(salarios.leo) || 0,
        luis: Number(salarios.luis) || 0,
        diaPagamento: Number(salarios.diaPagamento) || 5,
      },
      fixos: fixos
        .filter((f) => String(f.nome).trim() !== '')
        .map((f) => ({ nome: f.nome, valor: Number(f.valor) || 0, pessoa: f.pessoa })),
      metas: metas
        .filter((m) => String(m.nome).trim() !== '')
        .map((m) => ({ nome: m.nome, valor: Number(m.valor) || 0, prazoMeses: Number(m.prazoMeses) || 0 })),
    };
    try {
      await salvarPerfil(dados);
      setSucesso('Configurações salvas.');
    } catch {
      setErro('Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const inputCls =
    'rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500';

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Configurações</h1>

      {/* Renda */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-slate-700">Renda</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            Salário Leo
            <input type="number" inputMode="decimal" value={salarios.leo} onChange={(e) => setSalario('leo', e.target.value)} className={inputCls} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            Salário Luis
            <input type="number" inputMode="decimal" value={salarios.luis} onChange={(e) => setSalario('luis', e.target.value)} className={inputCls} />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm text-slate-600 w-32">
          Dia do pagamento
          <input type="number" min="1" max="31" value={salarios.diaPagamento} onChange={(e) => setSalario('diaPagamento', e.target.value)} className={inputCls} />
        </label>
      </div>

      {/* Contas fixas */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">Contas fixas</h2>
          <button type="button" onClick={addFixo} className="text-sm text-teal-700 font-medium">+ Adicionar</button>
        </div>
        {fixos.length === 0 && <p className="text-sm text-slate-400">Nenhuma conta fixa.</p>}
        <div className="space-y-2">
          {fixos.map((f, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={f.nome} onChange={(e) => setFixo(i, 'nome', e.target.value)} placeholder="Nome" className={`${inputCls} flex-1 min-w-0`} />
              <input type="number" inputMode="decimal" value={f.valor} onChange={(e) => setFixo(i, 'valor', e.target.value)} placeholder="R$" className={`${inputCls} w-24`} />
              <select value={f.pessoa} onChange={(e) => setFixo(i, 'pessoa', e.target.value)} className={`${inputCls} w-28`}>
                {PESSOAS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <button type="button" onClick={() => removeFixo(i)} className="text-slate-400 hover:text-red-600 px-1" aria-label="Remover">✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Metas */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">Metas</h2>
          <button type="button" onClick={addMeta} className="text-sm text-teal-700 font-medium">+ Adicionar</button>
        </div>
        {metas.length === 0 && <p className="text-sm text-slate-400">Nenhuma meta.</p>}
        <div className="space-y-2">
          {metas.map((m, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input value={m.nome} onChange={(e) => setMeta(i, 'nome', e.target.value)} placeholder="Nome" className={`${inputCls} flex-1 min-w-0`} />
              <input type="number" inputMode="decimal" value={m.valor} onChange={(e) => setMeta(i, 'valor', e.target.value)} placeholder="R$" className={`${inputCls} w-24`} />
              <input type="number" value={m.prazoMeses} onChange={(e) => setMeta(i, 'prazoMeses', e.target.value)} placeholder="meses" className={`${inputCls} w-20`} />
              <button type="button" onClick={() => removeMeta(i)} className="text-slate-400 hover:text-red-600 px-1" aria-label="Remover">✕</button>
            </div>
          ))}
        </div>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {sucesso && <p className="text-sm text-teal-700">{sucesso}</p>}
      <button type="button" onClick={aoSalvar} disabled={salvando} className="w-full rounded-lg bg-teal-700 text-white py-2.5 font-medium hover:bg-teal-800 disabled:opacity-60">
        {salvando ? 'Salvando…' : 'Salvar configurações'}
      </button>

      {/* Conta */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h2 className="font-semibold text-slate-700">Conta</h2>
        <p className="text-sm text-slate-600">Logado como <strong>{nomeMembro ?? '—'}</strong>.</p>
        <button type="button" onClick={() => signOut()} className="rounded-lg bg-slate-200 text-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-300">
          Sair
        </button>
      </div>
    </section>
  );
}
