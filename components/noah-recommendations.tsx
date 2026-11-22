'use client';
import { useEffect, useRef, useState } from 'react';
import type { NoahRecommendationSettings, NoahRuntimePreference } from '@/lib/noah-recommendation-policy';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import styles from './noah-timeline.module.css';

type State = { settings: NoahRecommendationSettings; ownerScope: string };
export default function NoahRecommendations() {
  const [state,setState]=useState<State|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0),[notice,setNotice]=useState('');
  const generation=useRef(0),lock=useRef(false);
  useEffect(()=>{
    const controller=new AbortController(),version=++generation.current;
    void (async()=>{ try {
      const r=await fetch('/api/noah/recommendations',{cache:'no-store',signal:controller.signal}),data=await r.json() as State & {error?:string};
      if(!r.ok||!data.settings||!data.ownerScope) throw new Error(data.error||'推薦の設定を確認できません。');
      if(!controller.signal.aborted&&version===generation.current){setState(data);setError('');}
    }catch(e){if(!controller.signal.aborted&&version===generation.current){setState(null);setError(e instanceof Error?e.message:'設定を確認できません。');}}})();
    return ()=>{controller.abort();generation.current=version+1;};
  },[attempt]);
  async function save(patch:Partial<NoahRecommendationSettings>,clearHistory=false){
    if(!state||lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');const version=generation.current;
    try{
      const value={...state.settings,...patch};
      const r=await fetch('/api/noah/recommendations',{method:'PUT',headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:state.ownerScope},body:JSON.stringify({revision:state.settings.revision,historyEnabled:value.historyEnabled,runtime:value.runtime,clearHistory})}),data=await r.json() as State & {error?:string};
      if(version!==generation.current)return;
      if(!r.ok||!data.settings||data.ownerScope!==state.ownerScope) throw new Error(data.error||'アカウントまたは設定が変わりました。読み直してください。');
      setState(data);setNotice(clearHistory?'これまでの履歴を推薦から除外しました。仕事の記録・成果は残ります。':'保存しました。タイムラインを読み直すと反映されます。');
    }catch(e){if(version===generation.current)setError(e instanceof Error?e.message:'保存できません。');}
    finally{lock.current=false;setBusy(false);}
  }
  return <section className={styles.notice} aria-label="利用履歴と実行方法の推薦設定"><h2>自分に合うAgentを見つける</h2>
    <p>おすすめ順が有効なときに使います。推薦は接続の成功や現在の端末の稼働を保証しません。接続状態はAgentの詳細で確認できます。</p>
    {state&&<><label>希望する実行方法<select value={state.settings.runtime} disabled={busy} onChange={e=>void save({runtime:e.target.value as NoahRuntimePreference})}>
      <option value="any">指定しない</option><option value="headless">Macで画面を使わず動く</option><option value="local-model">Macのローカルモデルで動く</option><option value="codex">本人のCodexで動く</option></select></label>
      <p><label><input type="checkbox" checked={state.settings.historyEnabled} disabled={busy} onChange={e=>void save({historyEnabled:e.target.checked})}/>これからの利用履歴をおすすめに使うことに同意する</label></p>
      <p>同意後に開始して成功した仕事から、直近30日・最大500件のAgent IDと公開タグだけを使います。依頼文・成果・私有コードは読みません。現在は公開カタログで確認できるAgentが対象です。</p>
      <button disabled={busy} onClick={()=>void save({},true)}>推薦に使う履歴を消去</button>
      <p>仕事の履歴や成果は削除しません。消去前に始まった仕事は、後から終了しても推薦に戻しません。</p></>}
    {error&&<p role="alert">{error} <button disabled={busy} onClick={()=>setAttempt(n=>n+1)}>設定を読み直す</button></p>}
    {notice&&<output>{notice}</output>}
  </section>;
}
