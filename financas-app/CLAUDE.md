# CLAUDE.md — moreno.arq.br/financas

> Este arquivo define as regras de arquitetura e convenções do projeto.
> Leia antes de criar qualquer arquivo ou pasta.

---

## Contexto do projeto

PWA de gestão financeira pessoal para dois usuários (Leo e Luis).
Hospedado em `moreno.arq.br/financas` via GitHub Pages.
Importa extratos bancários em CSV do Itaú e Bradesco.
Suporta uso simultâneo em tempo real pelos dois usuários.

---

## Stack — NÃO alterar sem instrução explícita

| Camada | Tecnologia |
|---|---|
| Frontend | React (PWA) |
| Backend | **Supabase** (BaaS) — substitui qualquer backend tradicional |
| Banco de dados | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Realtime | Supabase Realtime |
| Hospedagem | GitHub Pages |

**O Supabase já é o backend. Não criar pasta `back-end/`, `server/`, `api/` ou qualquer equivalente.**

---

## Estrutura de pastas obrigatória

```
financas/
├── public/
│   └── manifest.json
├── src/
│   ├── components/       ← componentes React reutilizáveis
│   ├── pages/            ← telas da aplicação
│   ├── hooks/            ← custom hooks (ex: useTransactions)
│   ├── utils/
│   │   ├── parsers/      ← lógica de parsing dos CSVs (Itaú, Bradesco)
│   │   └── formatters/   ← formatação de moeda, datas, etc.
│   └── lib/
│       └── supabase.js   ← único ponto de instância do cliente Supabase
├── supabase/
│   └── migrations/       ← apenas arquivos SQL de migração
├── CLAUDE.md             ← este arquivo
├── .env.example
└── package.json
```

---

## Regras obrigatórias

1. **Antes de criar qualquer arquivo**, verificar se já existe algo equivalente na estrutura atual.
2. **Não criar pastas fora da estrutura acima** sem perguntar primeiro.
3. **Todo acesso ao Supabase** deve passar por `src/lib/supabase.js` — nunca instanciar o cliente diretamente em componentes.
4. **Lógica de parsing de CSV** fica exclusivamente em `src/utils/parsers/`. Um arquivo por banco: `itau.js` e `bradesco.js`.
5. **Não instalar bibliotecas novas** sem informar antes qual problema resolve e por que a stack atual não resolve.
6. **Variáveis de ambiente** nunca hardcoded — sempre via `.env` e prefixo `VITE_`.
7. **Nomes de arquivos**: camelCase para JS/JSX, kebab-case proibido em componentes React.

---

## Convenções de código

```js
// Instância do Supabase — só aqui
// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)
```

```js
// Parser de CSV — padrão esperado
// src/utils/parsers/itau.js
export function parseItauCSV(rawText) {
  // retorna array de { data, descricao, valor, tipo }
}
```

---

## Banco de dados — tabelas principais

| Tabela | Descrição |
|---|---|
| `transactions` | Lançamentos financeiros importados |
| `categories` | Categorias personalizadas |
| `imports` | Histórico de importações de CSV |

Row Level Security (RLS) ativado em todas as tabelas.

---

## O que NÃO fazer

- ❌ Criar pasta `backend/`, `server/`, `api/`, `node-api/` ou similar
- ❌ Criar segunda instância do Supabase client
- ❌ Colocar lógica de negócio diretamente em componentes de página
- ❌ Usar `localStorage` para dados financeiros (usar Supabase)
- ❌ Fazer fetch direto para APIs externas sem passar por Supabase Edge Functions
- ❌ Criar arquivos de configuração duplicados (dois `vite.config.js`, dois `package.json`, etc.)
