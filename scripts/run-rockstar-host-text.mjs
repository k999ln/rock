/** Explicit local preview. Reads one bounded request from stdin; private mode has no grant; service modes use the owner-confirmed existing device flow. */
import { createTextExecutor, projectTextReceipt } from '../packages/rockstaros-runtime/src/executor.mjs';
import { openNodeExecutorJournal, createOllamaExecutor, nodeHostDescriptor, textOutputDescriptor } from '../packages/rockstaros-runtime/src/node-host.mjs';
import { Readable } from 'node:stream';
import { readBoundedStream } from '../lib/bounded-stream.ts';
if (['setup','connect','run','status'].includes(process.argv[2])) {
  const { runNodeHostCli } = await import('../packages/rockstaros-runtime/src/host-cli.mjs');
  try { await runNodeHostCli(process.argv.slice(2)); } catch(error) { console.error(typeof error.code==='string'&&/^[A-Z0-9_]+$/.test(error.code)?error.code:'HOST_OPERATION_FAILED'); process.exitCode=1; }
} else {
const args = process.argv.slice(2);
const readOnly = args.length === 4 && args[2] === '--read-id';
if (args[0] !== '--state-dir' || !(readOnly || args.length === 3 && args[2] === '--accept-local-text')) throw new Error('Usage: --state-dir PRIVATE_DIRECTORY --accept-local-text < request.json OR --state-dir PRIVATE_DIRECTORY --read-id JOB_UUID');
let request;
if (!readOnly) {
  const reader = Readable.toWeb(process.stdin).getReader();
  try { request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedStream(reader, 16000, () => new Error('REQUEST_TOO_LARGE')))); }
  finally { reader.releaseLock(); }
}
const journal = await openNodeExecutorJournal(args[1]);
try {
  const executor = createTextExecutor({ owner: journal.owner, journal, driver: createOllamaExecutor(),
    host: () => nodeHostDescriptor(), output: { describe: () => textOutputDescriptor() },
    // This explicit operator command authorizes only this OS owner's zero-cloud text preview.
    authorize: binding => Promise.resolve(binding.owner === journal.owner && binding.maximumCostMinor === 0 && binding.permission === 'text.generate' ? binding : null) });
  const result = readOnly ? await executor.read(args[3]) : await executor.submit(request);
  if (!result) throw new Error('JOB_NOT_FOUND');
  console.log(JSON.stringify(result.state === 'review' ? await projectTextReceipt(result) : { id: result.id, state: result.observedState, errorCode: result.errorCode }));
} finally { await journal.close(); }
}
