import NoahGoalHealth from '@/components/noah-goal-health';

export const metadata = { title: '体調ノート — Noah', description: '目的型のAgent（無料）。毎朝の体調を3つ記録して、週ごとに振り返ります。記録はこの端末にだけ保存します。' };

export default function GoalHealthPage() {
  return <NoahGoalHealth />;
}
