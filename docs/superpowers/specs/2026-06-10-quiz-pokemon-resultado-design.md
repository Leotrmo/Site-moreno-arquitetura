# Quiz Pokémon — resultado "com qual Pokémon você parece" — design

**Data:** 2026-06-10
**Arquivo alvo:** `quiz-pokemon/index.html` (único e autocontido; HTML + CSS + JS vanilla)

## 1. Problema

O quiz já calcula um Pokémon no final, mas a tela de resultado não passa a sensação de
"você é esse Pokémon":

- só existem **5 resultados** possíveis (Snorlax, Charizard, Gengar, Pikachu, Eevee);
- o Pokémon aparece como **emoji genérico** (🦊 para Eevee), não como o Pokémon de verdade;
- o cartão é um "Perfil de Treinador" com a **pontuação em destaque**, e o Pokémon vira
  detalhe;
- não há **explicação** ligando as respostas da pessoa ao resultado.

## 2. Decisões (brainstorming 2026-06-10)

1. **Imagem real:** sprite pixelado clássico (estilo GameBoy), ampliado com
   `image-rendering: pixelated` — combina com o LCD da Pokédex.
2. **Mais Pokémon:** 17 resultados via **perfil duplo** (mais forte + segundo mais forte).
3. **Porquê:** texto personalizado citando os perfis dominantes e respostas reais da pessoa.
4. **Tela final:** o herói é "★ VOCÊ É... ★" + sprite + nome; pontuação desce e encolhe.
5. Perguntas, timer, pontuação e sons **não mudam**.

## 3. Cálculo do resultado (perfil duplo)

Os 4 perfis já contados hoje (`t2`): `0` Conforto 🍔, `1` Intensidade 🔥,
`2` Exploração 🗺️, `3` Companhia 👥.

Contagem como hoje: cada resposta com `t2 >= 0` soma 1; a P10 (índice 9) soma 2;
bônus `rapidas >= 6` → perfil 1 ganha +2. Ordena os perfis por contagem (desempate
estável na ordem 0,1,2,3). Com `lider = ordem[0]`, `segundo = ordem[1]`:

1. `cont[lider] === 0` → **Eevee** (tudo neutro, ex.: só timeouts);
2. `cont[lider] === cont[ordem[2]]` (empate triplo ou maior) → **Eevee** (equilibrado);
3. `cont[lider] - cont[segundo] >= 3` **ou** `cont[segundo] === 0` → **perfil puro** do líder;
4. senão → **par** (líder + segundo).

As regras antigas específicas (`vantagem >= 2`, `escolheuParceiro`, `cont[3] >= 3`) saem —
o peso 2 da P10 já puxa o perfil correspondente, e a matriz cobre o resto.

`calcularResultado()` passa a devolver `{ chave, lider, segundo }` e o resultado é
guardado em variável (`resultadoFinal`) para a tela, o porquê e o compartilhar não
recalcularem cada um por si.

## 4. Tabela de resultados (17 Pokémon)

Chave = `String(lider)` (puro), `String(lider) + String(segundo)` (par) ou `'eq'` (Eevee).
Cada entrada: `{ nome, dex, emoji, frase }` (`dex` = número na Pokédex nacional, usado
na URL do sprite; `emoji` = fallback offline).

| Chave | Pokémon | Dex | Emoji |
|---|---|---|---|
| `0` | SNORLAX | 143 | 😴 |
| `01` | BLASTOISE | 9 | 🐢 |
| `02` | SLOWPOKE | 79 | 🦥 |
| `03` | JIGGLYPUFF | 39 | 🎤 |
| `1` | CHARIZARD | 6 | 🔥 |
| `10` | ARCANINE | 59 | 🐕 |
| `12` | PIDGEOT | 18 | 🦅 |
| `13` | DRAGONITE | 149 | 🐉 |
| `2` | GENGAR | 94 | 👻 |
| `20` | PSYDUCK | 54 | 🦆 |
| `21` | MEWTWO | 150 | 🔮 |
| `23` | MIMIKYU | 778 | 🎭 |
| `3` | PIKACHU | 25 | ⚡ |
| `30` | TOGEPI | 175 | 🥚 |
| `31` | LUCARIO | 448 | 🥋 |
| `32` | LAPRAS | 131 | 🌊 |
| `eq` | EEVEE | 133 | 🦊 |

Cada Pokémon ganha frase de personalidade própria em PT (1 linha, tom do quiz).
As frases dos 5 atuais podem ser mantidas/ajustadas.

## 5. Sprite

- URL: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{dex}.png`
  (sprite 96×96 do repositório aberto PokeAPI; mesmo padrão de dependência externa leve
  que o Google Fonts já estabelece).
- Render ~128px com `image-rendering: pixelated` + `drop-shadow`, no topo do cartão.
- **Pré-carrega** na tela de captura (os ~2s de suspense escondem a latência): o resultado
  é calculado em `iniciarCaptura()` e o `src` é setado ali.
- **Fallback:** `onerror` esconde o `<img>` e mostra o `<span>` de emoji (comportamento
  atual). Sem internet o quiz continua inteiro.

## 6. Bloco "por quê"

Novo bloco entre o topo do cartão e o Instinto, título `🔍 POR QUE VOCÊ?`:

- **Par:** "Seu lado mais forte é {Perfil1} {emoji1}, com um toque de {Perfil2} {emoji2}."
- **Puro:** "Seu lado {Perfil1} {emoji1} dominou de longe."
- **Eevee:** "Suas respostas se espalharam por todos os lados — versatilidade é o seu forte."

Evidência (quando houver ao menos 1 resposta do perfil líder): "Deu pra ver quando você
escolheu {TX[t1]}" — até 2 respostas reais da pessoa com `t2 === lider`, na ordem em que
foram dadas, decodificadas pela tabela `TX` existente. Para Eevee, sem frase de evidência.

## 7. Tela final

- Rótulo do topo: `★ PERFIL DE TREINADOR ★` → `★ VOCÊ É... ★`.
- Topo do cartão: sprite grande + nome + frase (herói da tela).
- Bloco "por quê" (novo) logo abaixo.
- "Instinto de Treinador" mantém pontos + porcentagem, mas compacto (fonte/padding
  menores, em linha).
- Ficha do Treinador, Compartilhar e Jogar de novo: mantidos.
- Compartilhar: "Meu Pokémon interior: {NOME} {emoji}" + frase do porquê (curta) +
  linha de pontos atual.

## 8. Verificação

Sem framework de teste no arquivo; verificação no navegador (preview):

1. Jogada completa com respostas temáticas (ex.: só comida/sofá) → confere Pokémon
   coerente, sprite carregado, porquê citando as respostas dadas.
2. `calcularResultado` exercitada via console com `respostas` sintéticas para cobrir:
   puro, par, empate triplo → Eevee, tudo timeout → Eevee.
3. Sprite com URL quebrada → emoji aparece no lugar.
4. Compartilhar → texto novo correto.
5. Screenshot da tela final como prova.
