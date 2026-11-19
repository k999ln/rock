import { parseArgs } from 'node:util';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createGoalCycle,
  approveGoalCycle,
  readGoalCycle,
  runGoalCycle,
  goalCycleStatus,
  readCycleJson,
  stopGoalCycle,
  resumeGoalCycle,
  acceptGoalCycle,
  recoverGoalCycleLock,
} from './amc-goal-cycle.mjs';
import {
  proposeBackwardPlan,
  codexCycleAdapters,
} from './amc-goal-cycle-codex.mjs';
import { localDemoPlan, localDemoAdapters } from './amc-goal-cycle-demo.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    repo: { type: 'string', default: root },
    directory: { type: 'string' },
    plan: { type: 'string' },
    request: { type: 'string' },
    intent: { type: 'string' },
    out: { type: 'string' },
    owner: { type: 'string' },
    revision: { type: 'string' },
    checks: { type: 'string' },
    previous: { type: 'string' },
    feedback: { type: 'string', default: '' },
    'allow-codex-upload': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});
const help =
  `Goal → backward plan → roles → execution → independent review → bounded rework\n\n` +
  `npm run amc:cycle -- demo\n` +
  `npm run amc:cycle -- plan --request 'Goal' --intent 'Why' --allow-codex-upload\n` +
  `npm run amc:cycle -- init --plan /absolute/plan.json --directory /absolute/run\n` +
  `npm run amc:cycle -- approve --directory /absolute/run --owner ceo --revision 0\n` +
  `npm run amc:cycle -- run --directory /absolute/run --allow-codex-upload\n` +
  `npm run amc:cycle -- status|stop --directory /absolute/run\n` +
  `npm run amc:cycle -- resume --directory /absolute/run --revision N\n\n` +
  `npm run amc:cycle -- recover-lock --directory /absolute/run\n` +
  `npm run amc:cycle -- accept --directory /absolute/run --owner ceo --revision N --checks /absolute/checks.json\n\n` +
  `plan --previous /absolute/run --feedback 'change' creates a separate unapproved draft.\n` +
  `No daemon. No external-action execution. Invocation limits do not cap model charges.\n`;
const command = positionals[0];
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
try {
  if (values.help || !command) process.stdout.write(help);
  else {
    const repo = resolve(values.repo);
    const catalog = readCycleJson(join(root, 'data/amc/company-roles.json'));
    const directory = values.directory && resolve(values.directory);
    const requireDir = () => {
      if (!directory) throw new Error('--directory required');
      return directory;
    };
    const expectedRevision = () => {
      if (!/^(0|[1-9]\d*)$/.test(values.revision || ''))
        throw new Error('Explicit --revision required');
      return Number(values.revision);
    };
    let result;
    if (command === 'demo') {
      const demoRoot = mkdtempSync(join(tmpdir(), 'amc-goal-cycle-demo-'));
      const demoRepo = join(demoRoot, 'workspace'),
        run = join(demoRoot, 'run');
      mkdirSync(demoRepo);
      await createGoalCycle({
        directory: run,
        repo: demoRepo,
        plan: localDemoPlan(),
        catalog,
        mode: 'local-demo',
      });
      await approveGoalCycle({
        directory: run,
        owner: 'synthetic-demo-owner',
        expectedRevision: 0,
      });
      const state = await runGoalCycle({
        directory: run,
        ...localDemoAdapters(),
        signal: controller.signal,
      });
      result = {
        directory: run,
        workspace: demoRepo,
        ...goalCycleStatus(state),
        scope:
          'Actual local files and deterministic checks; no model, real sales or external action.',
      };
    } else if (command === 'plan') {
      const previous = values.previous
        ? readGoalCycle(resolve(values.previous))
        : null;
      result = await proposeBackwardPlan({
        repo,
        catalog,
        request: values.request || previous?.plan.instruction,
        intent: values.intent || previous?.plan.intent,
        out: resolve(values.out || join(repo, 'work/amc-goal-cycle-plans')),
        previous: previous && {
          goalId: previous.goal.id,
          revision: previous.revision,
          plan: previous.plan,
          status: goalCycleStatus(previous),
        },
        feedback: values.feedback,
        allowCodexUpload: values['allow-codex-upload'],
        signal: controller.signal,
      });
    } else if (command === 'init') {
      if (!values.plan) throw new Error('--plan required');
      result = goalCycleStatus(
        await createGoalCycle({
          directory: requireDir(),
          repo,
          plan: readCycleJson(resolve(values.plan)),
          catalog,
        }),
      );
    } else if (command === 'approve')
      result = goalCycleStatus(
        await approveGoalCycle({
          directory: requireDir(),
          owner: values.owner,
          expectedRevision: expectedRevision(),
        }),
      );
    else if (command === 'run')
      result = goalCycleStatus(
        await runGoalCycle({
          directory: requireDir(),
          ...codexCycleAdapters({
            allowCodexUpload: values['allow-codex-upload'],
          }),
          signal: controller.signal,
        }),
      );
    else if (command === 'recover-lock')
      result = goalCycleStatus(recoverGoalCycleLock(requireDir()));
    else if (command === 'status')
      result = goalCycleStatus(readGoalCycle(requireDir()));
    else if (command === 'stop') {
      stopGoalCycle(requireDir());
      result = { requested: 'stop', directory };
    } else if (command === 'resume')
      result = goalCycleStatus(
        await resumeGoalCycle({
          directory: requireDir(),
          expectedRevision: expectedRevision(),
        }),
      );
    else if (command === 'accept') {
      if (!values.checks)
        throw new Error(
          '--checks with explicit owner criterion evidence required',
        );
      result = goalCycleStatus(
        await acceptGoalCycle({
          directory: requireDir(),
          owner: values.owner,
          expectedRevision: expectedRevision(),
          criteria: readCycleJson(resolve(values.checks)),
        }),
      );
    } else throw new Error(`Unknown command: ${command}`);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
