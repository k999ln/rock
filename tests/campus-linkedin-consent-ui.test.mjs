import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const workspace = readFileSync(
  resolve('components/campus-workspace.tsx'),
  'utf8',
);
const columbiaFeed = readFileSync(
  resolve('app/sky/campus/[campusId]/columbia-feed.tsx'),
  'utf8',
);
const styles = readFileSync(
  resolve('components/campus-workspace.module.css'),
  'utf8',
);

void test('Campus removes the required profile form and offers an optional LinkedIn choice', () => {
  assert.doesNotMatch(workspace, /function ProfileEditor/u);
  assert.doesNotMatch(
    workspace,
    /Save profile|Create profile|Save & enter Campus/u,
  );
  assert.match(workspace, /I agree — enter Campus/u);
  assert.match(workspace, /Continue without LinkedIn/u);
  assert.match(columbiaFeed, /I agree — enter Campus/u);
  assert.match(columbiaFeed, /Continue without LinkedIn/u);
  assert.doesNotMatch(columbiaFeed, />Profile</u);
});

void test('consent copy does not claim that LinkedIn is already connected or imported', () => {
  assert.match(workspace, /does not connect LinkedIn or import data/u);
  assert.match(workspace, /official connection is not enabled yet/u);
  assert.match(workspace, /LinkedIn has not shared any data yet/u);
  assert.match(columbiaFeed, /does not connect LinkedIn or import data/u);
  assert.match(styles, /var\(--campus-accent,\s*#4f7d5a\)/u);
  assert.match(columbiaFeed, /official connection is not enabled yet/u);
});
