# Fase 4 — Scoring multicritério por objetivo (`lib/meta/score.js`)

**Data:** 2026-06-18
**Página:** `/pokemon`
**Roadmap:** §7 de `docs/superpowers/specs/2026-06-15-pokemon-revisao-recomendacao-roadmap-design.md`
**Depende de:** Fase 2 (gate por `speciesRank` + entrada `_shadow` no PvP, PR #35) e
Fase 3 (modelo de custo `lib/meta/cost.js`, PR #38 — **mergeado na main**).

---

## 1. Objetivo

Produzir, por Pokémon, um **score por objetivo** em vez de um veredito único:
`scorePvP[liga]`, `scorePvE` e `scoreColecao`. Esses eixos são quase ortogonais
(o caso que disparou o roadmap — Shadow Gyarados 100% — é "troféu/atacante de raid",
não pick de Liga Mestre), então merecem números separados em vez de um rótulo só.

**Critério de aceite central:** rodando o Shadow Gyarados hundo com o moveset de raid
capturado (Cachoeira + Jato d'Água), `scores.pve > scores.pvp.master` — invertendo a
recomendação que o app dava ("investir em Mestre por ser IV rank 1").

### Escopo desta fase: **expor**, não decidir
A Fase 4 entrega o módulo de score e **anexa** os scores em `analysis.js`. Ela **não**
muda veredito, ação, tags, ordenação nem render. Usar os scores para **ordenar/decidir**
é uma fase futura dedicada (ver §9), separada da Fase 5 de UI, porque toca regras
sensíveis (`verdict.test.js` / `sort.test.js`) e merece sua própria sessão cuidadosa.

---

## 2. Novo módulo `lib/meta/score.js` (`PokeScore`)

Módulo **puro**, no padrão dual (browser global `PokeScore` + `require` nos testes), igual
aos demais de `lib/meta/`. Importa `PokePvp` / `PokePve` / `PokeCost` pela mesma cadeia
`require`/global que o `cost.js` usa.

### Ordem dos `<script>` (CLAUDE.md)
`score.js` consome `cost.js`/`pvp.js`/`pve.js` e é consumido por `analysis.js`:

```
sizes.js → lib/refdata.js → lib/meta/match.js → lib/meta/pvp.js →
lib/meta/pve.js → lib/meta/cost.js → lib/meta/score.js → lib/analysis.js →
lib/render.js → lib/sort.js → app.js
```

### API

```js
PokeScore.scoreMon(e, meta) → {
  pvp:     { great: <num>, ultra: <num>, master: <num> },
  pve:     <num>,
  colecao: <num>,
  best:    { objective: 'pvp_great'|'pvp_ultra'|'pvp_master'|'pve'|'colecao', value: <num> }
}
```

`e` é a entrada já enriquecida (precisa de `ivs`, `moveIds`, `isShadow`, `cp`,
`speciesId`, `eliteMoves`, `pvpMeta`, `pveMeta` e as flags de colecionismo). `meta` traz
`cpm` e `speciesIndex` (para `baseStats`). Degrada para zeros/`null` quando faltar `meta`
ou os avaliadores.

Funções-folha **exportadas** para teste unitário direto (no estilo de `pvp.js`):
`rankDecay`, `qualityPve`, `readiness`, `costScalar`, `scoreColecao`, `scorePvpLeague`,
`scorePve`.

---

## 3. A forma do score

Todos os fatores na mesma escala `[0,1]` (para que objetivos sejam comparáveis entre si),
multiplicado por 100 no fim só para leitura:

```
score = META × QUALIDADE_DA_CÓPIA × PRONTIDÃO ÷ CUSTO_ESCALAR
```

### 3.1 META — relevância da espécie no objetivo (`[0,1]`, decaído, não binário)

- **PvP[liga]** — de `pvpMeta[lg].speciesRank`:
  - `speciesRank == null` (espécie fora do Top-N daquela liga) → `0`.
  - senão `rankDecay(rank) = exp(-(rank - 1) / TAU_PVP)`, `TAU_PVP = 20`.
  - Ex.: Gyarados Sombrio master rank 32 → ~0.21; ultra rank 79 → ~0.02.
- **PvE** — de `pveMeta`:
  - exige papel atacante (`raid || pve || gymAtk`) **e** um `erRank` válido do melhor
    tipo (`pveMeta.byType[pveMeta.bestType].erRank`); senão → `0`.
  - `exp(-(erRank - 1) / TAU_PVE)`, `TAU_PVE = 12`.
  - Ex.: Gyarados Sombrio water erRank 12 → ~0.40.
  - `gym_def` (defensivo) **não** entra em `scorePvE` nesta fase.

### 3.2 QUALIDADE DA CÓPIA (`[0,1]`)

- **PvP great/ultra**: `pvpMeta[lg].spPct` (stat product / melhor da espécie sob o cap).
- **PvP master**: `pvpMeta.master.spPct` — *stats máximos*, sem cap → hundo = 1.0.
- **PvE**: *ponderado em ataque* → `(atkBase + e.ivs.atk) / (atkBase + 15)`, onde
  `atkBase = meta.speciesIndex.byId[e.speciesId].baseStats.atk`. Como o base domina, um
  hundo e um `15/x/x` ficam ~iguais — captura de propósito a "ironia central" (o 100% é
  quase desperdiçado no único modo onde a espécie é útil).

### 3.3 PRONTIDÃO (`(0,1]`) = `fatorMoveset × fatorNível`

- `fatorMoveset` = `1.0` se `movesetOk` para aquele objetivo (`pvpMeta[lg].movesetOk` /
  `pveMeta.movesetOk`), senão `MOVESET_MISS = 0.5`.
- `fatorNível` = `clamp(fromLevel / toLevel, 0, 1)`, com `fromLevel`/`toLevel` vindos do
  `PokeCost.estimate` daquele objetivo. Sem estimativa (cost `null`) → `1`.

### 3.4 CUSTO_ESCALAR (`≥ 1`, divide)

Reduz o `PokeCost.estimate` daquele objetivo a um escalar em "poeira-equivalente":

```
dustEq    = dust + candy·CANDY_W + xlCandy·XL_W + tm.normal·TM_W + tm.elite·ELITE_W
costScalar = 1 + dustEq / COST_NORM
```

Pesos iniciais (escassez **relativa**, ajustáveis — não são preço de mercado):
`CANDY_W = 250`, `XL_W = 1000`, `TM_W = 2000`, `ELITE_W = 10000`, `COST_NORM = 50000`.

`cost == null` ou custo zero → `costScalar = 1` (degradação graciosa, sem penalidade —
mesmo princípio do `_costSuffix` de `analysis.js`).

`PokeScore` chama `PokeCost.estimate` **uma vez por objetivo** (até 3 ligas + PvE),
passando o `context` certo (`{kind:'pvp', league}` / `{kind:'pve'}`) e os `missingMoves`
do moveset-alvo daquele objetivo. A mesma estimativa alimenta `fatorNível` e `costScalar`.

#### Golpes faltantes (para o custo de TM)
Helpers puros internos de `score.js` (espelham a lógica de `analysis.js`, mantendo
`score.js` autocontido):
- **PvP**: falta o rápido se não o tem; faltam os carregados (todos) se não tem nenhum
  deles (`_missingPvp`, igual ao `_missingPvpMoves`).
- **PvE**: faltam os golpes do `bestMoveset` que o mon não tem (PvE exige os dois).

### 3.5 Constantes
`TAU_PVP`, `TAU_PVE`, `MOVESET_MISS`, `CANDY_W`, `XL_W`, `TM_W`, `ELITE_W`, `COST_NORM` são
constantes **nomeadas e documentadas** no módulo. Os testes verificam **monotonicidade e
ordenação relativa**, não valores absolutos (que são calibráveis sem quebrar testes).

---

## 4. `scoreColecao` — soma ponderada de raridade

Colecionismo não tem custo nem prontidão (você já tem a cópia) → é o caso degenerado da
forma (`prontidão = custo = 1`; `meta × qualidade` colapsa na raridade). **OR
probabilístico** das flags ativas — fica em `[0,1]` e empilha com retorno decrescente:

```
scoreColecao(e) = 1 − ∏(1 − wᵢ)   // sobre as flags ativas de e
```

Pesos iniciais:

| Flag | Peso | Flag | Peso |
|---|---|---|---|
| `isHundo` | 0.90 | `isLucky` | 0.40 |
| `isShiny` | 0.85 | `isShadow` | 0.30 |
| `isNearPerfect` (e não hundo) | 0.60 | `isXSComfort` | 0.25 |
| `isLegendary` | 0.60 | `isXLComfort` | 0.25 |
| `isCostume` | 0.55 | `isTradeEvo` | 0.20 |
| `isExtremeSize` (XXS/XXL) | 0.50 | `hasSecondCharge` | 0.10 |
| `isRegional` | 0.50 | | |

(`isNearPerfect` só conta quando não é hundo, para não somar duas vezes a "perfeição".)

---

## 5. Fiação em `analysis.js` (expor, sem decidir)

- Importa `PokeScore` pela cadeia dual (igual a `PokePvp`/`PokeCost`).
- `enrichOne`: adiciona o campo `scores: null` na seção "preenchidos por analyze".
- `analyze`, **passada 1**, depois de `e.pvpMeta` / `e.pveMeta` / `e.isRocketReady`
  estarem prontos: `e.scores = (meta && PokeScore) ? PokeScore.scoreMon(e, meta) : null`.
- **Nenhuma** mudança em `computeVerdict`, `computeAction`, `computeTags`, `computeCounts`,
  `render.js` ou `sort.js`.

---

## 6. Infra (regra de ouro do CLAUDE.md)

- `index.html`: adicionar `<script src="./lib/meta/score.js"></script>` entre `cost.js` e
  `analysis.js` (ver ordem em §2).
- `sw.js`: **bump** `pokemon-leo-v20 → v21` **e** adicionar `'./lib/meta/score.js'` à lista
  `ASSETS` (arquivo novo servido → precisa ser pré-cacheado).

---

## 7. Testes (`test/score.test.js`)

### Folhas (puras, sem dataset)
- `rankDecay`: monotônico decrescente; `rankDecay(1) === 1`; rank `null`/ausente → `0`.
- `costScalar`: `≥ 1`; cresce com dust/candy/xl/TM; `null` → `1`.
- `readiness`: `fatorMoveset` cai sem moveset; `fatorNível` cai com nível baixo; ambos `1`
  no caso pronto.
- `qualityPve`: ponderada em ataque; hundo ≈ `15/x/x` para base de ataque alta (ironia).
- `scoreColecao`: dentro de `[0,1]`; empilha (shiny+hundo > hundo só); sem flags → `0`.

### Aceite ponta-a-ponta (com `data/*.json` reais)
Monta `meta` igual ao `verdict.test.js`
(`buildSpeciesIndex(species.json)` + `pvp_ranks.json` + `pve_ranks.json` + `cpm.json` +
`moves.json`) e um `fileData` com **um Shadow Gyarados hundo** com CP de um nível conhecido
e moveset capturado Cachoeira + Jato d'Água. Roda `analyze(...)` e asserta:

- `e.scores.pve > e.scores.pvp.master` ✅ (inverte a recomendação do roadmap).
- `e.scores.best.objective === 'pve'` (sanidade do agregado).

### Degradação
- `meta` ausente → `e.scores === null` (ou `scoreMon` devolve zeros), sem lançar.
- Mon fora de todos os metas → `pvp` zerado, `pve` zerado.

### Suíte inteira
`npm test` de dentro de `pokemon/` — **suíte inteira** verde (baseline 261 + os novos).

---

## 8. Casos de borda / decisões

- **Sombrio no PvP**: `pvpMeta` já prefere a entrada `_shadow` (Fase 2) → `speciesRank`
  correto entra no `rankDecay`. `score.js` não relê ranks; consome `pvpMeta`/`pveMeta`.
- **`spPct` `null`** (liga fora do meta): só ocorre quando `speciesRank` é `null` → META já
  é `0`, então a qualidade não é lida.
- **Custo zero** (mon já no nível-alvo, com o moveset): `costScalar = 1`, `fatorNível = 1`
  → prontidão alta, sem penalidade — exatamente "pronto pra usar".
- **Duplicação de "missing moves"**: `score.js` reimplementa os helpers mínimos em vez de
  importar de `analysis.js`, para permanecer puro e autocontido (mesma escolha do
  `cost.js`). Mudança consciente, documentada no código.

---

## 9. Fora de escopo / próxima fase: **ordenar e decidir pelos scores**

Registrado explicitamente: integrar os scores ao **veredito/ação** e oferecer uma
**ordenação por score** (ex.: "Recomendado por objetivo") é trabalho de uma **sessão
dedicada futura**, separada da Fase 5 (UI/categorias). Motivos:

- Toca regras conservadoras de veredito (`isProtected`, `computeVerdict`) e a ordenação
  competitiva (`sort.js` / `sort.test.js`) — alto risco de regressão se feito de afobado.
- A Fase 5 do roadmap já prevê "categorias derivadas dos scores" + lente por objetivo na
  UI; a decisão de **onde** os scores entram no veredito deve ser desenhada junto, com seu
  próprio spec e calibração.

Esta fase deixa os scores **prontos e expostos** em `e.scores` para esse trabalho futuro
consumir, sem mexer no comportamento atual.

---

## 10. Resumo dos arquivos tocados

| Arquivo | Mudança |
|---|---|
| `lib/meta/score.js` | **novo** — `PokeScore` (módulo puro). |
| `lib/analysis.js` | importa `PokeScore`; `enrichOne` ganha `scores:null`; `analyze` anexa `e.scores`. |
| `index.html` | `<script>` de `score.js` entre `cost.js` e `analysis.js`. |
| `sw.js` | bump `v20 → v21`; `score.js` em `ASSETS`. |
| `test/score.test.js` | **novo** — folhas + aceite ponta-a-ponta + degradação. |
