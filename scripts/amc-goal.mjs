import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { renderVisualization } from './sync-mission-control.mjs';
import {
  compileGoal,
  validateGoal,
  renderGoalPrompt,
  summarizeGoal,
  applyGoalEvent,
} from './amc-goal-engine.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJSON = (path) => JSON.parse(readFileSync(path, 'utf8'));

export function loadGoalSources() {
  const paths = ['data/mission-control.json', 'data/project-status.json'];
  const sources = paths.map((path) =>
    readFileSync(resolve(root, path), 'utf8'),
  );
  return {
    mission: JSON.parse(sources[0]),
    project: JSON.parse(sources[1]),
    provenance: paths.map((path, i) => ({
      path,
      sha256: createHash('sha256').update(sources[i]).digest('hex'),
    })),
  };
}

export function renderGoalWorkbench(sources = loadGoalSources()) {
  const template = readFileSync(
    resolve(root, 'scripts/templates/amc-goal-workbench.html'),
    'utf8',
  );
  const engine = readFileSync(
    resolve(root, 'scripts/amc-goal-engine.mjs'),
    'utf8',
  ).replace(/^export (?=(?:function|const|class)\s)/gm, '');
  if (/^import\s|^export\s/m.test(engine))
    throw new Error(
      'Goal engine must remain standalone and browser-compatible',
    );
  const client = readFileSync(
    resolve(root, 'scripts/templates/amc-goal-workbench.js'),
    'utf8',
  );
  const helpers = ['amc-request-plan.mjs', 'amc-effort.mjs']
    .map((file) => {
      const code = readFileSync(resolve(root, 'scripts', file), 'utf8').replace(
        /^export (?=(?:function|const|class)\s)/gm,
        '',
      );
      if (/^import\s|^export\s/m.test(code))
        throw new Error('Workbench helpers must remain standalone');
      return code;
    })
    .join('\n');
  const json = JSON.stringify(sources)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
  return template
    .replace('__AMC_BOARD__', () =>
      renderVisualization(sources.mission, sources.project).replace(
        '<div id="amc-task-dashboard">',
        '<div id="amc-task-dashboard" data-standalone="true">',
      ),
    )
    .replace('__AMC_GOAL_SOURCES__', () => json)
    .replace(
      '__AMC_GOAL_CODE__',
      () => engine + '\n' + helpers + '\n' + client,
    );
}

function check(goal) {
  const result = validateGoal(goal);
  if (!result.ok) throw new Error(result.errors.join('\n'));
  return goal;
}

function argsOf(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (
      !args[i].startsWith('--') ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    ) {
      throw new Error('Options require explicit values: --option value');
    }
    const key = args[i].slice(2);
    if (Object.hasOwn(result, key)) throw new Error('Duplicate option: ' + key);
    result[key] = args[i + 1];
  }
  return result;
}

export function main(args = process.argv.slice(2)) {
  const [command = 'help', ...rest] = args;
  if (command === 'help' || command === '--help') {
    console.log(`AMC Goal Orchestrator — local planning and evidence ledger; no AI/network execution
  build --out <new.html>
  compile --instruction-file <text> --squads H1,P4 --out <new.json> [--max-parallel 1]
  prompt --goal <json> --out <new.md>
  status --goal <json>
  event --goal <json> --event <event.json> --out <new.json>
Outputs must not exist. Keep previous revisions. No repository status is changed.`);
    return;
  }
  const options = argsOf(rest);
  const allowed = {
    build: ['out'],
    compile: ['instruction-file', 'squads', 'out', 'max-parallel'],
    prompt: ['goal', 'out'],
    status: ['goal'],
    event: ['goal', 'event', 'out'],
  }[command];
  if (!allowed) throw new Error('Unknown command: ' + command);
  for (const key of Object.keys(options))
    if (!allowed.includes(key)) throw new Error('Unknown option: ' + key);
  const need = (name) => {
    if (!options[name]) throw new Error('Missing --' + name);
    return options[name];
  };
  let output;
  if (command === 'build') output = renderGoalWorkbench();
  if (command === 'compile') {
    const { mission, project, provenance } = loadGoalSources();
    const goal = compileGoal({
      instruction: readFileSync(resolve(need('instruction-file')), 'utf8'),
      squadIds: need('squads')
        .split(',')
        .map((id) => id.trim()),
      maxParallel: Number(options['max-parallel'] ?? 1),
      mission,
      project,
      createdAt: new Date().toISOString(),
    });
    goal.sourceFiles = provenance;
    output = JSON.stringify(check(goal), null, 2) + '\n';
  }
  if (['prompt', 'status', 'event'].includes(command)) {
    const goal = check(readJSON(resolve(need('goal'))));
    if (command === 'prompt') output = renderGoalPrompt(goal);
    if (command === 'status') {
      console.log(JSON.stringify(summarizeGoal(goal), null, 2));
      return;
    }
    if (command === 'event') {
      output =
        JSON.stringify(
          check(applyGoalEvent(goal, readJSON(resolve(need('event'))))),
          null,
          2,
        ) + '\n';
    }
  }
  const destination = resolve(need('out'));
  writeFileSync(destination, output, { flag: 'wx', mode: 0o600 });
  console.log('Saved local artifact: ' + destination);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
