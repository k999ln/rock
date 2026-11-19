import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { sourceProject } from '../lib/noah-source-project.ts';
import { writeNoahArchive } from '../lib/noah-source-archive.ts';
import { validateProject } from './noah-project-validation.mjs';
const root = process.argv[2]; if (!root) throw new Error('Pass the existing isolated engine checkout.');
const zip = files => writeNoahArchive(Object.entries(files).map(([name, content]) => ({ name, bytes: new TextEncoder().encode(content), os: 0, attrs: 0 })));
const rows = [];
const js = { 'src/add.ts': 'export function add(a: number, b: number) { return a + b; }', 'agent.ts': "export {add} from './src/add.ts';", 'agent.test.mjs': "import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import {add} from './agent.ts'; test('sum and immutable tests',()=>{assert.equal(add(2,3),5); assert.throws(()=>fs.writeFileSync('agent.test.mjs','changed'));});" };
const py = { 'helpers.py': 'def add(a,b):\n    return a+b\n', 'agent.py': 'from helpers import add\n', 'test_agent.py': "import unittest\nfrom agent import add\nclass Check(unittest.TestCase):\n def test_add(self): self.assertEqual(add(2,3),5)\n def test_readonly(self):\n  with self.assertRaises(OSError):\n   with open('test_agent.py','w') as f: f.write('changed')\n" };
for (const [name, files, expected, stage] of [
  ['typescript-multifile', js, true, 'tests'], ['python-multifile', py, true, 'tests'],
  ['python-wrong-result', { ...py, 'helpers.py': 'def add(a,b): return a-b\n' }, false, 'tests'],
  ['python-missing-dependency', { ...py, 'agent.py': 'import package_not_installed\nfrom helpers import add\n' }, false, 'dependencies'],
  ['typescript-type-error', { ...js, 'src/add.ts': 'export function add(a: number,b: number):number {return "wrong";}' }, false, 'typecheck'],
]) {
  const project = await sourceProject('project.zip', zip(files));
  const result = await validateProject({ root, project, signal: AbortSignal.timeout(180000) });
  rows.push({ name, result }); console.log(JSON.stringify({ name, passed: result.passed, stage: result.stage }));
  assert.equal(result.passed, expected, JSON.stringify(result)); assert.equal(result.stage, stage);
}
const out = resolve('work/verification/noah-continuation-20261116/results'); await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'isolated-project-validation.json'), JSON.stringify({ at: new Date().toISOString(), scope: 'actual pinned containers; synthetic source/tests; not an Agent/model run', rows }, null, 2) + '\n');
