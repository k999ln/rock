import model from '../public/noah-shared-compute/model.json' with { type: 'json' };

export const SHARED_WORKLOAD_VERSION = 'public-topic-v1';
export const SHARED_WORKLOAD_SHA256 =
  'c76d26657b9dc9697400af2b6cc063fe44448df227427c6b8b7a426b992bcfdb';
export const SHARED_SAMPLES = model.samples.map(({ id, title }) => ({
  id,
  title,
}));

function countTerms(text: string): number[] {
  const counts = model.terms.map(() => 0);
  // This is the tokenization specified in the pinned model, also used by the runners.
  for (const [word] of text.toLowerCase().matchAll(/[a-z]+/g)) {
    model.terms.forEach((group, i) => {
      if (group.includes(word)) counts[i]++;
    });
  }
  return counts;
}

// Compute in the requester's UI. The wire value discloses four bounded counts only.
export function encodePublicTopicTerms(text: string): string | null {
  const counts = countTerms(text).map((count) => Math.min(count, 15));
  return counts.some((count) => count > 0) ? 'terms-' + counts.join('.') : null;
}

export function readPublicTopicTerms(id: string): number[] | null {
  if (!id.startsWith('terms-') || id.length > 'terms-15.15.15.15'.length)
    return null;
  const counts = id.slice(6).split('.').map(Number);
  if (
    counts.length !== 4 ||
    counts.some((count) => !Number.isInteger(count) || count < 0 || count > 15)
  )
    return null;
  // Canonical encoding also rules out whitespace, leading zeros, signs and exponents.
  return counts.some((count) => count > 0) && id === 'terms-' + counts.join('.')
    ? counts
    : null;
}

export function isSharedSampleId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    (model.samples.some((sample) => sample.id === value) ||
      readPublicTopicTerms(value) !== null)
  );
}

export function sharedTopicTitle(sampleId: string): string {
  return (
    model.samples.find((entry) => entry.id === sampleId)?.title ??
    '公開文章の分類'
  );
}

// Validate results independently of the participant's WASM runtime. For a public
// article the verifier sees only the same capped vocabulary counts as the host.
export function evaluateSharedSample(sampleId: string): {
  label: string;
  score: number;
} {
  const sample = model.samples.find((entry) => entry.id === sampleId);
  const counts = sample
    ? countTerms(sample.text)
    : readPublicTopicTerms(sampleId);
  if (!counts) throw new Error('Unknown topic input');
  let best = { label: '', score: -Infinity };
  for (const { label, weights } of model.classes) {
    const score = weights.reduce(
      (sum, weight, i) => sum + weight * counts[i],
      0,
    );
    if (score > best.score) best = { label, score };
  }
  return best;
}
