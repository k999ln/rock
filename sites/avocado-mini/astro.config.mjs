import { fileURLToPath } from 'node:url';
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
    define: {
      'import.meta.env.MII_IMAGE_SOURCE_ROOT': JSON.stringify(fileURLToPath(new URL('../../', import.meta.url))),
    },
    build: {
      emptyOutDir: true,
    },
  },
});
