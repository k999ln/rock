import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('shared/stripe.mjs', root));
const copies = [
  'sites/avocado-mini/worker/shared/stripe.mjs',
  'toolkits/fashion-brand-ops/src/shared/stripe.mjs',
];
if (process.argv.length > 3 || !['--check', '--write'].includes(process.argv[2] ?? '--check')) {
  throw new Error('Usage: node scripts/sync-shared-stripe.mjs [--check|--write]');
}
for (const path of copies) {
  const destination = new URL(path, root);
  if (process.argv[2] === '--write') {
    await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
    await writeFile(destination, source);
  } else {
    const copy = await readFile(destination).catch(() => null);
    if (!copy?.equals(source)) {
      throw new Error(`${path} differs from shared/stripe.mjs; run node scripts/sync-shared-stripe.mjs --write`);
    }
  }
}
console.log(`Stripe standalone copies ${process.argv[2] === '--write' ? 'updated' : 'verified'} (${copies.length}).`);
