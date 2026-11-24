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

const planningCapabilities: Record<NoahCloudProfile, string> = {
  memory: 'organize supplied notes and relationships',
  thinking: 'plan the steps for a task',
  filesystem: 'prepare files for this job',
  time: 'read and convert times',
  boss: 'prepare interview questions from a supplied job description',
  hermes: 'plan work and organize notes',
};

/** Immutable task context for an owned Work. Never include another Work or account data here. */
export function eveProposalBrief(question: string, language: NoahLocale, targets: EveProposalTargets): string {
  const options = (Object.keys(targets) as NoahCloudProfile[]).map(key => `${key}: ${planningCapabilities[key]}`);
  const verified = Object.values(EVE_VERIFIED).some(refs => refs?.length);
  const example = /ブログ|記事|\b(?:blog|article)\b/iu.test(question) && eveCombinationFile('affiliate:ai-tools:blog');
  const article = example && example.steps.find(s => s.id === 'article');
  const from = article && article.flow?.dataFrom?.[0];
  return [
    'First call the actual memory function with action="add", target="memory", content=the serialized design JSON. Write it into this job’s memory now.',
    'Design JSON: {"input":"starting material","steps":[{"agent":"listed key or JSON null","role":"specific job","output":"artifact"}]}. Fill it for the goal below.',
    'Choose 2–4 different agent roles in order. Each receives the preceding output; the last delivers the requested outcome. Use a listed key only where its ability fits, otherwise null.',
    'Candidate keys: ' + options.join('; '),
    verified ? 'The proposed combination is untested.' : 'Eve has no verified capability matches. These are suggestions.',
    ...(from ? [`A catalog design example passes "${from.material}" from ${from.from} to ${article.id}. Adapt to the actual goal.`] : []),
    `Write concise values in ${language}, unless the author asks for another language. After memory succeeds, reply only with a brief natural-language receipt. The proposed agents have not run.`,
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
