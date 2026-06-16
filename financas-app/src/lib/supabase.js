import { createClient } from '@supabase/supabase-js';

// Cliente único do app. As variáveis vêm do .env (VITE_*), são publicáveis;
// a segurança real é a RLS no Postgres.
const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Faltam VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY no .env');
}

export const supabase = createClient(url, anonKey);
