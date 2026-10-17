/* global RegisterCommand, SetNuiFocus, SendNuiMessage, RegisterNuiCallbackType, on, onNet, emitNet, GetCurrentResourceName */
const pending = new Map();
let sequence = 0;
RegisterCommand('rockos', () => {
  SetNuiFocus(true, true);
  SendNuiMessage(JSON.stringify({ type: 'rockstar:open' }));
}, false);
RegisterNuiCallbackType('bridge');
on('__cfx_nui:bridge', (data, cb) => {
  if (data?.action === 'close') { SetNuiFocus(false, false); cb({ ok: true }); return; }
  if (!['state', 'command'].includes(data?.action) || pending.size >= 2) { cb({ error: '未対応の操作、または処理中です。', status: 400 }); return; }
  const id = String(++sequence);
  const timer = setTimeout(() => { pending.delete(id); cb({ error: '応答不明。同じ操作で再照会してください。', status: 504 }); }, 6500);
  pending.set(id, { cb, timer });
  emitNet('rockstar:request', id, data.action, data.payload);
});
onNet('rockstar:response', (id, data) => {
  const item = pending.get(id);
  if (!item) return;
  clearTimeout(item.timer); pending.delete(id); item.cb(data);
});
on('onResourceStop', name => {
  if (name !== GetCurrentResourceName()) return;
  SetNuiFocus(false, false);
  for (const item of pending.values()) { clearTimeout(item.timer); item.cb({ error: '停止しました。', status: 503 }); }
  pending.clear();
});
