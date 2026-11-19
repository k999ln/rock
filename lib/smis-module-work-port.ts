import type { EveWorkPort, createEveInteractionSession } from './rockstar-eve-interaction.ts';
export type SmisInputContext = { key: string; suffix: string; request?: string; valid: () => boolean };
/** Explicitly selected purpose becomes the existing review; never creates or starts a job. */
export async function reviewSmisObjectPurpose(session: ReturnType<typeof createEveInteractionSession>, selected: SmisInputContext, continuing: () => boolean) {
  if (!selected.request) return false;
  const input = selected.request + selected.suffix;
  if (input.length > 1000) throw Error('部品の情報も含めて1,000文字までです。目的を短くしてください。');
  await session.stop(true);
  if (!continuing() || !selected.valid() || !['disabled', 'standby'].includes(session.state.phase)) return false;
  session.arm(); session.hearFinal('Hey Eve'); session.hearFinal(input);
  return session.state.phase === 'review';
}
/** New work is fenced by the original attachment. Read/stop always retain the original job. */
export function guardSmisModuleWorkPort(work: EveWorkPort, context: () => SmisInputContext | null): EveWorkPort {
  let prepared: { key: string; input: string } | null = null;
  const fingerprint = (value: SmisInputContext) => JSON.stringify([value.key, value.request ?? null, value.suffix]);
  const current = (key: string) => { const value = context(); return !!value && fingerprint(value) === key && value.valid(); };
  return {
    async prepare(input, continuing) {
      prepared = null;
      const selected = context();
      if (!selected || !selected.valid() || (selected.suffix && !input.endsWith(selected.suffix))) throw Error('物と部品の確認が変わりました。今の情報で依頼を確認し直してください。');
      if (selected.request !== undefined && input !== selected.request + selected.suffix) throw Error('目的や必要な働きが変わりました。上の部品確認から依頼を確認し直してください。');
      const key = fingerprint(selected);
      const result = await work.prepare(input, () => continuing() && current(key));
      if (!continuing() || !current(key)) return null;
      if (result) prepared = { key, input };
      return result;
    },
    async start(reference) {
      if (!prepared || prepared.input !== reference.input || !current(prepared.key)) throw Error('部品を付け替えたか、接続が切れました。前の依頼は始めていません。');
      prepared = null;
      return work.start(reference);
    },
    read: reference => work.read(reference),
    stop: reference => work.stop(reference),
    stopExisting: work.stopExisting ? reference => work.stopExisting!(reference) : undefined,
  };
}
