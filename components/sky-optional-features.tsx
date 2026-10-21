'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway. */
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ChartNoAxesCombined,
  Plus,
  WalletCards,
} from 'lucide-react';
import {
  skyOptionalFeatures,
  type SkyFeatureAddition,
  type SkyFeatureId,
} from '@/lib/sky-feature-additions';
import { useSkyFeatures } from '@/lib/use-sky-features';
import { SkyNotice } from '@/components/sky-feedback';
import WorkspaceShell from '@/components/workspace-shell';
import styles from './sky-optional-features.module.css';

type Feature = (typeof skyOptionalFeatures)[number];
function FeatureCard({
  feature,
  addition,
  ready,
  onChange,
  openAfterAdd = false,
  timeline = false,
}: {
  feature: Feature;
  addition?: SkyFeatureAddition;
  ready: boolean;
  onChange: () => void;
  openAfterAdd?: boolean;
  timeline?: boolean;
}) {
  const [purpose, setPurpose] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const Icon = feature.id === 'wallet' ? WalletCards : ChartNoAxesCombined;
  async function save(enabled: boolean) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/sky/features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: feature.id,
          enabled,
          purpose: purpose || addition?.purpose || feature.initialPurpose,
          revision: addition?.revision ?? 0,
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error || '設定を保存できませんでした。');
      window.dispatchEvent(new Event('sky-features-changed'));
      onChange();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : '設定を保存できませんでした。',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <article
      className={timeline ? styles.feedPost : styles.card}
      data-feature-post={timeline ? feature.id : undefined}
      data-timeline-skin={timeline ? 'x' : undefined}
    >
      <div className={styles.title}>
        <span className={styles.icon}>
          <Icon size={25} />
        </span>
        <div>
          <span>
            {timeline
              ? 'Sky · 機能の紹介'
              : addition?.enabled
                ? 'ADDED TO YOUR OS'
                : 'MAKE IT YOURS'}
          </span>
          <h3>{feature.name}</h3>
        </div>
        {addition?.enabled && <Check size={18} />}
      </div>
      <p>{feature.description}</p>
      <label hidden={timeline && !settingsOpen}>
        どんな使い方をしますか？
        <select
          value={purpose || addition?.purpose || feature.initialPurpose}
          disabled={!ready || busy}
          onChange={(e) => setPurpose(e.target.value)}
        >
          {feature.purposes.map((p) => (
            <option value={p.id} key={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p className={styles.detail}>{feature.detail}</p>
      {error && <SkyNotice className={styles.error} message={error} />}
      <div className={styles.actions}>
        {addition?.enabled ? (
          <>
            <Link className={styles.primary} href={feature.href}>
              {feature.name}を開く <ArrowRight size={16} />
            </Link>
            {purpose && purpose !== addition.purpose && (
              <button disabled={busy} onClick={() => void save(true)}>
                使い道を保存
              </button>
            )}
            <button disabled={busy} onClick={() => setSettingsOpen((v) => !v)}>
              設定
            </button>
            <button
              disabled={busy}
              className={styles.remove}
              onClick={() => void save(false)}
            >
              ホームから外す
            </button>
          </>
        ) : (
          <button
            className={styles.primary}
            disabled={!ready || busy}
            onClick={() => {
              if (timeline && !settingsOpen) setSettingsOpen(true);
              else void save(true);
            }}
          >
            <Plus size={16} />
            {busy
              ? '追加しています…'
              : timeline
                ? settingsOpen
                  ? 'この設定で追加'
                  : '自分のSkyに追加'
                : openAfterAdd
                  ? '追加して開く'
                  : 'Skyから追加する'}
          </button>
        )}
      </div>
      <small>
        {addition?.enabled
          ? 'ホームから外しても、記録・資産・契約は消えません。'
          : '追加だけで課金・送金・取引や金融口座の開設は始まりません。'}
      </small>
    </article>
  );
}
export default function SkyOptionalFeatures({
  only,
  openAfterAdd = false,
  timeline = false,
}: {
  only?: SkyFeatureId;
  openAfterAdd?: boolean;
  timeline?: boolean;
}) {
  const { features, state, refresh } = useSkyFeatures();
  return (
    <section
      className={timeline ? styles.feed : styles.panel}
      id={only ? `optional-feature-${only}` : 'optional-features'}
      aria-label={timeline ? 'Skyの追加機能' : undefined}
      aria-labelledby={timeline ? undefined : 'sky-optional-title'}
    >
      <header hidden={timeline}>
        <div>
          <span>YOUR OS, YOUR CHOICE</span>
          <h2 id="sky-optional-title">必要な機能だけ、あなたのOSに。</h2>
          <p>使い道を選んで追加。詳しい情報は、必要になったときに。</p>
        </div>
      </header>
      {state === 'signed-out' && (
        <p>
          <a
            href="/signin-with-chatgpt?return_to=%2Fsky%23optional-features"
            target="_top"
          >
            サインインして追加する <ArrowRight size={14} />
          </a>
        </p>
      )}
      {state === 'error' && (
        <div>
          <p>追加状態を確認できませんでした。</p>
          <button onClick={() => void refresh()}>もう一度確認</button>
        </div>
      )}
      {state === 'loading' && <output>自分の機能を確認しています…</output>}
      <div className={timeline ? styles.feed : styles.grid}>
        {skyOptionalFeatures
          .filter((f) => !only || f.id === only)
          .map((feature) => (
            <FeatureCard
              key={feature.id}
              feature={feature}
              addition={features.find((f) => f.id === feature.id)}
              ready={state === 'ready'}
              onChange={() => void refresh()}
              openAfterAdd={openAfterAdd}
              timeline={timeline}
            />
          ))}
      </div>
    </section>
  );
}
export function SkyFeatureGate({
  feature,
  children,
}: {
  feature: SkyFeatureId;
  children: ReactNode;
}) {
  const { state, enabled, refresh } = useSkyFeatures();
  if (state === 'ready' && enabled(feature)) return <>{children}</>;
  return (
    <WorkspaceShell title={feature === 'wallet' ? 'Wallet' : 'Market'}>
      <div className={styles.gate}>
        <Link href="/sky#optional-features">Skyの追加機能へ</Link>
        {state === 'error' && (
          <button onClick={() => void refresh()}>追加状態をもう一度確認</button>
        )}
        {state === 'loading' ? (
          <output>追加状態を確認しています…</output>
        ) : (
          <SkyOptionalFeatures only={feature} openAfterAdd />
        )}
      </div>
    </WorkspaceShell>
  );
}
