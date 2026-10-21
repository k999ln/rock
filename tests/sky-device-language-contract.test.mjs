import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skyProgress } from '../lib/sky-presentation.ts';
const fixture=JSON.parse(readFileSync(new URL('../contracts/sky-language-fixture.json',import.meta.url),'utf8'));
void test('device and Web use the same plain-language state fixture',()=>{
  for(const [scope,rows] of Object.entries(fixture)) {
    if(!Array.isArray(rows))continue;
    for(const row of rows)assert.equal(skyProgress(row.state,scope).label,row.label,`${scope}/${row.state}`);
  }
});
