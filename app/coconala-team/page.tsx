import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'ココナラ — Sky',
  description: 'Skyのココナラへ移動します。',
};

export default function CoconalaTeamPage() {
  redirect('/sky/tools/coconala');
}
