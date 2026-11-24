import { NOAH_CLOUD_PROFILES, type NoahCloudFile, type NoahCloudProfile } from './noah-cloud-contract.ts';
import { EVE_VERIFIED, eveCombinationFile } from './eve-combination-catalog.ts';
import type { DirectoryEntry } from './noah-agent-directory.ts';
import { parseEveAdvice, type EveAdviceScheme } from './noah-eve-advice.ts';
import type { NoahLocale } from './noah-i18n.ts';

export type EveProposalTargets = Partial<Record<NoahCloudProfile, string>>;
export type EveProposalStep = { profile: NoahCloudProfile | null; projectId: string | null; role: string; input: string; output: string };
export type EveProposal = { steps: EveProposalStep[]; deliverable: string; scheme?: EveAdviceScheme };

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
    'Return exactly one JSON object describing a proposed workflow for the author’s goal. No tools, files, markdown, or extra text.',
    'Design JSON: {"input":"starting material","steps":[{"agent":"listed key or JSON null","role":"specific job","output":"artifact"}],"scheme":{"kind":"user_goal or conversion","recipient":"who receives it","outcome":"what they receive","acceptance":"observable success condition","evidence":"record to check"}}. Fill it for the goal below.',
    'Choose 2–4 different agent roles in order. Each receives the preceding output; the last delivers the requested outcome. Use a listed key only where its ability fits, otherwise null.',
    'Use user_goal for the person’s stated goal. For example, recording symptoms only requires a usable log when that is what they ask for. Use conversion for revenue goals: use the campaign’s stated milestone (e.g. an approved application, a purchase, or payment) and matching evidence. If the goal or milestone is unspecified, mark the criterion as a suggestion to confirm. Describe future checks, never claim success.',
    'Candidate keys: ' + options.join('; '),
    verified ? 'The proposed combination is untested.' : 'Eve has no verified capability matches. These are suggestions.',
    ...(from ? [`A catalog design example passes "${from.material}" from ${from.from} to ${article.id}. Adapt to the actual goal.`] : []),
    `Write concise values in ${language}, unless the author asks for another language. Each text value should be short. The proposed agents have not run.`,
    'Author request:',
  ].join('\n') + '\n';
}

export function eveAdviceProposal(text: string, targets: EveProposalTargets, requireScheme = true): EveProposal | null {
  const advice = parseEveAdvice(text, Object.keys(targets), requireScheme);
  if (!advice) return null;
  const steps = advice.steps.map((step, index) => ({
    profile: step.agent, projectId: step.agent ? targets[step.agent]! : null, role: step.role,
    input: index === 0 ? advice.input : advice.steps[index - 1].output, output: step.output,
  }));
  return { steps, deliverable: steps[steps.length - 1].output, ...(advice.scheme ? { scheme: advice.scheme } : {}) };
}

function readLegacyProposal(text: string, targets: EveProposalTargets): EveProposal | null {
  const start = text.indexOf('{'), end = text.lastIndexOf('}');
  if (start < 0 || end < start || end - start > 12000) return null;
  return eveAdviceProposal(text.slice(start, end + 1), targets, false);
}

/** Official Hermes can put the design in the final text or in its per-job memory attachment. */
export function eveReturnedProposal(text: string, files: readonly NoahCloudFile[], targets: EveProposalTargets): EveProposal | null {
  const direct = readLegacyProposal(text, targets);
  if (direct) return direct;
  const memory = files.find(file => file.name === 'MEMORY.md');
  if (!memory) return null;
  const bytes = Uint8Array.from(atob(memory.base64), c => c.charCodeAt(0));
  return readLegacyProposal(new TextDecoder().decode(bytes), targets);
}
