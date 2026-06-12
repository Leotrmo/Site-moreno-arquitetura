# Análise da Coleção com estética Pokédex — design

**Data:** 2026-06-12
**Referência visual:** `quiz-pokemon/index.html` (Pokédex retrô: moldura vermelha, lente,
LCD verde com scanlines, fontes Press Start 2P / VT323, botões pixelados)

## 1. Problema

A página de análise (`pokemon/index.html`) usa um visual dark moderno (fundo azul-escuro,
cards, chips, gradientes) que destoa do quiz (`quiz-pokemon/index.html`), que tem uma
estética de Pokédex retrô completa. O objetivo é levar a mesma estética do quiz para a
análise, mantendo todo o comportamento atual intacto.

## 2. Decisões (brainstorming 2026-06-12)

1. **Escopo visual:** Pokédex completa — moldura vermelha com lente/luzes envolvendo todo
   o conteúdo, não apenas a linguagem visual. `max-width: 520px` (um pouco mais larga que
   os 430px do quiz, para caber os dados).
2. **Tela:** LCD verde-claro `#dff2cf` com scanlines, igual ao quiz. Badges e veredictos
   redesenhados em tons escuros/saturados para contraste no fundo claro.
3. **Tipografia:** mesma divisão do quiz — Press Start 2P em títulos, veredictos, números
   dos heros e botões; VT323 (~18–20px) em nomes, stats e motivos. VT323 não tem negrito
   real: hierarquia vem de tamanho/cor. Cards ficam um pouco mais altos; custo aceito.
4. **Rolagem (opção A):** aparelho fixo na altura da janela; a lista rola **dentro** da
   tela LCD. Moldura, lente e luzes sempre visíveis. Uso real é PWA standalone no celular,
   onde rolagem interna funciona bem (sem barra de endereço nem pull-to-refresh nativo).

## 3. Estrutura (só `pokemon/index.html`)

- `body`: fundo escuro radial do quiz (`radial-gradient(circle at 50% 20%, #2a3550, #14141c)`).
- `.pokedex`: moldura vermelha `#DC0A2D`, borda `#8f0820`, altura da janela, centralizada
  com `margin: auto` — **lição do quiz:** centralização flex corta o topo de conteúdo
  alto; `margin: auto` evita.
- `.dex-top`: lente azul com reflexo, 3 luzes (vermelha piscando, amarela, verde). O botão
  🔄 atual vira o botão preto redondo do aparelho (estilo `.btn-som` do quiz), mantendo
  `onclick="forcarAtualizacao(this)"`.
- `.dex-screen` (moldura preta) → `.lcd` (verde, scanlines via `::before`,
  `overflow: hidden`, fixo) → `.lcd-scroll` (wrapper interno com `overflow-y: auto`,
  altura 100%). O overlay de scanlines fica no `.lcd` fixo — se ficasse no elemento que
  rola, rolaria junto com o conteúdo.
- Dentro de `.lcd-scroll`: título (h1 compacto), subtitle `#updated`, contador `#total`,
  hero cards, chips — tudo rola para fora. A toolbar (`#search` + `#sort` +
  `#clear-filters`) fica `position: sticky` no topo da rolagem; `#transfer-controls`
  gruda junto quando visível.
- **Todos os IDs e classes consumidos pelo JS permanecem intactos:** `#updated`, `#total`,
  `#c-transfer`, `#c-invest`, `#c-keep`, `#chips`, `#search`, `#sort`, `#clear-filters`,
  `#transfer-controls`, `#tf-filter`, `#tf-clear`, `#tf-progress`, `#empty`, `#list`,
  `.hero-card`, `.chip`, `.pk`, `.pk-top`, `.pk-detail`, `.tf-check`, `.done`.

## 4. Componentes (tradução do visual)

| Componente | Hoje | Vira |
|---|---|---|
| Card `.pk` | surface escura, borda lateral colorida | caixa de diálogo: fundo branco, borda preta 3px, sombra dura `0 3px 0 preto`, borda lateral de veredicto mais grossa e saturada |
| Veredicto (`.v-*`) | pill translúcida colorida | chip com borda preta, Press Start 2P, cor escura |
| Badges (`.b-*`) | pills translúcidas | chips com borda preta e cores escuras |
| Hero cards | cards escuros com número colorido | botões pixelados estilo `.btn-px`, efeito de apertar no toque |
| Chips de filtro | pills escuras | mini botões de diálogo (borda preta, fundo claro) |
| Busca / select | inputs escuros | caixas brancas com borda preta dupla (`box-shadow` interno), VT323 |
| Header gradiente | dourado/vermelho translúcido | some; vira o `.dex-top` do aparelho |

Mapa de cores no LCD claro (tons escuros para contraste):

- INVESTIR: verde-floresta (≈ `#1b7a2f`)
- TRANSFERIR: vermelho escuro (≈ `#c21d1d`)
- MANTER: cinza-oliva
- Hundo/PvP: dourado-queimado (≈ `#b8860b`)
- Shiny: rosa-escuro · Lucky: azul-petróleo · Shadow: roxo-escuro
- IV: perfeito = dourado-queimado, ótimo = verde-floresta, bom = azul-escuro, baixo = cinza
- PvE: laranja-escuro · Ginásio: verde-escuro · Rocket: roxo-escuro

Tons exatos ajustáveis na implementação, validando contraste sobre `#dff2cf`.

## 5. Tipografia

- Google Fonts: Press Start 2P + VT323, `display=swap`, com `preconnect` (igual ao quiz).
- Press Start 2P: h1 (~14px), números dos heros, labels de veredicto (9–10px), botões.
- VT323: todo o resto (nomes, CP, IV, motivos, detalhes), ~18–20px.
- Offline/fonte não carregada: fallback `monospace` do sistema.

## 6. PWA

- `<meta name="theme-color">`: `#0a0e14` → `#DC0A2D` (igual ao quiz).
- `manifest.json`: `theme_color`/`background_color` atualizados para combinar.
- `sw.js`: bump da versão de cache para propagar o novo visual.
- Google Fonts fica fora do cache offline (fallback monospace cobre).

## 7. Fora de escopo

- Nenhuma mudança em `app.js`, `lib/`, `render.js`, `build/`, dados ou testes.
- Nenhuma mudança de comportamento: filtros, ordenação, expandir card, modo transferir e
  refresh funcionam exatamente como hoje.
- O quiz (`quiz-pokemon/index.html`) não é tocado. CSS duplicado de propósito: cada app
  segue autocontido (padrão atual do projeto).
- Ícones do manifest não mudam.

## 8. Verificação

- Testes Node existentes (`pokemon/test/`) continuam passando — não tocam CSS/markup
  estático do index.
- Conferência visual no navegador via preview (lição registrada: validar no navegador,
  não só em Node): mobile ~390px e desktop; conferir rolagem interna, toolbar sticky,
  scanlines paradas durante a rolagem, modo transferir e expansão de card.
