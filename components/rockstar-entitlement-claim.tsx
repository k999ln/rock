'use client';

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import Link from 'next/link';
import styles from '@/components/sky-commerce.module.css';
import { parseRockstarEntitlementHandoffFragment, parseRockstarEntitlementPackage, type RockstarEntitlementPackage } from '@/lib/rockstar-entitlement-package';
import { operationRequest, OperationRequestError, OperationResponseError } from '@/lib/operations-client';

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

async function readEntitlements() {
  const snapshot = await operationRequest<Snapshot>('/api/rockstar/entitlements');
  if (!Array.isArray(snapshot.entitlements) || typeof snapshot.claimRedemptionAvailable !== 'boolean')
    throw new OperationResponseError('INVALID_RESPONSE');
  return snapshot;
}

const requiresSignIn = (error: unknown) => error instanceof OperationRequestError && error.status === 401;

export function RockstarEntitlementClaim() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<'signin' | 'unavailable' | null>(null);
  const [packageText, setPackageText] = useState('');
  const [handoffBundle, setHandoffBundle] = useState<RockstarEntitlementPackage | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const selectionRevision = useRef(0);

  useEffect(() => () => { selectionRevision.current += 1; }, []);

  const refresh = useCallback(async (keepMessage = false) => {
    setBusy(true);
    try {
      setSnapshot(await readEntitlements());
      setLoadError(null);
      if (!keepMessage) setMessage('最新の利用権を確認しました。下の登録済み一覧を確認してください。');
    } catch (error) {
      setSnapshot(null);
      setLoadError(requiresSignIn(error) ? 'signin' : 'unavailable');
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    let current = true;
    readEntitlements()
      .then((body) => {
        if (!current) return;
        setSnapshot(body); setLoadError(null);
      })
      .catch((error) => { if (current) { setSnapshot(null); setLoadError(requiresSignIn(error) ? 'signin' : 'unavailable'); } });
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
    const revision = selectionRevision.current;
    queueMicrotask(() => {
      if (selectionRevision.current !== revision) return;
      setHandoffBundle(bundle);
      setMessage('購入claim linkを読み込みました。内容を確認してからRockstar IDへの登録を実行してください。');
    });
  }, [snapshot, handoffBundle]);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || importing) return;
    setMessage('');
    const bundle = handoffBundle ?? parseRockstarEntitlementPackage(packageText);
    if (!bundle) {
      setMessage('販売元から受け取った購入データを読み取れません。JSON形式とclaim/codeを確認してください。');
      return;
    }
    setBusy(true);
    try {
      const result = await operationRequest<{ entitlement?: Entitlement & { alreadyClaimed: boolean } }>(
        '/api/rockstar/entitlements', 'POST', bundle);
      if (!result.entitlement || typeof result.entitlement !== 'object' || typeof result.entitlement.alreadyClaimed !== 'boolean')
        throw new OperationResponseError('INVALID_RESPONSE');
      setMessage(result.entitlement.alreadyClaimed ? 'このRockstar IDには登録済みです。' : 'Rockstar IDに利用権を登録しました。');
      setPackageText('');
      setHandoffBundle(null);
      try { window.sessionStorage.removeItem('rockstar-entitlement-handoff'); } catch { /* best-effort cleanup */ }
      await refresh(true);
    } catch (error) {
      if (requiresSignIn(error)) { setSnapshot(null); setLoadError('signin'); }
      else if (error instanceof OperationResponseError) {
        setSnapshot(null); setLoadError('unavailable');
        setMessage('登録結果が不明です。利用権を再確認してから、必要なら同じ購入データで登録を確認してください。');
      } else setMessage(error instanceof Error ? error.message : '購入claimを確認できませんでした。');
    }
    finally { setBusy(false); }
  }

  async function importPackageFile(event: SyntheticEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file || busy) return;
    const revision = ++selectionRevision.current;
    setHandoffBundle(null);
    setPackageText('');
    setImporting(false);
    if (file.size > 16_384) { setMessage('購入データが上限の16 KBを超えています。販売元へ確認してください。'); return; }
    setImporting(true);
    setMessage('購入データを読み込んでいます…');
    try {
      const text = await file.text();
      if (selectionRevision.current !== revision) return;
      if (!parseRockstarEntitlementPackage(text)) {
        setMessage('購入データを読み取れません。販売元が発行したclaim JSONを選んでください。');
        return;
      }
      setPackageText(text);
      setMessage('購入データを読み込みました。Rockstar IDへの登録を実行してください。');
    } catch {
      if (selectionRevision.current === revision) setMessage('購入データを読み取れませんでした。');
    } finally {
      if (selectionRevision.current === revision) setImporting(false);
    }
  }

  return <section className={styles.esimCatalog} aria-labelledby="rockstar-entitlement-title">
    <div className={styles.esimCatalogTitle}>
      <h2 id="rockstar-entitlement-title">購入済みサービス利用権</h2>
      <p>販売元から届いた購入claimをRockstar IDへ登録します。物理SIM/eSIMの回線開通や端末へのOS導入とは別に管理します。</p>
    </div>
    {loadError === 'signin' ? <div className={styles.notice}>
      <p>利用権を確認するにはRockstar IDでサインインしてください。</p>
      <Link href="/signin-with-chatgpt?return_to=%2Fconnect" target="_blank" rel="noopener noreferrer">サインインして続ける</Link>
      <p>別タブでサインイン後、この画面で利用権を再確認してください。読み込んだ購入データはこの画面で保持しています。</p>
      <button type="button" disabled={busy} onClick={() => void refresh()}>利用権を再確認</button>
    </div> : loadError === 'unavailable' ? <div className={styles.error}>
      <output aria-live="polite">{message || '利用権へ接続できません。時間をおいて再確認してください。'}</output>
      <button type="button" disabled={busy} onClick={() => void refresh()}>利用権を再確認</button>
    </div> : !snapshot ?
      <output className={styles.loading}>Rockstar IDを確認しています…</output> : <>
        {snapshot.claimRedemptionAvailable ? <form className={styles.offerForm} onSubmit={submit}>
          <label htmlFor="rockstar-entitlement-package-file">販売元の購入データを選択</label>
          <input id="rockstar-entitlement-package-file" type="file" accept="application/json,.json" disabled={busy} onChange={(event) => void importPackageFile(event)} />
          <p>販売元から受け取った利用開始リンクを開くと、claimを読み込んでURLから削除します。リンクを開いただけでは登録されません。リンクがない場合はJSONファイルを選ぶか、下へデータを貼り付けてください。</p>
          {handoffBundle ? <p className={styles.notice}>購入データを読み込みました（offer: {typeof handoffBundle.claim.offerId === 'string' ? handoffBundle.claim.offerId : '不明'}）。内容と下の登録済み一覧を確認してください。</p> : null}
          <label htmlFor="rockstar-entitlement-package">購入データ（claimとcode）</label>
          <textarea id="rockstar-entitlement-package" value={packageText} disabled={busy} onChange={(event) => {
            selectionRevision.current += 1;
            setImporting(false);
            setHandoffBundle(null);
            setPackageText(event.target.value);
            setMessage('');
          }}
            rows={4} maxLength={16_384} autoComplete="off" spellCheck={false}
            placeholder="販売元が発行したclaimとclaimCodeを含むJSON" />
          <button className={styles.primary} type="submit" disabled={busy || importing || (!handoffBundle && packageText.trim().length === 0)}>
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
