import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../lib/catalog.ts';
import {
  assessLegalIntake,
  buildHandoffSummary,
  lawyerDirectory,
  recommendLawyers,
} from '../lib/legal-intake.ts';

const baseInput = {
  issueType: 'criminal',
  location: 'nyc',
  matterStage: 'general_information',
  situationSummary: '手続の一般的な流れと、準備しておく資料を確認したいです。',
  desiredOutcome: '次に何を整理すべきか知りたい',
  deadlineDate: undefined,
  immediateDanger: false,
  detainedOrArrested: false,
  domesticViolence: false,
  receivedOfficialDocument: false,
  contactPreference: 'email',
};

void test('legal intake is a ready Sky browser tool', () => {
  const tool = catalog.find((entry) => entry.id === 'rockstar-legal-intake');
  assert.equal(tool?.status, 'ready');
  assert.equal(tool?.runner, 'legal-intake');
  assert.match(tool?.environment ?? '', /ブラウザ内/);
});

void test('general information stays in guided intake', () => {
  const result = assessLegalIntake(baseInput, new Date('2026-09-12T12:00:00Z'));
  assert.equal(result.urgency, 'guided_information');
  assert.equal(result.lawyerRequired, false);
});

void test('immediate danger always routes to emergency help', () => {
  const result = assessLegalIntake(
    { ...baseInput, immediateDanger: true, domesticViolence: true },
    new Date('2026-09-12T12:00:00Z'),
  );
  assert.equal(result.urgency, 'emergency');
  assert.equal(result.lawyerRequired, true);
  assert.ok(result.nextActions.some((action) => action.includes('911')));
  assert.ok(result.nextActions.some((action) => action.includes('HOPE')));
});

void test('arrest or a deadline within seven days routes to urgent counsel', () => {
  const arrest = assessLegalIntake(
    { ...baseInput, detainedOrArrested: true },
    new Date('2026-09-12T12:00:00Z'),
  );
  const deadline = assessLegalIntake(
    { ...baseInput, deadlineDate: '2026-09-18' },
    new Date('2026-09-12T12:00:00Z'),
  );
  assert.equal(arrest.urgency, 'urgent');
  assert.equal(deadline.urgency, 'urgent');
});

void test('criminal matters prioritize the supplied criminal-law contact', () => {
  const matches = recommendLawyers('criminal', 'nyc');
  assert.equal(matches[0]?.id, 'akane-fujiwara');
});

void test('directory preserves all public entries from the supplied consulate list', () => {
  assert.equal(lawyerDirectory.length, 33);
  assert.equal(
    new Set(lawyerDirectory.map((lawyer) => lawyer.id)).size,
    lawyerDirectory.length,
  );
  assert.ok(
    lawyerDirectory.every(
      (lawyer) => lawyer.phone || lawyer.email || lawyer.website,
    ),
  );
});

void test('handoff summary labels itself as intake rather than legal analysis', () => {
  const activeInput = { ...baseInput, matterStage: 'active_problem' };
  const assessment = assessLegalIntake(
    activeInput,
    new Date('2026-09-12T12:00:00Z'),
  );
  const summary = buildHandoffSummary(activeInput, assessment);
  assert.match(summary, /法的評価・事実認定ではありません/);
  assert.match(summary, /利益相反確認/);
});
