import assert from 'node:assert/strict';
import test from 'node:test';
import { catalog } from '../lib/catalog.ts';
import {
  assessLegalIntake,
  buildHandoffSummary,
  getSelfHelpResources,
  lawyerDirectory,
  recommendLawyers,
} from '../lib/legal-intake.ts';
import {
  LEGAL_AI_ALLOWED_DOMAINS,
  buildLocalLegalResult,
  buildLegalAiRequest,
  parseLegalAiResponse,
} from '../lib/legal-ai.ts';

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
  assert.match(tool?.environment ?? '', /保存しません/);
  assert.match(tool?.environment ?? '', /端末内処理/);
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
  const assessment = assessLegalIntake(
    { ...baseInput, matterStage: 'active_problem' },
    new Date('2026-09-12T12:00:00Z'),
  );
  assert.equal(assessment.primaryCounselId, 'akane-fujiwara');
});

void test('general criminal information is not assigned to counsel', () => {
  const assessment = assessLegalIntake(
    baseInput,
    new Date('2026-09-12T12:00:00Z'),
  );
  assert.equal(assessment.primaryCounselId, undefined);
});

void test('free public resources are available before lawyer contact', () => {
  const resources = getSelfHelpResources('housing', 'nyc');
  assert.ok(resources.length >= 2);
  assert.ok(resources.some((resource) => resource.id === 'ny-courthelp'));
  assert.ok(resources.every((resource) => resource.url.startsWith('https://')));
});

void test('legal AI request is stateless and limited to official domains', () => {
  const request = buildLegalAiRequest(baseInput, '2026-09-12');
  assert.equal(request.store, false);
  assert.equal(request.tools[0]?.type, 'web_search');
  assert.deepEqual(request.tools[0]?.filters.allowed_domains, [
    ...LEGAL_AI_ALLOWED_DOMAINS,
  ]);
});

void test('legal AI output requires an allowlisted clickable citation', () => {
  const parsed = parseLegalAiResponse(
    {
      output: [
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: '裁判所の公式案内を確認してください。',
              annotations: [
                {
                  type: 'url_citation',
                  title: 'CourtHelp',
                  url: 'https://www.nycourts.gov/help/courthelp',
                },
                {
                  type: 'url_citation',
                  title: 'Untrusted',
                  url: 'https://example.com/legal',
                },
              ],
            },
          ],
        },
      ],
    },
    '2026-09-12T12:00:00.000Z',
  );
  assert.equal(parsed.citations.length, 1);
  assert.equal(parsed.citations[0]?.title, 'CourtHelp');
  assert.throws(() =>
    parseLegalAiResponse({
      output: [
        {
          type: 'message',
          content: [{ type: 'output_text', text: '根拠なし' }],
        },
      ],
    }),
  );
});

void test('offline legal guidance uses only the local official-entry registry', () => {
  const assessment = assessLegalIntake(
    baseInput,
    new Date('2026-09-12T12:00:00Z'),
  );
  const result = buildLocalLegalResult(baseInput, assessment);
  assert.equal(result.mode, 'local-registry');
  assert.match(result.answer, /通信せず/);
  assert.ok(result.citations.length > 0);
  assert.ok(result.citations.every((citation) => citation.url.startsWith('https://')));
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
