// Owner-authored fictional evaluation material, never training data or real news.
export const evidenceSuiteVersion = 'eve.news-evidence-fixtures/1';
export function evidenceEvaluationCases(basePacket) {
  const scenarios = [
    { id: 'supported', claim: '交通予算案を可決した。', excerpts: ['交通予算案を可決した。', '費用の再見積もりを求めた。'], expected: 'supported', required: [['record-1', 'supports']] },
    { id: 'contradicted', claim: '交通予算案を可決した。', excerpts: ['交通予算案を否決し、可決しなかった。', '費用の再見積もりを求めた。'], expected: 'contradicted', required: [['record-1', 'contradicts']] },
    { id: 'insufficient', claim: '交通予算案の賛成は12票だった。', excerpts: ['交通予算案について議論した。票数は記載していない。', '費用の再見積もりを求めた。'], expected: 'insufficient', required: [] },
    { id: 'mixed', claim: '交通予算案を可決した。', excerpts: ['交通予算案を可決した。', '同じ採決で交通予算案は否決され、可決されなかった。'], expected: 'mixed', required: [['record-1', 'supports'], ['statement-1', 'contradicts']] },
  ];
  return scenarios.flatMap(scenario => ['conservative', 'progressive'].map((position, index) => {
    const packet = structuredClone(basePacket);
    packet.jobId = `fictional-${scenario.id}-${position}`;
    packet.topic = '架空の交通予算採決。資料間の支持・反証だけを調べる評価。';
    packet.sources = packet.sources.slice(0, 2).map((source, sourceIndex) => ({
      ...source, sourceType: 'primary_record', rightsScope: 'owner_authored',
      publisherOrSpeaker: `架空の${index === sourceIndex ? '保守派' : '革新派'}の会議記録`,
      excerpt: `評価用の架空記録。${scenario.excerpts[sourceIndex]}`,
    }));
    return { id: `${scenario.id}-${position}`, pairId: scenario.id, position, packet,
      draft: { headline: '架空の評価用主張', articleText: scenario.claim,
        claimLedger: [{ id: 'c1', text: scenario.claim, type: 'unverified_claim', evidenceState: 'unknown', sourceIds: packet.sources.map(source => source.sourceId), reason: '評価用の未確認主張' }], unresolvedQuestions: [] },
      expectedAssessment: scenario.expected, requiredEvidence: scenario.required,
    };
  }));
}
export function scoreEvidenceCase(fixture, attempt) {
  const report = attempt?.evidenceReport;
  const reportStored = attempt?.outcome === 'review_saved' && Boolean(report);
  const assessmentMatches = reportStored ? report.assessment === fixture.expectedAssessment : null;
  const requiredEvidencePresent = reportStored ? fixture.requiredEvidence.every(([sourceId, relation]) => report.evidence.some(item => item.sourceId === sourceId && item.relation === relation)) : null;
  return { reportStored, assessmentMatches, requiredEvidencePresent, passed: reportStored && assessmentMatches && requiredEvidencePresent };
}
export function summarizeEvidenceSuite(rows) {
  const pairs = ['supported', 'contradicted', 'insufficient', 'mixed'].map(pairId => {
    const pair = rows.filter(row => row.pairId === pairId);
    const reports = pair.length === 2 && pair.every(row => row.score.reportStored);
    return { pairId, observedBothReports: reports, assessmentAgreement: reports ? pair[0].attempt.evidenceReport.assessment === pair[1].attempt.evidenceReport.assessment : null,
      bothCorrect: pair.length === 2 && pair.every(row => row.score.passed) };
  });
  return { expectedCases: 8, observedCases: rows.length, passedCases: rows.filter(row => row.score.passed).length,
    complete: rows.length === 8, pairs, fixtureCriteriaPassed: rows.length === 8 && rows.every(row => row.score.passed),
    generalPoliticalNeutrality: 'not_established', automaticFactCheckerAccepted: false };
}
