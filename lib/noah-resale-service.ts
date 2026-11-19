import {
  asResale,
  createResaleJob,
  finish,
  ingest,
  item,
  localAction,
  reserve,
  resaleRoles,
  txt,
  type ResaleWork,
  type ResaleState,
  type ResaleRole,
} from './noah-resale.ts';
import {
  digest,
  ResaleBeforeDispatchError,
  type ebayResaleProvider,
} from './noah-resale-provider.ts';
import {
  recordResaleWork,
  WorkError,
  workId,
  type WorkJob,
} from './workflow.ts';
export type ResaleRepository = {
  get: (owner: string, id: string) => Promise<WorkJob | null>;
  create: (owner: string, job: WorkJob) => Promise<WorkJob | null>;
  update: (owner: string, job: WorkJob, revision: number) => Promise<boolean>;
};
export async function resaleJobId(owner: string) {
  const h = await digest(['noah.resale/1', owner]);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function resaleService(
  repo: ResaleRepository,
  provider: ReturnType<typeof ebayResaleProvider>,
  context: { transport?: 'browser' | 'terminal' } = {},
) {
  async function get(owner: string): Promise<ResaleWork> {
    const id = await resaleJobId(owner);
    return asResale(
      (await repo.get(owner, id)) ||
        (await repo.create(owner, createResaleJob(id)))!,
    );
  }
  async function save(
    owner: string,
    job: ResaleWork,
    s: ResaleState,
    action: string,
    commandId = crypto.randomUUID(),
  ) {
    const next = recordResaleWork(
      job,
      s,
      job.revision,
      commandId,
      action,
      context.transport,
    );
    if (!(await repo.update(owner, next, job.revision)))
      throw new WorkError(
        '別の操作で更新されました。再読み込みしてください。',
        409,
      );
    return asResale(next);
  }
  async function commitResult(
    owner: string,
    opId: string,
    result: { reference?: string; error?: string; notDispatched?: boolean },
  ) {
    for (let n = 0; n < 3; n++) {
      const current = await get(owner),
        s = structuredClone(current.resale);
      finish(s, opId, result);
      try {
        return await save(owner, current, s, 'finish');
      } catch (e) {
        if (!(e instanceof WorkError) || e.status !== 409) throw e;
      }
    }
    throw new WorkError(
      '取引結果の保存が競合しました。再発注せず履歴を照合してください。',
      409,
    );
  }
  return {
    get,
    ready: provider.ready,
    async run(owner: string, v: Record<string, unknown>) {
      const job = await get(owner);
      if (v.revision !== job.revision)
        throw new WorkError('最新の一覧を読み直してください。', 409);
      const s = structuredClone(job.resale),
        action = txt(v.action, 40);
      if (action === 'scout') {
        if (s.paused || !s.searches)
          throw new WorkError('探索条件を保存し、停止を解除してください。');
        if (!provider.ready.search)
          throw new WorkError('商品検索APIが未接続です。', 503);
        const results: NonNullable<ResaleState['scan']>['results'] = [];
        for (const role of resaleRoles) {
          const current = await get(owner);
          if (current.resale.paused || current.revision !== job.revision)
            throw new WorkError(
              '探索中に条件が更新されました。再読み込みしてください。',
              409,
            );
          try {
            const found = await provider.search(
              s.searches[role],
              role,
              s.currency,
            );
            ingest(s, found);
            results.push({ role, count: found.length });
          } catch {
            results.push({
              role,
              count: 0,
              error: '接続・検索条件・保存上限を確認してください。',
            });
          }
        }
        s.scan = { at: new Date().toISOString(), results };
        return save(owner, job, s, action);
      }
      if (action === 'search') {
        if (s.paused)
          throw new WorkError('探索は停止中です。再開してから検索してください。', 409);
        if (!provider.ready.search)
          throw new WorkError('商品検索APIが未接続です。', 503);
        if (!resaleRoles.includes(v.role as ResaleRole))
          throw new WorkError('担当を選択してください。');
        ingest(
          s,
          await provider.search(
            txt(v.query, 120),
            v.role as ResaleRole,
            s.currency,
          ),
        );
        return save(owner, job, s, action);
      }
      if (action === 'quote') {
        const i = item(s, v.itemId);
        if (s.paused || i.status !== 'candidate' || v.confirm !== true)
          throw new WorkError('商品と見積取得を確認してください。');
        i.checkout = await provider.prepare(i);
        return save(owner, job, s, action);
      }
      if (action === 'purchase' || action === 'publish') {
        const id = workId(v.operationId),
          i = item(s, v.itemId);
        if (v.confirm !== true)
          throw new WorkError('この操作の確認が必要です。');
        const expected = await digest(
          action === 'purchase' ? i.checkout : i.listing,
        );
        if (v.digest !== expected)
          throw new WorkError('確認した取引条件と一致しません。', 409);
        if (
          (action === 'purchase' && !provider.ready.purchase) ||
          (action === 'publish' && !provider.ready.publish)
        )
          throw new WorkError('この操作の接続が未設定です。', 503);
        if (!provider.ready.sandbox && !provider.ready.liveEnabled)
          throw new WorkError('本番取引は無効です。', 403);
        reserve(s, i.id, action, id);
        await save(owner, job, s, action, id);
        try {
          const current = await get(owner);
          if (current.resale.paused || current.status === 'cancelled')
            throw new ResaleBeforeDispatchError('実行前に停止されました。');
          const reference =
            action === 'purchase'
              ? await provider.purchase(i)
              : await provider.publish(i, async (offerId) => {
                  const latest = await get(owner),
                    state = structuredClone(latest.resale);
                  item(state, i.id).listing!.offerId = offerId;
                  await save(owner, latest, state, 'listing_checkpoint');
                  if (state.paused || latest.status === 'cancelled')
                    throw new WorkError(
                      '出品準備後に停止しました。公開せず照合してください。',
                    );
                });
          return await commitResult(owner, id, { reference });
        } catch (error) {
          if (error instanceof ResaleBeforeDispatchError)
            return commitResult(owner, id, {
              notDispatched: true,
              error: error.message,
            });
          return commitResult(owner, id, {
            error:
              '実行結果が不明です。予約を保持しています。Providerの取引履歴と照合してください。',
          });
        }
      }
      if (action === 'reconcile') {
        const op = s.operations.find(
          (o) => o.id === v.operationId && o.state !== 'done',
        );
        if (!op) throw new WorkError('照合対象がありません。');
        const reference = await provider.reconcile(
          item(s, op.itemId),
          op.action,
          typeof v.reference === 'string' ? v.reference : '',
        );
        return commitResult(owner, op.id, { reference });
      }
      localAction(s, v);
      return save(owner, job, s, action);
    },
  };
}
