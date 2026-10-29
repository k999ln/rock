import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Exercise the versioned distributable from a clean, isolated author workspace.
const directory = mkdtempSync(join(tmpdir(), 'rock-sdk-author-'));
process.once('exit', () => rmSync(directory, { recursive: true, force: true }));
const archive = fileURLToPath(new URL('../../../public/toolkits/rockstaros-sky-tool-sdk-0.1.4.tgz', import.meta.url));
execFileSync('tar', ['-xzf', archive, '-C', directory], { timeout: 5000 });
const sample = await import(pathToFileURL(join(directory, 'package/examples/line-counter.mjs')).href);
export const fixturePermissions = sample.examplePermissions;
export const createDeclaredFixtureTools = sample.createLineCounter;
