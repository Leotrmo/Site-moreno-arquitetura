import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase.js';

export default function App() {
  const [status, setStatus] = useState('Conectando ao Supabase…');

  useEffect(() => {
    supabase
      .from('households')
      .select('id')
      .limit(1)
      .then(({ error }) => {
        setStatus(error ? `Erro: ${error.message}` : 'Supabase conectado ✓');
      });
  }, []);

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center gap-3 bg-teal-700 text-white p-6">
      <h1 className="text-2xl font-bold">Finanças — Leo &amp; Luis</h1>
      <p className="text-teal-100">{status}</p>
    </main>
  );
}
