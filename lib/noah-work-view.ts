import type { NoahAskItem } from './noah-ask-view.ts';
export const noahWorkHref = (id: string) =>
  `/noah/tasks/${encodeURIComponent(id)}`;
export function noahWorkState(
  ask: Pick<NoahAskItem, 'state' | 'stopRequested'>,
): string {
  if (ask.state === 'needs_user') return '確認待ち';
  if (ask.state === 'succeeded') return '完了';
  if (ask.state === 'failed') return '失敗';
  if (ask.state === 'cancelled' || ask.state === 'stopped') return '停止済み';
  if (ask.stopRequested) return '停止を確認中';
  if (ask.state === 'queued') return '順番待ち';
  return '応答を待っています';
}
export function noahWorkGroups(asks: NoahAskItem[]) {
  return [
    {
      label: '確認待ち',
      items: asks.filter(
        (a) => a.state === 'failed' || a.state === 'needs_user',
      ),
    },
    {
      label: '作業中',
      items: asks.filter(
        (a) =>
          a.finishedAt === undefined &&
          a.state !== 'failed' &&
          a.state !== 'needs_user',
      ),
    },
    {
      label: '履歴',
      items: asks.filter(
        (a) =>
          a.finishedAt !== undefined &&
          a.state !== 'failed' &&
          a.state !== 'needs_user',
      ),
    },
  ].filter((group) => group.items.length);
}
/** These are the only stages the remote-work protocol actually attests. */
export function noahWorkStages(ask: Pick<NoahAskItem, 'state'>) {
  const current =
    ask.state === 'queued' ? 0 : ask.state === 'succeeded' ? 2 : 1;
  return ['受付', '実行', '受取'].map((label, index) => ({
    label,
    state: index < current ? 'done' : index === current ? 'active' : 'pending',
  }));
}
