'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { McpPlan } from '@/lib/sky-mcp-plan';
import type { CampusId } from '@/lib/campus';

export default function SkyMcpPlan({ campusId }: { campusId?: CampusId }) {
  const [plan, setPlan] = useState<McpPlan | null>(null);
  const [removing, setRemoving] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState<
    'loading' | 'signin' | 'ready' | 'error'
  >('loading');
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/sky/mcp/plan', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (response.status === 401) {
        setStatus('signin');
        setPlan(null);
        return;
      }
      if (!response.ok) throw new Error();
      setPlan(await response.json());
      setStatus('ready');
    } catch {
      setStatus('error');
      setPlan(null);
    }
  }, []);
  useEffect(() => {
    let active = true;
    const handler = () => {
      if (active) void refresh();
    };
    void Promise.resolve().then(handler);
    window.addEventListener('sky-mcp-plan', handler);
    return () => {
      active = false;
      window.removeEventListener('sky-mcp-plan', handler);
    };
  }, [refresh]);
  async function removeSlot(connectionKey: string) {
    setRemoving(connectionKey);
    setNotice('');
    try {
      const response = await fetch('/api/sky/mcp/plan', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionKey }),
      });
      if (!response.ok) throw new Error();
      setPlan(await response.json());
      setNotice(
        'Smithからの接続を外しました。PCで動いている仕事は停止していません。',
      );
      window.dispatchEvent(new Event('sky-mcp-plan'));
    } catch {
      setNotice('接続を外せたか確認できません。最新の状態を読み直してください。');
    } finally {
      setRemoving('');
    }
  }
  const returnTo = campusId ? `/sky/campus/${campusId}/hub` : '/sky';
  return (
    <div
      aria-label="接続できるツールの数"
      style={{ fontSize: 14, lineHeight: 1.7 }}
    >
      {status === 'loading' && <p>接続の状態を確認しています…</p>}
      {status === 'signin' && (
        <p>
          <Link
            href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`}
          >
            サインインして、無料で接続できる数を確認 ↗
          </Link>
        </p>
      )}
      {status === 'error' && (
        <output>
          接続の状態を確認できませんでした。{' '}
          <button type="button" onClick={() => void refresh()}>
            もう一度確認
          </button>
        </output>
      )}
      {plan && (
        <p>
          <strong>
            {plan.used} / {plan.freeLimit} 件を接続中
          </strong>{' '}
          · {plan.tier === 'campus' ? '大学生向けプラン' : '一般プラン'}
          {plan.used >= plan.freeLimit &&
            ' · 無料で接続できる上限に達しました。有料での追加は準備中です。'}
        </p>
      )}
      {plan && plan.connections.length > 0 && (
        <details>
          <summary>保存した接続を管理</summary>
          <p>
            使わなくなった端末の接続を外すと、新しい接続を追加できます。
            PCで動いている仕事を止める場合は、そのPCで停止してください。
          </p>
          <ul>
            {plan.connections.map((connection) => (
              <li key={connection.connectionKey}>
                {connection.name}{' '}
                <button
                  type="button"
                  disabled={Boolean(removing)}
                  onClick={() => void removeSlot(connection.connectionKey)}
                >
                  {removing === connection.connectionKey
                    ? '接続を外しています…'
                    : 'Smithから外す'}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {notice && <output>{notice}</output>}
      {campusId && plan && plan.tier !== 'campus' && (
        <p>
          <Link href={`/campus?campus=${campusId}&profile=1`}>
            大学生として登録する ↗
          </Link>
          <br />
          <small>
            大学のメールアドレスでサインインしてください。メールの所属先を確認してから、
            接続できる数が増えます。「学生」を選ぶだけでは増えません。
          </small>
        </p>
      )}
    </div>
  );
}
