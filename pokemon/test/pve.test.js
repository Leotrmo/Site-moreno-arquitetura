// pokemon/test/pve.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { dmgPerHit, effAtk } = require('../lib/meta/pve.js');

test('effAtk: (baseAtk + IV) * CPM(L40)', () => {
  assert.ok(Math.abs(effAtk({ atk: 100, def: 1, hp: 1 }) - (115 * 0.7903)) < 1e-9); // 90.8845
});

test('dmgPerHit: floor(0.5·power·(atk/DEF_REF)·stab) + 1', () => {
  // atk = 90.8845, DEF_REF 180 → atk/DEF_REF = 0.504914
  // sem STAB: floor(0.5·10·0.504914·1)+1 = floor(2.5246)+1 = 3
  assert.strictEqual(dmgPerHit(10, 90.8845, 1), 3);
  // com STAB 1.2: floor(0.5·10·0.504914·1.2)+1 = floor(3.0295)+1 = 4
  assert.strictEqual(dmgPerHit(10, 90.8845, 1.2), 4);
});

const { cycleDps } = require('../lib/meta/pve.js');

test('cycleDps: ciclo fast+charged a L40, com STAB por tipo', () => {
  const base = { atk: 100, def: 100, hp: 100 };  // effAtk = 90.8845
  const fast    = { type: 'fighting', pve: { power: 10, energy: 10, durationMs: 1000 } };
  const charged = { type: 'fighting', pve: { power: 50, energy: 50, durationMs: 2000 } };
  // Df=dmgPerHit(10,90.8845,1.2)=4 ; Dc=dmgPerHit(50,90.8845,1.2)=16
  // n=50/10=5 ; cycleDmg=5·4+16=36 ; cycleTime=5·1.0+2.0=7.0 → DPS=36/7
  const dps = cycleDps(fast, charged, base, ['fighting']);
  assert.ok(Math.abs(dps - (36 / 7)) < 1e-9);
});

test('cycleDps: 0 se o golpe rápido não gera energia (evita divisão por zero)', () => {
  const base = { atk: 100, def: 100, hp: 100 };
  const fast    = { type: 'normal', pve: { power: 5, energy: 0, durationMs: 1000 } };
  const charged = { type: 'normal', pve: { power: 50, energy: 50, durationMs: 2000 } };
  assert.strictEqual(cycleDps(fast, charged, base, ['normal']), 0);
});
