'use client';
import {useEffect,useRef,useState} from 'react';
import type {WorkJob} from '@/lib/workflow';
import type {NewsLearningSplit,newsLearningCheck,newsLearningPreview} from '@/lib/eve-news-learning';
import styles from './sky-commerce.module.css';
type Check=Awaited<ReturnType<typeof newsLearningCheck>>;
type Preview=Awaited<ReturnType<typeof newsLearningPreview>>;
export default function EveNewsLearningPreparation({job,busy,canWithdraw,onCommand,onInvalidate}:{job:WorkJob;busy:boolean;canWithdraw:boolean;onCommand:(action:'learning-grant'|'learning-withdraw',input?:Record<string,unknown>)=>void;onInvalidate:()=>void}){
 const [expanded,setExpanded]=useState(Boolean(job.eveNews?.learningConsents?.length));
 const [split,setSplit]=useState<NewsLearningSplit>(()=>job.eveNews?.learningConsents?.at(-1)?.split??'evaluation'),[check,setCheck]=useState<Check|null>(null),[preview,setPreview]=useState<Preview|null>(null),[notice,setNotice]=useState(''),[reading,setReading]=useState(false);
 const [purpose,setPurpose]=useState(false),[rights,setRights]=useState(false),[sensitive,setSensitive]=useState(false),alive=useRef(true),sequence=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 function invalidate(){sequence.current++;setCheck(null);setPreview(null);setPurpose(false);setRights(false);setSensitive(false);onInvalidate();}
 async function read(kind:'check'|'preview',download=false){const id=++sequence.current;setReading(true);setNotice('');try{const response=await fetch('/api/eve/news-work?'+new URLSearchParams({id:job.id,revision:String(job.revision),split,learning:kind}),{cache:'no-store'});const value=await response.json() as {error?:string;check:Check;dataset?:Preview['dataset']};if(!response.ok)throw Error(value.error??'準備条件を読み直してください。');if(!alive.current||id!==sequence.current)return;setCheck(value.check);if(kind==='check')setPreview(null);if(value.dataset){setPreview(value as Preview);if(download){const url=URL.createObjectURL(new Blob([JSON.stringify(value.dataset,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='eve-news-'+value.check.split+'-preparation-'+value.check.dataSha256.slice(0,12)+'.json';a.click();URL.revokeObjectURL(url);}}}catch(error){if(alive.current&&id===sequence.current){setCheck(null);setPreview(null);setNotice((error as Error).message);}}finally{if(alive.current&&id===sequence.current)setReading(false);}}
 const messages:Record<string,string>={work_stopped:'仕事が停止または終了しています。',rights_not_owner_authored:'自作素材以外は、この準備経路では扱いません。引用・要約の許可は学習の許可ではありません。',sensitive_text_review_required:'秘密・連絡先などの可能性を検出しました。原データを確認し、別の修正版で準備してください。',known_evaluation_material:'既知の評価用・架空素材の指標があるため、学習候補には使えません。'};
 const consentNames:Record<string,string>={not_granted:'未同意',withdrawn:'撤回済み',stale:'資料・草稿・用途が変わったため未適用',granted:'この対象・用途の準備に同意済み'};
 return <details className={styles.purchaseConditions} open={expanded} onToggle={event=>setExpanded(event.currentTarget.open)}><summary>学習用データの準備（個別同意）</summary><div className={styles.offerForm}>
  {job.eveNews?.learningConsents?.at(-1)?.status==='withdrawn'&&<p>準備利用の同意は撤回済みです。新しい準備表示・保存には再同意が必要です。</p>}
  <p>この仕事の現行資料と草稿だけが対象です。保存・記憶の設定とは別です。訓練・公開・外部送信は始めません。同じ本人の保存済みNews仕事で評価用にした同一内容も、学習候補から除外します。近似重複や他のデータセットの混入は別確認が必要です。</p>
  <label className={styles.selectLabel}>準備データの用途<select value={split} disabled={busy||reading} onChange={e=>{invalidate();setSplit(e.target.value as NewsLearningSplit);}}><option value="evaluation">評価用</option><option value="training_candidate">学習候補（訓練許可ではありません）</option></select></label>
  <button disabled={busy||reading} onClick={()=>void read('check')}>準備条件を確認</button>
  {notice&&<p role="alert">{notice}</p>}
  {check&&<section aria-label="学習準備の確認結果"><h4>{consentNames[check.consentStatus]}</h4>{check.blockedReasons.map(reason=><p key={reason}>{messages[reason]??'準備条件を確認してください。'}</p>)}{check.knownEvaluationIndicators&&<p>評価用・架空素材の指標があります。評価と学習の混入を完全に検査した結果ではありません。</p>}<p style={{overflowWrap:'anywhere'}}>対象データSHA: {check.dataSha256}</p><p>秘密検査は既知パターンのみです。検出なしでも個人情報や利用権の安全を保証しません。</p></section>}
  <label className={styles.checkbox}><input type="checkbox" checked={purpose} disabled={busy||reading} onChange={e=>{onInvalidate();setPurpose(e.target.checked);}}/>この対象・用途の準備利用に同意する（訓練・公開・外部送信は別）</label>
  <label className={styles.checkbox}><input type="checkbox" checked={rights} disabled={busy||reading} onChange={e=>{onInvalidate();setRights(e.target.checked);}}/>全資料と草稿について、この準備用途の利用権を確認した</label>
  <label className={styles.checkbox}><input type="checkbox" checked={sensitive} disabled={busy||reading} onChange={e=>{onInvalidate();setSensitive(e.target.checked);}}/>選択内容に秘密・個人情報がないことを本人が確認した</label>
  <button disabled={busy||reading||!check||check.jobRevision!==job.revision||check.blockedReasons.length>0||check.consentStatus==='granted'||!purpose||!rights||!sensitive} onClick={()=>onCommand('learning-grant',{split,dataSha256:check!.dataSha256,rightsReviewed:true,sensitiveDataReviewed:true,allowDatasetPreparation:true})}>この対象の準備利用に同意</button>
  <button disabled={!canWithdraw} onClick={()=>{invalidate();setReading(false);onCommand('learning-withdraw');}}>準備利用の同意を撤回</button>
  <p>同意保存後は条件を再確認してください。撤回や資料・草稿の変更後は、新しい表示・保存を拒否します。既にコピーしたファイルや学習済み重みの消去・忘却は保証しません。</p>
  <button disabled={busy||reading||check?.consentStatus!=='granted'||check.blockedReasons.length>0} onClick={()=>void read('preview')}>準備データを表示</button>
  <button disabled={busy||reading||check?.consentStatus!=='granted'||check.blockedReasons.length>0} onClick={()=>void read('preview',true)}>現在の同意を再確認してJSON保存</button>
  {preview&&<section aria-label="本人用の準備データ"><h4>準備データ · {preview.dataset.records.length}件</h4><p>実訓練の許可: なし。model license・横断重複・独立品質・汚染確認は未受入です。</p><details><summary>準備JSONを確認</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(preview.dataset,null,2)}</pre></details></section>}
 </div></details>;
}
