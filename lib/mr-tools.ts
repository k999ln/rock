/** Browser adaptations from k999ln/Mr., pinned in vendor/mr/provenance.json.
 * Copyright (c) Anicca contributors. MIT — see vendor/mr/LICENSE.
 * Rock star adds input limits, plain-text results and stricter free-edition guards.
 */
export const MR_COMMIT='26a39d2c31ea5246cb78dbe42d86e333922db60c';
export const MR_SOURCE=`https://github.com/k999ln/Mr./tree/${MR_COMMIT}`;
export const MAX_TEXT=100000;
function textInput(value:string,name='本文'){if(typeof value!=='string'||!value.trim())throw new Error(`${name}を入力してください。`);if(value.length>MAX_TEXT)throw new Error(`${name}は10万文字以内にしてください。`);return value.replace(/\r\n?/g,'\n');}
function protectCode(body:string){
 let marker='\uE000ROCK_STAR_CODE_';while(body.includes(marker))marker+='X';
 const preserved:string[]=[];const keep=(value:string)=>{const token=marker+preserved.length+'\uE001';preserved.push(value);return token;};
 const lines=body.split('\n');const output:string[]=[];let i=0;
 while(i<lines.length){const match=/^\s*(`{3,}|~{3,})/.exec(lines[i]);if(match){const block=[lines[i++]];const close=new RegExp('^\\s*'+match[1][0]+'{'+match[1].length+',}\\s*$');while(i<lines.length){const line=lines[i++];block.push(line);if(close.test(line))break;}output.push(keep(block.join('\n')));}else{output.push(lines[i++].replace(/(`+)([^\n]*?)\1(?!`)/g,m=>keep(m)));}}
 return{text:output.join('\n'),restore:(value:string)=>preserved.reduce((out,code,index)=>out.split(marker+index+'\uE001').join(code),value)};
}
export function formatCitations(input:string){
 const protectedText=protectCode(textInput(input));const body=protectedText.text;const seen=new Set<string>();const pairs:[string,string][]=[];
 const cleaned=body.replace(/（出典:\s*[^）]*）/g,citation=>{const found=[...citation.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)];if(!found.length)return citation;for(const m of found){if(!seen.has(m[2])){seen.add(m[2]);pairs.push([m[1],m[2]]);}}return '';}).replace(/。。+/g,'。').replace(/、、+/g,'、').replace(/ {2,}/g,' ').replace(/\s+(?=[。、])/g,'').replace(/\n{3,}/g,'\n\n');
 let result:string;
 if(!pairs.length)result=cleaned.trimEnd()+'\n';
 else {const header=/^##\s*出典\s*$/m.exec(cleaned);if(header){const end=header.index+header[0].length;const tail=cleaned.slice(end);const next=/^## /m.exec(tail);const existing=next?tail.slice(0,next.index):tail;const after=next?tail.slice(next.index):'';const urls=new Set([...existing.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g)].map(m=>m[2]));const additions=pairs.filter(p=>!urls.has(p[1]));result=additions.length?`${cleaned.slice(0,end)}\n${existing.trimEnd()}\n${additions.map(([l,u])=>`- [${l}](${u})`).join('\n')}\n\n${after}`.trimEnd()+'\n':cleaned.trimEnd()+'\n';}else result=cleaned.trimEnd()+`\n---\n\n## 出典\n\n${pairs.map(([l,u])=>`- [${l}](${u})`).join('\n')}\n`;}
 return protectedText.restore(result);
}

type Segment={type:'code'|'hr'|'heading'|'bullet'|'sentence';raw:string;paraId?:number};
const plain=(s:string)=>s.replace(/^#{1,6}\s*/,'').replace(/^[-*]\s*/,'').replace(/\*\*(.+?)\*\*/g,'$1');
function segments(body:string){const lines=body.split('\n');const out:Segment[]=[];let buf:string[]=[],pid=0,i=0;
 const flush=()=>{if(!buf.length)return;const text=buf.map(l=>l.trim()).filter(Boolean).join(' ');buf=[];for(const raw of text.match(/[^。]*。|[^。]+$/g)||[])if(raw.trim())out.push({type:'sentence',raw,paraId:pid});pid++;};
 while(i<lines.length){const line=lines[i],s=line.trim();if(s.startsWith('```')){flush();const code=[line];i++;while(i<lines.length&&!lines[i].trim().startsWith('```'))code.push(lines[i++]);if(i>=lines.length)throw new Error('コードブロックを閉じてから作成してください。');code.push(lines[i++]);out.push({type:'code',raw:code.join('\n')});continue;}
 if(!s){flush();i++;continue;}if(s==='---'||/^#{1,6}\s/.test(s)||/^[-*]\s/.test(s)){flush();out.push({type:s==='---'?'hr':s.startsWith('#')?'heading':'bullet',raw:line});i++;continue;}buf.push(line);i++;}flush();return out;}
function renderSegments(items:Segment[]){const lines:string[]=[];let i=0;while(i<items.length){const s=items[i];if(s.type==='sentence'){const joined:string[]=[];while(i<items.length&&items[i].type==='sentence'&&items[i].paraId===s.paraId)joined.push(items[i++].raw);lines.push(joined.join(''),'');}else if(s.type==='bullet'){while(i<items.length&&items[i].type==='bullet')lines.push(items[i++].raw);lines.push('');}else{lines.push(s.raw,'');i++;}}return lines.join('\n').trimEnd();}
function sourceSection(body:string){
 const lines=body.split('\n');let start=-1,level=0,fence:RegExp|null=null;
 for(let i=0;i<lines.length;i++){const line=lines[i].trim();if(fence){if(fence.test(line))fence=null;continue;}const fm=/^(`{3,}|~{3,})/.exec(line);if(fm){fence=new RegExp('^'+fm[1][0]+'{'+fm[1].length+',}\\s*$');continue;}const m=/^(#{1,6})\s*(Sources|出典)\s*$/i.exec(line);if(m){start=i;level=m[1].length;break;}}
 if(start<0)return null;let end=lines.length;fence=null;
 for(let i=start+1;i<lines.length;i++){const line=lines[i].trim();if(fence){if(fence.test(line))fence=null;continue;}const fm=/^(`{3,}|~{3,})/.exec(line);if(fm){fence=new RegExp('^'+fm[1][0]+'{'+fm[1].length+',}\\s*$');continue;}const m=/^(#{1,6})\s/.exec(line);if(m&&m[1].length<=level){end=i;break;}}
 if(fence)throw new Error('出典欄のコードブロックを閉じてください。');
 return{raw:lines.slice(start,end).join('\n').trimEnd(),body:[...lines.slice(0,start),...lines.slice(end)].join('\n')};
}
export type FreeArticleInput={markdown:string;afterChars:number;summary:string;price:number;paidContents:string;noteUrl:string};
export function makeFreeArticle(input:FreeArticleInput){const source=textInput(input.markdown,'原稿');if(!Number.isInteger(input.afterChars)||input.afterChars<1||input.afterChars>MAX_TEXT)throw new Error('無料範囲は1〜100,000文字の整数にしてください。');if(!Number.isInteger(input.price)||input.price<1||input.price>1000000)throw new Error('価格は1〜1,000,000円の整数にしてください。');const summary=textInput(input.summary,'まとめ').split('\n').map(s=>s.trim()).filter(s=>/^[-*]\s+/.test(s)).map(s=>s.replace(/^[-*]\s+/,''));if(summary.length<3||summary.length>5)throw new Error('まとめは「- 」で始まる箇条書き3〜5個にしてください。');const paidContents=textInput(input.paidContents,'完全版の内容').trim();let url:URL;try{url=new URL(input.noteUrl);}catch{throw new Error('完全版のURLを入力してください。');}if(url.protocol!=='https:'||url.hostname!=='note.com'||url.username||url.password||!/^\/[^/]+\/n\/[^/]+/.test(url.pathname))throw new Error('https://note.com/ で始まる記事URLを入力してください。');
 const lines=source.split('\n');const title=/^#\s+/.test(lines[0].trim())?lines.shift():null;const body=lines.join('\n');const sourceInfo=sourceSection(body);const all=segments(sourceInfo?sourceInfo.body:body);const kept:Segment[]=[];let count=0,cut=-1;for(let i=0;i<all.length;i++){const s=all[i];kept.push(s);if(s.type!=='code'){count+=Array.from(plain(s.raw)).length;if(count>=input.afterChars){cut=i;break;}}}if(cut<0||!all.slice(cut+1).some(s=>s.type==='sentence'||s.type==='bullet'||s.type==='code'))throw new Error('無料範囲が長すぎます。完全版に残す本文ができるよう短くしてください。');const truncated=renderSegments(kept);const sources=sourceInfo?.raw;
 const parts=[...(title?[title,'']:[]),truncated,'','---','','## まとめ','',...summary.map(s=>'- '+s),'',...(sources?[sources,'']:[]),'---','',`この記事は無料版です。完全版（note・${input.price.toLocaleString('en-US')}円買い切り）には、この続き（${paidContents}）が入っています。`,'',input.noteUrl.trim(),''];const output=parts.join('\n').replace(/\n{3,}/g,'\n\n').trimEnd()+'\n';if(output.split('\n').some(l=>/^#{2,6}\s/.test(l.trim())&&l.includes('続き')))throw new Error('「続き」を含む見出しを変更してください。');if(output.includes('——'))throw new Error('原稿中の「——」を別の表現に変更してください。');return output;
}

export type CoconalaInput={brief:string;proposal:string;bucket:'single'|'retainer';orderRate:number|null};
export type CoconalaResult={allowed:boolean;reasons:string[];rankingNotes:string[];signals:string[];orderRate:number|null;summary:string};
export function checkCoconala(input:CoconalaInput):CoconalaResult{
 const brief=textInput(input.brief,'案件の依頼文').normalize('NFKC').trim();const proposal=textInput(input.proposal,'提案文').normalize('NFKC').trim();if(!['single','retainer'].includes(input.bucket))throw new Error('契約形態を選んでください。');if(input.orderRate!==null&&(!Number.isFinite(input.orderRate)||input.orderRate<0||input.orderRate>100))throw new Error('発注率は0〜100%で入力してください。不明なら空欄にしてください。');
 const syncWords=/(?:Google\s*Meet|Zoom|Microsoft\s*Teams|Webex|電話|通話|面談|面接|ヒアリング|インタビュー|ライブ講義|顔出し|対面)/i;
 const optional=/(?:ありません|不要|必要(?:は)?ありません|必須ではありません|必須ではない|任意|求めません|できなくても(?:可|可能)|歓迎条件)/i;
 const required=brief.split(/(?<=[。\n！？])|(?=ただし|一方で)/).filter(s=>!(syncWords.test(s)&&optional.test(s))).join('\n');
 const rules:[string,RegExp][]=[['ビデオ通話・面談',/(?:Google\s*Meet|Zoom|Microsoft\s*Teams|Webex|ビデオ(?:通話|会議|面談)|オンライン(?:面談|ヒアリング|面接)|Web(?:面談|会議|面接))/i],['日時を決めた面談',/(?:クライアント|採用|オンライン)?面談[\s\S]{0,45}(?:日時|日程|時刻|対応(?:は)?可能|ご対応|候補日)|(?:日時|日程|時刻|候補日)[\s\S]{0,45}(?:面談|面接|ヒアリング)/i],['インタビューへの参加',/(?:オンライン)?(?:ヒアリング|インタビュー|面接)[\s\S]{0,35}(?:参加|ご協力|お話|実施)|(?:参加|ご協力)[\s\S]{0,35}(?:ヒアリング|インタビュー|面接)/i],['電話・本人音声',/(?:電話|通話|音声通話|本人音声|音声収録|ナレーション収録)/i],['出演・対面作業',/(?:ライブ講義|生配信への出演|顔出し|顔を出して|対面(?:作業|面談|打合せ|打ち合わせ))/i]];
 const signals=rules.filter(([,r])=>r.test(required)).map(([name])=>name);const reasons:string[]=[];if(input.bucket==='retainer')reasons.push('継続契約は、Mr.の単発案件向け自動対応範囲に含まれません。');if(signals.length)reasons.push('本人の参加が必要な条件が見つかりました。');const participant=/(?:ヒアリング|インタビュー|アンケート|モニター)[\s\S]{0,40}(?:ご協力|参加|回答(?:して|いただ|ください)|お話を伺)|(?:ご協力|参加|回答(?:して|いただ|ください))[\s\S]{0,40}(?:ヒアリング|インタビュー|アンケート|モニター)/i.test(brief);const provider=/(?:支援|サポート).{0,20}(?:提案|提供|いたします|します)|(?:納品|お渡し|作成|制作|構築|改善案)/.test(proposal);if(participant&&provider)reasons.push('参加者を求める依頼に、制作サービスを提案している可能性があります。');if(input.orderRate===null)reasons.push('発注率の確認ができていません。元ページで確認してください。');const rankingNotes=input.orderRate!==null&&input.orderRate<=40?['発注率40%以下は参考情報です。新規依頼者も含まれるため、これだけで対応不可にはしません。']:[];return{allowed:!reasons.length,reasons,rankingNotes,signals,orderRate:input.orderRate,summary:reasons.length?'人の確認が必要です':'検出対象の条件に一致する問題はありません'};
}
