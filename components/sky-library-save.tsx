'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CommerceSignIn } from '@/components/sky-commerce';
import { operationRequest } from '@/lib/operations-client';
import styles from '@/components/sky-library.module.css';

export default function SkyLibrarySave({ toolId, returnTo, disabled = false }: { toolId: string; returnTo?: string; disabled?: boolean }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  useEffect(() => {
    let active = true;
    void operationRequest<{ tool: string }[]>('/api/sky/library')
      .then((items) => {
        if (active) setSaved(items.some((item) => item.tool === toolId));
      })
      .catch(() => {
        if (active)
          setError(
            '保存状態を取得できません。サインイン状態を確認してください。',
          );
      });
    return () => {
      active = false;
    };
  }, [toolId, retry]);
  async function toggle() {
    if (disabled || saved === null || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await operationRequest<{ saved: boolean }>(
        '/api/sky/library',
        'PUT',
        { tool: toolId, saved: !saved },
      );
      setSaved(result.saved);
    } catch {
      setError('保存できませんでした。時間をおいて再試行してください。');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className={styles.save} aria-label="ライブラリへの保存">
      <p>
        後で使いたいツールを、Zemaのライブラリに保存できます。実行許可や購入は行いません。
      </p>
      <button disabled={disabled || saved === null || busy} onClick={() => void toggle()}>
        {busy ? '保存中…' : saved ? 'ライブラリから外す' : 'ライブラリに保存'}
      </button>
      {saved && <Link href="/zema/library">Zemaのライブラリを開く →</Link>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <CommerceSignIn
            returnTo={returnTo ?? `/sky/tools/${encodeURIComponent(toolId)}`}
          />{' '}
          <button
            onClick={() => {
              setSaved(null);
              setError('');
              setRetry((value) => value + 1);
            }}
            disabled={busy}
          >
            再読込
          </button>
        </div>
      )}
    </section>
  );
}
