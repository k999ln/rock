'use client';

import {
  Activity,
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  CloudCog,
  Download,
  HardDrive,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Upload,
  Wifi,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { deviceToken } from '@/lib/device';
import {
  collectDevicePreferences,
  decryptDeviceBackup,
  encryptDeviceBackup,
  restoreDevicePreferences,
} from '@/lib/system-backup';
import styles from './system-maintenance.module.css';

type CheckState = 'checking' | 'ready' | 'attention' | 'blocked';
type Check = {
  id: string;
  label: string;
  detail: string;
  state: CheckState;
};
type BackupMode = 'create' | 'restore';

const initialChecks: Check[] = [
  { id: 'network', label: '通信', detail: '確認中', state: 'checking' },
  { id: 'storage', label: '端末内保存', detail: '確認中', state: 'checking' },
  { id: 'crypto', label: '暗号化', detail: '確認中', state: 'checking' },
  { id: 'update', label: '更新機構', detail: '確認中', state: 'checking' },
  { id: 'api', label: 'RockstarOS API', detail: '確認中', state: 'checking' },
  { id: 'connector', label: 'PC Connector', detail: '確認中', state: 'checking' },
];

export default function SystemMaintenance() {
  const [checks, setChecks] = useState(initialChecks);
  const [running, setRunning] = useState(true);
  const [message, setMessage] = useState('');
  const [backupMode, setBackupMode] = useState<BackupMode | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    setMessage('');
    const next: Check[] = [];
    next.push({
      id: 'network',
      label: '通信',
      detail: navigator.onLine ? 'オンライン' : 'オフライン',
      state: navigator.onLine ? 'ready' : 'attention',
    });

    try {
      const probe = 'rockstaros.health.probe';
      localStorage.setItem(probe, 'ok');
      localStorage.removeItem(probe);
      const estimate = await navigator.storage?.estimate?.();
      const used = estimate?.usage
        ? `${Math.max(1, Math.round(estimate.usage / 1024))} KB使用中`
        : '読み書き可能';
      next.push({ id: 'storage', label: '端末内保存', detail: used, state: 'ready' });
    } catch {
      next.push({ id: 'storage', label: '端末内保存', detail: '利用できません', state: 'blocked' });
    }

    next.push({
      id: 'crypto',
      label: '暗号化',
      detail: globalThis.crypto?.subtle ? 'AES-GCM / PBKDF2対応' : '非対応ブラウザ',
      state: globalThis.crypto?.subtle ? 'ready' : 'blocked',
    });

    try {
      if (!('serviceWorker' in navigator)) throw new Error();
      const registration =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register('/sw.js'));
      next.push({
        id: 'update',
        label: '更新機構',
        detail: registration.active ? '自動更新が有効' : '初回準備中',
        state: registration.active ? 'ready' : 'attention',
      });
    } catch {
      next.push({ id: 'update', label: '更新機構', detail: 'ブラウザ更新のみ', state: 'attention' });
    }

    try {
      const response = await fetch('/api/jobs', { cache: 'no-store' });
      next.push({
        id: 'api',
        label: 'RockstarOS API',
        detail: response.status === 401 ? '稼働中・サインイン待ち' : response.ok ? '稼働中' : `応答 ${response.status}`,
        state: response.status === 401 || response.ok ? 'ready' : 'attention',
      });
    } catch {
      next.push({ id: 'api', label: 'RockstarOS API', detail: '応答なし', state: 'blocked' });
    }

    next.push({
      id: 'connector',
      label: 'PC Connector',
      detail: deviceToken() ? '接続済み' : '必要なときに接続',
      state: deviceToken() ? 'ready' : 'attention',
    });
    setChecks(next);
    setRunning(false);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void runDiagnostics(), 0);
    return () => window.clearTimeout(timeout);
  }, [runDiagnostics]);

  const readyCount = useMemo(
    () => checks.filter(({ state }) => state === 'ready').length,
    [checks],
  );

  async function checkForUpdate() {
    setMessage('更新を確認しています…');
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.update();
      setMessage(
        registration?.waiting
          ? '新しい版を受け取りました。再読込すると切り替わります。'
          : '公開中の最新版を確認しました。',
      );
    } catch {
      setMessage('自動確認できませんでした。通信を確認して再読込してください。');
    }
  }

  function openBackup(mode: BackupMode) {
    setBackupMode(mode);
    setPassphrase('');
    setBackupFile(null);
    setMessage('');
  }

  async function createBackup() {
    setBackupBusy(true);
    setMessage('');
    try {
      const encrypted = await encryptDeviceBackup(
        collectDevicePreferences(localStorage),
        passphrase,
      );
      const url = URL.createObjectURL(
        new Blob([encrypted], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `RockstarOS-${new Date().toISOString().slice(0, 10)}.rockstarbackup`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupMode(null);
      setMessage('暗号化バックアップを保存しました。パスフレーズは別の安全な場所に保管してください。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'バックアップを作成できませんでした。');
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreBackup() {
    if (!backupFile) {
      setMessage('復元するバックアップを選んでください。');
      return;
    }
    setBackupBusy(true);
    setMessage('');
    try {
      const restored = await decryptDeviceBackup(
        await backupFile.text(),
        passphrase,
      );
      restoreDevicePreferences(localStorage, restored.records);
      setBackupMode(null);
      setMessage(`端末設定を復元しました（保存日時 ${new Date(restored.createdAt).toLocaleString('ja-JP')}）。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'バックアップを復元できませんでした。');
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/settings" aria-label="設定へ戻る"><ArrowLeft size={21} /></Link>
        <strong>システム</strong>
        <button onClick={() => void runDiagnostics()} disabled={running} aria-label="再診断">
          <RefreshCw size={18} className={running ? styles.spin : undefined} />
        </button>
      </header>

      <div className={styles.content}>
        <section className={styles.overview}>
          <span className={styles.overviewIcon}><Activity /></span>
          <div>
            <small>WEB / PWA</small>
            <h1>{running ? '診断中' : `${readyCount} / ${checks.length} 準備済み`}</h1>
            <p>この端末で実際に使える機能だけを確認します。</p>
          </div>
        </section>

        <section className={styles.checks} aria-label="システム診断">
          {checks.map((check) => (
            <article key={check.id}>
              <StatusIcon state={check.state} />
              <span><strong>{check.label}</strong><small>{check.detail}</small></span>
            </article>
          ))}
        </section>

        <section className={styles.section}>
          <h2>保全と復旧</h2>
          <div className={styles.actions}>
            <button onClick={() => openBackup('create')}>
              <span className={styles.green}><Download /></span>
              <span><strong>暗号化バックアップ</strong><small>端末内の外観・設定を安全に保存</small></span>
            </button>
            <button onClick={() => openBackup('restore')}>
              <span className={styles.blue}><ArchiveRestore /></span>
              <span><strong>バックアップから復元</strong><small>改ざん検知後に端末設定を戻す</small></span>
            </button>
            <button onClick={() => void checkForUpdate()}>
              <span className={styles.purple}><CloudCog /></span>
              <span><strong>更新を確認</strong><small>Service Workerと公開版を照合</small></span>
            </button>
          </div>
        </section>

        {message && <output className={styles.notice}>{message}</output>}

        <section className={styles.section}>
          <h2>端末OSの合格条件</h2>
          <div className={styles.gates}>
            <Gate icon={<HardDrive />} title="QEMU Developer Preview" state="内部受入済み" tone="ready" />
            <Gate icon={<Smartphone />} title="物理端末" state="対象機種の確定待ち" tone="blocked" />
            <Gate icon={<KeyRound />} title="正式署名・暗号鍵" state="所有者鍵の準備待ち" tone="blocked" />
            <Gate icon={<ShieldAlert />} title="外部MCP・決済" state="Provider認証と審査待ち" tone="blocked" />
          </div>
          <p className={styles.boundary}>
            Webから物理端末のドライバや署名鍵を作った扱いにはしません。機種、鍵、Providerが揃うと、この診断に実測結果を接続します。
          </p>
        </section>
      </div>

      <Dialog open={backupMode !== null} onOpenChange={(open) => !open && setBackupMode(null)}>
        <DialogContent className={styles.dialog}>
          <DialogTitle>{backupMode === 'create' ? '暗号化バックアップ' : '端末設定を復元'}</DialogTitle>
          <DialogDescription>
            {backupMode === 'create'
              ? 'パスフレーズからAES-GCM鍵を作り、RockstarOSの端末設定だけを暗号化します。'
              : 'バックアップと作成時のパスフレーズを指定します。'}
          </DialogDescription>
          {backupMode === 'restore' && (
            <>
              <input
                ref={fileInput}
                className={styles.hiddenFile}
                type="file"
                accept=".rockstarbackup,application/json"
                onChange={(event) => setBackupFile(event.target.files?.[0] || null)}
              />
              <button className={styles.fileButton} onClick={() => fileInput.current?.click()}>
                <Upload size={18} />{backupFile?.name || 'バックアップを選ぶ'}
              </button>
            </>
          )}
          <label className={styles.passphrase}>
            <span>復旧パスフレーズ</span>
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoComplete="new-password"
              placeholder="10文字以上"
            />
          </label>
          <p className={styles.dialogNote}>PC接続トークン、ログイン情報、Wallet資金、サーバー上の実行履歴は書き出しません。</p>
          <button
            className={styles.primary}
            disabled={backupBusy}
            onClick={() => void (backupMode === 'create' ? createBackup() : restoreBackup())}
          >
            {backupBusy && <LoaderCircle className={styles.spin} size={17} />}
            {backupMode === 'create' ? '暗号化して保存' : '確認して復元'}
          </button>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function StatusIcon({ state }: { state: CheckState }) {
  if (state === 'checking') return <LoaderCircle className={styles.spin} />;
  if (state === 'ready') return <CheckCircle2 className={styles.readyIcon} />;
  if (state === 'attention') return <Wifi className={styles.attentionIcon} />;
  return <XCircle className={styles.blockedIcon} />;
}

function Gate({ icon, title, state, tone }: { icon: React.ReactNode; title: string; state: string; tone: 'ready' | 'blocked' }) {
  return <article><span className={styles[tone]}>{icon}</span><div><strong>{title}</strong><small>{state}</small></div></article>;
}
