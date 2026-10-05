'use client';

import { useRef, useState } from 'react';
import { Check, ExternalLink, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import type { EsimInstallMaterial } from '@/lib/esim-install-material';
import styles from '@/components/sky-commerce.module.css';

type EsimStatus = {
  orderId: string;
  state: string;
  providerProfileBoundToOrder?: boolean;
  deviceInstallState?: 'unverified' | 'verified_installed_enabled';
  esimDeviceEntitlementState?: 'not_connected' | 'active' | 'revoked_or_stale';
  starterPackActivationState?: 'awaiting_install_proof' | 'awaiting_authenticated_device_gateway' | 'active_on_authenticated_device';
  starterPackActivatedAt?: number | null;
  starterAgentPack?: {
    id: string;
    version: string;
    packageCount: number;
    packages: Array<{
      packageKey: string;
      name: string | null;
      summary: string | null;
      reviewState: 'active' | 'unavailable';
    }>;
  };
  installMaterialAvailable?: boolean;
  installMaterialAcknowledged?: boolean;
};

type ApiResult<T> = T & { error?: string };

function safeInstallUrl(value: unknown, host: 'esimsetup.apple.com' | 'esimsetup.android.com') {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const carddata = url.searchParams.get('carddata');
    return url.protocol === 'https:' && url.hostname === host && url.pathname === '/esim_qrcode_provisioning' &&
      !url.username && !url.password && !url.hash && carddata?.startsWith('LPA:1$') ? url.href : null;
  } catch {
    return null;
  }
}

async function esimRequest<T>(orderId: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/esim/orders/${encodeURIComponent(orderId)}/${body ? 'install-material' : 'status'}`, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json() as ApiResult<T>;
  if (!response.ok) {
    const errors: Record<string, string> = {
      esim_not_configured: 'eSIM供給元との接続設定はまだ完了していません。',
      esim_issuance_disabled: '契約前のため、eSIM発行は無効です。',
      install_material_not_ready: '導入情報はまだ準備中です。時間をおいて再確認してください。',
      install_material_acknowledged: '導入情報は消去済みです。',
      order_not_found: 'この注文の状態を確認できません。ログイン中のアカウントをご確認ください。',
      unauthorized: 'eSIM情報の確認にはサインインが必要です。',
    };
    throw new Error(errors[result.error || ''] || 'eSIMの状態を確認できませんでした。時間をおいて再度お試しください。');
  }
  return result;
}

function deliveryRequestId(orderId: string, cache: { current: string | null }) {
  if (cache.current) return cache.current;
  const key = `rock-esim-delivery-v1:${orderId}`;
  try {
    const stored = sessionStorage.getItem(key);
    if (stored && /^[0-9a-f-]{36}$/i.test(stored)) {
      cache.current = stored;
      return stored;
    }
  } catch { /* Use the in-memory key when session storage is unavailable. */ }
  const next = crypto.randomUUID();
  cache.current = next;
  try { sessionStorage.setItem(key, next); } catch { /* Keep the key for retries until this view closes. */ }
  return next;
}

function stateLabel(status: EsimStatus) {
  switch (status.state) {
    case 'paid_waiting_for_esim_issuance': return 'eSIM発行の準備待ち';
    case 'provider_outcome_requires_reconciliation': return '供給元の発行状況を照合中';
    case 'provider_completed_binding_pending': return '端末情報との照合中';
    case 'profile_bound_install_material_ready': return '導入情報を確認できます';
    case 'install_material_acknowledged': return '導入情報は消去済み';
    case 'profile_bound_install_material_unavailable': return '導入情報の準備待ち';
    case 'not_esim_order': return 'eSIM商品ではありません';
    case 'not_eligible': return 'この注文ではeSIMを設定できません';
    case 'esim_configuration_pending': return 'eSIM連携の設定待ち';
    default: return '確認が必要です';
  }
}

export function EsimPurchaseSetup({ orderId }: { orderId: string }) {
  const [status, setStatus] = useState<EsimStatus | null>(null);
  const [material, setMaterial] = useState<EsimInstallMaterial | null>(null);
  const [pending, setPending] = useState<'status' | 'material' | 'ack' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deliveryKey = useRef<string | null>(null);

  async function checkStatus() {
    setPending('status');
    setError(null);
    try {
      const result = await esimRequest<EsimStatus>(orderId);
      setStatus(result);
      if (result.installMaterialAcknowledged) setMaterial(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'eSIMの状態を確認できませんでした。');
    } finally {
      setPending(null);
    }
  }

  async function revealMaterial() {
    setPending('material');
    setError(null);
    try {
      const result = await esimRequest<{ material: EsimInstallMaterial }>(orderId, {
        action: 'fetch', deliveryRequestId: deliveryRequestId(orderId, deliveryKey),
      });
      setMaterial(result.material);
      setStatus((current) => current ? { ...current, state: 'profile_bound_install_material_ready' } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '導入情報を表示できませんでした。');
    } finally {
      setPending(null);
    }
  }

  async function eraseMaterial() {
    setPending('ack');
    setError(null);
    try {
      await esimRequest(orderId, { action: 'acknowledge', deliveryRequestId: deliveryRequestId(orderId, deliveryKey) });
      setMaterial(null);
      setStatus((current) => current ? { ...current, state: 'install_material_acknowledged', installMaterialAvailable: false, installMaterialAcknowledged: true } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '導入情報を消去できませんでした。');
    } finally {
      setPending(null);
    }
  }

  const appleUrl = safeInstallUrl(material?.appleInstallUrl, 'esimsetup.apple.com');
  const androidUrl = safeInstallUrl(material?.androidInstallUrl, 'esimsetup.android.com');
  const hasStatus = status !== null;

  return <section className={styles.esimSetup} aria-label="eSIMの導入">
    <div className={styles.esimSetupHeader}>
      <div><h4><Smartphone size={16} /> eSIMの設定</h4><p>この注文がeSIM商品かを確認し、準備済みの端末導入情報を表示します。</p></div>
      <button className={styles.secondary} type="button" onClick={() => void checkStatus()} disabled={pending !== null}>
        <RefreshCw size={14} />{pending === 'status' ? '確認中…' : hasStatus ? '状態を更新' : '状態を確認'}
      </button>
    </div>
    {status && <output className={styles.esimState}><ShieldCheck size={15} />{stateLabel(status)}</output>}
    {status && status.state !== 'not_esim_order' && status.state !== 'not_eligible' &&
      <p className={status.esimDeviceEntitlementState === 'active' ? styles.success : styles.notice}>
        {status.esimDeviceEntitlementState === 'active'
          ? '認証済み端末ゲートウェイがeSIM導入と初期Agent Packの状態を確認し、この端末の利用権が有効です。'
          : status.esimDeviceEntitlementState === 'revoked_or_stale'
            ? '端末利用権の証明が現在の信頼条件またはPackage版と一致しません。同期が回復するまで機能を利用できません。'
            : status.deviceInstallState === 'verified_installed_enabled'
              ? '署名付き証明でeSIM導入を確認しました。RockstarOSの端末ゲートウェイ利用権はまだ有効化されていません。'
              : '端末へのeSIM追加完了は未確認です。導入情報を表示しただけでは、端末適合やOS利用開始を確認したことになりません。'}
      </p>}
    {status?.starterAgentPack && <div className={styles.notice}>
      <p>注文に固定された初期pack: {status.starterAgentPack.id} v{status.starterAgentPack.version}（{status.starterAgentPack.packageCount}件）。内容は注文時のPackage参照に基づきます。</p>
      <ul>{status.starterAgentPack.packages.map((item) => <li key={item.packageKey}>
        <strong>{item.name || item.packageKey}</strong>{' '}
        <span>({item.reviewState === 'active' ? '現在の審査有効' : '現在は利用不可'})</span>
        {item.summary && <span> — {item.summary}</span>}
      </li>)}</ul>
      <p>{status.starterPackActivationState === 'active_on_authenticated_device'
        ? '認証済み端末ゲートウェイがこのStarter Packの導入を確認しました。各Toolの権限・本人承認は別途必要です。'
        : 'この表示だけでは端末への導入や実行許可を意味しません。端末ゲートウェイが確認するまで利用権は有効になりません。'}</p>
    </div>}
    {status?.state === 'not_esim_order' && <p className={styles.subtle}>購入商品の接続方法は、提供元の案内をご確認ください。</p>}
    {status?.state === 'paid_waiting_for_esim_issuance' && <p className={styles.notice}>注文は支払い済みです。供給元との契約・発行接続が整うまで、eSIM発行は行われません。</p>}
    {status && ['provider_outcome_requires_reconciliation', 'provider_completed_binding_pending', 'profile_bound_install_material_unavailable', 'esim_configuration_pending'].includes(status.state) &&
      <p className={styles.notice}>発行結果または導入情報を照合しています。新しい発行要求は送っていません。しばらくしてから状態を更新してください。</p>}
    {status?.installMaterialAvailable && !status.installMaterialAcknowledged && !material &&
      <button className={styles.primary} type="button" onClick={() => void revealMaterial()} disabled={pending !== null}>
        {pending === 'material' ? '安全に取得中…' : '導入情報を表示'}
      </button>}
    {material && <div className={styles.esimMaterial}>
      <p className={styles.notice}>この情報はeSIMの追加に使う秘密情報です。本人の端末でのみ表示し、第三者へ共有しないでください。</p>
      <div className={styles.esimLinks}>
        {appleUrl && <a className={styles.primary} href={appleUrl} rel="noreferrer" referrerPolicy="no-referrer">Apple端末に追加 <ExternalLink size={14} /></a>}
        {androidUrl && <a className={styles.primary} href={androidUrl} rel="noreferrer" referrerPolicy="no-referrer">Android端末に追加 <ExternalLink size={14} /></a>}
      </div>
      <details className={styles.esimManual}>
        <summary>手動で設定する場合</summary>
        <dl>
          <div><dt>SM-DP+ アドレス</dt><dd>{material.smdpAddress}</dd></div>
          <div><dt>有効化コード</dt><dd>{material.matchingId}</dd></div>
          <div><dt>ICCID</dt><dd>{material.iccid}</dd></div>
        </dl>
      </details>
      <p className={styles.subtle}>端末の「モバイル通信プランを追加」から進みます。eSIM対応、SIMロック、対応周波数、対象地域を端末と通信プランの両方で確認してください。</p>
      <p className={styles.notice}>Androidでは通常、OSの追加確認が表示される場合があります。無人で導入・有効化できるかは、端末の管理形態と通信会社の権限により異なります。確認が終わっても署名付き証明が届くまでは、RockstarOSの利用開始とは判定しません。</p>
      <button className={styles.textButton} type="button" onClick={() => void eraseMaterial()} disabled={pending !== null}>
        <Check size={14} />{pending === 'ack' ? '消去中…' : '導入情報を確認したのでサーバーから消去'}
      </button>
    </div>}
    {status?.state === 'install_material_acknowledged' && <p className={styles.success}><Check size={15} />サーバー上の暗号化導入情報を消去しました。</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
