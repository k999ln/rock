import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  trailingSlash: 'always',
  outDir: './dist/client',
  publicDir: './public',
  compressHTML: true,
  build: {
    format: 'directory',
    assets: 'assets',
  },
  vite: {
    build: {
      emptyOutDir: true,
    },
  },
});
