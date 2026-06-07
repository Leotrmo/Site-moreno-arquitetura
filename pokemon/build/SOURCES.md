# SOURCES.md — Sondagem das fontes externas
Gerado em: 2026-06-07  
Branch: claude/pokemon-meta-competitivo

Esta é a fonte de verdade sobre a estrutura real das APIs externas.
Todos os dados foram obtidos ao vivo (não assumidos).

---

## 1. PvPoke — `gamemaster.json`

URL: `https://raw.githubusercontent.com/pvpoke/pvpoke/master/src/data/gamemaster.json`

### Top-level keys
```
timestamp, id, title, settings, rankingScenarios, cups, formats,
pokemonTags, pokemonTraits, fastMoveArchetypes, chargedMoveArchetypes,
pokemonRegions, shadowPokemon, greatLeagueIneligible, pokemon, moves
```

Nota: **NÃO existe** `cpMultipliers` nem `cpms` no topo do objeto.

### Estrutura de `pokemon[]` (exemplo: dex 66, Machop)
```json
{
  "dex": 66,
  "speciesName": "Machop",
  "speciesId": "machop",
  "baseStats": { "atk": 137, "def": 82, "hp": 172 },
  "types": ["fighting", "none"],
  "fastMoves": ["KARATE_CHOP", "LOW_KICK", "ROCK_SMASH"],
  "chargedMoves": ["BRICK_BREAK", "CROSS_CHOP", "LOW_SWEEP"],
  "defaultIVs": {
    "cp500": [15, 4, 13, 13],
    "cp1500": [50, 15, 15, 15],
    "cp2500": [50, 15, 15, 15]
  },
  "eliteMoves": ["LOW_KICK"],
  "level25CP": 725,
  "tags": ["shadoweligible"],
  "buddyDistance": 3,
  "thirdMoveCost": 50000,
  "released": true,
  "family": { "id": "FAMILY_MACHOP", "evolutions": ["machoke"] }
}
```

### Estrutura de `moves[]` — distinção fast vs charged

Total: 331 movimentos (98 fast + 232 charged + 1 neutro = TRANSFORM).

**Regra de distinção:**
- **Fast move**: `energyGain > 0` (e `energy === 0`)
- **Charged move**: `energy > 0` (e `energyGain === 0`)
- **Neutro** (TRANSFORM): `energy === 0` e `energyGain === 0` — marcado com `"unlisted": true`

### (a) Confirmação: `gm.moves[]`

**SIM**, cada move tem um campo `name` (display name em inglês).

Chave que distingue fast vs charged: **`energyGain`** (> 0 = fast) e **`energy`** (> 0 = charged). NÃO usa energia negativa — `energy` nunca é negativo nesta fonte.

**Fast move real (BUG_BITE):**
```json
{
  "moveId": "BUG_BITE",
  "name": "Bug Bite",
  "abbreviation": "BBi",
  "type": "bug",
  "power": 4,
  "energy": 0,
  "energyGain": 3,
  "cooldown": 500,
  "archetype": "Multipurpose",
  "turns": 1
}
```

**Charged move real (ANCIENT_POWER):**
```json
{
  "moveId": "ANCIENT_POWER",
  "name": "Ancient Power",
  "type": "rock",
  "power": 60,
  "energy": 45,
  "energyGain": 0,
  "cooldown": 500,
  "buffs": [1, 1],
  "buffTarget": "self",
  "buffApplyChance": ".1",
  "archetype": "Boost",
  "turns": 1
}
```

---

## 2. PvPoke — Rankings

URLs:
- Great: `.../rankings-1500.json`
- Ultra: `.../rankings-2500.json`
- Master: `.../rankings-10000.json`

### (b) Confirmação: `rankings-1500.json`

**SIM**, é um array ordenado por rank (index 0 = rank 1, o melhor).

- `rankings-1500.json`: 1129 entradas (Great League)
- Elementos têm: `speciesId`, `speciesName`, `moveset` (array de move-id strings), `score`, `rating`, `stats`

**Elemento completo do rank[0] (Lickilicky em Great League):**
```json
{
  "speciesId": "lickilicky",
  "speciesName": "Lickilicky",
  "rating": 647,
  "moveset": ["ROLLOUT", "BODY_SLAM", "SHADOW_BALL"],
  "score": 94,
  "scores": [92.9, 83.7, 95, 94, 81, 88.4],
  "editorScore": 95,
  "stats": { "product": 2124, "atk": 105.7, "def": 125.5, "hp": 160 },
  "moves": {
    "fastMoves": [{"moveId": "ROLLOUT", "uses": 96291}, ...],
    "chargedMoves": [{"moveId": "BODY_SLAM", "uses": 64501}, ...]
  },
  "matchups": [...5 melhores oponentes...],
  "counters": [...5 piores oponentes...]
}
```

Nota: `moveset` é o conjunto recomendado (1 fast + 2 charged), `score` é 0-100.

---

## 3. PokeMiners — Game Master

URL: `https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json`

### Estrutura do topo
O JSON **É um array** (não objeto), com 18.152 entradas.
Cada entrada tem `{ "templateId": "...", "data": { "templateId": "...", <tipo>: {...} } }`.

### (c) Confirmação: templateId de combat moves

Formato exato: `COMBAT_V{NNNN}_MOVE_{MOVE_NAME}` (com sufixo `_FAST` para fast moves).

Exemplos:
- **Fast move**: `COMBAT_V0241_MOVE_ROCK_SMASH_FAST`
- **Charged move**: `COMBAT_V0013_MOVE_WRAP`

O campo `combatMove.uniqueId`:
- **Fast moves**: inclui o sufixo `_FAST` (ex: `"ROCK_SMASH_FAST"`)
- **Charged moves**: NÃO tem sufixo (ex: `"WRAP"`)
- **Exceção**: 12 entradas têm `uniqueId` como **número inteiro** (não string), p.ex. Aura Wheel (ids 406, 407) e Dynamax Cannon (482) — provavelmente entradas sem nome ainda.

**Fast move (ROCK_SMASH_FAST):**
```json
{
  "templateId": "COMBAT_V0241_MOVE_ROCK_SMASH_FAST",
  "data": {
    "templateId": "COMBAT_V0241_MOVE_ROCK_SMASH_FAST",
    "combatMove": {
      "uniqueId": "ROCK_SMASH_FAST",
      "type": "POKEMON_TYPE_FIGHTING",
      "power": 9,
      "vfxName": "rock_smash_fast",
      "durationTurns": 2,
      "energyDelta": 7
    }
  }
}
```

**Charged move (WRAP):**
```json
{
  "templateId": "COMBAT_V0013_MOVE_WRAP",
  "data": {
    "templateId": "COMBAT_V0013_MOVE_WRAP",
    "combatMove": {
      "uniqueId": "WRAP",
      "type": "POKEMON_TYPE_NORMAL",
      "power": 60,
      "vfxName": "wrap",
      "energyDelta": -45,
      "buffs": { "targetDefenseStatStageChange": -1, "buffActivationChance": 1 }
    }
  }
}
```

Nota: nesta fonte, `energyDelta` é **positivo** para fast moves (ganho) e **negativo** para charged moves (custo). Ao contrário do PvPoke.

---

## 4. PokeMiners — i18n PT-BR

URL: `https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_brazilianportuguese.json`

### Estrutura
O JSON é um **objeto** com uma única chave `"data"` cujo valor é um **array plano de strings** alternando chave/valor (72.812 entradas totais, 419 entradas de `move_name_`).

Estrutura: `{ "data": ["chave1", "valor1", "chave2", "valor2", ...] }`

### (d) Confirmação: formato das chaves i18n

Formato exato: `move_name_{NNNN}` com **4 dígitos e zero-padding** (sempre).

Exemplos reais:
- `move_name_0001` => `"Trovoada de Choques"`
- `move_name_0241` => `"Esmagamento de Pedras"` (= ROCK_SMASH)
- `move_name_0483` => `"Canhão Dinamax"`

O número em `move_name_0241` corresponde ao número em `COMBAT_V0241_MOVE_ROCK_SMASH_FAST` — **o mapeamento é direto pelo índice numérico com zero-padding de 4 dígitos**.

---

## Resumo das confirmações

| # | Pergunta | Resposta |
|---|----------|----------|
| (a) | `gm.moves[]` tem `name`? | **SIM** (English display name). Fast: `energyGain > 0`. Charged: `energy > 0`. |
| (b) | Rankings são array ordenado por rank? | **SIM**. Index 0 = rank 1. Campos: `speciesId`, `moveset`, `score`, `rating`, `stats`. |
| (c) | Formato `templateId` do PokeMiners? | `COMBAT_V0241_MOVE_ROCK_SMASH_FAST`. `uniqueId` = `"ROCK_SMASH_FAST"` (fast tem `_FAST`; charged não tem). |
| (d) | Formato chave i18n, zero-padding? | `move_name_0241` (4 dígitos). `move_name_0241` => `"Esmagamento de Pedras"`. |

## Surpresas / Concerns

1. **12 entradas com `uniqueId` numérico** no PokeMiners GM (não string): Aura Wheel Electric (406), Aura Wheel Dark (407), Dynamax Cannon (482), e 9 outros. O código de transformação deve fazer `typeof uniqueId === 'string'` antes de usar `endsWith('_FAST')`.
2. **`cpMultipliers`/`cpms` ausente** no PvPoke gamemaster — se futuramente necessário, precisará de outra fonte.
3. **TRANSFORM** tem `energy === 0` e `energyGain === 0` com `unlisted: true` — caso especial que não é fast nem charged.
