import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createVerifiedRegistryApi } from '../lib/noah-verified-registry.ts';

const root = new URL('../', import.meta.url);
const registry = JSON.parse(readFileSync(new URL('data/noah-agent-registry.json', root), 'utf8'));

await test('review coverage, independent families and untested execution reconcile', () => {
  assert.equal(registry.products.length, registry.summary.families);
  assert.equal(registry.reviews.length, 2603);
  assert.equal(new Set(registry.products.map(p => p.familyId)).size, registry.products.length);
  assert.equal(new Set(registry.products.map(p => p.url.toLowerCase().replace(/\/$/, ''))).size, registry.products.length);
  assert.equal(new Set(registry.products.map(p => p.category)).size, registry.summary.categories);
  assert.equal(registry.reviews.filter(r => r.decision === 'unverifiable').length, registry.summary.unresolved);
  assert.equal(registry.products.filter(p => p.added).length, registry.summary.added);
  for (const p of registry.products) {
    assert.equal(p.connection, 'not_tested'); assert.equal(p.launchAllowed, false);
    assert.equal(Object.hasOwn(p, 'manifest'), false);
    for (const source of p.sources) assert.equal(new URL(source).protocol, 'https:');
  }
  assert.equal(registry.summary.noahConnectionTests, 0);
});

await test('read-only API refreshes on revision changes, rejects writes, and returns no owner data', async () => {
  const handle = createVerifiedRegistryApi(registry);
  const response = handle(new Request('https://example.test/api/noah/agent-registry'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json();
  assert.equal(data.revision, registry.revision);
  assert.equal(Object.hasOwn(data, 'owner'), false);
  const headers = { 'If-None-Match': response.headers.get('etag') };
  assert.equal(handle(new Request('https://example.test', { headers })).status, 304);
  const changed = createVerifiedRegistryApi({ ...registry, revision: 'new-revision' });
  assert.equal(changed(new Request('https://example.test', { headers })).status, 200);
  assert.equal(handle(new Request('https://example.test', { method: 'POST' })).status, 405);
});

await test('committed review snapshot reproduces the runtime registry', () => {
  execFileSync('python3', ['scripts/import-noah-verified-agents.py', '--check'], { cwd: root, stdio: 'pipe' });
});

await test('import rejects duplicate families, false counts and non-HTTPS evidence without promoting runtime claims', () => {
  execFileSync('python3', ['-c', `
import importlib.util, gzip, json, copy
spec = importlib.util.spec_from_file_location('importer', 'scripts/import-noah-verified-agents.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
s = json.loads(gzip.decompress(m.SOURCE.read_bytes()))
for mutation in ['duplicate', 'counts', 'url', 'missing_family']:
    bad = copy.deepcopy(s)
    if mutation == 'duplicate': bad['products'][1]['identityKey'] = bad['products'][0]['identityKey']
    if mutation == 'counts': bad['summary']['confirmedProductFamilies'] += 1
    if mutation == 'url': bad['products'][0]['canonicalUrl'] = 'javascript:alert(1)'
    if mutation == 'missing_family': bad['adjudicationLedger'][0]['familyId'] = 'missing'
    try: m.build(bad)
    except ValueError: pass
    else: raise AssertionError(mutation)
s['products'][0]['connectionAssessment'] = {'state': 'connected', 'launchAllowed': True}
r = m.build(s)
assert all(p['connection'] == 'not_tested' and p['launchAllowed'] is False for p in r['products'])
`], { cwd: root, stdio: 'pipe' });
});

await test('valid refresh replaces the artifact; malformed update preserves the last accepted bytes', () => {
  execFileSync('python3', ['-c', `
import importlib.util, gzip, json, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location('importer', 'scripts/import-noah-verified-agents.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
s = json.loads(gzip.decompress(m.SOURCE.read_bytes()))
with tempfile.TemporaryDirectory() as directory:
    p = Path(directory)
    m.OUTPUT = p / 'output.json'; m.SOURCE = p / 'captured.json.gz'
    incoming = p / 'input.json'
    incoming.write_text(json.dumps(s))
    first = m.run(incoming)
    s['products'][0]['admissionReason'] += ' (review updated)'
    incoming.write_text(json.dumps(s))
    second = m.run(incoming)
    assert first['revision'] != second['revision']
    accepted = m.OUTPUT.read_bytes(); captured = m.SOURCE.read_bytes()
    s['products'].append(s['products'][0]); incoming.write_text(json.dumps(s))
    try: m.run(incoming)
    except ValueError: pass
    else: raise AssertionError('duplicate accepted')
    assert m.OUTPUT.read_bytes() == accepted
    assert m.SOURCE.read_bytes() == captured
`], { cwd: root, stdio: 'pipe' });
});
