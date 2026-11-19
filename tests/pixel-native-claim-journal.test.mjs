import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { linkedCanonical, linkedDigest, parseLinkedReport } from '../lib/rockstar-linked-execution.ts';
import { parseLocalTextRequest } from '../packages/rockstaros-runtime/src/executor.mjs';
const fixture=JSON.parse(await readFile(new URL('../toolkits/sky-linux-local/owner-jvm-tests/portable-command-fixture.json',import.meta.url),'utf8'));
void test('native journal JVM vectors stay pinned to the production JS wire contract',async()=>{
  for(const v of fixture.vectors){assert.equal(linkedCanonical(v.value),v.canonical);assert.equal(await linkedDigest(v.value),v.sha256);}
  for(const report of fixture.reports)assert.deepEqual(await parseLinkedReport(report,fixture.command),report);
  const c=fixture.command,request=parseLocalTextRequest(c.request,fixture.now);
  assert.equal(await linkedDigest(c.request),c.requestSha256);
  assert.equal(await linkedDigest(JSON.stringify({name:request.agent.name,instructions:request.agent.instructions,modelId:request.agent.modelId})),request.agent.sha256);
  assert.equal(c.owner,fixture.owner);assert.equal(c.deviceId,fixture.device);assert.equal(c.executorId,'pixel-linux-gguf');
});
