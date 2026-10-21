import { cpSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

// An active build may replace dist while a regression suite is copying it.
// Validate the bytes on both sides before workerd sees an incomplete module set.
function inventory(directory) {
  const files = readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter(file => !file.split(/[\\/]/).some(part => part.startsWith('._')) && /\.(?:m?js|json)$/.test(file))
    .sort();
  const config = JSON.parse(readFileSync(join(directory, 'wrangler.json'), 'utf8'));
  const main = resolve(directory, config.main);
  if (!main.startsWith(resolve(directory) + '/')) throw new Error('Worker entry must remain inside the build.');
  const entry = readFileSync(main, 'utf8');
  for (const match of entry.matchAll(/(?:from\s*|import\s*)["'](\.\/[^"']*manifest\.js)["']/g)) {
    const name = match[1].slice(2);
    if (!files.includes(name)) throw new Error(`Incomplete Worker build: missing ${name}. Finish the build before testing.`);
  }
  return JSON.stringify(files.map(file => [file, createHash('sha256').update(readFileSync(join(directory, file))).digest('hex')]));
}

export function copyWorkerBuildFixture(source, destination) {
  if (existsSync(destination)) throw new Error('Worker fixture destination must be new.');
  const before = inventory(join(source, 'server'));
  try {
    cpSync(source, destination, { recursive: true, errorOnExist: true, force: false,
      filter: path => !path.split(/[\\/]/).at(-1).startsWith('._') });
    const copied = inventory(join(destination, 'server'));
    if (before !== copied || before !== inventory(join(source, 'server')))
      throw new Error('Worker build changed while preparing the fixture. Finish the build and rerun the check.');
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}
