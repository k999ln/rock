'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ProviderDraft } from '@/lib/provider-draft';
import { operationRequest } from '@/lib/operations-client';
import type { SkyProvider } from '@/lib/sky-connections';

export function useProviderDraft(provider: SkyProvider, defaults: Record<string, string>, active: boolean, autoSave = false) {
  const session = useMemo(() => new ProviderDraft(provider, defaults, operationRequest), [provider, defaults]);
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  useEffect(() => {
    if (!active) return;
    session.activate();
    return session.deactivate;
  }, [session, active]);
  useEffect(() => {
    if (!active || !autoSave || !state.dirty || state.manualSave || state.conflict || state.loading || state.saving || !state.available) return;
    const timer = window.setTimeout(() => void session.save('ready'), 250);
    return () => window.clearTimeout(timer);
  }, [session, active, autoSave, state]);
  return { session, state, disabled: !active || state.loading || state.saving || !state.available };
}
export function ProviderDraftFeedback({ session }: { session: ProviderDraft }) {
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  return <div aria-label="設定の保存状況">
    {state.message && <output>{state.message}</output>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.conflict && <section aria-label="設定の競合">
      <p>入力は保持しています。最新設定を確認してから、保存し直してください。</p>
      {state.latest && <>
        <h4>最新の設定（版 {state.latest.revision}）</h4>
        <p>状態: {state.latest.status}</p>
        <dl>{Object.entries(state.latest.config).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value || '未設定'}</dd></div>)}</dl>
        <button type="button" disabled={state.loading || state.saving} onClick={session.confirmLatest}>最新設定を確認し、入力を残す</button>
      </>}
    </section>}
    <button type="button" disabled={state.loading || state.saving || state.unauthorized} onClick={() => void session.refresh()}>
      {state.conflict ? '最新設定を取得' : '接続情報を再取得'}
    </button>
  </div>;
}
