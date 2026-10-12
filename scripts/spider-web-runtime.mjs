import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Cloudflare plugin writes the production config for its own runtime.
// Resolving from the application can select an older, incompatible Wrangler.
export function productionWrangler(builderEntry = import.meta.resolve('@cloudflare/vite-plugin')) {
  const builderRequire = createRequire(builderEntry);
  const manifestPath = builderRequire.resolve('wrangler/package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.name !== 'wrangler' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(manifest.version) ||
      typeof manifest.bin?.wrangler !== 'string') throw new Error('Invalid production Wrangler manifest');
  const cli = resolve(dirname(manifestPath), manifest.bin.wrangler);
  const path = relative(dirname(manifestPath), cli);
  if (path === '..' || path.startsWith('../') || isAbsolute(path) || !statSync(cli).isFile())
    throw new Error('Invalid production Wrangler executable');
  return { cli, version: manifest.version };
}

// Emit fixed labels only: server output may contain credentials or user data.
export function startupFailureMetadata(log) {
  const codes = [
    'ERR_RUNTIME_FAILURE', 'ERR_MODULE_NOT_FOUND', 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    'ERR_INVALID_ARG_TYPE', 'ERR_INVALID_URL', 'EADDRINUSE', 'EACCES', 'ENOENT', 'ENOSPC',
  ].filter((code) => new RegExp(`\\b${code}\\b`).test(log));
  const signals = Object.entries({
    compatibilityDate: /compatibility[ _-]?date/i,
    unsupportedFutureDate: /(?:future|newer|too far|not supported|unsupported)/i,
    missingModule: /cannot find module|no such module|could not resolve/i,
    missingExport: /does not (?:provide|export)|no matching export/i,
    runtimeStartup: /runtime failed to start|failed to start.*runtime/i,
    typeError: /\bTypeError\b/,
    referenceError: /\bReferenceError\b/,
    syntaxError: /\bSyntaxError\b/,
  }).filter(([, pattern]) => pattern.test(log)).map(([name]) => name);
  return { codes, signals };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  if (mode === 'cli') console.log(productionWrangler().cli);
  else if (mode === 'diagnose') {
    console.log(JSON.stringify(startupFailureMetadata(readFileSync(process.argv[3], 'utf8'))));
  } else throw new Error('Expected cli or diagnose');
}
