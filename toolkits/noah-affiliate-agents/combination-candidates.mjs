import {
  validateCombinationConfig,
  combinationVerdict,
} from './combination-core.mjs';

// Input service keys are established from evidence, never inferred from similar
// names. New pairs are drafts, not permission to publish, solicit or trade.
export function draftCombinationCandidates(tools, offers, now = Date.now()) {
  const pairs = [];
  for (const tool of tools)
    for (const offer of offers) {
      if (!tool.serviceKeys?.includes(offer.serviceKey)) continue;
      pairs.push({
        id: tool.id + '-' + offer.id,
        title: tool.name + ' × ' + offer.publicName,
        summary: tool.summary,
        category: tool.category,
        tool: {
          name: tool.name,
          serviceKeys: tool.serviceKeys,
          available: tool.available === true,
          useAllowed: tool.allowedServices?.includes(offer.serviceKey) === true,
        },
        offer: {
          id: offer.id,
          productName: offer.productName,
          serviceKey: offer.serviceKey,
          rewardYen: offer.rewardYen,
          channels: offer.channels,
          event: offer.event,
          partnered: offer.partnered === true,
        },
        evidence: [...tool.evidence, ...offer.evidence],
        checkedAt: new Date(
          Math.min(
            ...[...tool.evidence, ...offer.evidence].map((e) =>
              Date.parse(e.checkedAt),
            ),
          ),
        ).toISOString(),
        validUntil: new Date(now + 7 * 86400000).toISOString(),
        preparation: tool.preparation,
        exclusions: offer.exclusions,
        siteId: offer.siteId,
        termsConsistent: offer.termsConsistent === true,
        guideApproved: false,
        contentApproved: false,
        mediaApproved: false,
        enabled: false,
        affiliateUrl: null,
      });
    }
  const config = validateCombinationConfig({
    schema: 'noah-combinations/1',
    schemes: pairs,
  });
  return {
    config,
    assessments: pairs.map((s) => ({
      id: s.id,
      ...combinationVerdict(s, now),
    })),
  };
}
