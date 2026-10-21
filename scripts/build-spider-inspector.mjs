import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--output') {
  throw new Error('Usage: node scripts/build-spider-inspector.mjs --output /path/SPIDER.html');
}
const output = resolve(args[1]);
const sources = await Promise.all(['detector.mjs', 'program-inspector.mjs', 'inspector.html']
  .map((name) => readFile(resolve(root, 'toolkits/spider-guard', name), 'utf8')));
const stripExports = (value) => value.replace(/^export\s+(?=(?:const|let|class|function)\b)/gm, '');
const detector = stripExports(sources[0]);
const inspector = stripExports(sources[1].replace(/^import[\s\S]*?from\s+['"]\.\/detector\.mjs['"];?\s*/m, ''));
const worker = `${detector}\n${inspector}\nself.onmessage = ({data}) => { try { const result = inspectProgram(data.source, { language: data.language }); self.postMessage({ id: data.id, result }); } catch (error) { self.postMessage({ id: data.id, error: error?.code || error?.message || 'CODE_INSPECTION_FAILED' }); } };`;
const encoded = JSON.stringify(worker).replace(/</g, '\\u003c');
if (!sources[2].includes('__SPIDER_WORKER_JSON__')) throw new Error('Missing worker placeholder');
const html = sources[2].replace('__SPIDER_WORKER_JSON__', () => encoded);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
console.log(output);
