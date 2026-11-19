'use client';
import styles from './sky-commerce.module.css';
import { useState } from 'react';
import type { NewsDraft, NewsPacket } from '@/lib/eve-news-audit';
import type { NewsCoverage } from '@/lib/eve-news-coverage';
type Claim=NewsDraft['claimLedger'][number];
export default function EveNewsDraftEditor({draft,packet,coverage,disabled,onChange}:{draft:NewsDraft;packet:NewsPacket;coverage?:NewsCoverage;disabled:boolean;onChange:(draft:NewsDraft)=>void}){
 const [edited,setEdited]=useState(draft);
 const sourceTypes:Record<string,string>={primary_record:'一次記録',on_record_statement:'発言記録',licensed_reporting:'報道資料',correction_or_retraction:'訂正・撤回'};
 const sourceName=(index:number)=>`資料 ${index+1} · ${packet.sources[index].publisherOrSpeaker} · ${sourceTypes[packet.sources[index].sourceType]??'未確認の種類'}`;
 function publish(next:NewsDraft){setEdited(next);onChange({...next,unresolvedQuestions:next.unresolvedQuestions.filter(question=>question.trim())});}
 function claim(index:number,patch:Partial<Claim>){publish({...edited,claimLedger:edited.claimLedger.map((item,i)=>i===index?{...item,...patch}:item)});}
 function add(text='',sourceIds:string[]=[]){if(edited.claimLedger.length>=80)return;publish({...edited,claimLedger:[...edited.claimLedger,{id:crypto.randomUUID(),text,type:'unverified_claim',evidenceState:'unknown',sourceIds,reason:'資料と照合して記載内容を確認する'}]});}
 return <div className={styles.offerForm} aria-label="ニュース草稿の編集">
  <p>見出し・本文・主張と出典を編集します。分類と根拠状態は本人の申告です。資料の文字一致候補は真偽の証明ではありません。</p>
  <details><summary>参照する資料の原文を確認する</summary>{packet.sources.map((source,index)=><section key={source.sourceId}><h4>{sourceName(index)}</h4><p>発行時刻: {source.publishedAtOrUnknown==='unknown'?'不明':source.publishedAtOrUnknown} / 転記・取得時刻: {source.retrievedAt}</p><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{source.excerpt}</p><p style={{overflowWrap:'anywhere'}}>出典: {source.canonicalUrl}</p><p>利用権は保存時の申告です。資料の種類・記載・新旧関係・真偽を独立検証した表示ではありません。</p></section>)}</details>
  <button disabled={disabled} onClick={()=>publish(draft)}>保存した草稿を編集欄へ戻す</button>
  <label className={styles.selectLabel}>修正版の見出し<input value={edited.headline} maxLength={240} disabled={disabled} onChange={event=>publish({...edited,headline:event.target.value})}/></label>
  <label className={styles.selectLabel}>修正版の本文<textarea value={edited.articleText} maxLength={12000} disabled={disabled} onChange={event=>publish({...edited,articleText:event.target.value})}/></label>
  {coverage?.units.filter(unit=>unit.unmappedText.length).map(unit=><div key={unit.id}><p>未対応の文: {unit.text}</p>{unit.text.length>1000&&<p>1,000文字を超える文は、主張を分けて入力してください。</p>}<button disabled={disabled||unit.text.length>1000||edited.claimLedger.length>=80||edited.claimLedger.some(item=>item.text===unit.text)} onClick={()=>add(unit.text,unit.literalSourceIds)}>この文を未確認の主張として追加</button></div>)}
  {edited.claimLedger.map((item,index)=><fieldset className={styles.offerForm} key={item.id} disabled={disabled}><legend>主張 {index+1}</legend>
   <label className={styles.selectLabel}>主張の文言<textarea value={item.text} maxLength={1000} onChange={event=>claim(index,{text:event.target.value})}/></label>
   <label className={styles.selectLabel}>分類<select value={item.type} onChange={event=>claim(index,{type:event.target.value})}><option value="verified_fact">事実として記載（真偽未検証）</option><option value="attributed_claim">発言者の主張</option><option value="analysis_or_inference">分析・推測</option><option value="unverified_claim">未確認の主張</option></select></label>
   <label className={styles.selectLabel}>根拠状態の申告<select value={item.evidenceState} onChange={event=>claim(index,{evidenceState:event.target.value})}><option value="unknown">根拠不明</option><option value="supported">支持ありとの申告</option><option value="contradicted">反証ありとの申告</option><option value="disputed">対立ありとの申告</option></select></label>
   <fieldset><legend>参照する資料</legend>{packet.sources.map((source,sourceIndex)=><label className={styles.checkbox} key={source.sourceId}><input type="checkbox" checked={item.sourceIds.includes(source.sourceId)} onChange={event=>claim(index,{sourceIds:event.target.checked?[...item.sourceIds,source.sourceId]:item.sourceIds.filter(id=>id!==source.sourceId)})}/>{sourceName(sourceIndex)}</label>)}</fieldset>
   <label className={styles.selectLabel}>根拠・未解決の理由<textarea value={item.reason} maxLength={1000} onChange={event=>claim(index,{reason:event.target.value})}/></label>
   <button onClick={()=>publish({...edited,claimLedger:edited.claimLedger.filter((_,i)=>i!==index)})}>この主張を編集稿から外す</button>
  </fieldset>)}
  <button disabled={disabled||edited.claimLedger.length>=80} onClick={()=>add()}>主張を追加</button>
  <label className={styles.selectLabel}>未解決の質問（1行に1件）<textarea value={edited.unresolvedQuestions.join('\n')} disabled={disabled} maxLength={10000} onChange={event=>publish({...edited,unresolvedQuestions:event.target.value.split('\n')})}/></label>
 </div>;
}
