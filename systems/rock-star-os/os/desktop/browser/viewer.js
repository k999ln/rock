// The launcher supplies this session-only display password in a URL fragment.
// Once this wrapper executes, clear it before loading the RFB dependency graph.
let password = '';
let valid = false;
function receiveCredentials() {
  const fragment = new URLSearchParams(location.hash.slice(1));
  password = fragment.get('password') || '';
  const port = fragment.get('port');
  history.replaceState(null, '', location.pathname);
  fragment.delete('password');
  valid = port === '5909' && /^[A-Za-z0-9_-]{8}$/.test(password);
  if (!valid) password = '';
}
receiveCredentials();
const status = document.getElementById('status');
const screen = document.getElementById('screen');
let client;
let RFB;
let loading;
function show(message, state) { status.textContent = message; document.body.dataset.status = state; }
function connect() {
  if (!valid || !password) { show('起動ファイルからOSを開いてください。', 'missing-credentials'); return; }
  if (!RFB) { show('表示部品を読み込んでいます…', 'loading'); return; }
  if (client) client.disconnect();
  show('実OSへ接続しています…', 'connecting');
  const current = new RFB(screen, 'ws://127.0.0.1:5909/', {credentials: {password}});
  client = current;
  current.scaleViewport = true;
  current.resizeSession = false;
  current.background = '#080d18';
  current.addEventListener('connect', () => { if (client === current) show('OSに接続中 · 画面を直接操作できます', 'connected'); });
  current.addEventListener('disconnect', () => { if (client === current) show('接続が終了しました。起動中なら再接続できます。', 'disconnected'); });
  current.addEventListener('securityfailure', () => { if (client === current) show('表示の認証を確認できません。起動ファイルから開き直してください。', 'authentication-failed'); });
}
document.getElementById('reconnect').addEventListener('click', connect);
document.getElementById('fullscreen').addEventListener('click', () => document.documentElement.requestFullscreen?.().catch(() => {}));
window.addEventListener('pagehide', () => { password = ''; if (client) client.disconnect(); });
function start() {
  if (!valid || RFB) { connect(); return; }
  if (loading) return;
  loading = import('./novnc/core/rfb.js').then(module => {
    RFB = module.default;
    connect();
  }).catch(() => {
    password = '';
    show('表示部品を読み込めませんでした。起動ファイルから開き直してください。', 'load-failed');
  });
}
window.addEventListener('hashchange', () => {
  receiveCredentials();
  const previous = client;
  client = null;
  if (previous) previous.disconnect();
  start();
});
start();
