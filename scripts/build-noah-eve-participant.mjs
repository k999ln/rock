import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const license = readFileSync(new URL('../vendor/mr/LICENSE', import.meta.url), 'utf8');
const { outputFiles, metafile } = await build({
  absWorkingDir: root, entryPoints: ['lib/noah-eve-agent-program.ts'],
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2020', write: false,
  metafile: true, legalComments: 'none', charset: 'utf8', banner: { js: '/* Generated from the shipped Noah tools.\n' + license.trimEnd() + '\n*/' },
});
if (Object.values(metafile.outputs).some(output => output.imports.length)) throw Error('Participant bundle must be self-contained');
const program = outputFiles[0].contents;
const digest = createHash('sha256').update(program).digest('hex');
const artifacts = [
  [new URL('../public/noah-shared-compute/eve-agents.mjs', import.meta.url), program],
  [new URL('../lib/noah-eve-agent-digest.ts', import.meta.url), Buffer.from("export const EVE_AGENT_SHA256 = '" + digest + "';\n")],
];
for (const [file, bytes] of artifacts) {
  if (process.argv.includes('--check')) {
    if (!readFileSync(file).equals(bytes)) throw Error('Participant artifact is stale: ' + file.pathname);
  } else writeFileSync(file, bytes);
}
console.log('Eve participant package SHA-256 ' + digest);
