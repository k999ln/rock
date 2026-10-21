import type { Metadata } from 'next';
import DataCollectionWorkspace from '@/components/data-collection-workspace';
export const metadata: Metadata = { title: 'データ回収 — RockstarOS' };
export default function DataPage() { return <DataCollectionWorkspace />; }
