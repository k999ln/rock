import Link from 'next/link';
import { NoahHapticsSetting } from '@/components/noah-interaction';

export default function NoahPreferences() {
  return <main style={{ maxWidth:560, margin:'0 auto', padding:24 }}>
    <Link href="/noah">戻る</Link><h1>操作の設定</h1><NoahHapticsSetting />
  </main>;
}
