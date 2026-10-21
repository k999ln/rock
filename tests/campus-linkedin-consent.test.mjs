import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLinkedInCampusDecision,
  linkedinCampusDecisionStorageKey,
  parseLinkedInCampusDecision,
  serializeLinkedInCampusDecision,
} from '../lib/campus-linkedin-consent.ts';

void test('Campus stores a versioned LinkedIn choice without claiming provider authorization', () => {
  const choice = createLinkedInCampusDecision(
    'columbia',
    'consented',
    '2026-10-13T21:00:00.000Z',
  );
  assert.equal(choice.providerAuthorized, false);
  assert.equal(choice.imported, false);
  assert.equal(
    linkedinCampusDecisionStorageKey('columbia'),
    'avocado-campus-linkedin-choice:campus-linkedin-basic-v1:columbia',
  );
  assert.deepEqual(
    parseLinkedInCampusDecision(
      'columbia',
      serializeLinkedInCampusDecision(choice),
    ),
    choice,
  );
});

void test('Campus preserves a no-LinkedIn choice and rejects malformed or cross-campus data', () => {
  const choice = createLinkedInCampusDecision(
    'columbia',
    'skipped',
    '2026-10-13T21:00:00.000Z',
  );
  assert.equal(
    parseLinkedInCampusDecision('nyu', serializeLinkedInCampusDecision(choice)),
    null,
  );
  assert.equal(parseLinkedInCampusDecision('columbia', '{bad'), null);
  assert.equal(
    parseLinkedInCampusDecision(
      'columbia',
      JSON.stringify({ ...choice, imported: true }),
    ),
    null,
  );
});
