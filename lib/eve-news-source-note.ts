import { cleanNewsInput } from './eve-news-audit.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
export async function prepareNewsSourceNote(input:{url:string;title:string;excerpt:string;rights:string;publishedAt:string;sourceType:string;seenAt?:string;stale?:boolean}, packetId:string, now=new Date().toISOString()) {
  if(!['owner_authored','summarize_and_quote'].includes(input.rights))throw Error('素材の保存・要約・引用の利用権を確認してください。');
  const excerpt=input.excerpt.trim();if(!excerpt||excerpt.length>1000)throw Error('原文の必要な範囲を1〜1,000文字で入力してください。');
  const url=new URL(input.url);
  const discovery=input.seenAt?{provider:'GDELT',seenAt:input.seenAt,stale:input.stale===true,verification:'unverified_handoff'}:undefined;
  const packet={jobId:packetId,topic:input.title.trim(),sources:[{sourceId:'source-1',canonicalUrl:url.href,publisherOrSpeaker:url.hostname,sourceType:input.sourceType,publishedAtOrUnknown:input.publishedAt.trim()||'unknown',retrievedAt:now,contentHashOrReference:'owner-paste-sha256:'+await sha256Hex(excerpt),rightsScope:input.rights,language:'unknown',excerpt,...(discovery?{discovery}:{})}]};
  const draft={headline:input.title.trim(),articleText:excerpt,claimLedger:[{id:'claim-1',text:excerpt,type:'unverified_claim',evidenceState:'unknown',sourceIds:['source-1'],reason:'本人が転記した資料の作業メモ。主張分解・意味・真偽は未確認。'}],unresolvedQuestions:['記事本文の主張を分解し、他の資料や訂正と照合する。','素材の利用権は本人の申告。掲載や学習の利用許諾は別に確認する。']};
  return {...cleanNewsInput(packet,draft,'owner-source-note'),modelLabel:'owner-source-note'};
}
