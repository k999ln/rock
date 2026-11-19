import { OWNER_SCOPE_HEADER } from './owner-intent';
export { bundleUploadTest } from './noah-upload-bundle';
import type { ProcessingReference } from './noah-processing-receipt';
type Processing = { id: string; state: string; message?: string; receipt?: ProcessingReference };
const labels: Record<string, string> = { queued: '原本を確認中…', validating_original: '変更前の固定テストを確認中…', preparing: '整理担当Agentを準備中…', refactoring: 'Agentがコードを整理中…', validating_candidate: '変更後の固定テストを確認中…' };
export async function processUpload(file: File, id: string, scope: string, onProgress: (text: string) => void, signal: AbortSignal) {
  const headers = { 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: scope };
  async function api(path: string, body?: unknown) {
    const r = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal, cache: 'no-store' });
    const data = await r.json() as { ownerScope: string; processing: Processing; error?: string };
    if (!r.ok) throw new Error(data.error || 'コードの整理状況を取得できません。');
    if (data.ownerScope !== scope) throw new Error('アカウントが変わりました。原本を保持して中止しました。');
    return data.processing;
  }
  const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  try {
    let state = await api('/__noah/upload-refactor', { id, name: file.name, base64: btoa(binary), rightsConfirmed: true });
    const deadline = Date.now() + 11 * 60 * 1000;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      onProgress(labels[state.state] || state.message || '結果を確認中…');
      if (state.state === 'complete' && state.receipt) return state.receipt;
      if (['failed', 'cancelled'].includes(state.state)) throw new Error(state.message || '整理を完了できませんでした。');
      await new Promise<void>((resolve, reject) => { const done = () => { signal.removeEventListener('abort', abort); resolve(); }; const timer = setTimeout(done, 1000); const abort = () => { clearTimeout(timer); reject(signal.reason); }; signal.addEventListener('abort', abort, { once: true }); });
      state = await api(`/__noah/upload-refactor/${id}`);
    }
    throw new Error('整理結果が時間内に届きませんでした。原本を保持しています。');
  } catch (e) {
    await fetch(`/__noah/upload-refactor/${id}/stop`, { method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(15000) }).catch(() => {});
    throw e;
  }
}
