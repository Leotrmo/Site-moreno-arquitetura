# Sistema Financeiro — Leo & Luis (`moreno.arq.br/financas`)

**Data:** 2026-06-15
**Status:** Design aprovado — pronto para plano de implementação
**Autor:** Leo (brainstorming com Claude Code)

---

## 1. Contexto e objetivo

Web app financeiro **privado** para duas pessoas (Leo e Luis), instalável como PWA no
iPhone, hospedado em `moreno.arq.br/financas` dentro do repositório estático existente
(`Site-moreno-arquitetura`).

Ciclo principal: **login → subir extrato CSV → categorizar transações → ver relatório
mensal**, com **sincronização em tempo real** entre os dois usuários (quando um
categoriza, o outro vê sem recarregar).

Extratos suportados:
- **Itaú** — cartão compartilhado (Leo e Luis usam).
- **Bradesco** — cartão do Luis (titular LUIS PEDROSA, final 0710).

---

## 2. Decisões aprovadas

### Escopo v1 (entrega inicial)
Login email/senha (com cadastro no app), upload Itaú+Bradesco com deduplicação,
categorização automática + Q&A, **sync em tempo real**, dashboard completo (cards,
pizza, barras Leo×Luis, alertas, recomendações, parcelamentos, top 10), configurações
(salários/fixos/metas) e **PWA instalável** (manifest + ícones + service worker).

### Fora do escopo v1 (adiado para v2)
- Sistema de **código de convite / múltiplas famílias** (Leo e Luis são fixos).
- **Indicador de presença online** ("Luis online agora").
- **Banner iOS** de instruções de instalação.
- *Toasts* de atividade do parceiro ("Luis categorizou X") — incluir só se sair barato
  depois do realtime pronto.

### Stack
React + Vite + Tailwind + React Router v6 + Chart.js/react-chartjs-2 + PapaParse +
`@supabase/supabase-js` + `vite-plugin-pwa`. Backend Supabase (Auth + Postgres + Realtime).

O **realtime justifica o React**: a re-renderização automática ao receber eventos do
Supabase seria DOM manual em vanilla.

### Deploy
**GitHub Action no push** (espelho do `refresh-meta.yml`): builda e commita `/financas`
quando há push em `financas-app/**`. **Sem branch `gh-pages`.** GitHub Pages continua
servindo da `main` (raiz) — portfólio e Pokémon intactos.

### Cadastro de usuários
Tela "Criar conta" no app (email + senha + nome Leo/Luis). Um *trigger* no Supabase
vincula cada novo usuário à household única automaticamente. Sem tela de configurar
família, sem código de convite.

---

## 3. Arquitetura no repositório

```
/                       portfólio (intacto)
/pokemon, /quiz-pokemon, /3dviewer, /sombra …   intactos
/financas/              BUILD (dist) commitado — servido em moreno.arq.br/financas
/financas-app/          código-fonte Vite/React (o projeto)
   vite.config.js       base:'/financas/', build.outDir:'../financas', emptyOutDir
   .env                 VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (publicáveis — ok commitar)
   public/404.html      cópia do index.html (React Router no GitHub Pages)
.github/workflows/deploy-financas.yml   build + commit de /financas no push a financas-app/**
```

- `node_modules/` fica no `.gitignore`. O código-fonte em `financas-app/` é público
  (como todo o repo), mas o app que roda é o build em `/financas`.
- A **chave publicável** (`sb_publishable_…`) e a **URL**
  (`https://kwtmychtpviwbbgwbict.supabase.co`) podem ser commitadas: acabam no bundle
  público de qualquer forma; a segurança é a **RLS**. Isso dispensa GitHub Secrets.
- A `service_role` key **nunca** entra no repo nem no front.

### vite.config.js (essencial)
```js
base: '/financas/',
build: { outDir: '../financas', emptyOutDir: true },
plugins: [react(), VitePWA({ /* manifest + autoUpdate, scope/start_url '/financas/' */ })]
```

---

## 4. Modelo de dados (Supabase / Postgres)

Seis tabelas com RLS por household. Mudanças sobre o rascunho original do prompt estão
marcadas com **★**.

```sql
create table households (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Leo & Luis',
  criado_em timestamptz default now()
);

create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  nome_membro text not null,             -- 'Leo' | 'Luis'
  unique(household_id, user_id)
);

create table transacoes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  data date not null,                    -- data da compra
  descricao text not null,               -- normalizada (upper, espaços colapsados)
  descricao_original text,               -- ★ crua, p/ exibir/depurar
  valor numeric(10,2) not null,          -- sempre positivo
  banco text not null check (banco in ('itau','bradesco')),
  pessoa text not null check (pessoa in ('leo','luis','compartilhado')),
  categoria text,
  eh_fixo boolean default false,
  parcela_atual int,
  parcela_total int,
  arquivo_origem text,
  mes_referencia char(7) not null,       -- 'AAAA-MM' = mês da FATURA (não da compra)
  hash_origem text not null,             -- ★ hash de conteúdo (ver §6)
  criado_em timestamptz default now(),
  unique(household_id, hash_origem)
);

create table regras_categoria (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  chave text not null,                   -- primeiras palavras do estabelecimento
  categoria text not null,
  pessoa_padrao text,                    -- 'leo' | 'luis' | null
  unique(household_id, chave)
);

create table perfil (
  id uuid primary key default gen_random_uuid(),
  household_id uuid unique references households(id) on delete cascade,
  dados jsonb not null default '{}',     -- salarios, fixos, metas
  atualizado_em timestamptz default now()
);

create table arquivos_processados (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  nome_arquivo text not null,
  banco text not null,
  mes_referencia char(7),
  total_transacoes int,
  processado_em timestamptz default now(),
  unique(household_id, nome_arquivo)
);
```

### Função de household + RLS
```sql
create or replace function get_household_id() returns uuid as $$
  select household_id from household_members where user_id = auth.uid() limit 1
$$ language sql security definer stable;
```
RLS habilitada em todas as tabelas; políticas `FOR ALL USING (household_id =
get_household_id())` (e `WITH CHECK` igual) para `transacoes`, `regras_categoria`,
`perfil`, `arquivos_processados`; `SELECT` por household em `households`/`household_members`.

### ★ Household única semeada + trigger de cadastro
```sql
insert into households (nome) values ('Leo & Luis');   -- semente: 1 household

create or replace function handle_new_user() returns trigger as $$
begin
  insert into household_members (household_id, user_id, nome_membro)
  values ((select id from households limit 1),
          new.id,
          coalesce(new.raw_user_meta_data->>'nome_membro', 'Membro'));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
```
O cadastro no app chama `supabase.auth.signUp({ email, password, options: { data: {
nome_membro } } })`; o trigger anexa o usuário à household única.

---

## 5. Formato padronizado de transação (saída dos parsers)

```js
{
  hash,                 // dedup estável por conteúdo (§6)
  data,                 // 'AAAA-MM-DD'
  descricao,            // UPPER, espaços colapsados, sufixo de país removido
  descricaoOriginal,    // crua
  valor,                // number positivo
  banco,                // 'itau' | 'bradesco'
  pessoa,               // 'luis' (bradesco) | 'compartilhado' (itau; ajustável no Q&A)
  mesReferencia,        // 'AAAA-MM' (mês da fatura — confirmado no upload)
  parcelaAtual,         // number | null
  parcelaTotal,         // number | null
  categoria: null,      // preenchido pelo categorizador / Q&A
  ehFixo: false
}
```

---

## 6. Parsers de CSV (`src/lib/parsers/`)

Construídos **test-first** com fixtures **anonimizadas** derivadas dos arquivos reais
(`G:\Meu Drive\02_FINANCEIRO\00_FATURAS`). **Nenhum CSV real é commitado** (repo público).

### Bradesco (`bradesco.js`)
- **Encoding latin-1 / ISO-8859-1** (confirmado: mojibake `Situa��o`, `Hist�rico`).
- **Quebra de linha só `\r`** (arquivo numa linha lógica só).
- Separador `;`. Colunas: `Data;Histórico;Valor(US$);Valor(R$)`; usar **Valor(R$)** (4ª).
- **Mês/ano da fatura pelo nome** `Bradesco_DDMMYYYY_HHMMSS.csv` (`13062026` → 06/2026).
- **Ano de cada compra:** se o mês da linha > mês da fatura, é do ano anterior
  (ex. `28/11` numa fatura de junho/2026 → 28/11/2025).
- Ignorar: tudo antes do header `Data;Histórico;...`; `SALDO ANTERIOR`; **valores
  negativos** (`PAGTO ANTECIPADO PIX`); e **tudo a partir de `Total da fatura`**
  (descarta `Lançamentos programados`, `Resumo das Despesas`, `Taxas`).
- Valor: `parseFloat(s.replace(/\./g,'').replace(',','.'))` — **`/g`** obrigatório
  (senão quebra em milhares).
- Parcelas: regex `/(\d+)\/(\d+)\s*$/` no Histórico (ancorada no fim — não confunde
  `10 PASTEIS` nem `99Food`).
- `pessoa = 'luis'` (cartão do Luis).

### Itaú (`itau.js`)
- **Encoding utf-8** (remover BOM `﻿` se houver). Separador `,`.
- Colunas `data,lançamento,valor`; data já em `AAAA-MM-DD`.
- Ignorar valores `< 0` (`PAGAMENTO COM SALDO`).
- **Nome do arquivo não tem data** (`fatura-<id>.csv`) → mês de referência vem do
  upload (confirmado pelo usuário, pré-preenchido pelo mês mais frequente nos dados).
- **Limpeza de descrição (conservadora):** remover só sufixo de país
  `/(?:BRA|USA|ARG|EUR)\s*$/i` e colapsar espaços. **Não** tentar separar cidade colada
  (`*SHELLBOXRIO DE JANEIRBRA`) — manter `descricaoOriginal`. O match por palavra-chave
  funciona com a cidade colada.
- `pessoa = 'compartilhado'` por padrão (ajustável no Q&A).

### `index.js`
`parseCSV(file, banco, mesReferencia) → Promise<Transacao[]>`. Erros amigáveis:
arquivo vazio → `'Arquivo vazio ou formato inválido'`; zero transações após filtrar →
`'Nenhuma transação encontrada. Verifique se é um extrato do {banco}'`.

### ★ Hash de deduplicação (`hash.js`)
Hash de **conteúdo**, não de nome+índice (o Itaú baixa com nome aleatório; nome+índice
duplicaria ao re-baixar). Base: `banco:data:descricao:valor` + contador de ocorrência
para distinguir compras idênticas no mesmo dia. Implementação síncrona (djb2) — não
precisa ser criptográfico. `UNIQUE(household_id, hash_origem)` + INSERT com
`ON CONFLICT DO NOTHING` garante idempotência.

---

## 7. Categorizador (`src/lib/categorizador.js`)

15 categorias e dicionário `AUTO_CATEGORIAS` por palavra-chave conforme o prompt
original. `categorizarAutomatico(descricao, regras)`:
1. regras salvas (`regras_categoria`) → 2. palavras-chave → 3. `null` (vai pro Q&A).

`parcela_atual/total` são **metadados** — a categoria continua sendo a do
estabelecimento (a categoria `parcelamento` só se o usuário escolher).

---

## 8. Analisador (`src/lib/analisador.js`)

**Função pura** `analisar(transacoes, perfil) → análise` com: resumo (renda, gastos,
saldo, taxa de poupança), `porCategoria`, `porPessoa`, fixos vs variáveis,
`parcelamentos` ativos, top 10, `alertas`, `score` 0–100 e `recomendacoes`. Regras de
score conforme o prompt. Testada isoladamente com dados sintéticos.

---

## 9. Hooks de dados + tempo real

- `useAuth` — sessão, `householdId`, `nomeMembro`, `signIn`, `signUp`, `signOut`.
- `useTransacoes` — transações do mês, `pendentes` (sem categoria), `salvarTransacoes`
  (INSERT on-conflict-do-nothing), `atualizarCategoria`, `mesReferencia`/setter, e
  **subscription `postgres_changes`** em `transacoes` filtrada por `household_id`
  (INSERT/UPDATE/DELETE atualizam o estado → React re-renderiza Q&A e dashboard).
- `usePerfil` — `perfil` (upsert em `perfil`).
- Passo manual: habilitar Realtime/replicação em `transacoes` e `regras_categoria`.

---

## 10. Telas e rotas (SPA, `base:/financas/`)

`/` Login/Cadastro → redireciona logado para `/dashboard`. Protegidas por
`ProtectedRoute`: `/dashboard`, `/upload`, `/categorizar` (badge de pendentes),
`/relatorio`, `/configuracoes`. Layout: sidebar (desktop) / bottom-nav (mobile,
mobile-first 390px). `public/404.html` = cópia do `index.html`.

- **Upload:** banco + (Itaú) de quem é + **seletor de mês de referência pré-preenchido**;
  preview "X encontradas · Y já processadas · Z novas · W auto-categorizadas".
- **Q&A:** card por transação pendente, "De quem foi?" (default Compartilhado no Itaú),
  grade de categorias, opção "salvar regra"; cards somem em tempo real.
- **Dashboard/Relatório:** cards de resumo, doughnut por categoria, barras Leo×Luis,
  alertas, recomendações, tabela de parcelamentos, top 10. Navegação por mês.
- **Configurações:** renda (salários + dia), contas fixas (pré-populadas), metas, conta.

---

## 11. PWA

`vite-plugin-pwa` (registerType autoUpdate) com manifest (`scope`/`start_url`
`/financas/`, theme `#0f766e`), ícones 192/512 gerados de um SVG fonte, e meta tags
`apple-mobile-web-app-*`. **Instalável no iPhone no v1.** Banner de instruções iOS e
presença ficam para v2.

---

## 12. Setup manual (Leo faz no painel — guiado na implementação)

1. ✅ Chave publicável obtida; URL `https://kwtmychtpviwbbgwbict.supabase.co`.
2. Rodar o SQL (gerado na implementação) no SQL Editor.
3. Habilitar Realtime em `transacoes` e `regras_categoria`.
4. Criar as 2 contas pela tela de cadastro do app (ou no painel Auth).

---

## 13. Regras gerais

PT-BR em toda a UI; valores `R$ 1.234,56`; datas `DD/MM/AAAA`; nunca apagar dados (só
INSERT on-conflict-do-nothing / UPDATE de categoria); comentários em português;
mobile-first; erros do Supabase traduzidos para mensagem amigável; loading states em
toda operação assíncrona.

---

## 14. Riscos e pontos de atenção

- **Parsers são a parte mais frágil** (encoding, `\r`, inferência de ano, descrição
  colada). Mitigação: TDD com fixtures reais anonimizadas.
- **Mês de referência vs data da compra:** parcelas datadas de meses anteriores entram
  na fatura atual. Resolvido com `mes_referencia` = mês da fatura, confirmado no upload.
- **Dedup ao re-baixar:** resolvido com hash de conteúdo.
- **GitHub Action commitando build:** gera commits de artefato em cada push (aceitável,
  igual ao padrão `refresh-meta`).
