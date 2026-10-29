import { mkdir, readFile, writeFile } from 'node:fs/promises';

// The SDK is already Node-compatible JavaScript. This explicit build copies
// the exact source bytes into the package entry; it is not transpilation.
const source = await readFile(new URL('./src/index.mjs', import.meta.url));
await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await writeFile(new URL('./dist/index.mjs', import.meta.url), source);
