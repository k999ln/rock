'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Unplug,
  WalletCards,
} from 'lucide-react';
import {
  BASE_EXPLORER_URL,
  BASE_MAINNET_CHAIN_HEX,
  BASE_MAINNET_CHAIN_ID,
} from '@/lib/rock-wallet-config';
import { parseAccounts, walletError, type WalletProvider } from '@/lib/wallet';

type Gateway = { serviceOrigin: string; token: string };
type Collection = {
  instructionId: string;
  receiptId: string;
  amountMinor: number;
  assetSymbol: 'USDC';
  recipientAddress: string | null;
  status:
    | 'not_required'
    | 'awaiting_wallet'
    | 'ready'
    | 'confirming'
    | 'collected'
    | 'unknown';
  transactionHash: string | null;
  lastError: string | null;
};
type RockWalletSnapshot = {
  provider: {
    providerId: string;
    displayName: string;
    mode: 'LIVE_RECEIVE';
    custody: false;
    network: 'base';
    chainId: typeof BASE_MAINNET_CHAIN_ID;
    assetSymbol: 'USDC';
    assetContract: string;
  };
  account: {
    address: string;
    chainId: number;
    network: 'base';
    assetSymbol: 'USDC';
    status: 'active' | 'revoked';
    verifiedAt: number;
  } | null;
  operator: boolean;
  canClaim: boolean;
  totals: {
    collectedMinor: number;
    pendingMinor: number;
    collectedCount: number;
    pendingCount: number;
  } | null;
  collections: Collection[];
};

class WalletApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function gateway(signal?: AbortSignal) {
  const response = await fetch('/api/billing/token', {
    method: 'POST',
    cache: 'no-store',
    signal,
  });
  const value = (await response.json()) as Partial<Gateway> & {
    error?: string;
  };
  if (!response.ok || !value.serviceOrigin || !value.token)
    throw new WalletApiError(
      value.error ?? 'Rock受取Walletを開けませんでした。',
      response.status,
    );
  return value as Gateway;
}

async function walletApi<T>(
  path: string,
  init: RequestInit = {},
  signal?: AbortSignal,
) {
  const access = await gateway(signal);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${access.token}`);
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${access.serviceOrigin}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
    signal,
  });
  const value = (await response.json()) as T & { error?: string };
  if (!response.ok && response.status !== 202)
    throw new WalletApiError(
      value.error ?? 'Wallet操作を完了できませんでした。',
      response.status,
    );
  return value;
}

function provider() {
  return (window as Window & { ethereum?: WalletProvider }).ethereum;
}

async function ensureBaseMainnet(wallet: WalletProvider) {
  let chainId = await wallet.request({ method: 'eth_chainId' });
  if (chainId === BASE_MAINNET_CHAIN_HEX) return;
  try {
    await wallet.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: BASE_MAINNET_CHAIN_HEX }],
    });
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? Number(error.code)
        : 0;
    if (code !== 4902) throw error;
    await wallet.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: BASE_MAINNET_CHAIN_HEX,
          chainName: 'Base',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: ['https://mainnet.base.org'],
          blockExplorerUrls: [BASE_EXPLORER_URL],
        },
      ],
    });
  }
  chainId = await wallet.request({ method: 'eth_chainId' });
  if (chainId !== BASE_MAINNET_CHAIN_HEX)
    throw new Error('Base Mainnetへ切り替えてください。');
}

function usd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value / 100);
}

function shortAddress(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function utf8ToHex(value: string) {
  return `0x${Array.from(new TextEncoder().encode(value), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')}`;
}

function collectionLabel(value: Collection['status']) {
  if (value === 'collected') return '着金確認済み';
  if (value === 'confirming') return 'finalized待ち';
  if (value === 'unknown') return '再照合が必要';
  if (value === 'ready') return '着金待ち';
  if (value === 'awaiting_wallet') return '受取先の設定待ち';
  return '回収なし';
}

export default function RockSettlementWallet() {
  const [snapshot, setSnapshot] = useState<RockWalletSnapshot | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [hashes, setHashes] = useState<Record<string, string>>({});
  const mounted = useRef(true);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    try {
      const value = await walletApi<RockWalletSnapshot>(
        '/v1/rock-wallet',
        {},
        signal,
      );
      if (mounted.current) {
        setSnapshot(value);
        setMessage('');
      }
    } catch (error) {
      if (!signal?.aborted && mounted.current)
        setMessage(
          error instanceof Error
            ? error.message
            : 'Rock受取Walletを開けませんでした。',
        );
    } finally {
      if (!signal?.aborted && mounted.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => void refresh(controller.signal), 0);
    return () => {
      mounted.current = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [refresh]);

  async function connect() {
    setBusy(true);
    setMessage('');
    try {
      const wallet = provider();
      if (!wallet)
        throw new Error(
          'MetaMaskなどのEthereum対応Walletでこの画面を開いてください。',
        );
      const accounts = parseAccounts(
        await wallet.request({ method: 'eth_requestAccounts' }),
      );
      if (!accounts[0])
        throw new Error('Walletアドレスを取得できませんでした。');
      await ensureBaseMainnet(wallet);
      const challenge = await walletApi<{
        challengeId: string;
        address: string;
        chainId: number;
        message: string;
      }>('/v1/rock-wallet/challenge', {
        method: 'POST',
        body: JSON.stringify({ address: accounts[0], chainId: 8453 }),
      });
      const signature = await wallet.request({
        method: 'personal_sign',
        params: [utf8ToHex(challenge.message), challenge.address],
      });
      if (typeof signature !== 'string')
        throw new Error('署名を確認できませんでした。');
      await walletApi('/v1/rock-wallet/verify', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          address: challenge.address,
          signature,
        }),
      });
      setMessage('RockのUSDC受取先を所有確認付きで登録しました。');
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof WalletApiError
          ? error.message
          : provider()
            ? walletError(error)
            : error instanceof Error
              ? error.message
              : 'Walletへ接続できませんでした。',
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyAddress() {
    if (!snapshot?.account?.address) return;
    await navigator.clipboard.writeText(snapshot.account.address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function reconcile(instructionId: string) {
    const transactionHash = hashes[instructionId]?.trim();
    if (!transactionHash) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await walletApi<{ status: string }>(
        '/v1/rock-wallet/reconcile',
        {
          method: 'POST',
          body: JSON.stringify({ instructionId, transactionHash }),
        },
      );
      setMessage(
        result.status === 'collected'
          ? 'Base上のUSDC着金を確認しました。'
          : '取引は見つかりました。finalized後にもう一度照合してください。',
      );
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : '着金を照合できませんでした。',
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setMessage('');
    try {
      await walletApi('/v1/rock-wallet', { method: 'DELETE' });
      setMessage('受取先を解除しました。既存の着金記録は残ります。');
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : '受取先を解除できませんでした。',
      );
    } finally {
      setBusy(false);
    }
  }

  const active = snapshot?.account?.status === 'active' && snapshot.operator;
  const actionable =
    snapshot?.collections.filter((item) => item.amountMinor > 0) ?? [];

  return (
    <section
      className="rock-settlement-wallet"
      aria-labelledby="rock-wallet-title"
    >
      <header>
        <div className="rock-settlement-heading">
          <span>
            <WalletCards size={22} />
          </span>
          <div>
            <p>ROCK SETTLEMENT WALLET</p>
            <h1 id="rock-wallet-title">Rockの実収益を受け取る</h1>
          </div>
        </div>
        <span className={active ? 'is-live' : ''}>
          {active ? 'BASE MAINNET' : '受取先未設定'}
        </span>
      </header>

      {active && snapshot?.account ? (
        <div className="rock-settlement-account">
          <div>
            <small>USDC受取アドレス</small>
            <strong title={snapshot.account.address}>
              {shortAddress(snapshot.account.address)}
            </strong>
            <span>
              <ShieldCheck size={14} /> 所有署名を確認済み · 秘密鍵は未保管
            </span>
          </div>
          <div className="rock-settlement-actions">
            <button type="button" onClick={() => void copyAddress()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'コピー済み' : 'アドレスをコピー'}
            </button>
            <a
              href={`${BASE_EXPLORER_URL}/address/${snapshot.account.address}`}
              target="_blank"
              rel="noreferrer"
            >
              BaseScan <ExternalLink size={15} />
            </a>
            <button
              className="is-quiet"
              type="button"
              onClick={() => void revoke()}
            >
              <Unplug size={15} /> 解除
            </button>
          </div>
        </div>
      ) : (
        <div className="rock-settlement-connect">
          <div>
            <strong>BaseのUSDC受取先を登録</strong>
            <p>
              外部Walletで所有署名を行い、Rock利用料の受取先にします。署名は送金権限ではありません。
            </p>
          </div>
          <button
            type="button"
            disabled={busy || snapshot?.canClaim === false}
            onClick={() => void connect()}
          >
            {busy ? (
              <LoaderCircle className="sky-billing-spin" size={17} />
            ) : (
              <Link2 size={17} />
            )}
            Walletを接続
          </button>
        </div>
      )}

      {active && snapshot?.totals && (
        <dl className="rock-settlement-totals">
          <div>
            <dt>着金確認済み</dt>
            <dd>{usd(snapshot.totals.collectedMinor)}</dd>
          </div>
          <div>
            <dt>着金待ち</dt>
            <dd>{usd(snapshot.totals.pendingMinor)}</dd>
          </div>
          <div>
            <dt>通貨・Network</dt>
            <dd>USDC · Base</dd>
          </div>
        </dl>
      )}

      {active && actionable.length > 0 && (
        <div className="rock-settlement-collections">
          <div className="rock-settlement-section-title">
            <strong>回収指図</strong>
            <button disabled={busy} onClick={() => void refresh()}>
              <RefreshCw size={14} /> 更新
            </button>
          </div>
          {actionable.map((item) => (
            <article key={item.instructionId}>
              <div>
                <span>{collectionLabel(item.status)}</span>
                <strong>{usd(item.amountMinor)} USDC</strong>
                <small>{item.receiptId}</small>
              </div>
              {item.status === 'collected' && item.transactionHash ? (
                <a
                  href={`${BASE_EXPLORER_URL}/tx/${item.transactionHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  取引を確認 <ExternalLink size={14} />
                </a>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void reconcile(item.instructionId);
                  }}
                >
                  <input
                    aria-label={`${item.receiptId}のBase取引ハッシュ`}
                    placeholder="0x… 取引ハッシュ"
                    value={
                      hashes[item.instructionId] ?? item.transactionHash ?? ''
                    }
                    onChange={(event) =>
                      setHashes((current) => ({
                        ...current,
                        [item.instructionId]: event.target.value,
                      }))
                    }
                  />
                  <button disabled={busy} type="submit">
                    着金を照合
                  </button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}

      {message && (
        <output className="rock-settlement-message">{message}</output>
      )}
      <footer>
        <ShieldCheck size={15} />
        <span>
          対象は検証済み収益から確定したRock利用料のみ。ユーザー資産の保管・任意送金・ファンド運用は行いません。
        </span>
      </footer>
    </section>
  );
}
