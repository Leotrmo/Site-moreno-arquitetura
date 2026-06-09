# Design — Camada de meta competitivo na `/pokemon` (PvP, Raid, PvE, Ginásio, Rocket)

- **Data:** 2026-06-07
- **Autor:** Leo (brainstorming com Claude)
- **Status:** Aprovado para planejamento
- **Base:** evolui o spec `2026-06-04-pokemon-pagina-inteligente-design.md` (triagem Investir/Manter/Transferir já implementada em `pokemon/lib/analysis.js`).
- **Arquivos atuais relevantes:** `pokemon/app.js`, `pokemon/lib/analysis.js`, `pokemon/lib/render.js`, `pokemon/lib/refdata.js`, `pokemon/sizes.js`, `pokemon/sw.js`, `pokemon/colecao.json`, `pokemon/test/*`.

---

## 1. Contexto e problema

A página `moreno.arq.br/pokemon` já decide **o que manter, transferir e investir** por mon, a partir de um JSON exportado (padrão Spoofer Pro) em `pokemon/colecao.json`. Hoje a decisão é baseada em **raridade/IV/duplicata** (shiny, lucky, sombrio, lendário, fantasia, tamanho, melhor-cópia da espécie).

O que falta é o **julgamento competitivo**: saber se um mon presta de fato para **PvP por liga**, **raids**, **PvE geral**, **ataque/defesa de ginásio** e **Rocket** — e, com isso, recomendar ações finas (Fortalecer, Ensinar/TM, Aguardar evento, Trocar/reroll) em vez de só o veredito de 3 vias.

**Objetivo central:** adicionar uma **camada de meta competitivo** que cruza a coleção com dados abertos da comunidade, atribuindo **tags** (filtros) e uma **ação recomendada** com **justificativa rastreável** por mon — sem regredir nada do que já funciona e sem quebrar o modelo de site estático.

## 2. Objetivos

1. Classificar cada mon nas dimensões competitivas: `pvp_great`, `pvp_ultra`, `pvp_master`, `pve`, `raid`, `gym_atk`, `gym_def`, `rocket`.
2. Recomendar uma **ação** específica (6 tipos) refinando o veredito atual, com justificativa rastreável.
3. Manter o site **estático e offline-friendly**: nenhum fetch externo em runtime; dados de meta baked no repo e regenerados por automação.
4. **Não-regressão:** mon fora do meta passa exatamente pelo fluxo atual; a camada é puramente aditiva.

## 3. Não-objetivos (v1)

- Simulação por chefe/boss específico (estilo Pokebattler por raid) — usamos estimativa DPS/TDO/ER, não sim por defensor.
- Cups/ligas temáticas do PvP (Remix, regionais de cup) — só as ligas principais via ranking `overall` (Grande/Ultra/Mestre).
- Abas separadas por dimensão — decisão de UI: **lista única + filtros** (ver §8).
- Edição de dados pela página (segue sendo leitura do JSON).

---

## 4. Decisões do brainstorming (registradas)

| Tema | Decisão |
|---|---|
| Escopo v1 | **Sistema completo** (PvP por liga + Raid + PvE + Ginásio + Rocket + 6 ações), construído em **fases**. |
| Atualização do meta | **GitHub Action automática** (agendada + manual). Leo nunca roda nada; site segue estático. |
| Estrutura da UI | **Lista única + filtros** (sem abas novas). Categorias viram chips + selos. |
| Fonte do "cérebro" | **Abordagem C (híbrida):** rankings PvPoke para "é meta?" + moveset; **cálculo local** de rank de IV (PvP) e DPS/TDO (PvE). |
| Desvio consciente do prompt | Em vez de raspar planilha GamePress / API Pokebattler, **calculamos DPS/TDO do Game Master** (mesma matemática, fonte limpa e automatizável). Rotulado como "estimativa". |

---

## 5. Arquitetura em camadas

Princípio: separar **conhecimento do jogo** (regenerado pela Action) de **a coleção** (`colecao.json`, trocado por Leo). O navegador só cruza os dois — nunca baixa nada externo em runtime.

```
BUILD-TIME (GitHub Action: agendada + dispatch manual)
  build/refresh-meta.js  (Node)
    1. baixa gamemaster.json (PvPoke)  → status-base, tipos, stats de golpe (PvP+PvE), CPMs, flags legado/sombrio
    2. baixa rankings PvPoke 1500/2500/10000 → meta + moveset recomendado por liga
    3. baixa localização PT-BR (PokeMiners) → mapa golpe-PT → moveId
    4. CALCULA DPS/TDO/ER por espécie+moveset → ranking por tipo
    → emite (commitados):
       pokemon/data/species.json    (dex+forma → speciesId, baseStats, tipos, família, eliteMoves, shadowEligible)
       pokemon/data/moves.json      (moveId → stats PvP/PvE)
       pokemon/data/moves_pt.json   (nome-PT normalizado → moveId)
       pokemon/data/pvp_ranks.json  (speciesId → rank/score/moveset por liga)
       pokemon/data/pve_ranks.json  (speciesId → DPS/TDO/ER por tipo + roles)
       pokemon/data/meta.json       (generatedAt, gmVersion, pvpokeCommit, ptCoverage)

RUNTIME (navegador, estático, offline-friendly)
  app.js → analyze(colecao.json, datasets)
    • casa espécie por mon_number (+ forma → speciesId)
    • casa golpes PT → moveId (moves_pt.json)
    • calcula rank do IV por liga (stat product + CPM)
    • cruza com pvp_ranks / pve_ranks → tags + ação + justificativa
```

**Pontos de design:**
- **Fonte fundacional única:** o `gamemaster.json` do PvPoke já traz status-base, tipagens, stats de golpe (PvP *e* PvE), CPMs e flags de golpe legado/sombrio. Os rankings entram só para o julgamento humano de "é meta?".
- **A Action não toca no `colecao.json`** — só regenera `pokemon/data/*`. O fluxo de atualizar coleção é idêntico ao de hoje.
- **Validação defensiva no build:** se o schema do PvPoke mudar, o script **falha alto** com mensagem clara; o site segue com os dados anteriores.
- **Libs atuais permanecem:** `analysis.js`, `render.js`, `sizes.js`, `refdata.js`. O motor de meta entra como **novos módulos**: `lib/meta/match.js`, `lib/meta/pvp.js`, `lib/meta/pve.js`, consumidos por `analyze()`.
- **Service worker:** `sw.js` passa a tratar `pokemon/data/*` como cacheável (network-first como o JSON), com bump de versão.

---

## 6. Modelo de dados e casamento coleção ↔ meta

### 6.1 Datasets gerados (formato enxuto)

| Arquivo | Chave | Conteúdo |
|---|---|---|
| `species.json` | `dex` (+ forma) → `speciesId` | `{ baseStats:{atk,def,hp}, types:[..], family, evolvesTo:[..], eliteMoves:[..], shadowEligible }` |
| `moves.json` | `moveId` | `{ type, kind:"fast"\|"charge", pve:{power,energy,duration}, pvp:{power,energy} }` |
| `moves_pt.json` | nome-PT **normalizado** | `moveId` |
| `pvp_ranks.json` | `speciesId` | `{ great:{rank,score,moveset:[..]}, ultra:{..}, master:{..} }` |
| `pve_ranks.json` | `speciesId` | `{ byType:{ fire:{dpsRank,erRank}, .. }, bestMoveset, roles:[raid,pve,gym_atk,gym_def] }` |
| `meta.json` | — | `{ generatedAt, gmVersion, pvpokeCommit, ptCoverage }` |

### 6.2 Casamento (runtime), três etapas

1. **Espécie:** export traz `mon_number` (Pokédex, universal) e às vezes `mon_form` (`"GRIMER_ALOLA"`, `"GIRATINA_ALTERED"`). PvPoke usa `speciesId` (`"grimer_alolan"`). Construir no build um **mapa `dex+forma → speciesId`**. Formas-base (sem `mon_form` ou `*_NORMAL`) reaproveitam o `speciesKey` já existente em `analysis.js`.
2. **Golpes:** export só dá nome em PT (`"Esmagamento de Pedras"`). Normalizar (minúsculo, sem acento, sem espaço extra) e buscar em `moves_pt.json` → `moveId`. Com o `moveId`, comparar com o moveset recomendado e ler stats PvE.
3. **IV → rank:** com `baseStats` + CPM, calcular o **stat product** do IV específico e seu **rank/percentil** na liga (ver §7).

### 6.3 Degradação graciosa (não mentir)

- **Golpe sem casar** (novo/grafia diferente) → não quebra: mon marcado como "moveset não verificado"; build registra `ptCoverage` (% de golpes casados) em `meta.json`.
- **Espécie/forma sem `speciesId`** → mon recebe só a triagem básica atual; sem tags competitivas.
- **Princípio:** tags competitivas são **aditivas**. Sem cobertura de meta, o mon cai no comportamento de hoje — nada regride.

---

## 7. Motor de PvP por liga

Responde duas perguntas distintas:

### 7.1 A espécie é meta? (vem do PvPoke)

Meta-relevante se `speciesId` está no **Top N** do ranking `overall` da liga. Cortes padrão **configuráveis** (constantes no topo de `lib/meta/pvp.js`):
- `pvp_great` / `pvp_ultra`: Top **100**.
- `pvp_master`: Top **80**.

### 7.2 Essa cópia presta? (cálculo local — "rank checker")

```
para a liga (cap 1500 / 2500 / sem-cap):
  para cada IV (0..15)^3 = 4096:
     nível_max = maior CPM tal que CP <= cap
     Atk=(base_atk+iv)*cpm ; Def=(base_def+iv)*cpm ; HP=floor((base_sta+iv)*cpm)
     statProduct = Atk*Def*HP
  ordena os 4096 por statProduct desc
  ivRank = posição do meu IV
  spPct  = meu statProduct / melhor statProduct
```

- **Grande/Ultra:** ideal = ataque baixo + def/HP altos (emerge do stat product). Marca `pvp_great`/`pvp_ultra` se a espécie é meta **E** `spPct >= 99%` (ou `ivRank <= 50`) — limiar configurável.
- **Mestre:** sem cap → ganha IV alto. Marca `pvp_master` se a espécie é meta **E** `ivPct >= 98%`.

### 7.3 Performance

Memoizar a distribuição dos 4096 por `(speciesId, liga)`; espécies repetidas reusam. ~600 mons resolvem em centenas de ms no load. Pré-cálculo no build só se medir necessidade.

### 7.4 Saída por mon

```
pvp: {
  great:  { isMeta, speciesRank, ivRank, spPct, movesetOk },
  ultra:  { .. },
  master: { .. }
}
```
`movesetOk` compara `moveId` do mon com o moveset recomendado → alimenta a ação "Ensinar/TM".

---

## 8. Motor de PvE: raid, pve, gym_atk, gym_def, rocket

Tudo calculado do Game Master (ver desvio consciente, §4).

- **DPS** (ciclo rápido+carregado) e **TDO** (incorpora bulk via Def×HP) — fórmula *weave* padrão do GamePress, a nível fixo (L40, neutro). Combinadas num score tipo **ER** (ponderação DPS↑ sobre TDO). Rodam **no build**, por espécie+melhor moveset, gerando `pve_ranks.json` com ranking **por tipo de ataque**.

| Tag | Critério |
|---|---|
| `raid` | espécie no **Top 10** atacantes de algum tipo (ER) **E** moveset de ataque (ou casa com recomendado). Configurável. |
| `pve` | DPS/TDO alto geral (Top N agregado) — camada mais larga que `raid`. |
| `gym_atk` | DPS alto **+ tipagem versátil** (bate em defensores comuns). |
| `gym_def` | **bulk alto**: `(base_def+iv_def)·(base_sta+iv_sta)` no topo — usa o **IV individual** de Def/HP. |
| `rocket` | moveset de **spam**: rápido com alta geração de energia/curto + carregado de baixo custo. Derivado de `moves.json`. |

**Granularidade proposital:** `raid`/`pve` olham espécie+moveset; `gym_def` olha o IV individual (bulk depende do seu Def/HP); `rocket` olha só a mecânica de golpe (independe de a espécie ser meta).

**Honestidade:** DPS/TDO é **estimativa de triagem**, não simulação por chefe. Rotulado como "estimativa" no detalhe do card.

---

## 9. Motor de decisão: 6 ações sobre a triagem de 3 vias

**Decisão de design:** manter o **veredito de 3 vias como titular** (dirige contadores, ordenação e modo transferir já existentes) e adicionar uma **`action`** mais específica como refinamento. A ação *detalha* o veredito; não o substitui.

| Ação | Veredito | Quando |
|---|---|---|
| **Fortalecer / Evoluir** | INVESTIR | meta-relevante (PvP ou PvE) + IV certo pro papel + moveset ok |
| **Ensinar / TM** | INVESTIR | meta-relevante + IV certo, mas `movesetOk = false` |
| **Aguardar Rocket** | MANTER | `isShadow` + meta-relevante + tem **"Frustração"** nos golpes |
| **Aguardar Evento** | MANTER | meta-relevante mas moveset ótimo exige **golpe legado/Elite TM** (`eliteMoves`) |
| **Trocar (Lucky/reroll)** | MANTER | espécie meta + **IV baixo** (reroll), **ou** shiny duplicado p/ lucky trade |
| **Transferir** | TRANSFERIR | nada acima — regra atual (duplicata pior, IV < 80%, nada especial) |

**Integração com `computeVerdict`:** inserir **meta-relevância como mais uma forma de "protegido"** (mon competitivo nunca é transferido). Depois de fixar o veredito, `computeAction(e)` escolhe a ação por prioridade decrescente:

```
1. Fortalecer/Evoluir   (meta + IV ok + moveset ok)
2. Ensinar/TM           (meta + IV ok + moveset ruim)
3. Aguardar Rocket      (shadow + meta + Frustração)
4. Aguardar Evento      (meta + precisa golpe legado)
5. Trocar/Reroll        (meta + IV baixo) ou (shiny duplicado)
6. (sem gancho de meta) → mantém o motivo atual
```

**Justificativa rica/rastreável (no card):**
- *"Fortalecer p/ Liga Grande — rank 6 da espécie, seu IV 99,4% (rank 12/4096)"*
- *"Ensinar TM — Medicham é Top 20 Grande, mas falta 'Contra-ataque' (recomendado)"*
- *"Aguardar Rocket — Sombrio meta com Frustração; espera evento p/ TM"*
- *"Transferir — duplicata pior, IV 24%, fora do meta"*

**Não-regressão:** mon sem gancho de meta passa exatamente pelo fluxo atual; o motor só acrescenta caminhos.

---

## 10. UI: tags, filtros e selos (sem abas novas)

`tags` por mon: `pvp_great` · `pvp_ultra` · `pvp_master` · `pve` · `raid` · `gym_atk` · `gym_def` · `rocket` — mais os atuais `TROCAR_EVO` · `REGIONAL`.

1. **Contadores titulares** — ❌ Transferir · 💪 Investir · 🛡️ Manter. Inalterados.
2. **Nova fileira de chips "Campeões"** — abaixo dos chips atuais, com contagem:
   `⚔️ Grande (N)` · `⚔️ Ultra (N)` · `⚔️ Mestre (N)` · `🔥 Raid (N)` · `🛡️ Def. Ginásio (N)` · `🚀 Rocket (N)`. Reusa a engine `renderChips`/`state.special`/`applyFilters`, estendida para tags de meta.
3. **Selos no card** — adiciona `⚔️G ⚔️U ⚔️M 🔥 🚀` aos selos existentes (✨🍀👻…). Só os aplicáveis.
4. **Detalhe do card** — novo bloco **"Competitivo"** quando houver: rank da espécie + `spPct`/`ivRank` por liga, moveset recomendado vs. o seu, papel PvE (tipo + "estimativa").

**Ordenação:** padrão segue veredito→IV. Com um chip competitivo ativo, **reordena por rank daquela liga** (melhor primeiro).

**Reuso:** `app.js` registra novas defs de tag; `render.js` ganha selos de tag + bloco "Competitivo". Busca, modo transferir, contadores e layout geral **não mudam**.

---

## 11. Fases de implementação

Cada fase é commitável, testável (`node --test`) e não regride a anterior.

- **Fase 0 — Fundação (pipeline + casamento).** GitHub Action + `build/refresh-meta.js` (download + validação + emissão de `pokemon/data/*`). `lib/meta/match.js` (espécie/forma + golpe PT→id). Entrega: datasets gerados + mons enriquecidos com `speciesId`/`moveId` (sem UI nova). Desbloqueia tudo.
- **Fase 1 — PvP por liga.** `lib/meta/pvp.js` (rank de IV + meta), tags `pvp_*`, ações Fortalecer/Ensinar-TM, chips ⚔️, bloco competitivo no detalhe.
- **Fase 2 — PvE.** `lib/meta/pve.js` (DPS/TDO/ER no build), tags `raid`/`pve`/`gym_atk`/`gym_def`, chips 🔥🛡️.
- **Fase 3 — Rocket + eventos.** tag `rocket`, ações Aguardar Rocket (Frustração), Aguardar Evento (legado), Trocar/Reroll (lucky).
- **Fase 4 — Polimento.** Calibração de limiares (PvP/Rocket), Sombrio correto (build + casamento), filtro de formas, ordenação por rank, justificativas rastreáveis, limpezas. Detalhe concreto em **§14** (decisões de 2026-06-09).

## 12. Critérios de sucesso

1. A Action regenera `pokemon/data/*` sozinha; trocar `colecao.json` segue sendo o único passo manual do Leo.
2. Nenhum mon meta-relevante é sugerido para transferir.
3. Cada mon competitivo mostra liga/tipo, rank e justificativa rastreável.
4. Golpe/espécie sem casar → degrada gracioso; cobertura PT reportada em `meta.json`.
5. Funciona offline e rápido no celular (datasets locais, zero fetch externo em runtime).
6. Todos os testes `node --test` passam, incluindo casos-pivô existentes (ex.: os dois Xatus).

## 13. Riscos e mitigação

- **Schema do PvPoke muda** → validação no build que falha alto; site segue com dados antigos.
- **Cobertura da localização PT** (golpes novos/grafias) → fallback "não verificado" + métrica de cobertura; sem chute.
- **Mapa de formas** (`GRIMER_ALOLA → speciesId`) → tabela no build + overrides manuais para casos chatos.
- **DPS/TDO é estimativa** → rotulado como tal; não promete simulação por chefe.
- **Perf no celular** → memoização por `(speciesId, liga)`; pré-cálculo no build só se medir necessidade.
- **Licenciamento do Game Master** → mirrors abertos da comunidade; uso pessoal.

---

## 14. Fase 4 — Decisões de polimento (2026-06-09)

Detalhamento concreto da Fase 4, aprovado em brainstorming com Leo. Tudo aditivo e não-regressivo; nenhuma mudança no fluxo de "trocar `colecao.json`".

### 14.1 Achado que orienta o design (Sombrio + formas)

Auditoria do código revelou que **as 534 entradas `_shadow` e as Megas em `pve_ranks.json` são hoje peso morto**:
- `lib/meta/match.js` **não casa Sombrio** — um Sombrio da coleção casa com a forma-base (`charizard`), nunca com `charizard_shadow`. As entradas `_shadow` nunca são consultadas em runtime.
- O build **não aplica multiplicador Sombrio** — `charizard` e `charizard_shadow` têm os mesmos `baseStats` e recebem **ER idêntico**. As entradas `_shadow` são duplicatas que **incham o pool de ranking e soterram as formas-base** (as únicas consultadas).
- O runtime **não dá bônus de DPS a Sombrio**.

Conclusão: os itens "bônus Sombrio no DPS", "filtro de formas não-obtíveis" e "como Sombrio casa" são **um problema só** e são resolvidos juntos.

### 14.2 Calibração / precisão

- **PvP — afrouxar (decisão: "shortlist útil").** Mantém o portão "espécie é meta" (Top-N da liga). **Afrouxa o portão de IV** (hoje `spPct ≥ 0.99` ou `ivRank ≤ 50/4096`, que só deixa passar o Gyarados hundo). Calibração **empírica** contra a coleção real (~592 mons), igual à do Rocket na Fase 3: ajustar `THRESHOLDS.great/ultra` (e revisar `master`) para surgir uma **shortlist acionável de ~15-30 picks** de "vale investir pra PvP". Números finais determinados na implementação, verificados contra a coleção; documentados em código + memória.
- **Sombrio correto (build + casamento).**
  - **Build:** `transform.buildPveRanks` aplica os multiplicadores Sombrio ao calcular DPS/TDO/ER das entradas `_shadow` — **1.2× no ataque** (afeta dano/DPS) e a **penalidade de bulk** no TDO (Sombrio toma 1.2× de dano ⇒ ~0.8333× efetivo em bulk). As entradas `_shadow` passam a ter rank **real** (melhor que a base no DPS), competindo corretamente no pool.
  - **Casamento:** `lib/meta/match.js` passa a anexar o sufixo `_shadow` ao `speciesId` quando o mon é Sombrio **e** existe a entrada `_shadow` correspondente, com **degradação graciosa** (sem entrada `_shadow` → cai na base, como hoje). Assim o Sombrio do Leo herda o rank com bônus e ganha crédito de Raid corretamente.
- **Rocket — duração real do golpe.** `moves.json` passa a guardar a **duração PvP em turnos** do golpe rápido (do Game Master). `PokePve.rocketSpam` calcula os **turnos reais para carregar** (custo do carregado mais barato ÷ energia-por-turno do rápido, considerando a duração) em vez da aproximação atual por energia-por-ativação. Recalibrar `ROCKET_SPAM_TURNS` contra a coleção (alvo: shortlist ~das dezenas, não a coleção inteira).

### 14.3 Filtro de formas (pool de ranking PvE)

Decisão (Leo delegou; escolha alinhada a "shortlist útil"): o pool de ranking de `buildPveRanks` passa a ser **base + regional + Sombrio (com bônus)**.
- **Remove Megas** (`_mega`, `_mega_x`, `_mega_y`, `_primal`): estado **temporário**, gated por Mega Energy, e **nenhuma cópia da coleção casa** com `_mega`. Mantê-las só soterra atacantes permanentes.
- **Remove formas-fantasma** não-obteníveis (entradas da fonte que não existem como Pokémon jogável). Sinal data-driven via `tags`/flags do gamemaster PvPoke; a lista exata de tags a excluir é **confirmada na implementação** inspecionando os valores distintos no build (validação defensiva: se a flag sumir do schema, falhar alto).
- **Mantém Sombrio** no pool — agora é casado (14.2) e genuinamente melhor.

Efeito: ranks de Raid/Ginásio passam a refletir formas **permanentemente obteníveis**, com Sombrio corretamente no topo.

### 14.4 Ordenação por rank

- **Runtime (UI):** com um chip competitivo ativo (⚔️ Grande/Ultra/Mestre, 🔥 Raid, 🛡️ Def. Ginásio), a lista **reordena pelo rank daquela dimensão** (melhor primeiro), com **desempate determinístico**: rank → IV% → nome. Sem chip competitivo ativo, mantém a ordenação atual (veredito → IV). Reusa a engine de filtros/ordenação do `app.js`; busca/modo-transferir/contadores **não mudam**.
- **Build:** dar **desempate determinístico** aos sorts de ranking de `buildPvpRanks`/`buildPveRanks` (ex.: `speciesId` como critério secundário) para rebuilds serem byte-estáveis.

### 14.5 Textos de justificativa rastreáveis

Cada mon com ação de meta mostra uma **frase rastreável** no card (refina os motivos genéricos de hoje), por tipo de ação — modelos no espírito de §9:
- *"Fortalecer p/ Grande — Medicham Top 20 da espécie, seu IV rank 12/4096 (99,4%)"*
- *"Ensinar TM — falta 'Contra-ataque' (recomendado p/ Grande)"*
- *"Aguardar Rocket — Sombrio meta com Frustração; espera evento p/ TM"*
- *"Aguardar Evento — moveset ótimo exige golpe Elite TM"*
- *"Trocar — duplicata pior / IV baixo p/ reroll"*

A justificativa é montada do que o motor já calcula (rank da espécie, ivRank/spPct, moveset recomendado vs. o seu). `render.js` exibe; `analysis.js`/motor expõem os campos necessários.

### 14.6 Limpezas técnicas

- **`TYPE_PT` duplicado** entre `analysis.js` e `render.js` → extrair para módulo compartilhado (ex.: `refdata.js`) e importar nos dois. Sem mudança de comportamento.
- **Spec `legacyMoves` → `eliteMoves`** → corrigido neste documento (§5, §6.1, §9). O campo real em `species.json` sempre foi `eliteMoves`.

### 14.7 Invariantes preservados

- Nenhum mon meta-relevante sugerido para Transferir (§12.2).
- Camada puramente aditiva: mon sem gancho de meta passa pelo fluxo atual.
- `node --test` 100% verde, incluindo casos-pivô (os dois Xatus, Chansey gym_def, Gyarados pvp).
- Datasets regenerados só pela Action; site segue estático e offline-friendly.
