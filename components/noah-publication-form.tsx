'use client';
import { useRef, useState } from 'react';
import { noahPublicationAgentId, packageFromPublicationForm, type PublicationField } from '@/lib/noah-publication-form';
import { SKY_PERMISSIONS, type SkyConnectionType, type SkyExecutionTarget, type SkyPermission, type SkyPricing } from '@/lib/sky-submission';
import type { NoahUpload } from '@/lib/noah-agent-store';
import type { SkyToolSourceKind } from '@/lib/sky-tool-package';
import NoahGuideEditor from './noah-guide-editor';
import styles from './noah-agent-catalog.module.css';

const permissionLabels: Record<SkyPermission,string> = {read_user_input:'依頼内容を読む',write_results:'成果を保存',network:'ネットワーク通信',external_account:'外部アカウント',selected_files:'選択したファイル',long_running:'継続運用',financial_action:'金融操作'};
function Fields({label,value,change}:{label:string;value:PublicationField[];change:(v:PublicationField[])=>void}) {
  return <fieldset><legend>{label}</legend>{value.map((field,index)=><div className={styles.notice} key={index}>
    <label>識別名<input value={field.name} onChange={e=>change(value.map((f,i)=>i===index?{...f,name:e.target.value}:f))} placeholder="input"/></label>
    <label>利用者向けの説明<input value={field.label} onChange={e=>change(value.map((f,i)=>i===index?{...f,label:e.target.value}:f))}/></label>
    <label>種類<select value={field.type} onChange={e=>change(value.map((f,i)=>i===index?{...f,type:e.target.value as PublicationField['type']}:f))}><option value="string">文章</option><option value="number">数値</option><option value="integer">整数</option><option value="boolean">はい・いいえ</option></select></label>
    <label className={styles.check}><input type="checkbox" checked={field.required} onChange={e=>change(value.map((f,i)=>i===index?{...f,required:e.target.checked}:f))}/>必須項目</label>
    <button type="button" onClick={()=>change(value.filter((_,i)=>i!==index))}>この項目を削除</button>
  </div>)}<button type="button" disabled={value.length>=24} onClick={()=>change([...value,{name:'',label:'',type:'string',required:true}])}>項目を追加</button></fieldset>;
}
export default function NoahPublicationForm({upload,ownerScope,disabled,onDirty,onBuild,fixedUpload=false}:{upload?:NoahUpload;fixedUpload?:boolean;ownerScope:string;disabled:boolean;onDirty:()=>void;onBuild:(code:string)=>void}) {
  const terminal = Boolean(upload?.source && upload.manifest.runtime);
  const mcp = upload?.manifest.adapter === 'mcp_http';
  const [name,setName]=useState(upload?.manifest.name||''),[summary,setSummary]=useState(upload?.manifest.summary||''),[author,setAuthor]=useState(upload?.manifest.author||''),[license,setLicense]=useState(upload?.manifest.license||'');
  const [version,setVersion]=useState(upload?.manifest.version||'0.1.0'),[id,setId]=useState(''),[kind,setKind]=useState<SkyToolSourceKind>(upload?.source?'inline_code':mcp?'mcp':'github'),[source,setSource]=useState(upload?.manifest.sourceUrl || (mcp && upload?.manifest.endpointUrl) || '');
  const [connection,setConnection]=useState<SkyConnectionType|''>(terminal?'rock_recipe':mcp?'mcp_streamable_http':''),[endpoint,setEndpoint]=useState(upload?.manifest.endpointUrl||''),[connectivity,setConnectivity]=useState<'online'|'offline'|'hybrid'>(terminal?'offline':'online');
  const [targets,setTargets]=useState<SkyExecutionTarget[]>([terminal?'device_local':'pc']),[permissions,setPermissions]=useState<SkyPermission[]>(terminal?['read_user_input','write_results']:['read_user_input','write_results','network']);
  const [effects,setEffects]=useState<('local_write'|'external_write'|'financial')[]>(terminal?['local_write']:[]),[pricing,setPricing]=useState<SkyPricing>('free'),[priceNote,setPriceNote]=useState(upload?.manifest.priceNote || ''),[timeout,setTimeoutValue]=useState(terminal?240:30);
  const [input,setInput]=useState<PublicationField[]>([{name:terminal?'prompt':'input',label:'依頼内容',type:'string',required:true}]),[output,setOutput]=useState<PublicationField[]>([{name:terminal?'text':'result',label:'結果',type:'string',required:true}]);
  const [success,setSuccess]=useState(''),[valid,setValid]=useState(''),[invalid,setInvalid]=useState(''),[error,setError]=useState('');
  const stableId=useRef('');
  const [guide, setGuide] = useState('');
  const change=<T,>(setter:(v:T)=>void,value:T)=>{setter(value);setError('');onDirty();};
  function build(){try{
    if(!connection)throw new Error('実際のAgentに合う接続方式を選択してください。');
    stableId.current ||= noahPublicationAgentId(ownerScope, upload?.id || crypto.randomUUID());
    const selectedId=id.trim()||stableId.current;
    const manifest=packageFromPublicationForm({id:selectedId,version,name,summary,developerName:author,developerId:`noah-${ownerScope.replace('owner-v1:','').slice(0,16)}`,license,
      sourceKind:upload?.source?'inline_code':kind,sourceUrl:source,fileName:upload?.source?.name,connectionType:connection,endpointUrl:endpoint,connectivity,targets,permissions,sideEffects:effects,
      pricing,priceNote,timeoutSeconds:timeout,input,output,successCondition:success,validTest:valid,invalidTest:invalid,guideMarkdown:guide});
    setId(selectedId);onBuild(JSON.stringify(manifest,null,2));setError('');
  }catch(e){setError(e instanceof Error?e.message:'入力を確認してください。');}}
  return <fieldset className={styles.fields} disabled={disabled}>
    {upload?.manifest.guideMarkdown && <button type="button" onClick={() => change(setGuide, upload.manifest.guideMarkdown!)}>登録したガイドを公開仕様にコピー</button>}
    <NoahGuideEditor publication value={guide} onChange={text => change(setGuide, text)} />
    {terminal&&<p>登録した画面なしテンプレートの実行設定を配布版へ固定します。利用者はNoahから接続・依頼でき、本人の画面を使いません。外部通信やアカウント操作はこの実行方式では利用できません。</p>}
    <label>Agent名<input value={name} onChange={e=>change(setName,e.target.value)} maxLength={80}/></label>
    <label>任せられる仕事<textarea value={summary} onChange={e=>change(setSummary,e.target.value)} minLength={20} maxLength={600}/><small>何を入力すると、どんな成果を返すかを20文字以上で説明してください。</small></label>
    <label>提供者名<input value={author} onChange={e=>change(setAuthor,e.target.value)}/></label><label>ライセンス<input value={license} onChange={e=>change(setLicense,e.target.value)} placeholder="確認済みのライセンス名"/></label>
    {!upload?.source&&<><label>ソースの種類<select value={kind} onChange={e=>change(setKind,e.target.value as SkyToolSourceKind)}><option value="github">GitHubなどの公開リポジトリ</option><option value="mcp">MCPの接続仕様</option><option value="openapi">OpenAPI</option><option value="rock_package">端末用の配布物</option></select></label><label>公開ソース・仕様のURL<input type="url" value={source} onChange={e=>change(setSource,e.target.value)}/></label></>}
    <fieldset disabled={terminal}><legend>配布版の実行契約</legend>
    <label>接続方式<select value={connection} onChange={e=>change(setConnection,e.target.value as SkyConnectionType|'')}><option value="">実装に合う方式を選択</option><option value="mcp_stdio">PC上のMCPサーバー</option><option value="mcp_streamable_http">HTTPのMCPサーバー</option><option value="https_api">HTTPS API</option><option value="rock_recipe">端末内のRock recipe</option></select></label>
    <p>選択は接続仕様の宣言です。保存したコードをMCPやAPIへ自動変換する操作ではありません。</p>
    <label>実行先のURL<input type="url" value={endpoint} onChange={e=>change(setEndpoint,e.target.value)} placeholder="HTTP接続のときに入力"/></label>
    <label>通信<select value={connectivity} onChange={e=>change(setConnectivity,e.target.value as typeof connectivity)}><option value="online">ネットワークを使う</option><option value="offline">ネットワークを使わない</option><option value="hybrid">処理によって使う</option></select></label>
    <fieldset><legend>対応する実行場所</legend>{(['device_local','pc','cloud'] as const).map(target=><label key={target} className={styles.check}><input type="checkbox" checked={targets.includes(target)} onChange={e=>change(setTargets,e.target.checked?[...targets,target]:targets.filter(v=>v!==target))}/>{{device_local:'端末内',pc:'接続したPC',cloud:'クラウド'}[target]}</label>)}</fieldset>
    <fieldset><legend>必要な権限</legend>{SKY_PERMISSIONS.map(p=><label key={p} className={styles.check}><input type="checkbox" checked={permissions.includes(p)} onChange={e=>change(setPermissions,e.target.checked?[...permissions,p]:permissions.filter(v=>v!==p))}/>{permissionLabels[p]}</label>)}</fieldset>
    <fieldset><legend>実行による変更</legend>{(['local_write','external_write','financial'] as const).map(p=><label key={p} className={styles.check}><input type="checkbox" checked={effects.includes(p)} onChange={e=>change(setEffects,e.target.checked?[...effects,p]:effects.filter(v=>v!==p))}/>{{local_write:'端末のファイルを変更',external_write:'外部サービスを変更・送信',financial:'資金に関わる操作'}[p]}</label>)}<small>実行ごとに利用者の確認を求める仕様で登録します。</small></fieldset>
    <Fields label="利用者から受け取る項目" value={input} change={v=>change(setInput,v)}/><Fields label="返す成果の項目" value={output} change={v=>change(setOutput,v)}/>
    </fieldset>
    <label>料金方式<select value={pricing} onChange={e=>change(setPricing,e.target.value as SkyPricing)}><option value="free">無料</option><option value="external_contract">買い切り・外部契約</option><option value="usage">従量</option><option value="subscription">定額</option></select></label>
    <label>料金・外部実費の説明<textarea value={priceNote} onChange={e=>change(setPriceNote,e.target.value)}/><small>買い切りの金額と販売条件は、審査後に販売管理で設定します。定額・従量の市場決済は準備中です。</small></label>
    <label>処理の制限時間（秒）<input type="number" min={1} max={86400} value={timeout} onChange={e=>change(setTimeoutValue,Number(e.target.value))}/></label>
    <label>成果を合格とする条件<textarea value={success} onChange={e=>change(setSuccess,e.target.value)} placeholder="入力に対して、どんな結果なら正しいか"/></label>
    <label>正常な入力で確認する試験<input value={valid} onChange={e=>change(setValid,e.target.value)}/></label>
    <label>不正な入力で確認する試験<input value={invalid} onChange={e=>change(setInvalid,e.target.value)}/></label>
    <p>試験の記載だけでは合格になりません。実際の結果を確認してから審査に提出してください。</p>
    <label>公開する版<input value={version} onChange={e=>change(setVersion,e.target.value)} placeholder="1.0.0"/></label>
    {!fixedUpload && <details><summary>識別名を指定する</summary><label>同じAgentの更新では同じ識別名を使用<input value={id} onChange={e=>change(setId,e.target.value)} placeholder="新しいAgentは自動で作成"/></label></details>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <button type="button" onClick={build}>入力内容から公開仕様を確認</button>
  </fieldset>;
}
