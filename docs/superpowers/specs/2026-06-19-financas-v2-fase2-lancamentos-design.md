# Spec — App financeiro v2 / Fase 2: aba "Lançamentos"

Data: 2026-06-19
Status: aprovado (brainstorming com o Leo)
Worktree: `worktree-financas-v2-fase2` (off `origin/main`)

## Contexto

O MVP e a v2/Fase 1 (import com revisão + parcelamento, incluindo o fix de parcelas
Itaú repetidas — PR #43) já estão na `main`. A Fase 2 adiciona a aba **Lançamentos**:
o "livro-razão" completo, com a lista de **todas** as transações do household (não só
do mês), filtrável, ordenável e pesquisável.

Diferença em relação às telas existentes:
- **Dashboard** = análise completa de UM mês navegável.
- **Relatório** = histórico multi-mês agregado (séries/comparativos).
- **Lançamentos (nova)** = a lista crua e completa pra encontrar/conferir transações.

## Princípios e restrições (do projeto)

- **Sem backend novo, sem migração, sem SQL, sem libs novas.** Tela 100% read-only que
  consome dados já carregados.
- Ambiente CI-only: `npm install` quebra no Drive. Lógica pura testada com `node --test`
  (`npm test --prefix financas-app`). UI sem teste local → verificação **ao vivo após o
  merge** (HashRouter → forçar reload com `?cb=...` pra furar o Service Worker).
- Reaproveitar o que já existe: `useTransacoes` (carrega tudo + realtime), `transacaoAdapter`
  (`linhaParaTransacao`/`paraAnalise`, snake→camel), `CATEGORIAS`, `formato.js`
  (`formatBRL`/`formatData`/`nomeMes`/`shiftMes`), o padrão de página/rota/nav.

## Escopo da Fase 2

**Inclui:** listagem completa, filtros (período, banco, pessoa, categoria, parcelado/à
vista, busca textual), ordenação (data/valor/descrição, asc/desc), barra de total
(contagem + soma do recorte filtrado), estados de carga/erro/vazio.

**NÃO inclui (fica pra fases seguintes):** qualquer edição (tocar numa linha não altera
nada), histórico/auditoria de edições e correção de mês em lote (Fase 3), dashboard de
cortes e projeção de compromissos futuros (Fase 4). Sem agrupamento por mês na lista
(decisão: lista plana). Sem virtualização (volume pequeno — 2 pessoas).

## Arquitetura

### Camada de lógica pura — `src/lib/lancamentos.js` (TDD)

Funções puras sobre transações já no shape **camelCase** (a página mapeia com
`paraAnalise(transacoes)` antes de chamar). Toda a regra de negócio vive aqui; a página
React fica fina.

- `intervaloDePreset(preset, hoje)` → `{ de, ate }` em `'AAAA-MM'`, ou `null` em cada
  ponta pra "sem limite".
  - `'tudo'` → `{ de: null, ate: null }`
  - `'mes'` → mês de `hoje` nas duas pontas
  - `'3meses'` → `{ de: hoje-2meses, ate: hoje }` (mês corrente + 2 anteriores = 3 meses)
  - `'ano'` → `{ de: 'AAAA-01', ate: 'AAAA-12' }` do ano de `hoje`
  - `hoje` é injetável (default `new Date()`) pra testar determinístico. Usa a mesma
    aritmética de `shiftMes` do `formato.js`.

- `filtrarLancamentos(txs, filtros)` → array filtrado, combinando todos os critérios com
  **E (AND)**. `filtros`:
  - `periodo: { de, ate }` — compara `mesReferencia` (string `'AAAA-MM'`, comparação
    lexicográfica): inclui se `(de == null || mes >= de) && (ate == null || mes <= ate)`.
  - `banco: 'todos' | 'itau' | 'bradesco'`.
  - `pessoa: 'todos' | 'leo' | 'luis' | 'compartilhado'`.
  - `categoria: 'todas' | <id de CATEGORIAS> | 'sem'` — `'sem'` casa `categoria == null`
    (pendentes); um id casa igualdade exata.
  - `parcelado: 'todos' | 'sim' | 'nao'` — `'sim'` = tem `parcelaTotal` (não-nulo) **ou**
    `serieId` (não-nulo); `'nao'` = nenhum dos dois.
  - `busca: string` — substring **case-insensitive** (normaliza pra maiúsculas) em
    `descricao` **e** `descricaoOriginal`. String vazia/espaços = sem filtro.
  - Valores ausentes/`undefined`/`'todos'`/`'todas'` = critério inativo (passa tudo).

- `ordenarLancamentos(lista, { campo, direcao })` → nova lista ordenada (não muta).
  - `campo: 'data' | 'valor' | 'descricao'`; `direcao: 'asc' | 'desc'`.
  - `data` ordena pela string ISO `data`; `valor` numérico; `descricao` por `localeCompare`
    pt-BR case-insensitive. Ordenação **estável** (desempate por `data` desc e, por fim,
    índice original) pra resultado previsível.

- `resumoLancamentos(lista)` → `{ count, soma }` — `count = lista.length`,
  `soma = Σ valor`. (Todos os valores são positivos no modelo.)

### Camada de UI — `src/pages/Lancamentos.jsx`

Página fina. Lê `useTransacoes()` (`transacoes`, `loading`, `erro`), mapeia
`paraAnalise(transacoes)` memoizado, e mantém o estado dos filtros + ordenação. Deriva
a lista visível com `filtrarLancamentos` → `ordenarLancamentos`, e o total com
`resumoLancamentos` (memoizados).

Estado local:
- `periodoPreset` (`'tudo'` default) e `periodoCustom { de, ate }` (quando preset =
  `'personalizado'`).
- `banco`, `pessoa`, `categoria`, `parcelado` (todos default `'todos'/'todas'`).
- `busca` (com debounce ~200ms antes de aplicar).
- `ordem { campo: 'data', direcao: 'desc' }` (default).
- `painelAberto` (bool) — abre/fecha o painel de filtros secundários.

**Layout (mobile-first, "Layout B — recolhidos"):**
1. Campo de **busca** (sempre visível) + botão **"Filtros (N)"** ao lado (N = nº de
   filtros secundários ativos; abre o painel).
2. Linha de **chips de período**: Tudo · Este mês · Últimos 3 meses · Este ano ·
   Personalizado (este último revela dois `<input type="month">` de–até).
3. **Chips de filtros ativos** removíveis (✕ por chip) + "Limpar tudo", quando houver
   algum filtro secundário ou de período ≠ Tudo ativo.
4. **Painel de filtros** (abre via botão; secundários): Banco, Pessoa, Categoria,
   Parcelado — como selects/grupos de opção.
5. **Barra de total**: "N lançamentos · R$ soma" à esquerda; controle de **ordenação**
   à direita (Data/Valor/Descrição com seta ↑/↓; tocar no campo ativo inverte a direção).
6. **Lista plana** read-only. Por linha:
   - Linha 1: `descricao` (negrito, truncada) à esquerda; `formatBRL(valor)` à direita.
   - Linha 2 (meta, cinza, menor): `formatData(data)` (`dd/mm/aaaa` — reusa o helper
     existente; mostra o ano pra não ficar ambíguo na lista plana multi-ano) · pessoa ·
     emoji+label da categoria (ou "Sem categoria") · banco; **badge
     `parcelaAtual/parcelaTotal`** quando houver parcela.
   - `key={t.id}`. Tocar não dispara ação (read-only nesta fase).

**Estados:**
- `loading` → placeholder/spinner.
- `erro` → mensagem de erro (reusa o texto padrão do provider).
- vazio (lista filtrada com 0 itens) → "Nenhum lançamento com esses filtros" + botão
  "Limpar tudo".

### Roteamento e navegação

- `src/App.jsx`: nova `<Route path="/lancamentos" element={<Lancamentos />} />` dentro do
  bloco protegido (mesmos providers).
- `src/components/nav.jsx`: novo item em `NAV_ITENS` com ícone de lista (SVG inline no
  padrão existente). Ordem: Resumo · Subir · Categorizar · **Lançamentos** · Relatório ·
  Config (6ª aba). Label "Lançamentos"; se a bottom-nav do celular ficar apertada com 6
  itens, encurtar pra "Extrato" (decisão de polish na verificação ao vivo).

## Fluxo de dados

`useTransacoes` (snake_case, já carregado + realtime) → `paraAnalise()` (camelCase) →
`filtrarLancamentos` → `ordenarLancamentos` → render da lista + `resumoLancamentos` no
total. Realtime: como a página deriva tudo de `transacoes`, qualquer INSERT/UPDATE/DELETE
ecoado pelo provider re-renderiza a lista automaticamente. Nada é persistido por esta tela.

## Testes

`test/lancamentos.test.js` (`node --test`), cobrindo a lógica pura com fixtures
camelCase representativas (Itaú/Bradesco, leo/luis/compartilhado, com e sem categoria,
com e sem parcela, meses variados):
- `intervaloDePreset`: cada preset com um `hoje` fixo (inclui virada de ano no `'3meses'`
  e no `'ano'`).
- `filtrarLancamentos`: cada filtro isolado; combinação AND de vários; `categoria 'sem'`
  pega pendentes; `parcelado 'sim'` pega tanto por `parcelaTotal` quanto por `serieId`;
  busca case-insensitive casando em `descricao` e em `descricaoOriginal`; filtros inativos
  passam tudo.
- `ordenarLancamentos`: os 3 campos × 2 direções; estabilidade (empate resolvido de forma
  determinística); não-mutação da lista de entrada.
- `resumoLancamentos`: contagem + soma; lista vazia → `{ count: 0, soma: 0 }`.

UI (página/nav) sem teste local (sem build/dev server) → verificação **ao vivo após o
merge** (recarregar com `?cb=` pra furar o SW). Baseline atual: 86/86 verde; meta após a
Fase 2: 86 + os novos testes da lógica pura.

## Entrega

PR único `main` ← `worktree-financas-v2-fase2`. Leo revisa/mergeia. **Nenhuma ação no
Supabase é necessária** (sem schema/SQL nesta fase).
