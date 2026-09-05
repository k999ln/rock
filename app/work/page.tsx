import type { Metadata } from 'next';
import Workbench from '@/components/workbench';
import './work.css';
export const metadata: Metadata = { title: '仕事を進める — Rock star' };
export default function WorkPage() {
  return <Workbench />;
}
