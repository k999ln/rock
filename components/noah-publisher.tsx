'use client';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { parseSkyToolPackage } from '@/lib/sky-tool-package';
import { groupNoahAgentPackages } from '@/lib/noah-agent-package-view';
import { NoahAgentPin, NoahAgentPinGrid } from './noah-agent-pin';
import NoahPublicationForm from './noah-publication-form';
import type { StoredSkyToolPackage } from '@/lib/sky-tool-package-store';
import type { NoahUpload } from '@/lib/noah-agent-store';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import styles from './noah-agent-catalog.module.css';

const labels = { submitted:'仕様を保存済み・未提出', published_declared:'審査待ち', verified:'審査済み', rejected:'審査で差し戻し', revoked:'撤回済み' };
const confirmations = { rights:'コード・配布元の権利とライセンスを確認した', pricing:'料金・外部サービスの実費を確認した', sideEffects:'権限・送信先・副作用を確認した', tests:'試験条件と実施結果を確認した' };
type Check = keyof typeof confirmations;
const emptyChecks=()=>({rights:false,pricing:false,sideEffects:false,tests:false});
export default function NoahPublisher() {
  const [rows,setRows]=useState<StoredSkyToolPackage[]>([]), [scope,setScope]=useState(''), [error,setError]=useState(''), [notice,setNotice]=useState(''), [busy,setBusy]=useState(false), [loading,setLoading]=useState(true);
  const owner=useRef(''), mounted=useRef(true), [blocked,setBlocked]=useState(false);
  const [code,setCode]=useState(''), [checks,setChecks]=useState(emptyChecks), [confirmWithdraw,setConfirmWithdraw]=useState('');
  const [uploads,setUploads]=useState<NoahUpload[]>([]), [uploadId,setUploadId]=useState(''), [distributeSource,setDistributeSource]=useState(false);
  const load=useCallback(async()=>{
    try {
      const r=await fetch('/api/noah/publisher',{cache:'no-store'}), data=await r.json() as {packages:StoredSkyToolPackage[];ownerScope:string;error?:string};
      if (!mounted.current) return;
      if (!r.ok) throw new Error(data.error||'読み込めません。');
      if (owner.current && owner.current!==data.ownerScope) { setBlocked(true); throw new Error('アカウントが変わりました。入力を控え、画面を開き直してください。'); }
      const sourceResponse=await fetch('/api/noah/agents',{cache:'no-store'}), available=await sourceResponse.json() as {agents:NoahUpload[];ownerScope:string};
      if (!mounted.current) return;
      if (!sourceResponse.ok || available.ownerScope!==data.ownerScope) throw new Error('本人の登録済みコードを確認できません。読み直してください。');
      setUploads(available.agents.filter(a=>a.uploadState==='ready'&&a.source));
      owner.current=data.ownerScope; setScope(data.ownerScope); setRows(data.packages); setError('');
    } catch(e) { if(mounted.current) {setRows([]); setScope(''); setError(e instanceof Error?e.message:'読み込めません。');} }
    finally {if(mounted.current) setLoading(false);}
  },[]);
  useEffect(()=>{mounted.current=true; const initial=setTimeout(()=>void load(),0); const timer=setInterval(()=>{if(!document.hidden) void load();},30000); return()=>{mounted.current=false;clearTimeout(initial);clearInterval(timer);};},[load]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(code){e.preventDefault();}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[code]);
  function edit(value:string){setCode(value);setChecks(emptyChecks());setNotice('');}
  async function mutate(method:string,body:unknown){
    if(!scope||blocked||busy)return;
    setBusy(true);setError('');setNotice('');
    try {
      const r=await fetch('/api/noah/publisher',{method,headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:scope},body:JSON.stringify(body)}), data=await r.json() as {package:StoredSkyToolPackage;ownerScope:string;error?:string};
      if(!r.ok)throw new Error(data.error||'保存できません。');
      if(data.ownerScope!==owner.current){setBlocked(true);throw new Error('アカウントが変わりました。画面を開き直してください。');}
      if(method==='POST'){edit('');setUploadId('');setDistributeSource(false);}
      setConfirmWithdraw(''); await load();
      setNotice(data.package.status==='published_declared'?'審査へ提出しました。承認されるまで公開されません。':data.package.status==='revoked'?'この版を撤回しました。新しい配布・利用の検査で拒否されます。既に取得したコードは削除できません。':'公開仕様を保存しました。まだ市場には公開されていません。');
    }catch(e){setError(e instanceof Error?e.message:'保存できません。');}finally{setBusy(false);}
  }
  async function readFile(file:File|undefined){if(!file)return;if(file.size>131072){setError('公開仕様は128 KiB以下にしてください。');return;}try{const v=await file.text();parseSkyToolPackage(JSON.parse(v));edit(v);setError('');}catch(e){setError(e instanceof Error?e.message:'仕様ファイルを確認してください。');}}
  function save(){try{const manifest=parseSkyToolPackage(JSON.parse(code)), upload=uploads.find(a=>a.id===uploadId);if(uploadId&&!upload)throw new Error('選択した登録版を読み直してください。');void mutate('POST',{manifest,confirmations:{...checks,distributeSource},...(upload?{upload:{id:upload.id,manifestSha256:upload.manifestSha256,sourceSha256:upload.source!.sha256}}:{})});}catch(e){setError(e instanceof Error?e.message:'仕様を確認してください。');}}
  return <main className={`${styles.page} ${styles.formPage}`}>
    <nav className={styles.nav}><Link href="/noah/explore">見つける</Link><Link href="/noah/saved?tab=agents">自分のAgent</Link><Link href="/noah/sell">販売管理</Link><Link href="/noah/usage?scope=publisher">利用状況</Link><Link href="/noah/developers">継続改善を依頼</Link></nav>
    <header className={styles.hero}><div><span className={styles.eyebrow}>PUBLISH YOUR AGENT</span><h1>Agentを公開する</h1><p>使い方・料金・接続方法を登録して審査へ提出します。本人用のコードは自動公開されません。</p></div></header>
    {error&&<p role="alert" className={styles.error}>{error} {!blocked&&<button onClick={()=>void load()}>読み直す</button>}</p>}
    {notice&&<output className={styles.notice}>{notice}</output>}
    <section aria-label="公開仕様の登録"><h2>1. 公開仕様を用意する</h2>
      <fieldset className={styles.fields} disabled={busy||blocked||!scope}>
        <label>配布する保存済みコード（任意）<select value={uploadId} onChange={e=>{setUploadId(e.target.value);setDistributeSource(false);edit('');}}><option value="">ファイルを添付しない</option>{uploads.map(a=><option key={a.id} value={a.id}>{a.manifest.name} · {a.manifest.version} · {a.source!.sha256.slice(0,12)}</option>)}</select></label>
        <NoahPublicationForm key={uploadId+scope} upload={uploads.find(a=>a.id===uploadId)} ownerScope={scope} disabled={busy||blocked||!scope} onDirty={()=>edit('')} onBuild={value=>{edit(value);setNotice('公開仕様を用意しました。権利・料金・権限・試験結果を確認して保存してください。');}}/>
        {uploadId&&<label className={styles.check}><input type="checkbox" checked={distributeSource} onChange={e=>setDistributeSource(e.target.checked)}/>選択した保存版コードを、審査後に購入者・利用権を持つ人へ配布することを確認した</label>}
        {uploadId&&<p>保存版のコードとhashをこの公開仕様に固定します。原本は本人用のままです。コードの添付だけでは接続・実行できる状態にはなりません。</p>}
        <details><summary>高度な設定 · JSONの読み込み・編集</summary>
        <label>仕様ファイルを読み込む（JSON・128 KiBまで）<input type="file" accept=".json,application/json" onChange={e=>void readFile(e.target.files?.[0])}/></label>
        <label>公開する仕様<textarea value={code} onChange={e=>edit(e.target.value)} rows={16} spellCheck={false} placeholder="公開仕様のJSONを貼り付ける、または上でひな型を作成"/><small>APIキー・パスワード・非公開コードは含めないでください。保存した版は上書きせず、新しい版として登録します。</small></label>
        </details>
        {(Object.keys(confirmations) as Check[]).map(k=><label key={k} className={styles.check}><input type="checkbox" checked={checks[k]} onChange={e=>setChecks(v=>({...v,[k]:e.target.checked}))}/>{confirmations[k]}</label>)}
        <button className={styles.primary} disabled={!code||!Object.values(checks).every(Boolean)||Boolean(uploadId&&!distributeSource)} onClick={save}>{busy?'処理中…':'公開仕様を保存する'}</button>
      </fieldset>
    </section>
    <section aria-label="自分の公開仕様"><h2>2. 審査提出・公開状態</h2>{loading&&<p>読み込み中…</p>}{!loading&&!rows.length&&!error&&<p>登録した公開仕様はありません。</p>}
      {groupNoahAgentPackages(rows).map(group => {
        const cards = group.items.map(p => {
          const status = labels[p.status] + (p.status === 'verified' && !p.installable ? ' · 審査期限などの条件を再確認中' : '');
          const artifact = p.manifest.source.artifact;
          const mutationDisabled = busy || !scope || blocked;
          const controls = <>
            {artifact && <p><a href={`/api/noah/releases/${encodeURIComponent(p.packageKey)}/source?manifest=${p.manifestSha256}`}>この版の配布コードを確認</a> · {artifact.name} · {artifact.sha256.slice(0,12)}</p>}
            <details className={styles.publishedSpec}><summary>この版の仕様を見る</summary><pre>{JSON.stringify(p.manifest, null, 2)}</pre></details>
            <div className={styles.actions}>
              {p.status === 'submitted' && <button disabled={mutationDisabled} onClick={() => void mutate('PATCH', { action: 'submit', packageKey: p.packageKey, manifestSha256: p.manifestSha256, status: p.status })}>審査へ提出する</button>}
              {p.status !== 'revoked' && (confirmWithdraw === p.packageKey ? <>
                <span>この版の公開・審査を撤回します。</span>
                <button disabled={mutationDisabled} onClick={() => void mutate('PATCH', { action: 'withdraw', packageKey: p.packageKey, manifestSha256: p.manifestSha256, status: p.status })}>撤回を確定</button>
                <button disabled={busy} onClick={() => setConfirmWithdraw('')}>戻る</button>
              </> : <button disabled={busy} onClick={() => setConfirmWithdraw(p.packageKey)}>この版を撤回</button>)}
            </div>
            <p>登録・提出は実行試験の合格を意味しません。実行先・利用条件・審査が揃った版を市場へ掲載します。</p>
          </>;
          return group.agents ? <NoahAgentPin key={p.packageKey} id={p.manifest.id} name={p.manifest.name}
            summary={p.manifest.summary} meta={<>v{p.manifest.version} · {status}<br />{p.packageKey}</>} actions={controls} /> :
            <article key={p.packageKey} className={styles.notice}><h3>{p.manifest.name} · v{p.manifest.version}</h3>
              <p>{status}</p><p>{p.manifest.summary}</p><small>{p.packageKey}</small>{controls}
            </article>;
        });
        return group.agents ? <NoahAgentPinGrid key={group.items[0].packageKey}>{cards}</NoahAgentPinGrid> :
          <Fragment key={group.items[0].packageKey}>{cards}</Fragment>;
      })}
    </section>
  </main>;
}
