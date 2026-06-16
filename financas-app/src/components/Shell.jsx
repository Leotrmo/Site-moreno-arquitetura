import { NavLink, Outlet } from 'react-router-dom';
import { NAV_ITENS } from './nav.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Shell() {
  const { nomeMembro } = useAuth();

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-800 md:flex">
      {/* Sidebar — desktop (md+) */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:shrink-0 bg-white border-r border-slate-200">
        <div className="px-5 py-5 border-b border-slate-100">
          <p className="text-sm text-slate-400">Finanças</p>
          <p className="font-semibold text-teal-700">Leo &amp; Luis</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITENS.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {item.icone}
              {item.label}
            </NavLink>
          ))}
        </nav>
        {nomeMembro && (
          <div className="px-5 py-4 border-t border-slate-100 text-sm text-slate-500">
            Logado como <span className="font-medium text-slate-700">{nomeMembro}</span>
          </div>
        )}
      </aside>

      {/* Conteúdo */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between px-4 h-14 bg-white border-b border-slate-200">
          <span className="font-semibold text-teal-700">Finanças</span>
          {nomeMembro && <span className="text-sm text-slate-500">{nomeMembro}</span>}
        </header>

        <main className="flex-1 w-full max-w-3xl mx-auto p-4 pb-24 md:pb-4">
          <Outlet />
        </main>
      </div>

      {/* Bottom-nav — mobile (< md) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-slate-200 flex">
        {NAV_ITENS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] ${
                isActive ? 'text-teal-700' : 'text-slate-500'
              }`
            }
          >
            {item.icone}
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
