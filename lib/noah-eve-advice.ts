import { NOAH_CLOUD_PROFILES, type NoahCloudProfile } from './noah-cloud-contract.ts';

type AdviceStep = { agent: NoahCloudProfile | null; role: string; output: string };
export type EveAdviceScheme = {
  kind: 'user_goal' | 'conversion';
  recipient: string;
  outcome: string;
  acceptance: string;
  evidence: string;
};
export type EveAdvice = { input: string; steps: AdviceStep[]; scheme?: EveAdviceScheme };

function textField(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

/** The Worker checks the model's actual answer. Noah also checks it against the
 * catalog candidates recorded with the author's request before showing links. */
export function parseEveAdvice(text: string, allowedAgents: readonly string[] = Object.keys(NOAH_CLOUD_PROFILES), requireScheme = true): EveAdvice | null {
  if (!textField(text, 12000)) return null;
  let answer;
  try { answer = JSON.parse(text); } catch { return null; }
  if (!textField(answer?.input, 240) || !Array.isArray(answer.steps) || answer.steps.length < 2 || answer.steps.length > 4) return null;
  let scheme: EveAdviceScheme | undefined;
  if (requireScheme) {
    const value = answer.scheme;
    if (!value || !['user_goal', 'conversion'].includes(value.kind)
      || !textField(value.recipient, 240) || !textField(value.outcome, 320)
      || !textField(value.acceptance, 320) || !textField(value.evidence, 320)) return null;
    scheme = { kind: value.kind, recipient: value.recipient.trim(), outcome: value.outcome.trim(), acceptance: value.acceptance.trim(), evidence: value.evidence.trim() };
  }
  const input = answer.input.trim();
  const seen = new Set<string>();
  const steps: AdviceStep[] = [];
  let previous = input;
  for (const step of answer.steps) {
    if (!textField(step?.role, 160) || !textField(step?.output, 320)) return null;
    const { agent } = step;
    if (agent !== null && (typeof agent !== 'string' || !Object.hasOwn(NOAH_CLOUD_PROFILES, agent) || !allowedAgents.includes(agent))) return null;
    const role = step.role.trim(), output = step.output.trim();
    const key = agent ?? role.toLowerCase();
    if (seen.has(key) || previous === output) return null;
    seen.add(key);
    steps.push({ agent, role, output });
    previous = output;
  }
  return { input, steps, ...(scheme ? { scheme } : {}) };
}
