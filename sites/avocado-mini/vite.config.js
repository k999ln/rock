import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        rockstaros: resolve(import.meta.dirname, 'rockstaros/index.html'),
        guide: resolve(import.meta.dirname, 'guide/index.html'),
        crowdfunding: resolve(import.meta.dirname, 'crowdfunding/index.html'),
      },
    },
  },
});
