# Revisão da análise automática de Pokémons — foco na seção TRANSFERIR

**Data:** 2026-06-05
**Escopo:** `pokemon/lib/analysis.js`, `pokemon/lib/render.js`, `pokemon/index.html` (CSS do comparador), `pokemon/test/*`
**Motivação:** o usuário não confia na seção TRANSFERIR e teme transferir Pokémons valiosos. Caso-pivô: dois Xatu, um XS com IV 80% e PC 909, outro normal com IV 77,8% e PC 1482. A regra atual sugeria TRANSFERIR para o segundo sem explicar por quê e sem permitir comparação.

## Perfil do usuário

O usuário joga em todos os perfis (PvP, Raid, coleção, casual). Conclusão: o algoritmo deve ser **conservador por padrão** — proteger todo sinal de valor antes de sugerir transferência, e tornar a sugestão de TRANSFERIR auto-explicativa quando aparecer.

## Seção 1 — Nova lista de "protegido"

Pokémons protegidos nunca aparecem em TRANSFERIR.

**Já existentes (mantidos):** Shiny, Lucky, Shadow, Lendário/Mítico, Costume, Hundo (100%), Quase-perfeito (≥96%), XXS, XXL.

**Adicionados nesta revisão:**

| Sinal | Detecção (no objeto enriquecido) | Justificativa |
|---|---|---|
| **XS comfort** | `sizeScalar < 0.70` onde `sizeScalar = mon_height / BASE_H[mon_number]` | Pega XS com folga. Sem falso positivo de fronteira. Xatu 1 (scalar 0,63) entra; Xatu 2 (0,78) não entra (e o jogo concorda — não mostra XS). |
| **XL comfort** | `sizeScalar > 1.40` | Espelho do XS comfort. |
| **2º carregado** | `mon_move_3` truthy | Usuário gastou poeira + doce para abrir o segundo ataque carregado. Sinal forte de investimento. |
| **Trade evolution** | `refdata.TRADE_EVO.has(mon_number)` | Moeda de troca com amigos (doce grátis na evolução). |
| **Regional** | `refdata.REGIONAL.has(mon_number)` | Raro de pegar de volta. |

**Validação no caso-pivô:**
- Xatu 1 (scalar 0,63) → protegido por XS comfort → **MANTER**.
- Xatu 2 (scalar 0,78) → sem proteção. Mas como Xatu 1 é melhor IV (80 > 77,8), Xatu 2 é duplicata pior com IV 77,8% (<80%) → **TRANSFERIR** (mas com card expandível — Seção 3).

## Seção 2 — Regra do veredito (pseudocódigo)

```
para cada pokemon e:
  proteções = isProtected(e)   // lista da Seção 1
  melhorDaEspécie = e tem o maior IV da sua espécie (desempate: maior PC)
  únicaCópia = só existe 1 dessa espécie

  se proteções:
    se hundo OU quase-perfeito OU (melhorDaEspécie E IV ≥ 90%):
      → INVESTIR
    senão:
      → MANTER (razão = motivo da raridade, ex: "XS — colecionável")

  senão se únicaCópia OU melhorDaEspécie:
    se melhorDaEspécie E IV ≥ 90%:
      → INVESTIR
    senão:
      → MANTER (razão = "Única cópia da espécie" ou "Melhor cópia · IV X%")

  senão (duplicata pior):
    se IV < 80%:
      → TRANSFERIR (com card expansível — Seção 3)
    senão:
      → MANTER (razão = "Duplicata ok · IV X%")
```

**Constantes:**
- Limiar de TRANSFERIR: `IV < 80%` (mantido — com tantas proteções na frente, quem chega aqui é mesmo duplicata genuinamente ruim).
- Desempate "melhor da espécie": IV-desc, PC-desc (mantido).
- Limiar de INVESTIR: `IV ≥ 90%` em best-of-species (mantido).
- PC nunca é critério isolado.

**Prioridade da razão** quando múltiplas proteções batem ao mesmo tempo (mais forte → mais fraca):
Hundo → Quase-perfeito → Shiny → Lendário → Lucky → Shadow → Costume → XXS/XXL → XS/XL comfort → 2º carregado → Trade evolution → Regional.

## Seção 3 — Card TRANSFERIR + comparador

### Estado fechado (lista)

```
Xatu                          ❌ TRANSFERIR
77% · CP 1482
Você já tem um Xatu melhor
                          [ Comparar ▾ ]
```

### Estado expandido

```
Xatu                          ❌ TRANSFERIR
77% · CP 1482
Você já tem um Xatu melhor
                          [ Comparar ▴ ]
┌─────────────────────────────────────────┐
│           ESTE       vs      MELHOR     │
│ PC        1482               909        │
│ IV total  77,8%      ✖       80,0%   ✔  │
│ Atk       13                 13         │
│ Def       14         ✔       11         │
│ HP        8          ✖       12      ✔  │
│ Tamanho   Normal             XS      ✔  │
│ 2º carr.  não                não        │
│ Ataques   Bicada             Golpe de Ar│
│           Vento Ominoso      Ás dos Ares│
│ Badges    —                  —          │
└─────────────────────────────────────────┘
```

### Regras visuais do comparador

- **✔ verde** ao lado do valor melhor de cada linha; **✖ vermelho** ao lado do pior.
- Linhas empatadas (ex: Atk 13/13) ficam **neutras** (sem ✔/✖).
- **PC nunca recebe ✔/✖** — PC atual é função do nível, não do potencial. O comparador exibe os dois para informação, mas não marca diferença.
- Tamanho recebe ✔ se um lado for XS/XL/XXS/XXL e o outro Normal.
- "2º carregado" recebe ✔/✖ se um tem e o outro não.
- Badges listadas em rodapé, separadas por `·`. Se ambos não têm badges: mostra `—`.
- Comparador renderizado dentro da função `detailHtml` existente em `render.js`, sem nova lib.
- Card começa fechado por padrão. Estado controlado pelo mesmo padrão de expansão dos outros cards.

### Casos de borda

- `únicaCópia` nunca cai em TRANSFERIR; o comparador não precisa lidar com esse caso.
- Quando o "melhor" tem proteções que este também tem (ex: ambos shiny): comparador exibe normalmente, sem ✔/✖ no critério empatado.
- O "melhor da espécie" usado na comparação é o `isBestOfSpecies = true` do grupo (mesmo objeto que `enrichCollection` já calcula).

## Seção 4 — Mudanças concretas, badges, copy, testes, fora de escopo

### 4.1 — Campos novos no objeto enriquecido

Adicionados em `enrichOne`:

```js
e.sizeScalar       // número (mon_height / BASE_H[mon_number]); null se BASE_H não tem a espécie
e.isXSComfort      // sizeScalar != null && sizeScalar < 0.70 && size === 'XS'
e.isXLComfort      // sizeScalar != null && sizeScalar > 1.40 && size === 'XL'
e.hasSecondCharge  // !!mon.mon_move_3
```

`isProtected(e)` passa a incluir os novos campos. `specialReason(e)` ganha branches para XS comfort, XL comfort, `hasSecondCharge`, `isTradeEvo`, `isRegional`, seguindo a prioridade definida na Seção 2.

### 4.2 — Razões (copy)

| Caso | Texto da razão |
|---|---|
| `isExtremeSize` (XXS/XXL) | `"Tamanho XXS — raro"` ou `"Tamanho XXL — raro"` (mantém) |
| `isXSComfort` | `"XS — colecionável"` |
| `isXLComfort` | `"XL — colecionável"` |
| `hasSecondCharge` | `"Tem 2º carregado — investido"` |
| `isTradeEvo` | `"Trade evolution — guarde pra troca"` |
| `isRegional` | `"Regional — raro de pegar"` |
| Card TRANSFERIR (texto principal) | `"Você já tem um {nome} melhor"` |

### 4.3 — Badges (em `render.js → badgesHtml`)

Adicionar:
- `XS` quando `isXSComfort` (mesmo estilo dos XXS/XXL existentes).
- `XL` quando `isXLComfort`.
- `⚡` (ou label `2nd`) quando `hasSecondCharge`.

`TROCAR_EVO` e `REGIONAL` já têm badges; não muda nada.

### 4.4 — Testes a adicionar

Em `pokemon/test/`:

- **analysis.test.js** (criar se não existir, ou estender `verdict.test.js`):
  - XS comfort (scalar 0,63) → protegido.
  - XS fronteira (scalar 0,75) → **não** protegido (apesar de `size === 'XS'`).
  - XL comfort (scalar 1,45) → protegido.
  - `mon_move_3` presente → protegido.
  - `TRADE_EVO` → protegido.
  - `REGIONAL` → protegido.
- **verdict.test.js**:
  - Caso-pivô dos dois Xatus: `{Xatu 1 → MANTER, Xatu 2 → TRANSFERIR}` com razões corretas.
- **render.test.js**:
  - Comparador renderiza ✔/✖ nas linhas onde há vencedor.
  - Comparador omite ✔/✖ em linhas empatadas.
  - PC nunca recebe ✔/✖ mesmo quando difere.
  - Lista de ataques aparece dos dois lados.
  - Badges aparecem no rodapé do comparador.

### 4.5 — Fora de escopo

- Detecção de legacy/elite moves (exigiria DB de movesets atualizado).
- Cálculo de PvP rank (StatProduct) — `mon_pvp_stats` segue só para exibição do já existente.
- Mudanças em INVESTIR (regra ≥90% IV está OK).
- 4º veredito "REVISAR" — o comparador resolve essa função.
- Botão "marcar como transferido" / checklist — escopo de outro PR se aparecer demanda.

## Resumo do impacto esperado

- **Lista TRANSFERIR encolhe significativamente** (mais proteções).
- Quando um Pokémon aparece em TRANSFERIR, o card auto-explica e permite comparação visual antes do usuário agir no jogo.
- Caso-pivô (dois Xatu): Xatu 1 vira `MANTER · XS — colecionável`; Xatu 2 vira `TRANSFERIR` com comparador, e o usuário pode validar de bate-pronto que faz sentido.
