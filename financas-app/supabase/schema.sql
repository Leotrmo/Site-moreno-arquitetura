-- ============================================================================
-- Finanças Leo & Luis — Schema completo do Supabase
-- ============================================================================
-- Rode este arquivo INTEIRO no SQL Editor do painel do Supabase
-- (projeto kwtmychtpviwbbgwbict). É idempotente: pode rodar mais de uma vez
-- sem duplicar dados nem dar erro.
--
-- O que ele faz:
--   1. Cria as 6 tabelas (households, household_members, transacoes,
--      regras_categoria, perfil, arquivos_processados).
--   2. Cria a função get_household_id() usada pela RLS.
--   3. Habilita RLS e cria as políticas por household.
--   4. Semeia a household única "Leo & Luis".
--   5. Cria o trigger que anexa cada novo usuário à household no cadastro.
--   6. Habilita Realtime em transacoes e regras_categoria.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABELAS
-- ----------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Leo & Luis',
  criado_em timestamptz default now()
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  nome_membro text not null,                 -- 'Leo' | 'Luis'
  unique (household_id, user_id)
);

create table if not exists public.transacoes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  data date not null,                        -- data da compra
  descricao text not null,                   -- normalizada (UPPER, espaços colapsados)
  descricao_original text,                    -- crua, p/ exibir/depurar
  valor numeric(10,2) not null,              -- sempre positivo
  banco text not null check (banco in ('itau','bradesco')),
  pessoa text not null check (pessoa in ('leo','luis','compartilhado')),
  categoria text,
  categoria_auto boolean not null default false, -- true = categoria veio do robô (revisável no Q&A)
  eh_fixo boolean default false,
  parcela_atual int,
  parcela_total int,
  arquivo_origem text,
  mes_referencia char(7) not null,           -- 'AAAA-MM' = mês da FATURA (não da compra)
  hash_origem text not null,                 -- hash de conteúdo (dedup estável)
  criado_em timestamptz default now(),
  unique (household_id, hash_origem)
);

create table if not exists public.regras_categoria (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  chave text not null,                       -- primeiras palavras do estabelecimento
  categoria text not null,
  pessoa_padrao text,                        -- 'leo' | 'luis' | null
  unique (household_id, chave)
);

create table if not exists public.perfil (
  id uuid primary key default gen_random_uuid(),
  household_id uuid unique references public.households(id) on delete cascade,
  dados jsonb not null default '{}',         -- salarios, fixos, metas
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

-- ----------------------------------------------------------------------------
-- 2. FUNÇÃO DE HOUSEHOLD (usada por toda a RLS)
-- ----------------------------------------------------------------------------
-- security definer: roda com privilégios do dono, então ignora a RLS de
-- household_members (evita recursão infinita na política dessa tabela).
-- search_path = '' + nomes qualificados: blindagem recomendada pelo Supabase.

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

-- ----------------------------------------------------------------------------
-- 3. RLS + POLÍTICAS
-- ----------------------------------------------------------------------------

alter table public.households            enable row level security;
alter table public.household_members     enable row level security;
alter table public.transacoes            enable row level security;
alter table public.regras_categoria      enable row level security;
alter table public.perfil                enable row level security;
alter table public.arquivos_processados  enable row level security;

-- households / household_members: somente leitura da própria household.
drop policy if exists "ver a propria household" on public.households;
create policy "ver a propria household"
  on public.households for select
  using (id = public.get_household_id());

drop policy if exists "ver membros da propria household" on public.household_members;
create policy "ver membros da propria household"
  on public.household_members for select
  using (household_id = public.get_household_id());

-- Tabelas de dados: acesso total (CRUD) restrito à própria household.
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

-- ----------------------------------------------------------------------------
-- 4. SEMENTE: household única "Leo & Luis"
-- ----------------------------------------------------------------------------
-- Guardado por NOT EXISTS para não duplicar se o script rodar de novo.

insert into public.households (nome)
select 'Leo & Luis'
where not exists (select 1 from public.households);

-- ----------------------------------------------------------------------------
-- 5. TRIGGER DE CADASTRO: anexa cada novo usuário à household única
-- ----------------------------------------------------------------------------
-- O app chama supabase.auth.signUp({ email, password,
--   options: { data: { nome_membro: 'Leo' | 'Luis' } } });
-- este trigger lê esse nome_membro e cria a linha em household_members.

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

-- ----------------------------------------------------------------------------
-- 6. REALTIME em transacoes e regras_categoria
-- ----------------------------------------------------------------------------
-- replica identity full: faz os eventos UPDATE/DELETE trazerem todas as colunas
-- (necessário p/ o filtro por household_id funcionar em DELETE no front).

alter table public.transacoes       replica identity full;
alter table public.regras_categoria replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transacoes'
  ) then
    alter publication supabase_realtime add table public.transacoes;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'regras_categoria'
  ) then
    alter publication supabase_realtime add table public.regras_categoria;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 7. MIGRAÇÕES INCREMENTAIS (seguras para rodar em banco já existente)
-- ----------------------------------------------------------------------------
-- categoria_auto: marca se a categoria foi sugerida pelo robô (revisável no Q&A).
alter table public.transacoes
  add column if not exists categoria_auto boolean not null default false;

-- serie_id: liga parcelas da mesma compra (NULL = não parcelada).
alter table public.transacoes
  add column if not exists serie_id uuid;

create index if not exists idx_transacoes_serie
  on public.transacoes (household_id, serie_id);

-- lançamentos ignorados permanentemente (por hash de conteúdo).
create table if not exists public.lancamentos_ignorados (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  hash_origem text not null,
  descricao text,
  valor numeric(10,2),
  banco text,
  ignorado_por uuid references auth.users(id),
  ignorado_em timestamptz default now(),
  unique (household_id, hash_origem)
);

alter table public.lancamentos_ignorados enable row level security;

drop policy if exists "household manda em lancamentos_ignorados" on public.lancamentos_ignorados;
create policy "household manda em lancamentos_ignorados"
  on public.lancamentos_ignorados for all
  using (household_id = public.get_household_id())
  with check (household_id = public.get_household_id());

-- ============================================================================
-- FIM. Se rodou sem erro: tabelas + RLS + trigger + realtime prontos.
-- Confira em Table Editor (6 tabelas, households com 1 linha "Leo & Luis")
-- e em Database > Publications (transacoes e regras_categoria marcadas).
-- ============================================================================
