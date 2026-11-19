import { WorkError } from './workflow.ts';
export type AgentCollectionTerms = {
 mode:'platform_invoice'|'external_provider';
 chargeScope:'author_fee'|'receipt_total'|'none';
 usageFunding:'platform'|'byok';
 refundPolicy:'itemized_source/1';
};
type AuthorCharge={meter:string;unit:string;commissionPolicy:'sky-marketplace-10pct/1'};
export type AuthorRemunerationTerms =
 | {schema:'sky.author-remuneration-terms/1';body:string;authorCharge:AuthorCharge}
 | {schema:'sky.author-remuneration-terms/2';body:string;authorCharge:AuthorCharge;collection:AgentCollectionTerms};
export function parseAuthorRemunerationTerms(text:string):AuthorRemunerationTerms|null {
 let raw:unknown;try {raw=JSON.parse(text);}catch{return null;}
 if(!raw || typeof raw!=='object' || Array.isArray(raw) || !('schema' in raw) || typeof raw.schema!=='string' || !['sky.author-remuneration-terms/1','sky.author-remuneration-terms/2'].includes(raw.schema))return null;
 const v=raw as AuthorRemunerationTerms,c=v.authorCharge;
 const expected=v.schema==='sky.author-remuneration-terms/2'?'authorCharge,body,collection,schema':'authorCharge,body,schema';
 if(Object.keys(v).sort().join(',')!==expected || typeof v.body!=='string' || !v.body.trim() || v.body.length>6000 || !c || typeof c!=='object' || Array.isArray(c) || Object.keys(c).sort().join(',')!=='commissionPolicy,meter,unit' || c.commissionPolicy!=='sky-marketplace-10pct/1' || ![c.meter,c.unit].every(x=>typeof x==='string' && /^[A-Za-z0-9._:/-]{1,128}$/.test(x)))throw new WorkError('作者料の対象項目・単位・合意済み手数料条件を確認してください。',400);
 if(v.schema==='sky.author-remuneration-terms/2') {
  const r=v.collection;
  if(!r || typeof r!=='object' || Array.isArray(r) || Object.keys(r).sort().join(',')!=='chargeScope,mode,refundPolicy,usageFunding' ||
   !['platform_invoice','external_provider'].includes(r.mode) || !['author_fee','receipt_total','none'].includes(r.chargeScope) ||
   !['platform','byok'].includes(r.usageFunding) || r.refundPolicy!=='itemized_source/1' ||
   (r.mode==='external_provider' ? r.chargeScope!=='none' : r.chargeScope==='none' || (r.usageFunding==='byok' && r.chargeScope!=='author_fee')))
   throw new WorkError('請求経路・対象項目・BYOKの費用境界・返金方針を確認してください。',400);
 }
 return v;
}
