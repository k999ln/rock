import { OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { readBoundedStream } from './bounded-stream.ts';
import { applyWorkCommand, type WorkJob } from './workflow.ts';

export type MiiEditResult = { state: 'saved' | 'conflict' | 'unknown'; job?: WorkJob };
/** Uses the existing owner-scoped WorkJob CAS/event log; no second work database,
 * no Tool execution, and no automatic resend after an ambiguous response. */
export function createMiiPlanEditor({ job, ownerScope, fetcher = fetch, current, canSave = current }: {
  job: WorkJob; ownerScope: string; fetcher?: typeof fetch; current: () => boolean; canSave?: () => boolean;
}) {
  const original = structuredClone(job);
  let pending: { id: string; objective: string } | null = null;
  let sent = false;
  async function read(): Promise<WorkJob> {
    const response = await fetcher(`/api/work-jobs?id=${encodeURIComponent(original.id)}`, {
      cache: 'no-store', credentials: 'same-origin', headers: { [OWNER_SCOPE_HEADER]: ownerScope }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('MII_READ_UNAVAILABLE');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('MII_READ_UNAVAILABLE');
    const payload = JSON.parse(new TextDecoder().decode(await readBoundedStream(reader, 2_000_000, () => new Error('MII_READ_LIMIT'))));
    if (payload.ownerScope !== ownerScope || !Array.isArray(payload.jobs) || payload.jobs.length !== 1 ||
        payload.jobs[0]?.id !== original.id || !Number.isSafeInteger(payload.jobs[0].revision) ||
        !Array.isArray(payload.jobs[0].events)) throw new Error('MII_READ_BINDING');
    return payload.jobs[0];
  }
  async function reconcile(): Promise<MiiEditResult> {
    if (!pending || !sent) throw new Error('MII_NO_PENDING_EDIT');
    try {
      const saved = await read();
      if (!current()) return { state: 'unknown' };
      const event = saved.events.find(e => e.command.id === pending!.id)?.command;
      if (event?.action === 'edit_plan' && event.objective === pending.objective &&
          saved.revision > original.revision) return { state: 'saved', job: saved };
      if (saved.revision > original.revision) return { state: 'conflict', job: saved };
      return { state: 'unknown', job: saved }; // Request may still be in flight. Never auto-replay.
    } catch { return { state: 'unknown' }; }
  }
  return {
    reconcile,
    async save(objective: string, confirmed: boolean): Promise<MiiEditResult> {
      if (pending || !confirmed || !current() || !canSave() || !/^owner-v1:[a-f0-9]{64}$/.test(ownerScope) ||
          typeof objective !== 'string' || !objective.trim() || objective.trim().length > 1000 ||
          original.toolAttempts?.length || original.templateId === 'amc') throw new Error('MII_EDIT_NOT_CURRENT');
      const command = { id: crypto.randomUUID(), action: 'edit_plan' as const, schemaVersion: 1 as const, objective: objective.trim() };
      applyWorkCommand(original, command, original.revision); // Same transition as the server.
      if (command.objective === original.plan.objective) throw new Error('MII_EDIT_UNCHANGED');
      pending = { id: command.id, objective: command.objective };
      if (!current() || !canSave()) { pending = null; throw new Error('MII_EDIT_NOT_CURRENT'); }
      sent = true;
      try {
        // The server authenticates, verifies owner intent and atomically compares revision.
        // A successful PATCH alone is not the saved-result receipt: read the event back.
        await fetcher('/api/work-jobs', { method: 'PATCH', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: ownerScope },
          body: JSON.stringify({ jobId: original.id, revision: original.revision, command }), signal: AbortSignal.timeout(10000) });
      } catch { /* Unknown delivery: only read/reconcile below. */ }
      return reconcile();
    },
  };
}
