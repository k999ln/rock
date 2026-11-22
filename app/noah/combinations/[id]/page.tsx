import Link from 'next/link';
import {notFound} from 'next/navigation';
import {publicCombinations,combinationMetadata} from '@/lib/noah-combinations';
import NoahCombinationForm from '@/components/noah-combination-form';
export const dynamic='force-dynamic';
type Props={params:Promise<{id:string}>};
async function selected({params}:Props){const {id}=await params;return (await publicCombinations()).find(g=>g.id===id);}
export async function generateMetadata(p:Props){const item=await selected(p);return item?combinationMetadata(item):{title:'組み合わせが見つかりません · Noah',robots:{index:false,follow:false}};}
export default async function Page(p:Props){const g=await selected(p);if(!g)notFound();return <main style={{maxWidth:880,margin:'0 auto',padding:24,fontSize:16,lineHeight:1.8}}><Link href="/noah/combinations">組み合わせ一覧</Link><h1>{g.title}</h1><p>{g.summary}</p><p>{g.note}</p><h2>確認すること</h2><ol>{g.preparation.map(x=><li key={x}>{x}</li>)}</ol><ul>{g.exclusions.map(x=><li key={x}>{x}</li>)}</ul><NoahCombinationForm schemeId={g.id}/><h2>確認元</h2><ul>{g.references.map(r=><li key={r.url}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.note}</a></li>)}</ul><p>確認日 {g.checkedAt.slice(0,10)}。金融商品の元本や利益は保証されません。</p><a href={'https://twitter.com/intent/tweet?'+new URLSearchParams({text:g.title,url:'https://avoado.si/noah/combinations/'+g.id})} target="_blank" rel="noopener noreferrer">この組み合わせをXで共有する</a></main>;}
