/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// BUILD_TARGET=android: nhúng vào APK (đường dẫn tương đối, không service worker).
const android = process.env.BUILD_TARGET === 'android';
// GitHub Pages phục vụ app dưới /<tên-repo>/. Có thể ghi đè bằng VITE_BASE.
const base = android ? './' : (process.env.VITE_BASE ?? (process.env.GITHUB_ACTIONS ? '/nghe_nhac/' : '/'));

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0'),
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    // APK: không đăng ký service worker (asset đã nằm trong gói app).
    ...(android ? [] : [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/favicon.svg'],
      manifest: {
        name: 'Nghe Nhạc',
        short_name: 'Nghe Nhạc',
        description: 'Nghe nhạc stream, tải về nghe offline, lời bài hát chạy theo nhạc.',
        lang: 'vi',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell: cache toàn bộ asset build. Audio KHÔNG đi qua SW cache —
        // bài offline nằm trong IndexedDB (features/downloads).
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'artwork',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    })]),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
});
