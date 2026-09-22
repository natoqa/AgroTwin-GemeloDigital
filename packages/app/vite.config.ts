import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The PWA build.
 *
 * `registerType: 'autoUpdate'` keeps the farmer off the update treadmill:
 * there is no "a new version is available" dialog to understand, the next
 * cold start simply runs the new shell.
 *
 * The precache list is the app shell only. The inference runtime and the model
 * are excluded on purpose (RNF-02), and arrive in Phase 5 with a caching
 * strategy of their own.
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Without this the service worker only exists in a production build, and
      // the offline end-to-end test would be checking nothing in dev.
      devOptions: { enabled: false },
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'AgroTwin — Gemelo digital de parcela',
        short_name: 'AgroTwin',
        description:
          'Gemelo digital de tu parcela de papa. Funciona sin internet, en tu teléfono.',
        lang: 'es',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f7f4',
        theme_color: '#1d6f2f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Any navigation resolves to the shell, so a deep link works offline.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    // The reference device is a low-end Android 10+ phone with current Chrome;
    // Android 8-9 is frozen at Chrome 138. Nothing newer than that baseline.
    target: 'chrome138',
  },
});
