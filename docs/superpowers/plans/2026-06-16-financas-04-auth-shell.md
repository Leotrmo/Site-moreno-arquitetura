# Auth + Shell (Finanças) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a camada de autenticação (Login/Cadastro, `useAuth`, `ProtectedRoute`) e o shell de navegação (sidebar no desktop / bottom-nav no mobile) com as 5 rotas protegidas vazias (`/dashboard`, `/upload`, `/categorizar`, `/relatorio`, `/configuracoes`), tudo sobre HashRouter.

**Architecture:** Sessão e identidade do membro vivem num único `AuthProvider` (Context) — uma assinatura `onAuthStateChange`, mais a consulta de `household_members` para `householdId`/`nomeMembro`. As telas consomem `useAuth()`. `ProtectedRoute` redireciona deslogado para `/` e mostra loader enquanto a sessão carrega. O shell usa `NavLink` para o estado ativo, com a lista de itens compartilhada entre sidebar e bottom-nav. Toda a lógica testável é extraída em **dois módulos puros** (`authErrors`, `validation`) cobertos por `node --test`; React/roteamento/CSS são verificados **ao vivo no navegador** após o deploy.

**Tech Stack:** React 19 + `react-router-dom` v7 (HashRouter) + Tailwind v4 + `@supabase/supabase-js`. Testes de lógica pura em `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-15-sistema-financeiro-design.md` (§2 stack, §9 hooks/`useAuth`, §10 telas e rotas, §13 regras gerais).

---

## ⚠ Nota de ambiente + verificação (leia antes de começar)

**Este repositório está no Google Drive (`I:\Meu Drive\...`), onde `npm install` quebra**
(o Drive trava a extração de milhares de arquivos; symlink/junction é impossível). Consequências
para este plano:

- **Nada de `node_modules` local.** Localmente só editamos arquivos e rodamos
  `npm test --prefix financas-app` (lógica pura, **não** precisa de deps).
- **Adicionar dependência** = `npm install --package-lock-only react-router-dom` (escreve só
  `package.json` + `package-lock.json`, 2 arquivos — o Drive aguenta). O `npm ci` da GitHub
  Action instala de verdade no CI.
- **Não há `npm run dev` nem build local.** A verificação visual acontece **depois do merge na
  `main`**: a Action `deploy-financas.yml` builda e commita `/financas`, e aí conferimos a URL
  viva (`https://moreno.arq.br/financas`) com o Chrome MCP (`mcp__Claude_in_Chrome`).

**Disciplina de teste:** os módulos puros (`authErrors.js`, `validation.js`) são TDD clássico
(test→red→impl→green→commit). Os componentes React (`AuthContext`, `ProtectedRoute`, `Shell`,
páginas) e o roteamento **não** têm unit test (sem DOM/deps local) — o "teste" deles é a
**verificação ao vivo no navegador** (Task 11), no mesmo espírito de evidência-antes-de-afirmar
do Plano 3.

---

## Mapa de arquivos (o que este plano cria/modifica)

```
financas-app/
  package.json            ★ ganha react-router-dom em dependencies
  package-lock.json       ★ atualizado por --package-lock-only
  src/
    main.jsx              ★ MODIFICADO — <HashRouter><AuthProvider><App/></…>
    App.jsx               ★ REESCRITO — só as <Routes>
    auth/
      authErrors.js       ★ NOVO [PURO] — traduz erro do Supabase → PT-BR   (TDD)
      validation.js       ★ NOVO [PURO] — validarLogin / validarCadastro     (TDD)
      AuthContext.jsx     ★ NOVO — AuthProvider + useAuth (sessão, householdId, nomeMembro, signIn/Up/Out)
    components/
      ProtectedRoute.jsx  ★ NOVO — guarda de rota + loader
      nav.jsx             ★ NOVO — lista de itens {path,label,ícone SVG} compartilhada
      Shell.jsx           ★ NOVO — layout sidebar (desktop) / bottom-nav (mobile) + <Outlet/>
    pages/
      EmBreve.jsx         ★ NOVO — placeholder reutilizável (título + corpo)
      Dashboard.jsx       ★ NOVO — placeholder
      Upload.jsx          ★ NOVO — placeholder
      Categorizar.jsx     ★ NOVO — placeholder
      Relatorio.jsx       ★ NOVO — placeholder
      Configuracoes.jsx   ★ NOVO — placeholder + botão Sair
  test/
    authErrors.test.js    ★ NOVO — node --test
    validation.test.js    ★ NOVO — node --test
```

---

## Parte A — Passo manual do Leo (no painel Supabase, antes da verificação)

- [ ] **A1: Desligar a confirmação de e-mail**

Painel → **Authentication → Sign In / Providers → Email** → desmarque **Confirm email** → Save.
Sem isso, o `signUp` não devolve sessão e o login só funciona após clicar no link do e-mail.
Com isso desligado (decisão aprovada no brainstorming), o cadastro entra direto no dashboard.

> As 2 contas (Leo/Luis) serão criadas pela própria tela de cadastro (Task 9 + verificação na
> Task 11). Não precisa criar nada no painel agora.

---

## Parte B — Tasks de código

### Task 1: Adicionar `react-router-dom`

**Files:**
- Modify: `financas-app/package.json`
- Modify: `financas-app/package-lock.json`

- [ ] **Step 1: Adicionar a dependência sem instalar node_modules**

Run (de dentro de `financas-app/`):
```bash
npm install --package-lock-only react-router-dom
```
Expected: `package.json` ganha `"react-router-dom": "^7.x"` em `dependencies` e o
`package-lock.json` é atualizado. **Nenhum** `node_modules/` é criado (é o `--package-lock-only`).

- [ ] **Step 2: Confirmar que entrou no package.json**

Run: `node -e "const p=require('./financas-app/package.json'); if(!p.dependencies['react-router-dom']) throw new Error('react-router-dom não está em dependencies'); console.log('ok:', p.dependencies['react-router-dom'])"`
Expected: imprime `ok: ^7.x` (ou a major que o npm resolver — a API usada, `HashRouter/Routes/Route/Outlet/Navigate/NavLink`, é estável da v6 em diante).

- [ ] **Step 3: Suíte de lógica pura continua verde**

Run: `npm test --prefix financas-app`
Expected: PASS — 37 testes (adicionar a dep não toca a lógica pura).

- [ ] **Step 4: Commit**

```bash
git add financas-app/package.json financas-app/package-lock.json
git commit -m "chore(financas): adiciona react-router-dom (HashRouter)"
```

---

### Task 2: `authErrors.js` — tradução de erros (PURO, TDD)

**Files:**
- Create: `financas-app/src/auth/authErrors.js`
- Test: `financas-app/test/authErrors.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`financas-app/test/authErrors.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traduzErroAuth } from '../src/auth/authErrors.js';

test('credenciais inválidas', () => {
  assert.equal(
    traduzErroAuth({ message: 'Invalid login credentials' }),
    'E-mail ou senha incorretos.',
  );
});

test('e-mail já cadastrado', () => {
  assert.equal(
    traduzErroAuth({ message: 'User already registered' }),
    'Esse e-mail já está cadastrado. Tente entrar.',
  );
});

test('senha curta', () => {
  assert.equal(
    traduzErroAuth({ message: 'Password should be at least 6 characters' }),
    'A senha precisa ter ao menos 6 caracteres.',
  );
});

test('aceita string crua e mapeia falha de rede', () => {
  assert.equal(
    traduzErroAuth('Failed to fetch'),
    'Sem conexão com o servidor. Verifique sua internet.',
  );
});

test('fallback genérico para erro desconhecido ou nulo', () => {
  assert.equal(traduzErroAuth({ message: 'algo bizarro' }), 'Algo deu errado. Tente de novo.');
  assert.equal(traduzErroAuth(null), 'Algo deu errado. Tente de novo.');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test --prefix financas-app`
Expected: FAIL — `Cannot find module '../src/auth/authErrors.js'`.

- [ ] **Step 3: Implementar o mínimo**

`financas-app/src/auth/authErrors.js`:
```js
// Traduz erros de autenticação do Supabase para mensagens amigáveis em PT-BR.
// Aceita o objeto de erro do supabase-js OU uma string; devolve SEMPRE uma string.

const MENSAGENS = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar.'],
  [/already registered|already been registered/i, 'Esse e-mail já está cadastrado. Tente entrar.'],
  [/password should be at least/i, 'A senha precisa ter ao menos 6 caracteres.'],
  [/unable to validate email|invalid format/i, 'E-mail inválido.'],
  [/rate limit|too many requests/i, 'Muitas tentativas. Espere um momento e tente de novo.'],
  [/failed to fetch|networkerror|network request failed/i, 'Sem conexão com o servidor. Verifique sua internet.'],
];

export function traduzErroAuth(erro) {
  if (!erro) return 'Algo deu errado. Tente de novo.';
  const msg = typeof erro === 'string' ? erro : (erro.message || '');
  for (const [re, texto] of MENSAGENS) {
    if (re.test(msg)) return texto;
  }
  return 'Algo deu errado. Tente de novo.';
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test --prefix financas-app`
Expected: PASS — 42 testes (37 + 5 novos).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/auth/authErrors.js financas-app/test/authErrors.test.js
git commit -m "feat(financas): traducao de erros de auth para PT-BR"
```

---

### Task 3: `validation.js` — validação dos formulários (PURO, TDD)

**Files:**
- Create: `financas-app/src/auth/validation.js`
- Test: `financas-app/test/validation.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`financas-app/test/validation.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarLogin, validarCadastro } from '../src/auth/validation.js';

test('login válido não tem erros', () => {
  assert.deepEqual(validarLogin({ email: 'leo@x.com', senha: '123456' }), { ok: true, erros: {} });
});

test('login: e-mail inválido e senha vazia', () => {
  const r = validarLogin({ email: 'nada', senha: '' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.email);
  assert.ok(r.erros.senha);
});

test('cadastro: senha < 6 reprova, mas nome Leo é aceito', () => {
  const r = validarCadastro({ email: 'leo@x.com', senha: '123', nomeMembro: 'Leo' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.senha);
  assert.equal(r.erros.nomeMembro, undefined);
});

test('cadastro: nome fora de Leo/Luis reprova', () => {
  const r = validarCadastro({ email: 'leo@x.com', senha: '123456', nomeMembro: 'Fulano' });
  assert.equal(r.ok, false);
  assert.ok(r.erros.nomeMembro);
});

test('cadastro válido (Luis) não tem erros', () => {
  assert.deepEqual(
    validarCadastro({ email: 'luis@x.com', senha: 'segredo', nomeMembro: 'Luis' }),
    { ok: true, erros: {} },
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test --prefix financas-app`
Expected: FAIL — `Cannot find module '../src/auth/validation.js'`.

- [ ] **Step 3: Implementar o mínimo**

`financas-app/src/auth/validation.js`:
```js
// Validação pura dos formulários de auth. Retorna { ok, erros: { campo: mensagem } }.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SENHA_MIN = 6;
const NOMES_VALIDOS = ['Leo', 'Luis'];

export function validarLogin({ email, senha }) {
  const erros = {};
  if (!email || !EMAIL_RE.test(email.trim())) erros.email = 'Informe um e-mail válido.';
  if (!senha) erros.senha = 'Informe sua senha.';
  return { ok: Object.keys(erros).length === 0, erros };
}

export function validarCadastro({ email, senha, nomeMembro }) {
  const erros = {};
  if (!email || !EMAIL_RE.test(email.trim())) erros.email = 'Informe um e-mail válido.';
  if (!senha || senha.length < SENHA_MIN) erros.senha = `A senha precisa ter ao menos ${SENHA_MIN} caracteres.`;
  if (!NOMES_VALIDOS.includes(nomeMembro)) erros.nomeMembro = 'Escolha quem é você: Leo ou Luis.';
  return { ok: Object.keys(erros).length === 0, erros };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test --prefix financas-app`
Expected: PASS — 47 testes (42 + 5 novos).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/auth/validation.js financas-app/test/validation.test.js
git commit -m "feat(financas): validacao dos formularios de login/cadastro"
```

---

### Task 4: `AuthContext.jsx` — `AuthProvider` + `useAuth`

**Files:**
- Create: `financas-app/src/auth/AuthContext.jsx`

> Sem unit test (depende do `supabase` e de hooks React). Verificado ao vivo na Task 11.

- [ ] **Step 1: Criar o provider e o hook**

`financas-app/src/auth/AuthContext.jsx`:
```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [membro, setMembro] = useState(null); // { householdId, nomeMembro }
  const [loading, setLoading] = useState(true);

  // Sessão atual + escuta de mudanças (login/logout). Uma assinatura só.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSession(novaSessao);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Com sessão, busca household_id + nome_membro. A linha em household_members é criada
  // pelo trigger no cadastro; se vier vazia logo após o signUp, tenta de novo 1 vez.
  useEffect(() => {
    let ativo = true;
    if (!session) {
      setMembro(null);
      return;
    }
    async function carregarMembro(tentativa = 0) {
      const { data, error } = await supabase
        .from('household_members')
        .select('household_id, nome_membro')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (!ativo) return;
      if (data) {
        setMembro({ householdId: data.household_id, nomeMembro: data.nome_membro });
      } else if (!error && tentativa < 1) {
        setTimeout(() => carregarMembro(tentativa + 1), 800);
      } else {
        setMembro({ householdId: null, nomeMembro: session.user.user_metadata?.nome_membro ?? null });
      }
    }
    carregarMembro();
    return () => {
      ativo = false;
    };
  }, [session]);

  const valor = {
    session,
    user: session?.user ?? null,
    loading,
    householdId: membro?.householdId ?? null,
    nomeMembro: membro?.nomeMembro ?? null,
    signIn: (email, senha) => supabase.auth.signInWithPassword({ email, password: senha }),
    signUp: (email, senha, nomeMembro) =>
      supabase.auth.signUp({ email, password: senha, options: { data: { nome_membro: nomeMembro } } }),
    signOut: () => supabase.auth.signOut(),
  };

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
```

- [ ] **Step 2: Suíte de lógica pura segue verde (nada quebrou)**

Run: `npm test --prefix financas-app`
Expected: PASS — 47 testes.

- [ ] **Step 3: Commit**

```bash
git add financas-app/src/auth/AuthContext.jsx
git commit -m "feat(financas): AuthProvider + useAuth (sessao, household, signIn/Up/Out)"
```

---

### Task 5: `ProtectedRoute.jsx`

**Files:**
- Create: `financas-app/src/components/ProtectedRoute.jsx`

- [ ] **Step 1: Criar a guarda de rota**

`financas-app/src/components/ProtectedRoute.jsx`:
```jsx
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

// Enquanto a sessão carrega, mostra loader. Sem sessão, manda para o login (/).
export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-slate-50 text-slate-500">
        Carregando…
      </div>
    );
  }
  if (!session) return <Navigate to="/" replace />;
  return children;
}
```

- [ ] **Step 2: Commit**

```bash
git add financas-app/src/components/ProtectedRoute.jsx
git commit -m "feat(financas): ProtectedRoute com loader e redirect para login"
```

---

### Task 6: `nav.jsx` — itens de navegação compartilhados

**Files:**
- Create: `financas-app/src/components/nav.jsx`

- [ ] **Step 1: Criar a lista de itens (com ícones SVG inline)**

`financas-app/src/components/nav.jsx`:
```jsx
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
```

- [ ] **Step 2: Commit**

```bash
git add financas-app/src/components/nav.jsx
git commit -m "feat(financas): itens de navegacao compartilhados (icones SVG)"
```

---

### Task 7: `Shell.jsx` — layout sidebar / bottom-nav

**Files:**
- Create: `financas-app/src/components/Shell.jsx`

- [ ] **Step 1: Criar o shell**

`financas-app/src/components/Shell.jsx`:
```jsx
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
```

- [ ] **Step 2: Commit**

```bash
git add financas-app/src/components/Shell.jsx
git commit -m "feat(financas): shell com sidebar (desktop) e bottom-nav (mobile)"
```

---

### Task 8: Páginas placeholder (`EmBreve` + 5 rotas)

**Files:**
- Create: `financas-app/src/pages/EmBreve.jsx`
- Create: `financas-app/src/pages/Dashboard.jsx`
- Create: `financas-app/src/pages/Upload.jsx`
- Create: `financas-app/src/pages/Categorizar.jsx`
- Create: `financas-app/src/pages/Relatorio.jsx`
- Create: `financas-app/src/pages/Configuracoes.jsx`

- [ ] **Step 1: Criar o placeholder reutilizável**

`financas-app/src/pages/EmBreve.jsx`:
```jsx
// Placeholder reutilizável para as telas que serão preenchidas nos Planos 5 e 6.
export default function EmBreve({ titulo, children }) {
  return (
    <section>
      <h1 className="text-xl font-bold text-slate-800 mb-2">{titulo}</h1>
      <div className="text-slate-500">{children ?? 'Em breve.'}</div>
    </section>
  );
}
```

- [ ] **Step 2: Criar `Dashboard.jsx`**

`financas-app/src/pages/Dashboard.jsx`:
```jsx
import EmBreve from './EmBreve.jsx';

export default function Dashboard() {
  return <EmBreve titulo="Resumo">O dashboard chega no Plano 6.</EmBreve>;
}
```

- [ ] **Step 3: Criar `Upload.jsx`**

`financas-app/src/pages/Upload.jsx`:
```jsx
import EmBreve from './EmBreve.jsx';

export default function Upload() {
  return <EmBreve titulo="Subir extrato">O upload de faturas chega no Plano 5.</EmBreve>;
}
```

- [ ] **Step 4: Criar `Categorizar.jsx`**

`financas-app/src/pages/Categorizar.jsx`:
```jsx
import EmBreve from './EmBreve.jsx';

export default function Categorizar() {
  return <EmBreve titulo="Categorizar">A fila de Q&amp;A chega no Plano 5.</EmBreve>;
}
```

- [ ] **Step 5: Criar `Relatorio.jsx`**

`financas-app/src/pages/Relatorio.jsx`:
```jsx
import EmBreve from './EmBreve.jsx';

export default function Relatorio() {
  return <EmBreve titulo="Relatório">Os gráficos chegam no Plano 6.</EmBreve>;
}
```

- [ ] **Step 6: Criar `Configuracoes.jsx` (com botão Sair)**

`financas-app/src/pages/Configuracoes.jsx`:
```jsx
import EmBreve from './EmBreve.jsx';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Configuracoes() {
  const { nomeMembro, signOut } = useAuth();
  return (
    <EmBreve titulo="Configurações">
      <p className="mb-4">Renda, contas fixas e metas chegam no Plano 6.</p>
      <p className="mb-4 text-slate-600">
        Logado como <strong>{nomeMembro ?? '—'}</strong>.
      </p>
      <button
        type="button"
        onClick={() => signOut()}
        className="rounded-lg bg-slate-200 text-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-300"
      >
        Sair
      </button>
    </EmBreve>
  );
}
```

- [ ] **Step 7: Commit**

```bash
git add financas-app/src/pages
git commit -m "feat(financas): paginas placeholder + botao Sair em Configuracoes"
```

---

### Task 9: `Login.jsx` — tela única Login/Cadastro

**Files:**
- Create: `financas-app/src/pages/Login.jsx`

- [ ] **Step 1: Criar a tela**

`financas-app/src/pages/Login.jsx`:
```jsx
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { validarLogin, validarCadastro } from '../auth/validation.js';
import { traduzErroAuth } from '../auth/authErrors.js';

export default function Login() {
  const { session, loading, signIn, signUp } = useAuth();
  const [modo, setModo] = useState('entrar'); // 'entrar' | 'criar'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [nomeMembro, setNomeMembro] = useState('');
  const [erros, setErros] = useState({});
  const [erroGeral, setErroGeral] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Já logado → vai pro dashboard.
  if (!loading && session) return <Navigate to="/dashboard" replace />;

  async function aoEnviar(e) {
    e.preventDefault();
    setErroGeral('');
    const validacao =
      modo === 'entrar' ? validarLogin({ email, senha }) : validarCadastro({ email, senha, nomeMembro });
    setErros(validacao.erros);
    if (!validacao.ok) return;

    setEnviando(true);
    const { error } =
      modo === 'entrar' ? await signIn(email.trim(), senha) : await signUp(email.trim(), senha, nomeMembro);
    setEnviando(false);
    if (error) setErroGeral(traduzErroAuth(error));
    // Em caso de sucesso, onAuthStateChange atualiza a sessão e o <Navigate> acima redireciona.
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-6 bg-slate-50 p-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-teal-700">Finanças</h1>
        <p className="text-slate-500">Leo &amp; Luis</p>
      </div>

      <form
        onSubmit={aoEnviar}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4"
      >
        <div className="flex rounded-lg bg-slate-100 p-1 text-sm font-medium">
          <button
            type="button"
            onClick={() => setModo('entrar')}
            className={`flex-1 rounded-md py-1.5 ${modo === 'entrar' ? 'bg-white shadow text-teal-700' : 'text-slate-500'}`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setModo('criar')}
            className={`flex-1 rounded-md py-1.5 ${modo === 'criar' ? 'bg-white shadow text-teal-700' : 'text-slate-500'}`}
          >
            Criar conta
          </button>
        </div>

        {modo === 'criar' && (
          <div>
            <label className="block text-sm text-slate-600 mb-1">Quem é você?</label>
            <div className="flex gap-2">
              {['Leo', 'Luis'].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNomeMembro(n)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-medium ${
                    nomeMembro === n
                      ? 'border-teal-600 bg-teal-50 text-teal-700'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            {erros.nomeMembro && <p className="text-sm text-red-600 mt-1">{erros.nomeMembro}</p>}
          </div>
        )}

        <div>
          <label className="block text-sm text-slate-600 mb-1">E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {erros.email && <p className="text-sm text-red-600 mt-1">{erros.email}</p>}
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">Senha</label>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          {erros.senha && <p className="text-sm text-red-600 mt-1">{erros.senha}</p>}
        </div>

        {erroGeral && <p className="text-sm text-red-600">{erroGeral}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-lg bg-teal-700 text-white py-2.5 font-medium hover:bg-teal-800 disabled:opacity-60"
        >
          {enviando
            ? modo === 'entrar'
              ? 'Entrando…'
              : 'Criando conta…'
            : modo === 'entrar'
              ? 'Entrar'
              : 'Criar conta'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add financas-app/src/pages/Login.jsx
git commit -m "feat(financas): tela unica de Login/Cadastro com toggle"
```

---

### Task 10: Fiação — `main.jsx` + `App.jsx`

**Files:**
- Modify: `financas-app/src/main.jsx`
- Modify: `financas-app/src/App.jsx`

- [ ] **Step 1: Reescrever `main.jsx` (HashRouter + AuthProvider)**

`financas-app/src/main.jsx`:
```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth/AuthContext.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
```

- [ ] **Step 2: Reescrever `App.jsx` (só as rotas)**

`financas-app/src/App.jsx`:
```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Shell from './components/Shell.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Upload from './pages/Upload.jsx';
import Categorizar from './pages/Categorizar.jsx';
import Relatorio from './pages/Relatorio.jsx';
import Configuracoes from './pages/Configuracoes.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route element={<ProtectedRoute><Shell /></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/categorizar" element={<Categorizar />} />
        <Route path="/relatorio" element={<Relatorio />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

> Padrão de layout-route: `ProtectedRoute` envolve `Shell`; `Shell` renderiza `<Outlet/>`,
> onde as rotas filhas (`/dashboard`, …) aparecem. O smoke test de Supabase do antigo `App.jsx`
> some — quem prova a conexão agora é o próprio login funcionando (Task 11).

- [ ] **Step 3: Suíte de lógica pura segue verde**

Run: `npm test --prefix financas-app`
Expected: PASS — 47 testes.

- [ ] **Step 4: Commit**

```bash
git add financas-app/src/main.jsx financas-app/src/App.jsx
git commit -m "feat(financas): fia HashRouter + AuthProvider + rotas protegidas"
```

---

### Task 11: Deploy e verificação ao vivo

> Não há build local (ambiente CI-only). O merge na `main` dispara a Action, que builda e
> commita `/financas`; só então o app novo está no ar. Esta task é a **prova** de que auth +
> shell funcionam de verdade.

**Files:** nenhum arquivo de código — é deploy + verificação.

- [ ] **Step 1: Garantir que A1 (Confirm email desligado) está feito**

Sem isso, o cadastro não loga e a verificação falha no passo 4.

- [ ] **Step 2: Mesclar `claude/financas-app` na `main` e empurrar**

```bash
git checkout main
git merge --no-ff claude/financas-app -m "merge: auth + shell /financas (Plano 4)"
git push origin main
git checkout claude/financas-app
```

- [ ] **Step 3: Acompanhar a Action até publicar**

Run: `gh run list --workflow=deploy-financas.yml --limit 1`
Depois: `gh run watch <run-id>` (ou aguardar o `[skip ci]` "build automático" aparecer em
`git log origin/main`). Expected: workflow **success**; novo commit de build em `/financas`.

- [ ] **Step 4: Verificar no navegador (Chrome MCP, URL viva)**

Abrir `https://moreno.arq.br/financas/` e confirmar, na ordem:
1. **Tela de login** aparece (campos E-mail/Senha, toggle Entrar/Criar conta), **sem erros no
   console**.
2. Em **Criar conta**: escolher **Leo**, e-mail + senha (≥6) → clica "Criar conta" → cai em
   **`/financas/#/dashboard`** mostrando o shell ("Resumo").
3. Navegar pelos 5 itens — a URL vira `#/upload`, `#/categorizar`, `#/relatorio`,
   `#/configuracoes`; item ativo destacado em teal.
4. **390px** (resize): aparece a **bottom-nav** fixa; desktop (≥768px): aparece a **sidebar**.
5. **Configurações → Sair** → volta para a tela de login.
6. Deslogado, navegar direto para `#/dashboard` → **redireciona** para o login.
7. Repetir o cadastro com **Luis** (segunda conta).

- [ ] **Step 5: Registrar o resultado**

Atualizar a memória do projeto (`financas-app-projeto.md`) marcando o Plano 4 como no ar e
anotando qualquer desvio observado na verificação.

---

## Cobertura do spec por este plano

- **§2 (stack):** `react-router-dom` adicionado (HashRouter) → Task 1; spec já corrigida de "v6"
  para "HashRouter".
- **§9 (`useAuth`):** sessão, `householdId`, `nomeMembro`, `signIn`, `signUp`, `signOut` →
  Task 4. (`useTransacoes`/`usePerfil` e o realtime são dos Planos 5/6.)
- **§10 (telas e rotas):** `/` Login/Cadastro com redirect logado → Task 9; `ProtectedRoute` →
  Task 5; 5 rotas protegidas vazias → Task 8; sidebar/bottom-nav mobile-first → Task 7; **sem
  `404.html`** (HashRouter) — spec corrigida. O badge de pendentes em `/categorizar` e o
  conteúdo das telas ficam nos Planos 5/6.
- **§13 (regras gerais):** PT-BR em toda a UI; erros do Supabase traduzidos → Task 2; loading
  states (botão "Entrando…", loader do `ProtectedRoute`) → Tasks 5 e 9; mobile-first → Task 7.

**Fora deste plano (próximos):** upload + Q&A + `useTransacoes` + realtime (Plano 5);
dashboard + relatório + `usePerfil` + configurações de renda/fixos/metas (Plano 6).

## Riscos e atenção

- **Corrida do trigger no cadastro:** logo após o `signUp`, a linha em `household_members`
  pode ainda não existir quando o `AuthContext` consulta. Mitigado com 1 retry de 800ms
  (Task 4). Se persistir, aumentar para 2 retries — mas a navegação já funciona com a sessão
  (o `nomeMembro` é cosmético no shell).
- **`react-router-dom` v7 + React 19:** compatível; a API usada (`HashRouter`, `Routes`,
  `Route`, `Outlet`, `Navigate`, `NavLink`) é estável desde a v6. Se o `npm ci` da Action
  reclamar de peer deps, fixar uma 7.x específica no `package.json`.
- **HashRouter:** as URLs internas têm `#` (`/financas/#/dashboard`). É o esperado e robusto
  no GitHub Pages (sem rewrite). O PWA abre em `start_url:'/financas/'` e cai no login/redirect.
- **Verificação só pós-merge:** como não há build local, um erro de JSX/import só aparece no
  navegador depois do deploy. Reler os imports relativos (`.jsx`/`.js`) com atenção antes do
  merge da Task 10 reduz ida-e-volta.
- **StrictMode** remonta efeitos uma vez em dev; o `onAuthStateChange` é limpo no unmount
  (`unsubscribe`), então não vaza assinatura. No build de produção não há remontagem.
