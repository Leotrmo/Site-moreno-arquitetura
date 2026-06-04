# Design — Nova `/pokemon`: página inteligente de análise da coleção

- **Data:** 2026-06-04
- **Autor:** Leo (brainstorming com Claude)
- **Status:** Aprovado para planejamento
- **Arquivos atuais:** `pokemon/index.html`, `pokemon/analise.html`, `pokemon/sizes.js`, `pokemon/sw.js`, `pokemon/manifest.json`, `pokemon/Pokemons-LeoTrevisan-04-06-2026.json`

---

## 1. Contexto e problema

A página `moreno.arq.br/pokemon` analisa a coleção de Pokémon GO do Leo a partir de um JSON exportado do app. Hoje:

- O HTML (~2.800 linhas) é **reescrito à mão** a cada atualização, lendo o JSON manualmente. Isso é trabalhoso e propenso a erro — é fácil **esquecer de checar** categorias (sombrio, tamanho XXS/XXL, etc.).
- A página repete o mesmo Pokémon em **14 seções**.
- Tem uma caixa **"Como abrir no celular"** (instruções do Claude App) que não é mais necessária.
- O JSON exportado já contém **muito mais dados** do que a página usa (alinhamento sombrio/purificado, fantasia, altura para tamanho, histórico PvP).

**Objetivo central:** transformar a página numa ferramenta que decide sozinha, com clareza e sem errar, **o que manter, transferir e melhorar** em cada Pokémon — sempre considerando shiny, lucky, sombrio, lendário, fantasia e tamanho.

## 2. Objetivos

1. **Decisão clara por Pokémon:** cada um mostra um veredito (💪 Investir / 🛡️ Manter / ❌ Transferir) com o motivo.
2. **Consistência automática:** tamanho, sombrio/purificado e demais selos calculados sempre, a partir do JSON — nunca mais "esquecer".
3. **Atualização sem reescrever:** trocar um arquivo atualiza a página inteira; o Leo faz sozinho.
4. **Foco nos dois trabalhos principais:** (#1) limpar/transferir e (#2) investir (fortalecer/evoluir).

## 3. Não-objetivos (fora do v1)

- Ranking de IV por liga PvP (Grande/Ultra/Mestre) — exige cálculo de rank que o export não traz pronto.
- "Novidades/changelog" automáticas comparando com o export anterior (exigiria guardar e diferenciar exports).
- Edição de dados pela página (ela é só leitura do JSON).

---

## 4. Arquitetura — página orientada a dados

A nova página é **uma única página estática que calcula tudo no navegador** (client-side), sem build e sem servidor.

### 4.1 Fonte de dados
- A página busca um arquivo de **caminho fixo: `pokemon/colecao.json`**.
- A data "atualizado em…" e o total vêm de **dentro** do arquivo (`exportTime`, `pokemonCount`) — não ficam hardcoded no HTML.
- **Fluxo de atualização do Leo:** exportar do app → subir/substituir `pokemon/colecao.json` no GitHub. Pronto. Sem reescrever HTML, sem rodar programa.
- Na implementação, o export atual (`Pokemons-LeoTrevisan-04-06-2026.json`) é copiado para `colecao.json` como dado inicial.

### 4.2 Reuso e dados de referência
- **`sizes.js`** já existe e tem a lógica de tamanho (XXS→XXL via `getPokemonSize`). É reaproveitado tal como está.
- Datasets estáticos a embutir (pequenos arquivos JS/JSON de referência):
  - **Lendários/míticos** (conjunto de números do Pokédex) — necessário para a proteção "lendário".
  - **Regionais** (conjunto de números) — para a tag 🌍 Regional (secundário).
  - **Evolução por troca** (espécies como Kadabra, Machoke, Graveler, Haunter, Boldore, Gurdurr, Karrablast, Shelmet…) — para a tag 🤝 Trocar p/ evoluir (secundário).
  - **Capacidade de evolução** (quais espécies ainda evoluem) — para a tag 🔄 Evoluir (secundário).

### 4.3 Service worker
- Ajustar `sw.js` para **network-first também no `colecao.json`** (hoje ele só trata o HTML), garantindo que a troca do arquivo apareça. Fallback para cache quando offline.
- Bump da versão do cache.

---

## 5. Modelo de dados (por Pokémon)

Cada entrada do `fileData` é enriquecida em memória. A **chave do objeto** (ex.: `"6704624461195111630"`) é um **id único e estável** — usada para o checklist de transferência.

| Campo derivado | Origem / cálculo |
|---|---|
| `ivPct` | `round((mon_attack + mon_defence + mon_stamina) / 45 * 100)` |
| `size` | `getPokemonSize(mon_number, mon_height, mon_form)` → `XXS\|XS\|null\|XL\|XXL` |
| `isShiny` | `mon_isShiny === "YES"` |
| `isLucky` | `mon_isLucky === "YES"` |
| `isShadow` | `mon_alignment === "SHADOW"` |
| `isPurified` | `mon_alignment === "PURIFIED"` |
| `isLegendary` | `mon_number ∈ LENDÁRIOS` |
| `isCostume` | `mon_costume` presente |
| `isExtremeSize` | `size === "XXS" \|\| size === "XXL"` |
| `isHundo` | `ivPct === 100` |
| `isNearPerfect` | `ivPct >= 96` |
| `speciesKey` | `mon_number + "_" + (mon_form ou base)` |
| `isBestOfSpecies` | melhor cópia do `speciesKey` (maior `ivPct`; desempate por `mon_cp`) |
| `isOnlyCopy` | só existe 1 do `speciesKey` |

## 6. Lógica do veredito (o "cérebro") — aprovada

Para cada Pokémon, de cima pra baixo:

```
protegido = isShiny || isLucky || isShadow || isLegendary
            || isCostume || isExtremeSize || isHundo || isNearPerfect

1. Se (protegido):
     → nunca TRANSFERIR
     → se (isHundo || isNearPerfect || (isBestOfSpecies && ivPct >= 90)):  💪 INVESTIR
       senão:                                                              🛡️ MANTER (especial)

2. Senão se (isOnlyCopy || isBestOfSpecies):
     → se (ivPct >= 90 && isBestOfSpecies):  💪 INVESTIR
       senão:                                🛡️ MANTER

3. Senão (duplicata pior, não-especial):
     → se (ivPct < 80):  ❌ TRANSFERIR
       senão:            🛡️ MANTER
```

**Padrões confirmados:** sombrio sempre protege · só XXS/XXL protegem por tamanho (XS/XL viram só selo) · guarda 1 de cada espécie · transferir só com IV < 80%.

### 6.1 Motivo (texto curto no card)
Gerado a partir do traço mais relevante (prioridade: hundo → shiny → lendário → lucky → sombrio → fantasia → tamanho extremo → quase-perfeito):
- Investir: *"Perfeito (15/15/15)"* · *"Quase perfeito (98%)"* · *"Melhor cópia, IV 92%"*
- Manter (especial): *"Shiny — protegido"* · *"Sombrio — protegido"* · *"Tamanho XXL — raro"* · *"Lendário"*
- Manter (comum): *"Única cópia da espécie"* · *"Duplicata ok (IV 84%)"*
- Transferir: *"Duplicata pior · IV 24% · nada especial"*

### 6.2 Tags de ação secundárias (independentes do veredito; viram selos/filtros)
- 🔄 **Evoluir** — espécie que ainda evolui e tem IV ≥ 85%.
- 🤝 **Trocar p/ evoluir** — espécie de evolução por troca (economiza doces).
- 🌍 **Regional** — número no conjunto de regionais (alto valor de troca).

---

## 7. Estrutura da página (de cima pra baixo)

1. **Cabeçalho** — título, total (de `pokemonCount`), data (de `exportTime`), botão 🔄 "atualizar" (limpa cache e recarrega).
2. **"O que fazer agora"** — três contadores grandes e clicáveis: **❌ Transferir** · **💪 Investir** · **🛡️ Manter**. Clicar aplica o filtro de veredito.
3. **Atalhos de destaque** (chips que filtram a lista): ★ Hundos · ✨ Shinies · 👻 Sombrios · 📏 XXS/XXL · 👑 Lendários · 🍀 Lucky. Cada chip mostra a contagem.
4. **Busca + Filtros** — busca por nome; filtros por veredito, especiais (shiny/lucky/sombrio/purificado/lendário/fantasia), tamanho e tag de ação.
5. **Lista única** de cards. Cada Pokémon aparece **uma vez**. Ordenação padrão: por veredito (Investir → Manter → Transferir) e, dentro, por IV decrescente. (Filtros e busca reordenam/reduzem.)

### 7.1 O card
- Borda esquerda colorida pelo veredito + **pílula de veredito** + **motivo** em uma linha.
- **Selos sempre visíveis:** ✨ shiny · 🍀 lucky · 👻 sombrio · 💧 purificado · 👑 lendário · 🎭 fantasia · 📏 (XXS/XS/XL/XXL) · ★ hundo.
- **Toque no card → detalhe** (expandir ou modal): IVs exatos (Atq/Def/HP), CP, golpes (1/2/3), altura/peso, e histórico de batalha (`pvp_won`/`pvp_total`) quando houver.

### 7.2 Modo transferir (job #1)
- Ao filtrar **❌ Transferir**: lista enxuta com botão ✓ **"já transferi"** por item e **barra de progresso** ("X transferidos · Y restantes").
- Estado salvo em `localStorage`, **chaveado pelo id único** do Pokémon (a chave do JSON), não pelo nome — robusto contra duplicatas de mesmo nome.
- Botões: "ver pendentes" (oculta os já feitos) e "limpar marcações".

---

## 8. Limpezas incluídas

- **Remover** a caixa "📱 Como visualizar este arquivo no celular" (`id="howto"`).
- **Apagar** `pokemon/analise.html` (cópia antiga e desatualizada; o site serve `index.html`).
- **Atualizar** `sw.js` (network-first no JSON + bump de versão).

---

## 9. Critérios de sucesso

1. Trocar `pokemon/colecao.json` por um novo export atualiza **todos** os números, selos e vereditos, sem tocar no HTML.
2. Nenhum Pokémon shiny, lucky, sombrio, lendário, fantasia, hundo, quase-perfeito ou XXS/XXL é marcado como ❌ Transferir.
3. Tamanho e sombrio/purificado aparecem **sempre** que aplicáveis, sem intervenção manual.
4. Dá pra filtrar a lista por veredito e por cada destaque; a busca por nome funciona.
5. O modo transferir mantém o progresso entre visitas no mesmo aparelho.
6. A caixa "como abrir no celular" e o `analise.html` não existem mais.
7. A página carrega rápido no celular e funciona offline (com o último dado em cache).

## 10. Riscos / pontos de atenção

- **Datasets de referência** (lendários, regionais, evolução): precisam estar corretos e cobrir Gen 1–9. Erro aqui afeta proteção/labels. Mitigação: começar pelo conjunto de **lendários** (essencial pra proteção) e tratar evoluir/trocar/regional como camada secundária.
- **Formas/variações** (Alola, Hisui, etc.): o `speciesKey` deve usar `mon_form` para não misturar cópias de formas diferentes ao achar a "melhor cópia".
- **Tamanho de alturas desconhecidas:** `getPokemonSize` retorna `null` quando não há altura base — nesse caso, sem selo de tamanho (comportamento atual, ok).
```
