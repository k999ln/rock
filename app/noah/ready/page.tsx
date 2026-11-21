import NoahReady from '@/components/noah-ready';
import NoahShelf from '@/components/noah-shelf';
export const metadata = { title: 'すぐ使える Agent — Noah' };
export default function Page() { return <NoahReady shelf={<NoahShelf />} />; }
