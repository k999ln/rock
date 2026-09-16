const actions = [
  ['lock_device', '端末をロック', '画面を即時ロック'],
  ['enter_lost_mode', '紛失モード', '端末を保護状態へ'],
  ['stop_sky_and_zema_execution', 'Sky / Zemaを停止', '新規実行と承認を止める'],
  ['revoke_active_sessions', 'セッション失効', '接続済み認証を無効化'],
  ['pause_ota_installation', 'OTAを一時停止', '更新適用を止める'],
  ['quarantine_external_connections', '通信を隔離', '外部接続を制限'],
  ['collect_sanitized_diagnostics', '診断を取得', '私的内容を除く'],
  ['open_limited_maintenance_session', '15分保守接続', '許可済み操作だけ'],
  ['resume_sky_and_zema_execution', 'Sky / Zemaを再開', '停止した実行環境を戻す'],
  ['resume_ota_installation', 'OTAを再開', '更新方針を通常へ戻す'],
  ['release_external_quarantine', '通信隔離を解除', '許可済み接続を戻す'],
  ['close_limited_maintenance_session', '保守接続を終了', '保守表示を直ちに閉じる'],
  ['exit_lost_mode', '紛失モードを解除', '本人の端末解除は別途必要'],
  ['request_factory_reset', '初期化を予約', '30分の取消猶予'],
];

const statusLabels = {
  queued: '送信待ち',
  scheduled: '取消猶予中',
  acknowledged: '端末が受領',
  completed: '完了',
  failed: '失敗',
  cancelled: '取消済み',
  expired: '期限切れ',
};

const elements = Object.fromEntries(
  [
    'action-grid',
    'agent-dot',
    'audit-count',
    'command-list',
    'control-plane',
    'device-agent',
    'device-count',
    'device-empty',
    'device-list',
    'error',
    'error-text',
    'history-empty',
    'incident-id',
    'message',
    'reason',
    'refresh',
    'selected-device',
  ].map((id) => [id, document.getElementById(id)]),
);

let snapshot = null;
let selectedId = '';
let busy = false;

function showError(message) {
  elements['error-text'].textContent = message;
  elements.error.hidden = false;
}

function clearNotices() {
  elements.error.hidden = true;
  elements.message.hidden = true;
}

function showMessage(message) {
  elements.message.textContent = message;
  elements.message.hidden = false;
}

async function api(options = {}) {
  const response = await fetch('/api/devices', {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
    ...options,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || '管理機能を読み込めません。');
  return data;
}

function base64UrlBytes(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64Url(value) {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function signPreparedCommand(request) {
  if (!window.PublicKeyCredential || !navigator.credentials)
    throw new Error('hardware credentialに対応したブラウザが必要です。');
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: base64UrlBytes(request.challenge),
      allowCredentials: [{
        id: base64UrlBytes(request.credentialId),
        type: 'public-key',
      }],
      rpId: request.rpId,
      timeout: request.timeout,
      userVerification: request.userVerification,
    },
  });
  if (!(credential instanceof PublicKeyCredential) ||
      !(credential.response instanceof AuthenticatorAssertionResponse))
    throw new Error('hardware credentialで命令を確認できませんでした。');
  return {
    credentialId: base64Url(credential.rawId),
    authenticatorData: base64Url(credential.response.authenticatorData),
    clientDataJSON: base64Url(credential.response.clientDataJSON),
    signature: base64Url(credential.response.signature),
  };
}

function buttonText(button, title, note) {
  const titleNode = document.createElement('strong');
  const noteNode = document.createElement('small');
  titleNode.textContent = title;
  noteNode.textContent = note;
  button.replaceChildren(titleNode, noteNode);
}

function renderActions() {
  const canIssue =
    Boolean(selectedId) &&
    elements['incident-id'].value.trim().length >= 3 &&
    elements.reason.value.trim().length >= 5 &&
    !busy;
  elements['action-grid'].replaceChildren(
    ...actions.map(([id, label, note]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = id === 'request_factory_reset' ? 'action danger' : 'action';
      button.disabled = !canIssue;
      buttonText(button, label, note);
      button.addEventListener('click', () => void issue(id));
      return button;
    }),
  );
}

function renderDevices() {
  const devices = snapshot?.devices || [];
  elements['device-count'].textContent = String(devices.length);
  elements['device-empty'].hidden = devices.length > 0;
  elements['device-list'].replaceChildren(
    ...devices.map((device) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = device.id === selectedId ? 'device active' : 'device';
      button.setAttribute('aria-pressed', String(device.id === selectedId));
      const icon = document.createElement('span');
      icon.className = 'device-icon';
      icon.textContent = '▣';
      const copy = document.createElement('span');
      const name = document.createElement('strong');
      const detail = document.createElement('small');
      name.textContent = device.displayName;
      detail.textContent = `${device.model} · ${device.osVersion}`;
      copy.append(name, detail);
      const state = document.createElement('em');
      state.dataset.online = String(device.online);
      state.textContent = device.online ? 'ONLINE' : 'OFFLINE';
      button.append(icon, copy, state);
      button.addEventListener('click', () => {
        selectedId = device.id;
        render();
      });
      return button;
    }),
  );
}

function renderCommands() {
  const commands = (snapshot?.commands || []).filter(
    (command) => command.deviceId === selectedId,
  );
  elements['history-empty'].hidden = commands.length > 0;
  elements['command-list'].replaceChildren(
    ...commands.map((command) => {
      const row = document.createElement('tr');
      const action = document.createElement('td');
      const incident = document.createElement('td');
      const status = document.createElement('td');
      const issued = document.createElement('td');
      const cancelCell = document.createElement('td');
      action.textContent = actions.find(([id]) => id === command.action)?.[1] || command.action;
      incident.textContent = command.incidentId;
      const badge = document.createElement('span');
      badge.className = 'state';
      badge.textContent = statusLabels[command.status] || command.status;
      status.append(badge);
      issued.textContent = new Date(command.issuedAt).toLocaleString('ja-JP');
      if (['queued', 'scheduled'].includes(command.status)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '取消';
        button.disabled = busy;
        button.addEventListener('click', () => void cancel(command));
        cancelCell.append(button);
      } else {
        cancelCell.textContent = '—';
      }
      row.append(action, incident, status, issued, cancelCell);
      return row;
    }),
  );
}

function render() {
  const selected = snapshot?.devices.find((device) => device.id === selectedId);
  elements['control-plane'].textContent = snapshot ? '利用可能' : '確認中';
  elements['device-agent'].textContent =
    snapshot?.deviceAgent === 'ready'
      ? '接続可能'
      : snapshot?.deviceAgent === 'source_emulator_verified_production_enrollment_pending'
        ? '開発検証済み・本番登録待ち'
        : '配信停止中';
  elements['agent-dot'].className =
    snapshot?.deviceAgent === 'ready' ? 'metric-dot ready' : 'metric-dot waiting';
  elements['audit-count'].textContent = `${snapshot?.audit.length || 0}件`;
  elements['selected-device'].textContent = selected
    ? `${selected.displayName} / ${selected.model} / trust: ${selected.trustState}`
    : '端末を選択してください';
  elements.refresh.disabled = busy;
  renderDevices();
  renderActions();
  renderCommands();
}

async function refresh() {
  clearNotices();
  try {
    snapshot = await api();
    if (!snapshot.devices.some((device) => device.id === selectedId))
      selectedId = snapshot.devices[0]?.id || '';
    render();
  } catch (error) {
    snapshot = null;
    showError(error instanceof Error ? error.message : '管理機能を読み込めません。');
    render();
  }
}

async function issue(action) {
  busy = true;
  clearNotices();
  render();
  try {
    const prepared = await api({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'prepare',
        id: crypto.randomUUID(),
        deviceId: selectedId,
        incidentId: elements['incident-id'].value,
        action,
        reason: elements.reason.value,
      }),
    });
    const assertion = await signPreparedCommand(prepared.publicKeyRequest);
    await api({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'issue', ...prepared.draft, assertion }),
    });
    showMessage(
      snapshot?.deviceAgent === 'ready'
        ? '端末へ命令を送信しました。'
        : '命令を保存しました。本番端末の登録・認証完了後に配信されます。',
    );
    snapshot = await api();
  } catch (error) {
    showError(error instanceof Error ? error.message : '命令を保存できません。');
  } finally {
    busy = false;
    render();
  }
}

async function cancel(command) {
  busy = true;
  clearNotices();
  render();
  try {
    await api({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'cancel',
        id: command.id,
        incidentId: command.incidentId,
      }),
    });
    showMessage('未受領の命令を取り消しました。');
    snapshot = await api();
  } catch (error) {
    showError(error instanceof Error ? error.message : '取り消せませんでした。');
  } finally {
    busy = false;
    render();
  }
}

elements.refresh.addEventListener('click', () => void refresh());
elements['incident-id'].addEventListener('input', renderActions);
elements.reason.addEventListener('input', renderActions);
renderActions();
void refresh();
