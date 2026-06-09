# Exibir o moveset recomendado — design

**Data:** 2026-06-09
**Spec-mãe:** `2026-06-07-pokemon-meta-competitivo-design.md` (camada de meta competitivo, Fases 0–4)

## 1. Problema

A UI diz "falta o moveset recomendado" (card: razão da ação Ensinar/TM; detalhe: bloco
Competitivo) sem nunca dizer **quais** golpes são os recomendados. O usuário não tem como
agir sobre a recomendação sem consultar o PvPoke por fora. O dado já está carregado no
navegador (`e.pvpMeta[liga].moveset` vindo do PvPoke; `e.pveMeta.bestMoveset` calculado
do Game Master) — só não é exibido.

A única exceção hoje é a ação Aguardar Evento, que nomeia o golpe legado faltante — mas em
inglês humanizado (`_humanMove`: "Close Combat"), enquanto toda a UI e a coleção do jogo
estão em português.

## 2. Decisões (brainstorming 2026-06-09)

1. **Idioma:** português com acentos, igual ao jogo ("Lança-chamas"). Fonte: i18n PT dos
   PokeMiners, que o build já baixa.
2. **Onde:** card **e** detalhe. No card, a razão da ação nomeia o(s) golpe(s) faltante(s);
   no detalhe, o bloco Competitivo lista o moveset recomendado completo, sempre (com ou sem
   pendência), marcando o que o mon já tem.

## 3. Dados (build)

`moves.json` ganha `namePt` por golpe:

```json
"FLAMETHROWER": { "type": "fire", "kind": "charge", "pvp": {...}, "pve": {...}, "namePt": "Lança-chamas" }
```

- `buildMovesPt` (transform.js) já pareia `moveId` ↔ nome PT cru ao varrer os templates
  `COMBAT_V####_MOVE_` + i18n (`move_name_####`); hoje guarda só o mapa normalizado
  (nome sem acento → moveId) e descarta o nome de exibição. Passa a **retornar também**
  `namesPt: { moveId → nome PT cru }` (pré-normalização, com acentos/hífens).
- `refresh-meta.js` faz o merge de `namesPt` nas entradas de `moves.json` (que vêm do
  gamemaster do PvPoke via `buildMoves` — fontes diferentes, por isso merge no
  orquestrador, não dentro de `buildMoves`).
- O mapa `moves_pt.json` (normalizado → moveId, usado pelo casamento) **não muda**.
- Cobertura PT ≈ 97,8%; golpes sem `namePt` caem no fallback do runtime (§4).
- Datasets regenerados no mesmo PR; a GitHub Action `refresh-meta.yml` mantém daí em diante.

## 4. Montagem (analysis.js)

- Helper `_moveName(id, meta)` → `meta.moves[id].namePt`, senão `_humanMove(id)`
  (fallback inglês p/ os ~2% sem nome PT e p/ `meta.moves` ausente).
- `analyze` anexa visões prontas pra exibição, logo após preencher `e.pvpMeta`/`e.pveMeta`
  (é no `analyze` que eles deixam de ser null; render não conhece `meta`):
  - `e.pvpMeta[liga].movesetView` = `[{ name, has }]` na ordem do moveset recomendado
    (rápido, carregado1, carregado2?), `has` = mon tem o golpe (`e.moveIds`).
    Só pra ligas `isMeta` com `moveset` não-nulo; senão `null`.
  - `e.pveMeta.movesetView` = idem para `bestMoveset` (rápido, carregado); `null` se
    `bestMoveset` nulo.
- `computeAction` (e os auxiliares `_pveAction`/`_notReadyAction`) ganham um parâmetro
  `meta` **opcional** — `computeAction` é função pura chamada sem `meta` pelos testes
  existentes; sem ele, os nomes caem no fallback inglês.
- Razões de ação passam a nomear o que falta (apenas texto; o `kind` e a lógica de
  decisão não mudam):
  - **Ensinar/TM (PvP)**: `"Ensinar/TM p/ <liga> — Top <N>, falta <golpes>"` onde
    `<golpes>` = golpes recomendados que o mon não tem, na ordem do moveset, unidos por
    " e " (2) ou ", " + " e " (3). Critério de "falta" segue o `movesetOk` da liga: lista
    o rápido se não o tem, e os carregados que não tem se não tem **nenhum** deles.
  - **Ensinar/TM (PvE)**: idem com `bestMoveset` (precisa dos dois golpes; lista os que
    faltam): `"Ensinar/TM p/ <papel> (<tipo>)<rank> — falta <golpes> (estimativa)"`.
  - **Aguardar Evento**: troca `_humanMove(leg)` por `_moveName(leg, meta)` —
    `"…precisa do golpe legado \"Psíquico\"; espere Dia Comunitário / Elite TM"`.

## 5. Exibição (render.js)

Bloco Competitivo do detalhe:

- Linha de liga PvP (quando `movesetView` existe): substitui o trecho
  `moveset recomendado ✓` / `falta o moveset recomendado` por
  `recomendado: Contra-ataque ✓ · Soco de Gelo ✓ · Soco Dinâmico (falta)`.
  Sem `movesetView`, mantém o texto atual (fallback).
- Linha PvE: idem com os 2 golpes do `bestMoveset`, mantendo o rótulo "(estimativa)" da
  linha. Sem `movesetView`, mantém o texto atual.
- Render lê apenas `movesetView`; nenhum acesso a `meta`/`moves.json` (fronteira atual
  preservada).

## 6. O que NÃO muda

- Nenhuma tag, verdict, `kind` de ação ou limiar — só textos e exibição.
- Invariante §12.2 do spec-mãe (mon meta nunca TRANSFERIR) intocado.
- `movesetOk` (PvP e PvE), `match.js`, `pvp.js`/`pve.js` (motores) intocados; mudança de
  motor = zero (a visão é montada no analysis a partir do que `evalMon` já expõe).
- `moves_pt.json` e o casamento PT→moveId intocados.

## 7. Casos de borda

- Golpe sem `namePt` (cobertura 97,8%): fallback `_humanMove` (inglês humanizado).
- `meta.moves` ausente (datasets não carregados): camada de meta inteira já não roda; sem
  caminho novo.
- Liga `isMeta` com `moveset` nulo (defensivo): `movesetView = null`, render mantém texto
  atual.
- Moveset com 2 carregados onde o mon tem só 1: `movesetOk` = true ⇒ a ação Ensinar/TM
  não dispara, mas no detalhe o carregado ausente ainda aparece com `(falta)`.
  **Decisão:** o marcador por golpe é binário — `✓` (tem) ou `(falta)` (não tem) —
  independente do `movesetOk`. É informação, não pendência: a ausência da ação Ensinar/TM
  já comunica que o moveset funciona. Sem estado intermediário.
- sw cache: bump v13 → v14 (moves.json e libs mudam).

## 8. Testes (TDD, padrão do projeto)

- `transform.test.js`: `buildMovesPt` retorna `namesPt` com nome cru ("Lança-chamas"
  com acento); merge no `refresh-meta` coberto por teste do orquestrador ou inspeção
  do dataset gerado.
- `verdict.test.js`: `movesetView` PvP e PvE via `analyze` (ordem, `has`, `null` quando
  sem moveset — é no `analyze` que a visão é anexada); razões Ensinar/TM nomeiam golpes
  faltantes (PvP 1 golpe, PvP 2+ golpes com conjunção, PvE); Aguardar Evento em PT;
  fallback inglês quando sem `namePt`.
- `render.test.js`: linha de liga com `✓`/`(falta)`; fallback para texto atual sem
  `movesetView`.

## 9. Verificação

Suite Node completa verde **e** verificação no navegador (lição da Fase 4: `app.js` é
wiring não-coberto por teste — abrir a página real, conferir card com golpe nomeado e
bloco Competitivo com ✓/(falta) na coleção real de 592 mons).
