import assert from 'node:assert/strict';
import test from 'node:test';
import { campusForHost } from '../lib/campus-host.ts';

void test('the Columbia subdomain selects the Columbia Sky experience', () => {
  assert.equal(campusForHost('columbia.avoado.si'), 'columbia');
  assert.equal(campusForHost('COLUMBIA.AVOADO.SI:443'), 'columbia');
  assert.equal(campusForHost('columbia.avoado.si.'), 'columbia');
});

void test('other and spoofed hosts keep the normal RockstarOS home', () => {
  assert.equal(
    campusForHost('rockstaros-kaiya.noellesugar1.chatgpt.site'),
    null,
  );
  assert.equal(campusForHost('columbia.avoado.si.evil.example'), null);
  assert.equal(campusForHost(null), null);
});
