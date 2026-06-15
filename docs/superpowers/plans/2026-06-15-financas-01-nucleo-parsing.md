# Núcleo de Parsing (Finanças) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a biblioteca pura de parsing dos extratos Itaú e Bradesco (CSV → transações padronizadas) com deduplicação estável, testada com `node --test`, sem dependência de navegador nem Supabase.

**Architecture:** Funções puras `string → Transacao[]` por banco em `src/lib/parsers/`, com helpers compartilhados em `shared.js` e hash de conteúdo em `hash.js`. Um adaptador fino de navegador (`parseCSV`) lê o `File`, decodifica com o encoding certo (latin-1 no Bradesco, utf-8 no Itaú) e delega para a função pura. As funções puras recebem texto já decodificado, então são testáveis com strings em Node.

**Tech Stack:** JavaScript ESM, `node --test` + `node:assert/strict`. Nenhuma lib externa.

**Spec:** `docs/superpowers/specs/2026-06-15-sistema-financeiro-design.md` (§5 formato de transação, §6 parsers e hash).

> **Privacidade:** os fixtures deste plano são **anonimizados** e construídos à mão a partir da estrutura dos extratos reais. Nenhum CSV real entra no repositório (repo público).

> **Formato `Transacao` (saída das funções puras, antes do hash):**
> ```js
> {
>   data,              // 'AAAA-MM-DD' (data da compra)
>   descricao,         // UPPER, espaços colapsados, sufixo de país removido
>   descricaoOriginal, // crua, só com espaços colapsados
>   valor,             // number positivo
>   banco,             // 'itau' | 'bradesco'
>   pessoa,            // 'luis' (bradesco) | 'compartilhado' (itau)
>   mesReferencia,     // 'AAAA-MM' (mês da fatura)
>   parcelaAtual,      // number | null
>   parcelaTotal,      // number | null
>   categoria: null,
>   ehFixo: false
> }
> ```
> `finalizar()` adiciona `hash` a cada item.

---

### Task 1: Scaffolding mínimo do projeto

**Files:**
- Create: `financas-app/package.json`
- Create: `financas-app/.gitignore`

- [ ] **Step 1: Criar `financas-app/package.json`**

```json
{
  "name": "financas-app",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Criar `financas-app/.gitignore`**

```gitignore
node_modules/
dist/
.env.local
samples-local/
```

- [ ] **Step 3: Verificar que o runner de testes funciona (sem testes ainda)**

Run: `npm test --prefix financas-app`  (auto-discovery; `node --test <dir>` não escaneia o diretório nesta versão do Node)
Expected: Sai sem erro, reportando `tests 0` (nenhum teste encontrado ainda).

- [ ] **Step 4: Commit**

```bash
git add financas-app/package.json financas-app/.gitignore
git commit -m "chore(financas): scaffolding minimo do projeto (node --test)"
```

---

### Task 2: `parseValorBR` — valores em formato brasileiro

**Files:**
- Create: `financas-app/src/lib/shared.js`
- Test: `financas-app/test/shared.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`financas-app/test/shared.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseValorBR } from '../src/lib/shared.js';

test('parseValorBR converte decimal brasileiro', () => {
  assert.equal(parseValorBR('30,14'), 30.14);
  assert.equal(parseValorBR('416,28'), 416.28);
});

test('parseValorBR remove separador de milhar e aceita negativo', () => {
  assert.equal(parseValorBR('3.350,07'), 3350.07);
  assert.equal(parseValorBR('-3350,07'), -3350.07);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/shared.test.js`
Expected: FAIL — `Cannot find module '../src/lib/shared.js'` ou `parseValorBR is not a function`.

- [ ] **Step 3: Implementar o mínimo**

`financas-app/src/lib/shared.js`:
```js
// Converte valor em formato brasileiro ('1.234,56') para number.
// O /g é obrigatório: sem ele, milhares com mais de um ponto quebram.
export function parseValorBR(s) {
  return parseFloat(String(s).trim().replace(/\./g, '').replace(',', '.'));
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/shared.test.js`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/shared.js financas-app/test/shared.test.js
git commit -m "feat(financas): parseValorBR para valores em real"
```

---

### Task 3: `limparDescricao` — normalização conservadora

**Files:**
- Modify: `financas-app/src/lib/shared.js`
- Test: `financas-app/test/shared.test.js`

- [ ] **Step 1: Acrescentar testes que falham**

Acrescentar ao final de `financas-app/test/shared.test.js`:
```js
import { limparDescricao } from '../src/lib/shared.js';

test('limparDescricao colapsa espaços e mantém o original', () => {
  const r = limparDescricao('EC          *SHELLBOXRIO DE JANEIRBRA');
  assert.equal(r.descricaoOriginal, 'EC *SHELLBOXRIO DE JANEIRBRA');
  assert.equal(r.descricao, 'EC *SHELLBOXRIO DE JANEIR'); // só o sufixo BRA sai
});

test('limparDescricao não destrói o nome do estabelecimento', () => {
  const r = limparDescricao('CONDOR SITIO CERCADOCURITIBABRA');
  assert.equal(r.descricao, 'CONDOR SITIO CERCADOCURITIBA'); // cidade colada permanece
});

test('limparDescricao sem sufixo de país mantém o texto', () => {
  const r = limparDescricao('Mensalidade - Plano do cartão');
  assert.equal(r.descricao, 'MENSALIDADE - PLANO DO CARTÃO');
});
```

> Nota: o `import` adicional no mesmo arquivo de teste é aceitável; o Node deduplica o módulo. Para manter limpo, o engenheiro pode mover todos os `import` para o topo.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/shared.test.js`
Expected: FAIL — `limparDescricao is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar a `financas-app/src/lib/shared.js`:
```js
// Normaliza a descrição preservando o original.
// Conservador: remove APENAS o sufixo de país (BRA/USA/ARG/EUR), nunca a cidade
// colada — o match por palavra-chave funciona mesmo com a cidade junto.
export function limparDescricao(raw) {
  const descricaoOriginal = String(raw).trim().replace(/\s+/g, ' ');
  const descricao = descricaoOriginal
    .toUpperCase()
    .replace(/\s*(?:BRA|USA|ARG|EUR)\s*$/i, '')
    .trim();
  return { descricao, descricaoOriginal };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/shared.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/shared.js financas-app/test/shared.test.js
git commit -m "feat(financas): limparDescricao conservadora preservando original"
```

---

### Task 4: Inferência de mês/ano (`inferirMesRefDoNome`, `inferirDataCompra`, `mesMaisFrequente`)

**Files:**
- Modify: `financas-app/src/lib/shared.js`
- Test: `financas-app/test/shared.test.js`

- [ ] **Step 1: Acrescentar testes que falham**

Acrescentar ao final de `financas-app/test/shared.test.js`:
```js
import { inferirMesRefDoNome, inferirDataCompra, mesMaisFrequente } from '../src/lib/shared.js';

test('inferirMesRefDoNome lê DDMMYYYY do nome do Bradesco', () => {
  assert.equal(inferirMesRefDoNome('Bradesco_13062026_225114.csv'), '2026-06');
});

test('inferirMesRefDoNome retorna null sem data no nome', () => {
  assert.equal(inferirMesRefDoNome('fatura-1018241898.csv'), null);
});

test('inferirDataCompra resolve o ano de parcelas antigas', () => {
  assert.equal(inferirDataCompra('10/06', '2026-06'), '2026-06-10');
  assert.equal(inferirDataCompra('06/03', '2026-06'), '2026-03-06');
  // mês maior que o da fatura => ano anterior
  assert.equal(inferirDataCompra('28/11', '2026-06'), '2025-11-28');
});

test('mesMaisFrequente escolhe o mês com mais lançamentos', () => {
  const datas = ['2026-06-09', '2026-06-08', '2026-06-04', '2026-03-15'];
  assert.equal(mesMaisFrequente(datas), '2026-06');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/shared.test.js`
Expected: FAIL — funções não definidas.

- [ ] **Step 3: Implementar**

Acrescentar a `financas-app/src/lib/shared.js`:
```js
// Extrai 'AAAA-MM' de um nome tipo 'Bradesco_DDMMYYYY_HHMMSS.csv'.
export function inferirMesRefDoNome(nome) {
  const m = String(nome).match(/(\d{2})(\d{2})(\d{4})/); // DD MM YYYY
  if (!m) return null;
  const [, , mm, yyyy] = m;
  return `${yyyy}-${mm}`;
}

// Resolve a data completa de uma compra 'DD/MM' dado o mês da fatura.
// Parcelas datadas de meses à frente do mês da fatura são do ano anterior.
export function inferirDataCompra(ddmm, mesRef) {
  const [dd, mm] = ddmm.split('/');
  const [anoRef, mesRefNum] = mesRef.split('-').map(Number);
  const ano = Number(mm) > mesRefNum ? anoRef - 1 : anoRef;
  return `${ano}-${mm}-${dd}`;
}

// Mês ('AAAA-MM') mais frequente em uma lista de datas ISO.
export function mesMaisFrequente(datasISO) {
  const cont = new Map();
  for (const d of datasISO) {
    const ym = d.slice(0, 7);
    cont.set(ym, (cont.get(ym) ?? 0) + 1);
  }
  let melhor = null;
  let max = -1;
  for (const [ym, n] of cont) {
    if (n > max) {
      max = n;
      melhor = ym;
    }
  }
  return melhor;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/shared.test.js`
Expected: PASS (9 testes).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/shared.js financas-app/test/shared.test.js
git commit -m "feat(financas): inferencia de mes/ano e mes mais frequente"
```

---

### Task 5: `detectarParcela` — detecção de parcelamento

**Files:**
- Modify: `financas-app/src/lib/shared.js`
- Test: `financas-app/test/shared.test.js`

- [ ] **Step 1: Acrescentar testes que falham**

Acrescentar ao final de `financas-app/test/shared.test.js`:
```js
import { detectarParcela } from '../src/lib/shared.js';

test('detectarParcela lê N/M no fim do histórico', () => {
  assert.deepEqual(detectarParcela('PICPAY*LUIS GABRIEL 1/3'), { atual: 1, total: 3 });
  assert.deepEqual(detectarParcela('Converse All Sta 7/10'), { atual: 7, total: 10 });
});

test('detectarParcela ignora números que não estão no fim', () => {
  assert.equal(detectarParcela('10 PASTEIS UNIVERSIDAD'), null);
  assert.equal(detectarParcela('99Food *Lancheria do Brab'), null);
  assert.equal(detectarParcela('CONDOR SITIO CERCADO'), null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/shared.test.js`
Expected: FAIL — `detectarParcela is not a function`.

- [ ] **Step 3: Implementar**

Acrescentar a `financas-app/src/lib/shared.js`:
```js
// Detecta parcelamento 'N/M' ancorado no FIM do histórico.
export function detectarParcela(historico) {
  const m = String(historico).match(/(\d+)\/(\d+)\s*$/);
  return m ? { atual: Number(m[1]), total: Number(m[2]) } : null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/shared.test.js`
Expected: PASS (11 testes).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/shared.js financas-app/test/shared.test.js
git commit -m "feat(financas): detectarParcela ancorada no fim do historico"
```

---

### Task 6: `hash.js` — hash de conteúdo e `finalizar`

**Files:**
- Create: `financas-app/src/lib/hash.js`
- Test: `financas-app/test/hash.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`financas-app/test/hash.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashTransacao, finalizar } from '../src/lib/hash.js';

const base = { banco: 'itau', data: '2026-06-08', descricao: 'CONDOR', valor: 15.6 };

test('hashTransacao é determinístico', () => {
  assert.equal(hashTransacao({ ...base, ocorrencia: 0 }), hashTransacao({ ...base, ocorrencia: 0 }));
});

test('hashTransacao muda com a ocorrência', () => {
  assert.notEqual(hashTransacao({ ...base, ocorrencia: 0 }), hashTransacao({ ...base, ocorrencia: 1 }));
});

test('finalizar dá hashes distintos a duplicatas idênticas', () => {
  const out = finalizar([{ ...base }, { ...base }]);
  assert.equal(out.length, 2);
  assert.notEqual(out[0].hash, out[1].hash);
});

test('finalizar é estável entre execuções (mesmo input → mesmos hashes)', () => {
  const a = finalizar([{ ...base }, { ...base }]).map((t) => t.hash);
  const b = finalizar([{ ...base }, { ...base }]).map((t) => t.hash);
  assert.deepEqual(a, b);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/hash.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`financas-app/src/lib/hash.js`:
```js
// Hash não-criptográfico (djb2) — só precisa ser estável e bem distribuído.
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; // h * 33 + c, mantém 32-bit unsigned
  }
  return h.toString(36);
}

// Hash de CONTEÚDO (não usa nome de arquivo nem índice): estável ao re-baixar o extrato.
export function hashTransacao({ banco, data, descricao, valor, ocorrencia = 0 }) {
  return djb2(`${banco}:${data}:${descricao}:${valor}:${ocorrencia}`);
}

// Atribui hash a cada transação. Duplicatas idênticas (mesmo banco/data/descricao/valor)
// recebem um contador de ocorrência crescente para não colidirem.
export function finalizar(transacoes) {
  const contador = new Map();
  return transacoes.map((t) => {
    const chave = `${t.banco}:${t.data}:${t.descricao}:${t.valor}`;
    const ocorrencia = contador.get(chave) ?? 0;
    contador.set(chave, ocorrencia + 1);
    return { ...t, hash: hashTransacao({ ...t, ocorrencia }) };
  });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/hash.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/hash.js financas-app/test/hash.test.js
git commit -m "feat(financas): hash de conteudo e finalizar com contador de ocorrencia"
```

---

### Task 7: `parsers/bradesco.js` — parser do Bradesco

**Files:**
- Create: `financas-app/src/lib/parsers/bradesco.js`
- Test: `financas-app/test/bradesco.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`financas-app/test/bradesco.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBradescoText } from '../src/lib/parsers/bradesco.js';

// Fixture ANONIMIZADA com a estrutura real: registros separados por '\r',
// cabeçalho-lixo antes do header, pagamento negativo, SALDO ANTERIOR,
// parcela antiga (28/11) e rodapé 'Total da fatura' seguido de seção a descartar.
const FIX = [
  'Data: 13/06/2026 10:51:02',
  'Situação da Fatura: ABERTA',
  'TITULAR EXEMPLO ;;; 0000',
  'Data;Histórico;Valor(US$);Valor(R$);',
  '10/06;SALDO ANTERIOR ;0,00;3350,07',
  '10/06;CONDOR SITIO CERCADO ;0,00;30,14',
  '09/06;PICPAY*EXEMPLO 1/3;0,00;416,28',
  '09/06;PAGTO ANTECIPADO PIX ;0,00;-3350,07',
  '28/11;Converse All Sta 7/10;0,00;59,98',
  'Total da fatura em Real: ;;;2847,51',
  'Lançamentos programados',
  'Data;Histórico;Valor(US$);Valor(R$);',
  '13/04/2026;PICPAY*EXEMPLO Sa 3/3;;373,91',
].join('\r');

test('parseBradesco ignora cabeçalho, SALDO, negativos e o rodapé', () => {
  const r = parseBradescoText(FIX, { nomeArquivo: 'Bradesco_13062026_225114.csv' });
  assert.equal(r.length, 3); // CONDOR, PICPAY 1/3, Converse
  const descricoes = r.map((t) => t.descricao);
  assert.ok(descricoes.some((d) => d.startsWith('CONDOR')));
  assert.ok(!descricoes.some((d) => d.includes('SALDO')));
  assert.ok(!descricoes.some((d) => d.includes('PAGTO')));
});

test('parseBradesco mapeia campos e infere ano de parcela antiga', () => {
  const r = parseBradescoText(FIX, { nomeArquivo: 'Bradesco_13062026_225114.csv' });
  const condor = r.find((t) => t.descricao.startsWith('CONDOR'));
  assert.equal(condor.data, '2026-06-10');
  assert.equal(condor.valor, 30.14);
  assert.equal(condor.pessoa, 'luis');
  assert.equal(condor.banco, 'bradesco');
  assert.equal(condor.mesReferencia, '2026-06');
  assert.equal(condor.parcelaAtual, null);

  const picpay = r.find((t) => t.descricao.includes('PICPAY'));
  assert.equal(picpay.parcelaAtual, 1);
  assert.equal(picpay.parcelaTotal, 3);
  assert.equal(picpay.valor, 416.28);

  const converse = r.find((t) => t.descricao.includes('CONVERSE'));
  assert.equal(converse.data, '2025-11-28'); // mês > junho => ano anterior
  assert.equal(converse.parcelaTotal, 10);
});

test('parseBradesco lança erro se não achar o header', () => {
  assert.throws(() => parseBradescoText('lixo qualquer', { nomeArquivo: 'Bradesco_13062026_2.csv' }),
    /Nenhuma transação encontrada/);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/bradesco.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`financas-app/src/lib/parsers/bradesco.js`:
```js
import {
  parseValorBR,
  limparDescricao,
  inferirMesRefDoNome,
  inferirDataCompra,
  detectarParcela,
} from '../shared.js';

// Parser do Bradesco. Recebe o TEXTO JÁ DECODIFICADO (latin-1) — a decodificação
// do File é responsabilidade do adaptador de navegador em parsers/index.js.
// Registros são separados por '\r'; colunas por ';';
// usamos a 4ª coluna (Valor R$). Titular sempre Luis.
export function parseBradescoText(text, { nomeArquivo, mesReferencia } = {}) {
  const mesRef = mesReferencia || inferirMesRefDoNome(nomeArquivo);
  if (!mesRef) {
    throw new Error('Não foi possível inferir o mês de referência do extrato Bradesco');
  }

  const linhas = String(text)
    .split('\r')
    .map((l) => l.trim())
    .filter(Boolean);

  const inicio = linhas.findIndex((l) => l.startsWith('Data;Histórico'));
  if (inicio === -1) {
    throw new Error('Nenhuma transação encontrada. Verifique se é um extrato do Bradesco');
  }

  const out = [];
  for (let i = inicio + 1; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linha.startsWith('Total da fatura')) break; // descarta rodapé/lançamentos programados

    const campos = linha.split(';');
    if (campos.length < 4) continue;

    const ddmm = campos[0].trim();
    if (!/^\d{2}\/\d{2}$/.test(ddmm)) continue; // só linhas de transação (DD/MM)

    const historico = campos[1].trim();
    if (/SALDO ANTERIOR/i.test(historico)) continue;

    const valor = parseValorBR(campos[3]);
    if (!(valor > 0)) continue; // pula pagamentos/créditos (negativos) e zeros

    const parcela = detectarParcela(historico);
    const { descricao, descricaoOriginal } = limparDescricao(historico);

    out.push({
      data: inferirDataCompra(ddmm, mesRef),
      descricao,
      descricaoOriginal,
      valor,
      banco: 'bradesco',
      pessoa: 'luis',
      mesReferencia: mesRef,
      parcelaAtual: parcela ? parcela.atual : null,
      parcelaTotal: parcela ? parcela.total : null,
      categoria: null,
      ehFixo: false,
    });
  }

  if (out.length === 0) {
    throw new Error('Nenhuma transação encontrada. Verifique se é um extrato do Bradesco');
  }
  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/bradesco.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/parsers/bradesco.js financas-app/test/bradesco.test.js
git commit -m "feat(financas): parser do Bradesco (latin-1, corte no Total da fatura)"
```

---

### Task 8: `parsers/itau.js` — parser do Itaú

**Files:**
- Create: `financas-app/src/lib/parsers/itau.js`
- Test: `financas-app/test/itau.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`financas-app/test/itau.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseItauText } from '../src/lib/parsers/itau.js';

// Fixture ANONIMIZADA: utf-8 com BOM, valores com ponto decimal,
// PAGAMENTO COM SALDO negativo a ignorar, descrição com cidade+país colados.
const BOM = String.fromCharCode(0xFEFF); // simula o BOM do Itaú sem caractere invisível
const FIX = BOM + 'data,lançamento,valor\n'
  + '2026-06-09,PAGAMENTO COM SALDO,-1826.59\n'
  + '2026-06-09,EC          *SHELLBOXRIO DE JANEIRBRA,97.13\n'
  + '2026-06-08,CONDOR SITIO CERCADOCURITIBABRA,15.6\n'
  + '2026-06-04,Mensalidade - Plano do cartão,80\n'
  + '2026-03-15,JIM.COM* 50747091 ELISAO JOSE DOSBRA,392.3';

test('parseItau ignora cabeçalho e valores negativos', () => {
  const r = parseItauText(FIX, { mesReferencia: '2026-06' });
  assert.equal(r.length, 4); // PAGAMENTO COM SALDO fora
  assert.ok(!r.some((t) => t.descricao.includes('PAGAMENTO COM SALDO')));
});

test('parseItau limpa sufixo de país mas mantém o estabelecimento', () => {
  const r = parseItauText(FIX, { mesReferencia: '2026-06' });
  const shell = r.find((t) => t.descricao.includes('SHELLBOX'));
  assert.equal(shell.descricao, 'EC *SHELLBOXRIO DE JANEIR');
  assert.equal(shell.descricaoOriginal, 'EC *SHELLBOXRIO DE JANEIRBRA');
  assert.equal(shell.valor, 97.13);
  assert.equal(shell.banco, 'itau');
  assert.equal(shell.pessoa, 'compartilhado');
});

test('parseItau usa o mês informado como referência de todas as linhas', () => {
  const r = parseItauText(FIX, { mesReferencia: '2026-06' });
  // a compra de março continua com mesReferencia da fatura (junho)
  const marco = r.find((t) => t.data === '2026-03-15');
  assert.equal(marco.mesReferencia, '2026-06');
  assert.equal(marco.valor, 392.3);
});

test('parseItau infere o mês mais frequente quando não informado', () => {
  const r = parseItauText(FIX); // sem mesReferencia
  assert.ok(r.every((t) => t.mesReferencia === '2026-06'));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/itau.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`financas-app/src/lib/parsers/itau.js`:
```js
import { limparDescricao, mesMaisFrequente } from '../shared.js';

// Parser do Itaú. Recebe o TEXTO JÁ DECODIFICADO (utf-8). Datas em ISO (AAAA-MM-DD),
// valores com PONTO decimal, positivo = gasto. Cartão compartilhado.
// Usa primeiro e último vírgula para isolar data/valor (descrição pode conter vírgula).
export function parseItauText(text, { mesReferencia } = {}) {
  const linhas = String(text)
    .replace(new RegExp('^' + String.fromCharCode(0xFEFF)), '') // remove BOM
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const corpo = linhas.length && linhas[0].toLowerCase().startsWith('data,')
    ? linhas.slice(1)
    : linhas;

  const intermediario = [];
  for (const linha of corpo) {
    const idx1 = linha.indexOf(',');
    const idx2 = linha.lastIndexOf(',');
    if (idx1 === -1 || idx1 === idx2) continue;

    const data = linha.slice(0, idx1).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;

    const lancamento = linha.slice(idx1 + 1, idx2).trim();
    const valor = Number(linha.slice(idx2 + 1).trim());
    if (!(valor > 0)) continue; // pula PAGAMENTO COM SALDO e quaisquer negativos

    const { descricao, descricaoOriginal } = limparDescricao(lancamento);
    intermediario.push({ data, descricao, descricaoOriginal, valor });
  }

  const mesRef = mesReferencia || mesMaisFrequente(intermediario.map((r) => r.data));

  const out = intermediario.map((r) => ({
    data: r.data,
    descricao: r.descricao,
    descricaoOriginal: r.descricaoOriginal,
    valor: r.valor,
    banco: 'itau',
    pessoa: 'compartilhado',
    mesReferencia: mesRef,
    parcelaAtual: null,
    parcelaTotal: null,
    categoria: null,
    ehFixo: false,
  }));

  if (out.length === 0) {
    throw new Error('Nenhuma transação encontrada. Verifique se é um extrato do Itaú');
  }
  return out;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/itau.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/parsers/itau.js financas-app/test/itau.test.js
git commit -m "feat(financas): parser do Itau (utf-8, ignora negativos, mes da fatura)"
```

---

### Task 9: `parsers/index.js` — dispatch, `finalizar` e adaptador de navegador

**Files:**
- Create: `financas-app/src/lib/parsers/index.js`
- Test: `financas-app/test/parsers-index.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`financas-app/test/parsers-index.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSVText } from '../src/lib/parsers/index.js';

const BOM = String.fromCharCode(0xFEFF);
const ITAU = BOM + 'data,lançamento,valor\n'
  + '2026-06-08,CONDOR SITIO CERCADOCURITIBABRA,15.6\n'
  + '2026-06-08,CONDOR SITIO CERCADOCURITIBABRA,15.6\n'; // duplicata idêntica

test('parseCSVText (itau) finaliza com hash em cada transação', () => {
  const r = parseCSVText(ITAU, 'itau', { mesReferencia: '2026-06' });
  assert.equal(r.length, 2);
  assert.ok(r.every((t) => typeof t.hash === 'string' && t.hash.length > 0));
});

test('parseCSVText dá hashes distintos a duplicatas idênticas', () => {
  const r = parseCSVText(ITAU, 'itau', { mesReferencia: '2026-06' });
  assert.notEqual(r[0].hash, r[1].hash);
});

test('parseCSVText é estável entre execuções (dedup ao re-baixar)', () => {
  const a = parseCSVText(ITAU, 'itau', { mesReferencia: '2026-06' }).map((t) => t.hash);
  const b = parseCSVText(ITAU, 'itau', { mesReferencia: '2026-06' }).map((t) => t.hash);
  assert.deepEqual(a, b);
});

test('parseCSVText rejeita banco desconhecido', () => {
  assert.throws(() => parseCSVText(ITAU, 'nubank', { mesReferencia: '2026-06' }), /Banco desconhecido/);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/parsers-index.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`financas-app/src/lib/parsers/index.js`:
```js
import { parseBradescoText } from './bradesco.js';
import { parseItauText } from './itau.js';
import { finalizar } from '../hash.js';

// Faz o dispatch por banco sobre TEXTO já decodificado e adiciona o hash de dedup.
export function parseCSVText(text, banco, opts = {}) {
  let rows;
  if (banco === 'bradesco') {
    rows = parseBradescoText(text, opts);
  } else if (banco === 'itau') {
    rows = parseItauText(text, opts);
  } else {
    throw new Error(`Banco desconhecido: ${banco}`);
  }
  return finalizar(rows);
}

// Adaptador de navegador: lê o File, decodifica com o encoding certo e delega.
// (Não coberto por testes Node — depende de File/TextDecoder do navegador.)
export async function parseCSV(file, banco, mesReferencia) {
  const buffer = await file.arrayBuffer();
  const encoding = banco === 'bradesco' ? 'iso-8859-1' : 'utf-8';
  const text = new TextDecoder(encoding).decode(buffer);
  return parseCSVText(text, banco, { nomeArquivo: file.name, mesReferencia });
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/parsers-index.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test --prefix financas-app`  (auto-discovery; `node --test <dir>` não escaneia o diretório nesta versão do Node)
Expected: PASS — todos os testes (shared, hash, bradesco, itau, parsers-index).

- [ ] **Step 6: Commit**

```bash
git add financas-app/src/lib/parsers/index.js financas-app/test/parsers-index.test.js
git commit -m "feat(financas): dispatch de parsers + finalizar + adaptador parseCSV"
```

---

## Cobertura do spec por este plano

- §5 (formato `Transacao`) → Tasks 7, 8 produzem o objeto completo; Task 9 adiciona `hash`.
- §6 Bradesco (latin-1, `\r`, header, SALDO/negativos, corte no `Total da fatura`, ano de parcelas) → Task 7 (+ helpers 2–5).
- §6 Itaú (utf-8/BOM, ignora negativos, mês da fatura, limpeza conservadora) → Task 8 (+ helper 3).
- §6 hash de conteúdo / dedup estável → Tasks 6, 9.
- Adaptador de encoding do navegador (`parseCSV`) → Task 9 (sem teste Node; será exercitado na tela de Upload, plano 5).

**Fora deste plano (planos seguintes):** categorizador e analisador (plano 2); scaffolding Vite/Tailwind/PWA, SQL e Action de deploy (plano 3); auth/rotas/layout (plano 4); upload/Q&A/realtime (plano 5); dashboard/configurações (plano 6).
