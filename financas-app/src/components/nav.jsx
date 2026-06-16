// Itens de navegação compartilhados entre a sidebar (desktop) e a bottom-nav (mobile).
// Ícones são SVG inline — sem dependência de biblioteca de ícones.

function Icone({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-6 h-6"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const NAV_ITENS = [
  {
    path: '/dashboard',
    label: 'Resumo',
    icone: (
      <Icone>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
      </Icone>
    ),
  },
  {
    path: '/upload',
    label: 'Subir',
    icone: (
      <Icone>
        <path d="M12 16V4" />
        <path d="M7 9l5-5 5 5" />
        <path d="M5 20h14" />
      </Icone>
    ),
  },
  {
    path: '/categorizar',
    label: 'Categorizar',
    icone: (
      <Icone>
        <path d="M3 6h13" />
        <path d="M3 12h13" />
        <path d="M3 18h9" />
        <path d="M16 17l2 2 4-4" />
      </Icone>
    ),
  },
  {
    path: '/relatorio',
    label: 'Relatório',
    icone: (
      <Icone>
        <path d="M4 4v16h16" />
        <rect x="7" y="11" width="3" height="6" />
        <rect x="12" y="7" width="3" height="10" />
        <rect x="17" y="13" width="3" height="4" />
      </Icone>
    ),
  },
  {
    path: '/configuracoes',
    label: 'Config',
    icone: (
      <Icone>
        <path d="M4 6h8" />
        <path d="M16 6h4" />
        <circle cx="14" cy="6" r="2" />
        <path d="M4 12h2" />
        <path d="M10 12h10" />
        <circle cx="8" cy="12" r="2" />
        <path d="M4 18h8" />
        <path d="M16 18h4" />
        <circle cx="14" cy="18" r="2" />
      </Icone>
    ),
  },
];
