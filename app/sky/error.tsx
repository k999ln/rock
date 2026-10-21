'use client';
import Link from 'next/link';
import { SkyNotice } from '@/components/sky-feedback';

export default function SkyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main style={{ maxWidth: 720, margin: '48px auto', padding: 24 }}><h1>この画面を開けませんでした</h1>
    <SkyNotice message={error} /><p>実行中の仕事が止まったとは限りません。状態を確認してから操作してください。</p>
    <button type="button" onClick={reset}>画面をもう一度開く</button><p><Link href="/sky">Skyに戻る</Link></p>
  </main>;
}
