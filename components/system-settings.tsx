'use client';

/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in is a top-level gateway route. */
import {
  ArrowLeft,
  ArrowRight,
  Cable,
  CheckCircle2,
  Cloud,
  Download,
  HardDrive,
  LockKeyhole,
  Palette,
  RefreshCw,
  Router,
  ShieldCheck,
  Smartphone,
  UserRound,
  Wifi,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { DeviceConnection } from '@/components/device-connection';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { deviceToken } from '@/lib/device';
import styles from './system-settings.module.css';

type AccountState = 'checking' | 'signed-in' | 'signed-out' | 'unavailable';

export default function SystemSettings() {
  const [online, setOnline] = useState(true);
  const [connector, setConnector] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [account, setAccount] = useState<AccountState>('checking');
  const [deviceOpen, setDeviceOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);

  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine);
    const updateConnector = () => setConnector(Boolean(deviceToken()));
    const initialize = window.setTimeout(() => {
      updateNetwork();
      updateConnector();
      setStandalone(window.matchMedia('(display-mode: standalone)').matches);
    }, 0);
    void navigator.serviceWorker?.register('/sw.js').catch(() => {});
    const controller = new AbortController();
    void fetch('/api/jobs', { cache: 'no-store', signal: controller.signal })
      .then((response) =>
        setAccount(
          response.status === 401
            ? 'signed-out'
            : response.ok
              ? 'signed-in'
              : 'unavailable',
        ),
      )
      .catch(() => {
        if (!controller.signal.aborted) setAccount('unavailable');
      });
    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    window.addEventListener('loop-device', updateConnector);
    return () => {
      controller.abort();
      window.clearTimeout(initialize);
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      window.removeEventListener('loop-device', updateConnector);
    };
  }, []);

  const accountLabel =
    account === 'checking'
      ? '確認中'
      : account === 'signed-in'
        ? 'サインイン済み'
        : account === 'signed-out'
          ? 'サインインが必要'
          : '状態を確認できません';

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" aria-label="ホームへ戻る">
          <ArrowLeft size={21} />
        </Link>
        <strong>設定</strong>
        <span>1.0</span>
      </header>

      <div className={styles.content}>
        <section className={styles.hero}>
          <span><ShieldCheck size={27} /></span>
          <div>
            <small>ROCKSTAROS</small>
            <h1>この端末を整える</h1>
            <p>接続・権限・保存・更新の状態を、ここで確認できます。</p>
          </div>
        </section>

        <section className={styles.health} aria-label="システム状態">
          <HealthItem icon={<Wifi />} label="ブラウザ接続" value={online ? 'オンライン' : 'オフライン'} state={online ? 'ok' : 'warn'} />
          <HealthItem icon={<Cable />} label="PC Connector" value={connector ? '接続済み' : '未接続'} state={connector ? 'ok' : 'idle'} />
          <HealthItem icon={<UserRound />} label="利用者" value={accountLabel} state={account === 'signed-in' ? 'ok' : 'idle'} />
        </section>

        <SettingsGroup title="自分のOS">
          <SettingLink href="/?edit=1" icon={<Palette />} tone="purple" title="ホーム画面と外観" detail="壁紙・色・アイコン・並び順" />
          <SettingButton icon={<Download />} tone="blue" title="ホーム画面に追加" detail={standalone ? 'アプリとして起動中' : 'iPhone / PCへ追加する手順'} onClick={() => setInstallOpen((open) => !open)} />
          {installOpen && (
            <div className={styles.inlineHelp}>
              iPhoneはSafariの共有から「ホーム画面に追加」、PCはブラウザのインストールを選びます。これはWeb版の追加で、端末OSの書換えではありません。
            </div>
          )}
        </SettingsGroup>

        <SettingsGroup title="接続とアプリ">
          <SettingButton icon={<Cable />} tone="green" title="このPCとMCP" detail={connector ? 'Connector接続済み' : '接続アプリを準備する'} onClick={() => setDeviceOpen(true)} />
          <SettingLink href="/sky/network" icon={<Router />} tone="cyan" title="アプリごとの接続・権限" detail="MCP、実行場所、許可を確認" />
          <SettingLink href="/sky" icon={<Cloud />} tone="sky" title="Skyアプリ管理" detail="探す・接続する・掲載する" />
        </SettingsGroup>

        <SettingsGroup title="アカウントとデータ">
          {account === 'signed-out' ? (
            <SettingAnchor href="/signin-with-chatgpt?return_to=%2Fsettings" icon={<UserRound />} tone="orange" title="サインイン" detail="自分の実行履歴を開く" />
          ) : (
            <SettingRow icon={<UserRound />} tone="orange" title="利用者アカウント" detail={accountLabel} />
          )}
          <SettingRow icon={<HardDrive />} tone="gray" title="保存" detail="外観は端末内、実行記録は本人アカウント" />
          <SettingLink href="/sky/network" icon={<LockKeyhole />} tone="red" title="プライバシーと許可" detail="ツール別に送信先と実行範囲を確認" />
        </SettingsGroup>

        <SettingsGroup title="更新と復旧">
          <SettingButton icon={<RefreshCw />} tone="blue" title="Web UIを更新" detail="公開中の最新版を読み直す" onClick={() => window.location.reload()} />
          <SettingLink href="/rockstaros/guide#recovery" icon={<Smartphone />} tone="gray" title="OS導入・バックアップ・復旧" detail="Developer Previewの手順と制限" />
        </SettingsGroup>

        <p className={styles.boundary}>
          RockstarOS 1.0 Developer Preview。Web画面、QEMU版、物理端末版は別々に管理されています。設定画面だけで端末を書き換えたり、実資金を動かしたりしません。
        </p>
      </div>

      <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}>
        <DialogContent className="rock-tool-dialog">
          <DialogTitle className="rock-dialog-title">このPCを接続</DialogTitle>
          <DialogDescription>
            接続アプリを起動すると、SkyからこのPCのMCPを使えます。
          </DialogDescription>
          <DeviceConnection />
        </DialogContent>
      </Dialog>
    </main>
  );
}

function HealthItem({ icon, label, value, state }: { icon: ReactNode; label: string; value: string; state: 'ok' | 'idle' | 'warn' }) {
  return <div><span className={styles[state]}>{icon}</span><small>{label}</small><strong>{value}</strong></div>;
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return <section className={styles.group}><h2>{title}</h2><div>{children}</div></section>;
}

function IconBox({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`${styles.itemIcon} ${styles[tone]}`}>{children}</span>;
}

function SettingCopy({ title, detail }: { title: string; detail: string }) {
  return <span className={styles.itemCopy}><strong>{title}</strong><small>{detail}</small></span>;
}

type SettingProps = { icon: ReactNode; tone: string; title: string; detail: string };
function SettingLink({ href, icon, tone, title, detail }: SettingProps & { href: string }) {
  return <Link className={styles.item} href={href}><IconBox tone={tone}>{icon}</IconBox><SettingCopy title={title} detail={detail} /><ArrowRight size={17} /></Link>;
}

function SettingAnchor({ href, icon, tone, title, detail }: SettingProps & { href: string }) {
  return <a className={styles.item} href={href} target="_top"><IconBox tone={tone}>{icon}</IconBox><SettingCopy title={title} detail={detail} /><ArrowRight size={17} /></a>;
}

function SettingButton({ icon, tone, title, detail, onClick }: SettingProps & { onClick: () => void }) {
  return <button className={styles.item} onClick={onClick}><IconBox tone={tone}>{icon}</IconBox><SettingCopy title={title} detail={detail} /><ArrowRight size={17} /></button>;
}

function SettingRow({ icon, tone, title, detail }: SettingProps) {
  return <div className={styles.item}><IconBox tone={tone}>{icon}</IconBox><SettingCopy title={title} detail={detail} /><CheckCircle2 size={17} className={styles.rowCheck} /></div>;
}
