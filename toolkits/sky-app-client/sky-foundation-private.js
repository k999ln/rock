// Local-only companion for avocado plan; no hosted deployment or account credentials.
export async function sendPrivatePlannerTask({ taskId, fingerprint, brief, onStatus, onResult }) {
  if (location.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(location.hostname) || !['5173', '5197'].includes(location.port)) throw new Error('ローカルPlanner専用です。');
  const origin = 'http://localhost:3000', endpoint = `${origin}/api/sky/app-lab`;
  const channel = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) => v.toString(16).padStart(2, '0')).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
  const sourceRevision = Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join('');
  const response = await fetch(endpoint, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create', channel, request: { schema: 'sky.app-request/1', appId: 'planner', sourceId: taskId,
      sourceRevision, title: `Planner ${taskId}`, objective: 'プランナーの作業を本人確認前の下書きとして準備する', input: brief } }) });
  if (!response.ok) throw new Error('本人用Skyを開けません。localhost:3000の開発サーバーを確認してください。');
  const initial = await response.json();
  const target = window.open(`${origin}/sky/apps/planner/lab#channel=${channel}`, '_blank');
  if (!target) throw new Error('Skyを開くポップアップを許可してください。');
  onStatus('本人用Skyへ依頼を渡しました。Skyで実行・確認後、「Plannerへ下書きを返す」を選んでください。');
  let busy = false;
  const poll = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      if (Date.now() > initial.expiresAt) throw new Error('本人用Skyの受渡し期限が切れました。');
      const read = await fetch(endpoint, { headers: { 'X-Sky-Lab-Channel': channel }, credentials: 'omit', cache: 'no-store' });
      if (!read.ok) throw new Error('本人用Skyの接続が終了しました。');
      const value = await read.json(), result = value.job?.skyApp?.result;
      if (value.job?.status === 'cancelled') { clearInterval(poll); onStatus('Skyの仕事は停止済みです。Plannerは変更していません。'); return; }
      if (!value.delivered) return;
      clearInterval(poll);
      if (value.job.id !== initial.job.id || value.job.status !== 'completed' || !result || result.sourceId !== taskId || result.sourceRevision !== sourceRevision
        || result.schema !== 'sky.app-result/1' || result.provisional !== true || result.body.length > 1800) throw new Error('PlannerとSkyの仕事が一致しません。');
      onResult({ body: result.body, jobId: value.job.id, revision: value.job.revision });
    } catch (cause) { clearInterval(poll); onStatus(cause.message); }
    finally { busy = false; }
  }, 1000);
  window.addEventListener('pagehide', () => clearInterval(poll), { once: true });
}
