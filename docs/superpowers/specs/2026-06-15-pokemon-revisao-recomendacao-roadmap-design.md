# Revisão do algoritmo de recomendação — roadmap multi-fases

**Data:** 2026-06-15
**Página:** `/pokemon`
**Formato:** roadmap de 5 fases, cada uma resolvida numa sessão própria (spec → plano →
implementação), rodando a suíte **inteira** entre fases.

---

## 1. Contexto / o caso que disparou a revisão

O app recomendou **investir num Shadow Gyarados 15/15/15 (do Cliff) para Liga Mestre**,
justificando com "IV rank 1 (100%) para Liga Mestre". O moveset capturado é
**Cachoeira + Jato d'Água** (Waterfall + Hydro Pump — o set de *raid*, não o de PvP).

A análise crítica do código (`lib/meta/pvp.js`, `lib/meta/pve.js`, `lib/analysis.js`,
`lib/meta/match.js` + os datasets `data/*.json`) confirmou que **é um falso positivo
estrutural**, e levantou cinco frentes de correção. Este documento decompõe essas
correções em fases ordenadas por dependência.

---

## 2. Análise crítica (o "porquê" — racional durável para as fases)

### Veredito do caso Shadow Gyarados
Recomendar esse mon para **Liga Mestre só por ser "IV rank 1"** é **falso positivo**, e
estrutural. Para a maioria dos jogadores ele é um **atacante de raid de Água** (e troféu
de colecionador), **não** um investimento de Liga Mestre.

### Onde o falso positivo nasce (evidência no código)
- **"IV rank 1/4096 em Mestre" é tautologia, não sinal.** Mestre não tem CP cap;
  `bestLevelUnderCap` com cap infinito devolve o nível máximo (`pvp.js:38`) e o stat
  product é monotônico nos IVs → **todo 15/15/15 é rank 1/4096 em Mestre, para qualquer
  espécie**. O número não carrega nenhuma informação de meta da espécie.
- **O rank da espécie nunca é uma porta.** Em `pvpTags` (`pvp.js:133`), great/ultra
  gateiam por `spPct`/`ivRank` (qualidade da cópia) e master por `ivPct >= 95`
  (`pvp.js:142`, threshold em `pvp.js:16`). Em **nenhuma** liga entra `speciesRank`. Como
  as listas vão até top-80 (master) / top-100 (great/ultra), "isMeta" = "está no top-80";
  um hundo de rank 3 e um de rank 57 recebem a tag idêntica.
- **Para Sombrios o rank PvP usado é o errado.** `matchSpecies` devolve a forma base sem
  `_shadow` (`match.js:35`) → `pvp.js` lê `gyarados` (master rank **57**), enquanto
  `gyarados_shadow` é master rank **32**. O `pve.js` já sabe preferir a entrada `_shadow`
  (`pve.js:95`); o `pvp.js` não. O rank exibido para Sombrios está errado **e** nem filtra.
- **Custo é ignorado.** A ação `FORTALECER` (`analysis.js:516`) não modela: sobretaxa de
  Sombrio (+20% poeira e doce), Doce XL para nível 50 (Mestre), nem o nº de TMs / Elite TM
  necessários (o mon tem o set de raid; o set de Mestre é `DRAGON_BREATH + AQUA_TAIL +
  TWISTER` + Elite Charged TM para tirar Frustração se Sombrio).

### A ironia central
O 100% só importa de verdade em Mestre (onde a espécie é fraca). Em PvE, ponderado em
ataque, um `15/x/x` rende ~igual ao `15/15/15` — o "hundo" é quase desperdiçado no único
modo onde a espécie é útil.

### Respostas diretas aos 6 pontos
1. **Peso excessivo no IV?** Sim — confirmado: o gate é IV + "está no top-N", sem
   `speciesRank`, sem custo, sem desempenho real em Mestre, sem olhar utilidade em raids.
2. **Gyarados 100% deveria ser priorizado para quê?** **Raids/PvE** (atacante de Água;
   `gyarados_shadow` tem papéis `["pve","gym_atk"]`, bestType `water`, bestMoveset
   `[WATERFALL,HYDRO_PUMP]`). **Não** para Liga Mestre.
3. **Diferenciar por objetivo:** XP (doce barato p/ evoluir — ortogonal a IV/meta), PvP
   (rank da espécie × stat product × moveset × custo), colecionismo (flags), eficiência
   (retorno por recurso) são eixos quase ortogonais → exigem score por objetivo, não um
   veredito único.
4. **Score multicritério?** Sim (Fase 4).
5. **Inconsistência de tradução?** Sim, bug concreto e demonstrável (ver Fase 1). Casar por
   nome PT é frágil; resolver por ID escopado pela espécie.
6. **Arquitetura de decisão por categorias?** Sim (Fase 5), derivada dos scores.

---

## 3. Roadmap (ordem por dependência: dado → falso positivo → custo → score → UI)

| Fase | Objetivo | Depende de | Resolve |
|---|---|---|---|
| 1 | Colisão de golpe (nome PT → ID escopado pela espécie) | — | ponto 5 |
| 2 | Gate por `speciesRank` + entrada `_shadow` no PvP | — (limpo após 1) | pontos 1, 2, falso positivo |
| 3 | Modelo de custo de investimento | Fase 1 | ponto 1 (custo/TM) |
| 4 | Scoring multicritério por objetivo | Fases 2 + 3 | pontos 3, 4 |
| 5 | Categorias de decisão + lente por objetivo (UI) | Fase 4 | pontos 3, 6 |

Fases 1 e 2 são **independentes e shippáveis sozinhas**; 3–4–5 formam o redesenho maior.

---

## 4. Fase 1 — Correção de dados: colisão de golpe (DETALHADA)

### Problema
O export (`colecao.json.fileData`) traz golpes **só como nome PT** (`mon_move_1`,
`mon_move_2`; sem ID, sem inglês). O `moves_pt.json` é um mapa "nome normalizado → 1 ID"
que **já perdeu a colisão no build** (last-write-wins). Quatro nomes PT colidem entre IDs
distintos:

| Nome PT (normalizado) | IDs em conflito |
|---|---|
| `jato d agua` | `HYDRO_PUMP`, `HYDRO_PUMP_BLASTOISE` |
| `furacao` | `DRILL_RUN`, `HURRICANE` |
| `rajada tecnologica` | 4 variantes de Techno Blast (Genesect) |
| `esfera climatica` | 5 variantes de Weather Ball (Castform) |

Cadeia do bug (verificada): export diz "Jato d'Água" → `matchMove` devolve
`HYDRO_PUMP_BLASTOISE` → `gyarados.chargedMoves` contém `HYDRO_PUMP` (não a variante
Blastoise) → `pveMovesetOk([WATERFALL,HYDRO_PUMP])` **falha** → o app diz que o Gyarados
**não tem** o set de raid que ele tem, e manda "Ensinar/TM" um golpe que já existe.
Confirmado num Gyarados **real** da coleção (Cachoeira + Jato d'Água).

### Solução: resolver escopado pela espécie
Uma espécie nunca tem mais de um dos IDs em conflito na sua lista de golpes → resolver o
nome **dentro de `fastMoves ∪ chargedMoves` da espécie** mata as 4 colisões.

- **`lib/meta/match.js`** ganha função pura
  `matchMoveInSpecies(ptName, allowedIds, movesById, override)`:
  - reusa o `normalizeName` que já existe;
  - para cada `id` em `allowedIds`, calcula o nome de exibição na mesma cadeia do
    `_moveName` de `analysis.js`: `movesById[id].namePt → override[id] → inglês
    humanizado`; normaliza e compara com `normalizeName(ptName)`;
  - retorna o `id` que casa, ou `null`.
- **`lib/analysis.js` (`enrichOne`, ~linha 127)**: a montagem de `moveIds` passa a chamar
  o resolver escopado com `meta.speciesIndex.byId[sid].{fastMoves,chargedMoves}` +
  `meta.moves` + `MOVE_PT_OVERRIDE`. **Fallback** para `PokeMatch.matchMove(m,
  meta.movesPt)` quando faltar `sid`/lista, ou quando o escopado devolver `null`. Garante
  que a mudança **nunca regride** — só melhora.
- **`moves_pt.json` permanece** como caminho de fallback (YAGNI — não remover).
- **`sw.js`**: bump obrigatório `pokemon-leo-v17 → v18` (mexe em `match.js` e
  `analysis.js`, ambos cache-first — regra de ouro do CLAUDE.md).

### Casos de borda
- Nome não casa nenhum golpe permitido → fallback global (preserva comportamento atual).
- `sid`/lista ausente → fallback global.
- 15 golpes sem `namePt` → cobertos por `MOVE_PT_OVERRIDE`, igual ao resto do app.

### Critérios de aceite (testes)
- `matchMoveInSpecies("Jato d'Água", <golpes do Gyarados>, movesById)` === `HYDRO_PUMP`
  (não `HYDRO_PUMP_BLASTOISE`); idem para furacão / Weather Ball / Techno Blast.
- Fallback: sem lista de espécie → volta ao `matchMove` global, sem regressão.
- **Payoff (ponta a ponta):** `enrichOne` num Gyarados com "Cachoeira" + "Jato d'Água" →
  `moveIds` contém `HYDRO_PUMP` → `pveMeta.movesetOk === true` (hoje `false`).
- `npm test` verde (suíte inteira).

---

## 5. Fase 2 — Gate por relevância de meta (mata o falso positivo)

- **Objetivo:** PvP deixa de ser "tag por IV"; gateia por `speciesRank` e usa a entrada
  `_shadow`. Em Mestre, parar de tratar "rank 1/4096" como sinal de qualidade da espécie.
- **Muda (esperado):** `pvp.js` (`evalMon` preferir `<id>_shadow` quando `isShadow`, como
  `pve.js:95`; `pvpTags`/`THRESHOLDS` incorporarem `speciesRank`); `analysis.js` (strings
  de rank corretas); testes `pvp.test.js` e `verdict.test.js`.
- **Atenção:** `THRESHOLDS.master` hoje é calibrado para ~1 pick de Mestre em 592 mons;
  rebalancear a calibração faz parte da fase.
- **Aceite:** o Shadow Gyarados 100% **deixa de** receber `pvp_master` (ou passa a ser
  claramente rotulado como pick marginal/caro); um pick real de Mestre (rank baixo)
  continua sinalizado; suíte verde.

## 6. Fase 3 — Modelo de custo de investimento

- **Objetivo:** estimar custo por mon — poeira/doce por nível, Doce XL p/ nível 50,
  sobretaxa de Sombrio (+20%), e nº de TMs / Elite TM faltando para o moveset alvo.
- **Muda (esperado):** novo `lib/meta/cost.js` (puro) + tabelas em `data/`/`refdata`;
  exibido nas razões de ação de `analysis.js`.
- **Depende de:** Fase 1 (saber quais TMs faltam, com IDs corretos).
- **Aceite:** custo aparece nas ações de FORTALECER/Ensinar-TM; Sombrio reflete sobretaxa;
  suíte verde.

## 7. Fase 4 — Scoring multicritério por objetivo

- **Objetivo:** `scorePvP[liga]`, `scorePvE`, `scoreColecao`, com a forma
  `meta × qualidade-da-cópia × prontidão ÷ custo`. PvE pondera **ataque**; Mestre usa
  stats máximos; PvP usa `speciesRank` decaído.
- **Muda (esperado):** novo `lib/meta/score.js` consumindo pvp/pve/cost; `analysis.js`.
- **Depende de:** Fases 2 + 3.
- **Aceite:** rodando o Shadow Gyarados, `scorePvE` > `scorePvP[master]` (inverte a
  recomendação atual); suíte verde.

## 8. Fase 5 — Arquitetura de decisão + lente por objetivo (UI)

- **Objetivo:** categorias **Investir já / Investir só PvE / Investir só PvP / Guardar pro
  futuro / Transferir**, derivadas dos scores; UI deixa escolher a lente (XP / PvP /
  coleção / eficiência).
- **Muda (esperado):** `analysis.js` (veredito → categoria), `render.js`, `app.js`
  (seletor de lente), `index.html`, `sort.js`, bump `sw.js`.
- **Depende de:** Fase 4.
- **Aceite:** Shadow Gyarados cai em "Investir só PvE"; categorias refletem a lente
  escolhida; suíte verde.

---

## 9. Notas transversais (valem para todas as fases)

- **Padrão de módulo dual** (browser global + `require` nos testes) preservado em todo
  `lib/`. Ver CLAUDE.md.
- **Ordem dos `<script>` em `index.html`** preservada ao adicionar módulo novo
  (`cost.js`, `score.js`).
- **Bump de `sw.js`** sempre que mexer em asset cache-first; atualizar `ASSETS` se
  adicionar/remover arquivo servido.
- **Rodar a suíte INTEIRA entre fases** — shape compartilhado quebra testes cross-file.
- Cada fase tem seu próprio spec detalhado + plano antes de implementar.
