import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PLAN_SCHEMA } from './amc-backward-plan.mjs';

export function localDemoPlan() {
  const make = (id, title, roleId, reviewerRoleId, dependsOn, marker) => ({
    id,
    title,
    roleId,
    reviewerRoleId,
    execution: 'local',
    scope:
      'Synthetic local pilot preparation only; no real prospects, external contact, pricing approval or demand claims.',
    dependsOn,
    steps: [
      `Read prerequisite artifacts; draft ${title}; explicitly identify assumptions and owner decisions.`,
    ],
    durationMinutes: null,
    deliverables: [{ path: `pilot/${id}.md`, description: title }],
    acceptanceCriteria: [
      {
        id: `${id}-check`,
        criterion: `Document contains ${marker} and labels unverified assumptions.`,
        verification: `Read the actual file; require marker ${marker} and 未検証.`,
      },
    ],
    marker,
  });
  const tasks = [
    make('research', '顧客課題の検証仮説', 'REV01', 'REV00', [], '顧客課題'),
    make(
      'offer',
      '価値提案と商談準備の草案',
      'REV04',
      'REV09',
      ['research'],
      '価値提案',
    ),
    make('acceptance', 'pilotの技術受入条件', 'DEV01', 'DEV11', [], '技術受入'),
    make(
      'packet',
      'CEO向けpilot判断資料',
      'REV00',
      'REV16',
      ['offer', 'acceptance'],
      'CEO判断',
    ),
  ];
  return {
    schema: PLAN_SCHEMA,
    id: 'local-pilot-cycle-demo',
    instruction: 'Prepare a synthetic local pilot decision packet',
    intent:
      'Demonstrate backward planning, role assignment, independent review and bounded defect rework.',
    deadline: null,
    policy: {
      maxAttemptsPerTask: 2,
      maxTotalAttempts: 8,
      maxInvocations: 16,
      stepTimeoutMs: 5000,
    },
    successCriteria: [
      {
        id: 'pilot-packet',
        criterion:
          'The decision packet references a reviewed value proposition and technical acceptance criteria; hypotheses remain unverified.',
        verification:
          'Inspect prerequisite review receipts and local packet content.',
        taskIds: ['packet'],
      },
    ],
    tasks: tasks.map(({ marker: _marker, ...task }) => task),
  };
}

const markerFor = (task) =>
  ({
    research: '顧客課題',
    offer: '価値提案',
    acceptance: '技術受入',
    packet: 'CEO判断',
  })[task.id];
export function localDemoAdapters() {
  return {
    worker: {
      id: 'local-demo-writer',
      kind: 'local-demo',
      async run({ repo, spec, attempt }) {
        const file = join(repo, spec.deliverables[0].path);
        mkdirSync(dirname(file), { recursive: true });
        const prerequisites = spec.dependsOn.map((key) => ({
          path: `pilot/${key}.md`,
          text: readFileSync(join(repo, `pilot/${key}.md`), 'utf8'),
        }));
        // Deliberately omit a required marker once to exercise actual rejection.
        const marker =
          spec.id === 'offer' && attempt === 1
            ? '要修正の草案'
            : markerFor(spec);
        writeFileSync(
          file,
          `# ${marker}\n\n未検証の仮説。実在顧客、需要、収益の証拠ではない。\n本人判断: 対象顧客・価格・期限・外部送信。\n\n${prerequisites.map((item) => `${item.path}\n${item.text}`).join('\n')}\n`,
          { mode: 0o600 },
        );
        return {
          status: 'completed',
          summary: `Wrote actual local artifact ${spec.deliverables[0].path}`,
        };
      },
    },
    reviewer: {
      id: 'local-demo-file-verifier',
      kind: 'local-demo',
      async review({ repo, spec }) {
        const contents = readFileSync(
          join(repo, spec.deliverables[0].path),
          'utf8',
        );
        const accepted =
          contents.includes(`# ${markerFor(spec)}\n`) &&
          contents.includes('未検証') &&
          spec.dependsOn.every((key) => contents.includes(`pilot/${key}.md`));
        return {
          accepted,
          safeForLocalRework: !accepted,
          summary: accepted
            ? 'Actual file meets the specified local checks.'
            : 'Required value-proposition marker missing; repair this draft within existing scope.',
          criteria: spec.acceptanceCriteria.map((item) => ({
            criterionId: item.id,
            passed: accepted,
            detail: `Read ${spec.deliverables[0].path}; marker=${markerFor(spec)}, assumptions and prerequisite references checked; pass=${accepted}.`,
          })),
        };
      },
    },
  };
}
