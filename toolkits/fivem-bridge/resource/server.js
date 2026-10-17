/* global GetConvar, GetPlayerIdentifierByType, onNet, on, emitNet */
// Cfx server scripts use the Node CommonJS loader.
// oxlint-disable-next-line typescript/no-require-imports
const { createHash } = require('node:crypto');
const active = new Set();
const last = new Map();
onNet('rockstar:request', async (requestId, action, payload) => {
  const playerSource = global.source; // Capture before await; never accept a player ID from NUI.
  const identifier = GetPlayerIdentifierByType(playerSource, 'license');
  const allowed = GetConvar('rock_bridge_player', '');
  const token = GetConvar('rock_bridge_token', '');
  const port = Number(GetConvar('rock_bridge_port', '5216'));
  const reply = data => { if (identifier && GetPlayerIdentifierByType(playerSource, 'license') === identifier) emitNet('rockstar:response', playerSource, requestId, data); };
  if (!identifier || identifier !== allowed || token.length < 32 || !Number.isInteger(port) || port < 1024 || port > 65535) { reply({ error: '管理者の本人link設定が必要です。', status: 403 }); return; }
  if (typeof requestId !== 'string' || !/^\d{1,10}$/.test(requestId) || !['state', 'command'].includes(action)) { reply({ error: '入力が不正です。', status: 400 }); return; }
  if (active.has(playerSource) || Date.now() - (last.get(playerSource) ?? 0) < 200) { reply({ error: '処理中です。', status: 429 }); return; }
  if (JSON.stringify(payload ?? {}).length > 16384) { reply({ error: '入力上限です。', status: 413 }); return; }
  active.add(playerSource); last.set(playerSource, Date.now());
  try {
    const response = await fetch(`http://127.0.0.1:${port}/bridge/${action}`, {
      method: action === 'state' ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Rock-Player': createHash('sha256').update(JSON.stringify(identifier)).digest('hex') },
      body: action === 'command' ? JSON.stringify(payload) : undefined,
      signal: AbortSignal.timeout(5000), redirect: 'error',
    });
    const data = await response.json();
    reply(response.ok ? data : { error: data.error, status: response.status });
  } catch { reply({ error: 'RockstarOSに接続できません。同じ操作で再照会してください。', status: 504 }); }
  finally { active.delete(playerSource); }
});
on('playerDropped', () => { active.delete(global.source); last.delete(global.source); });
