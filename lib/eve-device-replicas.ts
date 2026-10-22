import {
  eveHistoryStore,
  EveHistoryError,
  eveThreadId,
  type EveHistoryKeys,
  type EveHistoryItem,
} from './eve-history.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
export type EveReplicaRow = {
  job_id: string;
  thread_id: string;
  device_id: string;
  revision: number;
  digest: string;
  envelope: string;
  updated_at: number;
};
export function eveDeviceReplicas(
  db: Database,
  owner: string,
  keys: EveHistoryKeys,
) {
  const history = eveHistoryStore(db, owner, keys);
  const find = (id: string) =>
    db
      .prepare('SELECT * FROM eve_device_jobs WHERE owner_id=? AND job_id=?')
      .bind(owner, eveThreadId(id))
      .first<EveReplicaRow>();
  const unpack = <T>(row: EveReplicaRow) =>
    history.unsealRecord<T>(row.envelope, `job:${row.job_id}`);
  async function rows(threadId = '') {
    if (threadId) eveThreadId(threadId);
    return (
      await db
        .prepare(
          "SELECT * FROM eve_device_jobs WHERE owner_id=? AND (?='' OR thread_id=?) ORDER BY updated_at DESC,job_id DESC LIMIT 100",
        )
        .bind(owner, threadId, threadId)
        .all<EveReplicaRow>()
    ).results;
  }
  async function commit(input: {
    id: string;
    threadId: string;
    deviceId: string;
    revision: number;
    digest: string;
    payload: unknown;
    prior: EveReplicaRow | null;
  }) {
    const { id, threadId, deviceId, revision, digest, payload, prior } = input;
    await history.assertWritable(threadId);
    if (prior && (prior.device_id !== deviceId || prior.thread_id !== threadId))
      throw new EveHistoryError('この仕事の実行元か会話が異なります。', 409);
    if (prior?.digest === digest) return { revision: prior.revision, digest };
    if ((prior?.revision ?? 0) !== revision)
      throw new EveHistoryError(
        '新しい仕事の版があります。上書きせず読み直してください。',
        409,
      );
    const envelope = await history.sealRecord(payload, `job:${id}`),
      now = Date.now();
    const result = prior
      ? await db
          .prepare(
            'UPDATE eve_device_jobs SET revision=revision+1,digest=?,envelope=?,updated_at=? WHERE owner_id=? AND job_id=? AND device_id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0)',
          )
          .bind(
            digest,
            envelope,
            now,
            owner,
            id,
            deviceId,
            revision,
            owner,
            threadId,
          )
          .run()
      : await db
          .prepare(
            'INSERT INTO eve_device_jobs(owner_id,job_id,thread_id,device_id,revision,digest,envelope,updated_at) SELECT ?,?,?,?,1,?,?,? WHERE NOT EXISTS(SELECT 1 FROM eve_conversations WHERE owner_id=? AND id=? AND deleted_at<>0) ON CONFLICT(owner_id,job_id) DO NOTHING',
          )
          .bind(
            owner,
            id,
            threadId,
            deviceId,
            digest,
            envelope,
            now,
            owner,
            threadId,
          )
          .run();
    if (result.meta.changes !== 1)
      throw new EveHistoryError(
        '別の同期が更新しました。読み直してください。',
        409,
      );
    return { revision: revision + 1, digest };
  }
  async function append(input: {
    jobId: string;
    threadId: string;
    input: string;
    text: string | null;
    createdAt: number;
    prefix: 'linux' | 'runtime';
  }) {
    for (let attempt = 0; attempt < 4; attempt++) {
      let current: EveHistoryItem | undefined;
      try {
        current = await history.get(input.threadId);
      } catch (error) {
        if (!(error instanceof EveHistoryError) || error.status !== 404)
          throw error;
      }
      const messages = [
        {
          id: `${input.prefix}:${input.jobId}:request`,
          side: 'me' as const,
          text: input.input,
        },
        ...(input.text
          ? [
              {
                id: `${input.prefix}:${input.jobId}:result`,
                side: 'sky' as const,
                text: input.text,
              },
            ]
          : []),
      ];
      if (
        current &&
        messages.every((m) =>
          current.session.messages.some(
            (old) => old.id === m.id && old.text === m.text,
          ),
        )
      )
        return;
      const session = current?.session ?? {
        version: 1 as const,
        id: input.threadId,
        toolId: 'sky-auto',
        createdAt: input.createdAt,
        messages: [],
        activeRequest: null,
        workflowStatus: 'ready' as const,
        outcome: null,
      };
      try {
        await history.save({
          session: { ...session, messages, activeRequest: null },
          revision: current?.revision ?? 0,
          remember: current?.remember ?? true,
        });
        return;
      } catch (error) {
        if (
          !(error instanceof EveHistoryError) ||
          error.status !== 409 ||
          attempt === 3
        )
          throw error;
      }
    }
  }
  return { history, find, unpack, rows, commit, append };
}
