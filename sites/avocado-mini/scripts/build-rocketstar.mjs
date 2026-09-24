// Rebuild this route while preserving the other published pages and shared assets.
import { build } from 'vite';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = await mkdtemp(resolve(tmpdir(), 'rocketstar-route-'));
try {
  await build({
    configFile: false,
    root,
    publicDir: false,
    build: {
      outDir: output,
      emptyOutDir: true,
      rollupOptions: { input: { rocketStar: resolve(root, 'rocket-star/index.html') } },
    },
  });
  await cp(output, resolve(root, 'dist/client'), { recursive: true });
  await cp(resolve(root, 'public/downloads'), resolve(root, 'dist/client/downloads'), { recursive: true });
} finally {
  await rm(output, { recursive: true, force: true });
}
