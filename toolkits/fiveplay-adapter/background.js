const endpoint='http://127.0.0.1:5217';
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || sender.frameId!==0 || !sender.tab || new URL(sender.url).origin!=='https://fiveplay.lol' || !['state','request'].includes(message?.action)) return;
  void (async()=>{
    const {token}=await chrome.storage.session.get('token');
    if(!token || token.length<32) throw new Error('拡張の設定からMac接続tokenを設定してください。');
    const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
    const get=await fetch(`${endpoint}/bridge/state`,{headers,redirect:'error',signal:AbortSignal.timeout(5000)});
    const state=await get.json(); if(!get.ok) throw new Error(state.error);
    if(message.action==='state') return state;
    // Only user-created work requests. No execute, publish, currency or savegame operations.
    const input=message.input;
    if(!input || typeof input.text!=='string' || input.text.length>8000 || typeof input.objective!=='string' || input.objective.length>1000 || typeof input.agentId!=='string' || !/^[0-9a-f-]{36}$/.test(input.id)) throw new Error('依頼形式が不正です。');
    const key=`request_${sender.tab.id}_${input.id}`;
    const saved=(await chrome.storage.session.get(key))[key];
    if(saved && saved.source!==JSON.stringify(input)) throw new Error('同じ依頼IDの内容が変わりました。');
    const body=saved?.body??JSON.stringify({id:input.id,revision:state.revision,binding:state.binding,action:'agent_request',agentId:input.agentId,objective:input.objective,text:input.text});
    await chrome.storage.session.set({[key]:{source:JSON.stringify(input),body}});
    const response=await fetch(`${endpoint}/bridge/command`,{method:'POST',headers,redirect:'error',signal:AbortSignal.timeout(7000),body});
    const result=await response.json();if(!response.ok) throw new Error(result.error);return result;
  })().then(data=>reply({data})).catch(error=>reply({error:error.message}));
  return true;
});
