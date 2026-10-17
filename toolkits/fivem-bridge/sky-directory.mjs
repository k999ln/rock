// Read only. Credentials stay on the gateway and are never sent to an Agent origin or NUI.
export function skyDirectory({origin='',token='',fetchImpl=fetch}={}) {
  let cached; let checkedAt=0;
  return async () => {
    if(!origin || !token) return {status:'not_configured',agents:[],message:'Sky本人接続が未設定。外部Agentは未接続です。'};
    try {
      const url=new URL(origin);
      if(url.protocol!=='https:' || url.origin!==origin || url.username || url.password || !token.startsWith('rock_session_')) throw new Error('config');
      if(cached && Date.now()-checkedAt<30000) return cached;
      const response=await fetchImpl(`${origin}/api/sky/a2a-agents`,{headers:{Authorization:`Bearer ${token}`},redirect:'error',signal:AbortSignal.timeout(5000)});
      if(!response.ok) throw new Error('unavailable');
      const data=await response.json();
      if(!Array.isArray(data.agents) || data.agents.length>100) throw new Error('schema');
      cached={status:'directory_loaded_execution_pending',message:'本人の登録一覧。実行は既存Skyの見積・予算・承認経路で行います。',agents:data.agents.filter(a=>typeof a.id==='string'&&typeof a.agentName==='string').map(a=>({id:a.id,name:a.agentName,version:a.agentVersion,kind:'remote-a2a',executable:false}))};
      checkedAt=Date.now(); return cached;
    } catch { return {status:'unavailable',agents:[],message:'Sky本人認証または接続設定を確認してください。登録済みを実行可能とは扱いません。'}; }
  };
}
