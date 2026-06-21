# /pokemon — Fase 2: Importar a coleção do SpooferPro direto no app (design)

**Data:** 2026-06-20
**Status:** aprovado no brainstorm (aguardando revisão do spec escrito)
**Base:** `origin/main` (já com PR #46 / Fase 1 de UI mergeado — SW `v23`, `app.js` 329 linhas)

---

## 1. Problema / dor

Hoje, para atualizar a coleção, o Leo:

1. Exporta o JSON do SpooferPro (no iPhone) → gera um arquivo `Pokemons-LeoTrevisan-DD-MM-YYYY.json`.
2. Abre o arquivo e **copia todo o conteúdo**.
3. Abre o GitHub no celular, edita o `pokemon/colecao.json`, **apaga tudo e cola** o novo.
4. Commita.

É manual, frágil e passa pelo GitHub. **Objetivo da Fase 2:** exportar do SpooferPro e
**importar direto no web app** (no celular), acabando com o passo do GitHub. **De brinde**,
mostrar na hora um **resumo do que mudou** (novos/transferidos/fortalecidos) desde o último
import — possível porque cada Pokémon tem um id estável no JSON (ver §4.1b).

## 2. Decisão central: local, sem backend

A Fase 2 resolve **100% local no aparelho** — sem Supabase, sem auth, sem rede. Motivos:

- Resolve a dor inteira (importar sem editar o `colecao.json` no GitHub) sem servidor.
- Mantém o PWA funcionando **offline**.
- **Não antecipa a Fase 3** (Supabase + dois usuários Leo/Luis com coleção por pessoa),
  que é explicitamente o escopo seguinte.
- **Não é trabalho jogado fora:** a parte difícil (parse + validação) é pura e
  reutilizável; a Fase 3 só troca o *backend de armazenamento* (localStorage → Supabase)
  atrás de um wrapper de 3 funções.

## 3. Constatação que simplifica tudo: sem adapter

O `colecao.json` versionado **já é** o export do SpooferPro — mesmas chaves de topo
(`fileName`, `exportTime`, `pokemonCount`, `version`, `fileData`, `fileType`,
`exportTimestamp`) e mesmo shape de cada Pokémon em `fileData[<id>]`
(`mon_name`, `mon_cp`, `mon_number`, `mon_attack`, `mon_defence`, `mon_stamina`,
`mon_height`, `mon_isShiny`, `mon_move_1/2/3`, `mon_form`, `mon_isLucky`, …).

O `colecao.json` no repo é só esse export **renomeado na mão** ao commitar. Portanto o
import **não precisa transformar nada**: basta **validar** o shape e **guardar o objeto
como veio**. O nome do arquivo escolhido é irrelevante — lemos o conteúdo, não o nome.

## 4. Arquitetura

### 4.1 Módulo puro novo: `pokemon/lib/import.js`

Segue o **padrão de módulo dual** (Node `require` nos testes + global no browser), como os
outros `lib/*.js`. Expõe `parseCollection`:

```js
parseCollection(text) -> {
  ok: boolean,
  data?: object,     // o objeto de coleção completo (shape do colecao.json), quando ok
  summary?: { count: number, exportTime: string, fileName: string },
  error?: string,    // mensagem em PT quando !ok
}
```

Responsabilidade única: receber uma **string** (de arquivo ou de textarea), `JSON.parse`,
validar o shape e resumir. **Pura e testável** com `node --test`. Não toca DOM, storage
nem rede.

> `summary.count` = `Object.keys(fileData).length` (contagem real das entradas), **não** o
> campo `pokemonCount` do topo — eles divergem (o export atual tem `pokemonCount: 723` mas
> 722 ids únicos). Confiamos no que está realmente em `fileData`.

### 4.1b Diff entre snapshots: `diffCollections` (no mesmo módulo)

Como cada Pokémon tem um **id estável** (a chave em `fileData`, o id interno do Pokémon GO),
dá pra detectar o que mudou **comparando dois snapshots completos** — sem merge de storage.

```js
diffCollections(oldData, newData) -> {
  novos: number,         // id presente no novo, ausente no antigo
  transferidos: number,  // id presente no antigo, ausente no novo
  fortalecidos: number,  // mesmo id, mon_cp maior no novo
}
```

Pura e testável. Detecta de forma **limpa**: novos, transferidos, fortalecidos.
**Evoluídos ficam de fora** — o Pokémon GO troca o id ao evoluir, então uma evolução
aparece como "1 transferido + 1 novo"; ligar os dois exigiria heurística frágil, não vale.
**Defensivo:** se não houver snapshot anterior (1º import), pula o diff e marca "primeira
importação". Se os ids não baterem (improvável), o diff degrada para "tudo novo/tudo
transferido" — visível na hora.

### 4.2 Wrapper de armazenamento (browser)

Três funções finas, isolando o backend:

- `saveCollection(data)` — grava o objeto de coleção.
- `loadStoredCollection()` — devolve o objeto guardado, ou `null` se não houver.
- `clearStoredCollection()` — apaga o guardado (volta pro `colecao.json` versionado).

**Backend escolhido: `localStorage`** (chave `pokemon-colecao`). O blob atual tem ~362 KB
para 723 Pokémon — cabe folgado no teto de ~5 MB do `localStorage`, e é a opção "vanilla e
simples" coerente com o projeto (sem libs, sem boilerplate de IndexedDB). Como a Fase 3
troca esse wrapper por Supabase de qualquer forma, não compensa pagar o custo do IndexedDB
agora. As 3 funções isolam essa decisão.

> Onde mora o wrapper: pode ficar em `app.js` (browser-only, ~10 linhas) ou num
> `lib/store.js` mínimo. Detalhe a resolver no plano; o importante é a fronteira de 3 funções.

### 4.3 Mudança no `boot()` (`app.js`)

Hoje:

```js
const res = await fetch('./colecao.json', { cache: 'no-store' });
const data = await res.json();
```

Passa a ser (precedência: importado > versionado):

```js
const data = loadStoredCollection()
  || await (await fetch('./colecao.json', { cache: 'no-store' })).json();
```

Tudo a jusante (`analyze`, contagens, chips, render, ordenação) **não muda**, porque o shape
é idêntico. O `colecao.json` versionado continua sendo a **semente do 1º uso / fallback**
(e o fallback offline do SW continua valendo).

## 5. UX do painel de import

- **Ponto de entrada:** ícone **📥 no cabeçalho**, perto do bloco "Leo · <data> / 723
  Pokémons" (`#updated` / `#total`). Sempre alcançável, não ocupa a lista nem a barra de
  modo (Resumo/Limpar/Usar/Investir).
- **Painel** (modal / bottom-sheet) com:
  - Botão **"Escolher arquivo .json"** → `<input type="file" accept=".json,application/json">`.
  - Link **"ou colar JSON"** → revela um `<textarea>` + botão "Usar texto colado" (reserva
    para quando o file picker do iOS não cooperar).
- **Ao escolher arquivo ou colar** → `parseCollection(text)`:
  - **Inválido** → mostra `error` inline em PT; **mantém a coleção atual** (nada é
    destruído).
  - **Válido** → **passo de prévia/confirmação** (segurança, porque substitui tudo), já com
    o **resumo de mudanças** (`diffCollections` contra a coleção atual):
    > Arquivo: **Pokemons-LeoTrevisan-16-06-2026** · **722 Pokémon** · exportado **16 jun.**
    > Comparado com a coleção atual: **+12 novos**, **−5 transferidos**, **3 fortalecidos**
    > Substituir a coleção atual (**722**)?  **[Confirmar]**  **[Cancelar]**

    (No 1º import, sem coleção anterior pra comparar, mostra "primeira importação" no lugar
    da linha de mudanças.)
- **Confirmar** → `saveCollection(data)` → re-roda o carregamento/`analyze` → fecha o painel;
  lista, contagens, chips e o cabeçalho (`#updated`/`#total`) atualizam com os novos dados.
- **Cancelar** → fecha sem mudar nada.
- **"Restaurar padrão"** (link discreto no painel) → `clearStoredCollection()` → recarrega
  do `colecao.json` versionado. Recuperação caso um import dê errado.

### Semântica: substituição total (com histórico via diff, não merge)

Cada export do SpooferPro é a coleção **completa**. Import = **substituição total** do que
é guardado, não merge. Isso espelha o fluxo manual de hoje ("apaga tudo e cola o novo") e é
mais simples.

O desejo de **histórico** (saber o que foi novo/transferido/fortalecido) **não exige merge**:
os ids estáveis deixam `diffCollections` comparar o snapshot anterior com o novo e produzir
esse resumo. Guardamos só o snapshot novo inteiro; o "o que mudou" é computado, mostrado na
confirmação e descartado (sem log persistente — isso seria a opção de histórico persistente,
deixada para uma fase futura).

## 6. Validação (`parseCollection`)

Rejeita, com mensagem clara em PT, quando:

- o texto **não é JSON** válido;
- **falta `fileData`**, ou `fileData` não é objeto;
- `fileData` está **vazio** (0 entradas);
- as entradas **não parecem Pokémon** — amostra das entradas sem os campos núcleo
  (`mon_name`, `mon_cp`, `mon_number`).

Caso contrário: `ok: true`, devolve `data` (objeto completo) + `summary`
(`count` = nº de entradas em `fileData`; `exportTime` e `fileName` lidos do topo, com
defaults seguros se ausentes).

## 7. Service Worker / cache / boot

Mexe em assets **cache-first** (`app.js`, `index.html`) e adiciona arquivo servido novo
(`lib/import.js`). Pela regra de ouro do `CLAUDE.md`:

1. **Bump** `CACHE` em `sw.js`: `pokemon-leo-v23` → `pokemon-leo-v24`.
2. Adicionar `'./lib/import.js'` à lista `ASSETS` do `sw.js`.
3. Adicionar `<script src="lib/import.js"></script>` no `index.html` **antes** de `app.js`
   (e na ordem certa de dependências — `import.js` não depende de outros `lib`, então basta
   estar antes de `app.js`).

`colecao.json` continua **network-first** no SW (sem mudança). O armazenamento importado
(`localStorage`) não passa pelo SW; é lido em JS no boot.

## 8. Testes

- **`pokemon/test/import.test.js`** (`node --test`) cobrindo `parseCollection`:
  - válido → `ok`, `summary.count` correto, `data` preservado;
  - JSON quebrado → `!ok` + mensagem;
  - sem `fileData` → `!ok`;
  - `fileData` vazio → `!ok`;
  - entrada-lixo (sem `mon_name`/`mon_cp`/`mon_number`) → `!ok`.
- **Mesmo arquivo** cobrindo `diffCollections`:
  - id novo → conta em `novos`;
  - id sumido → conta em `transferidos`;
  - mesmo id com `mon_cp` maior → conta em `fortalecidos`;
  - mesmo id sem mudança de CP → não conta;
  - `oldData` ausente/null → diff "primeira importação" (sem erro).
- O wrapper de storage é browser-only (`localStorage`); mantido fino. Se valer, testar com
  um shim de `localStorage` em Node; senão, fica como wiring de browser verificado ao vivo.
- **Não rodar `npm install`** (quebra no Drive). Testes = `node --test` em `pokemon/`.

## 9. Verificação ao vivo (mobile)

- Verificar no navegador (não só Node): abrir o painel via 📥, importar um `.json` de
  exemplo, confirmar que a lista/cabeçalho atualizam e que o "Restaurar padrão" volta ao
  versionado.
- Gotcha conhecido do projeto: navegação por hash não recarrega doc/SW → se precisar,
  forçar reload com `?cb=...`.

## 10. Fora de escopo

- **Histórico persistente** (log de cada import ao longo do tempo + tela de histórico) — o
  diff da Fase 2 é mostrado na hora e descartado; persistir vira uma fase futura.
- **Detecção de evoluídos** (o id muda ao evoluir; só daria por heurística frágil).
- Merge incremental de coleções no storage (Fase 2 é substituição total).
- Supabase / sincronização entre aparelhos (Fase 3).
- Dois usuários (Leo + Luis) com coleção por pessoa (Fase 3).

## 11. Critérios de aceite

- [ ] No iPhone, dá pra escolher o `.json` exportado do SpooferPro e importar sem passar
      pelo GitHub.
- [ ] Import válido substitui a coleção; lista, contagens, chips e cabeçalho refletem os
      novos dados.
- [ ] A confirmação mostra o resumo de mudanças (novos/transferidos/fortalecidos) contra a
      coleção anterior — ou "primeira importação" se não houver anterior.
- [ ] Import inválido não destrói a coleção atual e mostra erro claro em PT.
- [ ] Colar JSON funciona como reserva do seletor de arquivo.
- [ ] "Restaurar padrão" volta ao `colecao.json` versionado.
- [ ] `node --test` verde, incluindo `import.test.js` (parse + diff).
- [ ] SW bumpado para `v24`, `ASSETS` e ordem de `<script>` atualizados.
