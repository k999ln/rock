import Link from 'next/link';
import {publicCombinations,combinationMetadata} from '@/lib/noah-combinations';
export const metadata=combinationMetadata();
export const dynamic='force-dynamic';
export default async function Page(){
  let items;try{items=await publicCombinations();}catch{return <main style={{padding:24}}><h1>サービスの接続準備</h1><p>一覧の取得に時間がかかっています。少し待って再度開いてください。</p></main>;}
  return <main style={{maxWidth:880,margin:'0 auto',padding:24,fontSize:16,lineHeight:1.8}}><h1>サービスとAgentを組み合わせる</h1><p>使いたいサービスの対応、費用、必要な準備を確認します。会員登録なしで準備票を作れます。</p>{items.map(g=><article key={g.id} style={{padding:24,border:'1px solid var(--border, #ddd)',borderRadius:16,margin:'24px 0'}}><small>{g.state==='ready'?'紹介受付中':'準備ガイド'}</small><h2><Link href={'/noah/combinations/'+g.id}>{g.title}</Link></h2><p>{g.summary}</p><p>{g.note}</p></article>)}<p>金融商品の利益や元本は保証されません。口座開設・入金・運用設定は、公式サービスで本人が判断して行います。</p></main>;
}
