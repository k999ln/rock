// Separate process: node --expose-gc --max-old-space-size=192 scripts/check-noah-memory.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalogLoader } from './noah-managed-installations.mjs';
const root = resolve(import.meta.dirname, '..');
const baseline = process.argv.indexOf('--baseline');
const factory = baseline >= 0 ? (await import(pathToFileURL(process.argv[baseline + 1]))).catalogLoader : catalogLoader;
const ids = JSON.parse(await readFile(resolve(root, 'data/noah-research-index.json'), 'utf8')).rows.filter(r => r[2] === 'agent').map(r => r[0]);
const load = factory(root), samples = [];
for (let pass = 0; pass < 5; pass++) {
  for (const id of ids) {
    await load(id);
    global.gc?.();
    samples.push(process.memoryUsage().heapUsed);
  }
  console.log(JSON.stringify({ pass: pass + 1, heapMiB: Math.round(process.memoryUsage().heapUsed / 1048576) }));
}
const peakHeapMiB = Math.max(...samples) / 1048576;
if (baseline < 0 && peakHeapMiB > 96) throw new Error(`Catalog cache exceeded 96 MiB: ${peakHeapMiB}`);
const result = { requests: ids.length * 5, passes: 5, peakHeapMiB, finalHeapMiB: samples.at(-1) / 1048576 };
const output = process.argv.indexOf('--output');
if (output >= 0) await writeFile(process.argv[output + 1], JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
