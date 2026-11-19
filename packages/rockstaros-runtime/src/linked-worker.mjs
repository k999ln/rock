import { createTextExecutor, executionDigest, parseLocalTextRequest, projectTextReceipt, ExecutorError } from './executor.mjs';
import { linkedFields, linkedId, linkedHash, linkedCanonical, parseLinkedReport } from '../../../lib/rockstar-linked-execution.ts';

const assert = (v, code) => { if (!v) throw new ExecutorError(code); };
/** One approved device, one existing journal, one immutable command. No credential is stored here. */
export function createLinkedTextWorker({ runtime, owner, deviceId, journal, driver, host, output, now = Date.now }) {
  linkedId(deviceId);
  assert(typeof owner === 'string' && owner.length > 0 && owner.length <= 160 && journal?.owner === owner && runtime?.executions, 'LINKED_HOST_BINDING_REQUIRED');
  const active = new Map();
  async function inspect() {
    const value = await runtime.executions.inspect();
    assert(value.ownerUserId === owner && value.deviceId === deviceId && Array.isArray(value.commands) && value.commands.length <= 8, 'SERVICE_IDENTITY_MISMATCH');
    return value.commands;
  }
  async function run(entry) {
    const c = linkedFields(entry?.command, ['schema', 'owner', 'deviceId', 'request', 'requestSha256', 'executorId', 'displayInput']);
    assert(c.schema === 'rockstaros.runtime-command/1' && c.owner === owner && c.deviceId === deviceId, 'COMMAND_OWNER_OR_DEVICE_MISMATCH');
    const id = linkedId(c.request?.id); linkedId(c.request?.threadId); linkedHash(c.requestSha256);
    assert(c.requestSha256 === await executionDigest(c.request), 'COMMAND_DIGEST_MISMATCH');
    const pending = active.get(id);
    if (pending) { assert(pending.digest === c.requestSha256, 'REQUEST_ID_CONFLICT'); return pending.promise; }
    const promise = perform(c).finally(() => active.delete(id));
    active.set(id, { digest: c.requestSha256, promise });
    return promise;
  }
  async function saved(c) {
    try {
      const response = await runtime.executions.read(c.request.id), value = response.execution;
      assert(value?.deviceId === deviceId && value.id === c.request.id && value.threadId === c.request.threadId && value.report?.requestSha256 === c.requestSha256 && Number.isSafeInteger(value.revision) && value.revision > 0, 'SERVICE_REPORT_MISMATCH');
      await parseLinkedReport(value.report, c);
      return value;
    } catch (error) { if (error.status === 404) return null; throw error; }
  }
  async function perform(c) {
    const entries = await inspect();
    const remote = entries.find(e => e.command?.request?.id === c.request.id);
    if (!remote) {
      const priorReport = await saved(c);
      assert(priorReport, 'COMMAND_NOT_AVAILABLE');
      return { state: 'reported', execution: priorReport, inferenceRepeated: false };
    }
    assert(linkedCanonical(remote.command) === linkedCanonical(c), 'SERVICE_COMMAND_CHANGED');
    let claimId;
    const prior = await journal.get(c.request.id);
    if (prior) {
      assert(prior.owner === owner && prior.digest === c.requestSha256, 'JOURNAL_COMMAND_MISMATCH');
      assert(/^runtime-claimed:[a-f0-9-]{36}$/i.test(remote.state), 'RUNTIME_CLAIM_MISSING');
      claimId = remote.state.slice('runtime-claimed:'.length);
    } else {
      // A server claim without a local durable record is UNKNOWN, never permission to start again.
      if (remote.state !== 'runtime-pending') return { state: 'unknown', id: c.request.id, errorCode: 'CLAIM_WITHOUT_LOCAL_RECORD', inferenceRepeated: false };
      parseLocalTextRequest(c.request, now());
      claimId = crypto.randomUUID();
    }
    let claimed = Boolean(prior), claimAttempted = false;
    const executor = createTextExecutor({ owner, journal, driver, host, output, now,
      authorize: async binding => {
        assert(binding.owner === owner && binding.jobId === c.request.id && binding.requestSha256 === c.requestSha256 && binding.executorId === c.executorId && binding.permission === 'text.generate' && binding.maximumCostMinor === 0 && binding.expiresAt === c.request.deadline, 'COMMAND_EXECUTOR_BINDING_MISMATCH');
        if (!claimed) {
          claimAttempted = true;
          const claim = await runtime.executions.claim({ id: c.request.id, claimId, requestSha256: c.requestSha256 });
          assert(claim.claimId === claimId && claim.requestSha256 === c.requestSha256, 'CLAIM_RESPONSE_MISMATCH');
          claimed = true;
        }
        return runtime.executions.authorize(c.request.id, claimId);
      } });
    let record;
    try { record = prior ? await executor.read(c.request.id) : await executor.submit(c.request); }
    catch (error) {
      if (claimAttempted && error.outcome === 'unknown') return { state: 'unknown', id: c.request.id, errorCode: 'CLAIM_OR_AUTHORIZATION_RESPONSE_UNKNOWN', inferenceRepeated: false };
      throw error;
    }
    const ready = record.observedState === 'review';
    const projected = ready ? await projectTextReceipt(record) : null;
    const report = { schema: 'rockstaros.runtime-report/1', id: c.request.id, requestSha256: c.requestSha256, claimId,
      state: ready ? 'review' : 'unknown', text: projected?.text ?? null, outputSha256: projected?.outputSha256 ?? null,
      model: structuredClone(c.request.model), durationMs: ready ? record.result.durationMs : null,
      errorCode: ready ? null : record.errorCode ?? 'PROCESS_RESTART_OUTCOME_UNKNOWN' };
    await parseLinkedReport(report, c);
    const remoteReport = await saved(c);
    if (remoteReport?.report.state === 'review') {
      if (ready) assert(linkedCanonical(remoteReport.report) === linkedCanonical(report), 'SERVICE_REPORT_MISMATCH');
    } else {
      try { await runtime.executions.publish({ report, revision: remoteReport?.revision ?? 0 }); }
      catch (error) {
        if (error.outcome === 'unknown') return { state: 'report_unknown', id: c.request.id, errorCode: 'REPORT_RESPONSE_UNKNOWN', inferenceRepeated: false };
        throw error;
      }
    }
    const confirmed = await saved(c);
    assert(confirmed && confirmed.report.claimId === claimId, 'REPORT_READBACK_REQUIRED');
    try { await runtime.executions.acknowledge(c.request.id, claimId); }
    catch (error) {
      if (error.outcome === 'unknown') return { state: 'ack_unknown', execution: confirmed, inferenceRepeated: false };
      throw error;
    }
    return { state: 'reported', execution: confirmed, inferenceRepeated: false };
  }
  return Object.freeze({ inspect, run });
}
