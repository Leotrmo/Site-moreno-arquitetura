# Plano 5 — Upload + Categorizar (Q&A) + Tempo Real

**Data:** 2026-06-17
**Status:** Design aprovado — pronto para o plano de implementação
**Autor:** Leo (brainstorming com Claude Code)
**Spec mãe:** [`2026-06-15-sistema-financeiro-design.md`](2026-06-15-sistema-financeiro-design.md) (§5 formato de transação, §6 parsers/hash, §7 categorizador, §9 hooks/realtime, §10 telas, §13 regras gerais)

---

## 1. Escopo deste plano

Fatia do sistema financeiro Leo & Luis (`moreno.arq.br/financas`). Planos 1–4 já no ar
(login, cadastro, shell sidebar/bottom-nav, 5 rotas protegidas). Este plano entrega o
**ciclo de entrada de dados em tempo real**:

1. **Upload** de extrato CSV (Itaú/Bradesco) com deduplicação e preview.
2. **Categorizar (Q&A)** das transações pendentes, com sincronização em tempo real entre
   os dois usuários.
3. **Badge de pendentes** no item `/categorizar` da navegação (adiado do Plano 4).

Fica para depois: Dashboard/Relatório (Plano 6), Configurações completas (Plano 6).

A **lógica pura já existe e é reusada, não reescrita**: `parseCSV(file, banco,
mesReferencia)` (`src/lib/parsers/index.js`), `categorizarAutomatico(descricao, regras)`
(`categorizador.js`), `CATEGORIAS` (15, `categorias.js`), `finalizar`/`hashTransacao`
(`hash.js`). **Zero dependências novas** — os parsers fazem parsing próprio (PapaParse
não é usado) e o realtime usa o `supabase` já existente.

---

## 2. Decisões travadas neste brainstorming

| # | Decisão | Escolha |
|---|---------|---------|
| D1 | Escopo de "pendentes" e do badge | **Global** (todos os meses, `categoria IS NULL`) |
| D2 | "De quem foi?" no Q&A para o Bradesco | **Ajustável** em todo card (default Luis no Bradesco, Compartilhado no Itaú) |
| D3 | Auto-categorizadas no Q&A | **Toggle de revisão no Q&A** (requer coluna `categoria_auto`) |
| D4 | Estratégia de estado | **Carregar tudo** do household + seletores derivados em memória |
| D5 | Confirmação no card do Q&A | **Tocar na categoria já confirma** (opção 1; "de quem" pré-marcado) |

---

## 3. Arquitetura de estado — `TransacoesProvider`

Um único context (espelho do `AuthContext`) envolve o `Shell` protegido em `App.jsx`.
Carrega **todas** as transações do household uma vez e mantém **uma** subscription
realtime; tudo o mais é derivado client-side. Justificativa de D4: pendentes/badge são
globais; carregar tudo evita 2–3 queries + 2–3 reconciliações de realtime separadas, e
o volume para 2 pessoas é pequeno. Query por mês fica anotada como otimização futura
(YAGNI por ora).

`App.jsx`:
```
<Route element={<ProtectedRoute><TransacoesProvider><Shell/></TransacoesProvider></ProtectedRoute>}>
```

`Shell` (badge), `Upload` e `Categorizar` consomem o mesmo `useTransacoes()`.

### Contrato do `useTransacoes`
```
// estado / derivados
transacoes              // todas do household (shape snake_case do banco)
pendentes               // categoria === null (global)        -> fila do Q&A + badge
autoRevisaveis          // categoria_auto === true            -> modo "revisar" do Q&A
hashesExistentes        // Set<hash_origem>                   -> preview do Upload
transacoesDoMes(mes)    // filtro client-side (alimenta o Plano 6)
mesReferencia, setMesReferencia
regras                  // regras_categoria do household
loading, erro

// ações
salvarTransacoes(linhas)              // upsert onConflict('household_id,hash_origem') ignoreDuplicates
atualizarCategoria(id, { categoria, pessoa })  // tambem seta categoria_auto = false
salvarRegra({ chave, categoria, pessoaPadrao }) // upsert onConflict('household_id,chave')
```

### Tempo real
`postgres_changes` em `transacoes` filtrado por `household_id`. INSERT/UPDATE/DELETE
fazem **patch por `id`** no array local (idempotente — o upload do próprio usuário e o
eco do realtime convergem sem duplicar). Autorização pela sessão logada (RLS via
`get_household_id()`). `replica identity full` (já configurado no Plano 3) garante que
DELETE traga `old.id` e que a coluna nova flua sem reconfiguração.

---

## 4. Mudança de schema (1 coluna)

D3 exige distinguir "categoria escolhida pelo robô" de "confirmada por humano":

```sql
ALTER TABLE transacoes ADD COLUMN categoria_auto boolean NOT NULL DEFAULT false;
```

Semântica:
- **Upload:** `categorizarAutomatico` retorna categoria → `categoria = X, categoria_auto = true`;
  retorna null → `categoria = null, categoria_auto = false` (pendente).
- **Q&A (humano confirma/corrige):** `categoria_auto = false` (sai da revisão).

Três estados resultantes:
- `categoria IS NULL` → **pendente** (fila padrão do Q&A; conta no badge).
- `categoria IS NOT NULL AND categoria_auto = true` → **auto, revisável** (só no modo revisão; não conta no badge).
- `categoria IS NOT NULL AND categoria_auto = false` → **confirmado**.

---

## 5. Helpers puros novos — TDD (`node --test`, roda local)

A lógica de parse/categoria/hash já é testada. O novo e puro:

### `prepararUpload({ parsed, hashesExistentes, regras, householdId, deQuemItau, arquivoOrigem, autoCategorizar })`
Coração do upload. Retorna `{ linhas, resumo }`:
- mapeia cada transação **camelCase → snake_case** (`hash`→`hash_origem`,
  `descricaoOriginal`→`descricao_original`, `mesReferencia`→`mes_referencia`,
  `parcelaAtual`→`parcela_atual`, `parcelaTotal`→`parcela_total`, `ehFixo`→`eh_fixo`,
  `householdId`→`household_id`, `arquivoOrigem`→`arquivo_origem`);
- aplica `categorizarAutomatico(descricao, regras)` quando `autoCategorizar` (default
  true), definindo `categoria` + `categoria_auto`; quando desligado, força
  `categoria = null, categoria_auto = false`;
- aplica o "de quem" do Itaú (`deQuemItau`) sobre `pessoa` das linhas do Itaú; Bradesco
  mantém `luis`;
- `resumo = { encontradas, jaProcessadas, novas, autoCategorizadas }`, onde
  `jaProcessadas` = hash já em `hashesExistentes`, `novas` = resto,
  `autoCategorizadas` = novas com `categoria != null`.

Salvamento upserta **todas** as `linhas` (ON CONFLICT DO NOTHING dedup as já
processadas) — idempotente.

### `derivarChave(descricao)`
Chave da regra a partir da descrição (≈2 primeiras palavras significativas, UPPER),
compatível com o `desc.includes(chave)` do `categorizarAutomatico`.

UI, provider e realtime → **verificação ao vivo** (sem dev server local).

---

## 6. Deduplicação — comportamento (subir parcial vs. fatura fechada)

O hash é de **conteúdo**: `banco:data:descricao:valor:ocorrencia` (`hash.js`). **Não**
inclui nome de arquivo, posição, nem `mes_referencia`. Consequências para o uso diário:

- Subir uma **parcial** (fatura aberta) e depois a **fechada** completa: as linhas já
  efetivadas são reconhecidas (preview "N já processadas") e só as novas entram. Vale
  mesmo com o **nome aleatório** do arquivo do Itaú.
- **Mês de referência não entra no hash** → escolher mês diferente não duplica. Porém o
  mês é gravado no **primeiro** INSERT e **não é sobrescrito** na re-subida (ON CONFLICT
  DO NOTHING) → acertar o mês na primeira subida.
- **Contador de ocorrência** distingue compras idênticas no mesmo dia (ex.: dois cafés
  R$ 5) → a 2ª aparição é tratada como nova só quando realmente é a 2ª.

Limitações honestas (poucas transações):
1. **Pendente → efetivada com descrição/valor diferente** (conversão de moeda, gorjeta,
   nome temporário): vista como nova; fica a pendente antiga + a definitiva.
2. **Bradesco**, parcial e fechada baixadas em **meses diferentes**: o ano deduzido do
   nome do arquivo pode mudar para compras na janela de virada → vistas como novas.
   Itaú não tem esse risco (data completa no arquivo).
3. **v1 nunca apaga** (só INSERT/UPDATE de categoria) → uma duplicata-fantasma dos casos
   1/2 é ignorada/categorizada manualmente; "apagar/mesclar" fica para um plano futuro.

---

## 7. Tela Upload

Seletor de **arquivo** + **banco** (`itau`/`bradesco`) + (só Itaú) **"de quem"** +
**seletor de mês de referência** pré-preenchido pelo mês mais frequente nas transações
parseadas. Toggle **"categorizar automaticamente"** (ligado por padrão; desligado manda
o arquivo inteiro para o Q&A). Fluxo: parse → **preview** "X encontradas · Y já
processadas · Z novas · W auto-categorizadas" → botão **Salvar** → `salvarTransacoes` +
registro em `arquivos_processados` (`onConflict(household_id,nome_arquivo) do nothing`).
Loading states e erros amigáveis (mensagens dos parsers para arquivo vazio / zero
transações).

---

## 8. Tela Categorizar (Q&A)

- Card por **pendente** (global): descrição, valor `R$ 1.234,56`, data `DD/MM/AAAA`,
  banco.
- **"De quem foi?"** ajustável em **todo** card (D2): Itaú pré-marca Compartilhado,
  Bradesco pré-marca Luis; ambos mutáveis.
- **Grade das 15 categorias.** Tocar numa categoria **confirma** (D5): chama
  `atualizarCategoria(id, { categoria, pessoa })` (seta `categoria_auto = false`) e o
  card **some em tempo real** (some também na tela do parceiro).
- Checkbox **"salvar regra"**: ao confirmar, chama `salvarRegra` com `derivarChave`.
- Toggle **"revisar auto-categorizadas"** no topo: ligado, a fila também inclui
  `autoRevisaveis` (categoria atual pré-marcada; confirmar/corrigir remove da revisão).
- **Estado vazio** amigável quando a fila zera.

---

## 9. Badge de pendentes na navegação

`Shell` lê `pendentes.length` do `useTransacoes` e renderiza um badge no item
`/categorizar` (sidebar **e** bottom-nav) quando `> 0`. Conta apenas `categoria IS NULL`
(trabalho obrigatório) — auto-revisáveis não entram no badge. `nav.jsx` permanece como
dados; a lógica do badge fica no `Shell`.

---

## 10. Testes & verificação

- **Local:** `npm test --prefix financas-app` (node --test) cobre os helpers puros novos
  (`prepararUpload`, `derivarChave`) somados aos 47 existentes. **Sem `node_modules`
  novos** (ambiente CI-only no Drive).
- **Ao vivo:** PR → Leo mergeia → Action builda `/financas` → recarregar para furar o
  cache do service worker → verificação com ferramentas DOM do Chrome MCP. Criar
  conta/logar é ação do Leo.

---

## 11. Passos manuais do Leo (painel Supabase)

1. Rodar o `ALTER TABLE transacoes ADD COLUMN categoria_auto ...` (§4).
2. Confirmar que o Realtime já está habilitado em `transacoes` (e `regras_categoria`) —
   configurado no Plano 3; apenas conferir, **não re-rodar**.

---

## 12. Fora do escopo v1 (anotado, não construído)

- Auto-aplicação de `pessoa_padrao` no upload (a regra grava o campo, mas só a categoria
  é auto-aplicada por ora).
- Toasts "Luis categorizou X"; indicador de presença online.
- Dashboard/Relatório e Configurações completas (Plano 6).
- Botão manual de apagar/mesclar duplicatas-fantasma.
