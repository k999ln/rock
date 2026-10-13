import { readFileSync } from 'node:fs';

const checks = [
  {
    file: 'lib/jennifer-amc-execution.ts',
    required: [
      'createJenniferExecutionGoal',
      'createJenniferTaskJobCoordination',
      'buildJenniferDispatchPrompt',
      'buildJenniferExecutionReport',
    ],
  },
  {
    file: 'services/sky-agent-runtime/src/worker.ts',
    required: [
      'runA2AAgentRuntime',
      'beginRemoteSend',
      'recordTaskReceipt',
      'reconcileRemoteTask',
      'settleTaskReceipt',
    ],
  },
  {
    file: 'app/api/sky/a2a-delegations/[id]/usage-receipt/route.ts',
    required: ['verifyA2AUsageReceipt', 'settleUsageReceipt', 'RECEIPT_SCOPE_MISMATCH'],
  },
  {
    file: 'components/workbench.tsx',
    required: [
      'approveDelegationDispatch',
      'submitJenniferTaskResult',
      'verifyJenniferTaskResult',
    ],
  },
  {
    file: 'services/sky-agent-runtime/wrangler.jsonc',
    required: ['A2A_DELEGATION_EXECUTION_ENABLED', 'false'],
  },
  {
    file: 'services/sky-agent-runtime/test/a2a-workflow.positive.test.mjs',
    required: ['sent once', 'artifactsCaptured', 'getUsageReceipt'],
  },
];

const errors = [];

for (const check of checks) {
  let source;
  try {
    source = readFileSync(new URL(`../${check.file}`, import.meta.url), 'utf8');
  } catch (error) {
    errors.push(`${check.file}: ${error instanceof Error ? error.message : String(error)}`);
    continue;
  }

  for (const token of check.required) {
    if (!source.includes(token)) errors.push(`${check.file}: required workflow marker is missing: ${token}`);
  }
}

if (errors.length > 0) {
  console.error('Sky A2A workflow check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Sky A2A workflow wiring is complete and fail-closed by default.');
}
