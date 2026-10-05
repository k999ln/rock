'use client';
import { useEffect, useState } from 'react';
import type { SkyOsPolicyResult } from '@/lib/sky-os-policy';
import styles from '@/components/sky-library.module.css';

export default function SkyOsPolicySummary() {
  const [result, setResult] = useState<SkyOsPolicyResult | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/sky/os-policy', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('POLICY_UNAVAILABLE');
        const value = (await response.json()) as SkyOsPolicyResult;
        if (!controller.signal.aborted) setResult(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  const policy = result?.policy;
  return (
    <section className={styles.section} aria-label="OSごとの利用ルール">
      <h2>OSごとの利用ルール</h2>
      {error ? (
        <div role="alert">
          <p>利用ルールを取得できません。</p>
          <button
            onClick={() => {
              setError(false);
              setResult(null);
              setAttempt((value) => value + 1);
            }}
          >
            再読込
          </button>
        </div>
      ) : !result ? (
        <output>利用環境の設定を確認しています…</output>
      ) : !policy ? (
        <p>
          このOSの利用ルールは未設定です。購入商品の共有範囲・保存人数はまだ確定していません。
        </p>
      ) : (
        <>
          <p>
            {policy.label} の設定
            {result.hardwareModel ? ` / ${result.hardwareModel}` : ''}
          </p>
          <dl className={styles.policy}>
            <div>
              <dt>利用者</dt>
              <dd>
                {
                  {
                    account: 'サインインしたアカウントごと',
                    single: '1人用',
                    multiple: '複数人のプロフィールを切替',
                  }[policy.profiles]
                }
              </dd>
            </div>
            <div>
              <dt>購入商品の共有範囲</dt>
              <dd>
                {
                  {
                    buyer: '購入者本人',
                    device_profiles: 'この端末のプロフィール間',
                    per_product: '商品ごとの利用条件に従う',
                  }[policy.purchaseSharing]
                }
              </dd>
            </div>
            <div>
              <dt>端末内に保存できる人数</dt>
              <dd>
                {policy.savedProfileLimit === null
                  ? '未設定'
                  : `${policy.savedProfileLimit}人`}
              </dd>
            </div>
          </dl>
          <p>
            利用者ごとにセーブデータを分け、保存人数はOS・機種の設定で決める方針です。端末でのプロフィール切替・購入商品の共有は、OS側との接続が完了してから利用できます。
          </p>
        </>
      )}
    </section>
  );
}
