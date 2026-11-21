import { NoahBoardsPage } from '@/components/noah-boards';
export const metadata = { title: 'ボード — Noah' };
// 本人のボードとフォロー中のボード（task 115。docs/noah/spec-115-pin-grid.md）。
export default function Page() { return <NoahBoardsPage />; }
