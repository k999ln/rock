import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNoahLocalCaptureWriter } from '../scripts/noah-local-capture.mjs';

const capture = (overrides = {}) => ({
  familyId: 'mcp-registry:example/tool',
  candidateId: 'mcp-registry:example/tool',
  toolsSha256: 'a'.repeat(64),
  tools: [{
    name: 'describe',
    description: 'Returns text.',
    inputSchema: { type: 'object', properties: { api_key: { type: 'string', default: 'sk-should-not-be-saved' } } },
    outputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    readOnly: true,
  }],
  ...overrides,
});

void test('local capture is directly consumable, redacts credential-like values, and resumes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'noah-label-capture-'));
  try {
    const write = createNoahLocalCaptureWriter(directory);
    const first = await write(capture());
    const second = await write(capture());
    assert.equal(first.status, 'written');
    assert.equal(second.status, 'resumed');
    const path = join(directory, readdirSync(directory)[0]);
    const saved = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(Object.keys(saved), ['schema', 'batchId', 'series']);
    assert.deepEqual(saved.series[0].tools[0].outputSchema, capture().tools[0].outputSchema);
    assert.equal(JSON.stringify(saved).includes('sk-should-not-be-saved'), false);
    assert.equal(Object.hasOwn(saved.series[0].tools[0], 'readOnly'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

void test('local capture enforces the bounded manifest size before writing', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'noah-label-capture-size-'));
  try {
    const write = createNoahLocalCaptureWriter(directory, { maxBytes: 200 });
    await assert.rejects(write(capture()), /exceeds 200 bytes/u);
    assert.deepEqual(readdirSync(directory), []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
