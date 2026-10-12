import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const source = new URL('../public-release/rockstaros/', import.meta.url);
void test('the public publisher allowlist and copy steps include every standalone source file', async () => {
  const workflow = await readFile(new URL('../.github/workflows/publish-rockstaros-public.yml', import.meta.url), 'utf8');
  const allowlistStep = workflow.split('- name: Verify the public allowlist')[1].split('- name: Configure the public repository key')[0];
  const allowed = [...allowlistStep.matchAll(/^\s+([\w./-]+) \\$/gm)].map(match => match[1]).sort();
  async function files(directory, prefix = '') {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) result.push(...await files(new URL(entry.name + '/', directory), relative + '/'));
      else result.push(relative);
    }
    return result;
  }
  assert.deepEqual(allowed, (await files(source)).sort());
  const copied = [...workflow.matchAll(/^\s+(?:cp|install -D) public-release\/rockstaros\/(\S+) public-repository\/\1$/gm)].map(match => match[1]).sort();
  assert.deepEqual(copied, allowed, 'approved source must also be copied to its matching public path');
});

void test('public Sky/Zema package imports and validates a request outside the private repository', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'rock-public-package-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(new URL('package.json', source), join(directory, 'package.json'));
  await cp(new URL('packages', source), join(directory, 'packages'), { recursive: true });
  const core = await import(pathToFileURL(join(directory, 'packages/sky-zema-core/src/index.js')));
  const handoff = core.createSkyZemaHandoff({ toolId: 'public.test', request: 'fixture' });
  assert.equal(core.normalizeSkyZemaHandoff(handoff).executionProvider, 'local-model');
  assert.equal(core.createZemaSession(handoff).status, 'ready');
});
