import NoahGoalHealth from '@/components/noah-goal-health';
import { noahShareMetadata } from '@/lib/noah-share-metadata';

// 共有した時のカード（SNS）にも、題と説明が出るように（Noah の共有の絵を使う）。
export const metadata = noahShareMetadata('/noah/goals/health', { title: '体調ノート — Noah', description: '目的型のAgent（無料）。毎朝の体調を3つ記録して、週ごとに振り返ります。記録はこの端末にだけ保存します。' });

export default function GoalHealthPage() {
  return <NoahGoalHealth />;
}
