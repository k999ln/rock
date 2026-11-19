#!/usr/bin/env node
// 募集の文面（本人がコピーしたもの）を読み、応募するもの・額・納品日・提案の下書きを出す。
// サイトには接続しない。lane runner の snapshot を渡す時は --lane を使い、decisions を返す。
//   node --experimental-strip-types scripts/sky-gig-desk.mjs desk.json --lane snapshot.json
//   node --experimental-strip-types scripts/sky-gig-desk.mjs examples/sky/gig-desk/desk.json
import { readFileSync } from 'node:fs';
import {
  COCONALA_DESK_POLICY,
  decideLanePass,
  draftProposal,
  parseCoconalaPosting,
  selectProposals,
  triageGig,
} from '../lib/sky-gig-desk.ts';

const path = process.argv[2];
if (!path) {
  console.error('使い方: node --experimental-strip-types scripts/sky-gig-desk.mjs <desk.json>');
  process.exit(2);
}
const desk = JSON.parse(readFileSync(path, 'utf8'));
const policy = { ...COCONALA_DESK_POLICY, ...desk.policy };
const lane = process.argv.indexOf('--lane');
if (lane > 0) {
  const snapshot = JSON.parse(readFileSync(process.argv[lane + 1], 'utf8'));
  const result = decideLanePass({
    details: snapshot.request_details, alreadyAppliedIds: snapshot.already_applied_ids,
    maxApplications: snapshot.objective.max_applications, proposedToday: desk.state?.proposedToday ?? 0,
    offers: desk.offers, capabilities: desk.capabilities, observations: desk.observations ?? [],
    proposals: desk.proposals ?? [], policy, company: desk.company, today: desk.today,
  });
  console.log(JSON.stringify({ decisions: result.decisions }, null, 2));
  process.exit(0);
}
const postings = desk.postings.map((item) => parseCoconalaPosting(item));
const triaged = postings.map((posting) => triageGig({
  posting, offers: desk.offers, capabilities: desk.capabilities,
  observations: desk.observations ?? [], proposals: desk.proposals ?? [], policy, today: desk.today,
}));
const { send, held } = selectProposals(triaged, policy, desk.state ?? { proposedToday: 0, alreadyProposedIds: [] });
const byId = new Map(postings.map((posting) => [posting.id, posting]));
const drafts = send.map((triage) => draftProposal(
  byId.get(triage.postingId), triage, desk.offers.find((offer) => offer.id === triage.offerId), desk.company, policy.submission,
));
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ postings, triaged, send, held, drafts }, null, 2));
} else {
  console.log(`募集 ${postings.length}件 / 今日出す提案 ${send.length}件 / 上限で持ち越し ${held.length}件\n`);
  for (const triage of triaged) {
    const posting = byId.get(triage.postingId);
    const head = triage.decision === 'propose'
      ? `応募する  ${triage.priceYen.toLocaleString('ja-JP')}円 / 納品 ${triage.deliverOn} / 残る見込み ${triage.marginYen.toLocaleString('ja-JP')}円 / 採用見込み ${Math.round(triage.winRate * 100)}%`
      : '見送る';
    console.log(`[${posting.id}] ${posting.title}\n  ${head}\n  ${triage.reasons.join('\n  ')}\n`);
  }
  for (const draft of drafts) console.log(`----- 提案文 ${draft.postingId}（送信: ${draft.submission === 'auto' ? '自動' : '本人'}）-----\n${draft.text}\n`);
}
