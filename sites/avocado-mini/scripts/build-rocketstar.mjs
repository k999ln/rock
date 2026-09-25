// Astro owns every public route, so rebuilding rocketstar now performs one
// deterministic site build instead of merging a route-specific Vite bundle.
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const result = await new Promise((resolveResult) => {
  const child = spawn('npm', ['run', 'build:client'], {
    cwd: root,
    stdio: 'inherit',
  });
  child.once('error', () => resolveResult(1));
  child.once('close', (code) => resolveResult(code ?? 1));
});

if (result !== 0) process.exit(result);
