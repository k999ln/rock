import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const design = read('docs/ai-native-os-architecture.md');
const sky = read('docs/sky-assistant-and-memory.md');
const memory = read('android/core/src/main/java/dev/rock/core/BoundedMemory.java');

void test('AI03 canonical memory keeps the designed fields (design read-only)', () => {
  const fields = '`schemaVersion/ownerRef/projectRef/memoryId/kind/contentRef/provenance/createdAt/expiresAt/revision`';
  assert.ok(design.includes(fields));
  assert.ok(memory.includes('schemaVersion/ownerRef/projectRef/memoryId/kind/contentRef/provenance/createdAt/expiresAt/revision'));
  for (const field of ['schemaVersion', 'ownerRef', 'projectRef', 'memoryId', 'kind', 'contentRef', 'provenance', 'createdAt', 'expiresAt', 'revision'])
    assert.match(memory, new RegExp(`public final [^;]*\\b${field}\\b`), field);
  assert.ok(design.includes('削除はcanonicalと全projectionの失効を伴う'));
  assert.ok(sky.includes('全削除'));
});

void test('AI03 memory stays host/fixture only and keeps its refusal rules', () => {
  assert.doesNotMatch(memory, /^import\s+(android\.|java\.net\.|dev\.rock\.automation\.)/m);
  assert.doesNotMatch(memory, /embedding|token_ids|tokenIds/i);
  for (const rule of [
    'MEMORY_CONFLICT',
    'MEMORY_CONFIRMATION_REQUIRED',
    'ARTIFACT_REQUIRES_TOOL_SOURCE',
    'UNKNOWN_MEMORY',
    'MEMORY_DELETED',
    'REVISION_CONFLICT',
    'MEMORY_LIMIT_REACHED',
    'MEMORY_CONTENT_TOO_LARGE',
    'CONTEXT_BUDGET_EXCEEDS_PROFILE',
    'MEMORY_RECORD_CORRUPT',
  ])
    assert.ok(memory.includes(`"${rule}"`), rule);
});
