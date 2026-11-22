import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// 既知の穴が直った版より古い物へ、lockfile が戻らない事を確かめる。
const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));

function atLeast(version, floor) {
  const a = version.split('.').map(Number);
  const b = floor.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

// vite 8.3.0〜8.3.2: server.fs の外のファイルが読める・他の origin から script が動く等（GHSA-rq7h-c2jc-7f22 ほか、high）。
const floors = { vite: '8.3.3' };

for (const [name, floor] of Object.entries(floors)) {
  test(`${name} は ${floor} 以上に固定されている`, () => {
    const entries = Object.entries(lock.packages).filter(
      ([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`),
    );
    assert.ok(entries.length > 0, `${name} が lockfile に無い`);
    for (const [path, entry] of entries) {
      assert.ok(atLeast(entry.version, floor), `${path} が ${entry.version}（${floor} 未満）`);
    }
  });
}
