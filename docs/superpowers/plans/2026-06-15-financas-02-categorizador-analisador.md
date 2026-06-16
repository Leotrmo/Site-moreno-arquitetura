# Categorizador + Analisador (Finanças) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a lógica pura de categorização automática e o motor de análise mensal (resumo, por categoria/pessoa, fixos, parcelamentos, alertas, score e recomendações), testada com `node --test`.

**Architecture:** Constantes de categorias em `categorias.js`; `categorizarAutomatico(descricao, regras)` em `categorizador.js`; e a função pura `analisar(transacoes, perfil)` em `analisador.js`. Tudo framework-free, consumindo o formato `Transacao` produzido pelo Plano 1.

**Tech Stack:** JavaScript ESM, `node --test` + `node:assert/strict`. Sem libs externas.

**Spec:** `docs/superpowers/specs/2026-06-15-sistema-financeiro-design.md` (§7 categorizador, §8 analisador). Roda com `npm test --prefix financas-app`.

> **Formato `Transacao` de entrada** (do Plano 1): `{ data, descricao, descricaoOriginal, valor, banco, pessoa, mesReferencia, parcelaAtual, parcelaTotal, categoria, ehFixo, hash }`.

---

### Task 1: `categorias.js` — constantes de categorias e palavras-chave

**Files:**
- Create: `financas-app/src/lib/categorias.js`
- Test: `financas-app/test/categorias.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`financas-app/test/categorias.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIAS, AUTO_CATEGORIAS } from '../src/lib/categorias.js';

test('CATEGORIAS tem 15 itens com id/emoji/label', () => {
  assert.equal(CATEGORIAS.length, 15);
  for (const c of CATEGORIAS) {
    assert.ok(c.id && c.emoji && c.label, `categoria incompleta: ${JSON.stringify(c)}`);
  }
});

test('AUTO_CATEGORIAS referencia ids válidos de categoria', () => {
  const ids = new Set(CATEGORIAS.map((c) => c.id));
  for (const id of Object.keys(AUTO_CATEGORIAS)) {
    assert.ok(ids.has(id), `id desconhecido em AUTO_CATEGORIAS: ${id}`);
  }
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/categorias.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`financas-app/src/lib/categorias.js`:
```js
// 15 categorias de gasto. A ORDEM importa para a categorização automática:
// palavras mais específicas devem vir antes (ex.: alimentação antes de transporte,
// para '99FOOD' casar antes de '99').
export const CATEGORIAS = [
  { id: 'alimentacao',  emoji: '🍽️', label: 'Alimentação',  desc: 'Restaurantes, delivery' },
  { id: 'mercado',      emoji: '🛒', label: 'Mercado',       desc: 'Supermercado, hortifruti' },
  { id: 'transporte',   emoji: '🚗', label: 'Transporte',    desc: 'Combustível, Uber, estac.' },
  { id: 'moradia',      emoji: '🏠', label: 'Moradia',       desc: 'Aluguel, condomínio, IPTU' },
  { id: 'utilities',    emoji: '💡', label: 'Utilities',     desc: 'Energia, internet, telefone' },
  { id: 'saude',        emoji: '💊', label: 'Saúde',         desc: 'Farmácia, consultas, plano' },
  { id: 'vestuario',    emoji: '👗', label: 'Vestuário',     desc: 'Roupas e calçados' },
  { id: 'lazer',        emoji: '🎮', label: 'Lazer',         desc: 'Cinema, streaming, eventos' },
  { id: 'viagem',       emoji: '✈️', label: 'Viagem',        desc: 'Hotel, passagens, turismo' },
  { id: 'educacao',     emoji: '📚', label: 'Educação',      desc: 'Cursos, livros, assinaturas' },
  { id: 'beleza',       emoji: '💅', label: 'Beleza',        desc: 'Salão, barbearia, cosméticos' },
  { id: 'pets',         emoji: '🐾', label: 'Pets',          desc: 'Pet shop, veterinário' },
  { id: 'financeiro',   emoji: '🏦', label: 'Financeiro',    desc: 'Tarifas, juros, IOF, seguros' },
  { id: 'parcelamento', emoji: '💳', label: 'Parcelamento',  desc: 'Compra parcelada identificada' },
  { id: 'outros',       emoji: '❓', label: 'Outros',        desc: 'Não classificado' },
];

// Palavras-chave para categorização automática (baseadas nos extratos reais).
// Comparação é case-insensitive por "contém".
export const AUTO_CATEGORIAS = {
  alimentacao: ['IFOOD', 'RAPPI', 'UBER EATS', '99FOOD', 'MCDONALDS', 'BURGER', 'PIZZA',
                'RESTAURANTE', 'LANCHONETE', 'PADARIA', 'CAFE', 'CAFETERIA', 'SUSHI',
                'GRILL', 'STEAKHOUSE', 'PASTEIS', 'APOLLO', 'CARNIVORE', 'LANCHERIA'],
  mercado:     ['SUPERMERCADO', 'CARREFOUR', 'EXTRA', 'PAO DE ACUCAR', 'ATACADAO', 'ASSAI',
                'MERCADO', 'HORTIFRUTI', 'SACOLAO', 'CONDOR', 'SUPERZAMP', 'GULLA MARKET'],
  transporte:  ['UBER', '99', 'POSTO', 'COMBUSTIVEL', 'GASOLINA', 'ESTACIONAMENTO',
                'SHELLBOX', 'IPIRANGA', 'SHELL'],
  utilities:   ['COPEL', 'SANEPAR', 'ENERGIA', 'INTERNET', 'CLARO', 'VIVO', 'TIM', 'OI',
                'NETFLIX', 'SPOTIFY', 'DISNEY', 'AMAZON PRIME', 'HBO', 'ADOBE', 'IFD*BR'],
  saude:       ['FARMACIA', 'DROGASIL', 'DROGA RAIA', 'RAIA DROGASIL', 'ULTRAFARMA',
                'HOSPITAL', 'CLINICA', 'MEDICO', 'DENTISTA', 'UNIMED', 'MEDPREV', 'NIS'],
  beleza:      ['BARBEARIA', 'SALAO', 'JACK JAMES', 'ESTETICA'],
  financeiro:  ['TARIFA', 'JUROS', 'IOF', 'ANUIDADE', 'MENSALIDADE PLANO', 'COTOLENGO'],
  vestuario:   ['CONVERSE', 'SHOPEE', 'NIKE', 'ADIDAS', 'ZARA', 'RENNER'],
};
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/categorias.test.js`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/categorias.js financas-app/test/categorias.test.js
git commit -m "feat(financas): constantes CATEGORIAS e AUTO_CATEGORIAS"
```

---

### Task 2: `categorizador.js` — categorização automática

**Files:**
- Create: `financas-app/src/lib/categorizador.js`
- Test: `financas-app/test/categorizador.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`financas-app/test/categorizador.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorizarAutomatico } from '../src/lib/categorizador.js';

test('categoriza por palavra-chave', () => {
  assert.equal(categorizarAutomatico('IFOOD *LANCHERIA'), 'alimentacao');
  assert.equal(categorizarAutomatico('CONDOR SITIO CERCADO'), 'mercado');
  assert.equal(categorizarAutomatico('MP *SHELLBOX'), 'transporte');
});

test('precedência: 99FOOD vence 99, UBER EATS vence UBER', () => {
  assert.equal(categorizarAutomatico('99FOOD *PIZZA DA KOMBI'), 'alimentacao');
  assert.equal(categorizarAutomatico('UBER EATS'), 'alimentacao');
  assert.equal(categorizarAutomatico('UBER *TRIP'), 'transporte');
});

test('regra aprendida tem prioridade sobre palavra-chave', () => {
  const regras = [{ chave: 'CONDOR', categoria: 'lazer' }];
  assert.equal(categorizarAutomatico('CONDOR SITIO CERCADO', regras), 'lazer');
});

test('retorna null quando não reconhece', () => {
  assert.equal(categorizarAutomatico('ESTABELECIMENTO DESCONHECIDO XYZ'), null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/categorizador.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`financas-app/src/lib/categorizador.js`:
```js
import { AUTO_CATEGORIAS } from './categorias.js';

// Retorna o id da categoria, ou null se não reconhecer.
// Ordem: 1) regras aprendidas (Supabase), 2) palavras-chave automáticas, 3) null.
// `regras` é um array de { chave, categoria }.
export function categorizarAutomatico(descricao, regras = []) {
  const desc = String(descricao).toUpperCase();

  for (const regra of regras) {
    if (regra.chave && desc.includes(String(regra.chave).toUpperCase())) {
      return regra.categoria;
    }
  }

  for (const [categoria, palavras] of Object.entries(AUTO_CATEGORIAS)) {
    for (const p of palavras) {
      if (desc.includes(p.toUpperCase())) return categoria;
    }
  }

  return null;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/categorizador.test.js`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add financas-app/src/lib/categorizador.js financas-app/test/categorizador.test.js
git commit -m "feat(financas): categorizarAutomatico (regras + palavras-chave)"
```

---

### Task 3: `analisador.js` — motor de análise mensal

**Files:**
- Create: `financas-app/src/lib/analisador.js`
- Test: `financas-app/test/analisador.test.js`

- [ ] **Step 1: Escrever o teste que falha**

`financas-app/test/analisador.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analisar } from '../src/lib/analisador.js';

function tx(over) {
  return {
    data: '2026-06-10', descricao: 'X', valor: 0, banco: 'itau', pessoa: 'compartilhado',
    categoria: 'outros', ehFixo: false, parcelaAtual: null, parcelaTotal: null,
    mesReferencia: '2026-06', ...over,
  };
}

const perfil = {
  salarios: { leo: 5000, luis: 4000 },
  fixos: [{ nome: 'Aluguel', valor: 1500, pessoa: 'leo' }],
  metas: [{ nome: 'Reserva', valor: 15000, prazoMeses: 12 }],
};

const transacoes = [
  tx({ descricao: 'CONDOR', valor: 200, pessoa: 'compartilhado', categoria: 'mercado' }),
  tx({ descricao: 'ALUGUEL', valor: 1500, pessoa: 'leo', categoria: 'moradia', ehFixo: true }),
  tx({ descricao: 'IFOOD', valor: 100, pessoa: 'luis', categoria: 'alimentacao', banco: 'bradesco' }),
  tx({ descricao: 'CONVERSE 7/10', valor: 60, pessoa: 'luis', categoria: 'vestuario',
       parcelaAtual: 7, parcelaTotal: 10, data: '2025-11-28' }),
];

test('resumo: renda, gastos, saldo e taxa de poupança', () => {
  const a = analisar(transacoes, perfil);
  assert.equal(a.mes, '2026-06');
  assert.equal(a.rendaTotal, 9000);
  assert.equal(a.totalGastos, 1860);
  assert.equal(a.saldo, 7140);
  assert.equal(a.taxaPoupanca, 79.3);
});

test('por categoria ordenada desc e por pessoa', () => {
  const a = analisar(transacoes, perfil);
  assert.equal(a.porCategoria.length, 4);
  assert.equal(a.porCategoria[0].id, 'moradia');
  assert.equal(a.porCategoria[0].valor, 1500);
  assert.equal(a.porCategoria[0].label, 'Moradia');
  assert.equal(a.porPessoa.leo.valor, 1500);
  assert.equal(a.porPessoa.luis.valor, 160);
  assert.equal(a.porPessoa.compartilhado.valor, 200);
});

test('fixos vs variáveis e parcelamentos ativos', () => {
  const a = analisar(transacoes, perfil);
  assert.equal(a.fixos.configurados, 1500);
  assert.equal(a.fixos.detectados, 1500);
  assert.equal(a.variaveis, 360);
  assert.equal(a.parcelamentos.length, 1);
  assert.equal(a.parcelamentos[0].restante, 3);
  assert.equal(a.parcelamentos[0].totalRestante, 180);
});

test('top transações, alertas e score saudável', () => {
  const a = analisar(transacoes, perfil);
  assert.equal(a.topTransacoes[0].valor, 1500);
  assert.equal(a.topTransacoes.length, 4);
  assert.ok(!a.alertas.some((al) => al.nivel === 'critico'));
  assert.ok(a.alertas.some((al) => al.nivel === 'atencao')); // moradia 80%
  assert.ok(a.alertas.some((al) => al.nivel === 'info'));     // parcelamento
  assert.equal(a.score.valor, 80);
  assert.equal(a.score.label, 'Saudável');
  assert.equal(a.score.cor, 'success');
  assert.ok(a.recomendacoes.length >= 2);
});

test('déficit gera alerta crítico e score baixo', () => {
  const pobre = { salarios: { leo: 1000, luis: 0 }, fixos: [{ nome: 'x', valor: 900 }], metas: [] };
  const t = [tx({ descricao: 'COMPRA', valor: 2000, pessoa: 'leo', categoria: 'mercado' })];
  const a = analisar(t, pobre);
  assert.equal(a.saldo, -1000);
  assert.ok(a.alertas.some((al) => al.nivel === 'critico'));
  assert.equal(a.score.cor, 'danger');
  assert.ok(a.score.valor < 40);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --test financas-app/test/analisador.test.js`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

`financas-app/src/lib/analisador.js`:
```js
import { CATEGORIAS } from './categorias.js';
import { mesMaisFrequente } from './shared.js';

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;

function infoCategoria(id) {
  return CATEGORIAS.find((c) => c.id === id) || { id, emoji: '❓', label: id };
}

function formatBRL(n) {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '-' : ''}R$ ${intFmt},${dec}`;
}

function faixaScore(v) {
  if (v >= 80) return { label: 'Saudável', cor: 'success' };
  if (v >= 60) return { label: 'Atenção', cor: 'warning' };
  if (v >= 40) return { label: 'Preocupante', cor: 'danger' };
  return { label: 'Crítico', cor: 'danger' };
}

// Função pura: agrega as transações de um mês contra o perfil e devolve a análise.
export function analisar(transacoes, perfil = {}) {
  const salarios = perfil.salarios || {};
  const rendaTotal = (Number(salarios.leo) || 0) + (Number(salarios.luis) || 0);
  const totalGastos = round2(transacoes.reduce((s, t) => s + t.valor, 0));
  const saldo = round2(rendaTotal - totalGastos);
  const taxaPoupanca = rendaTotal > 0 ? round1((saldo / rendaTotal) * 100) : 0;
  const mes = mesMaisFrequente(transacoes.map((t) => t.mesReferencia));

  // por categoria (ordenada desc por valor)
  const mapaCat = new Map();
  for (const t of transacoes) {
    const id = t.categoria || 'outros';
    const e = mapaCat.get(id) || { valor: 0, transacoes: 0 };
    e.valor += t.valor;
    e.transacoes += 1;
    mapaCat.set(id, e);
  }
  const porCategoria = [...mapaCat.entries()]
    .map(([id, e]) => {
      const info = infoCategoria(id);
      return {
        id, emoji: info.emoji, label: info.label,
        valor: round2(e.valor),
        pct: totalGastos > 0 ? round1((e.valor / totalGastos) * 100) : 0,
        transacoes: e.transacoes,
      };
    })
    .sort((a, b) => b.valor - a.valor);

  // por pessoa
  const porPessoa = {};
  for (const pessoa of ['leo', 'luis', 'compartilhado']) {
    const valor = round2(
      transacoes.filter((t) => t.pessoa === pessoa).reduce((s, t) => s + t.valor, 0),
    );
    porPessoa[pessoa] = {
      valor,
      pct: totalGastos > 0 ? round1((valor / totalGastos) * 100) : 0,
    };
  }

  // fixos vs variáveis
  const fixosConfigurados = round2(
    (perfil.fixos || []).reduce((s, f) => s + (Number(f.valor) || 0), 0),
  );
  const fixosDetectados = round2(
    transacoes.filter((t) => t.ehFixo).reduce((s, t) => s + t.valor, 0),
  );
  const fixos = {
    configurados: fixosConfigurados,
    detectados: fixosDetectados,
    pctDaRenda: rendaTotal > 0 ? round1((fixosConfigurados / rendaTotal) * 100) : 0,
  };
  const variaveis = round2(totalGastos - fixosDetectados);

  // parcelamentos ativos (ainda não quitados)
  const parcelamentos = transacoes
    .filter((t) => t.parcelaTotal && t.parcelaAtual && t.parcelaAtual < t.parcelaTotal)
    .map((t) => {
      const restante = t.parcelaTotal - t.parcelaAtual;
      return {
        descricao: t.descricao,
        parcela: `${t.parcelaAtual}/${t.parcelaTotal}`,
        valorMensal: round2(t.valor),
        restante,
        totalRestante: round2(t.valor * restante),
      };
    });

  // top 10 maiores gastos
  const topTransacoes = [...transacoes].sort((a, b) => b.valor - a.valor).slice(0, 10);

  // alertas
  const alertas = [];
  if (saldo < 0) {
    alertas.push({ nivel: 'critico', icon: '🔴', msg: `Déficit de ${formatBRL(-saldo)} este mês` });
  }
  const maiorCat = porCategoria[0];
  if (maiorCat && maiorCat.pct > 25) {
    alertas.push({ nivel: 'atencao', icon: '🟡', msg: `${maiorCat.label} representa ${Math.round(maiorCat.pct)}% dos gastos` });
  }
  const totalRestanteParc = round2(parcelamentos.reduce((s, p) => s + p.totalRestante, 0));
  if (totalRestanteParc > 0) {
    alertas.push({ nivel: 'info', icon: '💳', msg: `${formatBRL(totalRestanteParc)} ainda a pagar em parcelamentos` });
  }

  // score 0–100
  let valorScore = 0;
  if (taxaPoupanca >= 20) valorScore += 25;
  else if (taxaPoupanca >= 10) valorScore += 15;
  const pctFixos = rendaTotal > 0 ? (fixosConfigurados / rendaTotal) * 100 : 100;
  if (pctFixos < 50) valorScore += 20;
  else if (pctFixos <= 70) valorScore += 10;
  if (!alertas.some((a) => a.nivel === 'critico')) valorScore += 15;
  const mensalParc = parcelamentos.reduce((s, p) => s + p.valorMensal, 0);
  if (totalGastos > 0 && (mensalParc / totalGastos) * 100 < 15) valorScore += 10;
  if ((perfil.metas || []).length > 0) valorScore += 10;
  const score = { valor: valorScore, ...faixaScore(valorScore), detalhes: [] };

  // recomendações
  const recomendacoes = [];
  if (maiorCat) {
    recomendacoes.push(`Sua maior categoria é ${maiorCat.label} (${formatBRL(maiorCat.valor)}, ${Math.round(maiorCat.pct)}% dos gastos).`);
  }
  if (totalRestanteParc > 0) {
    recomendacoes.push(`Há ${formatBRL(totalRestanteParc)} em parcelamentos a pagar. Evite novas compras parceladas.`);
  }
  recomendacoes.push(
    taxaPoupanca >= 20
      ? `Ótima taxa de poupança (${taxaPoupanca}%). Continue assim!`
      : `Taxa de poupança baixa (${taxaPoupanca}%). Tente reduzir gastos variáveis.`,
  );

  return {
    mes, rendaTotal, totalGastos, saldo, taxaPoupanca,
    porCategoria, porPessoa, fixos, variaveis,
    parcelamentos, topTransacoes, alertas, score, recomendacoes,
  };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test financas-app/test/analisador.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test --prefix financas-app`
Expected: PASS — todos os testes (núcleo do Plano 1 + categorias + categorizador + analisador).

- [ ] **Step 6: Commit**

```bash
git add financas-app/src/lib/analisador.js financas-app/test/analisador.test.js
git commit -m "feat(financas): motor de analise mensal (score, alertas, recomendacoes)"
```

---

## Cobertura do spec por este plano

- §7 categorizador (regras → palavras-chave → null; precedência) → Tasks 1, 2.
- §8 analisador (resumo, porCategoria, porPessoa, fixos/variáveis, parcelamentos, top 10,
  alertas, score 0–100, recomendações) → Task 3.

**Fora deste plano:** o ponto de score "+10 mês melhor que o anterior" fica para quando
houver histórico (depende de dados de meses anteriores; não faz parte da função pura v1).
Infra/UI nos planos 3–6.
