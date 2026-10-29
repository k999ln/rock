import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runEveDecisionControls } from '../lib/eve-decision-eval.ts';

async function main() {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--max-planner-calls' || !/^[1-9]\d{0,2}$/.test(args[1])))
    throw new Error('Usage: node --experimental-strip-types scripts/eve-decision-eval.mjs [--max-planner-calls 1..300]');
  const path = fileURLToPath(new URL('../data/fixtures/eve-decision-eval/stage0.json', import.meta.url));
  const corpus = JSON.parse(await readFile(path, 'utf8'));
  const report = await runEveDecisionControls(corpus, args.length ? { maxPlannerCalls: Number(args[1]) } : {});
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.complete) process.exitCode = 1;
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Evaluation configuration failed'}\n`);
  process.exitCode = 1;
});
