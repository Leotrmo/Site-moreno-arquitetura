# Recomendações da /pokemon — "Shortlist confiável"

**Data:** 2026-06-13
**Status:** Design aprovado, aguardando plano de implementação
**Escopo:** `pokemon/lib/analysis.js`, `pokemon/lib/refdata.js` (+ testes). Sem mudança de UI estrutural.

## 1. Contexto e problema

A /pokemon enriquece o `colecao.json` (export do Poké Genie, hoje 667 mons) com um
veredito (INVESTIR/MANTER/TRANSFERIR) e uma **ação** recomendada (EVOLUIR, FORTALECER,
ENSINAR_TM, AGUARDAR_EVENTO, AGUARDAR_ROCKET, TROCAR). O motor está em
`pokemon/lib/analysis.js`, apoiado nos avaliadores de meta `lib/meta/pvp.js` e
`lib/meta/pve.js`.

Rodando o motor real (mesmo `loadMeta()` + `analyze()` do `app.js`) contra os 667 mons
reais, a revisão encontrou:

| Ação | Qtd | Diagnóstico |
|---|---|---|
| EVOLUIR | **122** (18% da coleção) | 121/122 entram só por "melhor cópia da espécie" (sempre true p/ única cópia); 40 são IV<80 com texto contraditório *"esta cópia vale (IV 58%)"*; ≥25 têm a evolução que o jogador **já possui**; conflito "MANTER XS" + "EVOLUIR". |
| AGUARDAR_ROCKET | **38** | 31 são IV<70, 14 são IV<50 — manda esperar Elite TM de evento Rocket em sombrios de 40%. |
| ENSINAR_TM | 16 | Majoritariamente correto (ver §6); alguns marginais "Top 100". |
| FORTALECER | 2 | Correto e com contexto rico. |

**Causa raiz:** o meta-layer foi calibrado (comentário em `pvp.js:11`) para uma "shortlist
útil (~20 picks PvP)". Mas EVOLUIR e AGUARDAR_ROCKET **furam esse limiar** — disparam numa
barra frouxa ("espécie aparece em Top-100 de alguma liga / qualquer papel"), sem piso de
valor da cópia e sem checar redundância. Resultado: ~189 ações, das quais a maioria é ruído,
e mensagens que mentem ("vale (IV 58%)") corroem a confiança.

**Localização:** 15 dos 311 golpes não têm `namePt` → vazam em inglês no texto
(ex.: "golpe legado *Chilling Water*").

## 2. Princípio único

Toda *ação* respeita **o mesmo limiar calibrado** que o app já usa para marcar meta
(`THRESHOLDS` de `pvp.js` e papéis de `pve.js`). Abaixo da barra → sem selo de ação; o mon
continua aparecendo com seu veredito.

## 3. Decisões tomadas (brainstorming)

1. **Filosofia:** shortlist confiável — cortar IV baixo e redundância; lista curta em que dá
   pra confiar.
2. **Travas do EVOLUIR:** todas as quatro (já-tenho-evolução, piso de valor, evolução meta de
   verdade, não destruir colecionável).
3. **Mecanismo do EVOLUIR:** Abordagem A — **projetar a evolução** (avaliar a forma evoluída
   com os IVs desta cópia pelos mesmos avaliadores).
4. **Colecionável:** suprimir EVOLUIR só para **tamanho (XS/XL/XXS/XXL) e fantasia**.
   Shiny/Lucky **sobrevivem à evolução** → continuam evoluíveis.
5. **ENSINAR_TM/FORTALECER:** não apertar teto de rank da espécie — a barra de IV PvP já
   garante que a cópia presta.

## 4. Componente 1 — Projeção de evolução (coração)

Substitui a lógica frouxa de `_buildEvoMetaIndex` + `_metaEvoFor` + gate de `_evolveAction`.

- **Índice de candidatos:** `_buildEvoCandidates(meta)` retorna, por `speciesId` base (e
  variante `_shadow`), o **conjunto** de formas mais evoluídas da mesma família e mesma região
  (mantém o proxy de "soma de base stats > a minha" para achar formas posteriores). Não filtra
  por meta aqui — quem decide é a projeção. Retornar conjunto (não 1 só) cobre famílias com
  vários ramos (Eevee).

- **`_projectEvolution(e, evolvedId, meta)`:** monta objeto sintético
  `{ speciesId: evolvedId, ivs: e.ivs, ivPct: e.ivPct, isShadow: e.isShadow, moveIds: [] }`
  e roda `PokePvp.evalMon` + `PokePve.evalMon` + `pvpTags` + `pveTags` — exatamente os mesmos
  de um mon capturado. (Rank PvP independe dos golpes; papéis PvE são por espécie; moveset
  pós-evolução é escolhido no ato de evoluir, então `moveIds: []` é correto.) Retorna
  `{ tags, league, role, speciesRank, spPct }` do selo mais forte, ou null se não tagueia.

- **`_evolveAction(e, evoCandidates, owned, meta)`** dispara EVOLUIR só quando:
  1. a forma atual **não** é meta (senão o gancho de moveset cuida — comportamento atual);
  2. **alguma** projeção de candidato tagueia (`_projectEvolution` != null) — isto é o piso de
     valor + "evolução meta de verdade", de graça;
  3. **não** é colecionável de tamanho/fantasia: suprime se
     `e.isCostume || e.isExtremeSize || e.isXSComfort || e.isXLComfort`
     (shiny/lucky **não** entram aqui);
  4. **não** possuo a evolução como keeper (ver §5).
  - Escolhe o alvo de selo mais forte (ordem pvp_great > ultra > master > raid > gym_atk).
  - Mensagem: `"Evoluir → <Alvo> · seria pick de <Liga/Papel> (rank <speciesRank> da espécie · seu IV PvP <round(spPct*100)>%)"`.
    Para alvo PvE: `"... seria Top <erRank> atacante de <tipo> (estimativa)"`.

## 5. Componente 2 — Travas de posse e colecionável

- **Índice de posse:** após a passada 1 (§7), monta `ownedKeepers` = `Set` de `speciesId` que
  têm ao menos uma cópia "keeper": cópia com selo de meta (`pvpMeta`/`pveMeta` tag) **ou**
  melhor da espécie com IV≥90. Definição baseada só em tags+IV (não no veredito) para evitar
  dependência de ordem.
- **`_ownsKeeper(evolvedId, owned)`** → suprime EVOLUIR quando já tenho a forma evoluída boa.
- **Colecionável de tamanho/fantasia:** conforme §4.3.

## 6. Componente 3 — AGUARDAR_ROCKET com piso

Hoje: `isMetaRelevant(e) && _isShadowFrustration(e)`, onde `isMetaRelevant` herda a barra
frouxa via `metaEvo`. Novo: dispara só quando o sombrio é **investment-worthy** pelo mesmo
critério — `isPvpMeta(e) || isPveMeta(e) || (alguma projeção de evolução tagueia)`. Um
Charmander Sombrio 40% não projeta selo (IV baixo não cruza o limiar) → some.

## 7. Componente 4 — ENSINAR_TM / FORTALECER

Sem mudança de barra: `_bestPvpLeague` já só escolhe liga quando o mon tem tag `pvp_*`
(que usa `THRESHOLDS`). Os casos "IV<75" que aparecem são **corretos** — PvP premia
ataque baixo/bulk, então um 62% bulky pode ser top de Liga Grande (isto valida a Abordagem A).
Aqui só garantir que o fix de localização (§8) flua nas mensagens.

## 8. Componente 5 — Localização de golpes

Os JSONs de dados são gerados por `build/refresh-meta.js` (editar à mão é sobrescrito). Adicionar
`MOVE_PT_OVERRIDE` em `lib/refdata.js` (dicionário `moveId → nome PT`) consumido por `_moveName`
em `analysis.js` como fallback **antes** do humanizado-inglês. Enumerar os 15 `moveId` sem
`namePt` na implementação e preencher o override; robusto a regenerações.

## 9. Plumbing — `analyze` em 2 passadas

```
analyze(fileData, ...):
  list = enrichCollection(...)
  evoCandidates = _buildEvoCandidates(meta)
  // Passada 1: meta + tags (sem ações/veredito)
  for e in list:
    e.pvpMeta = ...; e.pveMeta = ...; _attachMovesetViews; e.isRocketReady = ...
    e.tags = computeTags(e)
  owned = _buildOwnedKeepers(list)              // índice de posse
  // Passada 2: ações + veredito
  for e in list:
    e.action = computeAction(e, evoCandidates, owned, meta)
    v = computeVerdict(e); e.verdict = v.verdict; e.reason = v.reason
    e.tradeBoost = tradeBoost(e); e.movesetTip = _secondChargeTip(e, meta)
```

`metaEvo`/`metaEvoTarget` deixam de ser campos de estado frouxos; viram resultado da projeção
(ou são removidos se nada mais os consome — verificar `render.js` e `computeCounts`).
`computeCounts.evoluir` continua contando `action.kind === 'EVOLUIR'`.

## 10. Testes

Em `pokemon/test/` (Node, mesmo padrão dos existentes; usar fixtures de `pokemon/fixtures/`):

- **Projeção dispara:** cópia com IVs bons cuja evolução é meta → EVOLUIR com mensagem certa.
- **Projeção não dispara:** Zweilous 58% → Hydreigon não tagueia → sem EVOLUIR.
- **Posse:** se já existe Venusaur keeper na lista, Bulbasaur duplicado fraco não sugere EVOLUIR.
- **Colecionável:** XS/costume não sugere EVOLUIR; **shiny sugere** (regressão da regra de jogo).
- **Rocket:** sombrio 40% com Frustração → sem AGUARDAR_ROCKET; sombrio meta com Frustração → sim.
- **Localização:** golpe sem `namePt` mas com override → nome PT; sem override → humanizado.
- **Regressão:** rodar a **suíte inteira** (`pokemon/` tem `package.json` com runner) — shape
  compartilhado entre enrich/analyze/render quebra testes cross-file.

## 11. Impacto esperado (validar com harness real)

EVOLUIR 122 → ~20-30 · AGUARDAR_ROCKET 38 → ~8 · total de ações ~189 → ~70. Validar rodando
o motor contra `colecao.json` antes/depois e conferir que os picks remanescentes são todos
defensáveis.

## 12. Fora de escopo (YAGNI)

- Sem redesenho de UI/cards (só o conteúdo das mensagens muda).
- Sem mudar TROCAR, tradeBoost, ou a lógica de veredito base.
- Sem arestas reais de evolução nos dados (continua o proxy de base stats; suficiente).
- Sem reescrever `refresh-meta.js` para localização (override resolve).
