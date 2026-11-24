import { NOAH_CLOUD_PROFILES, type NoahCloudFile, type NoahCloudProfile } from './noah-cloud-contract.ts';
import { EVE_VERIFIED, eveCombinationFile } from './eve-combination-catalog.ts';
import type { DirectoryEntry } from './noah-agent-directory.ts';
import type { NoahLocale } from './noah-i18n.ts';

export type EveProposalTargets = Partial<Record<NoahCloudProfile, string>>;
export type EveProposalStep = { profile: NoahCloudProfile | null; projectId: string | null; role: string; input: string; output: string };
export type EveProposal = { steps: EveProposalStep[]; deliverable: string };

/** Candidates come from the same deployment-aware projection used by the store. */
export function eveProposalTargets(directory: readonly DirectoryEntry[]): EveProposalTargets {
  const targets: EveProposalTargets = {};
  for (const row of directory) {
    const key = row.cloudProfile, id = row.card.feedbackId ?? row.card.id;
    if (!key || !Object.hasOwn(NOAH_CLOUD_PROFILES, key) || !/^project-[0-9a-f]{64}$/.test(id)) continue;
    const official = row.card.href?.toLowerCase() === NOAH_CLOUD_PROFILES[key].repository.toLowerCase();
    if (!targets[key] || official) targets[key] = id;
  }
  return targets;
}

/** Immutable task context for an owned Work. Never include another Work or account data here. */
export function eveProposalBrief(question: string, language: NoahLocale, targets: EveProposalTargets): string {
  const options = (Object.keys(targets) as NoahCloudProfile[]).map(key => `${key}: ${NOAH_CLOUD_PROFILES[key].description}`);
  const verified = Object.values(EVE_VERIFIED).some(refs => refs?.length);
  const example = /ブログ|記事|\b(?:blog|article)\b/iu.test(question) && eveCombinationFile('affiliate:ai-tools:blog');
  const article = example && example.steps.find(s => s.id === 'article');
  const from = article && article.flow?.dataFrom?.[0];
  return [
    'Eve: design a proposed workflow tailored to the author’s goal. Use 2–4 distinct agent roles in order. Each step consumes the preceding output. The last output is the deliverable.',
    'Choose different listed profiles where their abilities fit the goal. Use JSON null for a new role if no listed profile fits. Do not claim that steps ran, are connected, or earned money.',
    verified ? 'Catalogued profiles are candidates; this combination has not been tested.' : 'The Eve capability ledger has no verified matches yet. This is an untested design.',
    ...options,
    ...(from ? [`A catalog design example passes "${from.material}" from ${from.from} to ${article.id}. Choose a handoff suited to this request.`] : []),
    `Write user-visible values in ${language} or the language the author explicitly requests. Keep each value under 120 characters. Use the Hermes memory tool once to save this JSON, and repeat just the same JSON in the final response:`,
    '{"input":"starting material","steps":[{"agent":"profile key or null","role":"specific role","output":"concrete intermediate artifact"},{"agent":null,"role":"another role","output":"finished deliverable"}]}',
    'Author request:',
  ].join('\n') + '\n';
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function readProposal(text: string, targets: EveProposalTargets): EveProposal | null {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start || end - start > 12000) return null;
  let answer;
  try { answer = JSON.parse(text.slice(start, end + 1)); } catch { return null; }
  if (!boundedText(answer?.input, 240) || !Array.isArray(answer.steps) || answer.steps.length < 2 || answer.steps.length > 4) return null;
  let input: string = answer.input.trim();
  const steps: EveProposalStep[] = [];
  const seen = new Set<string>();
  for (const step of answer.steps) {
    if (!boundedText(step?.role, 160) || !boundedText(step?.output, 320)
      || (step.agent !== null && (typeof step.agent !== 'string' || !Object.hasOwn(targets, step.agent)))) return null;
    const profile = step.agent as NoahCloudProfile | null;
    const role = step.role.trim(), output = step.output.trim();
    const identity = profile ?? role.toLowerCase();
    if (seen.has(identity) || input === output) return null;
    seen.add(identity);
    steps.push({ profile, projectId: profile ? targets[profile]! : null, role, input, output });
    input = output;
  }
  return { steps, deliverable: input };
}

/** Official Hermes can put the design in the final text or in its per-job memory attachment. */
export function eveReturnedProposal(text: string, files: readonly NoahCloudFile[], targets: EveProposalTargets): EveProposal | null {
  const direct = readProposal(text, targets);
  if (direct) return direct;
  const memory = files.find(file => file.name === 'MEMORY.md');
  if (!memory) return null;
  const bytes = Uint8Array.from(atob(memory.base64), c => c.charCodeAt(0));
  return readProposal(new TextDecoder().decode(bytes), targets);
}
