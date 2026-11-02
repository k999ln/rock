'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { NewsSource } from '@/lib/eve-news-audit';
import type { WorkJob } from '@/lib/workflow';
import { newsReviewModelAdvice } from '@/lib/eve-news-model-advice';
import EveNewsDraftEditor from './eve-news-draft-editor';
import EveNewsSourceComposer from './eve-news-source-composer';
import EveNewsLearningPreparation from './eve-news-learning-preparation';
import EveNewsLearningCollection from './eve-news-learning-collection';
import { SkyNotice } from './sky-feedback';
import styles from './sky-commerce.module.css';
type Result = { job: WorkJob; historySaved?: boolean };
type Bundle = { packet: unknown; draft: unknown; modelLabel: string };
async function api<T>(query = '', input?: unknown, method = 'PATCH') {
  const response = await fetch('/api/eve/news-work' + query, { method: input ? method : 'GET', cache: 'no-store', headers: input ? { 'content-type': 'application/json' } : undefined, body: input ? JSON.stringify(input) : undefined });
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? '保存したニュース仕事を読み直してください。');
  return value;
}
export default function EveNewsWorkspace({ threadId, onThread }: { threadId: string; onThread: (id: string) => void }) {
  const [jobs,setJobs]=useState<WorkJob[]>([]),[current,setCurrent]=useState<WorkJob|null>(null);
  const [bundle,setBundle]=useState<Bundle|null>(null),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[noticeIsError,setNoticeIsError]=useState(false);
  const [reviewClaim,setReviewClaim]=useState(''),[reviewConsent,setReviewConsent]=useState(false);
  const [sourceAddition,setSourceAddition]=useState<NewsSource[]|null>(null),[sourceReason,setSourceReason]=useState(''),[sourceConsent,setSourceConsent]=useState(false);
  const [consentGrantRunning,setConsentGrantRunning]=useState(false);
  const [repairRunning,setRepairRunning]=useState(false);
  const [repairModel,setRepairModel]=useState(''),[repairDigest,setRepairDigest]=useState(''),[repairConsent,setRepairConsent]=useState(false);
  const [revisionText,setRevisionText]=useState(''),[revisionReason,setRevisionReason]=useState('');
  const sequence=useRef(0),fileSequence=useRef(0),attempt=useRef<{body:string;jobId:string;threadId:string}|null>(null),pending=useRef<{jobId:string;action:string;id:string;revision:number}|null>(null);
  const invalidate=useCallback(()=>{++sequence.current;++fileSequence.current;},[]);
  useEffect(()=>{const id=++sequence.current;void api<{jobs:WorkJob[]}>('?thread='+encodeURIComponent(threadId)).then(value=>{if(id!==sequence.current)return;setJobs(value.jobs);const wanted=new URL(window.location.href).searchParams.get('newsJob');setCurrent(value.jobs.find(job=>job.id===wanted)??null);}).catch(error=>{if(id===sequence.current){setNoticeIsError(true);setNotice((error as Error).message);}});return invalidate;},[threadId,invalidate]);
  function choose(job: WorkJob) {setSourceAddition(null);setSourceReason('');setSourceConsent(false);setReviewClaim('');setReviewConsent(false);setRepairConsent(false);pending.current=null;setRevisionText('');setRevisionReason('');setCurrent(job);if(job.eveNews!.threadId!==threadId)onThread(job.eveNews!.threadId);const url=new URL(window.location.href);url.searchParams.set('newsJob',job.id);for(const key of ['newsSource','sourceTitle','sourceSeenAt','sourceStale'])url.searchParams.delete(key);window.history.replaceState(window.history.state,'',url);}
  async function readBundleFile(upload?: File) {
    if(!upload)return;const id=++fileSequence.current;setBundle(null);setConsent(false);setNotice('');setNoticeIsError(false);
    try{if(upload.size>98304)throw new Error('資料と草稿のファイルは96 KiB以内にしてください。');const value=JSON.parse(await upload.text()) as Partial<Bundle>;
      if(!value||typeof value!=='object'||!value.packet||!value.draft||typeof value.modelLabel!=='string')throw new Error('packet・draft・modelLabelを含む資料付き草稿ファイルを選んでください。');
      if(id===fileSequence.current)setBundle({packet:value.packet,draft:value.draft,modelLabel:value.modelLabel});
    }catch(error){if(id===fileSequence.current){setNoticeIsError(true);setNotice((error as Error).message);}}
  }
  async function create() {
    if(!bundle||!consent)return;const id=++sequence.current;setBusy(true);setNotice('');setNoticeIsError(false);
    const body=JSON.stringify(bundle);const operation=attempt.current?.body===body?attempt.current:{body,jobId:crypto.randomUUID(),threadId:threadId||crypto.randomUUID()};attempt.current=operation;
    try{const result=await api<Result>('',{jobId:operation.jobId,threadId:operation.threadId,...bundle,saveMaterial:true},'POST');if(id!==sequence.current)return;
      setJobs(all=>[result.job,...all.filter(job=>job.id!==result.job.id)]);choose(result.job);setBundle(null);setConsent(false);attempt.current=null;setNotice(result.historySaved===false?'仕事は保存済みです。「会話へ反映」を再試行してください。':'草稿を保存しました。参照検査へ進めます。');
    }catch(error){if(id===sequence.current){setNoticeIsError(true);setNotice((error as Error).message);}}finally{if(id===sequence.current)setBusy(false);}
  }
  async function command(action: 'check'|'sync'|'cancel'|'revise'|'auto-repair'|'evaluate-claim'|'append-sources'|'learning-grant'|'learning-withdraw', payload:Record<string,unknown>={}) {
    if(!current)return;const id=++sequence.current;setBusy(true);if(action==='learning-grant')setConsentGrantRunning(true);if(action==='auto-repair'||action==='evaluate-claim')setRepairRunning(true);setNotice('');setNoticeIsError(false);
    const operation=pending.current?.jobId===current.id&&pending.current.action===action?pending.current:{jobId:current.id,action,id:crypto.randomUUID(),revision:current.revision};pending.current=operation;
    try{if(action==='learning-withdraw'||action==='cancel'&&repairRunning){const fresh=await api<Result>('?id='+encodeURIComponent(current.id));operation.revision=fresh.job.revision;}const replacement=action==='learning-grant'?payload:action==='learning-withdraw'?{}:action==='append-sources'?{sources:sourceAddition,reason:sourceReason,saveMaterial:sourceConsent}:action==='evaluate-claim'?{modelLabel:repairModel,modelDigest:repairDigest,consentLocal:reviewConsent,claimId:reviewClaim}:action==='auto-repair'?{modelLabel:repairModel,modelDigest:repairDigest,consentLocal:repairConsent}:action==='revise'?{draft:JSON.parse(revisionText),modelLabel:'owner-edited',reason:revisionReason}:{};const result=await api<Result>('',{...replacement,jobId:current.id,revision:operation.revision,commandId:operation.id,action});if(id!==sequence.current)return;
      setCurrent(result.job);setJobs(all=>all.map(job=>job.id===result.job.id?result.job:job));pending.current=null;if(action==='append-sources'){setSourceAddition(null);setSourceReason('');setSourceConsent(false);setReviewConsent(false);setRepairConsent(false);}if(action==='revise'){setRevisionText('');setRevisionReason('');setReviewConsent(false);setRepairConsent(false);}setNotice(result.historySaved===false?(action==='learning-withdraw'?'撤回は保存済みです。会話への反映を再試行してください。':'仕事は保持しています。会話への反映を再試行してください。'):action==='cancel'?'この仕事を停止しました。':action==='learning-withdraw'?'準備利用の同意を撤回しました。':action==='learning-grant'?'準備用の同意を保存しました。条件を再確認してください。':'同じ仕事と会話へ保存しました。');
    }catch(error){if(id===sequence.current){setNoticeIsError(true);setNotice((error as Error).message);}}finally{if(id===sequence.current){setBusy(false);setRepairRunning(false);setConsentGrantRunning(false);}}
  }
  const form=<div className={styles.offerForm}>
    <p className={styles.subtle}>資料メモを準備するか、既存Eve News処理の資料付き草稿JSONを読み込みます。資料の保存権限と、個人情報・秘密が含まれないことを確認してください。</p>
    <label>資料付き草稿のファイル<input type="file" accept="application/json,.json" disabled={busy} onChange={event=>{void readBundleFile(event.currentTarget.files?.item(0)??undefined);}}/></label>
    <label className={styles.checkbox}><input type="checkbox" checked={consent} disabled={busy||!bundle} onChange={event=>setConsent(event.target.checked)}/>資料と草稿を自分のアカウントへ保存する</label>
    <button disabled={busy||!bundle||!consent} onClick={()=>void create()}>Eveの仕事として保存</button>
  </div>;
  const news=current?.eveNews;
  const modelAdvice=newsReviewModelAdvice(repairModel,repairDigest);
  const claimLabel=(id:string)=>{const index=news?.draft.claimLedger.findIndex(claim=>claim.id===id)??-1;return index>=0?'主張 '+(index+1):'対応不明の主張';};
  const sourceLabel=(id:string)=>news?.packet.sources.find(source=>source.sourceId===id)?.publisherOrSpeaker??'対応不明の資料';
  const claimNames:Record<string,string>={verified_fact:'事実として記載（真偽未検証）',attributed_claim:'発言者の主張',analysis_or_inference:'分析・推測',unverified_claim:'未確認の主張'};
  const evidenceNames:Record<string,string>={supported:'支持ありとの申告',contradicted:'反証ありとの申告',disputed:'対立ありとの申告',unknown:'根拠不明'};
  const repairStates:Record<string,string>={sending:'実行中・応答未確認（再送禁止）',reported:'応答保存済み',unknown:'応答不明（再送禁止）',not_sent:'未送信'};
  const repairOutcomes:Record<string,string>={adopted:'修正版を保存',invalid_draft:'草稿形式不合格',no_change:'草稿に変更なし',withheld:'採用保留',model_changed:'モデル変更で保留',model_unavailable:'モデル確認不可',inference_unconfirmed:'推論結果未確認',review_saved:'資料照合の提案を保存',invalid_review:'資料照合の形式・引用が不合格'};
  const names:Record<string,string>={unique_source_urls:'出典URLの重複',source_times:'資料の日時',correction_references:'訂正・撤回資料の参照',ledger_text_present:'主張台帳と草稿の文言',body_ledger_coverage:'本文の台帳対応（文字一致）'};
  return <section className={`${styles.paymentPage} ${styles.embeddedPayments}`} aria-label="ニュース草稿の仕事">
    <h3>資料付きニュース草稿</h3><p className={styles.subtle}>参照の検査と人による確認のための仕事です。掲載・真偽確認・政治的公平性の合格とは別です。生成元のモデル情報は未照合、取込前の初回生成の使用量と金額は未報告です。モデル修正の観測は別に表示します。</p>
    {repairRunning&&<p>ローカルモデルの処理を実行中です。停止できます。画面を閉じても、同じ試行を再送せず保存結果を確認してください。</p>}
    {notice&&(noticeIsError?<SkyNotice message={notice}/>:<output className={styles.subtle}>{notice}</output>)}
    <EveNewsSourceComposer disabled={busy} onPrepare={value=>{setBundle(value);setConsent(false);setNoticeIsError(false);setNotice('資料メモを準備しました。内容を確認し、保存に同意してから保存してください。');}}/>
    {bundle&&<p>準備中: {String((bundle.draft as {headline?:string}).headline??'資料付き草稿')}</p>}
    {current?<details className={styles.purchaseConditions} open={Boolean(bundle)}><summary>別の草稿を読み込む</summary>{form}</details>:form}
    <details className={styles.purchaseConditions}><summary>保存したニュース仕事を選ぶ</summary>{jobs.length?jobs.map(job=><button key={job.id} disabled={busy} onClick={()=>choose(job)}>{job.title} · {job.status==='cancelled'?'停止済み':job.status==='review'?'人による確認待ち':job.eveNews?.audit?'参照検査で要確認':'参照検査待ち'}</button>):<p>保存したニュース仕事はありません。</p>}{jobs.length===100&&<p>直近100件を表示しています。</p>}</details>
    <EveNewsLearningCollection key={threadId+':collection:'+(current?.revision??0)}/>
    {news&&<article className={styles.panel}>
      <h3>{news.draft.headline}</h3><span className={styles.status}>{current.status==='cancelled'?'停止済み':news.audit?.checks.some(check=>!check.passed)?'参照検査で要確認':news.audit?'人による確認待ち':'参照検査待ち'} · 未掲載</span>
      <p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{news.draft.articleText}</p>
      <div className={styles.actions}><button disabled={busy||current.status==='cancelled'} onClick={()=>void command('check')}>参照を検査</button><button disabled={busy} onClick={()=>void command('sync')}>会話へ反映</button><button disabled={(busy&&!repairRunning)||current.status==='cancelled'} onClick={()=>void command('cancel')}>この仕事を停止</button></div>
      {news.audit&&<section aria-label="草稿の参照検査"><h4>参照検査</h4>{news.audit.checks.map(check=><p key={check.id}>{check.passed?'形式確認':'要確認'}: {names[check.id]??check.id} — {check.detail}</p>)}{news.audit.warnings.map(warning=><p className={styles.notice} key={warning}>{warning}</p>)}</section>}
      {news.audit&&<details className={styles.purchaseConditions}><summary>本文・主張台帳・資料の対応</summary><p>文・段落の文字対応です。文字が一致しても、意味の支持・真偽・政治的公平性は未検証です。本文以外の見出しや、言い換えた主張の意味的網羅は別途確認してください。</p>
        {!news.audit.coverage?<p>旧検査には文単位の対応がありません。「参照を検査」で更新してください。</p>:<>{news.audit.coverage.truncated&&<p>256文・段落または対応情報60,000文字の上限に達した未検査範囲があります。</p>}{news.audit.coverage.units.map(unit=><section key={unit.id}><h4>{unit.unmappedText.length?'台帳に未対応の文字あり':'台帳の文字で対応'} · 本文 {unit.start}〜{unit.end}</h4><p style={{whiteSpace:'pre-wrap'}}>{unit.text}</p><p>対応する主張: {unit.claimIds.map(claimLabel).join(' / ')||'なし'}</p>{!!unit.unmappedText.length&&<p>未対応の文字: {unit.unmappedText.join(' / ')}</p>}<p>同じ文言がある資料（支持の証明ではありません）: {unit.literalSourceIds.map(sourceLabel).join(' / ')||'見つからず・意味は未確認'}</p></section>)}{news.audit.coverage.claimSources.map(claim=><p key={claim.claimId}>{claimLabel(claim.claimId)} / 指定資料 {claim.declaredSourceIds.map(sourceLabel).join(' / ')} / 同じ文言あり {claim.literalMatchSourceIds.map(sourceLabel).join(' / ')||'なし（言い換えの意味は未確認）'}</p>)}</>}
      </details>}
      {['active','review'].includes(current.status)&&news.audit&&<details className={styles.purchaseConditions}><summary>草稿を修正して再検査する（残り{2-(news.revisions?.length??0)}回）</summary>
        <p>同じ資料を使う修正版を入力します。元の草稿と検査は保持し、保存後に再検査します。自動生成・真偽確認・掲載は行いません。</p>
        <EveNewsDraftEditor key={current.id+':'+current.revision} draft={news.draft} packet={news.packet} coverage={news.audit?.coverage} disabled={busy||(news.revisions?.length??0)>=2} onChange={value=>{pending.current=null;setRevisionText(JSON.stringify(value));}}/>
        <div className={styles.offerForm}><label>修正理由<textarea value={revisionReason} maxLength={1000} disabled={busy} onChange={event=>{pending.current=null;setRevisionReason(event.target.value);}}/></label>
        <button disabled={busy||!revisionText.trim()||!revisionReason.trim()||(news.revisions?.length??0)>=2} onClick={()=>void command('revise')}>同じ仕事に修正版を保存</button></div>
      </details>}
      {current.status==='active'&&news.audit?.checks.some(check=>!check.passed)&&<details className={styles.purchaseConditions}><summary>ローカルモデルで修正を試す</summary><p>この実行サーバーのOllamaを1回呼び出します。資料と旧草稿を渡し、修正版を検査します。最大2試行、外部Cloudへの切替はありません。応答不明では再送しません。</p>
        <div className={styles.offerForm}><label>導入済みモデル名<input value={repairModel} maxLength={120} disabled={busy} onChange={event=>{pending.current=null;setRepairModel(event.target.value);setRepairConsent(false);setReviewConsent(false);}}/></label>
        <label>導入済みモデルの64桁hash<input value={repairDigest} maxLength={64} disabled={busy} onChange={event=>{pending.current=null;setRepairDigest(event.target.value);setRepairConsent(false);setReviewConsent(false);}}/></label>
        <label className={styles.checkbox}><input type="checkbox" checked={repairConsent} disabled={busy} onChange={event=>setRepairConsent(event.target.checked)}/>保存した資料と草稿を、このサーバーのローカルモデルへ渡す</label>
        <button disabled={busy||!repairConsent||!repairModel||!/^[a-f0-9]{64}$/.test(repairDigest)||(news.repairAttempts?.filter(attempt=>!attempt.purpose).length??0)>=2||news.repairAttempts?.some(a=>a.state==='sending'||a.state==='unknown')} onClick={()=>void command('auto-repair')}>モデル修正と参照検査を実行</button></div>
      </details>}
      {current.status!=='cancelled'&&news.audit?.coverage&&<details className={styles.purchaseConditions}><summary>主張と資料の意味をモデルに照合させる</summary><p>1つの主張を保存資料と照合し、モデルの提案と実在する引用を保存します。真偽・政治的公平性・公開可否は確定しません。生成時に観測したモデルとは別の重みを選びます。最大2試行、1試行は最大800token・40秒で、応答不明は再送しません。</p>
        <div className={styles.offerForm}><label className={styles.selectLabel}>照合する主張<select value={reviewClaim} disabled={busy} onChange={event=>{pending.current=null;setReviewClaim(event.target.value);setReviewConsent(false);}}><option value="">主張を選ぶ</option>{news.draft.claimLedger.map((claim,index)=><option key={claim.id} value={claim.id}>主張 {index+1}: {claim.text.slice(0,80)}</option>)}</select></label>
        <label>照合に使う導入済みモデル<input value={repairModel} maxLength={120} disabled={busy} onChange={event=>{pending.current=null;setRepairModel(event.target.value);setReviewConsent(false);setRepairConsent(false);}}/></label>
        <label>照合モデルの64桁hash<input value={repairDigest} maxLength={64} disabled={busy} onChange={event=>{pending.current=null;setRepairDigest(event.target.value);setReviewConsent(false);setRepairConsent(false);}}/></label>
        <aside aria-label="ニュース照合の用途別評価" aria-live="polite"><h4>このモデルのニュース照合評価</h4><p>{modelAdvice.message}</p>{'cases' in modelAdvice&&<p>架空評価ケース: {modelAdvice.criteriaPassed} / {modelAdvice.cases} 件で条件に一致</p>}<p>自動照合担当としての採用: 未受入。接続・権限・実行可否とは別の情報です。</p><details><summary>測定の範囲と版</summary><p>本人作成の架空資料で、支持・反証・資料不足・対立を政治ラベルの入替と比較した小規模評価です。引用の実在だけで真偽を保証しません。</p><p>suite: {modelAdvice.suite} / 参照した評価記録の日時: {modelAdvice.recordedAt??'未確認'}</p><p style={{overflowWrap:'anywhere'}}>資料hash: {modelAdvice.fixtureSha256}</p><p>モデル名・64桁hashの一致、suite版、測定から30日以内を確認します。未評価・別版・古い評価で自動採用は行いません。送信時はサーバーが実モデルのhashを改めて検査します。</p></details></aside>
        <label className={styles.checkbox}><input type="checkbox" checked={reviewConsent} disabled={busy} onChange={event=>setReviewConsent(event.target.checked)}/>この主張と保存資料を、この実行サーバー内の照合モデルへ渡す</label>
        <button disabled={busy||!reviewClaim||!reviewConsent||!repairModel||!/^[a-f0-9]{64}$/.test(repairDigest)||(news.repairAttempts?.filter(attempt=>attempt.purpose==='evidence-review').length??0)>=2||news.repairAttempts?.some(a=>a.state==='sending'||a.state==='unknown')} onClick={()=>void command('evaluate-claim')}>資料照合の提案を作る</button></div>
      </details>}
      {['active','review'].includes(current.status)&&<section aria-label="追加資料と訂正"><h4>同じ仕事へ資料・訂正を追加</h4><p>元の資料・草稿・検査を保持して追加します。現在の検査は解除し、再検査へ戻ります。残り{3-(news.sourceRevisions?.length??0)}回、全体12資料まで。主張や過去のモデル提案へは自動反映しません。</p>
        <EveNewsSourceComposer key={current.id+':append'} append disabled={busy||(news.sourceRevisions?.length??0)>=3||news.packet.sources.length>=12} onPrepare={value=>{pending.current=null;setSourceAddition(value.packet.sources.map(source=>({...source,sourceId:'additional-'+crypto.randomUUID()})));setSourceConsent(false);}}/>
        {sourceAddition&&<div className={styles.offerForm}><p>追加準備: {sourceAddition.map(source=>source.canonicalUrl).join(' / ')}</p><label>資料追加の理由<textarea value={sourceReason} maxLength={1000} disabled={busy} onChange={event=>{pending.current=null;setSourceReason(event.target.value);}}/></label><label className={styles.checkbox}><input type="checkbox" checked={sourceConsent} disabled={busy} onChange={event=>setSourceConsent(event.target.checked)}/>追加する非秘密資料を同じアカウントの仕事へ保存する</label><button disabled={busy||!sourceConsent||!sourceReason.trim()||(news.sourceRevisions?.length??0)>=3} onClick={()=>void command('append-sources')}>同じ仕事へ資料を追加</button></div>}
      </section>}
      {!!news.sourceRevisions?.length&&<details className={styles.purchaseConditions}><summary>資料追加前の記録（{news.sourceRevisions.length}件）</summary>{news.sourceRevisions.map((entry,index)=><section key={entry.commandId}><h4>資料版 {index+1} · {entry.packet.sources.length}資料</h4><p>{entry.reason} / {entry.replacedAt}</p><p>{entry.draft.articleText}</p>{entry.packet.sources.map(source=><p key={source.sourceId}>{source.publisherOrSpeaker} / {source.sourceId}</p>)}<p>{entry.audit?'当時の検査: '+entry.audit.checks.filter(check=>!check.passed).map(check=>names[check.id]??check.id).join(' / '):'当時は未検査'}</p></section>)}</details>}
      {!!news.repairAttempts?.some(attempt=>attempt.evidenceReport)&&<section aria-label="主張と資料のモデル評価"><h4>主張と資料のモデル評価（未確定の提案）</h4>{news.repairAttempts.filter(attempt=>attempt.evidenceReport).map(attempt=><article key={attempt.id}><h4>{claimLabel(attempt.claimId??'')} · {attempt.draftSequence===(news.revisions?.length??0)&&(attempt.packetSequence??0)===(news.sourceRevisions?.length??0)?'この資料・草稿への提案':'過去の資料・草稿への提案'}</h4><p>評価対象: {attempt.evidenceReport!.claimText}</p><p>モデルの評価: {{supported:'支持の提案',contradicted:'反証の提案',insufficient:'資料不足の提案',mixed:'支持・反証が混在する提案'}[attempt.evidenceReport!.assessment]}</p><p>{attempt.evidenceReport!.explanation}</p><p>{attempt.writerIdentity==='different_observed_model'?'生成とは別のdigestを前後で観測（独立性や正確性の保証ではありません）':'生成モデルの本人性は未確認。独立性は未検証です。'}</p>{attempt.evidenceReport!.evidence.map((item,index)=><blockquote key={index}><p>{item.quote}</p><footer>{sourceLabel(item.sourceId)} · {{supports:'支持として提示',contradicts:'反証として提示',context:'文脈として提示'}[item.relation]}（資料内の文字存在のみ検査）</footer></blockquote>)}<p>この評価で仕事の完了・真偽の確定・掲載は行いません。他の主張の評価も別に必要です。</p></article>)}</section>}
      {!!news.repairAttempts?.length&&<section aria-label="ローカルモデルの実行と使用量"><h4>ローカルモデルの実行と使用量</h4>{news.repairAttempts.map(attempt=><p key={attempt.id}>{attempt.purpose==='evidence-review'?'資料照合: ':'草稿修正: '}{attempt.modelLabel} · {repairStates[attempt.state]} · {attempt.outcome?repairOutcomes[attempt.outcome]:'結果未確認'} · {attempt.usage?attempt.usage.metrics.map(metric=>`${metric.meter}: ${metric.quantity??'未報告'} ${metric.unit}`).join(' / '):'使用量未報告'} · 金額未確定・請求未照合</p>)}</section>}
      {!!news.revisions?.length&&<details className={styles.purchaseConditions}><summary>過去の草稿と検査（{news.revisions.length}件）</summary>{news.revisions.map((entry,index)=><section key={entry.commandId}><h4>草稿 {index+1}: {entry.draft.headline}</h4><p>{entry.reason} · {entry.replacedAt}</p><p style={{whiteSpace:'pre-wrap'}}>{entry.draft.articleText}</p>{entry.audit.checks.map(check=><p key={check.id}>{check.passed?'形式確認':'要確認'}: {names[check.id]??check.id}</p>)}</section>)}</details>}
      <details className={styles.purchaseConditions}><summary>全資料と主張台帳</summary><p>主張の分類と根拠状態は生成元の申告です。各資料と照合してください。</p>
        {news.packet.sources.map(source=><section key={source.sourceId}><h4><a href={source.canonicalUrl} target="_blank" rel="noopener noreferrer">{source.publisherOrSpeaker}</a> · {source.sourceId}</h4>{source.discovery&&<p>リンク発見: {source.discovery.provider} / {source.discovery.seenAt} / {source.discovery.stale?'前回取得分':'検出時刻の引継ぎ'}（未照合・発行日時や利用権の証明ではありません）</p>}<p>公開: {source.publishedAtOrUnknown==='unknown'?'不明':source.publishedAtOrUnknown} / 取得: {source.retrievedAt}</p><p style={{whiteSpace:'pre-wrap'}}>{source.excerpt}</p></section>)}
        {news.draft.claimLedger.map(claim=><p key={claim.id}>{claim.text} — {claimNames[claim.type]??'未確認'} / {evidenceNames[claim.evidenceState]??'未確認'} / {claim.sourceIds.join(', ')} · {claim.reason}</p>)}
        <p>未解決: {news.draft.unresolvedQuestions.join(' / ')||'生成元の記載なし（解決済みの証明ではありません）'}</p>
      </details>
      <EveNewsLearningPreparation key={current.id+':learning:'+current.revision} job={current} busy={busy} canWithdraw={!busy||consentGrantRunning} onInvalidate={()=>{pending.current=null;}} onCommand={(action,input)=>void command(action,input)}/>
      <details className={styles.purchaseConditions}><summary>取込元と保存参照</summary><p>指定モデル: {news.draft.modelProfileIdAndHash}（未照合）</p><p style={{overflowWrap:'anywhere'}}>仕事 {current.id} / 保存hash {news.requestSha256}</p></details>
    </article>}
  </section>;
}
