import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'app-config.js'],
      manifest: {
        name: 'Modo Brígido',
        short_name: 'Brígido',
        description: 'Peso, nutrición, pasos y entrenamiento en un solo lugar.',
        theme_color: '#0a0f0c',
        background_color: '#0a0f0c',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        navigateFallbackDenylist: [/^\/auth/]
      }
    })
  ]
});
