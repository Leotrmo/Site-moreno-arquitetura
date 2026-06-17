import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Shell from './components/Shell.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Upload from './pages/Upload.jsx';
import Categorizar from './pages/Categorizar.jsx';
import Relatorio from './pages/Relatorio.jsx';
import Configuracoes from './pages/Configuracoes.jsx';
import { TransacoesProvider } from './data/TransacoesContext.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route element={<ProtectedRoute><TransacoesProvider><Shell /></TransacoesProvider></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/categorizar" element={<Categorizar />} />
        <Route path="/relatorio" element={<Relatorio />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
