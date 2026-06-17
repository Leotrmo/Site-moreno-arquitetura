# Finanças Plano 6 — Dashboard + Relatório + Configurações + PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir os 3 stubs `EmBreve` (Dashboard, Relatório, Configurações) por telas reais que consomem o analisador já pronto, adicionar `usePerfil`, conectar gráficos (Chart.js) e finalizar/verificar o PWA — fechando o MVP do app financeiro.

**Architecture:** Lógica de agregação/formatação fica em helpers puros testados em `src/lib/` (TDD com `node --test`); as telas React ficam finas, só apresentação. O Dashboard consome `analisar(transacoesDoMes(mes).map(linhaParaTransacao), perfil)`; o Relatório agrega vários meses via `serieMensal`/`comparativoCategorias`. `usePerfil` faz upsert no jsonb `perfil.dados` no formato exato que o analisador lê.

**Tech Stack:** React 19, Vite 8, Tailwind v4, react-router-dom v7, `@supabase/supabase-js`, Chart.js + react-chartjs-2 (novos). Testes: `node --test`.

---

## Ambiente — leia antes de começar

- **CI-only:** repo no Google Drive; **NÃO** rodar `npm install` completo (quebra). Dep nova **só** via `npm install --package-lock-only <pkg>` (gera só o lockfile). Build/charts/realtime rodam no CI/produção.
- **Testar local:** `npm test --prefix financas-app` roda a suíte inteira (lógica pura, sem deps). Para um arquivo só: `node --test financas-app/test/<arquivo>.test.js`. **Rode todos os comandos a partir da raiz do worktree** (sem `cd`), para que os `git add financas-app/...` funcionem. Rodar a **suíte inteira** a cada tarefa (shapes compartilhados podem quebrar testes cross-file).
- **UI não builda local** (sem node_modules/dev server). As telas (`.jsx`) não são importadas pelos testes; `node --test` continua verde mesmo com erro de runtime no JSX. Correção das telas vem de **código completo e cuidadoso** + verificação **ao vivo após o merge** (Action builda no push à `main`). Aceito o mesmo risco do Plano 5.
- **Convenções de UI** (do código existente): `section` com `space-y-4/5`; cards `bg-white rounded-2xl border border-slate-100 shadow-sm p-4/5`; botão primário `rounded-lg bg-teal-700 text-white py-2.5 font-medium hover:bg-teal-800 disabled:opacity-60`; loading `<p className="text-slate-500">Carregando…</p>`; empty state centralizado com emoji. Tema teal `#0f766e`.
- Acesso ao Supabase **só** via `src/lib/supabase.js`. Nada de `localStorage` para dados.

---

## File Structure

**Criar:**
- `src/lib/formato.js` — formatação pura: `formatBRL`, `formatData`, `nomeMes`, `shiftMes`.
- `src/lib/transacaoAdapter.js` — `linhaParaTransacao` (snake→camel), `paraAnalise`.
- `src/lib/perfilModelo.js` — `perfilPadrao`, `normalizarPerfil`, `perfilVazio`.
- `src/lib/relatorio.js` — `mesesComDados`, `serieMensal`, `comparativoCategorias`.
- `src/data/PerfilContext.jsx` — `PerfilProvider` + `usePerfil`.
- `src/components/charts.jsx` — registra Chart.js (tree-shaking) e re-exporta `Doughnut`/`Bar`/`Line` + paleta `CORES`.
- `test/formato.test.js`, `test/transacaoAdapter.test.js`, `test/perfilModelo.test.js`, `test/relatorio.test.js`.

**Modificar:**
- `src/App.jsx` — montar `<PerfilProvider>` dentro de `<TransacoesProvider>`.
- `src/pages/Configuracoes.jsx` — substituir stub por form de renda/fixos/metas/conta.
- `src/pages/Dashboard.jsx` — substituir stub por dashboard do mês.
- `src/pages/Relatorio.jsx` — substituir stub por histórico multi-mês.
- `package.json` + `package-lock.json` — deps de charts (via `--package-lock-only`).

---

## Task 1: Helper de formatação (`formato.js`)

**Files:**
- Create: `financas-app/src/lib/formato.js`
- Test: `financas-app/test/formato.test.js`

- [ ] **Step 1: Write the failing test**

Create `financas-app/test/formato.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBRL, formatData, nomeMes, shiftMes } from '../src/lib/formato.js';

test('formatBRL formata em reais com milhar e 2 casas', () => {
  assert.equal(formatBRL(1234.5), 'R$ 1.234,50');
  assert.equal(formatBRL(0), 'R$ 0,00');
  assert.equal(formatBRL(-50), '-R$ 50,00');
  assert.equal(formatBRL(1000000), 'R$ 1.000.000,00');
});

test('formatData converte ISO para DD/MM/AAAA', () => {
  assert.equal(formatData('2026-06-10'), '10/06/2026');
  assert.equal(formatData('2025-11-28'), '28/11/2025');
});

test('nomeMes converte AAAA-MM para abreviação PT-BR', () => {
  assert.equal(nomeMes('2026-06'), 'jun/2026');
  assert.equal(nomeMes('2026-01'), 'jan/2026');
  assert.equal(nomeMes('2026-12'), 'dez/2026');
});

test('shiftMes anda meses respeitando virada de ano', () => {
  assert.equal(shiftMes('2026-06', 1), '2026-07');
  assert.equal(shiftMes('2026-12', 1), '2027-01');
  assert.equal(shiftMes('2026-01', -1), '2025-12');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test financas-app/test/formato.test.js`
Expected: FAIL — `Cannot find module '../src/lib/formato.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `financas-app/src/lib/formato.js`:

```js
// Formatação pura para a UI (PT-BR). Réplica deliberada do formatBRL interno do
// analisador, para não tocar em código já testado e congelado.

export function formatBRL(n) {
  const num = Number(n) || 0;
  const [int, dec] = Math.abs(num).toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${num < 0 ? '-' : ''}R$ ${intFmt},${dec}`;
}

export function formatData(iso) {
  const [a, m, d] = String(iso).split('-');
  return `${d}/${m}/${a}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function nomeMes(ym) {
  const [a, m] = String(ym).split('-').map(Number);
  return `${MESES[m - 1]}/${a}`;
}

// Anda `delta` meses em 'AAAA-MM' (Date resolve a virada de ano).
export function shiftMes(ym, delta) {
  const [a, m] = String(ym).split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test financas-app/test/formato.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test --prefix financas-app`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add financas-app/src/lib/formato.js financas-app/test/formato.test.js
git commit -m "feat(financas): helper de formatação (BRL, data, mês)"
```

---

## Task 2: Adapter de transação (`transacaoAdapter.js`)

O `useTransacoes` devolve linhas snake_case do banco; `analisar()` espera camelCase. Este adapter faz a ponte.

**Files:**
- Create: `financas-app/src/lib/transacaoAdapter.js`
- Test: `financas-app/test/transacaoAdapter.test.js`

- [ ] **Step 1: Write the failing test**

Create `financas-app/test/transacaoAdapter.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhaParaTransacao, paraAnalise } from '../src/lib/transacaoAdapter.js';

const linha = {
  id: 'uuid-1',
  data: '2025-11-28',
  descricao: 'CONVERSE 7/10',
  descricao_original: 'CONVERSE *LOJA 7/10',
  valor: '60.00',
  banco: 'bradesco',
  pessoa: 'luis',
  categoria: 'vestuario',
  categoria_auto: false,
  eh_fixo: true,
  parcela_atual: 7,
  parcela_total: 10,
  mes_referencia: '2026-06',
};

test('linhaParaTransacao mapeia snake_case para camelCase do analisador', () => {
  const t = linhaParaTransacao(linha);
  assert.equal(t.descricao, 'CONVERSE 7/10');
  assert.equal(t.descricaoOriginal, 'CONVERSE *LOJA 7/10');
  assert.equal(t.valor, 60); // coerção numérica
  assert.equal(t.banco, 'bradesco');
  assert.equal(t.pessoa, 'luis');
  assert.equal(t.categoria, 'vestuario');
  assert.equal(t.ehFixo, true);
  assert.equal(t.parcelaAtual, 7);
  assert.equal(t.parcelaTotal, 10);
  assert.equal(t.mesReferencia, '2026-06');
});

test('linhaParaTransacao trata nulos de parcela/categoria/fixo', () => {
  const t = linhaParaTransacao({
    data: '2026-06-10', descricao: 'X', valor: 10, banco: 'itau', pessoa: 'compartilhado',
    categoria: null, eh_fixo: null, parcela_atual: null, parcela_total: null, mes_referencia: '2026-06',
  });
  assert.equal(t.categoria, null);
  assert.equal(t.ehFixo, false);
  assert.equal(t.parcelaAtual, null);
  assert.equal(t.parcelaTotal, null);
});

test('paraAnalise mapeia uma lista inteira', () => {
  const out = paraAnalise([linha, linha]);
  assert.equal(out.length, 2);
  assert.equal(out[0].mesReferencia, '2026-06');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test financas-app/test/transacaoAdapter.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `financas-app/src/lib/transacaoAdapter.js`:

```js
// Converte a linha snake_case da tabela `transacoes` (saída de useTransacoes)
// para o shape camelCase que `analisar()` consome.
export function linhaParaTransacao(row) {
  return {
    data: row.data,
    descricao: row.descricao,
    descricaoOriginal: row.descricao_original ?? null,
    valor: Number(row.valor) || 0,
    banco: row.banco,
    pessoa: row.pessoa,
    categoria: row.categoria ?? null,
    ehFixo: row.eh_fixo ?? false,
    parcelaAtual: row.parcela_atual ?? null,
    parcelaTotal: row.parcela_total ?? null,
    mesReferencia: row.mes_referencia,
  };
}

export function paraAnalise(linhas) {
  return linhas.map(linhaParaTransacao);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test financas-app/test/transacaoAdapter.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test --prefix financas-app`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add financas-app/src/lib/transacaoAdapter.js financas-app/test/transacaoAdapter.test.js
git commit -m "feat(financas): adapter linha do banco -> transação do analisador"
```

---

## Task 3: Modelo de perfil (`perfilModelo.js`)

**Files:**
- Create: `financas-app/src/lib/perfilModelo.js`
- Test: `financas-app/test/perfilModelo.test.js`

- [ ] **Step 1: Write the failing test**

Create `financas-app/test/perfilModelo.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { perfilPadrao, normalizarPerfil, perfilVazio } from '../src/lib/perfilModelo.js';

test('perfilPadrao traz salários zerados e os 5 fixos pré-populados', () => {
  const p = perfilPadrao();
  assert.equal(p.salarios.leo, 0);
  assert.equal(p.salarios.luis, 0);
  assert.equal(p.salarios.diaPagamento, 5);
  assert.equal(p.fixos.length, 5);
  assert.equal(p.fixos[0].nome, 'Condomínio');
  assert.equal(p.fixos[0].valor, 525);
  assert.deepEqual(p.metas, []);
});

test('normalizarPerfil completa chaves ausentes sem reinjetar fixos apagados', () => {
  assert.deepEqual(normalizarPerfil({}), {
    salarios: { leo: 0, luis: 0, diaPagamento: 5 },
    fixos: [],
    metas: [],
  });
  const p = normalizarPerfil({ salarios: { leo: 5000 }, fixos: [] });
  assert.equal(p.salarios.leo, 5000);
  assert.equal(p.salarios.luis, 0);
  assert.deepEqual(p.fixos, []); // não volta a pré-popular
});

test('normalizarPerfil preserva fixos e metas existentes', () => {
  const p = normalizarPerfil({ fixos: [{ nome: 'Aluguel', valor: 1500, pessoa: 'leo' }], metas: [{ nome: 'Reserva', valor: 10000, prazoMeses: 12 }] });
  assert.equal(p.fixos[0].nome, 'Aluguel');
  assert.equal(p.metas[0].valor, 10000);
});

test('perfilVazio distingue {} de objeto com dados', () => {
  assert.equal(perfilVazio({}), true);
  assert.equal(perfilVazio(null), true);
  assert.equal(perfilVazio(undefined), true);
  assert.equal(perfilVazio({ salarios: {} }), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test financas-app/test/perfilModelo.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `financas-app/src/lib/perfilModelo.js`:

```js
// Modelo do perfil.dados (jsonb) no formato que o analisador consome.
// perfilPadrao(): seed pré-preenchido usado quando não há perfil salvo.
// normalizarPerfil(): hidrata um perfil salvo garantindo o shape, SEM
// reinjetar fixos que o usuário tenha apagado.

export function perfilPadrao() {
  return {
    salarios: { leo: 0, luis: 0, diaPagamento: 5 },
    fixos: [
      { nome: 'Condomínio', valor: 525, pessoa: 'compartilhado' },
      { nome: 'Energia (Copel)', valor: 220, pessoa: 'compartilhado' },
      { nome: 'Seguro do carro', valor: 230, pessoa: 'leo' },
      { nome: 'IPTU', valor: 45, pessoa: 'compartilhado' },
      { nome: 'Simples Nacional', valor: 275, pessoa: 'leo' },
    ],
    metas: [],
  };
}

export function normalizarPerfil(dados) {
  const d = dados || {};
  const s = d.salarios || {};
  return {
    salarios: {
      leo: Number(s.leo) || 0,
      luis: Number(s.luis) || 0,
      diaPagamento: Number(s.diaPagamento) || 5,
    },
    fixos: Array.isArray(d.fixos) ? d.fixos : [],
    metas: Array.isArray(d.metas) ? d.metas : [],
  };
}

export function perfilVazio(dados) {
  return !dados || Object.keys(dados).length === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test financas-app/test/perfilModelo.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test --prefix financas-app`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add financas-app/src/lib/perfilModelo.js financas-app/test/perfilModelo.test.js
git commit -m "feat(financas): modelo de perfil (padrão + normalização)"
```

---

## Task 4: Agregação multi-mês do Relatório (`relatorio.js`)

**Files:**
- Create: `financas-app/src/lib/relatorio.js`
- Test: `financas-app/test/relatorio.test.js`

- [ ] **Step 1: Write the failing test**

Create `financas-app/test/relatorio.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mesesComDados, serieMensal, comparativoCategorias } from '../src/lib/relatorio.js';

// linhas snake_case, como vêm de useTransacoes
function row(over) {
  return {
    data: '2026-06-10', descricao: 'X', valor: 100, banco: 'itau', pessoa: 'compartilhado',
    categoria: 'mercado', eh_fixo: false, parcela_atual: null, parcela_total: null,
    mes_referencia: '2026-06', ...over,
  };
}

const transacoes = [
  row({ mes_referencia: '2026-05', valor: 200, categoria: 'mercado' }),
  row({ mes_referencia: '2026-06', valor: 100, categoria: 'mercado' }),
  row({ mes_referencia: '2026-06', valor: 50, categoria: 'lazer' }),
];
const perfil = { salarios: { leo: 5000, luis: 0 }, fixos: [], metas: [] };

test('mesesComDados lista meses distintos em ordem decrescente', () => {
  assert.deepEqual(mesesComDados(transacoes), ['2026-06', '2026-05']);
});

test('serieMensal devolve um ponto por mês ( asc) com totais e score', () => {
  const s = serieMensal(transacoes, perfil);
  assert.equal(s.length, 2);
  assert.equal(s[0].mes, '2026-05');
  assert.equal(s[0].totalGastos, 200);
  assert.equal(s[1].mes, '2026-06');
  assert.equal(s[1].totalGastos, 150);
  assert.equal(s[1].saldo, 4850); // 5000 - 150
  assert.equal(typeof s[1].score, 'number');
});

test('comparativoCategorias monta matriz categoria × mês', () => {
  const { meses, categorias } = comparativoCategorias(transacoes);
  assert.deepEqual(meses, ['2026-05', '2026-06']);
  const mercado = categorias.find((c) => c.categoria === 'mercado');
  assert.deepEqual(mercado.valores, [200, 100]); // mai, jun
  assert.equal(mercado.total, 300);
  // ordenado por total desc: mercado (300) antes de lazer (50)
  assert.equal(categorias[0].categoria, 'mercado');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test financas-app/test/relatorio.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `financas-app/src/lib/relatorio.js`:

```js
import { analisar } from './analisador.js';
import { linhaParaTransacao } from './transacaoAdapter.js';

const round2 = (n) => Math.round(n * 100) / 100;

// Meses distintos com dados, em ordem decrescente (mais recente primeiro).
export function mesesComDados(transacoes) {
  const set = new Set(transacoes.map((t) => t.mes_referencia).filter(Boolean));
  return [...set].sort().reverse();
}

// Um ponto por mês (ordem ascendente) com totais e score, rodando o analisador
// por mês sobre as linhas adaptadas.
export function serieMensal(transacoes, perfil = {}) {
  const meses = [...new Set(transacoes.map((t) => t.mes_referencia).filter(Boolean))].sort();
  return meses.map((mes) => {
    const doMes = transacoes.filter((t) => t.mes_referencia === mes).map(linhaParaTransacao);
    const a = analisar(doMes, perfil);
    return {
      mes,
      totalGastos: a.totalGastos,
      saldo: a.saldo,
      taxaPoupanca: a.taxaPoupanca,
      score: a.score.valor,
    };
  });
}

// Matriz categoria × mês (valor por categoria em cada mês), ordenada por total desc.
export function comparativoCategorias(transacoes) {
  const meses = [...new Set(transacoes.map((t) => t.mes_referencia).filter(Boolean))].sort();
  const mapa = new Map(); // categoria -> { mes -> valor }
  for (const t of transacoes) {
    const cat = t.categoria || 'outros';
    const porMes = mapa.get(cat) || {};
    porMes[t.mes_referencia] = (porMes[t.mes_referencia] || 0) + (Number(t.valor) || 0);
    mapa.set(cat, porMes);
  }
  const categorias = [...mapa.entries()]
    .map(([categoria, porMes]) => ({
      categoria,
      valores: meses.map((m) => round2(porMes[m] || 0)),
      total: round2(meses.reduce((s, m) => s + (porMes[m] || 0), 0)),
    }))
    .sort((a, b) => b.total - a.total);
  return { meses, categorias };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test financas-app/test/relatorio.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test --prefix financas-app`
Expected: PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add financas-app/src/lib/relatorio.js financas-app/test/relatorio.test.js
git commit -m "feat(financas): agregação multi-mês do relatório (série + comparativo)"
```

---

## Task 5: `usePerfil` + montagem no App

Sem teste unitário (depende de Supabase/React) — verificado ao vivo. A garantia aqui é a suíte continuar verde (nada quebrou) e o código estar correto.

**Files:**
- Create: `financas-app/src/data/PerfilContext.jsx`
- Modify: `financas-app/src/App.jsx`

- [ ] **Step 1: Create `PerfilContext.jsx`**

Create `financas-app/src/data/PerfilContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';

const PerfilContext = createContext(null);

export function PerfilProvider({ children }) {
  const { householdId } = useAuth();
  const [perfil, setPerfil] = useState({}); // perfil.dados (jsonb); {} = não configurado
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  // Carga da linha `perfil` do household. Sem realtime no v1.
  useEffect(() => {
    if (!householdId) return undefined;
    let ativo = true;
    setLoading(true);
    async function carregar() {
      const { data, error } = await supabase
        .from('perfil')
        .select('dados')
        .eq('household_id', householdId)
        .maybeSingle();
      if (!ativo) return;
      if (error) {
        setErro('Não foi possível carregar as configurações.');
      } else {
        setPerfil(data?.dados ?? {});
        setErro('');
      }
      setLoading(false);
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, [householdId]);

  // Upsert do jsonb inteiro (uma linha por household, household_id é unique).
  const salvarPerfil = useCallback(
    async (dados) => {
      const { error } = await supabase
        .from('perfil')
        .upsert(
          { household_id: householdId, dados, atualizado_em: new Date().toISOString() },
          { onConflict: 'household_id' },
        );
      if (error) throw error;
      setPerfil(dados);
    },
    [householdId],
  );

  const valor = { perfil, salvarPerfil, loading, erro };
  return <PerfilContext.Provider value={valor}>{children}</PerfilContext.Provider>;
}

export function usePerfil() {
  const ctx = useContext(PerfilContext);
  if (!ctx) throw new Error('usePerfil deve ser usado dentro de <PerfilProvider>');
  return ctx;
}
```

- [ ] **Step 2: Mount `PerfilProvider` in `App.jsx`**

In `financas-app/src/App.jsx`, add the import after the `TransacoesProvider` import:

```jsx
import { PerfilProvider } from './data/PerfilContext.jsx';
```

Then change the protected layout route element from:

```jsx
      <Route element={<ProtectedRoute><TransacoesProvider><Shell /></TransacoesProvider></ProtectedRoute>}>
```

to:

```jsx
      <Route element={<ProtectedRoute><TransacoesProvider><PerfilProvider><Shell /></PerfilProvider></TransacoesProvider></ProtectedRoute>}>
```

- [ ] **Step 3: Run the full suite (no regressions)**

Run: `npm test --prefix financas-app`
Expected: PASS, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add financas-app/src/data/PerfilContext.jsx financas-app/src/App.jsx
git commit -m "feat(financas): usePerfil (carga + upsert do jsonb) montado no shell"
```

---

## Task 6: Dependências de charts + setup

**Files:**
- Modify: `financas-app/package.json`, `financas-app/package-lock.json`
- Create: `financas-app/src/components/charts.jsx`

- [ ] **Step 1: Adicionar deps só no lockfile**

Run (NÃO instala node_modules — só atualiza package.json + lock):

```bash
npm install --package-lock-only --prefix financas-app chart.js react-chartjs-2
```

Expected: `package.json` ganha `chart.js` e `react-chartjs-2` em `dependencies`; `package-lock.json` atualizado. Nenhuma pasta `node_modules` criada.

- [ ] **Step 2: Verificar que as deps entraram**

Run: `node -e "const p=require('./financas-app/package.json'); console.log(p.dependencies['chart.js'], p.dependencies['react-chartjs-2'])"`
Expected: imprime duas versões (ex.: `^4.x.x ^5.x.x`), nenhuma `undefined`.

- [ ] **Step 3: Criar o wrapper de charts**

Create `financas-app/src/components/charts.jsx`:

```jsx
// Registro central do Chart.js (tree-shaking: só o que usamos) + re-export dos
// componentes de gráfico. Importe os gráficos SEMPRE deste módulo para garantir
// que o registro rodou.
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

// Paleta para o doughnut por categoria (até 15 categorias).
export const CORES = [
  '#0f766e', '#0891b2', '#7c3aed', '#db2777', '#ea580c',
  '#ca8a04', '#16a34a', '#2563eb', '#dc2626', '#9333ea',
  '#0d9488', '#65a30d', '#e11d48', '#475569', '#78716c',
];

export { Doughnut, Bar, Line };
```

- [ ] **Step 4: Run the full suite (no regressions)**

Run: `npm test --prefix financas-app`
Expected: PASS, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add financas-app/package.json financas-app/package-lock.json financas-app/src/components/charts.jsx
git commit -m "chore(financas): adiciona chart.js + react-chartjs-2 (só lockfile) e setup"
```

---

## Task 7: Tela Configurações

Substitui o stub. Form de renda/fixos/metas/conta; grava no formato do perfil. UI verificada ao vivo.

**Files:**
- Modify: `financas-app/src/pages/Configuracoes.jsx` (substituir todo o conteúdo)

- [ ] **Step 1: Substituir o conteúdo de `Configuracoes.jsx`**

Replace the entire content of `financas-app/src/pages/Configuracoes.jsx` with:

```jsx
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
```

- [ ] **Step 2: Run the full suite (no regressions)**

Run: `npm test --prefix financas-app`
Expected: PASS, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add financas-app/src/pages/Configuracoes.jsx
git commit -m "feat(financas): tela Configurações (renda + fixos + metas + conta)"
```

---

## Task 8: Tela Dashboard

Substitui o stub. Mês navegável + cards + score + doughnut + barras + alertas + recomendações + parcelamentos + top 10.

**Files:**
- Modify: `financas-app/src/pages/Dashboard.jsx` (substituir todo o conteúdo)

- [ ] **Step 1: Substituir o conteúdo de `Dashboard.jsx`**

Replace the entire content of `financas-app/src/pages/Dashboard.jsx` with:

```jsx
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
```

- [ ] **Step 2: Run the full suite (no regressions)**

Run: `npm test --prefix financas-app`
Expected: PASS, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add financas-app/src/pages/Dashboard.jsx
git commit -m "feat(financas): tela Dashboard (mês navegável, cards, score, gráficos, top 10)"
```

---

## Task 9: Tela Relatório

Substitui o stub. Histórico multi-mês: gastos/saldo por mês, evolução do score, categoria × mês.

**Files:**
- Modify: `financas-app/src/pages/Relatorio.jsx` (substituir todo o conteúdo)

- [ ] **Step 1: Substituir o conteúdo de `Relatorio.jsx`**

Replace the entire content of `financas-app/src/pages/Relatorio.jsx` with:

```jsx
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
```

- [ ] **Step 2: Run the full suite (no regressions)**

Run: `npm test --prefix financas-app`
Expected: PASS, 0 failures.

- [ ] **Step 3: Commit**

```bash
git add financas-app/src/pages/Relatorio.jsx
git commit -m "feat(financas): tela Relatório (histórico gastos/saldo/score + comparativo)"
```

---

## Task 10: Conferir ícones do PWA

O manifest, meta tags `apple-mobile-web-app-*` e o plugin já existem (Plano 3). Só conferir que os ícones referenciados existem em `public/`.

**Files:**
- Inspect: `financas-app/public/`

- [ ] **Step 1: Listar os ícones**

Run: `ls financas-app/public/`
Expected: existem `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `logo.svg`.

- [ ] **Step 2: Se TODOS existem**

Nada a fazer — o PWA está completo. Pular para o Step 4 (sem commit).

- [ ] **Step 3: Se algum ícone FALTAR**

Conferir se existe `public/logo.svg` (fonte). Se existir, registrar no relatório de execução que os ícones precisam ser gerados no ambiente com deps via `npm run generate-pwa-assets` (precisa de node_modules — roda no CI/local com deps, não aqui). NÃO tentar `npm install`. Anotar como pendência de verificação ao vivo, não bloquear o plano.

- [ ] **Step 4: Sem mudanças de código**

Nenhum commit nesta task se os ícones já existem. Apenas registrar o resultado da inspeção.

---

## Task 11: PR + verificação ao vivo

**Files:** nenhum (operação de git/CI).

- [ ] **Step 1: Push da branch e abrir PR**

```bash
git push -u origin HEAD
gh pr create --title "Finanças Plano 6: Dashboard + Relatório + Configurações + PWA" --body "Fecha o MVP: telas Dashboard (mês navegável), Relatório (histórico multi-mês) e Configurações (renda/fixos/metas), usePerfil, charts (Chart.js) e PWA verificado. Helpers puros testados (node --test). UI a verificar ao vivo após o merge."
```

- [ ] **Step 2: Aguardar revisão do Leo**

O Leo prefere PR antes de mergear. A Action que builda `/financas` roda **só no push à `main`** (após o merge). Não há build na branch.

- [ ] **Step 3: Verificação ao vivo (após o merge)**

Depois do merge, verificar `moreno.arq.br/financas` com Chrome MCP:
- Recarregar (o service worker `autoUpdate` serve o cache antigo na 1ª carga pós-deploy).
- Logar (ação do Leo), conferir: Configurações salva e recarrega; Dashboard mostra cards/score/gráficos e navega por mês; Relatório mostra histórico (ou o empty state com <2 meses); instalação PWA no iPhone.
- Se o `computer` (screenshot/click) falhar por conflito de extensão, usar ferramentas DOM (navigate/read_page).

---

## Notas finais

- **TDD** nos 4 helpers puros (Tasks 1–4). UI (Tasks 5,7,8,9) sem teste unitário por design — verificada ao vivo (Task 11). Rodar a suíte inteira a cada commit.
- **Não** instalar `node_modules`. Dep nova só via `--package-lock-only` (Task 6).
- Nada de `gh-pages`, nada de `404.html`. Deploy via Action no push à `main`.
- Não tocar em `pokemon/` nem em código do Plano 1–5 já testado (analisador incluso).
