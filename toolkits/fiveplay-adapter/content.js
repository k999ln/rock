// Isolated extension world. No game memory, save data, currency or engine code access.
const host=document.createElement('div');host.style.cssText='position:fixed;right:16px;top:16px;z-index:2147483647';
const root=host.attachShadow({mode:'closed'});document.documentElement.append(host);
root.innerHTML=`<style>:host{color:#eee;font:14px system-ui}details{background:#171922;border:1px solid #777;border-radius:12px;padding:12px;width:300px}summary{cursor:pointer}label{display:block;margin-top:8px}input,select,textarea,button{box-sizing:border-box;width:100%;margin-top:6px;padding:8px}pre{white-space:pre-wrap;max-height:220px;overflow:auto}small{display:block;color:#bbc}</style><details><summary>● RockstarOS · 仕事を続ける</summary><small>ゲーム内状態の公式連携ではなく、画面上の仕事端末です。</small><p id="engine"></p><button id="refresh">Macへ接続・成果を更新</button><select id="agents" aria-label="Agent"></select><label>目的<input id="purpose" maxlength="1000"></label><label>素材<textarea id="source" maxlength="8000"></textarea></label><button id="send">現実側へ仕事を依頼</button><pre id="result"></pre><a href="http://127.0.0.1:5217/" target="_blank" rel="noopener noreferrer">現実側で実行・継続</a></details>`;
const $=id=>root.getElementById(id);let pending=null,busy=false;
const show=data=>{
 const selected=$('agents').value;$('agents').replaceChildren();for(const agent of data.agents){const option=document.createElement('option');option.value=agent.id;option.textContent=agent.name;$('agents').append(option);}if(data.agents.some(a=>a.id===selected))$('agents').value=selected;
 $('result').textContent=data.tasks.map(t=>`${t.agentName} / 第${t.round}版 / ${t.status}\n${t.output?.text??'現実側で承認・実行・共有待ち'}`).join('\n\n')||'接続しました。現実側の承認後に実行します。';
};
async function call(action,input){const result=await chrome.runtime.sendMessage({action,input});if(result.error)throw new Error(result.error);show(result.data);}
$('refresh').onclick=()=>call('state').catch(e=>{$('result').textContent=e.message;});
$('send').onclick=async()=>{if(busy)return;busy=true;pending??={id:crypto.randomUUID(),agentId:$('agents').value,objective:$('purpose').value,text:$('source').value};try{await call('request',pending);pending=null;}catch(e){$('result').textContent=`${e.message}\n再押下は同じ依頼IDを照会します。内容を変える場合はページを再読込してください。`;}finally{busy=false;}};
const updateEngineStatus=()=>{const loading=document.getElementById('loading');$('engine').textContent=loading?`ゲーム読込: ${document.getElementById('label')?.textContent??'不明'} ${document.getElementById('pct')?.textContent??''}（起動成功未確認）`:'ゲームの読込画面なし。操作可能か本人確認が必要です。';};
updateEngineStatus();setInterval(updateEngineStatus,3000);
// Keep typing in the terminal out of the game's key/mouse handlers.
for(const name of ['keydown','keyup','mousedown','mouseup','wheel'])host.addEventListener(name,e=>e.stopPropagation());
