import { cache } from 'react';
import type { Metadata } from 'next';
import { NOAH_PUBLIC_ORIGIN } from './noah-public-origin';
export const COMBINATIONS_ORIGIN = 'https://noah-revenue-agents.mr-kirin999.workers.dev';
export type ServiceCombination = {id:string;title:string;summary:string;tool:string;state:'ready'|'preparing';preparation:string[];exclusions:string[];references:{url:string;note:string}[];checkedAt:string;note:string};
export const publicCombinations = cache(async ():Promise<ServiceCombination[]> => {
  const r=await fetch(COMBINATIONS_ORIGIN+'/api/catalog',{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw new Error('組み合わせを読み込めませんでした。');
  const data=await r.json() as {items:ServiceCombination[]};
  if(!Array.isArray(data.items))throw new Error('一覧の形式を確認できませんでした。');
  return data.items;
});
export function combinationMetadata(item?:ServiceCombination):Metadata {
  const title=item?item.title+' · Noah':'サービスとAgentを組み合わせる · Noah';
  const description=item?.summary??'実サービスの対応、費用、必要な準備を出典付きで確認。使いたいAgentを動かすための準備票を作ります。';
  const url=NOAH_PUBLIC_ORIGIN+'/noah/combinations'+(item?'/'+item.id:'');
  const images=[{url:NOAH_PUBLIC_ORIGIN+'/brand/noah-social-card-orange.png',width:1200,height:630,alt:title}];
  return {title,description,alternates:{canonical:url},openGraph:{type:'website',url,title,description,images},twitter:{card:'summary_large_image',title,description,images}};
}
