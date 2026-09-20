import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
export const metadata: Metadata = { title: 'ツールの実行履歴 — RockstarOS' };
export default function ActivityPage() {
  redirect('/chat?view=work');
}
