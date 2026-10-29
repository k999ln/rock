import { readBoundedStream } from './bounded-stream.ts';
import { ownerScopeFor, readOwnerScope, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { applyWorkCommand, workId, type WorkJob } from './workflow.ts';

/** A host observation, never a proof of hardware, owner identity or consent. */
export type MiiObservation = {
  bootId: string; placeEpoch: number; sequence: number; sceneRevision: number;
  observedAt: number; expiresAt: number; attached: boolean; tracking: 'tracked' | 'lost';
};
export type MiiWorkReference = {
  jobId: string; ownerScope: string; revision: number; sceneRevision: number;
  /** Agent binding is checked against the server job; executor remains a locator hint. */
  agentId?: string; agentRevision?: number; executorDeviceId?: string;
};
export type MiiWorkReadback = {
  job: WorkJob; revisionChanged: boolean;
  agentBinding: 'verified' | 'unverified'; executorBinding: 'unverified';
  hardwareAccepted: false; executionAuthorized: false;
  cancelReconciliation: 'clear' | 'pending' | 'unavailable';
};
/** Read-only A2A budget snapshot; not an MCP price or settled invoice. */
export type MiiBudgetReadback = {
  jobId: string; jobRevision: number; readAt: number;
  budget: null | { currency: string; budgetLimitMinor: number; reservedMinor: number; settledMinor: number; revision: number; updatedAt: number };
};
export type MiiPlanCancelResult = {
  state: 'plan_cancelled' | 'rejected' | 'unknown';
  /** Cancelling the local plan does not prove remote or physical stop. */
  remoteStop: 'unconfirmed'; physicalStop: 'unconfirmed';
};

/** Host-owned journal: claim must atomically create and durably sync before
 * resolving; settle must compare the entire record and durably remove it.
 * Implementations isolate entries by ownerScope and jobId and contain no token.
 * In-memory/localStorage implementations do not satisfy this contract. */
export type MiiPendingCancel = {
  schema: 'rockstaros.mii-plan-cancel/1'; ownerScope: string;
  jobId: string; revision: number; commandId: string;
};
export type MiiCancelJournal = {
  read(key: Pick<MiiPendingCancel, 'ownerScope' | 'jobId'>): Promise<MiiPendingCancel | null>;
  claim(record: MiiPendingCancel): Promise<'claimed' | 'occupied'>;
  settle(record: MiiPendingCancel): Promise<boolean>;
};

const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const stopResult = (state: MiiPlanCancelResult['state']): MiiPlanCancelResult => ({ state, remoteStop: 'unconfirmed', physicalStop: 'unconfirmed' });

/** Compare JSON values independent of object-key order, retaining array order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort()
    .filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}

/**
 * Check the server's entire cancellation result against the actual workflow.
 * A two-revision response is acceptable only if the one pre-existing pending
 * attempt was claimed immediately before the requested cancellation.
 */
function expectedCancellation(before: WorkJob, value: unknown, commandId: string): boolean {
  if (!object(value) || !integer(value.revision) || typeof value.updatedAt !== 'string' ||
      !Number.isFinite(Date.parse(value.updatedAt))) return false;
  let input = before;
  if (value.revision === before.revision + 2) {
    const pending = before.toolAttempts;
    const returned = value.toolAttempts;
    if (!Array.isArray(pending) || pending.length !== 1 || pending[0].state !== 'pending' ||
        pending[0].claimedAt !== undefined || pending[0].claimedRevision !== undefined || pending[0].stopRequestedAt !== undefined ||
        !Array.isArray(returned) || returned.length !== 1 || !object(returned[0]) ||
        returned[0].state !== 'stop_requested' || returned[0].claimedRevision !== before.revision + 1 ||
        typeof returned[0].claimedAt !== 'string' || !Number.isFinite(Date.parse(returned[0].claimedAt))) return false;
    const claimedAt = returned[0].claimedAt;
    input = { ...before, revision: before.revision + 1, updatedAt: claimedAt,
      toolAttempts: [{ ...pending[0], state: 'claimed', claimedAt, claimedRevision: before.revision + 1 }] };
  } else if (value.revision !== before.revision + 1) return false;
  try {
    const expected = applyWorkCommand(input, { id: commandId, action: 'cancel' }, input.revision, value.updatedAt);
    return JSON.stringify(canonical(expected)) === JSON.stringify(canonical(value));
  } catch { return false; }
}

/**
 * Read the existing same-origin work-jobs API. Server requestUser authenticates;
 * ownerScope only detects an account change, and is never a credential.
 * The observation is supplied by a host adapter and grants no authority.
 */
export function createMiiWorkAdapter(options: {
  fetchImpl?: typeof fetch; now?: () => number; journal?: MiiCancelJournal;
}) {
  const fetchImpl = options.fetchImpl ?? fetch, now = options.now ?? Date.now;
  let latest: MiiObservation | null = null, lastSequence = -1, generation = 0, readSerial = 0, budgetSerial = 0, closed = false;
  let lastBoot: string | null = null, lastEpoch = -1, detachedEpoch = -1, observationClock = -1;
  const seenBoots = new Set<string>();
  let readback: { generation: number; reference: MiiWorkReference; job: WorkJob;
    cancelReconciliation: MiiWorkReadback['cancelReconciliation'] } | null = null;
  const uncertain = new Map<string, MiiPendingCancel>();
  const journalKey = (ownerScope: string, jobId: string) => `${ownerScope}\0${jobId}`;
  let busy = false;
  const usedCommands = new Set<string>();
  const fail = (code: string): never => { throw new Error(code); };
  const invalidate = () => { generation++; readSerial++; latest = null; readback = null; observationClock = -1; };
  function observe(value: MiiObservation) {
    // Every new observation invalidates in-flight actions and prior readback.
    invalidate();
    if (closed || !object(value) || !id(value.bootId) || !integer(value.placeEpoch) ||
        !integer(value.sequence) || !integer(value.sceneRevision) || !integer(value.observedAt) ||
        !integer(value.expiresAt) || value.observedAt > now() || value.expiresAt <= now() ||
        value.expiresAt - value.observedAt > 30_000 || typeof value.attached !== 'boolean' ||
        !['tracked', 'lost'].includes(value.tracking)) return fail('MII_OBSERVATION_INVALID');
    if (lastBoot === value.bootId) {
      if (value.placeEpoch < lastEpoch || value.sequence <= lastSequence) return fail('MII_OBSERVATION_STALE');
    } else {
      if (seenBoots.has(value.bootId)) return fail('MII_BOOT_REPLAY');
      seenBoots.add(value.bootId); lastSequence = -1; lastEpoch = -1; detachedEpoch = -1;
    }
    if (value.attached && value.placeEpoch <= detachedEpoch) return fail('MII_DETACHED_EPOCH');
    lastBoot = value.bootId; lastEpoch = value.placeEpoch; lastSequence = value.sequence;
    if (!value.attached) { detachedEpoch = value.placeEpoch; return; }
    if (value.tracking !== 'tracked') return;
    latest = { ...value };
  }
  function current() {
    const time = now();
    if (closed || !latest || !integer(time) || time < observationClock || latest.observedAt > time || latest.expiresAt <= time) {
      // Clock correction cannot resurrect an observation once expiry or clock
      // regression has been observed. A new observation and read are required.
      invalidate(); return fail('MII_OBSERVATION_UNAVAILABLE');
    }
    observationClock = time;
    return generation;
  }
  function check(g: number) {
    if (g !== current()) return fail('MII_CONTEXT_CHANGED');
  }
  function reference(value: MiiWorkReference): MiiWorkReference {
    if (!object(value) || !readOwnerScope(value.ownerScope) || !integer(value.revision) || !integer(value.sceneRevision) ||
        (value.agentId !== undefined && !id(value.agentId)) ||
        (value.agentRevision !== undefined && !integer(value.agentRevision)) ||
        ((value.agentId === undefined) !== (value.agentRevision === undefined)) ||
        (value.executorDeviceId !== undefined && !id(value.executorDeviceId))) return fail('MII_REFERENCE_INVALID');
    return { ...value, jobId: workId(value.jobId) };
  }
  function pending(value: unknown, ref: MiiWorkReference): MiiPendingCancel | null {
    if (value === null) return null;
    if (!object(value) || Object.keys(value).sort().join(',') !== 'commandId,jobId,ownerScope,revision,schema' ||
        value.schema !== 'rockstaros.mii-plan-cancel/1' || value.ownerScope !== ref.ownerScope ||
        value.jobId !== ref.jobId || !integer(value.revision)) return fail('MII_JOURNAL_INVALID');
    return { schema: 'rockstaros.mii-plan-cancel/1', ownerScope: ref.ownerScope, jobId: workId(value.jobId),
      revision: value.revision, commandId: workId(value.commandId) };
  }
  async function responseJson(response: Response) {
    if (!response.headers.get('content-type')?.includes('application/json') || !response.body) return fail('MII_RESPONSE_INVALID');
    const bytes = await readBoundedStream(response.body.getReader(), 4_000_000, () => new Error('MII_RESPONSE_TOO_LARGE'));
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
    catch { return fail('MII_RESPONSE_INVALID'); }
  }
  async function readExisting(input: MiiWorkReference): Promise<MiiWorkReadback> {
    if (busy) return fail('MII_OPERATION_PENDING');
    // A failed or superseded lookup must not leave an earlier selection
    // eligible for a later cancellation.
    readback = null;
    const ref = reference(input), g = current(), serial = ++readSerial;
    if (latest?.sceneRevision !== ref.sceneRevision) return fail('MII_SCENE_REVISION_MISMATCH');
    const response = await fetchImpl('/api/work-jobs', { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    check(g);
    if (serial !== readSerial || busy) return fail('MII_READ_SUPERSEDED');
    if (!response.ok) return fail('MII_READ_REJECTED');
    const body = await responseJson(response); check(g);
    if (serial !== readSerial || busy) return fail('MII_READ_SUPERSEDED');
    if (!object(body) || body.ownerScope !== ref.ownerScope || !Array.isArray(body.jobs)) return fail('MII_OWNER_OR_RESPONSE_MISMATCH');
    const found = body.jobs.filter((job: unknown) => object(job) && job.id === ref.jobId);
    if (found.length !== 1 || !object(found[0]) || !integer(found[0].revision) || found[0].revision < ref.revision ||
        !['active', 'review', 'completed', 'cancelled'].includes(String(found[0].status))) return fail('MII_JOB_NOT_FOUND_OR_STALE');
    const job = structuredClone(found[0]) as WorkJob;
    let agentBinding: MiiWorkReadback['agentBinding'] = 'unverified';
    if (ref.agentId !== undefined) {
      const binding = job.agentBinding;
      if (!binding || binding.schema !== 'rockstaros.work-agent-binding/1' || binding.agentId !== ref.agentId ||
          binding.agentRevision !== ref.agentRevision || !/^[a-f0-9]{64}$/.test(binding.requestDigest))
        return fail('MII_AGENT_BINDING_MISMATCH');
      agentBinding = 'verified';
    }
    let cancelReconciliation: MiiWorkReadback['cancelReconciliation'] = 'unavailable';
    if (options.journal) {
      try {
        const saved = pending(await options.journal.read({ ownerScope: ref.ownerScope, jobId: ref.jobId }), ref);
        check(g); if (serial !== readSerial || busy) return fail('MII_READ_SUPERSEDED');
        cancelReconciliation = saved || uncertain.has(journalKey(ref.ownerScope, ref.jobId)) ? 'pending' : 'clear';
        // Only the authoritative work-jobs event can resolve an uncertain send.
        // A missing event does not prove the request was never applied.
        if (saved && job.status === 'cancelled' && job.revision > saved.revision && Array.isArray(job.events) &&
            job.events.some(event => object(event) && object(event.command) &&
              event.command.id === saved.commandId && event.command.action === 'cancel')) {
          if (await options.journal.settle(saved)) { uncertain.delete(journalKey(ref.ownerScope, ref.jobId)); cancelReconciliation = 'clear'; }
          check(g); if (serial !== readSerial || busy) return fail('MII_READ_SUPERSEDED');
        }
      } catch (error) {
        if (error instanceof Error && ['MII_READ_SUPERSEDED','MII_CONTEXT_CHANGED','MII_OBSERVATION_UNAVAILABLE'].includes(error.message)) throw error;
        cancelReconciliation = 'unavailable';
      }
    }
    readback = { generation: g, reference: ref, job, cancelReconciliation };
    return { job: structuredClone(job), revisionChanged: job.revision !== ref.revision,
      agentBinding, executorBinding: 'unverified', hardwareAccepted: false, executionAuthorized: false, cancelReconciliation };
  }
  /** Read the existing owner-scoped A2A pool, without creating or authorizing a cost. */
  async function readBudget(): Promise<MiiBudgetReadback> {
    const g = current(), snapshot = readback;
    if (!snapshot || snapshot.generation !== g || busy) return fail('MII_BUDGET_READ_UNAVAILABLE');
    const serial = readSerial, budgetOperation = ++budgetSerial;
    const response = await fetchImpl(`/api/sky/a2a-delegations?parentJobId=${encodeURIComponent(snapshot.job.id)}`,
      { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error' });
    check(g);
    if (snapshot !== readback || serial !== readSerial || budgetOperation !== budgetSerial || busy) return fail('MII_READ_SUPERSEDED');
    if (!response.ok) return fail('MII_BUDGET_READ_REJECTED');
    const body = await responseJson(response); check(g);
    if (snapshot !== readback || serial !== readSerial || budgetOperation !== budgetSerial || busy) return fail('MII_READ_SUPERSEDED');
    if (!object(body) || body.ownerScope !== snapshot.reference.ownerScope || body.parentJobId !== snapshot.job.id ||
        !Object.hasOwn(body, 'budget')) return fail('MII_OWNER_OR_BUDGET_MISMATCH');
    let budget: MiiBudgetReadback['budget'] = null;
    if (body.budget !== null) {
      const b = body.budget;
      if (!object(b) || b.parentJobId !== snapshot.job.id || typeof b.currency !== 'string' || !/^[A-Z]{3}$/.test(b.currency) ||
          !integer(b.budgetLimitMinor) || !integer(b.reservedMinor) || !integer(b.settledMinor) || !integer(b.revision) ||
          !integer(b.updatedAt) || Number(b.reservedMinor) + Number(b.settledMinor) > Number(b.budgetLimitMinor))
        return fail('MII_BUDGET_INVALID');
      if (typeof b.ownerUserId !== 'string' || !b.ownerUserId ||
          await ownerScopeFor(b.ownerUserId) !== snapshot.reference.ownerScope) return fail('MII_OWNER_OR_BUDGET_MISMATCH');
      check(g);
      if (snapshot !== readback || serial !== readSerial || budgetOperation !== budgetSerial || busy) return fail('MII_READ_SUPERSEDED');
      budget = { currency: b.currency, budgetLimitMinor: Number(b.budgetLimitMinor), reservedMinor: Number(b.reservedMinor),
        settledMinor: Number(b.settledMinor), revision: Number(b.revision), updatedAt: Number(b.updatedAt) };
    }
    return { jobId: snapshot.job.id, jobRevision: snapshot.job.revision, readAt: now(), budget };
  }
  /** Explicit owner operation: cancel the local plan only; never start/retry work. */
  /** A local freshness fence only, never a credential or Tool permission.
   * The existing runner must still recheck owner/job/agent/Package and claim.
   * Accepted job revisions do not renew the observation's finite lifetime. */
  function createInputGuard(): () => boolean {
    const g = current(), snapshot = readback;
    if (!snapshot || snapshot.generation !== g || snapshot.job.status !== 'active' ||
        !snapshot.reference.agentId || snapshot.cancelReconciliation !== 'clear' ||
        snapshot.job.toolAttempts?.length) return fail('MII_INPUT_UNAVAILABLE');
    return () => {
      try { check(g); return readback === snapshot && !busy && !uncertain.has(journalKey(snapshot.reference.ownerScope, snapshot.job.id)); }
      catch { return false; }
    };
  }
  async function cancelPlan(input: { commandId: string; jobId: string; revision: number; confirmed: boolean }): Promise<MiiPlanCancelResult> {
    if (input.confirmed !== true) return fail('MII_CONFIRMATION_REQUIRED');
    const commandId = workId(input.commandId), jobId = workId(input.jobId), g = current();
    if (!options.journal) return fail('MII_JOURNAL_REQUIRED');
    if (busy || usedCommands.has(commandId)) return fail('MII_CANCEL_RECONCILIATION_REQUIRED');
    if (readback && readback.cancelReconciliation !== 'clear') return fail('MII_CANCEL_RECONCILIATION_REQUIRED');
    if (!readback || readback.generation !== g || readback.job.id !== jobId ||
        input.revision !== readback.job.revision || readback.job.status !== 'active') return fail('MII_READBACK_REQUIRED');
    // Existing workflow cancellation clears skyApp.result; never erase an existing result.
    if (readback.job.skyApp?.result) return fail('MII_RESULT_PRESERVATION_REQUIRED');
    const ref = readback.reference, before = readback.job;
    if (uncertain.has(journalKey(ref.ownerScope, jobId))) return fail('MII_CANCEL_RECONCILIATION_REQUIRED');
    const body = { jobId, revision: input.revision, command: { id: commandId, action: 'cancel' } };
    const record: MiiPendingCancel = { schema: 'rockstaros.mii-plan-cancel/1', ownerScope: ref.ownerScope,
      jobId, revision: input.revision, commandId };
    usedCommands.add(commandId); busy = true; readSerial++; readback = null;
    try {
      check(g);
      // The host claim is an atomic, durable write before any effect is sent.
      // On failure the claim outcome may itself be uncertain; fail closed.
      uncertain.set(journalKey(ref.ownerScope, jobId), record);
      if (await options.journal.claim(record) !== 'claimed') return fail('MII_CANCEL_RECONCILIATION_REQUIRED');
      check(g);
      const response = await fetchImpl('/api/work-jobs', { method: 'PATCH', credentials: 'same-origin',
        cache: 'no-store', redirect: 'error', headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: ref.ownerScope }, body: JSON.stringify(body) });
      if (g !== generation || !latest || latest.observedAt > now() || latest.expiresAt <= now()) return stopResult('unknown');
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) return stopResult('rejected');
        return stopResult('unknown');
      }
      const data = await responseJson(response); check(g);
      if (!object(data) || !expectedCancellation(before, data.job, commandId)) {
        return stopResult('unknown');
      }
      // Keep the durable pending record until GET confirms the exact event.
      return stopResult('plan_cancelled');
    } catch { return stopResult('unknown'); }
    finally { busy = false; }
  }
  return { observe, readExisting, readBudget, createInputGuard, cancelPlan, disconnect() { invalidate(); }, close() { closed = true; invalidate(); } };
}
