import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // servido em moreno.arq.br/financas
  base: '/financas/',
  // o build cai na pasta estática servida pelo GitHub Pages (fora de financas-app/)
  build: { outDir: '../financas', emptyOutDir: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Finanças Leo & Luis',
        short_name: 'Finanças',
        description: 'Controle financeiro do casal',
        lang: 'pt-BR',
        theme_color: '#0f766e',
        background_color: '#0f766e',
        display: 'standalone',
        scope: '/financas/',
        start_url: '/financas/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
