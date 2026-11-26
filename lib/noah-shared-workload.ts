import model from "../public/noah-shared-compute/model.json" with { type: "json" };

export const SHARED_WORKLOAD_VERSION = "public-topic-v1";
export const SHARED_WORKLOAD_SHA256 = "c76d26657b9dc9697400af2b6cc063fe44448df227427c6b8b7a426b992bcfdb";
export const SHARED_SAMPLES = model.samples.map(({ id, title }) => ({ id, title }));

export function isSharedSampleId(value: unknown): value is string {
  return typeof value === "string" && model.samples.some(sample => sample.id === value);
}

// The verifier computes the published dot product independently of the participant's WASM runtime.
export function evaluateSharedSample(sampleId: string): { label: string; score: number } {
  const sample = model.samples.find(entry => entry.id === sampleId);
  if (!sample) throw new Error("Unknown public sample");
  const tokens = sample.text.toLowerCase().match(/[a-z]+/g) ?? [];
  const counts = model.terms.map(group => tokens.filter(word => group.includes(word)).length);
  let best = { label: "", score: -Infinity };
  for (const { label, weights } of model.classes) {
    const score = weights.reduce((sum, weight, i) => sum + weight * counts[i], 0);
    if (score > best.score) best = { label, score };
  }
  return best;
}
