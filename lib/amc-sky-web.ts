import { WorkError, objectInput } from './workflow.ts';
import type { AmcGoal } from './amc-tool.ts';
import { protectedSkyEvents } from '../scripts/amc-sky-authority.mjs';

// A trusted deployment observer and authenticated reviewer ACL are not yet bound.
// Fail closed at every HTTP route as well as the shared reducer. Neither user
// JSON nor a locally imported Goal can stand in for authenticated observations.
export const skyWebExecution = {
  status: 'observer_unavailable',
  reason: '最新ソース・契約・担当を確認するサーバー接続が未設定です。計画保存と閲覧はできます。実行・検収は開始されません。',
} as const;
export function skyWebCommand(goal: AmcGoal, input: unknown, authenticatedUser: string) {
  if (!goal.skyBrief) return input;
  const command=objectInput(input,['id','action','event']);
  const event=command.event as Record<string,unknown> | undefined;
  if (command.action!=='amc_event' || !event) throw new WorkError('Sky専用の記録操作が必要です。');
  if (protectedSkyEvents.has(String(event.type))) throw new WorkError(skyWebExecution.reason,409);
  return {...command,event:{...event,actor:authenticatedUser,role:'owner'}};
}
export function requireSkyDraftImport(goal: AmcGoal | undefined) {
  if (goal?.skyBrief && (goal.state!=='draft' || goal.revision!==0 || goal.eventLog.length || goal.tasks.some(t=>t.status!=='pending') || (Array.isArray(goal.skyDirectives) && goal.skyDirectives.length)))
    throw new WorkError('実行記録付きSky Goalは信頼できる移行経路が必要です。既存保存記録は保持します。',409);
}
