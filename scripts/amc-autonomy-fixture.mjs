// Bundled deterministic rehearsal only. No Goal import, shell, model, provider,
// dynamic adapter loading, or network entrypoint is offered by this CLI.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyGoalEvent, compileGoal } from './amc-goal-engine.mjs';
import { createAutonomyState, runAutonomy } from './amc-autonomy.mjs';
import {
  createAutonomyRun,
  readAutonomyRun,
  requestAutonomyControl,
  resumeAutonomyRun,
  recoverAutonomyLock,
} from './amc-autonomy-store.mjs';

const expected = { ADD: 4, MULTIPLY: 12, REPORT: 12 };

export function createFixtureGoal() {
  const tasks = [
    {
      id: 'ADD',
      title: 'Calculate 2 + 2',
      parentTaskId: 'REPORT',
      dependsOn: [],
    },
    {
      id: 'MULTIPLY',
      title: 'Multiply accepted sum by 3',
      parentTaskId: 'REPORT',
      dependsOn: ['ADD'],
    },
    {
      id: 'REPORT',
      title: 'Collect independently verified child results',
      dependsOn: [],
    },
  ].map((task) => ({ ...task, status: 'planned', evidence: [] }));
  const goal = compileGoal({
    goalId: 'amc-arithmetic-fixture',
    instruction:
      'Fixture only: calculate (2 + 2) × 3 and verify each child before the parent.',
    squadIds: ['FIXTURE'],
    maxParallel: 1,
    project: { tasks },
    mission: {
      globalRules: ['Only bundled arithmetic fixtures; no external effects.'],
      executionHolds: [],
      squads: [
        {
          id: 'FIXTURE',
          name: 'Fixture team',
          goal: 'Verify finite orchestration',
          rules: [],
          acceptanceGate: 'Independent arithmetic check',
          nextTaskIds: ['REPORT'],
        },
      ],
      taskAssignments: tasks.map((task) => ({
        taskId: task.id,
        primarySquad: 'FIXTURE',
        classification: 'coordination',
      })),
      taskPlans: tasks.map((task) => ({
        taskId: task.id,
        scope: task.title,
        workloadClass: 'document',
        executionBoundary: 'Local arithmetic fixture files only',
        steps: [{ id: `${task.id}-STEP`, action: task.title }],
        deliverables: [
          {
            path: `artifacts/${task.id}.json`,
            description: 'Deterministic arithmetic result',
          },
        ],
        acceptanceCriteria: [
          {
            id: `${task.id}-AC`,
            criterion: `Artifact task equals ${task.id} and result equals ${expected[task.id]}`,
            verification: 'Independent file read and golden-value comparison',
          },
        ],
      })),
    },
  });
  return applyGoalEvent(goal, {
    id: 'fixture-plan-approval',
    type: 'approve_plan',
    expectedRevision: 0,
    actor: 'synthetic-fixture-owner',
    role: 'owner',
    scopeConfirmed: true,
    coverageStatement:
      'Synthetic test approval only, never a real owner authorization.',
    acceptanceCriteria: [
      {
        id: 'FIXTURE-FINAL',
        criterion:
          'Owner reviews the rehearsal; no automatic final acceptance.',
      },
    ],
  });
}

export function fixtureAdapters(directory) {
  const root = resolve(directory);
  const artifact = (id) => join(root, 'artifacts', `${id}.json`);
  const read = (id) => JSON.parse(readFileSync(artifact(id), 'utf8'));
  return {
    worker: {
      id: 'fixture-arithmetic-worker',
      kind: 'fixture',
      async run({ task, signal }) {
        signal.throwIfAborted();
        if (!Object.hasOwn(expected, task.id))
          throw new Error('Unknown fixture task');
        const result =
          task.id === 'ADD'
            ? 2 + 2
            : task.id === 'MULTIPLY'
              ? read('ADD').result * 3
              : read('MULTIPLY').result;
        mkdirSync(join(root, 'artifacts'), { recursive: true, mode: 0o700 });
        writeFileSync(
          artifact(task.id),
          `${JSON.stringify({ task: task.id, result })}\n`,
          { flag: 'wx', mode: 0o600 },
        );
        return {
          outcome: 'succeeded',
          summary: `Fixture ${task.id}: ${result}`,
          deliverables: [`artifacts/${task.id}.json`],
          evidence: [`artifacts/${task.id}.json`],
        };
      },
    },
    reviewer: {
      id: 'fixture-golden-verifier',
      kind: 'fixture',
      async review({ task, signal }) {
        signal.throwIfAborted();
        const value = read(task.id);
        const accepted =
          value.task === task.id && value.result === expected[task.id];
        const evidence = [`artifacts/${task.id}.json`];
        return {
          accepted,
          evidence,
          criterionResults: task.acceptanceCriteria.map((criterion) => ({
            criterionId: criterion.id,
            passed: accepted,
            evidence,
          })),
        };
      },
    },
  };
}

function summary(state) {
  return {
    mode: state.mode,
    phase: state.phase,
    reason: state.reason,
    revision: state.revision,
    totalAttempts: state.totalAttempts,
    currentOperation: state.currentOperation,
    tasks: state.goal.tasks.map(({ id, status }) => ({ id, status })),
    overallAccepted: state.goal.overallAcceptance.accepted,
    serviceSync: 'not_connected',
    productionExecution: 'unsupported',
  };
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 0 || ['help', '--help'].includes(args[0])) {
    console.log(
      'AMC finite fixture rehearsal (no real Goal import or provider execution)\n  init|run|status|stop|cancel|resume|recover-lock --state <directory>\ninit creates only the bundled synthetic arithmetic Goal. run/resume execute local fixtures.',
    );
    return;
  }
  const [command, flag, directory, ...extra] = args;
  if (
    ![
      'init',
      'run',
      'status',
      'stop',
      'cancel',
      'resume',
      'recover-lock',
    ].includes(command) ||
    flag !== '--state' ||
    !directory ||
    extra.length
  )
    throw new Error(
      'Use init|run|status|stop|cancel|resume|recover-lock --state <directory>',
    );
  if (command === 'init') {
    const state = createAutonomyState({
      goal: createFixtureGoal(),
      policy: {
        maxAttemptsPerTask: 2,
        maxTotalAttempts: 6,
        stepTimeoutMs: 5000,
      },
    });
    console.log(
      JSON.stringify(
        summary(await createAutonomyRun(directory, state)),
        null,
        2,
      ),
    );
    return;
  }
  if (['stop', 'cancel'].includes(command))
    requestAutonomyControl(directory, command);
  if (command === 'recover-lock') recoverAutonomyLock(directory);
  if (['run', 'resume'].includes(command)) {
    const state = readAutonomyRun(directory);
    const canonical = createAutonomyState({
      goal: createFixtureGoal(),
      policy: state.policy,
    });
    if (state.contractHash !== canonical.contractHash)
      throw new Error('CLI runs only the bundled fixture Goal');
    if (command === 'resume') await resumeAutonomyRun(directory);
    const controller = new AbortController();
    const stop = () =>
      controller.abort(new Error('Operator interrupted fixture run'));
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      await runAutonomy({
        directory,
        ...fixtureAdapters(directory),
        signal: controller.signal,
      });
    } finally {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
    }
  }
  console.log(JSON.stringify(summary(readAutonomyRun(directory)), null, 2));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
