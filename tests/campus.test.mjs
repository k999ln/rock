import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CAMPUSES,
  CampusError,
  campusFromTagPrefix,
  campusMode,
  campusTagId,
  itemInput,
  matchCampusProfiles,
  profileInput,
  safeRelativeCampusDestination,
  verifiedByCampusDomain,
  verifiedCampusRequestDomain,
} from '../lib/campus.ts';

void test('campus catalog defines the five university experiences', () => {
  assert.deepEqual(Object.keys(CAMPUSES).sort(), [
    'columbia',
    'fit',
    'fordham',
    'johnjay',
    'nyu',
  ]);
  assert.equal(CAMPUSES.fit.opportunityLabel, 'Gigs & opportunities');
  assert.equal(CAMPUSES.columbia.defaultMode, 'research');
  assert.equal(CAMPUSES.johnjay.focus.includes('Justice'), true);
});

void test('affiliation verification accepts only matching authenticated domains', () => {
  assert.equal(verifiedByCampusDomain('nyu', 'student@nyu.edu'), true);
  assert.equal(verifiedByCampusDomain('nyu', 'student@law.nyu.edu'), true);
  assert.equal(verifiedByCampusDomain('nyu', 'student@gmail.com'), false);
  assert.equal(verifiedByCampusDomain('johnjay', 'student@jjay.cuny.edu'), true);
  assert.equal(verifiedByCampusDomain('johnjay', 'student@cuny.edu'), false);
  assert.equal(verifiedByCampusDomain('fit', null), false);
});

void test('a device bearer cannot claim campus affiliation through a client-supplied email', () => {
  const headers = { 'oai-authenticated-user-email': 'student@nyu.edu' };
  assert.equal(verifiedCampusRequestDomain('nyu', new Request('https://example.com/api/campus', { headers })), true);
  headers.authorization = 'Bearer rock_session_fixture';
  assert.equal(verifiedCampusRequestDomain('nyu', new Request('https://example.com/api/campus', { headers })), false);
});

void test('profile input is bounded, normalized and rejects unsafe links', () => {
  const profile = profileInput({
    campusId: 'fit',
    handle: ' Kaiya.Design ',
    displayName: '  Kaiya   N ',
    affiliation: 'student',
    headline: 'Fashion + AI',
    bio: 'Building creative tools.',
    skills: ['Photography', 'Photography', 'Branding'],
    interests: ['Fashion'],
    lookingFor: ['Stylist'],
    links: [{ label: 'Portfolio', url: 'https://example.com/work' }],
    isPublic: true,
  });
  assert.equal(profile.handle, 'kaiya.design');
  assert.equal(profile.displayName, 'Kaiya N');
  assert.deepEqual(profile.skills, ['Photography', 'Branding']);
  assert.throws(
    () =>
      profileInput({
        ...profile,
        links: [{ label: 'Bad', url: 'javascript:alert(1)' }],
      }),
    CampusError,
  );
});

void test('item validation preserves typed campus workflows', () => {
  const opportunity = itemInput({
    campusId: 'fordham',
    kind: 'opportunity',
    title: 'Startup internship',
    summary: 'Work with a student-founded company.',
    tags: ['Business', 'Startup'],
    details: {
      opportunityType: 'internship',
      organization: 'Student Venture',
      compensation: 'Paid',
      externalUrl: 'https://example.com/apply',
      deadline: '2026-10-12T18:00:00-04:00',
    },
    startsAt: null,
    endsAt: null,
    visibility: 'campus',
  });
  assert.equal(opportunity.kind, 'opportunity');
  assert.equal(opportunity.details.opportunityType, 'internship');
  assert.equal(opportunity.details.compensation, 'Paid');

  assert.throws(
    () =>
      itemInput({
        campusId: 'nyu',
        kind: 'event',
        title: 'Film meetup',
        summary: 'Meet collaborators.',
        tags: [],
        details: {},
        startsAt: null,
        endsAt: null,
        visibility: 'public',
      }),
    /開始日時/u,
  );
});

void test('campus routes and tag identifiers fail closed', () => {
  assert.equal(
    safeRelativeCampusDestination('/campus?campus=columbia&mode=research'),
    '/campus?campus=columbia&mode=research',
  );
  assert.throws(
    () => safeRelativeCampusDestination('https://evil.example/campus'),
    CampusError,
  );
  assert.equal(campusTagId('nyu-library-0001'), 'nyu-library-0001');
  assert.equal(campusFromTagPrefix('fit-fashion-0042'), 'fit');
  assert.equal(campusFromTagPrefix('unknown-0042'), null);
  assert.equal(campusMode('career'), 'career');
  assert.throws(() => campusMode('admin'), CampusError);
});

void test('profile matching rewards complementary skills and shared interests', () => {
  const current = {
    id: 'a',
    campusId: 'nyu',
    handle: 'a',
    displayName: 'A',
    affiliation: 'student',
    affiliationStatus: 'self_declared',
    headline: '',
    bio: '',
    skills: ['Editing'],
    interests: ['Film', 'AI'],
    lookingFor: ['Camera', 'Actor'],
    links: [],
    updatedAt: '2026-09-27T00:00:00.000Z',
  };
  const strong = {
    ...current,
    id: 'b',
    handle: 'b',
    displayName: 'B',
    skills: ['Camera', 'Actor'],
    lookingFor: ['Editing'],
  };
  const weak = {
    ...current,
    id: 'c',
    handle: 'c',
    displayName: 'C',
    skills: ['Accounting'],
    interests: ['Finance'],
    lookingFor: ['Tax'],
  };
  const otherCampus = {
    ...strong,
    id: 'd',
    campusId: 'fit',
    handle: 'd',
    displayName: 'D',
  };
  const matches = matchCampusProfiles(current, [weak, otherCampus, strong]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].profile.id, 'b');
  assert.ok(matches[0].score >= 60);
  assert.ok(matches[0].reasons.some((reason) => reason.includes('camera')));
});
