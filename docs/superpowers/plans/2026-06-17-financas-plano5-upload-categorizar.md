# Plano 5 — Upload + Categorizar (Q&A) + Tempo Real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o ciclo de entrada de dados do app financeiro Leo & Luis — subir extrato CSV (Itaú/Bradesco) com deduplicação, categorizar transações pendentes em Q&A, tudo sincronizado em tempo real entre os dois usuários, com badge de pendentes na navegação.

**Architecture:** Um `TransacoesProvider` (React context, espelho do `AuthContext`) carrega todas as transações do household uma vez e mantém uma subscription realtime (`postgres_changes` filtrada por `household_id`); pendentes, auto-revisáveis e hashes existentes são derivados em memória. As telas Upload e Categorizar e o badge do Shell consomem `useTransacoes()`. A lógica pura de parse/categoria/hash já existe e é reusada; o novo código puro (`prepararUpload`, `derivarChave`) é construído test-first.

**Tech Stack:** React 19 + Vite 8 + Tailwind v4 + react-router-dom v7 + `@supabase/supabase-js` (todos já no lockfile — **zero dependências novas**). Testes: `node --test`. Spec: [`2026-06-17-financas-plano5-upload-categorizar-design.md`](../specs/2026-06-17-financas-plano5-upload-categorizar-design.md).

---

## Restrições de ambiente (ler antes de executar)

- **Ambiente CI-only:** o repo vive no Google Drive (`I:\Meu Drive\...`). `npm install` completo QUEBRA. **Não** instalar `node_modules`. **Não** rodar `vite build`/`npm run dev` localmente. Build e realtime rodam no CI/produção.
- **Só rode** `npm test --prefix financas-app` (lógica pura, sem deps). Isso cobre Tasks 1–2 e serve de guarda de regressão nas Tasks 4–7 (os testes não importam JSX/Supabase, então continuam verdes).
- **Verificação de UI é ao vivo** (Task 8): abrir PR → Leo mergeia → Action builda `/financas` → recarregar para furar o cache do service worker → verificar com Chrome MCP (ferramentas DOM). Criar conta/logar é ação do Leo.
- **Não tocar** em nada fora de `financas-app/`, `docs/superpowers/`.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `financas-app/src/lib/upload.js` | `prepararUpload` — mapeia parser→linha do banco, aplica categoria/pessoa/mês, conta o preview | **Criar** |
| `financas-app/test/upload.test.js` | testes de `prepararUpload` | **Criar** |
| `financas-app/src/lib/regras.js` | `derivarChave` — chave de regra a partir da descrição | **Criar** |
| `financas-app/test/regras.test.js` | testes de `derivarChave` | **Criar** |
| `financas-app/supabase/schema.sql` | adicionar coluna `categoria_auto` (def + migração idempotente) | **Modificar** |
| `financas-app/src/data/TransacoesContext.jsx` | provider + `useTransacoes` (estado, realtime, ações) | **Criar** |
| `financas-app/src/App.jsx` | envolver o Shell com `TransacoesProvider` | **Modificar** |
| `financas-app/src/components/Shell.jsx` | badge de pendentes no item `/categorizar` | **Modificar** |
| `financas-app/src/pages/Upload.jsx` | tela de upload (hoje é `EmBreve`) | **Modificar** |
| `financas-app/src/pages/Categorizar.jsx` | tela Q&A (hoje é `EmBreve`) | **Modificar** |

---

## Task 1: Helper `prepararUpload` (TDD)

Coração do upload: recebe as transações parseadas (camelCase, saída de `parseCSV`) e devolve `{ linhas, resumo }`, onde `linhas` são objetos no formato snake_case das colunas de `transacoes` e `resumo` são as contagens do preview.

**Files:**
- Create: `financas-app/src/lib/upload.js`
- Test: `financas-app/test/upload.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Crie `financas-app/test/upload.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararUpload } from '../src/lib/upload.js';

// Fábrica de transação parseada (formato camelCase de saída dos parsers).
const tx = (over = {}) => ({
  hash: 'h1',
  data: '2026-06-08',
  descricao: 'IFOOD CLUB',
  descricaoOriginal: 'iFood Club',
  valor: 42.5,
  banco: 'itau',
  pessoa: 'compartilhado',
  mesReferencia: '2026-06',
  parcelaAtual: null,
  parcelaTotal: null,
  categoria: null,
  ehFixo: false,
  ...over,
});

test('prepararUpload mapeia para as colunas snake_case do banco', () => {
  const { linhas } = prepararUpload({
    parsed: [tx()],
    hashesExistentes: new Set(),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    deQuemItau: 'compartilhado',
    arquivoOrigem: 'fatura.csv',
    autoCategorizar: false,
  });
  assert.equal(linhas.length, 1);
  const l = linhas[0];
  assert.equal(l.household_id, 'HH');
  assert.equal(l.descricao_original, 'iFood Club');
  assert.equal(l.mes_referencia, '2026-06');
  assert.equal(l.hash_origem, 'h1');
  assert.equal(l.arquivo_origem, 'fatura.csv');
  assert.equal(l.eh_fixo, false);
  assert.equal(l.categoria, null); // autoCategorizar=false
  assert.equal(l.categoria_auto, false);
});

test('prepararUpload conta já processadas vs novas pelo hash', () => {
  const parsed = [tx({ hash: 'h1' }), tx({ hash: 'h2' })];
  const { resumo } = prepararUpload({
    parsed,
    hashesExistentes: new Set(['h1']),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    autoCategorizar: false,
  });
  assert.equal(resumo.encontradas, 2);
  assert.equal(resumo.jaProcessadas, 1);
  assert.equal(resumo.novas, 1);
});

test('prepararUpload auto-categoriza e conta só as novas categorizadas', () => {
  // 'IFOOD' casa em alimentacao pelo dicionário AUTO_CATEGORIAS; hash novo.
  const parsed = [tx({ hash: 'novo', descricao: 'IFOOD CLUB' })];
  const { linhas, resumo } = prepararUpload({
    parsed,
    hashesExistentes: new Set(),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    autoCategorizar: true,
  });
  assert.equal(linhas[0].categoria, 'alimentacao');
  assert.equal(linhas[0].categoria_auto, true);
  assert.equal(resumo.autoCategorizadas, 1);
});

test('prepararUpload aplica "de quem" só ao Itaú; Bradesco fica Luis', () => {
  const parsed = [
    tx({ hash: 'a', banco: 'itau', pessoa: 'compartilhado' }),
    tx({ hash: 'b', banco: 'bradesco', pessoa: 'luis' }),
  ];
  const { linhas } = prepararUpload({
    parsed,
    hashesExistentes: new Set(),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    deQuemItau: 'leo',
    autoCategorizar: false,
  });
  assert.equal(linhas[0].pessoa, 'leo'); // itau sobrescrito pelo "de quem"
  assert.equal(linhas[1].pessoa, 'luis'); // bradesco mantém
});

test('prepararUpload carimba o mês de referência escolhido em todas as linhas', () => {
  const parsed = [tx({ hash: 'a', mesReferencia: '2026-05' })];
  const { linhas } = prepararUpload({
    parsed,
    hashesExistentes: new Set(),
    regras: [],
    householdId: 'HH',
    mesReferencia: '2026-06',
    autoCategorizar: false,
  });
  assert.equal(linhas[0].mes_referencia, '2026-06');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test --prefix financas-app`
Expected: FALHA nos testes de `upload.test.js` (`Cannot find module '../src/lib/upload.js'` / `prepararUpload is not a function`). Os 47 testes existentes continuam passando.

- [ ] **Step 3: Implementar o mínimo para passar**

Crie `financas-app/src/lib/upload.js`:

```js
import { categorizarAutomatico } from './categorizador.js';

// Transforma as transações parseadas (camelCase, saída dos parsers) em linhas
// prontas para o INSERT em `transacoes` (snake_case) e calcula as contagens do
// preview do upload.
//
// - autoCategorizar (default true): aplica categorizarAutomatico; quando uma
//   categoria é encontrada, marca categoria_auto=true (revisável no Q&A).
//   Desligado, tudo entra como pendente (categoria=null, categoria_auto=false).
// - deQuemItau: sobrescreve `pessoa` SÓ nas linhas do Itaú (cartão compartilhado);
//   Bradesco mantém o que veio do parser ('luis').
// - mesReferencia: carimbado em TODAS as linhas (o hash não depende dele, então
//   trocar o mês não afeta a deduplicação).
export function prepararUpload({
  parsed,
  hashesExistentes,
  regras = [],
  householdId,
  mesReferencia,
  deQuemItau = 'compartilhado',
  arquivoOrigem = null,
  autoCategorizar = true,
}) {
  const existentes = hashesExistentes instanceof Set ? hashesExistentes : new Set(hashesExistentes);
  let novas = 0;
  let jaProcessadas = 0;
  let autoCategorizadas = 0;

  const linhas = parsed.map((t) => {
    const jaExiste = existentes.has(t.hash);
    if (jaExiste) jaProcessadas += 1;
    else novas += 1;

    const categoria = autoCategorizar ? categorizarAutomatico(t.descricao, regras) : null;
    const categoriaAuto = categoria != null;
    if (!jaExiste && categoriaAuto) autoCategorizadas += 1;

    const pessoa = t.banco === 'itau' ? deQuemItau : t.pessoa;

    return {
      household_id: householdId,
      data: t.data,
      descricao: t.descricao,
      descricao_original: t.descricaoOriginal,
      valor: t.valor,
      banco: t.banco,
      pessoa,
      categoria,
      categoria_auto: categoriaAuto,
      eh_fixo: t.ehFixo ?? false,
      parcela_atual: t.parcelaAtual ?? null,
      parcela_total: t.parcelaTotal ?? null,
      arquivo_origem: arquivoOrigem,
      mes_referencia: mesReferencia,
      hash_origem: t.hash,
    };
  });

  return {
    linhas,
    resumo: {
      encontradas: parsed.length,
      jaProcessadas,
      novas,
      autoCategorizadas,
    },
  };
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test --prefix financas-app`
Expected: PASSA (os 5 novos de `upload.test.js` + os 47 existentes).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/upload.js financas-app/test/upload.test.js
git commit -m "feat(financas): prepararUpload — mapeia parser→linha do banco + contagens do preview"
```

---

## Task 2: Helper `derivarChave` (TDD)

Deriva a chave de uma regra (`regras_categoria.chave`) a partir da descrição: as ~2 primeiras palavras, em maiúsculas, **como substring literal** da descrição limpa — para casar no `desc.includes(chave)` do categorizador.

**Files:**
- Create: `financas-app/src/lib/regras.js`
- Test: `financas-app/test/regras.test.js`

- [ ] **Step 1: Escrever o teste que falha**

Crie `financas-app/test/regras.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { derivarChave } from '../src/lib/regras.js';
import { categorizarAutomatico } from '../src/lib/categorizador.js';

test('derivarChave pega as 2 primeiras palavras em maiúsculas', () => {
  assert.equal(derivarChave('CONDOR SITIO CERCADOCURITIBABRA'), 'CONDOR SITIO');
});

test('derivarChave lida com uma palavra só', () => {
  assert.equal(derivarChave('IFOOD'), 'IFOOD');
});

test('derivarChave colapsa espaços e normaliza a caixa, preservando pontuação interna', () => {
  assert.equal(derivarChave('  uber*   trip  sao paulo '), 'UBER* TRIP');
});

test('a chave derivada casa no categorizador (ida e volta)', () => {
  const desc = 'XYZ COMERCIO DE ROUPAS LTDA';
  // não casa em nenhuma palavra-chave automática
  assert.equal(categorizarAutomatico(desc, []), null);
  // com a regra derivada, passa a casar
  const regras = [{ chave: derivarChave(desc), categoria: 'vestuario' }];
  assert.equal(categorizarAutomatico(desc, regras), 'vestuario');
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test --prefix financas-app`
Expected: FALHA nos testes de `regras.test.js` (`Cannot find module '../src/lib/regras.js'`).

- [ ] **Step 3: Implementar o mínimo para passar**

Crie `financas-app/src/lib/regras.js`:

```js
// Deriva a chave de uma regra a partir da descrição: as ~2 primeiras "palavras"
// (separadas por espaço) em MAIÚSCULAS. Mantém a pontuação interna do token
// (ex.: 'UBER*') para que a chave seja uma SUBSTRING literal da descrição limpa
// — assim o `desc.includes(chave)` do categorizador casa de volta.
export function derivarChave(descricao) {
  return String(descricao)
    .toUpperCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm test --prefix financas-app`
Expected: PASSA (os 4 novos de `regras.test.js` + os anteriores).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/regras.js financas-app/test/regras.test.js
git commit -m "feat(financas): derivarChave — chave de regra a partir da descrição"
```

---

## Task 3: Migração SQL — coluna `categoria_auto`

Adiciona a coluna que distingue "categoria escolhida pelo robô" (revisável) de "confirmada por humano". Edita o `schema.sql` (que é idempotente e rodado inteiro pelo Leo no painel): atualiza a definição da tabela **e** adiciona uma migração `add column if not exists` para o banco que já existe em produção.

**Files:**
- Modify: `financas-app/supabase/schema.sql`

- [ ] **Step 1: Adicionar a coluna na definição da tabela `transacoes`**

Em `financas-app/supabase/schema.sql`, na criação de `public.transacoes`, troque a linha:

```sql
  categoria text,
```

por:

```sql
  categoria text,
  categoria_auto boolean not null default false, -- true = categoria veio do robô (revisável no Q&A)
```

- [ ] **Step 2: Adicionar a seção de migração idempotente**

Ainda em `schema.sql`, logo **antes** do bloco final de comentário `-- ===... FIM` (a última linha de `===`), insira:

```sql
-- ----------------------------------------------------------------------------
-- 7. MIGRAÇÕES INCREMENTAIS (seguras para rodar em banco já existente)
-- ----------------------------------------------------------------------------
-- categoria_auto: marca se a categoria foi sugerida pelo robô (revisável no Q&A).
alter table public.transacoes
  add column if not exists categoria_auto boolean not null default false;

```

- [ ] **Step 3: Conferir que o arquivo está coerente**

Run: `git diff financas-app/supabase/schema.sql`
Expected: mostra a coluna nova na definição da tabela + a seção 7 com o `add column if not exists`. (Não há teste automatizado — é SQL que o Leo roda no painel; a verificação real é na Task 8.)

- [ ] **Step 4: Commit**

```bash
git add financas-app/supabase/schema.sql
git commit -m "feat(financas): coluna categoria_auto em transacoes (migração idempotente)"
```

---

## Task 4: `TransacoesProvider` + `useTransacoes` + wiring no App

Cria o context que carrega tudo do household, mantém a subscription realtime e expõe estado + ações. Sem teste local (React + Supabase) — guarda de regressão é a suíte seguir verde; verificação funcional é ao vivo (Task 8).

**Files:**
- Create: `financas-app/src/data/TransacoesContext.jsx`
- Modify: `financas-app/src/App.jsx`

- [ ] **Step 1: Criar o provider**

Crie `financas-app/src/data/TransacoesContext.jsx`:

```jsx
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../auth/AuthContext.jsx';

const TransacoesContext = createContext(null);

// 'AAAA-MM' do mês atual (default do seletor de mês).
function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

export function TransacoesProvider({ children }) {
  const { householdId } = useAuth();
  const [transacoes, setTransacoes] = useState([]);
  const [regras, setRegras] = useState([]);
  const [mesReferencia, setMesReferencia] = useState(mesAtual());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  // Carga inicial (todas as transações + regras do household) + subscription
  // realtime. Escopado ao household; refaz quando o householdId muda.
  useEffect(() => {
    if (!householdId) return undefined;
    let ativo = true;
    setLoading(true);

    async function carregar() {
      const [tx, rg] = await Promise.all([
        supabase.from('transacoes').select('*').eq('household_id', householdId),
        supabase.from('regras_categoria').select('*').eq('household_id', householdId),
      ]);
      if (!ativo) return;
      if (tx.error || rg.error) {
        setErro('Não foi possível carregar os dados.');
      } else {
        setTransacoes(tx.data ?? []);
        setRegras(rg.data ?? []);
        setErro('');
      }
      setLoading(false);
    }
    carregar();

    const canal = supabase
      .channel(`transacoes:${householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transacoes',
          filter: `household_id=eq.${householdId}`,
        },
        (payload) => {
          setTransacoes((atual) => {
            if (payload.eventType === 'DELETE') {
              return atual.filter((t) => t.id !== payload.old.id);
            }
            const linha = payload.new;
            const idx = atual.findIndex((t) => t.id === linha.id);
            if (idx === -1) return [...atual, linha];
            const copia = atual.slice();
            copia[idx] = linha;
            return copia;
          });
        },
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(canal);
    };
  }, [householdId]);

  // Insere as linhas novas (ON CONFLICT DO NOTHING pela chave de dedup). O realtime
  // ecoa as inserções e o merge por id evita duplicar no estado local.
  const salvarTransacoes = useCallback(async (linhas) => {
    if (!linhas.length) return { count: 0 };
    const { error } = await supabase
      .from('transacoes')
      .upsert(linhas, { onConflict: 'household_id,hash_origem', ignoreDuplicates: true });
    if (error) throw error;
    return { count: linhas.length };
  }, []);

  // Confirma/corrige uma categoria no Q&A: marca categoria_auto=false (sai da revisão).
  // Atualização otimista para o card sumir na hora; o realtime confirma.
  const atualizarCategoria = useCallback(async (id, { categoria, pessoa }) => {
    setTransacoes((atual) =>
      atual.map((t) =>
        t.id === id ? { ...t, categoria, pessoa: pessoa ?? t.pessoa, categoria_auto: false } : t,
      ),
    );
    const patch = { categoria, categoria_auto: false };
    if (pessoa) patch.pessoa = pessoa;
    const { error } = await supabase.from('transacoes').update(patch).eq('id', id);
    if (error) throw error;
  }, []);

  // Salva (ou atualiza) uma regra aprendida.
  const salvarRegra = useCallback(
    async ({ chave, categoria, pessoaPadrao }) => {
      if (!chave) return;
      const linha = {
        household_id: householdId,
        chave,
        categoria,
        pessoa_padrao: pessoaPadrao ?? null,
      };
      const { data, error } = await supabase
        .from('regras_categoria')
        .upsert(linha, { onConflict: 'household_id,chave' })
        .select();
      if (error) throw error;
      setRegras((atual) => {
        const nova = data?.[0] ?? linha;
        const idx = atual.findIndex((r) => r.chave === chave);
        if (idx === -1) return [...atual, nova];
        const copia = atual.slice();
        copia[idx] = nova;
        return copia;
      });
    },
    [householdId],
  );

  const pendentes = useMemo(() => transacoes.filter((t) => t.categoria == null), [transacoes]);
  const autoRevisaveis = useMemo(
    () => transacoes.filter((t) => t.categoria != null && t.categoria_auto),
    [transacoes],
  );
  const hashesExistentes = useMemo(
    () => new Set(transacoes.map((t) => t.hash_origem)),
    [transacoes],
  );
  const transacoesDoMes = useCallback(
    (mes) => transacoes.filter((t) => t.mes_referencia === mes),
    [transacoes],
  );

  const valor = {
    transacoes,
    pendentes,
    autoRevisaveis,
    hashesExistentes,
    transacoesDoMes,
    regras,
    mesReferencia,
    setMesReferencia,
    salvarTransacoes,
    atualizarCategoria,
    salvarRegra,
    loading,
    erro,
  };

  return <TransacoesContext.Provider value={valor}>{children}</TransacoesContext.Provider>;
}

export function useTransacoes() {
  const ctx = useContext(TransacoesContext);
  if (!ctx) throw new Error('useTransacoes deve ser usado dentro de <TransacoesProvider>');
  return ctx;
}
```

- [ ] **Step 2: Envolver o Shell com o provider em `App.jsx`**

Em `financas-app/src/App.jsx`, adicione o import (junto aos outros, após o import do Shell):

```jsx
import { TransacoesProvider } from './data/TransacoesContext.jsx';
```

E troque a linha:

```jsx
      <Route element={<ProtectedRoute><Shell /></ProtectedRoute>}>
```

por:

```jsx
      <Route element={<ProtectedRoute><TransacoesProvider><Shell /></TransacoesProvider></ProtectedRoute>}>
```

- [ ] **Step 3: Rodar a suíte (guarda de regressão)**

Run: `npm test --prefix financas-app`
Expected: PASSA (a suíte não importa JSX/Supabase; deve seguir igual). A verificação funcional do realtime é ao vivo (Task 8).

- [ ] **Step 4: Commit**

```bash
git add financas-app/src/data/TransacoesContext.jsx financas-app/src/App.jsx
git commit -m "feat(financas): TransacoesProvider — estado do household + realtime + ações"
```

---

## Task 5: Badge de pendentes no Shell

Mostra a contagem de pendentes (global, `categoria IS NULL`) no item `/categorizar`, na sidebar (desktop) e na bottom-nav (mobile).

**Files:**
- Modify: `financas-app/src/components/Shell.jsx`

- [ ] **Step 1: Reescrever o Shell com o badge**

Substitua TODO o conteúdo de `financas-app/src/components/Shell.jsx` por:

```jsx
import { NavLink, Outlet } from 'react-router-dom';
import { NAV_ITENS } from './nav.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useTransacoes } from '../data/TransacoesContext.jsx';

export default function Shell() {
  const { nomeMembro } = useAuth();
  const { pendentes } = useTransacoes();
  const pendentesCount = pendentes.length;

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
              {item.path === '/categorizar' && pendentesCount > 0 && (
                <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-teal-600 text-white text-xs font-semibold">
                  {pendentesCount}
                </span>
              )}
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
            <span className="relative">
              {item.icone}
              {item.path === '/categorizar' && pendentesCount > 0 && (
                <span className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-teal-600 text-white text-[10px] font-semibold">
                  {pendentesCount}
                </span>
              )}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Rodar a suíte (guarda de regressão)**

Run: `npm test --prefix financas-app`
Expected: PASSA (sem mudança nos testes). Verificação visual do badge é ao vivo (Task 8).

- [ ] **Step 3: Commit**

```bash
git add financas-app/src/components/Shell.jsx
git commit -m "feat(financas): badge de pendentes no item /categorizar (sidebar + bottom-nav)"
```

---

## Task 6: Tela Upload

Substitui o `EmBreve` pela tela real: banco + (Itaú) de quem + arquivo + toggle auto → analisar → preview (mês editável + 4 contagens) → salvar (dedup) + registro em `arquivos_processados`.

**Files:**
- Modify: `financas-app/src/pages/Upload.jsx`

- [ ] **Step 1: Reescrever a tela Upload**

Substitua TODO o conteúdo de `financas-app/src/pages/Upload.jsx` por:

```jsx
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
```

- [ ] **Step 2: Rodar a suíte (guarda de regressão)**

Run: `npm test --prefix financas-app`
Expected: PASSA. Verificação funcional (upload real, contagens, dedup) é ao vivo (Task 8).

- [ ] **Step 3: Commit**

```bash
git add financas-app/src/pages/Upload.jsx
git commit -m "feat(financas): tela de Upload (parse + preview + salvar com dedup)"
```

---

## Task 7: Tela Categorizar (Q&A)

Substitui o `EmBreve` pela fila de cards. Tocar numa categoria confirma (e o card some, inclusive na tela do parceiro, via realtime). "De quem" ajustável em todo card. Toggle "revisar auto" inclui as auto-categorizadas. Opção "salvar regra".

**Files:**
- Modify: `financas-app/src/pages/Categorizar.jsx`

- [ ] **Step 1: Reescrever a tela Categorizar**

Substitua TODO o conteúdo de `financas-app/src/pages/Categorizar.jsx` por:

```jsx
import { useState } from 'react';
import { useTransacoes } from '../data/TransacoesContext.jsx';
import { CATEGORIAS } from '../lib/categorias.js';
import { derivarChave } from '../lib/regras.js';

const PESSOAS = [
  { id: 'compartilhado', label: 'Compart.' },
  { id: 'leo', label: 'Leo' },
  { id: 'luis', label: 'Luis' },
];

function formatBRL(v) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(iso) {
  const [a, m, d] = String(iso).split('-');
  return `${d}/${m}/${a}`;
}

function CardTransacao({ tx, onConfirmar, onSalvarRegra }) {
  const [pessoa, setPessoa] = useState(tx.pessoa);
  const [salvarRegra, setSalvarRegra] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const chave = derivarChave(tx.descricao);

  async function escolher(categoria) {
    if (enviando) return;
    setEnviando(true);
    try {
      if (salvarRegra) {
        await onSalvarRegra({ chave, categoria, pessoaPadrao: pessoa });
      }
      await onConfirmar(tx.id, { categoria, pessoa });
      // Em sucesso, o card some (a transação deixa de ser pendente/revisável).
    } catch {
      setEnviando(false);
    }
  }

  return (
    <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3 ${enviando ? 'opacity-50' : ''}`}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="font-medium text-slate-800 truncate">{tx.descricao_original || tx.descricao}</p>
          <p className="text-sm text-slate-400">
            {formatData(tx.data)} · {tx.banco === 'itau' ? 'Itaú' : 'Bradesco'}
          </p>
        </div>
        <p className="font-semibold text-slate-800 shrink-0">{formatBRL(tx.valor)}</p>
      </div>

      <div>
        <p className="text-xs text-slate-400 mb-1">De quem foi?</p>
        <div className="flex gap-1.5">
          {PESSOAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPessoa(p.id)}
              className={`flex-1 rounded-lg border py-1.5 text-xs font-medium ${
                pessoa === p.id ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {CATEGORIAS.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={enviando}
            onClick={() => escolher(c.id)}
            className={`rounded-lg border py-2 text-[11px] flex flex-col items-center gap-0.5 ${
              tx.categoria === c.id
                ? 'border-teal-600 bg-teal-50 text-teal-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="text-base">{c.emoji}</span>
            {c.label}
          </button>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-500">
        <input type="checkbox" checked={salvarRegra} onChange={(e) => setSalvarRegra(e.target.checked)} />
        Salvar regra para “{chave}”
      </label>
    </div>
  );
}

export default function Categorizar() {
  const { pendentes, autoRevisaveis, atualizarCategoria, salvarRegra, loading } = useTransacoes();
  const [revisar, setRevisar] = useState(false);

  const fila = revisar ? [...pendentes, ...autoRevisaveis] : pendentes;

  if (loading) return <p className="text-slate-500">Carregando…</p>;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Categorizar</h1>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          <input type="checkbox" checked={revisar} onChange={(e) => setRevisar(e.target.checked)} />
          Revisar auto
        </label>
      </div>

      {fila.length === 0 ? (
        <div className="text-center text-slate-400 py-16">
          <p className="text-4xl mb-2">🎉</p>
          <p>Tudo categorizado!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {fila.map((tx) => (
            <CardTransacao
              key={tx.id}
              tx={tx}
              onConfirmar={atualizarCategoria}
              onSalvarRegra={salvarRegra}
            />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Rodar a suíte (guarda de regressão)**

Run: `npm test --prefix financas-app`
Expected: PASSA. Verificação funcional (cards, confirmar, sumir em tempo real, revisar, salvar regra) é ao vivo (Task 8).

- [ ] **Step 3: Commit**

```bash
git add financas-app/src/pages/Categorizar.jsx
git commit -m "feat(financas): tela Categorizar (Q&A) com confirmar/revisar/salvar regra em tempo real"
```

---

## Task 8: Suíte completa + PR + passos do Leo + verificação ao vivo

Fecha o plano: confirma a suíte inteira, abre o PR e lista os passos manuais do Leo e o roteiro de verificação ao vivo.

**Files:** nenhum novo (só git/PR).

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npm test --prefix financas-app`
Expected: PASSA — 47 existentes + 9 novos (5 de `upload.test.js`, 4 de `regras.test.js`) = 56 testes.

- [ ] **Step 2: Push da branch**

```bash
git push -u origin claude/peaceful-bartik-a17164
```

- [ ] **Step 3: Abrir o PR**

```bash
gh pr create --base main --title "Finanças Plano 5: Upload + Categorizar (Q&A) + tempo real" --body "$(cat <<'EOF'
## O que entra
- Tela **Upload**: parse Itaú/Bradesco, "de quem" (Itaú), mês de referência editável, toggle de auto-categorização, preview (encontradas/já processadas/novas/auto), salvar com dedup + registro em `arquivos_processados`.
- Tela **Categorizar (Q&A)**: cards de pendentes (global), "de quem" ajustável em todo card, grade de 15 categorias (toque confirma), "salvar regra", toggle "revisar auto-categorizadas". Cards somem em tempo real.
- **Badge** de pendentes no item `/categorizar` (sidebar + bottom-nav).
- `TransacoesProvider` + `useTransacoes` (carrega tudo do household + realtime).
- Helpers puros testados: `prepararUpload`, `derivarChave`. Zero dependências novas.

## ⚠️ Passo manual no Supabase (rodar ANTES de testar)
Rodar no SQL Editor (idempotente):
```sql
alter table public.transacoes
  add column if not exists categoria_auto boolean not null default false;
```
(ou re-rodar `financas-app/supabase/schema.sql` inteiro). O Realtime já estava habilitado no Plano 3 — só conferir em Database > Publications que `transacoes` está marcada.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 4: Passos do Leo (manuais, fora do agente)**

1. Rodar o `ALTER TABLE ... add column if not exists categoria_auto ...` no SQL Editor do Supabase (ou re-rodar `schema.sql`).
2. Conferir que o Realtime está habilitado em `transacoes` (Database > Publications) — já configurado no Plano 3.
3. Mergear o PR (preferência do Leo: abrir PR antes). A Action builda e commita `/financas`.

- [ ] **Step 5: Verificação ao vivo (após o deploy da Action)**

Roteiro (Chrome MCP, ferramentas DOM; **recarregar** a página para furar o cache do service worker):
1. Login (ação do Leo) → `/upload`.
2. Subir um extrato → conferir o preview (4 contagens) → Salvar → mensagem de sucesso.
3. Re-subir o MESMO arquivo → preview deve mostrar "já processadas" = total e "novas" = 0 (dedup).
4. `/categorizar` → cards aparecem; o badge na nav mostra a contagem.
5. Tocar numa categoria → card some; badge decrementa.
6. Ligar "Revisar auto" → as auto-categorizadas aparecem com a categoria pré-marcada.
7. (Tempo real) Com Leo e Luis logados em janelas diferentes: um categoriza, o card some na tela do outro sem recarregar.

---

## Self-Review (preenchido pelo autor do plano)

**1. Cobertura da spec (do design 2026-06-17):**
- §3 `TransacoesProvider` carregar-tudo + contrato `useTransacoes` → Task 4. ✅
- §3 realtime patch por id (INSERT/UPDATE/DELETE) → Task 4. ✅
- §4 coluna `categoria_auto` + migração idempotente → Task 3. ✅
- §5 `prepararUpload` (mapeamento snake_case, categoria/categoria_auto, de-quem Itaú, mês, contagens) → Task 1. ✅
- §5 `derivarChave` (substring literal que casa no categorizador) → Task 2. ✅
- §7 tela Upload (banco, de-quem Itaú, mês pré-preenchido editável, toggle auto, preview, salvar, arquivos_processados) → Task 6. ✅
- §8 tela Q&A (pendentes globais, de-quem ajustável em todo card incl. Bradesco, grade 15, toque confirma → categoria_auto=false, salvar regra, toggle revisar, vazio) → Task 7. ✅
- §9 badge de pendentes (global, só null) na sidebar + bottom-nav → Task 5. ✅
- §10 testes locais (helpers puros) + verificação ao vivo (PR→deploy→Chrome MCP) → Tasks 1,2,8. ✅
- §11 passos manuais do Leo (ALTER + conferir realtime) → Task 3 + Task 8. ✅
- §12 fora do escopo (pessoa_padrao auto-aplicado, toasts, dashboard) — não construído, correto. ✅

**2. Placeholders:** nenhum "TBD/TODO"; todo passo de código tem o código completo. ✅

**3. Consistência de tipos/nomes:**
- `prepararUpload({ parsed, hashesExistentes, regras, householdId, mesReferencia, deQuemItau, arquivoOrigem, autoCategorizar })` → idêntico entre Task 1 (def) e Task 6 (uso). ✅
- Retorno `{ linhas, resumo: { encontradas, jaProcessadas, novas, autoCategorizadas } }` → consumido igual na Task 6. ✅
- `useTransacoes` expõe `{ pendentes, autoRevisaveis, hashesExistentes, regras, salvarTransacoes, atualizarCategoria, salvarRegra, loading }` (Task 4) → exatamente os campos usados em Tasks 5/6/7. ✅
- `atualizarCategoria(id, { categoria, pessoa })` e `salvarRegra({ chave, categoria, pessoaPadrao })` → assinaturas iguais entre Task 4 (def) e Task 7 (uso). ✅
- Colunas snake_case (`descricao_original`, `mes_referencia`, `hash_origem`, `categoria_auto`, `pessoa_padrao`) batem com `schema.sql` (Task 3). ✅
