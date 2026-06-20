// Lógica pura da aba Lançamentos: período (presets), filtro, ordenação e resumo.
// Opera sobre transações em camelCase (passe por paraAnalise() do transacaoAdapter antes).
import { shiftMes } from './formato.js';

// 'AAAA-MM' de uma Date.
function ymDeData(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Normaliza string p/ comparação case-insensitive.
function up(s) {
  return String(s ?? '').toUpperCase();
}

// Converte um preset de período em { de, ate } ('AAAA-MM', ou null = sem limite naquela ponta).
export function intervaloDePreset(preset, hoje = new Date()) {
  const mes = ymDeData(hoje);
  switch (preset) {
    case 'mes':
      return { de: mes, ate: mes };
    case '3meses':
      return { de: shiftMes(mes, -2), ate: mes };
    case 'ano': {
      const a = hoje.getFullYear();
      return { de: `${a}-01`, ate: `${a}-12` };
    }
    default:
      return { de: null, ate: null };
  }
}

// Filtra a lista combinando todos os critérios com E (AND). Critério ausente / 'todos' / 'todas' = inativo.
export function filtrarLancamentos(txs, filtros = {}) {
  const { periodo, banco, pessoa, categoria, parcelado, busca } = filtros;
  const de = periodo?.de ?? null;
  const ate = periodo?.ate ?? null;
  const q = up(busca).trim();
  return txs.filter((t) => {
    if (de && t.mesReferencia < de) return false;
    if (ate && t.mesReferencia > ate) return false;
    if (banco && banco !== 'todos' && t.banco !== banco) return false;
    if (pessoa && pessoa !== 'todos' && t.pessoa !== pessoa) return false;
    if (categoria && categoria !== 'todas') {
      if (categoria === 'sem') {
        if (t.categoria != null) return false;
      } else if (t.categoria !== categoria) {
        return false;
      }
    }
    if (parcelado && parcelado !== 'todos') {
      const eh = t.parcelaTotal != null || t.serieId != null;
      if (parcelado === 'sim' && !eh) return false;
      if (parcelado === 'nao' && eh) return false;
    }
    if (q && !up(t.descricao).includes(q) && !up(t.descricaoOriginal).includes(q)) return false;
    return true;
  });
}

// Ordena (sem mutar): campo data|valor|descricao, direção asc|desc. Estável (desempate por índice original).
export function ordenarLancamentos(lista, ordem = {}) {
  const campo = ordem.campo ?? 'data';
  const direcao = ordem.direcao ?? 'desc';
  const fator = direcao === 'asc' ? 1 : -1;
  function comparar(a, b) {
    let c;
    if (campo === 'valor') {
      c = (Number(a.valor) || 0) - (Number(b.valor) || 0);
    } else if (campo === 'descricao') {
      c = String(a.descricao).localeCompare(String(b.descricao), 'pt-BR', { sensitivity: 'base' });
    } else {
      c = String(a.data).localeCompare(String(b.data));
    }
    return c * fator;
  }
  return lista
    .map((item, i) => ({ item, i }))
    .sort((x, y) => comparar(x.item, y.item) || x.i - y.i)
    .map((w) => w.item);
}

// Contagem e soma dos valores do recorte.
export function resumoLancamentos(lista) {
  let soma = 0;
  for (const t of lista) soma += Number(t.valor) || 0;
  return { count: lista.length, soma };
}
