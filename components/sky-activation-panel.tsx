'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';

type PackageItem = {
  packageKey: string;
  manifest: { name: string; summary: string; version: string };
  status: string;
};

export default function SkyActivationPanel() {
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [packageKey, setPackageKey] = useState('');
  const [label, setLabel] = useState('Telegram用');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresAt, setExpiresAt] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/sky/tool-packages', { cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as { packages?: PackageItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || 'Tool一覧を読み込めませんでした。');
        const available = (data.packages || []).filter((item) =>
          item.status === 'verified',
        );
        setPackages(available);
        setPackageKey(available[0]?.packageKey || '');
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Tool一覧を読み込めませんでした。'))
      .finally(() => setLoading(false));
  }, []);

  async function issue() {
    setError('');
    setCode('');
    setCopied(false);
    setBusy(true);
    try {
      const response = await fetch('/api/sky/access-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageKey,
          label,
          maxUses: Number(maxUses),
          expiresAt: expiresAt || null,
        }),
      });
      const data = (await response.json()) as { code?: { code?: string }; error?: string };
      if (!response.ok) throw new Error(data.error || 'コードを発行できませんでした。');
      setCode(data.code?.code || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'コードを発行できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(`/sky ${code}`);
    setCopied(true);
  }

  return (
    <section className="sky-activation-panel" aria-labelledby="sky-activation-title">
      <div className="sky-activation-heading">
        <div className="sky-activation-icon" aria-hidden="true"><KeyRound size={18} /></div>
        <div>
          <h2 id="sky-activation-title">TelegramでSky Toolを使う</h2>
          <p>発行コードを <code>/sky CODE</code> と送ると、このBotで有効化できます。</p>
        </div>
      </div>
      {loading ? <p className="sky-activation-muted"><LoaderCircle className="spin" size={15} /> Toolを確認中…</p> : null}
      {!loading && !packages.length ? (
        <p className="sky-activation-muted">審査済みToolがありません。<Link href="/sky/publish">Rock Studioで登録</Link>した後、Sky審査を完了してください。</p>
      ) : null}
      {packages.length ? (
        <div className="sky-activation-form">
          <label>Tool<select value={packageKey} onChange={(event) => setPackageKey(event.target.value)}>
            {packages.map((item) => <option key={item.packageKey} value={item.packageKey}>{item.manifest.name} v{item.manifest.version}</option>)}
          </select></label>
          <label>コード名<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} /></label>
          <label>使用回数<input type="number" min="1" max="1000" value={maxUses} onChange={(event) => setMaxUses(event.target.value)} /></label>
          <label>期限（任意）<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
          <button className="rock-button" type="button" onClick={issue} disabled={busy || !packageKey || !label.trim()}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <KeyRound size={16} />} コードを発行
          </button>
        </div>
      ) : null}
      {code ? (
        <div className="sky-activation-result">
          <div><strong>{code}</strong><small>この画面で一度だけ表示。Telegramには下の形式で貼り付け。</small></div>
          <button type="button" onClick={copyCode}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'コピー済み' : 'コピー'}</button>
          <code>/sky {code}</code>
        </div>
      ) : null}
      <p className="sky-activation-note"><ShieldCheck size={15} /> コードは実行権限そのものではなく、登録済みToolへの利用許可です。ソースコード・APIキー・カード情報はTelegramへ貼らないでください。</p>
      {error ? <p className="sky-activation-error">{error}</p> : null}
    </section>
  );
}
