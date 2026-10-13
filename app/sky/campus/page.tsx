import Link from 'next/link';
import { CAMPUSES, CAMPUS_IDS } from '@/lib/campus';

export const metadata = { title: '大学別Sky' };

export default function CampusSkyIndex() {
  return (
    <main style={{maxWidth: 960, margin: '0 auto', padding: '48px 20px', minHeight: '100dvh'}}>
      <h1>大学別 Sky</h1>
      <p>NFCタグをタップすると、このSkyの大学別画面が開きます。大学を選んでも本人確認や学生枠は付与されません。</p>
      <nav aria-label="大学を選ぶ" style={{display: 'grid', gap: 12, marginTop: 24}}>
        {CAMPUS_IDS.map((id) => <Link key={id} href={`/sky/campus/${id}/hub`} style={{padding: 18, border: '1px solid #79918a', borderRadius: 14}}>{CAMPUSES[id].name} →</Link>)}
      </nav>
    </main>
  );
}
