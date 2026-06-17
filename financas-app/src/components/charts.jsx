// Registro central do Chart.js (tree-shaking: só o que usamos) + re-export dos
// componentes de gráfico. Importe os gráficos SEMPRE deste módulo para garantir
// que o registro rodou.
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
);

// Paleta para o doughnut por categoria (até 15 categorias).
export const CORES = [
  '#0f766e', '#0891b2', '#7c3aed', '#db2777', '#ea580c',
  '#ca8a04', '#16a34a', '#2563eb', '#dc2626', '#9333ea',
  '#0d9488', '#65a30d', '#e11d48', '#475569', '#78716c',
];

export { Doughnut, Bar, Line };
