'use client';
import Link from 'next/link';
import { SkyNotice } from '@/components/sky-feedback';
export default function ErrorPage({error,reset}:{error:Error;reset:()=>void}) {
  return <main style={{padding:24}}><h2>この画面を開けませんでした</h2><SkyNotice message={error} /><p>実行中の仕事の状態を確認してから再操作してください。</p><button onClick={reset}>もう一度開く</button><p><Link href="/noah">タイムラインへ</Link></p></main>;
}
