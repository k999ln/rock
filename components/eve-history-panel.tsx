'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeZemaPrivateStorage } from '@/lib/zema-private-storage';
import { EveHistoryClient } from '@/lib/eve-history-client';
import type { EveHistoryItem } from '@/lib/eve-history';
import type { ZemaChatSession } from '@/lib/zema-chat-session';

/** Explicit owner-scoped persistence. Restoring a record never resumes execution. */
export function EveHistoryPanel({ session, disabled, onRestore }: {
  session: ZemaChatSession | null;
  disabled: boolean;
  onRestore: (session: ZemaChatSession) => void;
}) {
  const client = useRef(new EveHistoryClient());
  const [items, setItems] = useState<EveHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState('保存した会話を同じアカウントで読み出せます。');
  const epoch = useRef(0);
  useEffect(() => subscribeZemaPrivateStorage(() => {
    epoch.current++; client.current = new EveHistoryClient(); setItems([]); setCursor(null);
    setStatus('アカウントの接続を確認して履歴を読み直してください。');
  }), []);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  async function run(action: () => Promise<void>) {
    if (busy || disabled) return;
    setBusy(true);
    try { await action(); }
    catch (error) { setStatus(error instanceof Error ? error.message : '履歴を読み書きできません。'); }
    finally { setBusy(false); }
  }
  async function list(more = false) {
    const generation = epoch.current;
    const result = await client.current.list(more ? cursor ?? '' : '');
    if (generation !== epoch.current) return;
    setItems(previous => more ? [...previous, ...result.items] : result.items);
    setCursor(result.cursor);
    setStatus('保存済みの履歴です。開いても仕事は再実行しません。');
  }
  return <details className="eve-history-panel">
    <summary>アカウントに保存した会話</summary>
    <output>{status}</output>
    <label><input type="checkbox" checked={remember} disabled={busy || disabled}
      onChange={event => setRemember(event.target.checked)} />この会話を過去の発言の検索対象に含める</label>
    <button type="button" disabled={busy || disabled || !session} onClick={() => void run(async () => {
      if (!session) return;
      await client.current.save(session, remember);
      await list();
      setStatus('会話を暗号化して保存しました。仕事の実行権限は保存していません。');
    })}>今の会話を保存</button>
    <button type="button" disabled={busy || disabled} onClick={() => void run(() => list())}>保存済み会話を確認</button>
    {items.map(item => <div key={item.session.id}>
      <button type="button" disabled={busy || disabled} onClick={() => void run(async () => {
        const generation = epoch.current;
        const value = await client.current.get(item.session.id);
        if (generation !== epoch.current) return;
        onRestore(value.session);
        setRemember(value.remember);
        setStatus('履歴を開きました。仕事の状態は実行先で確認してください。');
      })}>{item.session.messages.find(message => message.side === 'me')?.text.slice(0, 70) || '保存した会話'}</button>
      <button type="button" disabled={busy || disabled} onClick={() => void run(async () => {
        if (!window.confirm('この会話の保存履歴と検索用記憶を削除しますか？')) return;
        await client.current.get(item.session.id);
        await client.current.remove(item.session.id);
        await list();
        setStatus('保存履歴と検索用記憶を削除しました。');
      })}>削除</button>
    </div>)}
    {cursor && <button type="button" disabled={busy || disabled} onClick={() => void run(() => list(true))}>以前の会話</button>}
  </details>;
}
