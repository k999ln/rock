import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
export const metadata: Metadata = { title: '仕事を進める — Rock star' };
export default function WorkPage() {
  redirect('/chat?view=work');
}
