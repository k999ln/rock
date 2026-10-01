import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readSkyResults,
  saveSkyResult,
  deleteSkyResult,
} from '../lib/sky-result-library.ts';
const storage = () => {
  let raw = null;
  return {
    getItem: () => raw,
    setItem: (_, v) => {
      raw = v;
    },
  };
};
const result = (id) => ({
  id,
  tool: 'citations',
  title: '成果',
  output: `本文${id}`,
  createdAt: '2026-10-01T00:00:00Z',
});
void test('saved results survive a fresh reader; deleting preserves other tools', () => {
  const s = storage();
  saveSkyResult(s, result('1'));
  saveSkyResult(s, { ...result('2'), tool: 'free-article' });
  assert.deepEqual(
    readSkyResults(s).map((v) => v.id),
    ['2', '1'],
  );
  assert.deepEqual(
    deleteSkyResult(s, '1').map((v) => v.id),
    ['2'],
  );
});
void test('duplicate saves do not consume capacity; capacity errors preserve existing results', () => {
  const s = storage();
  for (let i = 0; i < 20; i++) saveSkyResult(s, result(String(i)));
  saveSkyResult(s, result('0'));
  assert.equal(readSkyResults(s).length, 20);
  assert.throws(() => saveSkyResult(s, result('21')), /20件/);
  assert.equal(readSkyResults(s).length, 20);
});
void test('corrupt storage and unavailable writes are reported without claiming success', () => {
  assert.throws(() => readSkyResults({ getItem: () => '{', setItem() {} }));
  assert.throws(
    () =>
      saveSkyResult(
        {
          getItem: () => null,
          setItem() {
            throw Error('quota');
          },
        },
        result('1'),
      ),
    /quota/,
  );
  assert.throws(() =>
    saveSkyResult(storage(), { ...result('1'), output: 'a'.repeat(150001) }),
  );
});
