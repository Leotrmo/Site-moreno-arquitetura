// Formatação pura para a UI (PT-BR). Réplica deliberada do formatBRL interno do
// analisador, para não tocar em código já testado e congelado.

export function formatBRL(n) {
  const num = Number(n) || 0;
  const [int, dec] = Math.abs(num).toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${num < 0 ? '-' : ''}R$ ${intFmt},${dec}`;
}

export function formatData(iso) {
  const [a, m, d] = String(iso).split('-');
  return `${d}/${m}/${a}`;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function nomeMes(ym) {
  const [a, m] = String(ym).split('-').map(Number);
  return `${MESES[m - 1]}/${a}`;
}

// Anda `delta` meses em 'AAAA-MM' (Date resolve a virada de ano).
export function shiftMes(ym, delta) {
  const [a, m] = String(ym).split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
