import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist/client',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        rockstaros: resolve(import.meta.dirname, 'rockstaros/index.html'),
        guide: resolve(import.meta.dirname, 'guide/index.html'),
        install: resolve(import.meta.dirname, 'install/index.html'),
        crowdfunding: resolve(import.meta.dirname, 'crowdfunding/index.html'),
        rocketStar: resolve(import.meta.dirname, 'rocket-star/index.html'),
        preorder: resolve(import.meta.dirname, 'preorder/index.html'),
        preorderConfirm: resolve(import.meta.dirname, 'preorder/confirm/index.html'),
        preorderComplete: resolve(import.meta.dirname, 'preorder/complete/index.html'),
        legal: resolve(import.meta.dirname, 'legal/index.html'),
        privacy: resolve(import.meta.dirname, 'privacy/index.html'),
      },
    },
  },
});
