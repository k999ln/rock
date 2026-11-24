import type { NoahAskItem } from './noah-ask-view.ts';
export const noahWorkHref = (id: string) =>
  `/noah/tasks/${encodeURIComponent(id)}`;
export function noahWorkAgentHref(mode: string, agentId: string) {
  const id = encodeURIComponent(agentId);
  if (mode === 'revenue') return `/noah/engineering/combinations/${id}`;
  return `${mode === 'provider' || mode === 'cloud' ? '/noah/discover/agent' : '/noah/ready/agent'}?id=${id}`;
}
export function noahWorkState(
  ask: Pick<NoahAskItem, 'state' | 'stopRequested' | 'delivery' | 'mode'>,
): string {
  if (ask.state === 'needs_user') return '確認待ち';
  if (ask.delivery==='missing_image')return '画像が未受取';
  if (ask.state === 'succeeded') return ask.mode === 'revenue' ? '収益記録を作成済み' : '応答を受信';
  if (ask.state === 'failed') return '失敗';
  if (ask.state === 'unknown') return '結果を確認できません';
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
        (a) => a.delivery==='missing_image' || a.state === 'failed' || a.state === 'needs_user',
      ),
    },
    {
      label: '作業中',
      items: asks.filter(
        (a) =>
          !a.delivery && a.finishedAt === undefined &&
          a.state !== 'failed' &&
          a.state !== 'needs_user',
      ),
    },
    {
      label: '履歴',
      items: asks.filter(
        (a) =>
          !a.delivery && a.finishedAt !== undefined &&
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
