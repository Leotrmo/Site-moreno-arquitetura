import { Link } from 'react-router-dom';
import { useTransacoes } from '../data/TransacoesContext.jsx';
import { usePerfil } from '../data/PerfilContext.jsx';
import { analisar } from '../lib/analisador.js';
import { paraAnalise } from '../lib/transacaoAdapter.js';
import { formatBRL, formatData, nomeMes, shiftMes } from '../lib/formato.js';
import { Doughnut, Bar, CORES } from '../components/charts.jsx';

const COR_FAIXA = {
  success: 'text-teal-700 bg-teal-50',
  warning: 'text-amber-700 bg-amber-50',
  danger: 'text-red-700 bg-red-50',
};

export default function Dashboard() {
  const { transacoesDoMes, mesReferencia, setMesReferencia, loading } = useTransacoes();
  const { perfil } = usePerfil();

  if (loading) return <p className="text-slate-500">Carregando…</p>;

  const linhas = transacoesDoMes(mesReferencia);
  const analise = analisar(paraAnalise(linhas), perfil);
  const semDados = linhas.length === 0;
  const semRenda = (Number(perfil?.salarios?.leo) || 0) + (Number(perfil?.salarios?.luis) || 0) === 0;

  const dadosCategorias = {
    labels: analise.porCategoria.map((c) => `${c.emoji} ${c.label}`),
    datasets: [{
      data: analise.porCategoria.map((c) => c.valor),
      backgroundColor: analise.porCategoria.map((_, i) => CORES[i % CORES.length]),
      borderWidth: 0,
    }],
  };
  const dadosPessoa = {
    labels: ['Leo', 'Luis', 'Compart.'],
    datasets: [{
      label: 'Gastos',
      data: [analise.porPessoa.leo.valor, analise.porPessoa.luis.valor, analise.porPessoa.compartilhado.valor],
      backgroundColor: ['#0f766e', '#0891b2', '#94a3b8'],
    }],
  };
  const optsBar = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } },
  };
  const optsDoughnut = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
  };

  return (
    <section className="space-y-5">
      {/* Navegador de mês */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Resumo</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMesReferencia(shiftMes(mesReferencia, -1))} className="px-2 py-1 rounded-lg border border-slate-200 text-slate-600" aria-label="Mês anterior">◀</button>
          <span className="text-sm font-medium text-slate-700 w-24 text-center">{nomeMes(mesReferencia)}</span>
          <button type="button" onClick={() => setMesReferencia(shiftMes(mesReferencia, 1))} className="px-2 py-1 rounded-lg border border-slate-200 text-slate-600" aria-label="Próximo mês">▶</button>
        </div>
      </div>

      {semRenda && (
        <Link to="/configuracoes" className="block rounded-xl bg-amber-50 text-amber-800 text-sm px-4 py-3">
          💡 Configure sua renda em Configurações para ver saldo e score.
        </Link>
      )}

      {semDados ? (
        <div className="text-center text-slate-400 py-16">
          <p className="text-4xl mb-2">📭</p>
          <p>Nenhuma transação em {nomeMes(mesReferencia)}.</p>
          <Link to="/upload" className="text-teal-700 font-medium">Subir um extrato</Link>
        </div>
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 gap-3">
            <Card titulo="Renda" valor={formatBRL(analise.rendaTotal)} />
            <Card titulo="Gastos" valor={formatBRL(analise.totalGastos)} />
            <Card titulo="Saldo" valor={formatBRL(analise.saldo)} destaque={analise.saldo < 0 ? 'text-red-600' : 'text-teal-700'} />
            <Card titulo="Taxa de poupança" valor={`${analise.taxaPoupanca}%`} />
          </div>

          {/* Score */}
          <div className={`rounded-2xl p-5 flex items-center justify-between ${COR_FAIXA[analise.score.cor]}`}>
            <div>
              <p className="text-sm opacity-80">Saúde financeira</p>
              <p className="text-lg font-semibold">{analise.score.label}</p>
            </div>
            <p className="text-4xl font-bold">{analise.score.valor}<span className="text-lg font-normal opacity-70">/100</span></p>
          </div>

          {/* Gráficos */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Por categoria</h2>
            <div className="h-64"><Doughnut data={dadosCategorias} options={optsDoughnut} /></div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Leo × Luis</h2>
            <div className="h-56"><Bar data={dadosPessoa} options={optsBar} /></div>
          </div>

          {/* Alertas */}
          {analise.alertas.length > 0 && (
            <div className="space-y-2">
              {analise.alertas.map((a, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-100 shadow-sm px-4 py-3 text-sm text-slate-700">
                  {a.icon} {a.msg}
                </div>
              ))}
            </div>
          )}

          {/* Recomendações */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="font-semibold text-slate-700 mb-2">Recomendações</h2>
            <ul className="list-disc list-inside space-y-1 text-sm text-slate-600">
              {analise.recomendacoes.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>

          {/* Parcelamentos */}
          {analise.parcelamentos.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h2 className="font-semibold text-slate-700 mb-3">Parcelamentos ativos</h2>
              <div className="space-y-2">
                {analise.parcelamentos.map((p, i) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <div className="min-w-0">
                      <p className="text-slate-700 truncate">{p.descricao}</p>
                      <p className="text-slate-400">{p.parcela} · falta {formatBRL(p.totalRestante)}</p>
                    </div>
                    <p className="font-medium text-slate-700 shrink-0">{formatBRL(p.valorMensal)}/mês</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top 10 */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <h2 className="font-semibold text-slate-700 mb-3">Maiores gastos</h2>
            <div className="space-y-1.5">
              {analise.topTransacoes.map((t, i) => (
                <div key={i} className="flex justify-between items-center text-sm">
                  <div className="min-w-0">
                    <p className="text-slate-700 truncate">{t.descricao}</p>
                    <p className="text-slate-400">{formatData(t.data)}</p>
                  </div>
                  <p className="font-medium text-slate-700 shrink-0">{formatBRL(t.valor)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Card({ titulo, valor, destaque = 'text-slate-800' }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-xs text-slate-500">{titulo}</p>
      <p className={`text-xl font-bold ${destaque}`}>{valor}</p>
    </div>
  );
}
