import type { NoahPin } from './noah-pin-scene.ts';

export const NOAH_PIN_REVIEW_SIZE = 200;
export const NOAH_PIN_REVIEW_MIN_MATCHES = 190;
export const NOAH_PIN_REVIEW_API = '/api/noah/review/pins';
export const NOAH_PIN_REVIEW_REASONS = { title: '題が合わない', diagram: '図解が合わない', exchange: '入る物・返る物が違う', invented: '原文にない数や例がある', unclear: '一目で分からない' } as const;
export type NoahPinReviewReason = keyof typeof NOAH_PIN_REVIEW_REASONS;
export type NoahPinReviewEntry = { id: string; name: string; original: string; pin: NoahPin };
export type NoahPinReviewVote = 'match' | NoahPinReviewReason;
export type NoahPinReviewBatch = { id: string; createdAt: number; entries: NoahPinReviewEntry[]; votes: Record<string, NoahPinReviewVote> };

export const isVote = (vote: unknown): vote is NoahPinReviewVote => vote === 'match' || typeof vote === 'string' && Object.hasOwn(NOAH_PIN_REVIEW_REASONS, vote);

export function noahPinReviewCounts(batch: NoahPinReviewBatch) {
  const reasons = Object.fromEntries(Object.keys(NOAH_PIN_REVIEW_REASONS).map((reason) => [reason, 0])) as Record<NoahPinReviewReason, number>;
  let reviewed = 0, matches = 0;
  for (const { id } of batch.entries) {
    const vote = Object.hasOwn(batch.votes, id) ? batch.votes[id] : undefined;
    if (!isVote(vote)) continue;
    reviewed++;
    if (vote === 'match') matches++;
    else reasons[vote]++;
  }
  return { reviewed, matches, reasons, passed: batch.entries.length === NOAH_PIN_REVIEW_SIZE && reviewed === NOAH_PIN_REVIEW_SIZE && matches >= NOAH_PIN_REVIEW_MIN_MATCHES };
}
