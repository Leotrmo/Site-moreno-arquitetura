import { useTransacoes } from '../data/TransacoesContext.jsx';
import { usePerfil } from '../data/PerfilContext.jsx';
import { serieMensal, comparativoCategorias, mesesComDados } from '../lib/relatorio.js';
import { CATEGORIAS } from '../lib/categorias.js';
import { formatBRL, nomeMes } from '../lib/formato.js';
import { Bar, Line } from '../components/charts.jsx';

function labelCategoria(id) {
  const c = CATEGORIAS.find((x) => x.id === id);
  return c ? `${c.emoji} ${c.label}` : id;
}

export default function Relatorio() {
  const { transacoes, loading } = useTransacoes();
  const { perfil } = usePerfil();

  if (loading) return <p className="text-slate-500">Carregando…</p>;

  const meses = mesesComDados(transacoes);
  if (meses.length < 2) {
    return (
      <section className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800">Relatório</h1>
        <div className="text-center text-slate-400 py-16">
          <p className="text-4xl mb-2">📈</p>
          <p>Adicione mais meses de extrato para ver tendências.</p>
        </div>
      </section>
    );
  }

  const serie = serieMensal(transacoes, perfil);
  const labels = serie.map((s) => nomeMes(s.mes));
  const comp = comparativoCategorias(transacoes);

  const dadosGastosSaldo = {
    labels,
    datasets: [
      { label: 'Gastos', data: serie.map((s) => s.totalGastos), backgroundColor: '#0891b2' },
      { label: 'Saldo', data: serie.map((s) => s.saldo), backgroundColor: '#0f766e' },
    ],
  };
  const dadosScore = {
    labels,
    datasets: [{ label: 'Score', data: serie.map((s) => s.score), borderColor: '#7c3aed', backgroundColor: '#7c3aed', tension: 0.3 }],
  };
  const optsBar = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } };
  const optsLine = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, max: 100 } } };

  return (
    <section className="space-y-5">
      <h1 className="text-xl font-bold text-slate-800">Relatório</h1>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-3">Gastos e saldo por mês</h2>
        <div className="h-64"><Bar data={dadosGastosSaldo} options={optsBar} /></div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h2 className="font-semibold text-slate-700 mb-3">Evolução do score</h2>
        <div className="h-56"><Line data={dadosScore} options={optsLine} /></div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 overflow-x-auto">
        <h2 className="font-semibold text-slate-700 mb-3">Categoria × mês</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-1 pr-3 font-medium">Categoria</th>
              {comp.meses.map((m) => <th key={m} className="py-1 px-2 text-right font-medium whitespace-nowrap">{nomeMes(m)}</th>)}
            </tr>
          </thead>
          <tbody>
            {comp.categorias.map((c) => (
              <tr key={c.categoria} className="border-t border-slate-100">
                <td className="py-1.5 pr-3 text-slate-700 whitespace-nowrap">{labelCategoria(c.categoria)}</td>
                {c.valores.map((v, i) => <td key={i} className="py-1.5 px-2 text-right text-slate-600 whitespace-nowrap">{v ? formatBRL(v) : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
