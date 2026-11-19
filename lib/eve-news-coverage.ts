import type { NewsPacket, NewsDraft } from './eve-news-audit.ts';
export type NewsCoverageUnit = { id: string; start: number; end: number; text: string; claimIds: string[]; unmappedText: string[]; literalSourceIds: string[] };
export type NewsCoverage = { schema: 'eve.news-coverage/1'; method: 'literal-span-coverage'; offsets: 'utf16'; units: NewsCoverageUnit[]; unmappedUnitIds: string[]; truncated: boolean; maxUnits: 256; claimSources: { claimId: string; declaredSourceIds: string[]; literalMatchSourceIds: string[]; semanticSupport: 'not_verified' }[]; semanticTruth: 'not_verified' };
const content = (char: string) => !/[\s。！？!?.,、，．「」『』“”"'():;：；（）]/u.test(char);
const bare = (value: string) => value.trim().replace(/[。！？!?]+$/u,'');
/** Conservative character coverage only. A literal source match is neither truth nor entailment. */
export function inspectNewsCoverage(packet: NewsPacket, draft: NewsDraft): NewsCoverage {
 const units:NewsCoverageUnit[]=[];let truncated=false,budget=60000;
 for(const match of draft.articleText.matchAll(/[^\n。！？!?]+[。！？!?]*/gu)){
  if(!Array.from(match[0]).some(content))continue;
  if(units.length>=256){truncated=true;break;}
  const raw=match[0],text=raw.trim(),start=match.index+raw.indexOf(text),end=start+text.length,covered=new Uint8Array(text.length),claimIds:string[]=[];
  for(const claim of draft.claimLedger){const needle=bare(claim.text);if(!needle)continue;let index=text.indexOf(needle),found=false;
   while(index>=0){covered.fill(1,index,index+needle.length);found=true;index=text.indexOf(needle,index+needle.length);}
   if(found)claimIds.push(claim.id);
  }
  const unmappedText:string[]=[];let offset=0,gap='';
  for(const char of text){const missing=content(char)&&!covered[offset];if(missing)gap+=char;else if(gap){unmappedText.push(gap);gap='';}offset+=char.length;}
  if(gap)unmappedText.push(gap);
  const literal=bare(text);const unit={id:'body-'+start+'-'+end,start,end,text,claimIds,unmappedText,literalSourceIds:packet.sources.filter(source=>source.excerpt.includes(literal)).map(source=>source.sourceId)};const size=JSON.stringify(unit).length;if(size>budget){truncated=true;break;}budget-=size;units.push(unit);
 }
 const claimSources:NewsCoverage['claimSources']=[];
 for(const claim of draft.claimLedger){const needle=bare(claim.text),entry={claimId:claim.id,declaredSourceIds:claim.sourceIds,literalMatchSourceIds:needle&&Array.from(needle).some(content)?packet.sources.filter(source=>claim.sourceIds.includes(source.sourceId)&&source.excerpt.includes(needle)).map(source=>source.sourceId):[],semanticSupport:'not_verified' as const};const size=JSON.stringify(entry).length;if(size>budget){truncated=true;break;}budget-=size;claimSources.push(entry);}
 return {schema:'eve.news-coverage/1',method:'literal-span-coverage',offsets:'utf16',units,unmappedUnitIds:units.filter(unit=>unit.unmappedText.length).map(unit=>unit.id),truncated,maxUnits:256,claimSources,semanticTruth:'not_verified'};
}
