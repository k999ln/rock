'use client';

import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import styles from '@/components/sky-commerce.module.css';
import { parseRockstarEntitlementHandoffFragment, parseRockstarEntitlementPackage, type RockstarEntitlementPackage } from '@/lib/rockstar-entitlement-package';

type Entitlement = {
  issuerId: string;
  claimId: string;
  offerId: string;
  formFactor: string;
  scopes: string[];
  status: string;
  claimedAt: number;
  expiresAt: number | null;
  serviceProfile: null | {
    state: 'ready' | 'review_required' | 'not_configured' | 'catalog_unavailable';
    profileId: string | null;
    version: string | null;
    label: string | null;
    activation: 'owner_choice_required';
    packageCount: number;
    packages: Array<{ packageKey: string; name: string | null; state: 'ready' | 'unavailable' }>;
  };
};

type Snapshot = { entitlements: Entitlement[]; claimRedemptionAvailable: boolean };

export function RockstarEntitlementClaim() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<'signin' | 'unavailable' | null>(null);
  const [packageText, setPackageText] = useState('');
  const [handoffBundle, setHandoffBundle] = useState<RockstarEntitlementPackage | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/rockstar/entitlements', { cache: 'no-store' });
      if (response.status === 401) { setLoadError('signin'); return; }
      if (!response.ok) throw new Error('unavailable');
      setSnapshot(await response.json() as Snapshot);
      setLoadError(null);
    } catch { setLoadError('unavailable'); }
  }, []);

  useEffect(() => {
    let current = true;
    fetch('/api/rockstar/entitlements', { cache: 'no-store' })
      .then(async (response) => ({ response, body: await response.json() as Snapshot & { error?: string } }))
      .then(({ response, body }) => {
        if (!current) return;
        if (response.status === 401) setLoadError('signin');
        else if (!response.ok) setLoadError('unavailable');
        else { setSnapshot(body); setLoadError(null); }
      })
      .catch(() => { if (current) setLoadError('unavailable'); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    const bundle = parseRockstarEntitlementHandoffFragment(window.location.hash);
    if (!bundle) return;
    try { window.sessionStorage.setItem('rockstar-entitlement-handoff', JSON.stringify(bundle)); } catch { /* keep URL for a later retry if this browser cannot persist the same-tab handoff */ return; }
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    if (!snapshot || handoffBundle) return;
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem('rockstar-entitlement-handoff');
      if (raw) window.sessionStorage.removeItem('rockstar-entitlement-handoff');
    } catch { return; }
    const bundle = raw ? parseRockstarEntitlementPackage(raw) : null;
    if (!bundle) return;
    queueMicrotask(() => {
      setHandoffBundle(bundle);
      setMessage('購入claim linkを読み込みました。内容を確認してからRockstar IDへの登録を実行してください。');
    });
  }, [snapshot, handoffBundle]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    const bundle = handoffBundle ?? parseRockstarEntitlementPackage(packageText);
    if (!bundle) {
      setMessage('販売元から受け取った購入データを読み取れません。JSON形式とclaim/codeを確認してください。');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/rockstar/entitlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle),
      });
      const result = await response.json() as { entitlement?: Entitlement & { alreadyClaimed: boolean }; error?: string };
      if (!response.ok || !result.entitlement) {
        setMessage(result.error || '購入claimを確認できませんでした。');
        return;
      }
      setMessage(result.entitlement.alreadyClaimed ? 'このRockstar IDには登録済みです。' : 'Rockstar IDに利用権を登録しました。');
      setPackageText('');
      setHandoffBundle(null);
      try { window.sessionStorage.removeItem('rockstar-entitlement-handoff'); } catch { /* best-effort cleanup */ }
      await refresh();
    } catch { setMessage('接続できません。再接続後に同じ購入データを再送できます。'); }
    finally { setBusy(false); }
  }

  async function importPackageFile(event: SyntheticEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 16_384) { setMessage('購入データが上限の16 KBを超えています。販売元へ確認してください。'); return; }
    try {
      const text = await file.text();
      if (!parseRockstarEntitlementPackage(text)) {
        setMessage('購入データを読み取れません。販売元が発行したclaim JSONを選んでください。');
        return;
      }
      setPackageText(text);
      setMessage('購入データを読み込みました。Rockstar IDへの登録を実行してください。');
    } catch {
      setMessage('購入データを読み取れませんでした。');
    }
  }

  return <section className={styles.esimCatalog} aria-labelledby="rockstar-entitlement-title">
    <div className={styles.esimCatalogTitle}>
      <h2 id="rockstar-entitlement-title">購入済みサービス利用権</h2>
      <p>販売元から届いた購入claimをRockstar IDへ登録します。物理SIM/eSIMの回線開通や端末へのOS導入とは別に管理します。</p>
    </div>
    {loadError === 'signin' ? <div className={styles.notice}>
      <p>利用権を確認するにはRockstar IDでサインインしてください。</p>
      <Link href="/signin-with-chatgpt?return_to=%2Fconnect" target="_top">サインインして続ける</Link>
    </div> : loadError === 'unavailable' ? <output className={styles.error}>利用権へ接続できません。時間をおいて再読み込みしてください。</output> : !snapshot ?
      <output className={styles.loading}>Rockstar IDを確認しています…</output> : <>
        {snapshot.claimRedemptionAvailable ? <form className={styles.offerForm} onSubmit={submit}>
          <label htmlFor="rockstar-entitlement-package-file">販売元の購入データを選択</label>
          <input id="rockstar-entitlement-package-file" type="file" accept="application/json,.json" onChange={(event) => void importPackageFile(event)} />
          <p>販売元から受け取った利用開始リンクを開くと、claimを読み込んでURLから削除します。リンクを開いただけでは登録されません。リンクがない場合はJSONファイルを選ぶか、下へデータを貼り付けてください。</p>
          {handoffBundle ? <p className={styles.notice}>購入データを読み込みました（offer: {typeof handoffBundle.claim.offerId === 'string' ? handoffBundle.claim.offerId : '不明'}）。Rockstar IDへの登録はまだ行われていません。</p> : null}
          <label htmlFor="rockstar-entitlement-package">購入データ（claimとcode）</label>
          <textarea id="rockstar-entitlement-package" value={packageText} onChange={(event) => setPackageText(event.target.value)}
            rows={4} maxLength={16_384} autoComplete="off" spellCheck={false}
            placeholder="販売元が発行したclaimとclaimCodeを含むJSON" />
          <button className={styles.primary} type="submit" disabled={busy || (!handoffBundle && packageText.trim().length === 0)}>
            {busy ? '購入を確認中…' : 'このRockstar IDに登録'}
          </button>
          <output className={message ? styles.notice : styles.subtle} aria-live="polite">
            {message || '登録した利用権は、同じclaimを使って別のアカウントへ移せません。'}
          </output>
        </form> : <p className={styles.notice}>販売元との契約・署名鍵の設定後に、ここから購入claimを登録できます。</p>}
        {snapshot.entitlements.length > 0 ? <ul aria-label="登録済み利用権">
          {snapshot.entitlements.map((entitlement) => <li key={`${entitlement.issuerId}:${entitlement.claimId}`}>
            <strong>{entitlement.offerId}</strong> — {entitlement.scopes.join('・')} — {entitlement.status}
            {entitlement.status === 'active' && entitlement.serviceProfile?.state === 'ready' ? <div>
              <strong>この購入に含まれる初期Agent構成: {entitlement.serviceProfile.label} {entitlement.serviceProfile.version}</strong>
              <ul>{entitlement.serviceProfile.packages.map((item) => <li key={item.packageKey}>
                {item.name ?? item.packageKey} — 確認済みPackage。端末での導入・実行は利用者の確認後です。
                {item.state === 'ready' ? <> <Link href={`/sky/marketplace?package=${encodeURIComponent(item.packageKey)}`} target="_top">Skyで開く</Link></> : null}
              </li>)}</ul>
            </div> : null}
            {entitlement.status === 'active' && entitlement.serviceProfile?.state === 'review_required' ?
              <p>初期Agent構成の一部はPackageの現在のレビュー状態を確認できません。未確認のPackageは導入しません。</p> : null}
            {entitlement.status === 'active' && entitlement.serviceProfile &&
              ['not_configured', 'catalog_unavailable'].includes(entitlement.serviceProfile.state) ?
              <p>この販売offerの初期Agent構成はまだ設定されていません。追加のAgentは<Link href="/sky" target="_top">Sky Marketplace</Link>から選べます。</p> : null}
          </li>)}
        </ul> : <p className={styles.subtle}>このRockstar IDには、まだ購入claimが登録されていません。</p>}
      </>}
  </section>;
}
