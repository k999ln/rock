'use client';

import Link from 'next/link';
import {
  Activity,
  Ban,
  CircleAlert,
  FileSearch,
  House,
  KeyRound,
  LockKeyhole,
  LogOut,
  Pause,
  Radio,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Unplug,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  EmergencyAction,
  OperatorDeviceCommand,
  OperatorManagedDevice,
} from '@/lib/operator-control';
import styles from './operator-console.module.css';

type AuditEvent = {
  id: string;
  deviceId: string;
  commandId: string | null;
  incidentId: string;
  event: string;
  detailsJson: string;
  createdAt: number;
};

type Snapshot = {
  controlPlane: 'ready';
  deviceAgent: 'not_implemented' | 'ready';
  operatorAccess: true;
  devices: OperatorManagedDevice[];
  commands: OperatorDeviceCommand[];
  audit: AuditEvent[];
};

const actions: {
  id: EmergencyAction;
  label: string;
  note: string;
  icon: typeof LockKeyhole;
  tone?: 'danger';
}[] = [
  { id: 'lock_device', label: '端末をロック', note: '画面を即時ロック', icon: LockKeyhole },
  { id: 'enter_lost_mode', label: '紛失モード', note: '端末を保護状態へ', icon: Smartphone },
  {
    id: 'stop_sky_and_zema_execution',
    label: 'Sky / Zemaを停止',
    note: '新規実行と承認を止める',
    icon: Ban,
  },
  {
    id: 'revoke_active_sessions',
    label: 'セッション失効',
    note: '接続済み認証を無効化',
    icon: LogOut,
  },
  {
    id: 'pause_ota_installation',
    label: 'OTAを一時停止',
    note: '更新適用を止める',
    icon: Pause,
  },
  {
    id: 'quarantine_external_connections',
    label: '通信を隔離',
    note: '外部接続を制限',
    icon: Unplug,
  },
  {
    id: 'collect_sanitized_diagnostics',
    label: '診断を取得',
    note: '私的内容を除く',
    icon: FileSearch,
  },
  {
    id: 'open_limited_maintenance_session',
    label: '15分保守接続',
    note: '許可済み操作だけ',
    icon: Radio,
  },
  {
    id: 'request_factory_reset',
    label: '初期化を予約',
    note: '30分の取消猶予',
    icon: ShieldAlert,
    tone: 'danger',
  },
];

const statusLabel = (status: string) =>
  ({
    queued: '送信待ち',
    scheduled: '取消猶予中',
    acknowledged: '端末が受領',
    completed: '完了',
    failed: '失敗',
    cancelled: '取消済み',
    expired: '期限切れ',
  })[status] ?? status;

async function readSnapshot() {
  const response = await fetch('/api/operator/devices', {
    cache: 'no-store',
    signal: AbortSignal.timeout(8_000),
  });
  const data = (await response.json()) as Snapshot & { error?: string };
  if (!response.ok)
    throw new Error(data.error ?? '管理画面を読み込めません。');
  return data;
}

export default function OperatorConsole() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [incidentId, setIncidentId] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await readSnapshot();
      setError('');
      setSnapshot(data);
      setSelectedId((current) => current || data.devices[0]?.id || '');
    } catch (caught) {
      setSnapshot(null);
      setError(caught instanceof Error ? caught.message : '管理画面を読み込めません。');
    }
  }, []);

  useEffect(() => {
    void readSnapshot()
      .then((data) => {
        setSnapshot(data);
        setSelectedId(data.devices[0]?.id || '');
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : '管理画面を読み込めません。',
        );
      });
  }, []);

  const selected = useMemo(
    () => snapshot?.devices.find((device) => device.id === selectedId) ?? null,
    [selectedId, snapshot?.devices],
  );
  const deviceCommands = useMemo(
    () => snapshot?.commands.filter((command) => command.deviceId === selectedId) ?? [],
    [selectedId, snapshot?.commands],
  );

  async function issue(requestedAction: EmergencyAction) {
    if (!selected) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/operator/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'issue',
          id: crypto.randomUUID(),
          deviceId: selected.id,
          incidentId,
          action: requestedAction,
          reason,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? '命令を保存できません。');
      setMessage(
        snapshot?.deviceAgent === 'ready'
          ? '端末へ命令を送信しました。'
          : '命令を保存しました。Android端末側サービスの接続後に配信されます。',
      );
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '命令を保存できません。');
    } finally {
      setBusy(false);
    }
  }

  async function cancel(command: OperatorDeviceCommand) {
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/operator/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'cancel',
          id: command.id,
          incidentId: command.incidentId,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? '取り消せませんでした。');
      setMessage('未受領の命令を取り消しました。');
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '取り消せませんでした。');
    } finally {
      setBusy(false);
    }
  }

  const readyToIssue =
    Boolean(selected) && incidentId.trim().length >= 3 && reason.trim().length >= 5;

  return (
    <div className={styles.page}>
      <a className={styles.skip} href="#operator-main">管理画面へ移動</a>
      <header className={styles.header}>
        <Link href="/" className={styles.home} aria-label="ホームへ戻る">
          <House size={18} />
          <span>ホーム</span>
        </Link>
        <div className={styles.brand}>
          <ShieldCheck size={19} />
          <strong>avocadoOS OPERATIONS</strong>
        </div>
        <button className={styles.refresh} onClick={() => void refresh()} disabled={busy}>
          <RefreshCw size={17} />
          <span>更新</span>
        </button>
      </header>

      <main id="operator-main" className={styles.main} tabIndex={-1}>
        <section className={styles.hero}>
          <div>
            <span>OPERATOR ONLY</span>
            <h1>端末管理</h1>
            <p>登録端末の状態確認、緊急保護、15分保守接続、監査履歴を一か所で管理します。</p>
          </div>
          <div className={styles.guardrail}>
            <KeyRound size={20} />
            <div><strong>運営1名で初動可能</strong><small>私的内容・Wallet・秘密鍵・任意rootにはアクセスできません</small></div>
          </div>
        </section>

        {error ? (
          <section className={styles.locked} role="alert">
            <CircleAlert size={28} />
            <div><h2>管理機能はロックされています</h2><p>{error}</p></div>
          </section>
        ) : null}

        {snapshot ? (
          <>
            <section className={styles.statusRow} aria-label="管理状態">
              <article><span className={styles.dotReady} /><div><strong>管理基盤</strong><small>利用可能</small></div></article>
              <article><span className={snapshot.deviceAgent === 'ready' ? styles.dotReady : styles.dotWaiting} /><div><strong>Android端末サービス</strong><small>{snapshot.deviceAgent === 'ready' ? '接続可能' : '未実装・配信停止中'}</small></div></article>
              <article><Activity size={18} /><div><strong>監査イベント</strong><small>{snapshot.audit.length}件</small></div></article>
            </section>

            <div className={styles.layout}>
              <section className={styles.devices} aria-labelledby="device-heading">
                <div className={styles.sectionHeading}><div><span>DEVICES</span><h2 id="device-heading">登録端末</h2></div><b>{snapshot.devices.length}</b></div>
                {snapshot.devices.length ? (
                  <div className={styles.deviceList}>
                    {snapshot.devices.map((device) => (
                      <button key={device.id} className={device.id === selectedId ? styles.deviceActive : styles.device} onClick={() => setSelectedId(device.id)}>
                        <span className={styles.deviceIcon}><Smartphone size={20} /></span>
                        <span><strong>{device.displayName}</strong><small>{device.model} · {device.osVersion}</small></span>
                        <em data-online={device.online}>{device.online ? 'ONLINE' : 'OFFLINE'}</em>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.empty}><Smartphone size={27} /><strong>登録端末はありません</strong><p>Android端末serviceとhardware identityの登録後にここへ表示されます。</p></div>
                )}
              </section>

              <section className={styles.control} aria-labelledby="control-heading">
                <div className={styles.sectionHeading}><div><span>EMERGENCY CONTROL</span><h2 id="control-heading">緊急操作</h2></div></div>
                <div className={styles.formGrid}>
                  <label>事故ID<input value={incidentId} onChange={(event) => setIncidentId(event.target.value)} placeholder="INC-2026-001" maxLength={80} /></label>
                  <label>対応理由<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="紛失の申告を受けたため" maxLength={240} /></label>
                </div>
                <div className={styles.actionGrid}>
                  {actions.map(({ id, label, note, icon: Icon, tone }) => (
                    <button key={id} className={tone === 'danger' ? styles.actionDanger : styles.action} disabled={!readyToIssue || busy} onClick={() => void issue(id)}>
                      <Icon size={19} /><span><strong>{label}</strong><small>{note}</small></span>
                    </button>
                  ))}
                </div>
                {message ? <output className={styles.success}>{message}</output> : null}
                {selected && snapshot.deviceAgent !== 'ready' ? <p className={styles.boundary}>命令キューまでは実装済みです。Android端末側serviceとproduction credentialが完成するまで、端末へ実命令は配信しません。</p> : null}
              </section>
            </div>

            <section className={styles.history} aria-labelledby="history-heading">
              <div className={styles.sectionHeading}><div><span>COMMAND LOG</span><h2 id="history-heading">命令履歴</h2></div></div>
              {deviceCommands.length ? (
                <div className={styles.tableWrap}><table><thead><tr><th>操作</th><th>事故ID</th><th>状態</th><th>発行時刻</th><th>取消</th></tr></thead><tbody>{deviceCommands.map((command) => <tr key={command.id}><td>{actions.find((item) => item.id === command.action)?.label ?? command.action}</td><td>{command.incidentId}</td><td><span className={styles.state}>{statusLabel(command.status)}</span></td><td>{new Date(command.issuedAt).toLocaleString('ja-JP')}</td><td>{['queued', 'scheduled'].includes(command.status) ? <button disabled={busy} onClick={() => void cancel(command)}>取消</button> : '—'}</td></tr>)}</tbody></table></div>
              ) : <p className={styles.noHistory}>選択端末の命令履歴はありません。</p>}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
