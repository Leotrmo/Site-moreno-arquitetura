# Finanças Leo & Luis — Plano 6: Dashboard + Relatório + Configurações + PWA

**Data:** 2026-06-17
**Status:** Design aprovado — pronto para plano de implementação
**Autor:** Leo (brainstorming com Claude Code)
**Specs anteriores:** [`2026-06-15-sistema-financeiro-design.md`](2026-06-15-sistema-financeiro-design.md) (§8 analisador, §9 hooks, §10 telas, §11 PWA, §13 regras), [`2026-06-17-financas-plano5-upload-categorizar-design.md`](2026-06-17-financas-plano5-upload-categorizar-design.md)

---

## 1. Contexto e objetivo

Fecha o MVP do app financeiro. Os Planos 1–5 já entregaram: parsers/categorizador/analisador
(lógica pura testada), schema Supabase com RLS, auth + shell (sidebar desktop / bottom-nav
mobile), upload de extratos, categorização Q&A e **tempo real** (PR #39, mergeado em `main`).

O Plano 6 substitui os três stubs `EmBreve` restantes (Dashboard, Relatório, Configurações),
adiciona o hook `usePerfil`, conecta os gráficos (Chart.js) e finaliza/verifica o PWA.

**Base de trabalho:** worktree fresca a partir de `origin/main` (que contém o Plano 5). Não se
trabalha na branch `claude/financas-app` (atrasada). Mudanças não relacionadas em `pokemon/` no
working tree não são tocadas.

---

## 2. Decisões aprovadas

- **Divisão Dashboard × Relatório:** Dashboard = análise **completa do mês selecionado**
  (navegável); Relatório = **histórico/comparativo multi-mês**. As telas são distintas e
  complementares; o Dashboard consome `analisar()` direto, o Relatório agrega vários meses.
- **`usePerfil` sem realtime no v1.** Config muda raramente, a tabela `perfil` não está na
  publicação de realtime (exigiria mais um passo manual no Supabase), e a tela recarrega ao
  abrir. Realtime de perfil fica para v2.
- **Contas fixas pré-populadas** (lista padrão editável no app) — só o que se paga **fora do
  cartão**. Internet, celular e streamings estão na fatura do cartão (entram como transações,
  não como fixos); água e gás estão no condomínio.
- **PWA já está pronto** (manifest, ícones, meta `apple-mobile-web-app-*`, `autoUpdate` —
  Plano 3). O escopo aqui é **verificação ao vivo** + conferir que os ícones existem em
  `public/`. Sem retrabalho.
- **Metas** = lista simples editável `{ nome, valor, prazoMeses }` (o analisador só checa se
  existe ≥1 meta para pontuar; o resto é display).
- **`diaPagamento`** é guardado para exibição/futuro — o analisador **não** o consome.

---

## 3. Shape do `perfil.dados` (jsonb) — formato que o analisador consome

⚠️ Este é o formato exato que `analisar(transacoes, perfil)` lê (confirmado em
`src/lib/analisador.js` e seu teste). Não inventar campos novos.

```jsonc
{
  "salarios": { "leo": 0, "luis": 0, "diaPagamento": 5 },
  "fixos": [
    { "nome": "Condomínio",       "valor": 525, "pessoa": "compartilhado" },
    { "nome": "Energia (Copel)",  "valor": 220, "pessoa": "compartilhado" },
    { "nome": "Seguro do carro",  "valor": 230, "pessoa": "leo" },
    { "nome": "IPTU",             "valor": 45,  "pessoa": "compartilhado" },
    { "nome": "Simples Nacional", "valor": 275, "pessoa": "leo" }
  ],
  "metas": []
}
```

Como o analisador usa cada campo:
- `salarios.leo + salarios.luis` → `rendaTotal` (e daí saldo, taxa de poupança, score). Outros
  campos dentro de `salarios` (ex.: `diaPagamento`) são ignorados pelo `Number(...)`.
- `fixos[].valor` → soma `fixos.configurados`, `fixos.pctDaRenda` e o score (pctFixos <50% → +20,
  ≤70% → +10). `nome`/`pessoa` são cosméticos (só display).
- `metas.length > 0` → score +10. Conteúdo das metas é display.

Os 5 fixos acima são o **default pré-preenchido** (valores são ponto de partida editável;
faixas reais: condomínio 500–550, energia 170–270, Simples 250–300). Salários começam em 0
(sensíveis — digitados no app, não no código).

---

## 4. Helpers puros novos (TDD com `node --test`)

Toda a lógica de agregação/formatação que não depende de React fica em `src/lib/` como função
pura testada. UI fica fina (só apresentação).

### 4.1 `src/lib/transacaoAdapter.js`
`linhaParaTransacao(row)` — mapeia a linha **snake_case** do banco (saída de `useTransacoes`)
para o shape **camelCase** que `analisar()` espera. Resolve o descasamento de nomes:

| coluna do banco (snake) | campo do analisador (camel) |
|---|---|
| `mes_referencia` | `mesReferencia` |
| `eh_fixo` | `ehFixo` |
| `parcela_atual` | `parcelaAtual` |
| `parcela_total` | `parcelaTotal` |
| `descricao_original` | `descricaoOriginal` |
| `data`, `descricao`, `valor`, `banco`, `pessoa`, `categoria` | iguais |

`paraAnalise(linhas)` = `linhas.map(linhaParaTransacao)`. Testes cobrem nulos
(`parcela_atual/total` nulos viram `null`) e a preservação de `valor`/`categoria`.

### 4.2 `src/lib/perfilModelo.js`
- `perfilPadrao()` → o seed da §3 (com os 5 fixos), usado quando **não há perfil salvo**.
- `normalizarPerfil(dados)` → garante `{ salarios:{leo,luis,diaPagamento}, fixos:[], metas:[] }`
  a partir de um `dados` parcial, **sem reinjetar** fixos que o usuário apagou (só preenche
  chaves ausentes com vazio). Usado para hidratar o form a partir de um perfil já salvo.

### 4.3 `src/lib/relatorio.js`
- `mesesComDados(transacoes)` → meses distintos (`mes_referencia`) ordenados desc; alimenta o
  seletor de mês do Dashboard e o eixo do Relatório.
- `serieMensal(transacoes, perfil)` → para cada mês com dados, roda
  `analisar(linhasDoMes.map(linhaParaTransacao), perfil)` e devolve
  `[{ mes, totalGastos, saldo, taxaPoupanca, score }]` (ordenado asc por mês).
- `comparativoCategorias(transacoes)` → matriz categoria × mês (valor por categoria em cada mês),
  para a tabela comparativa do Relatório.

### 4.4 `src/lib/formato.js`
- `formatBRL(n)` → `R$ 1.234,56`.
- `formatData(iso)` → `DD/MM/AAAA`.
- `nomeMes('2026-06')` → `jun/2026`.

> Nota: há um `formatBRL` interno (não exportado) no `analisador.js`. Para não mexer em código
> testado e congelado, `formato.js` traz a sua própria cópia. Pequena duplicação intencional.

---

## 5. `usePerfil` — `src/data/PerfilContext.jsx`

`PerfilProvider` + `usePerfil()` expõe `{ perfil, salvarPerfil, loading, erro }`:
- **Carga:** `select` da linha `perfil` por `household_id`; se não existir, `perfil = {}`
  (não há seed). Escopado ao household; refaz quando `householdId` muda.
- **`salvarPerfil(dados)`:** `upsert({ household_id, dados, atualizado_em: now }, { onConflict:
  'household_id' })`; atualiza o estado local no sucesso.
- **Sem realtime no v1.**
- **Montagem:** aninhado no layout protegido em `App.jsx`:
  `<TransacoesProvider><PerfilProvider><Shell/></PerfilProvider></TransacoesProvider>`.
- Erros do Supabase traduzidos para mensagem amigável; loading state.

---

## 6. Telas

Mobile-first (390px), PT-BR, tema teal `#0f766e`, cards `rounded-2xl` / `slate`. Valores
`R$ 1.234,56`, datas `DD/MM/AAAA`. Loading/empty states em toda operação assíncrona.

### 6.1 Configurações (substitui o stub `EmBreve`)
Form com seções:
- **Renda:** salário Leo, salário Luis, dia do pagamento.
- **Contas fixas:** lista editável (adicionar / remover / editar `nome` + `valor` + `pessoa`),
  pré-preenchida com os 5 fixos no 1º acesso.
- **Metas:** lista editável `{ nome, valor, prazoMeses }`.
- **Conta:** mostra `nomeMembro` (do `useAuth`) + botão **Sair** (já existe no stub).

Estado inicial do form: `perfilPadrao()` se o perfil salvo for vazio, senão
`normalizarPerfil(perfil)`. Botão **Salvar** → `salvarPerfil(dados)`, com estados
salvando/sucesso/erro. Grava no formato da §3.

### 6.2 Dashboard (substitui o stub `EmBreve`)
Navegador de mês (`◀ jun/2026 ▶`) via `mesReferencia`/`setMesReferencia` (de `useTransacoes`) +
`mesesComDados`. Consome:
```
analisar( transacoesDoMes(mesReferencia).map(linhaParaTransacao), perfil )
```
Seções:
- 4 cards: **Renda · Gastos · Saldo · Taxa de poupança** + bloco de **Score** (0–100, cor por
  faixa: Saudável/Atenção/Preocupante/Crítico).
- **Doughnut** por categoria (`porCategoria`) · **Barras** Leo×Luis (`porPessoa`).
- **Alertas** (`alertas`) · **Recomendações** (`recomendacoes`).
- Tabela de **Parcelamentos** (`parcelamentos`) · **Top 10** (`topTransacoes`).
- **Empty state** quando o mês não tem transações ("Suba um extrato"); **nudge** "Configure sua
  renda em Configurações" quando salários = 0.

### 6.3 Relatório (substitui o stub `EmBreve`) — histórico
Consome `serieMensal` / `comparativoCategorias` sobre **todas** as transações do household:
- **Gastos e saldo mês a mês** (barras/linha) · **evolução do score** (linha) ·
  **categoria × mês** (tabela comparativa).
- **Empty state** gentil com 0–1 meses de dados ("Adicione mais meses para ver tendências").

---

## 7. Charts (Chart.js)

- Deps novas: `chart.js` + `react-chartjs-2`, adicionadas **só via**
  `npm install --package-lock-only <pkg>` (não instalar `node_modules` — ambiente CI-only).
- `src/lib/chartSetup.js` registra **apenas** os controllers/elementos usados (tree-shaking):
  `ArcElement`, `BarElement`, `CategoryScale`, `LinearScale`, `PointElement`, `LineElement`,
  `Tooltip`, `Legend`. Importado uma vez.
- Wrappers finos `Doughnut` / `Bar` / `Line` de `react-chartjs-2`. Cores no tema teal.
- Gráficos são UI → verificados **ao vivo**, não em teste unitário.

---

## 8. PWA — finalizar

Manifest (`autoUpdate`, `scope`/`start_url` `/financas/`, ícones 192/512/maskable), meta
`apple-mobile-web-app-*`, `apple-touch-icon` e `viewport-fit=cover` **já existem** (Plano 3,
confirmado em `vite.config.js` e `index.html`). Escopo deste plano:
1. Conferir que os ícones gerados existem em `public/` (`pwa-192x192.png`, `pwa-512x512.png`,
   `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `logo.svg`); gerar se faltarem.
2. **Verificar ao vivo** que instala no iPhone e roda em standalone.

Sem re-fazer manifest/meta.

---

## 9. Testes e verificação

- **`node --test`** para os 4 helpers puros novos (`transacaoAdapter`, `perfilModelo`,
  `relatorio`, `formato`). O analisador é reusado (já testado). Rodar a **suíte inteira** entre
  tarefas (shapes compartilhados podem quebrar testes cross-file).
- **UI verificada ao vivo:** sem dev server local. Abrir **PR para o Leo revisar** (ele prefere
  PR antes de mergear). A Action que builda `/financas` roda **só no push à `main`** (ou seja,
  **após o merge**) — não há build na branch. Logo a verificação ao vivo com Chrome MCP acontece
  contra o app já implantado **depois do merge**. Gotchas conhecidos: (1) o service worker
  (`autoUpdate`) serve o app antigo em cache na 1ª carga pós-deploy — recarregar; (2) se o
  `computer` (screenshot/click) do Chrome MCP falhar por conflito de extensão, usar ferramentas
  DOM (navigate/read_page). Criar conta / logar é ação do Leo.

---

## 10. Ordem de execução (para writing-plans → subagentes)

1. Helpers puros (TDD): `formato`, `transacaoAdapter`, `perfilModelo`, `relatorio`.
2. `usePerfil` (`PerfilContext`) + montagem no `App.jsx`.
3. Deps de charts (`chart.js`, `react-chartjs-2`) + `chartSetup.js`.
4. Tela Configurações.
5. Tela Dashboard.
6. Tela Relatório.
7. PWA: conferir ícones + preparar verificação ao vivo.
8. PR → verificação ao vivo (Chrome MCP).

---

## 11. Restrições que não mudam (do projeto)

- **Ambiente CI-only:** repo no Google Drive; `npm install` completo quebra. Dep nova **só** via
  `npm install --package-lock-only`. Build/charts/realtime rodam no CI/produção.
- **Roteamento HashRouter** (`/financas/#/...`); **não** criar `404.html`.
- **Deploy:** push em `main` tocando `financas-app/**` → Action commita `/financas`. Nunca
  `gh-pages`. O build de produção acontece no merge à `main`.
- **Stack (no lockfile):** Vite 8, React 19, Tailwind v4 (`@import "tailwindcss";`),
  react-router-dom v7, `@supabase/supabase-js`. Acesso ao Supabase só por `src/lib/supabase.js`.
- `mes_referencia` = mês da **fatura** (não da compra). Nunca apagar dados (só INSERT
  on-conflict-do-nothing / UPDATE).

---

## 12. Fora de escopo (v2)

Realtime de perfil; toasts de atividade do parceiro; banner iOS de instruções de instalação;
indicador de presença online; detecção automática de `eh_fixo` em transações (hoje sempre
`false`, o que zera `fixos.detectados` — o analisador já lida com isso).
