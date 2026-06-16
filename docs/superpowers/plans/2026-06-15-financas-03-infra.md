# Infraestrutura (Finanças) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pôr de pé toda a infraestrutura do app: backend Supabase (schema + RLS + trigger + realtime via SQL no painel), o scaffolding Vite + React + Tailwind v4 + PWA que builda para `/financas`, o cliente Supabase no front, e a GitHub Action que builda e commita `/financas` a cada push em `financas-app/**`.

**Architecture:** O backend é criado **manualmente** rodando um único arquivo SQL no painel do Supabase (Parte A) — é um passo de infra, não código testável. O front é um app Vite/React: `vite.config.js` com `base:'/financas/'` e `build.outDir:'../financas'` faz o build cair na pasta servida pelo GitHub Pages. Tailwind v4 entra pelo plugin oficial `@tailwindcss/vite` (sem `tailwind.config.js`, sem PostCSS). PWA via `vite-plugin-pwa` com ícones gerados de um SVG fonte por `@vite-pwa/assets-generator`. O deploy espelha o `refresh-meta.yml`: a Action builda e commita o `dist` em `/financas` na `main`.

**Tech Stack:** Vite 6, React 19, `@tailwindcss/vite` (Tailwind v4), `vite-plugin-pwa` + `@vite-pwa/assets-generator`, `@supabase/supabase-js`. Os testes de lógica pura continuam em `node --test`.

**Spec:** `docs/superpowers/specs/2026-06-15-sistema-financeiro-design.md` (§3 arquitetura no repo, §4 modelo de dados, §11 PWA, §12 setup manual).

---

> ## ✅ STATUS (2026-06-16): IMPLEMENTADO E NO AR
> App placeholder em produção: **https://moreno.arq.br/financas** ("Supabase conectado ✓",
> sem erros de console). SQL rodado e confirmado por sonda REST. Desvios na execução vs. o
> texto abaixo (a máquina do Leo é Google Drive, onde `npm install` não roda):
> - **Modelo CI-only:** `node_modules` nunca é instalado localmente. A GitHub Action faz
>   `npm ci` + `generate-pwa-assets` + `build`. Localmente só edita-se código e roda-se
>   `npm test` (lógica pura, sem deps). O `package-lock.json` foi gerado com
>   `npm install --package-lock-only` (1 arquivo, sem extrair nada no Drive).
> - **Sem geração local de ícones** (Task 4) nem build local (Task 7 passos 2-4): tudo no CI.
>   Os PNGs gerados são gitignorados; só o build em `/financas` (que os inclui) é commitado.
> - **Action** (`.github/workflows/deploy-financas.yml`): node 22, passo extra
>   `generate-pwa-assets`, e o passo de commit faz `git add financas` ANTES de
>   `git diff --cached --quiet` (senão o 1º deploy, todo untracked, não commitaria nada).
> - **Roteamento:** decidido HashRouter no Plano 4; este plano não cria `404.html`.

---

## Nota sobre verificação (infra não é TDD)

Os planos 1 e 2 eram lógica pura → TDD clássico (test→red→green). Este plano é
**infraestrutura**: não dá para "testar via unit test" um `vite.config.js`, um SQL no
painel ou uma GitHub Action. A disciplina aqui é a mesma em espírito — **evidência antes
de afirmar que está pronto** — mas o "teste" de cada task é um **comando de verificação
com saída esperada** (o build gera os arquivos? o dev server sobe? a suíte `node --test`
continua 37/37? o app conecta no Supabase?). Cada task termina com essa verificação.

## Decisão de roteamento (afeta o Plano 4, registrada aqui)

GitHub Pages serve o site estático e **não tem rewrite de servidor**. Para um app em
subpasta (`/financas/`), o truque de `404.html` do BrowserRouter é frágil (o Pages usa o
`404.html` da **raiz**, não um por subpasta). **Recomendação: usar `HashRouter`** no
Plano 4 (`/financas/#/dashboard`) — robusto, zero config de servidor, e como o PWA abre
direto em `start_url:'/financas/'`, o usuário quase nunca vê o `#`. Por isso este plano
**não cria `404.html`** (seria morto com HashRouter). Se Leo preferir URLs limpas
(BrowserRouter), revisitamos no Plano 4 com o redirect script estilo `spa-github-pages`.

## Mapa de arquivos (o que este plano cria)

```
financas-app/
  package.json            ★ ganha deps + scripts (dev/build/preview); test continua node --test
  package-lock.json       ★ NOVO — commitado (npm ci da Action depende dele)
  .gitignore              ★ ganha dev-dist/
  .env                    ★ NOVO — VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (publicáveis, commitados)
  index.html             ★ NOVO — entry do Vite + meta tags PWA/iOS
  vite.config.js          ★ NOVO — base/outDir + react + tailwind + pwa
  pwa-assets.config.js    ★ NOVO — config do gerador de ícones
  public/
    logo.svg              ★ NOVO — ícone fonte (gera os PNGs)
    pwa-192x192.png …     ★ NOVO — ícones gerados e COMMITADOS (Action não roda sharp)
  src/
    main.jsx              ★ NOVO — monta o React
    App.jsx               ★ NOVO — placeholder + smoke test de conexão Supabase
    index.css             ★ NOVO — @import "tailwindcss";
    lib/
      supabase.js         ★ NOVO — cliente Supabase único
      (shared, hash, parsers/*, categorias, categorizador, analisador — já existem)
  supabase/
    schema.sql            ★ JÁ CRIADO — o SQL da Parte A (referência versionada)
.github/workflows/
  deploy-financas.yml     ★ NOVO — build + commit de /financas no push a financas-app/**
```

---

## Parte A — Setup manual do Supabase (Leo faz no painel, ANTES do build)

> Estes passos não são tasks de código — são cliques no painel. Faça-os primeiro; o front
> (Parte B) só conecta de verdade depois disto. O SQL já está versionado em
> [`financas-app/supabase/schema.sql`](../../../financas-app/supabase/schema.sql) — abra esse
> arquivo e copie o conteúdo inteiro.

- [ ] **A1: Rodar o schema no SQL Editor**

1. Acesse https://supabase.com/dashboard → projeto `kwtmychtpviwbbgwbict`.
2. Menu lateral **SQL Editor** → **New query**.
3. Cole o conteúdo **inteiro** de `financas-app/supabase/schema.sql` (abaixo, na íntegra,
   para referência) e clique **Run**.

```sql
-- ============================================================================
-- Finanças Leo & Luis — Schema completo do Supabase
-- (idempotente: pode rodar mais de uma vez sem duplicar nem dar erro)
-- ============================================================================

-- 1. TABELAS ----------------------------------------------------------------
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Leo & Luis',
  criado_em timestamptz default now()
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  nome_membro text not null,
  unique (household_id, user_id)
);

create table if not exists public.transacoes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  data date not null,
  descricao text not null,
  descricao_original text,
  valor numeric(10,2) not null,
  banco text not null check (banco in ('itau','bradesco')),
  pessoa text not null check (pessoa in ('leo','luis','compartilhado')),
  categoria text,
  eh_fixo boolean default false,
  parcela_atual int,
  parcela_total int,
  arquivo_origem text,
  mes_referencia char(7) not null,
  hash_origem text not null,
  criado_em timestamptz default now(),
  unique (household_id, hash_origem)
);

create table if not exists public.regras_categoria (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  chave text not null,
  categoria text not null,
  pessoa_padrao text,
  unique (household_id, chave)
);

create table if not exists public.perfil (
  id uuid primary key default gen_random_uuid(),
  household_id uuid unique references public.households(id) on delete cascade,
  dados jsonb not null default '{}',
  atualizado_em timestamptz default now()
);

create table if not exists public.arquivos_processados (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  nome_arquivo text not null,
  banco text not null,
  mes_referencia char(7),
  total_transacoes int,
  processado_em timestamptz default now(),
  unique (household_id, nome_arquivo)
);

-- 2. FUNÇÃO DE HOUSEHOLD -----------------------------------------------------
create or replace function public.get_household_id()
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select household_id
  from public.household_members
  where user_id = auth.uid()
  limit 1
$$;

-- 3. RLS + POLÍTICAS ---------------------------------------------------------
alter table public.households            enable row level security;
alter table public.household_members     enable row level security;
alter table public.transacoes            enable row level security;
alter table public.regras_categoria      enable row level security;
alter table public.perfil                enable row level security;
alter table public.arquivos_processados  enable row level security;

drop policy if exists "ver a propria household" on public.households;
create policy "ver a propria household"
  on public.households for select
  using (id = public.get_household_id());

drop policy if exists "ver membros da propria household" on public.household_members;
create policy "ver membros da propria household"
  on public.household_members for select
  using (household_id = public.get_household_id());

drop policy if exists "household manda em transacoes" on public.transacoes;
create policy "household manda em transacoes"
  on public.transacoes for all
  using (household_id = public.get_household_id())
  with check (household_id = public.get_household_id());

drop policy if exists "household manda em regras_categoria" on public.regras_categoria;
create policy "household manda em regras_categoria"
  on public.regras_categoria for all
  using (household_id = public.get_household_id())
  with check (household_id = public.get_household_id());

drop policy if exists "household manda em perfil" on public.perfil;
create policy "household manda em perfil"
  on public.perfil for all
  using (household_id = public.get_household_id())
  with check (household_id = public.get_household_id());

drop policy if exists "household manda em arquivos_processados" on public.arquivos_processados;
create policy "household manda em arquivos_processados"
  on public.arquivos_processados for all
  using (household_id = public.get_household_id())
  with check (household_id = public.get_household_id());

-- 4. SEMENTE: household única ------------------------------------------------
insert into public.households (nome)
select 'Leo & Luis'
where not exists (select 1 from public.households);

-- 5. TRIGGER DE CADASTRO -----------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.household_members (household_id, user_id, nome_membro)
  values (
    (select id from public.households order by criado_em limit 1),
    new.id,
    coalesce(new.raw_user_meta_data->>'nome_membro', 'Membro')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. REALTIME ----------------------------------------------------------------
alter table public.transacoes       replica identity full;
alter table public.regras_categoria replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transacoes'
  ) then
    alter publication supabase_realtime add table public.transacoes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'regras_categoria'
  ) then
    alter publication supabase_realtime add table public.regras_categoria;
  end if;
end $$;
```

**Verificação esperada:** mensagem `Success. No rows returned`. Em **Table Editor**, 6
tabelas; `households` com 1 linha `Leo & Luis`. Em **Database → Publications →
supabase_realtime**, `transacoes` e `regras_categoria` marcadas.

- [ ] **A2: Pegar a chave publicável (anon) e a URL**

Painel → **Project Settings → API**. Copie:
- **Project URL** → `https://kwtmychtpviwbbgwbict.supabase.co`
- **anon / publishable key** (começa com `eyJ…` ou `sb_publishable_…`).

Guarde os dois — vão para o `.env` na Task 2 da Parte B. (A `service_role` **nunca** entra
no repo.)

- [ ] **A3: (Opcional agora) Desligar confirmação de e-mail para facilitar o cadastro**

Painel → **Authentication → Sign In / Providers → Email** → desmarque **Confirm email**
(ou deixe ligado e confirme pelos e-mails). Sem isso, o login só funciona após clicar no
link de confirmação. As 2 contas (Leo/Luis) serão criadas pela tela de cadastro no
Plano 4 — não precisa criar agora.

> Quando A1 e A2 estiverem feitos, siga para a Parte B.

---

## Parte B — Scaffolding do front (tasks de código)

### Task 1: Dependências e scripts do Vite

**Files:**
- Modify: `financas-app/package.json`
- Create: `financas-app/package-lock.json` (gerado pelo npm)
- Modify: `financas-app/.gitignore`

- [ ] **Step 1: Instalar as dependências de runtime**

Run (de dentro de `financas-app/`):
```bash
npm install react react-dom @supabase/supabase-js
```

- [ ] **Step 2: Instalar as dependências de build (dev)**

```bash
npm install -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite vite-plugin-pwa @vite-pwa/assets-generator
```

> Use as versões mais recentes que o npm resolver; o `package-lock.json` fixa o que foi
> instalado. Não fixe versões à mão aqui.

- [ ] **Step 3: Ajustar `scripts` no `package.json`**

Deixe o bloco `scripts` exatamente assim (mantém `test` em `node --test` — a lógica pura
não muda):
```json
{
  "name": "financas-app",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "node --test",
    "generate-pwa-assets": "pwa-assets-generator --preset minimal-2023 public/logo.svg"
  }
}
```

> Não apague o bloco `dependencies`/`devDependencies` que os Steps 1–2 escreveram; só
> reescreva `scripts`.

- [ ] **Step 4: Acrescentar `dev-dist/` ao `.gitignore`**

`financas-app/.gitignore` (resultado final):
```gitignore
node_modules/
dist/
dev-dist/
.env.local
samples-local/
```

> `.env` (sem `.local`) **fica de fora do .gitignore de propósito** — a chave é publicável
> e precisa ser commitada (a Action lê dela no build).

- [ ] **Step 5: Verificar que a suíte de lógica pura continua verde**

Run: `npm test --prefix financas-app`
Expected: PASS — 37 testes (nada quebrou ao adicionar deps).

- [ ] **Step 6: Commit**

```bash
git add financas-app/package.json financas-app/package-lock.json financas-app/.gitignore
git commit -m "chore(financas): deps Vite/React/Tailwind/PWA + scripts"
```

---

### Task 2: Variáveis de ambiente (`.env`)

**Files:**
- Create: `financas-app/.env`

- [ ] **Step 1: Criar `financas-app/.env`**

Cole a URL e a chave publicável da Task A2 (substitua `COLE_A_CHAVE_PUBLICAVEL_AQUI`):
```dotenv
VITE_SUPABASE_URL=https://kwtmychtpviwbbgwbict.supabase.co
VITE_SUPABASE_ANON_KEY=COLE_A_CHAVE_PUBLICAVEL_AQUI
```

- [ ] **Step 2: Confirmar que o `.env` NÃO está ignorado**

Run: `git check-ignore financas-app/.env; echo "exit=$?"`
Expected: imprime apenas `exit=1` (nenhuma linha antes) → o arquivo **não** é ignorado e
será commitado. (Se imprimir o caminho, revise o `.gitignore`.)

- [ ] **Step 3: Commit**

```bash
git add financas-app/.env
git commit -m "chore(financas): .env com URL + chave publicavel do Supabase"
```

---

### Task 3: Cliente Supabase (`src/lib/supabase.js`)

**Files:**
- Create: `financas-app/src/lib/supabase.js`

- [ ] **Step 1: Criar o cliente**

`financas-app/src/lib/supabase.js`:
```js
import { createClient } from '@supabase/supabase-js';

// Cliente único do app. As variáveis vêm do .env (VITE_*), são publicáveis;
// a segurança real é a RLS no Postgres.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env');
}

export const supabase = createClient(url, anonKey);
```

- [ ] **Step 2: Commit**

```bash
git add financas-app/src/lib/supabase.js
git commit -m "feat(financas): cliente Supabase unico"
```

---

### Task 4: Ícone fonte e geração dos assets PWA

**Files:**
- Create: `financas-app/public/logo.svg`
- Create: `financas-app/pwa-assets.config.js`
- Create (gerados): `financas-app/public/pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`

- [ ] **Step 1: Criar o SVG fonte `financas-app/public/logo.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0f766e"/>
  <text x="50%" y="52%" dominant-baseline="central" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="300" font-weight="700" fill="#ffffff">$</text>
</svg>
```

- [ ] **Step 2: Criar `financas-app/pwa-assets.config.js`**

```js
import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset,
  images: ['public/logo.svg'],
});
```

- [ ] **Step 3: Gerar os ícones**

Run (de dentro de `financas-app/`): `npm run generate-pwa-assets`
Expected: cria em `public/` os arquivos `pwa-64x64.png`, `pwa-192x192.png`,
`pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png` e
`favicon.ico`.

- [ ] **Step 4: Verificar que os PNGs existem**

Run: `ls financas-app/public`
Expected: lista contendo `logo.svg`, `pwa-192x192.png`, `pwa-512x512.png`,
`maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`.

> Os PNGs são **commitados** (geramos uma vez) para a GitHub Action não precisar rodar o
> `sharp`/gerador no CI — o build dela fica só `npm ci && npm run build`.

- [ ] **Step 5: Commit**

```bash
git add financas-app/public financas-app/pwa-assets.config.js
git commit -m "feat(financas): icone fonte + assets PWA gerados"
```

---

### Task 5: `index.html` (entry do Vite + meta tags PWA/iOS)

**Files:**
- Create: `financas-app/index.html`

- [ ] **Step 1: Criar `financas-app/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="logo.svg" type="image/svg+xml" />
    <link rel="apple-touch-icon" href="apple-touch-icon-180x180.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#0f766e" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Finanças" />
    <title>Finanças — Leo & Luis</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

> Os `href` relativos (`logo.svg`, `apple-touch-icon-180x180.png`) e `/src/main.jsx` são
> reescritos pelo Vite com o `base:'/financas/'` no build. Não fixe `/financas/` à mão aqui.

- [ ] **Step 2: Commit**

```bash
git add financas-app/index.html
git commit -m "feat(financas): index.html com meta tags PWA/iOS"
```

---

### Task 6: CSS base do Tailwind + React entry + App placeholder

**Files:**
- Create: `financas-app/src/index.css`
- Create: `financas-app/src/main.jsx`
- Create: `financas-app/src/App.jsx`

- [ ] **Step 1: Criar `financas-app/src/index.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 2: Criar `financas-app/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 3: Criar `financas-app/src/App.jsx` (placeholder + smoke test de conexão)**

O placeholder faz uma consulta trivial a `households`. Deslogado, a RLS devolve **0 linhas
sem erro** (a chave/URL estão válidas) — é o smoke test de que o Supabase respondeu.
```jsx
import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';

export default function App() {
  const [status, setStatus] = useState('Conectando ao Supabase…');

  useEffect(() => {
    supabase
      .from('households')
      .select('id')
      .limit(1)
      .then(({ error }) => {
        setStatus(error ? `Erro: ${error.message}` : 'Supabase conectado ✓');
      });
  }, []);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-teal-700 text-white p-6">
      <h1 className="text-2xl font-bold">Finanças — Leo &amp; Luis</h1>
      <p className="text-teal-100">{status}</p>
    </main>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add financas-app/src/index.css financas-app/src/main.jsx financas-app/src/App.jsx
git commit -m "feat(financas): CSS Tailwind + React entry + App placeholder"
```

---

### Task 7: `vite.config.js` (base, outDir, react, tailwind, PWA)

**Files:**
- Create: `financas-app/vite.config.js`

- [ ] **Step 1: Criar `financas-app/vite.config.js`**

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // servido em moreno.arq.br/financas
  base: '/financas/',
  // o build cai na pasta estática servida pelo GitHub Pages (fora de financas-app/)
  build: { outDir: '../financas', emptyOutDir: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Finanças Leo & Luis',
        short_name: 'Finanças',
        description: 'Controle financeiro do casal',
        lang: 'pt-BR',
        theme_color: '#0f766e',
        background_color: '#0f766e',
        display: 'standalone',
        scope: '/financas/',
        start_url: '/financas/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
```

- [ ] **Step 2: Subir o dev server e verificar que renderiza + conecta**

Run (de `financas-app/`): `npm run dev`
Verificação (preview tools ou navegador em `http://localhost:5173/financas/`):
- a página mostra "Finanças — Leo & Luis";
- aparece **"Supabase conectado ✓"** (prova de que `.env` + cliente + RLS funcionam);
- **console sem erros** (sem 401/404 do Supabase, sem erro de import).

> Se aparecer "Erro: …", revise o `.env` (Task 2) e se o schema (A1) rodou.

- [ ] **Step 3: Buildar e conferir a saída em `/financas`**

Run (de `financas-app/`): `npm run build`
Expected: build sem erro; cria/atualiza, na **raiz do repo**, `financas/index.html`,
`financas/assets/*`, `financas/manifest.webmanifest`, `financas/sw.js` e os ícones PWA.

- [ ] **Step 4: Verificar os artefatos do build**

Run: `ls financas`
Expected: contém `index.html`, `assets/`, `manifest.webmanifest`, `sw.js`,
`pwa-192x192.png`, `pwa-512x512.png`.

- [ ] **Step 5: Commit (config + primeiro build de /financas)**

```bash
git add financas-app/vite.config.js financas
git commit -m "feat(financas): vite.config (base/outDir/PWA) + build inicial de /financas"
```

---

### Task 8: GitHub Action de deploy

**Files:**
- Create: `.github/workflows/deploy-financas.yml`

- [ ] **Step 1: Criar `.github/workflows/deploy-financas.yml`**

Espelha o `refresh-meta.yml`. Dispara só em push na `main` que toque `financas-app/**` (ou
o próprio workflow) — commitar `financas/**` **não** redispara (não está no filtro), então
não há loop.
```yaml
# .github/workflows/deploy-financas.yml
name: Deploy Finanças

on:
  push:
    branches: [main]
    paths:
      - 'financas-app/**'
      - '.github/workflows/deploy-financas.yml'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Instalar dependências
        working-directory: financas-app
        run: npm ci
      - name: Build
        working-directory: financas-app
        run: npm run build
      - name: Commitar build se houve mudança
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if ! git diff --quiet -- financas; then
            git add financas
            git commit -m "chore(financas): build automático [skip ci]"
            git push
          else
            echo "Sem mudanças no build."
          fi
```

- [ ] **Step 2: Validar a sintaxe do YAML**

Run: `node -e "const f=require('fs').readFileSync('.github/workflows/deploy-financas.yml','utf8'); if(!/name: Deploy Finanças/.test(f)) throw new Error('conteúdo inesperado'); console.log('YAML lido, indentação 2 espaços OK')"`
Expected: imprime a mensagem de OK (checagem leve; a validação real é o GitHub aceitar o
workflow após o merge na `main`).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-financas.yml
git commit -m "ci(financas): Action que builda e commita /financas no push"
```

> **Sobre `npm ci` na Action:** depende do `package-lock.json` (Task 1) estar commitado.
> A Action só roda de verdade quando `financas-app/**` chega na `main` (via merge da
> `claude/financas-app`). O `build` inicial já foi commitado na Task 7, então o primeiro
> merge não vai necessariamente gerar diff — tudo bem, o `else "Sem mudanças"` cobre isso.

---

## Cobertura do spec por este plano

- §3 (arquitetura no repo: `base:'/financas/'`, `outDir:'../financas'`, `.env` publicável,
  Action de deploy, sem gh-pages) → Tasks 1, 2, 7, 8.
- §4 (modelo de dados: 6 tabelas, `get_household_id()`, RLS, household semeada, trigger de
  cadastro) → Parte A (A1) + `supabase/schema.sql`.
- §9 (passo manual: habilitar Realtime em `transacoes` e `regras_categoria`) → Parte A (A1,
  seção 6 do SQL).
- §11 (PWA: manifest scope/start_url `/financas/`, theme `#0f766e`, ícones 192/512 de um SVG,
  meta tags `apple-mobile-web-app-*`, autoUpdate) → Tasks 4, 5, 7.
- §12 (setup manual: rodar SQL, habilitar Realtime, chave/URL) → Parte A (A1–A3).
- Cliente Supabase para os hooks dos próximos planos → Task 3.

**Fora deste plano (próximos):** auth + rotas + layout/shell, com a decisão HashRouter
(Plano 4); upload + Q&A + realtime hooks (Plano 5); dashboard + configurações (Plano 6).
A criação das 2 contas (Leo/Luis) acontece pela tela de cadastro do Plano 4.

## Riscos e atenção

- **`emptyOutDir: true` apaga `/financas` inteiro a cada build.** Correto aqui (a pasta é
  100% artefato), mas nunca colocar nada feito à mão em `/financas`.
- **`npm ci` exige o lockfile commitado** — se a Task 1 não commitar `package-lock.json`, a
  Action falha. O Step 6 da Task 1 já inclui o lockfile.
- **Trigger em `auth.users`** só pode ser criado por papel privilegiado; no SQL Editor do
  painel isso funciona (roda como `postgres`). Em CLI local com role comum, não.
- **Realtime + `replica identity full`**: necessário para o filtro por `household_id` valer
  em eventos DELETE no Plano 5; já incluído no SQL.
