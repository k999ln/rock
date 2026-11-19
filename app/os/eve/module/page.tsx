import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { readSkyEveSelection } from '@/lib/sky-eve-connections';
import EveSyncWorkspace from '@/components/eve-sync-workspace';
import { SmisObjectPurposeProvider, SmisObjectPurposePreflight } from '@/components/smis-object-purpose-panel';
import styles from '@/components/smis-object-purpose.module.css';
export const metadata = { title: 'やりたいことから始める — Eve', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
/** Private development document only. Production keeps its existing disabled device policy. */
export default async function Page({ searchParams }: { searchParams: Promise<{ thread?: string; device?: string; deviceAgent?: string; agentHash?: string; modelHash?: string; runtime?: string; modelScheme?: string }> }) {
  const params = await searchParams;
  const host = (await headers()).get('host') ?? '';
  if (process.env.SMIS_MODULE_PRIVATE_PREVIEW !== '1' || process.env.NODE_ENV !== 'development' || !/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host)) notFound();
  return <SmisObjectPurposeProvider><div className={styles.page}><section className={styles.intro}><h1>Eveで、やりたいことを形にする</h1>
    <p>目的を入力すると、今のPixelでできることと、必要な部品や準備を確認できます。部品がなくても始められます。</p>
    <details><summary>部品を使うときの準備</summary>
    <p>部品はmicro:bit V2、取り外せるバンドや面ファスナー、対応する電源、準備に使う通信用USBケーブルを使います。最初は部品の動きだけを読みます。物の位置・重さ・温度は測りません。</p>
    <p>別の物へ付け替える前に、Thanks Eveか停止ボタンで仕事の終了を確認してください。成果は既存の一覧から文章で保存できます。まだ実機合格・一般公開の段階ではありません。</p>
    </details></section><SmisObjectPurposePreflight/><EveSyncWorkspace initialSelection={readSkyEveSelection(params)} initialThreadId={params.thread && /^[a-f0-9-]{36}$/.test(params.thread) ? params.thread : ''} /></div></SmisObjectPurposeProvider>;
}
