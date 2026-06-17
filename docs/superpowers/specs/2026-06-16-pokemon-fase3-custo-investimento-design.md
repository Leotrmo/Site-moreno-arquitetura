# Fase 3 — Modelo de custo de investimento (design)

**Data:** 2026-06-16
**Página:** `/pokemon`
**Roadmap:** Fase 3 de 5 (ver
`docs/superpowers/specs/2026-06-15-pokemon-revisao-recomendacao-roadmap-design.md`, §6).
**Depende de:** Fase 1 (colisão de golpe → IDs corretos dos golpes que faltam, PR #34) e
Fase 2 (gate por `speciesRank` + entrada `_shadow` no PvP, PR #35). Ambas já entregues
(branch em SW `pokemon-leo-v19`).

---

## 1. Objetivo e critérios de aceite

Estimar, por mon, o **custo restante** para deixá-lo pronto para o papel recomendado e
exibi-lo, em **números concretos enxutos**, nas razões de ação. Aceite (do roadmap §6):

- Custo aparece nas ações de **FORTALECER** e **Ensinar-TM**.
- **Sombrio** reflete a sobretaxa de **+20%** (poeira e doce).
- **Suíte inteira verde** (`npm test` a partir de `pokemon/`).

Forma do custo na linha de ação (decidido): **números concretos, enxutos** — ex.:
`~125k poeira · 248 doces · 296 Doce XL · 1 TM` (omite componentes zero).

---

## 2. Contexto que molda o design (achados do código)

- **O export não traz nível.** `colecao.json.fileData[*]` tem `mon_cp`, IVs
  (`mon_attack/defence/stamina`), mas **não** `mon_level`. O custo precisa **derivar o
  nível atual invertendo a fórmula de CP** (`pvp.js` já tem `cpFor`) e custear só o
  **restante** até o nível-alvo.
- **O custo aparece em `reason` (string).** Os ramos FORTALECER / Ensinar-TM de
  `computeAction` (`lib/analysis.js`) montam razões legíveis; o custo é um **sufixo**
  anexado a essas strings. `render.js` já exibe `reason`/`action.reason` — sem mudança lá.
- **Degradação graciosa é obrigatória.** `computeAction` é testado com mons **mínimos**
  (sem `cp`/`ivs`/`speciesId` — ver `test/verdict.test.js`). O custo deve ser calculado
  onde há dado completo, anexar só quando presente, e **sumir** quando faltar dado — para
  a suíte cross-file continuar verde (lição da Fase 2: shape compartilhado quebra testes).
- **Sombrio.** A sobretaxa de custo (+20% poeira/doce) é um eixo **novo**, independente das
  multiplicações de combate Sombrio que o `pve.js` já modela (`SHADOW_ATK_MULT` etc.).
- **`pvp.js` exporta** `cpFor`, `bestLevelUnderCap`, `CP_CAPS`, `LEVEL_CAP` — toda a
  matemática de CP/nível que o custo reusa.

---

## 3. Abordagens consideradas (fronteira do módulo)

Ponto de decisão: *onde mora a lógica de "qual nível / quanto custa".*

- **(A) `cost.js` coeso, reusando `pvp.js` — ESCOLHIDA.** `cost.js` é puro e dono de tudo
  de custo (inversão CP→nível, tabelas, somatório, formatação), reusando
  `PokePvp.cpFor`/`bestLevelUnderCap`/`CP_CAPS` pelo padrão dual (igual `analysis.js` reusa
  match/pvp/pve). Não duplica a fórmula de CP (sem drift). Carrega depois de `pvp.js`.
- (B) `cost.js` 100% standalone — duplicaria `cpFor`/`bestLevelUnderCap`; risco de divergir
  da fórmula canônica. Rejeitada (DRY).
- (C) Espalhar nível-alvo em `analysis.js`, `cost.js` só aritmética — dilui a
  responsabilidade; `analysis.js` já tem ~29 KB. Rejeitada.

---

## 4. Arquitetura — novo `lib/meta/cost.js` (puro, global `PokeCost`)

Padrão de módulo dual (browser global + `require` nos testes) preservado, idêntico a
`pvp.js`/`pve.js`. Dependência de `PokePvp` resolvida por `require('./pvp.js')` no Node e
global `PokePvp` no browser.

### Tabelas-constante (embutidas no módulo)

Constantes do jogo no topo do módulo (mesma escolha de `CP_CAPS`/`THRESHOLDS` em `pvp.js` e
`PVE` em `pve.js`) — **não** vão para `data/` (que é "gerado, não editar à mão" por
CLAUDE.md) nem para `refdata.js`:

- `POWERUP_DUST` / `POWERUP_CANDY`: poeira/doce por **meio-nível** (passos 1.0→1.5→…→40).
- `POWERUP_XL`: Doce XL por meio-nível na faixa **40→50**.
- `SHADOW_DUST_MULT = 1.2`, `SHADOW_CANDY_MULT = 1.2`.
- `PVE_TARGET_LEVEL = 40` (teto de investimento PvE; ver §6).

Os **valores numéricos exatos** são constantes documentadas do jogo; preenchidos na
implementação e **validados nos testes** contra pontos de referência conhecidos (somatórios
1→40 etc.).

### API (todas puras)

```
PokeCost = {
  POWERUP_DUST, POWERUP_CANDY, POWERUP_XL,
  SHADOW_DUST_MULT, SHADOW_CANDY_MULT, PVE_TARGET_LEVEL,

  levelForCp(baseStats, ivs, cp, cpmList),    // inverte CP→nível (usa PokePvp.cpFor); null se faltar dado
  powerUpCost(fromLevel, toLevel, isShadow),  // → { dust, candy, xlCandy }; from>=to → tudo 0
  tmCost(missingMoveIds, eliteMoves),         // → { normal, elite }
  estimate(input),                            // façade; → obj completo ou null
  format(estimate),                           // → string enxuta (omite zeros) ou ''
}
```

`estimate(input)` recebe
`{ baseStats, ivs, cp, isShadow, context, missingMoves, eliteMoves, cpm }` e devolve:

```
{ fromLevel, toLevel, dust, candy, xlCandy, tm: { normal, elite }, shadow }
```

…**ou `null`** quando faltar `baseStats`/`ivs`/`cp` (gatilho da degradação graciosa, §7).
`context` é `{ kind: 'pvp', league }` ou `{ kind: 'pve', role }`.

---

## 5. Modelo de custo (o miolo)

- **Poeira/doce por nível.** `fromLevel = levelForCp(baseStats, ivs, cp, cpm)` (nível atual
  derivado do CP); custo = somatório dos passos `fromLevel → toLevel` em
  `POWERUP_DUST`/`POWERUP_CANDY`. Se `from >= to` → custo 0 (não dá para "despowerar").
- **Doce XL p/ nível 50 (Mestre).** Passos acima de L40 consomem `POWERUP_XL` em vez de
  doce comum → `xlCandy > 0` somente quando `toLevel > 40`.
- **Sobretaxa de Sombrio (+20%).** `isShadow` → `dust ×1.2` e `candy`/`xlCandy ×1.2`
  (arredondado). Eixo independente das mults de combate do `pve.js`.
- **TMs / Elite TM faltando.** Para cada golpe do moveset-alvo que o mon não tem, classifica
  em `elite` (está em `species.eliteMoves` → `e.eliteMoves`) ou `normal`. Exibição:
  `1 TM` / `2 TM (1 Elite)`.

### Política de nível-alvo (decidida)

- **great / ultra:** `PokePvp.bestLevelUnderCap(base, ivs, cpm, CP_CAPS[liga]).level`
  (nível que estoura o CP cap da liga).
- **master:** L50 (`PokePvp.LEVEL_CAP`) → ativa Doce XL.
- **PvE (raid / gym_atk):** **L40** (`PVE_TARGET_LEVEL`, sem XL) — baseline da maioria dos
  jogadores; L50 é nicho. Mudança futura = trocar a constante/política.

---

## 6. Formatação (`PokeCost.format`)

Pura, dentro de `cost.js` (não precisa de meta — usa contagens, não nomes de golpe):

- Omite componentes zero.
- Poeira abreviada em milhares: `~125k poeira` (k = mil).
- Doce comum e Doce XL como inteiros: `248 doces`, `296 Doce XL`.
- TM: `1 TM` ou, com Elite, `2 TM (1 Elite)`.
- Separador entre componentes: ` · `. Exemplo completo:
  `~270k poeira · 296 Doce XL · 1 TM`.
- Sem componentes (custo todo zero) → devolve `''` (nenhum sufixo é anexado).

---

## 7. Integração em `lib/analysis.js`

A estimativa é calculada **dentro de `computeAction`** (já recebe `meta` e conhece o
contexto liga/papel), buscando `baseStats` em `meta.speciesIndex.byId[e.speciesId]` e
`cpm` em `meta.cpm`. O sufixo é anexado ao `reason` via `PokeCost.format(...)`; o objeto
estruturado é guardado em `e.action.cost` (para `render.js` / fases futuras).

Ações que recebem o sufixo de custo:

- **FORTALECER (PvP e PvE):** `missingMoves = []` → só power-up. Ex.:
  `Fortalecer p/ Liga Mestre — rank 18 da espécie, seu IV PvP 100% · ~270k poeira · 296 Doce XL`.
- **Ensinar-TM (PvP e PvE):** power-up + TM. Ex.:
  `Ensinar/TM p/ Liga Grande — Top 13, falta Focinhada · ~75k poeira · 1 TM`.
- **AGUARDAR_EVENTO e AGUARDAR_ROCKET:** recebem o **mesmo** sufixo. Motivo: pela roteação
  atual, golpe **Elite/legado** faltando cai em `AGUARDAR_EVENTO` (e Sombrio+Frustração em
  `AGUARDAR_ROCKET`) **antes** de Ensinar-TM — então é aqui que o custo de **Elite TM**
  realmente aparece. Sem isso, `tm.elite` nunca seria exibido (decisão confirmada: incluir).

### Degradação graciosa (protege a suíte cross-file)

Os testes de `computeAction` usam mons mínimos (sem `cp`/`ivs`/`speciesId`) → `estimate`
devolve `null` → `format(null)` = `''` → `reason` idêntico ao atual → asserções existentes
(`/Fortalecer/`, `/Grande/`, `/Ensinar|TM/`, etc.) continuam passando. **Nenhuma regressão.**

`estimate` também devolve `null` quando `meta.speciesIndex` não tem `baseStats` para o
`speciesId`, fechando o caminho de degradação.

---

## 8. Wiring obrigatório (regras de ouro do CLAUDE.md)

- **`index.html`:** inserir `<script src="./lib/meta/cost.js"></script>` **depois de
  `lib/meta/pve.js` e antes de `lib/analysis.js`** (entre as linhas 343 e 344 atuais).
  `cost.js` depende de `PokePvp` (global), que carrega em `pvp.js` (linha 342). ✓
- **`sw.js`:** bump `CACHE` **`pokemon-leo-v19` → `v20`** e adicionar
  `'./lib/meta/cost.js'` à lista `ASSETS`. Mexe em `cost.js` (novo), `analysis.js` e
  `index.html` — todos cache-first.

---

## 9. Plano de testes

- **`test/cost.test.js` (novo):**
  - `levelForCp`: CP+IV+baseStats de uma espécie real → nível esperado (gerar CP com
    `cpFor` num nível conhecido e inverter de volta).
  - `powerUpCost`: faixa conhecida (ex. L20→L25) bate com a soma da tabela; crossing L40
    (XL>0, doce comum **para** de crescer); Sombrio → `dust`/`candy` ≈ ×1.2.
  - `tmCost`: faltam 1 normal + 1 elite → `{ normal:1, elite:1 }`.
  - `format`: omite zeros; `1 TM` vs `2 TM (1 Elite)`; abreviação de poeira; `''` quando
    tudo zero.
  - `estimate`: master → `toLevel 50` → `xlCandy > 0`; Sombrio reflete sobretaxa; **`null`
    quando falta `baseStats`/`ivs`/`cp`**.
- **`test/verdict.test.js` (estender):**
  - FORTALECER com dados completos (via `analyze` num mon real) → `reason` contém `poeira`.
  - Sombrio vs não-Sombrio, mesma espécie/nível → poeira do Sombrio **maior** (sobretaxa
    ponta-a-ponta).
  - Confirmar que os mons mínimos de `computeAction` **não regridem** (sem sufixo).
- **Rodar `npm test` inteiro** entre o módulo puro e o wiring (shape compartilhado quebra
  cross-file — lição da Fase 2).

---

## 10. Fora de escopo (YAGNI)

- Custo de **evoluir** (doce de evolução) na ação `EVOLUIR` — eixo diferente; fica para
  quando/se a Fase 4 precisar.
- Custo de **desbloquear 2º carregado** (poeira/doce do slot) — `_secondChargeTip` já é só
  informativo; não entra no custo agora.
- Nuance de **Melhor Amigo (+1 nível)** no teto — assume teto fixo (L50/L40).
- Ajustar **scoring/veredito** com base no custo — isso é a Fase 4 (`score.js`,
  `meta × qualidade × prontidão ÷ custo`).
