# Recomendação de ataques: ágil/carregado + 2º carregado — design

**Data:** 2026-06-13
**Spec-mãe:** `2026-06-07-pokemon-meta-competitivo-design.md` (camada de meta competitivo)
**Spec-irmã:** `2026-06-09-pokemon-moveset-recomendado-design.md` (exibir o moveset recomendado)

## 1. Problema

A feature anterior ("moveset recomendado visível") passou a listar os golpes recomendados
com marcação `✓`/`(falta)` — ex.: `recomendado: Contra-ataque ✓ · Soco de Gelo ✓ ·
Soco Dinâmico (falta)`. Duas lacunas restam:

1. **Não distingue ágil de carregado.** A leitura depende da ordem implícita (1º = ágil).
   Quem não domina o jogo não sabe qual golpe é rápido e quais são carregados. O dado
   `kind` (`fast`/`charge`) já existe em `meta.moves[id]`, mas o `movesetView` não o carrega.
2. **O 2º carregado não é recomendado ativamente.** Em PvP o moveset vem como
   `[ágil, carregado1, carregado2]`, mas `movesetOk` considera "1 carregado = suficiente"
   (`_missingPvpMoves` só marca carregados como faltantes se o mon não tem nenhum). Quando
   o mon já tem ágil + 1 carregado, o 2º carregado só aparece como `(falta)` no detalhe,
   sem virar recomendação — embora o 2º carregado seja decisivo em PvP (cobertura, iscar
   escudo).

## 2. Decisões (brainstorming 2026-06-13)

1. **Distinção ágil/carregado:** ícones — `⚡` (ágil) e `💥` (carregado), consistentes com
   o uso de emoji da UI (`🔁` trade, `⚔️` ação).
2. **Força da recomendação do 2º carregado:** **aviso informativo**, não ação de veredito.
   Segue a filosofia da spec-irmã (§7: "é informação, não pendência"); não mexe em
   verdict/tags/ordenação nem nas invariantes.
3. **Escopo do 2º carregado:** **só PvP.** O `bestMoveset` PvE é mono-carregado de
   propósito (DPS); um 2º carregado não ajuda raid/atacante.

## 3. Dado — `movesetView` ganha `kind` (analysis.js)

`_movesetView(rec, mine, meta)` passa a emitir `{ name, has, kind }`:

```js
function _movesetView(rec, mine, meta) {
  if (!rec || !rec.length) return null;
  const m = mine || [];
  return rec.map(function (id) {
    const mv = meta && meta.moves && meta.moves[id];
    return { name: _moveName(id, meta), has: m.indexOf(id) >= 0, kind: (mv && mv.kind) || 'charge' };
  });
}
```

- `kind` vem de `meta.moves[id].kind` (presente nos 311 golpes; default defensivo `'charge'`).
- Render continua sem acessar `meta`/`moves.json` (fronteira preservada).

## 4. Ícones ágil/carregado — `render.js`

`movesetLabel(view)` prefixa cada golpe pelo `kind`:

```js
function movesetLabel(view) {
  return view.map(function (m) {
    const icon = m.kind === 'fast' ? '⚡' : '💥';
    return icon + ' ' + esc(m.name) + (m.has ? ' ✓' : ' (falta)');
  }).join(' · ');
}
```

- Resultado: `⚡ Contra-ataque ✓ · 💥 Soco de Gelo ✓ · 💥 Soco Dinâmico (falta)`.
- Vale para as linhas PvP **e** PvE do bloco Competitivo (PvE = `⚡ … · 💥 …`).
- O texto-sentença da ação no card permanece **sem ícone** (sentença não combina com emoji
  solto); a distinção visual mora na lista do detalhe.

## 5. Recomendação do 2º carregado — `e.movesetTip` (analysis.js + render.js)

Nova função `_secondChargeTip(e, meta)`, anexada em `analyze` junto do `tradeBoost`
(após `e.tags`/`e.action`, pois usa `_bestPvpLeague` que lê `e.tags`):

```js
function _secondChargeTip(e, meta) {
  const lg = _bestPvpLeague(e);
  if (!lg || !e.pvpMeta) return null;
  const L = e.pvpMeta[lg];
  if (!L || !L.isMeta || !L.movesetOk || !L.moveset || L.moveset.length < 3) return null;
  const mine = e.moveIds || [];
  const charged = L.moveset.slice(1);                       // [carregado1, carregado2]
  const missing = charged.filter(function (c) { return mine.indexOf(c) < 0; });
  if (missing.length !== 1) return null;                    // 0 = completo; 2 não ocorre (movesetOk exige ≥1)
  return { move: missing[0], league: lg,
    reason: 'Desbloquear 2º carregado p/ ' + LEAGUE_PT[lg] + ': ' + _moveName(missing[0], meta) };
}
```

Anexação em `analyze`:

```js
e.tradeBoost = tradeBoost(e);
e.movesetTip = _secondChargeTip(e, meta);
```

Render — nova linha no card, espelhando o `trade-tip`:

```js
(e.movesetTip ? '<div class="moveset-tip">💥 ' + esc(e.movesetTip.reason) + '</div>' : '')
```

Nova classe CSS `.moveset-tip` no `index.html` (espelha `.trade-tip`).

## 6. Disparo do tip (tabela de casos)

| Estado do mon (liga PvP meta)        | `movesetOk` | `e.movesetTip` |
|--------------------------------------|-------------|----------------|
| Tem ágil + ambos carregados          | true        | `null` (completo) |
| Tem ágil + exatamente 1 carregado    | true        | **dispara** (nomeia o 2º faltante) |
| Tem ágil, nenhum carregado           | false       | `null` (ação `ENSINAR_TM` já cobre) |
| Falta o ágil                         | false       | `null` (ação já cobre) |
| Liga não-meta / moveset < 3          | —           | `null` |

Sem duplicação com a ação principal: o tip só aparece quando `movesetOk` já é verdadeiro,
faixa em que `ENSINAR_TM`/`AGUARDAR_EVENTO` não disparam.

## 7. O que NÃO muda

- `verdict`, `tags`, `kind` de ação, `movesetOk`, motores `pvp.js`/`pve.js`, casamento PT.
- Invariante §12.2 da spec-mãe (mon meta nunca TRANSFERIR) intocada.
- PvE não ganha 2º carregado.
- A ordem do moveset (`[ágil, carregado1, carregado2]`) vem do PvPoke; não recalculamos.

## 8. Casos de borda

- `kind` ausente em `meta.moves[id]` (não esperado): default `'charge'` → ícone `💥`.
- `meta` ausente (datasets não carregados): camada de meta inteira não roda; sem caminho novo.
- `_bestPvpLeague` retorna liga com tag `pvp_<lg>` mas não-meta: guard `L.isMeta` barra o tip.
- Moveset PvP com só 2 itens (1 carregado): `moveset.length < 3` → sem tip.
- sw cache: bump v15 → v16 (analysis.js, render.js, index.html mudam).

## 9. Testes (TDD, padrão do projeto)

- **analysis/verdict:** `movesetView` carrega `kind` correto (1º item `'fast'`, demais
  `'charge'`); `_secondChargeTip` dispara quando falta exatamente o 2º carregado em liga
  meta com `movesetOk`, e é `null` nos demais casos da tabela §6.
- **render:** `movesetLabel` emite `⚡`/`💥` conforme `kind`; o card renderiza a linha
  `.moveset-tip` quando `e.movesetTip` existe e a omite quando `null`.

## 10. Verificação

Suite Node completa verde **e** verificação no navegador (lição da Fase 4: `app.js` é
wiring não-coberto por teste — abrir a página real, conferir ícones ⚡/💥 no bloco
Competitivo e a linha "Desbloquear 2º carregado" em um mon meta com 1 só carregado).
