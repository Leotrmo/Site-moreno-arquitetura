# Fase 2 — Gate por `speciesRank` + entrada `_shadow` no PvP

**Data:** 2026-06-16
**Página:** `/pokemon`
**Fase:** 2 de 5 do [roadmap de revisão da recomendação](2026-06-15-pokemon-revisao-recomendacao-roadmap-design.md)
**Depende de:** — (independente; limpo após a Fase 1)

---

## 1. Problema (o falso positivo, medido)

O app recomendava **investir num Gyarados 100% para Liga Mestre** só por "IV rank 1
(100%)". Rodando `analyze` na coleção real (725 mons), a shortlist PvP atual é:

| Liga | Picks | Ranks de espécie |
|---|---|---|
| `pvp_great` | 11 | 7, 13, 17, 27, 38, 38, 39, **62, 75, 92, 100** |
| `pvp_ultra` | 10 | 12, 19, 21, 22, 28, 31, **64, 69, 75, 90** |
| `pvp_master` | **1** | **57** (Gyarados 100%) |

Duas patologias estruturais no código (`lib/meta/pvp.js`):

1. **`speciesRank` nunca é porta.** Em `pvpTags` (`pvp.js:133`), great/ultra gateiam por
   `spPct`/`ivRank` (qualidade da cópia) e master **só** por `ivPct >= 95`. O
   `speciesRank` já existe no objeto (`pvp[lg].speciesRank`, setado em `evalMon`), mas
   nenhuma liga o usa. Como a lista vai até top-100 (great/ultra) / top-80 (master),
   "isMeta" = "está na lista" → um hundo rank 3 e um rank 57 recebem a tag idêntica.
   Em Mestre o `ivRank 1/4096` é tautologia (todo hundo é rank 1, sem CP cap), então o
   único sinal usado, `ivPct`, não diz nada sobre a **espécie**.

2. **Sombrio lê a entrada errada.** `evalMon` (`pvp.js:107`) sempre lê
   `meta.pvpRanks[e.speciesId]`. Para um Gyarados Sombrio ele lê `gyarados`
   (master rank **57**) em vez de `gyarados_shadow` (master rank **32**), e devolve o
   moveset de raid em vez do set PvP. O `pve.js:95` já sabe preferir `_shadow`; o
   `pvp.js` não. (O dataset tem 60 entradas `_shadow`.)

---

## 2. Decisões de design (tomadas no brainstorm)

- **Escopo do gate de `speciesRank`:** as **3 ligas** (great/ultra/master), não só Mestre.
  Bate com a crítica do roadmap §2 ("em nenhuma liga entra speciesRank").
- **Corte por liga (calibração "moderada"):** great/ultra `≤ 50`, master `≤ 20`.
- **Master → 0 picks é o resultado honesto:** a coleção não tem nenhuma espécie top-20 de
  Mestre. Corte duro (rank acima do corte ⇒ sem tag), **não** "relabel marginal" (custo é
  Fase 3). O hundo segue protegido de TRANSFERIR pelos outros sinais — só perde a etiqueta
  `pvp_master` enganosa.
- **Sinal de qualidade da cópia preservado:** o gate de `speciesRank` é **ANDado** com os
  gates antigos (great/ultra: `spPct`/`ivRank`; master: `ivPct`). `speciesRank` = relevância
  da espécie; gates antigos = "sua cópia presta?". Os dois precisam passar.

---

## 3. Mudança 1 — `evalMon` prefere a entrada `_shadow`

Espelha o padrão de `pve.js:95`. Em `evalMon` (`pvp.js:107`):

```js
var pvpId = (e.isShadow && meta.pvpRanks[e.speciesId + '_shadow'])
  ? e.speciesId + '_shadow' : e.speciesId;
var ranks = meta.pvpRanks[pvpId] || {};
```

- `baseStats` **continua** vindo de `byId[e.speciesId]` — Sombrio não muda o stat-base nem
  o *rank de IV* (o multiplicador de Sombrio escala todos os 4096 IVs igual → não altera a
  posição relativa). Só a **entrada de rank** (`speciesRank`) e o **moveset recomendado**
  passam a vir da forma `_shadow`.
- **Fallback:** Sombrio sem entrada `_shadow` no dataset → degrada para a base (igual ao
  `pve.js`). Nunca regride.

Efeito no Gyarados Sombrio: master rank 57 (errado) → **32** (correto); moveset recomendado
de Mestre vira `DRAGON_BREATH/AQUA_TAIL/TWISTER` (set PvP) em vez do set de raid.

> **Nota — Purificado ≠ Sombrio.** O roadmap fala em "Shadow Gyarados", mas o export
> atual traz o Gyarados como **`PURIFIED`** (alignment; `isPurified` em `analysis.js:119`).
> Um purificado luta com stats **normais** (sem o bônus de Sombrio), então `e.isShadow` é
> `false` e a Mudança 1 **não** se aplica a ele — ele lê corretamente a entrada **base**
> `gyarados` (rank 57). Quem mata o falso positivo desse mon é a **Mudança 2** (gate
> master ≤ 20). A Mudança 1 cobre os 50 mons genuinamente Sombrios da coleção. (`isPurified`
> hoje só é usado para contagem — protegê-lo no veredito é fora do escopo desta fase.)

---

## 4. Mudança 2 — `speciesRank` vira porta em `pvpTags`/`THRESHOLDS`

```js
var THRESHOLDS = {
  great:  { spPct: 0.95, ivRank: 600, maxRank: 50 },
  ultra:  { spPct: 0.95, ivRank: 600, maxRank: 50 },
  master: { ivPct: 95,                maxRank: 20 },
};
```

`pvpTags` ANDa o corte de rank com os gates existentes:

```js
['great', 'ultra'].forEach(function (lg) {
  var L = pvp[lg];
  if (L && L.isMeta && L.speciesRank <= THRESHOLDS[lg].maxRank
      && (L.spPct >= THRESHOLDS[lg].spPct || L.ivRank <= THRESHOLDS[lg].ivRank))
    tags.push('pvp_' + lg);
});
var m = pvp.master;
if (m && m.isMeta && m.speciesRank <= THRESHOLDS.master.maxRank
    && ivPct >= THRESHOLDS.master.ivPct)
  tags.push('pvp_master');
```

`L.speciesRank` é número sempre que `isMeta` é true (vem de `rankEntry.rank`); quando
`isMeta` é false o `&&` curto-circuita em `L.isMeta`, então é seguro.

---

## 5. Resultado esperado (medido na coleção de 725)

| Liga | Antes | Depois | Sai (cauda fraca) |
|---|---|---|---|
| great | 11 | **7** | gligar r92, swalot r100, clefable r62, ninetales_alolan r75 |
| ultra | 10 | **6** | sylveon r64, tentacruel r69, stunfisk r75, sandslash_alolan r90 |
| master | 1 | **0** | **Gyarados r57/r32 — o falso positivo estrutural** |

Total PvP: 22 → 13 picks.

---

## 6. `analysis.js` — sem mudança de código necessária

As strings de rank em `analysis.js` (ações FORTALECER/Ensinar-TM, `_evolveValue`) leem
`L.speciesRank` e o `moveset` que vêm de `evalMon` → **autocorrigem** para Sombrios assim
que a Mudança 1 entra. Nenhuma edição em `analysis.js` é exigida nesta fase.

- **Nota fora de escopo:** o texto "rank `L.ivRank`/4096" em Mestre (`analysis.js:527`)
  continua degenerado (todo hundo é 1/4096). Corrigir o *display* de Mestre pertence à Fase
  4 (scoring), não aqui. Deixar como está.

---

## 7. Testes (`test/pvp.test.js`)

- **Atualizar** o teste de `pvpTags` existente (`pvp.test.js:124`): os objetos sintéticos
  (`great`/`ultra`/`master`) **não têm campo `speciesRank`** hoje (usam só `ivRank`/`spPct`)
  → com o gate novo `undefined <= maxRank` é falso e o teste quebraria inteiro. Adicionar
  `speciesRank` a cada liga (great/ultra ≤ 50, master ≤ 20 para o caso positivo).
  Acrescentar um caso `speciesRank > maxRank` ⇒ **sem** a tag.
- **Novo** — `evalMon` Sombrio lê `_shadow`: um shadow Gyarados sintético →
  `r.master.speciesRank === pvpRanks.gyarados_shadow.master.rank` (32, **não** 57) e
  `r.master.moveset` = o set Sombrio.
- **Novo** — fallback de Sombrio: espécie Sombria **sem** entrada `_shadow` → degrada para o
  rank base (lê `byId[speciesId]`).
- **Novo** — caso Gyarados ponta-a-ponta: `pvp.master` com `speciesRank` 57/32 + `ivPct` 100
  ⇒ `pvpTags` **não** retorna `pvp_master`.
- Os testes de afrouxamento (`pvp.test.js:148-161`) sobrevivem sem mudança (usam
  `speciesRank: 30 <= 50`).
- **`verdict.test.js`:** auditado — os testes montam `tags`/`pvpMeta` sintéticos à mão
  (speciesRank 5–13, todos ≤ corte) e chamam `computeAction` direto, **sem** derivar tag via
  `pvpTags`. O gate novo não os quebra. Não precisam de mudança; confirmar rodando a suíte.

---

## 8. Housekeeping (regra de ouro do CLAUDE.md)

- **Bump `sw.js`** `pokemon-leo-v18` → `v19` (mexe em `pvp.js`, cache-first).
- **Atualizar o comentário de calibração** no topo de `pvp.js` (linhas 10-17): hoje cita
  "~20 picks PvP [great 10 · ultra 9 · master 1]" → "~13 picks [great 7 · ultra 6 ·
  master 0]". Documentar o gate por `speciesRank` (relevância da espécie) ANDado com os
  gates de qualidade da cópia.
- **Rodar a suíte INTEIRA** (`npm test` de `pokemon/`), não só `pvp.test.js` — shape
  compartilhado quebra testes cross-file.

---

## 9. Critérios de aceite

- O Gyarados 100% (Sombrio ou não) **deixa de** receber `pvp_master`.
- Um pick real de Mestre (rank ≤ 20) com `ivPct >= 95` **continua** sinalizado.
- Sombrio com entrada `_shadow` exibe o rank e o moveset corretos da forma Sombria.
- `npm test` verde (suíte inteira, ~237+ testes).
- `sw.js` bumpado para `v19`.
