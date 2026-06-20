# Aba "Lançamentos" (v2/Fase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar a aba "Lançamentos" — lista completa de todas as transações do household, com filtros (período, banco, pessoa, categoria, parcelado/à vista, busca), ordenação (data/valor/descrição) e barra de total do recorte filtrado.

**Architecture:** Toda a regra de negócio vive em `src/lib/lancamentos.js` (puro, testado com `node --test`), operando sobre transações camelCase produzidas pelo `transacaoAdapter`. A página `src/pages/Lancamentos.jsx` é fina: lê `useTransacoes` (já carrega tudo + realtime), mantém o estado dos filtros/ordenação e renderiza. Read-only — nada é persistido. Sem backend, sem SQL, sem libs novas.

**Tech Stack:** React 19, react-router-dom v7, Tailwind v4, Supabase (só leitura via provider existente). Testes: `node:test` + `node:assert/strict`.

---

## Convenções de execução (LER)

- **Rode os comandos da RAIZ do worktree, sem `cd`** (pra os `git add financas-app/...` baterem).
- Suíte inteira: `npm test --prefix financas-app`. Um arquivo: `node --test financas-app/test/<arquivo>.test.js` (file-path funciona; passar um DIR não, o Node não escaneia).
- Baseline atual: **86/86 verde**. Rode a suíte INTEIRA ao fim de cada task (fixtures de shape compartilhado podem quebrar testes cross-file).
- UI (página/nav/rota) **não tem teste local** (sem build/dev server no Drive) → verificação **ao vivo só após o merge**. Tasks de UI terminam em commit + checklist manual, não em teste verde.
- Não instalar nada. Não criar pastas novas. Pura lógica em `src/lib/`, telas em `src/pages/`, navegação em `src/components/`.

---

## File Structure

- `src/lib/transacaoAdapter.js` — **modificar**: `linhaParaTransacao` passa a carregar `id` (a lista precisa pra `key` do React). Retrocompatível: `analisar()` ignora o campo extra.
- `src/lib/lancamentos.js` — **criar**: `intervaloDePreset`, `filtrarLancamentos`, `ordenarLancamentos`, `resumoLancamentos`.
- `src/pages/Lancamentos.jsx` — **criar**: a tela.
- `src/App.jsx` — **modificar**: importar a página + nova `<Route path="/lancamentos">`.
- `src/components/nav.jsx` — **modificar**: novo item em `NAV_ITENS`.
- `test/transacaoAdapter.test.js` — **modificar**: asserir que `id` é mapeado.
- `test/lancamentos.test.js` — **criar**: testes da lógica pura.

---

## Task 1: Adapter carrega `id`

**Files:**
- Modify: `financas-app/src/lib/transacaoAdapter.js`
- Test: `financas-app/test/transacaoAdapter.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Adicione ao fim de `financas-app/test/transacaoAdapter.test.js` (antes do EOF, depois do último `test(...)`):

```js
test('linhaParaTransacao carrega o id da linha', () => {
  assert.equal(linhaParaTransacao(linha).id, 'uuid-1');
  assert.equal(linhaParaTransacao({ ...linha, id: undefined }).id, null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test financas-app/test/transacaoAdapter.test.js`
Expected: FAIL — `linhaParaTransacao(...).id` é `undefined`, não `'uuid-1'`.

- [ ] **Step 3: Implementar**

Em `financas-app/src/lib/transacaoAdapter.js`, na função `linhaParaTransacao`, adicione `id` como primeira propriedade do objeto retornado:

```js
export function linhaParaTransacao(row) {
  return {
    id: row.id ?? null,
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
    serieId: row.serie_id ?? null,
    mesReferencia: row.mes_referencia,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test financas-app/test/transacaoAdapter.test.js`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Suíte inteira + commit**

Run: `npm test --prefix financas-app`
Expected: 87 pass, 0 fail.

```bash
git add financas-app/src/lib/transacaoAdapter.js financas-app/test/transacaoAdapter.test.js
git commit -m "feat(financas): adapter carrega id da transação (p/ a lista)"
```

---

## Task 2: Módulo de lógica pura `lancamentos.js`

**Files:**
- Create: `financas-app/src/lib/lancamentos.js`
- Test: `financas-app/test/lancamentos.test.js`

- [ ] **Step 1: Escrever os testes que falham**

Crie `financas-app/test/lancamentos.test.js` com:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  intervaloDePreset,
  filtrarLancamentos,
  ordenarLancamentos,
  resumoLancamentos,
} from '../src/lib/lancamentos.js';

// transação camelCase, como sai de paraAnalise()
function tx(over) {
  return {
    id: 'id-1', data: '2026-06-10', descricao: 'MERCADO X', descricaoOriginal: 'MERCADO X LTDA',
    valor: 100, banco: 'itau', pessoa: 'compartilhado', categoria: 'mercado',
    ehFixo: false, parcelaAtual: null, parcelaTotal: null, serieId: null,
    mesReferencia: '2026-06', ...over,
  };
}
function ids(lista) { return lista.map((t) => t.id); }

// --- intervaloDePreset ---
test('intervaloDePreset: tudo = sem limites', () => {
  assert.deepEqual(intervaloDePreset('tudo', new Date(2026, 5, 19)), { de: null, ate: null });
});
test('intervaloDePreset: mes = mês de hoje nas duas pontas', () => {
  assert.deepEqual(intervaloDePreset('mes', new Date(2026, 5, 19)), { de: '2026-06', ate: '2026-06' });
});
test('intervaloDePreset: 3meses = mês atual + 2 anteriores (vira o ano)', () => {
  assert.deepEqual(intervaloDePreset('3meses', new Date(2026, 0, 15)), { de: '2025-11', ate: '2026-01' });
});
test('intervaloDePreset: ano = jan a dez do ano de hoje', () => {
  assert.deepEqual(intervaloDePreset('ano', new Date(2026, 5, 19)), { de: '2026-01', ate: '2026-12' });
});
test('intervaloDePreset: preset desconhecido cai em tudo', () => {
  assert.deepEqual(intervaloDePreset('xpto', new Date(2026, 5, 19)), { de: null, ate: null });
});

// --- filtrarLancamentos ---
const base = [
  tx({ id: 'a', mesReferencia: '2026-04', banco: 'itau', pessoa: 'leo', categoria: 'alimentacao', descricao: 'IFOOD', descricaoOriginal: 'IFOOD APP', valor: 50 }),
  tx({ id: 'b', mesReferencia: '2026-05', banco: 'bradesco', pessoa: 'luis', categoria: 'mercado', descricao: 'CONDOR', descricaoOriginal: 'CONDOR SUPER', valor: 200 }),
  tx({ id: 'c', mesReferencia: '2026-06', banco: 'itau', pessoa: 'compartilhado', categoria: null, descricao: 'XPTO', descricaoOriginal: 'XPTO', valor: 30 }),
  tx({ id: 'd', mesReferencia: '2026-06', banco: 'itau', pessoa: 'leo', categoria: 'parcelamento', descricao: 'JIM.COM', descricaoOriginal: 'JIM.COM', valor: 392.30, parcelaTotal: 10, parcelaAtual: 3 }),
  tx({ id: 'e', mesReferencia: '2026-06', banco: 'bradesco', pessoa: 'luis', categoria: 'vestuario', descricao: 'CONVERSE', descricaoOriginal: 'CONVERSE', valor: 60, serieId: 's1' }),
];

test('filtro vazio devolve tudo', () => {
  assert.equal(filtrarLancamentos(base, {}).length, base.length);
});
test('período de–até (inclusivo) por mesReferencia', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { periodo: { de: '2026-05', ate: '2026-06' } })), ['b', 'c', 'd', 'e']);
});
test('período só com de (sem teto)', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { periodo: { de: '2026-06', ate: null } })), ['c', 'd', 'e']);
});
test('filtro banco', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { banco: 'bradesco' })), ['b', 'e']);
});
test('filtro pessoa', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { pessoa: 'leo' })), ['a', 'd']);
});
test('filtro categoria por id', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { categoria: 'mercado' })), ['b']);
});
test('categoria "sem" pega pendentes (categoria null)', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { categoria: 'sem' })), ['c']);
});
test('parcelado "sim" pega parcelaTotal OU serieId', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { parcelado: 'sim' })), ['d', 'e']);
});
test('parcelado "nao" exclui parcelados e séries', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { parcelado: 'nao' })), ['a', 'b', 'c']);
});
test('busca casa em descricao (case-insensitive)', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { busca: 'ifood' })), ['a']);
});
test('busca casa em descricaoOriginal', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { busca: 'super' })), ['b']);
});
test('busca só com espaços = inativa', () => {
  assert.equal(filtrarLancamentos(base, { busca: '   ' }).length, base.length);
});
test('combinação AND de vários filtros', () => {
  assert.deepEqual(ids(filtrarLancamentos(base, { banco: 'itau', pessoa: 'leo', periodo: { de: '2026-06', ate: null } })), ['d']);
});

// --- ordenarLancamentos ---
const tres = [
  tx({ id: 'x', data: '2026-06-01', valor: 50, descricao: 'banana' }),
  tx({ id: 'y', data: '2026-06-03', valor: 10, descricao: 'Abacaxi' }),
  tx({ id: 'z', data: '2026-06-02', valor: 30, descricao: 'caju' }),
];
test('ordenar por data desc (default)', () => {
  assert.deepEqual(ids(ordenarLancamentos(tres, {})), ['y', 'z', 'x']);
});
test('ordenar por data asc', () => {
  assert.deepEqual(ids(ordenarLancamentos(tres, { campo: 'data', direcao: 'asc' })), ['x', 'z', 'y']);
});
test('ordenar por valor asc', () => {
  assert.deepEqual(ids(ordenarLancamentos(tres, { campo: 'valor', direcao: 'asc' })), ['y', 'z', 'x']);
});
test('ordenar por descricao asc (ignora caixa, pt-BR)', () => {
  assert.deepEqual(ids(ordenarLancamentos(tres, { campo: 'descricao', direcao: 'asc' })), ['y', 'x', 'z']);
});
test('ordenação é estável em empate (preserva ordem de entrada)', () => {
  const e = [tx({ id: '1', valor: 10 }), tx({ id: '2', valor: 10 }), tx({ id: '3', valor: 10 })];
  assert.deepEqual(ids(ordenarLancamentos(e, { campo: 'valor', direcao: 'asc' })), ['1', '2', '3']);
});
test('ordenar não muta a lista de entrada', () => {
  const entrada = [...tres];
  ordenarLancamentos(entrada, { campo: 'valor', direcao: 'asc' });
  assert.deepEqual(ids(entrada), ['x', 'y', 'z']);
});

// --- resumoLancamentos ---
test('resumo: contagem e soma', () => {
  const r = resumoLancamentos([tx({ valor: 10 }), tx({ valor: 20.5 }), tx({ valor: 30 })]);
  assert.equal(r.count, 3);
  assert.equal(r.soma, 60.5);
});
test('resumo de lista vazia', () => {
  assert.deepEqual(resumoLancamentos([]), { count: 0, soma: 0 });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test financas-app/test/lancamentos.test.js`
Expected: FAIL — `Cannot find module '../src/lib/lancamentos.js'`.

- [ ] **Step 3: Implementar o módulo**

Crie `financas-app/src/lib/lancamentos.js` com:

```js
// Lógica pura da aba Lançamentos: período (presets), filtro, ordenação e resumo.
// Opera sobre transações em camelCase (passe por paraAnalise() do transacaoAdapter antes).
import { shiftMes } from './formato.js';

// 'AAAA-MM' de uma Date.
function ymDeData(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Normaliza string p/ comparação case-insensitive.
function up(s) {
  return String(s ?? '').toUpperCase();
}

// Converte um preset de período em { de, ate } ('AAAA-MM', ou null = sem limite naquela ponta).
export function intervaloDePreset(preset, hoje = new Date()) {
  const mes = ymDeData(hoje);
  switch (preset) {
    case 'mes':
      return { de: mes, ate: mes };
    case '3meses':
      return { de: shiftMes(mes, -2), ate: mes };
    case 'ano': {
      const a = hoje.getFullYear();
      return { de: `${a}-01`, ate: `${a}-12` };
    }
    default:
      return { de: null, ate: null };
  }
}

// Filtra a lista combinando todos os critérios com E (AND). Critério ausente / 'todos' / 'todas' = inativo.
export function filtrarLancamentos(txs, filtros = {}) {
  const { periodo, banco, pessoa, categoria, parcelado, busca } = filtros;
  const de = periodo?.de ?? null;
  const ate = periodo?.ate ?? null;
  const q = up(busca).trim();
  return txs.filter((t) => {
    if (de && t.mesReferencia < de) return false;
    if (ate && t.mesReferencia > ate) return false;
    if (banco && banco !== 'todos' && t.banco !== banco) return false;
    if (pessoa && pessoa !== 'todos' && t.pessoa !== pessoa) return false;
    if (categoria && categoria !== 'todas') {
      if (categoria === 'sem') {
        if (t.categoria != null) return false;
      } else if (t.categoria !== categoria) {
        return false;
      }
    }
    if (parcelado && parcelado !== 'todos') {
      const eh = t.parcelaTotal != null || t.serieId != null;
      if (parcelado === 'sim' && !eh) return false;
      if (parcelado === 'nao' && eh) return false;
    }
    if (q && !up(t.descricao).includes(q) && !up(t.descricaoOriginal).includes(q)) return false;
    return true;
  });
}

// Ordena (sem mutar): campo data|valor|descricao, direção asc|desc. Estável (desempate por índice original).
export function ordenarLancamentos(lista, ordem = {}) {
  const campo = ordem.campo ?? 'data';
  const direcao = ordem.direcao ?? 'desc';
  const fator = direcao === 'asc' ? 1 : -1;
  function comparar(a, b) {
    let c;
    if (campo === 'valor') {
      c = (Number(a.valor) || 0) - (Number(b.valor) || 0);
    } else if (campo === 'descricao') {
      c = String(a.descricao).localeCompare(String(b.descricao), 'pt-BR', { sensitivity: 'base' });
    } else {
      c = String(a.data).localeCompare(String(b.data));
    }
    return c * fator;
  }
  return lista
    .map((item, i) => ({ item, i }))
    .sort((x, y) => comparar(x.item, y.item) || x.i - y.i)
    .map((w) => w.item);
}

// Contagem e soma dos valores do recorte.
export function resumoLancamentos(lista) {
  let soma = 0;
  for (const t of lista) soma += Number(t.valor) || 0;
  return { count: lista.length, soma };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test financas-app/test/lancamentos.test.js`
Expected: PASS (todos).

- [ ] **Step 5: Suíte inteira + commit**

Run: `npm test --prefix financas-app`
Expected: 113 pass, 0 fail (87 anteriores + 26 novos).

```bash
git add financas-app/src/lib/lancamentos.js financas-app/test/lancamentos.test.js
git commit -m "feat(financas): lógica pura da aba Lançamentos (filtro/ordenação/resumo/período)"
```

---

## Task 3: Página `Lancamentos.jsx`

UI sem teste local — verificação ao vivo após o merge. Esta task termina em commit + revisão por leitura.

**Files:**
- Create: `financas-app/src/pages/Lancamentos.jsx`

- [ ] **Step 1: Criar a página**

Crie `financas-app/src/pages/Lancamentos.jsx` com:

```jsx
import { useMemo, useState, useEffect } from 'react';
import { useTransacoes } from '../data/TransacoesContext.jsx';
import { paraAnalise } from '../lib/transacaoAdapter.js';
import { CATEGORIAS } from '../lib/categorias.js';
import { formatBRL, formatData } from '../lib/formato.js';
import {
  intervaloDePreset,
  filtrarLancamentos,
  ordenarLancamentos,
  resumoLancamentos,
} from '../lib/lancamentos.js';

const CAT = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c]));
const PRESETS = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'mes', label: 'Este mês' },
  { id: '3meses', label: '3 meses' },
  { id: 'ano', label: 'Ano' },
  { id: 'personalizado', label: 'Período' },
];
const BANCOS = [
  { id: 'todos', label: 'Todos' },
  { id: 'itau', label: 'Itaú' },
  { id: 'bradesco', label: 'Bradesco' },
];
const PESSOAS = [
  { id: 'todos', label: 'Todos' },
  { id: 'leo', label: 'Leo' },
  { id: 'luis', label: 'Luis' },
  { id: 'compartilhado', label: 'Compart.' },
];
const PARCELADO = [
  { id: 'todos', label: 'Todos' },
  { id: 'sim', label: 'Parcelado' },
  { id: 'nao', label: 'À vista' },
];
const ORDENS = [
  { campo: 'data', label: 'Data' },
  { campo: 'valor', label: 'Valor' },
  { campo: 'descricao', label: 'Descrição' },
];

function nomeBanco(b) { return b === 'itau' ? 'Itaú' : 'Bradesco'; }
function nomePessoa(p) { return p === 'leo' ? 'Leo' : p === 'luis' ? 'Luis' : 'Compart.'; }
function rotuloCategoria(id) {
  if (id == null) return 'Sem categoria';
  const c = CAT[id];
  return c ? `${c.emoji} ${c.label}` : id;
}

export default function Lancamentos() {
  const { transacoes, loading, erro } = useTransacoes();

  const [preset, setPreset] = useState('tudo');
  const [custom, setCustom] = useState({ de: '', ate: '' });
  const [banco, setBanco] = useState('todos');
  const [pessoa, setPessoa] = useState('todos');
  const [categoria, setCategoria] = useState('todas');
  const [parcelado, setParcelado] = useState('todos');
  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState({ campo: 'data', direcao: 'desc' });
  const [painelAberto, setPainelAberto] = useState(false);

  // Debounce da busca (~200ms).
  useEffect(() => {
    const id = setTimeout(() => setBusca(buscaInput), 200);
    return () => clearTimeout(id);
  }, [buscaInput]);

  const todas = useMemo(() => paraAnalise(transacoes), [transacoes]);
  const periodo = useMemo(() => {
    if (preset === 'personalizado') return { de: custom.de || null, ate: custom.ate || null };
    return intervaloDePreset(preset);
  }, [preset, custom]);

  const visiveis = useMemo(
    () => ordenarLancamentos(
      filtrarLancamentos(todas, { periodo, banco, pessoa, categoria, parcelado, busca }),
      ordem,
    ),
    [todas, periodo, banco, pessoa, categoria, parcelado, busca, ordem],
  );
  const resumo = useMemo(() => resumoLancamentos(visiveis), [visiveis]);

  const nSecundarios =
    [banco, pessoa, parcelado].filter((v) => v !== 'todos').length + (categoria !== 'todas' ? 1 : 0);
  const temFiltro = nSecundarios > 0 || preset !== 'tudo' || busca.trim() !== '';

  function limparTudo() {
    setPreset('tudo'); setCustom({ de: '', ate: '' });
    setBanco('todos'); setPessoa('todos'); setCategoria('todas'); setParcelado('todos');
    setBuscaInput(''); setBusca('');
  }
  function trocarOrdem(campo) {
    setOrdem((o) => (o.campo === campo
      ? { campo, direcao: o.direcao === 'asc' ? 'desc' : 'asc' }
      : { campo, direcao: 'desc' }));
  }

  if (loading) return <p className="text-slate-500">Carregando…</p>;
  if (erro) return <p className="text-red-600">{erro}</p>;

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold text-slate-800">Lançamentos</h1>

      {/* Busca + botão Filtros */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3">
          <span className="text-slate-400">🔎</span>
          <input
            type="text"
            value={buscaInput}
            onChange={(e) => setBuscaInput(e.target.value)}
            placeholder="Buscar descrição…"
            className="flex-1 py-2 text-sm outline-none bg-transparent"
          />
          {buscaInput && (
            <button type="button" onClick={() => setBuscaInput('')} className="text-slate-400" aria-label="Limpar busca">✕</button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPainelAberto((v) => !v)}
          className={`px-3 rounded-xl border text-sm font-medium ${nSecundarios > 0 ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}
        >
          Filtros{nSecundarios > 0 ? ` · ${nSecundarios}` : ''}
        </button>
      </div>

      {/* Chips de período */}
      <div className="flex gap-1.5 flex-wrap">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPreset(p.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border ${preset === p.id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Intervalo custom */}
      {preset === 'personalizado' && (
        <div className="flex items-center gap-2 text-sm">
          <input type="month" value={custom.de} onChange={(e) => setCustom((c) => ({ ...c, de: e.target.value }))} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5" />
          <span className="text-slate-400">até</span>
          <input type="month" value={custom.ate} onChange={(e) => setCustom((c) => ({ ...c, ate: e.target.value }))} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5" />
        </div>
      )}

      {/* Painel de filtros secundários */}
      {painelAberto && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <Grupo label="Banco" opcoes={BANCOS} valor={banco} onPick={setBanco} />
          <Grupo label="Pessoa" opcoes={PESSOAS} valor={pessoa} onPick={setPessoa} />
          <Grupo label="Parcelado" opcoes={PARCELADO} valor={parcelado} onPick={setParcelado} />
          <div>
            <p className="text-xs text-slate-400 mb-1">Categoria</p>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm">
              <option value="todas">Todas</option>
              <option value="sem">Sem categoria</option>
              {CATEGORIAS.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Chips de filtros ativos + limpar */}
      {temFiltro && (
        <div className="flex gap-1.5 flex-wrap items-center">
          {preset !== 'tudo' && <ChipAtivo label={PRESETS.find((p) => p.id === preset).label} onClear={() => { setPreset('tudo'); setCustom({ de: '', ate: '' }); }} />}
          {banco !== 'todos' && <ChipAtivo label={nomeBanco(banco)} onClear={() => setBanco('todos')} />}
          {pessoa !== 'todos' && <ChipAtivo label={nomePessoa(pessoa)} onClear={() => setPessoa('todos')} />}
          {categoria !== 'todas' && <ChipAtivo label={rotuloCategoria(categoria === 'sem' ? null : categoria)} onClear={() => setCategoria('todas')} />}
          {parcelado !== 'todos' && <ChipAtivo label={PARCELADO.find((p) => p.id === parcelado).label} onClear={() => setParcelado('todos')} />}
          {busca.trim() !== '' && <ChipAtivo label={`"${busca}"`} onClear={() => { setBuscaInput(''); setBusca(''); }} />}
          <button type="button" onClick={limparTudo} className="text-xs text-teal-700 underline">Limpar tudo</button>
        </div>
      )}

      {/* Barra de total + ordenação */}
      <div className="flex items-center justify-between border-t border-slate-100 pt-2">
        <p className="text-sm text-slate-500">
          {resumo.count} {resumo.count === 1 ? 'lançamento' : 'lançamentos'} ·{' '}
          <span className="font-medium text-slate-700">{formatBRL(resumo.soma)}</span>
        </p>
        <div className="flex gap-1">
          {ORDENS.map((o) => (
            <button
              key={o.campo}
              type="button"
              onClick={() => trocarOrdem(o.campo)}
              className={`px-2 py-1 rounded-lg text-xs ${ordem.campo === o.campo ? 'bg-slate-100 text-slate-700 font-medium' : 'text-slate-400'}`}
            >
              {o.label}{ordem.campo === o.campo ? (ordem.direcao === 'asc' ? ' ↑' : ' ↓') : ''}
            </button>
          ))}
        </div>
      </div>

      {/* Lista */}
      {visiveis.length === 0 ? (
        <div className="text-center text-slate-400 py-16">
          <p className="text-4xl mb-2">🔍</p>
          <p>Nenhum lançamento com esses filtros.</p>
          {temFiltro && <button type="button" onClick={limparTudo} className="text-teal-700 font-medium">Limpar tudo</button>}
        </div>
      ) : (
        <div className="space-y-1.5">
          {visiveis.map((t) => (
            <div key={t.id} className="bg-white rounded-xl border border-slate-100 shadow-sm px-3 py-2.5 flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{t.descricao}</p>
                <p className="text-xs text-slate-400">
                  {formatData(t.data)} · {nomePessoa(t.pessoa)} · {rotuloCategoria(t.categoria)} · {nomeBanco(t.banco)}
                  {t.parcelaTotal ? ` · ${t.parcelaAtual ?? '?'}/${t.parcelaTotal}` : ''}
                </p>
              </div>
              <p className="text-sm font-semibold text-slate-800 shrink-0">{formatBRL(t.valor)}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Grupo({ label, opcoes, valor, onPick }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <div className="flex gap-1.5 flex-wrap">
        {opcoes.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o.id)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${valor === o.id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChipAtivo({ label, onClear }) {
  return (
    <button type="button" onClick={onClear} className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs flex items-center gap-1">
      {label} <span className="text-slate-400">✕</span>
    </button>
  );
}
```

- [ ] **Step 2: Conferência (sem build local)**

Revise por leitura: imports resolvem (`useTransacoes`, `paraAnalise`, `CATEGORIAS`, `formatBRL`/`formatData`, as 4 funções de `lancamentos.js`); todo `.map` tem `key`; nenhum estado é escrito sem `set`. Não há como rodar `vite build` no Drive — a validação real é ao vivo após o merge.

- [ ] **Step 3: Suíte inteira (garante que nada quebrou) + commit**

Run: `npm test --prefix financas-app`
Expected: 113 pass, 0 fail (a página não tem teste; só confirmamos o baseline intacto).

```bash
git add financas-app/src/pages/Lancamentos.jsx
git commit -m "feat(financas): tela Lançamentos (filtros, ordenação, busca, total)"
```

---

## Task 4: Fiação — rota + item de navegação

UI sem teste local. Termina em commit + checklist de verificação ao vivo.

**Files:**
- Modify: `financas-app/src/App.jsx`
- Modify: `financas-app/src/components/nav.jsx`

- [ ] **Step 1: Adicionar a rota no `App.jsx`**

Em `financas-app/src/App.jsx`, adicione o import junto aos outros de páginas:

```js
import Lancamentos from './pages/Lancamentos.jsx';
```

E a rota dentro do bloco protegido, logo após a linha `<Route path="/categorizar" ... />`:

```jsx
        <Route path="/lancamentos" element={<Lancamentos />} />
```

- [ ] **Step 2: Adicionar o item de nav no `nav.jsx`**

Em `financas-app/src/components/nav.jsx`, no array `NAV_ITENS`, insira este item **entre** o de `/categorizar` e o de `/relatorio`:

```jsx
  {
    path: '/lancamentos',
    label: 'Lançamentos',
    icone: (
      <Icone>
        <rect x="3" y="5" width="2.6" height="2.6" rx="0.6" />
        <rect x="3" y="10.7" width="2.6" height="2.6" rx="0.6" />
        <rect x="3" y="16.4" width="2.6" height="2.6" rx="0.6" />
        <path d="M9 6.3h12" />
        <path d="M9 12h12" />
        <path d="M9 17.7h12" />
      </Icone>
    ),
  },
```

- [ ] **Step 3: Suíte inteira + commit**

Run: `npm test --prefix financas-app`
Expected: 113 pass, 0 fail.

```bash
git add financas-app/src/App.jsx financas-app/src/components/nav.jsx
git commit -m "feat(financas): fia a aba Lançamentos (rota + item de navegação)"
```

- [ ] **Step 4: Checklist de verificação AO VIVO (após o merge na main + build da Action)**

Forçar reload furando o SW: abrir `https://moreno.arq.br/financas/?cb=fase2#/lancamentos`. Conferir:
- A aba aparece na sidebar (desktop) e na bottom-nav (mobile); **se "Lançamentos" quebrar feio na bottom-nav do celular, trocar o `label` pra "Extrato"** (só o label do nav; o H1 fica "Lançamentos").
- Lista carrega todas as transações; total bate (contagem + soma).
- Cada filtro funciona isolado e combinado; chips ativos removíveis; "Limpar tudo".
- Período: Tudo/Este mês/3 meses/Ano e o intervalo Personalizado (de–até).
- Ordenação Data/Valor/Descrição com inversão ao tocar de novo.
- Busca (descrição) filtra com debounce.
- Sem erros no console.

---

## Self-Review (preenchido pelo autor do plano)

**Cobertura da spec:**
- Filtros período/banco/pessoa/categoria/parcelado/busca → `filtrarLancamentos` (Task 2) + UI (Task 3). ✓
- Ordenação data/valor/descrição asc/desc → `ordenarLancamentos` (Task 2) + UI. ✓
- Barra de total (contagem + soma) → `resumoLancamentos` (Task 2) + UI. ✓
- Presets de período + custom → `intervaloDePreset` (Task 2) + UI. ✓
- Reuso de `useTransacoes` + `transacaoAdapter` → Task 1 (id) + Task 3. ✓
- Rota + nav (6ª aba) → Task 4. ✓
- Estados loading/erro/vazio → Task 3. ✓
- Read-only (sem edição) → a página não chama nenhum mutador do provider. ✓
- Sem schema/SQL/libs novas → confirmado. ✓

**Placeholder scan:** nenhum TBD/TODO; todo passo tem código/comando concreto.

**Consistência de tipos:** as 4 funções de `lancamentos.js` têm a mesma assinatura no teste, na implementação e no uso da página (`{ periodo, banco, pessoa, categoria, parcelado, busca }` e `{ campo, direcao }`). `paraAnalise` agora carrega `id`, usado como `key`. `CAT[id]` cobre id desconhecido com fallback.
