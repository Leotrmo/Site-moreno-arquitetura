# Quiz Pokémon — Resultado "Você é..." Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tela final do quiz diz de verdade "com qual Pokémon você parece": 17 resultados via perfil duplo, sprite pixelado real com fallback de emoji, bloco explicando o porquê e cartão redesenhado.

**Architecture:** Tudo em `quiz-pokemon/index.html` (arquivo único, HTML+CSS+JS vanilla, sem build). Duas entregas que mantêm o quiz funcionando a cada commit: (1) motor — tabela `RESULTADOS` + `calcularResultado()` devolvendo perfil duplo, exibição ainda por emoji; (2) apresentação — sprite, bloco do porquê, cartão compacto e texto de compartilhar.

**Tech Stack:** JS vanilla (ES5-ish, padrão do arquivo), sprites estáticos do repositório PokeAPI no GitHub (sem API, só `<img>`), verificação manual no navegador via Claude Preview (não há framework de teste no projeto).

**Spec:** `docs/superpowers/specs/2026-06-10-quiz-pokemon-resultado-design.md`

---

### Task 1: Motor — tabela de 17 resultados + cálculo por perfil duplo

**Files:**
- Modify: `quiz-pokemon/index.html` (BLOCO 1 dados ~linha 744; BLOCO 2 estado ~linha 758; BLOCO 6 cálculo ~linha 991; BLOCO 7 revelação ~linha 1025; BLOCO 8 compartilhar ~linha 1081)

Sem framework de teste: a verificação é por asserções no console do navegador (preview_eval), porque `calcularResultado` e as variáveis de estado são top-level no `<script>` e ficam acessíveis ao console.

- [ ] **Step 1: Substituir a constante `MONS` por `PERFIS` + `RESULTADOS` + `SPRITE_URL`**

Apagar o bloco `const MONS = [...]` (linhas 742–750, inclusive o comentário acima dele) e colocar no lugar:

```js
    /* Os 4 perfis medidos pelas respostas (mesma ordem dos códigos t2).
       Usados no cálculo e no texto do "porquê". */
    const PERFIS = [
      { nome: 'Conforto',    emoji: '🍔' },
      { nome: 'Intensidade', emoji: '🔥' },
      { nome: 'Exploração',  emoji: '🗺️' },
      { nome: 'Companhia',   emoji: '👥' }
    ];

    /* Os 17 resultados possíveis.
       Chave: perfil puro ('0'..'3'), par líder+segundo ('01', '32'...) ou 'eq' (equilibrado).
       dex   = número na Pokédex nacional (monta a URL do sprite);
       emoji = fallback quando o sprite não carrega (ex.: sem internet). */
    const RESULTADOS = {
      '0':  { nome: 'SNORLAX',    dex: 143, emoji: '😴', frase: 'Mestre dos banquetes: sua jornada é guiada pelo estômago, e está certíssimo.' },
      '01': { nome: 'BLASTOISE',  dex: 9,   emoji: '🐢', frase: 'Tranquilo na rotina, canhão na hora H: ninguém te tira do sério à toa.' },
      '02': { nome: 'SLOWPOKE',   dex: 79,  emoji: '🦥', frase: 'O mundo corre, você aproveita: seu ritmo é seu, e tá ótimo assim.' },
      '03': { nome: 'JIGGLYPUFF', dex: 39,  emoji: '🎤', frase: 'Conforto pra você é gente por perto: você é o aconchego (e o show) do grupo.' },
      '1':  { nome: 'CHARIZARD',  dex: 6,   emoji: '🔥', frase: 'Espírito de batalha: você vive pela intensidade.' },
      '10': { nome: 'ARCANINE',   dex: 59,  emoji: '🐕', frase: 'Intenso e leal: você queima nas aventuras, mas sabe voltar pra lareira.' },
      '12': { nome: 'PIDGEOT',    dex: 18,  emoji: '🦅', frase: 'Velocidade e horizonte: você vive de vento no rosto e mapa novo.' },
      '13': { nome: 'DRAGONITE',  dex: 149, emoji: '🐉', frase: 'Força de campeão, coração de parceiro: é pelos seus que você voa.' },
      '2':  { nome: 'GENGAR',     dex: 94,  emoji: '👻', frase: 'Imprevisível: você ama o desconhecido.' },
      '20': { nome: 'PSYDUCK',    dex: 54,  emoji: '🦆', frase: 'Imprevisível e adorável: nem você sabe seu próximo passo, e é isso que encanta.' },
      '21': { nome: 'MEWTWO',     dex: 150, emoji: '🔮', frase: 'Misterioso e avassalador: você explora o desconhecido e ainda domina o jogo.' },
      '23': { nome: 'MIMIKYU',    dex: 778, emoji: '🎭', frase: 'Mistério por fora, afeto por dentro: surpreende quem ganha sua confiança.' },
      '3':  { nome: 'PIKACHU',    dex: 25,  emoji: '⚡', frase: 'Parceiro lendário: pra você, o que importa é com quem está.' },
      '30': { nome: 'TOGEPI',     dex: 175, emoji: '🥚', frase: 'Felicidade pra você tem nome: estar junto. Puro carinho concentrado.' },
      '31': { nome: 'LUCARIO',    dex: 448, emoji: '🥋', frase: 'Parceiro de batalha: leal até o fim, intenso em tudo que abraça.' },
      '32': { nome: 'LAPRAS',     dex: 131, emoji: '🌊', frase: 'Você é quem leva todo mundo pra aventura: viajar bom é viajar acompanhado.' },
      'eq': { nome: 'EEVEE',      dex: 133, emoji: '🦊', frase: 'Multipotencial: você quer de tudo um pouco.' }
    };

    /* Sprite clássico 96×96 do repositório aberto PokeAPI (só <img>, sem API) */
    const SPRITE_URL = (dex) =>
      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/' + dex + '.png';
```

- [ ] **Step 2: Guardar o resultado em estado (`resultadoFinal`)**

No BLOCO 2, logo após `let ultimoSegundoBip = -1;` (linha 765), adicionar:

```js
    let resultadoFinal = null;      // { chave, lider, segundo } calculado na captura
```

E dentro de `iniciarJogo()`, logo após `rapidas = 0;`, adicionar:

```js
      resultadoFinal = null;
```

- [ ] **Step 3: Reescrever `calcularResultado()` (perfil duplo)**

Substituir o corpo inteiro da função (linhas 991–1019) por:

```js
    function calcularResultado() {
      // Contadores dos 4 perfis (mesma ordem de PERFIS)
      const cont = [0, 0, 0, 0];

      respostas.forEach((r, i) => {
        if (r.t2 >= 0) {
          // A pergunta 10 (índice 9) vale peso 2: é o desempate oficial
          cont[r.t2] += (i === 9 ? 2 : 1);
        }
      });

      // Bônus de intensidade: muitas respostas relâmpago puxam pro perfil 1
      if (rapidas >= 6) cont[1] += 2;

      // Ordena os perfis do maior para o menor (empate mantém a ordem 0..3)
      const ordem = [0, 1, 2, 3].sort((a, b) => cont[b] - cont[a]);
      const lider = ordem[0], segundo = ordem[1];

      // Tudo neutro (só timeouts) ou empate triplo+ → equilibrado (Eevee)
      if (cont[lider] === 0 || cont[lider] === cont[ordem[2]]) {
        return { chave: 'eq', lider: -1, segundo: -1 };
      }
      // Liderança com folga (3+), ou nenhum segundo perfil → perfil puro
      if (cont[lider] - cont[segundo] >= 3 || cont[segundo] === 0) {
        return { chave: String(lider), lider: lider, segundo: -1 };
      }
      // Caso geral: par líder + segundo
      return { chave: String(lider) + String(segundo), lider: lider, segundo: segundo };
    }
```

- [ ] **Step 4: Adaptar os consumidores (`iniciarCaptura`, `revelarResultado`, `textoCompartilhar`)**

Em `iniciarCaptura()`, logo após `mostrarTela('telaCaptura');`, adicionar:

```js
      resultadoFinal = calcularResultado();   // calcula já na captura
```

Em `revelarResultado()`, trocar:

```js
      const indice = calcularResultado();
      const mon = MONS[indice];
```

por:

```js
      const mon = RESULTADOS[resultadoFinal.chave];
```

Em `textoCompartilhar()`, trocar `const mon = MONS[calcularResultado()];` por:

```js
      const mon = RESULTADOS[resultadoFinal.chave];
```

- [ ] **Step 5: Verificar no navegador (asserções de console)**

Servir a pasta e abrir no preview:

Run: `python -m http.server 8765 --directory quiz-pokemon` (em background) e abrir `http://localhost:8765/` no Claude Preview (preview_start/preview_eval). Se `python` não existir, `npx -y serve -l 8765 quiz-pokemon`.

Rodar no console (preview_eval) e conferir cada retorno:

```js
// 1. PURO: 8 votos perfil 0 contra 1 → {chave:'0'} (SNORLAX)
respostas = [
  {t1:'c1',t2:0},{t1:'c5',t2:0},{t1:'r1',t2:0},{t1:'r4',t2:0},{t1:'r7',t2:0},
  {t1:'d1',t2:1},{t1:'p3',t2:0},{t1:'p5',t2:-1},{t1:'s4',t2:-1},{t1:'f1',t2:0}
]; rapidas = 0;
JSON.stringify(calcularResultado());   // esperado: {"chave":"0","lider":0,"segundo":-1}

// 2. PAR: 4 votos perfil 0, 3 do perfil 3 → {chave:'03'} (JIGGLYPUFF)
respostas = [
  {t1:'c1',t2:0},{t1:'c5',t2:0},{t1:'r1',t2:0},{t1:'r9',t2:0},
  {t1:'r2',t2:3},{t1:'p6',t2:3},{t1:'p8',t2:3},
  {t1:'s4',t2:-1},{t1:'p5',t2:-1},{t1:'f3',t2:-1}
]; rapidas = 0;
JSON.stringify(calcularResultado());   // esperado: {"chave":"03","lider":0,"segundo":3}

// 3. EMPATE TRIPLO → {chave:'eq'} (EEVEE)
respostas = [
  {t1:'c1',t2:0},{t1:'c5',t2:0},{t1:'c2',t2:1},{t1:'d1',t2:1},
  {t1:'c6',t2:2},{t1:'s2',t2:2},
  {t1:'p5',t2:-1},{t1:'s4',t2:-1},{t1:'s5',t2:-1},{t1:'f3',t2:-1}
]; rapidas = 0;
JSON.stringify(calcularResultado());   // esperado: {"chave":"eq","lider":-1,"segundo":-1}

// 4. TUDO TIMEOUT → {chave:'eq'} (EEVEE)
respostas = []; for (let i = 0; i < 10; i++) respostas.push({t1:null,t2:-1});
rapidas = 0;
JSON.stringify(calcularResultado());   // esperado: {"chave":"eq","lider":-1,"segundo":-1}

// 5. BÔNUS RELÂMPAGO: 3×perfil0 vs 2×perfil1 + rapidas=6 → perfil 1 vence com 4 a 3 → par '10'
respostas = [
  {t1:'c1',t2:0},{t1:'c5',t2:0},{t1:'r1',t2:0},
  {t1:'c2',t2:1},{t1:'d1',t2:1},
  {t1:'p5',t2:-1},{t1:'s4',t2:-1},{t1:'s5',t2:-1},{t1:'p1',t2:-1},{t1:'f3',t2:-1}
]; rapidas = 6;
JSON.stringify(calcularResultado());   // esperado: {"chave":"10","lider":1,"segundo":0}
```

Depois recarregar a página (limpa o estado adulterado) e jogar uma rodada inteira clicando: o cartão final deve mostrar um dos 17 nomes com emoji, sem erro no console (preview_console_logs).

- [ ] **Step 6: Commit**

```bash
git add quiz-pokemon/index.html
git commit -m "quiz: 17 resultados por perfil duplo (lider+segundo) no calculo"
```

---

### Task 2: Apresentação — sprite, porquê e cartão "VOCÊ É..."

**Files:**
- Modify: `quiz-pokemon/index.html` (CSS seção 8 ~linha 427; HTML tela resultado ~linha 594; BLOCO 7 revelação; BLOCO 8 compartilhar)

- [ ] **Step 1: CSS — sprite, bloco do porquê e instinto compacto**

Na seção 8 do CSS, logo após a regra `.poke-emoji` (linha 450), adicionar:

```css
    /* Sprite pixelado real do Pokémon (96px ampliado, estética GameBoy) */
    .poke-sprite {
      width: 128px; height: 128px;
      image-rendering: pixelated;
      display: block;
      margin: 6px auto 0;
      filter: drop-shadow(0 4px 4px rgba(0,0,0,.35));
    }

    /* Bloco "POR QUE VOCÊ?": explica o resultado com as respostas da pessoa */
    .porque {
      margin: 12px 12px 0;
      background: #fff;
      border: 3px solid var(--preto);
      border-radius: 8px;
      padding: 10px 12px;
    }
    .porque .titulo {
      font-family: 'Press Start 2P', monospace;
      font-size: 9px;
      color: var(--vermelho);
      margin-bottom: 6px;
    }
    .porque .texto { font-size: 19px; line-height: 1.15; }
```

E **substituir** as três regras internas do instinto (`.instinto .titulo`, `.instinto .pontos`, `.instinto .frase`, linhas 468–480) — o bloco `.instinto` em si fica igual, só muda `margin: 12px` → `margin: 10px 12px` e `padding` → `8px 10px`:

```css
    .instinto {
      margin: 10px 12px;
      background: #fffbe6;
      border: 3px solid var(--preto);
      border-radius: 8px;
      padding: 8px 10px;
      text-align: center;
    }
    .instinto .titulo {
      font-family: 'Press Start 2P', monospace;
      font-size: 8px;
      color: var(--azul-escuro);
      margin-bottom: 6px;
    }
    .instinto .pontos {
      font-family: 'Press Start 2P', monospace;
      font-size: 12px;
      color: var(--vermelho);
      margin-bottom: 4px;
    }
    .instinto .frase { font-size: 16px; line-height: 1.1; }
```

- [ ] **Step 2: HTML — rótulo, `<img>` do sprite e bloco do porquê**

No cartão da tela de resultado (linhas 597–608), trocar:

```html
              <div class="cartao-topo">
                <div class="rotulo">★ PERFIL DE TREINADOR ★</div>
                <span class="poke-emoji" id="resEmoji">❓</span>
                <div class="poke-nome" id="resNome">???</div>
                <p class="poke-frase" id="resFrase"></p>
              </div>

              <div class="instinto">
```

por:

```html
              <div class="cartao-topo">
                <div class="rotulo">★ VOCÊ É... ★</div>
                <img class="poke-sprite" id="resSprite" alt="">
                <span class="poke-emoji" id="resEmoji" style="display:none">❓</span>
                <div class="poke-nome" id="resNome">???</div>
                <p class="poke-frase" id="resFrase"></p>
              </div>

              <div class="porque">
                <div class="titulo">🔍 POR QUE VOCÊ?</div>
                <p class="texto" id="resPorque"></p>
              </div>

              <div class="instinto">
```

(O `<img>` começa **sem atributo `src`** de propósito: o navegador não busca nada até `prepararCartao` setar; o emoji é o fallback e começa escondido.)

- [ ] **Step 3: JS — `prepararCartao()` e `textoPorque()`**

No BLOCO 7, logo antes de `function iniciarCaptura()`, adicionar:

```js
    /* Sprite + emoji do cartão. Chamado já na captura para o sprite
       baixar durante o suspense da Pokébola (~2s). */
    function prepararCartao(mon) {
      const img = $('resSprite');
      const emo = $('resEmoji');
      emo.textContent = mon.emoji;
      emo.style.display = 'none';
      img.style.display = '';
      // Sem internet (ou URL fora do ar): esconde a imagem e mostra o emoji
      img.onerror = () => { img.style.display = 'none'; emo.style.display = 'block'; };
      img.alt = 'Sprite do ' + mon.nome;
      img.src = SPRITE_URL(mon.dex);
    }

    /* Monta o texto do "POR QUE VOCÊ?" com os perfis dominantes
       e até 2 respostas reais da pessoa que votaram no perfil líder. */
    function textoPorque(res) {
      if (res.chave === 'eq') {
        return 'Suas respostas se espalharam por todos os lados — versatilidade é o seu forte.';
      }
      const p1 = PERFIS[res.lider];
      let texto;
      if (res.segundo >= 0) {
        const p2 = PERFIS[res.segundo];
        texto = 'Seu lado mais forte é ' + p1.nome + ' ' + p1.emoji +
                ', com um toque de ' + p2.nome + ' ' + p2.emoji + '.';
      } else {
        texto = 'Seu lado ' + p1.nome + ' ' + p1.emoji + ' dominou de longe.';
      }
      const provas = [];
      respostas.forEach(r => {
        if (r.t2 === res.lider && r.t1 && TX[r.t1] && provas.length < 2) provas.push(TX[r.t1]);
      });
      if (provas.length) texto += ' Deu pra ver quando você escolheu ' + provas.join(' e ') + '.';
      return texto;
    }
```

Em `iniciarCaptura()`, logo após a linha `resultadoFinal = calcularResultado();`, adicionar:

```js
      prepararCartao(RESULTADOS[resultadoFinal.chave]);
```

Em `revelarResultado()`, trocar:

```js
      $('resEmoji').textContent = mon.emoji;
      $('resNome').textContent = mon.nome;
      $('resFrase').textContent = mon.frase;
```

por (o emoji agora é responsabilidade de `prepararCartao`):

```js
      $('resNome').textContent = mon.nome;
      $('resFrase').textContent = mon.frase;
      $('resPorque').textContent = textoPorque(resultadoFinal);
```

- [ ] **Step 4: JS — texto de compartilhar**

Em `textoCompartilhar()`, trocar o `return` por:

```js
      return '🎮 Quiz: Qual Pokémon combina com você?\n' +
             'Meu Pokémon interior: ' + mon.nome + ' ' + mon.emoji + '\n' +
             mon.frase + '\n' +
             '🏆 ' + pontuacao + ' pontos — respondi mais rápido que ' + pct + '% dos treinadores!\n' +
             'Jogue também: ' + location.href;
```

- [ ] **Step 5: Verificação ponta a ponta no navegador**

Com o servidor da Task 1 ainda de pé:

1. Recarregar e jogar uma rodada **temática** (escolher sempre comida/sofá/companhia): o cartão deve mostrar "★ VOCÊ É... ★", sprite pixelado carregado, nome coerente (Snorlax/Jigglypuff/etc.) e o porquê citando as respostas escolhidas (ex.: "Sofá e maratona a dois 🛋️").
2. `preview_console_logs`: nenhum erro.
3. Fallback: no console, `$('resSprite').src = 'https://invalid.example/x.png'` → a imagem some e o emoji aparece no lugar.
4. Compartilhar: no console, `textoCompartilhar()` → contém "Meu Pokémon interior:" + nome + frase.
5. "Jogar de novo" → quiz reinicia limpo; segunda rodada com outro tema dá outro Pokémon.
6. `preview_resize` para ~380px de largura (celular) → cartão sem estouro de layout.
7. `preview_screenshot` da tela final como prova.

- [ ] **Step 6: Commit**

```bash
git add quiz-pokemon/index.html
git commit -m "quiz: cartao 'VOCE E...' com sprite pixelado, porque do resultado e share novo"
```
