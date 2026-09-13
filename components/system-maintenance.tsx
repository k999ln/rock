'use client';

import {
  Activity,
  AlertCircle,
  AppWindow,
  ArchiveRestore,
  ArrowLeft,
  BellRing,
  CheckCircle2,
  CloudCog,
  Database,
  Download,
  FileDown,
  HardDrive,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Upload,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
  resetDevicePreferences,
  restoreDevicePreferences,
} from '@/lib/system-backup';
import releaseReadiness from '@/data/release-readiness.json';
import styles from './system-maintenance.module.css';

type CheckState = 'checking' | 'ready' | 'attention' | 'blocked';
type Check = {
  id: string;
  label: string;
  detail: string;
  state: CheckState;
};
type BackupMode = 'create' | 'restore';

const releaseCopy: Record<string, { short: string; icon: React.ReactNode }> = {
  'web-pwa-owner-preview': { short: '本人限定版は稼働可能', icon: <AppWindow /> },
  'web-pwa-public-preview': { short: 'ライセンス選択と公開承認が必要', icon: <AppWindow /> },
  'qemu-developer-preview': { short: 'rc2の基礎と部品表は合格。配布条件は未完了', icon: <HardDrive /> },
  'android-physical-preview': { short: '対象機種未選択。端末固有の実測証拠が必要', icon: <Smartphone /> },
  'iphone-ipad-client': { short: '置換OSではなくclient配布として審査', icon: <Smartphone /> },
  'personal-number-identity': { short: '番号取得は無効。別の法務・安全管理審査が必要', icon: <ShieldAlert /> },
};

const initialChecks: Check[] = [
  { id: 'network', label: '通信', detail: '確認中', state: 'checking' },
  { id: 'secure', label: '安全な接続', detail: '確認中', state: 'checking' },
  { id: 'storage', label: '端末内保存', detail: '確認中', state: 'checking' },
  { id: 'persistent', label: '保存の保護', detail: '確認中', state: 'checking' },
  { id: 'crypto', label: '暗号化', detail: '確認中', state: 'checking' },
  { id: 'update', label: '更新機構', detail: '確認中', state: 'checking' },
  { id: 'notification', label: '通知', detail: '確認中', state: 'checking' },
  { id: 'appMode', label: 'アプリ表示', detail: '確認中', state: 'checking' },
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

    next.push({
      id: 'secure',
      label: '安全な接続',
      detail: globalThis.isSecureContext ? 'HTTPSで保護' : 'ローカル開発環境',
      state: globalThis.isSecureContext || location.hostname === 'localhost' ? 'ready' : 'blocked',
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

    try {
      const persisted = await navigator.storage?.persisted?.();
      next.push({
        id: 'persistent',
        label: '保存の保護',
        detail: persisted ? '自動削除から保護' : '必要なら保護を許可',
        state: persisted ? 'ready' : 'attention',
      });
    } catch {
      next.push({ id: 'persistent', label: '保存の保護', detail: 'ブラウザ管理', state: 'attention' });
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

    const notificationPermission = 'Notification' in window ? Notification.permission : 'unsupported';
    next.push({
      id: 'notification',
      label: '通知',
      detail:
        notificationPermission === 'granted'
          ? '許可済み'
          : notificationPermission === 'denied'
            ? 'ブラウザ設定で拒否中'
            : notificationPermission === 'default'
              ? '必要なときに許可'
              : 'この環境では非対応',
      state: notificationPermission === 'granted' ? 'ready' : 'attention',
    });

    const installed =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    next.push({
      id: 'appMode',
      label: 'アプリ表示',
      detail: installed ? 'ホーム画面から起動' : 'ブラウザで稼働中',
      state: installed ? 'ready' : 'attention',
    });

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
  const blockedCount = useMemo(
    () => checks.filter(({ state }) => state === 'blocked').length,
    [checks],
  );
  const readyReleaseCount = releaseReadiness.targets.filter(
    ({ declaredStatus }) => declaredStatus === 'ready',
  ).length;

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

  async function enableNotifications() {
    if (!('Notification' in window)) {
      setMessage('この環境は通知に対応していません。');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setMessage('通知は許可されませんでした。ブラウザのサイト設定から変更できます。');
      await runDiagnostics();
      return;
    }
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      await registration?.showNotification('RockstarOS', {
        body: '通知を受け取れる状態です。',
        tag: 'rockstaros-notification-test',
      });
      setMessage('通知を許可し、テスト通知を送りました。バックグラウンド配信はProvider接続後に有効になります。');
    } catch {
      setMessage('通知は許可済みです。テスト通知は表示できませんでした。');
    }
    await runDiagnostics();
  }

  async function protectStorage() {
    try {
      const persisted = await navigator.storage?.persist?.();
      setMessage(
        persisted
          ? 'この端末のRockstarOS設定を自動削除から保護しました。'
          : 'ブラウザが保存保護を許可しませんでした。設定は引き続き利用できます。',
      );
    } catch {
      setMessage('この環境では保存保護を変更できません。');
    }
    await runDiagnostics();
  }

  function downloadDiagnostics() {
    const report = {
      product: 'RockstarOS',
      version: '1.0',
      channel: 'Developer Preview',
      runtime: 'web_pwa',
      generatedAt: new Date().toISOString(),
      checks: checks.map(({ id, label, detail, state }) => ({ id, label, detail, state })),
      privacy: 'No identity, token, wallet, personal number, or user content included.',
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `RockstarOS-diagnostics-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage('個人情報を含まない診断レポートを保存しました。');
  }

  function resetSettings() {
    resetDevicePreferences(localStorage);
    setMessage('ホームの外観と並び順を初期状態に戻しました。アカウント、Wallet、履歴は削除していません。');
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
            <h1>{running ? '診断中' : blockedCount === 0 ? '稼働できます' : '確認が必要です'}</h1>
            <p>{readyCount} / {checks.length} 項目が利用可能。この端末の実測結果です。</p>
          </div>
        </section>

        <section className={styles.section}>
          <h2>日常の運用</h2>
          <div className={styles.actions}>
            <button onClick={() => void enableNotifications()}>
              <span className={styles.orange}><BellRing /></span>
              <span><strong>通知を許可・テスト</strong><small>ジョブ完了を受け取る準備</small></span>
            </button>
            <button onClick={() => void protectStorage()}>
              <span className={styles.teal}><Database /></span>
              <span><strong>端末内データを保護</strong><small>ブラウザの自動削除を防ぐよう要求</small></span>
            </button>
            <button onClick={downloadDiagnostics}>
              <span className={styles.slate}><FileDown /></span>
              <span><strong>診断レポート</strong><small>個人情報なしでサポートへ共有</small></span>
            </button>
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
            <AlertDialog>
              <AlertDialogTrigger render={<button aria-label="ホーム設定を初期化" />}>
                <span className={styles.red}><RotateCcw /></span>
                <span><strong>ホーム設定を初期化</strong><small>外観と並び順だけを元に戻す</small></span>
              </AlertDialogTrigger>
              <AlertDialogContent className={styles.alertDialog}>
                <AlertDialogHeader>
                  <AlertDialogTitle>ホーム設定を初期化しますか？</AlertDialogTitle>
                  <AlertDialogDescription>
                    壁紙、色、アイコンサイズ、表示名、並び順を初期状態へ戻します。アカウント、Wallet、実行履歴は削除しません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className={styles.alertFooter}>
                  <AlertDialogCancel className={styles.cancel}>キャンセル</AlertDialogCancel>
                  <AlertDialogAction className={styles.danger} onClick={resetSettings}>初期化する</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>

        {message && <output className={styles.notice}>{message}</output>}

        <details className={styles.release}>
          <summary>
            <span>公開準備</span>
            <span className={styles.releaseCount}>{readyReleaseCount} / {releaseReadiness.targets.length}</span>
          </summary>
          <p className={styles.releaseLead}>配布方法ごとに必要条件を判定しています。</p>
          <div className={styles.gates}>
            {releaseReadiness.targets.map((target) => {
              const required = target.gates.filter(({ required }) => required);
              const passed = required.filter(({ status }) => status === 'pass').length;
              const copy = releaseCopy[target.id];
              return (
                <Gate
                  key={target.id}
                  icon={copy?.icon || <KeyRound />}
                  title={target.label}
                  state={`${passed}/${required.length}・${copy?.short || '条件を確認中'}`}
                  progress={`${passed}/${required.length}`}
                  tone={target.declaredStatus === 'ready' ? 'ready' : 'blocked'}
                />
              );
            })}
          </div>
          <p className={styles.boundary}>
            緑はその配布方法の最低条件を満たした状態です。QEMU rc2は6/10。Android実機は対象端末未選択で0/5。マイナンバーは取得無効の境界だけ1/7です。製品ライセンス、正式署名、端末固有試験、法務・安全管理、公開承認が揃うまで配布・有効化可能にはしません。
          </p>
        </details>
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
  if (state === 'attention') return <AlertCircle className={styles.attentionIcon} />;
  return <XCircle className={styles.blockedIcon} />;
}

function Gate({ icon, title, state, progress, tone }: { icon: React.ReactNode; title: string; state: string; progress: string; tone: 'ready' | 'blocked' }) {
  return <article><span className={styles[tone]}>{icon}</span><div><strong>{title}</strong><small>{state}</small></div><b className={styles.gateProgress}>{progress}</b></article>;
}
