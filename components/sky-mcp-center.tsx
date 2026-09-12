'use client';

import {
  BadgeCheck,
  Building2,
  Check,
  Fingerprint,
  Link2,
  Network,
  Plus,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import styles from '@/components/sky-mcp-center.module.css';

type View = 'connect' | 'manage';
type CheckState = 'idle' | 'checking' | 'ready';

const steps = [
  ['1', '識別', '作者・版'],
  ['2', '検査', '権限・料金'],
  ['3', '契約', '実行範囲'],
  ['4', '証跡', '受取人'],
] as const;

export default function SkyMcpCenter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [view, setView] = useState<View>('connect');
  const [source, setSource] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const timeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  function inspect() {
    if (!source.trim()) return;
    setCheckState('checking');
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setCheckState('ready');
      timeoutRef.current = null;
    }, 700);
  }

  return (
    <>
      <section className={styles.rail} aria-label="MCP接続状態">
        <div className={styles.railIcon} aria-hidden="true">
          <Network size={20} />
        </div>
        <div className={styles.railCopy}>
          <div>
            <strong>MCP</strong>
            <span>SKY CORE</span>
          </div>
          <p>外部接続 0件 · 内蔵MCP 1件</p>
        </div>
        <span className={styles.offlineStatus}>
          <i /> 実接続 OFF
        </span>
        <button
          className={styles.manageButton}
          onClick={() => onOpenChange(true)}
        >
          <Plus size={16} />
          接続・管理
        </button>
      </section>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={styles.dialog}>
          <header className={styles.dialogHeader}>
            <div className={styles.dialogTitleRow}>
              <span className={styles.dialogMark}>
                <Network size={21} />
              </span>
              <div>
                <DialogTitle>MCP接続・管理</DialogTitle>
                <DialogDescription>
                  Skyから使うMCPと、その権限・料金・受取人を確認します。
                </DialogDescription>
              </div>
            </div>
            <div className={styles.policyBadges}>
              <span>
                <Building2 size={14} /> ToB利用料 0円
              </span>
              <span className={styles.liveOff}>実接続 OFF</span>
            </div>
          </header>

          <div className={styles.tabs} role="tablist" aria-label="MCPメニュー">
            <button
              role="tab"
              aria-selected={view === 'connect'}
              onClick={() => setView('connect')}
            >
              接続する
            </button>
            <button
              role="tab"
              aria-selected={view === 'manage'}
              onClick={() => setView('manage')}
            >
              管理 <span>1</span>
            </button>
          </div>

          {view === 'connect' ? (
            <div className={styles.connectView}>
              <form
                className={styles.connectForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  inspect();
                }}
              >
                <label htmlFor="sky-mcp-source">
                  MCPのURL・Registry名・package
                </label>
                <div className={styles.inputRow}>
                  <div className={styles.inputWrap}>
                    <Link2 size={18} aria-hidden="true" />
                    <input
                      id="sky-mcp-source"
                      value={source}
                      onChange={(event) => {
                        setSource(event.target.value);
                        setCheckState('idle');
                      }}
                      placeholder="https://example.com/mcp"
                    />
                  </div>
                  <button
                    className={styles.inspectButton}
                    disabled={!source.trim() || checkState === 'checking'}
                  >
                    {checkState === 'checking' ? (
                      <RefreshCw className={styles.spin} size={16} />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    {checkState === 'checking' ? '確認中' : '安全確認'}
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.demoButton}
                  onClick={() => {
                    setSource('https://demo.sky.local/mcp');
                    setCheckState('idle');
                  }}
                >
                  デモ用アドレスを入力
                </button>
              </form>

              <div className={styles.steps} data-state={checkState}>
                {steps.map(([number, title, detail]) => (
                  <div key={number}>
                    <span>
                      {checkState === 'ready' ? <Check size={13} /> : number}
                    </span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </div>
                ))}
              </div>

              <section className={styles.passport} data-state={checkState}>
                {checkState === 'idle' && (
                  <div className={styles.emptyState}>
                    <Fingerprint size={25} />
                    <div>
                      <strong>Connection Passportを作成</strong>
                      <p>
                        接続前に、作者・権限・費用・受取人を一枚で確認します。
                      </p>
                    </div>
                  </div>
                )}
                {checkState === 'checking' && (
                  <div className={styles.emptyState}>
                    <RefreshCw className={styles.spin} size={25} />
                    <div>
                      <strong>公開情報を確認中</strong>
                      <p>外部への接続や資格情報の送信は行っていません。</p>
                    </div>
                  </div>
                )}
                {checkState === 'ready' && (
                  <>
                    <div className={styles.passportHeading}>
                      <div>
                        <BadgeCheck size={20} />
                        <span>
                          <small>CONNECTION PASSPORT</small>
                          <strong>接続条件を確認しました</strong>
                        </span>
                      </div>
                      <em>DEMO</em>
                    </div>
                    <div className={styles.facts}>
                      <div>
                        <span>Transport</span>
                        <strong>Streamable HTTP</strong>
                      </div>
                      <div>
                        <span>OAuth audience</span>
                        <strong>接続時に固定</strong>
                      </div>
                      <div>
                        <span>実行許可</span>
                        <strong>呼出しごと</strong>
                      </div>
                      <div>
                        <span>SkyのToB手数料</span>
                        <strong className={styles.zero}>0%</strong>
                      </div>
                    </div>
                    <p className={styles.syntheticNote}>
                      合成表示です。外部MCPへの通信、公開、課金、送金は行っていません。
                    </p>
                  </>
                )}
              </section>

              <div className={styles.trustRow}>
                <span>
                  <ShieldCheck size={16} /> 実行範囲を固定
                </span>
                <span>
                  <WalletCards size={16} /> 分配receiptを照合
                </span>
                <p>決済・API・モデル等の外部実費は別表示</p>
              </div>
            </div>
          ) : (
            <div className={styles.manageView}>
              <section className={styles.manageSummary}>
                <div>
                  <span>外部MCP</span>
                  <strong>0</strong>
                  <small>接続なし</small>
                </div>
                <div>
                  <span>内蔵MCP</span>
                  <strong>1</strong>
                  <small>Developer Preview</small>
                </div>
                <div>
                  <span>要確認</span>
                  <strong>0</strong>
                  <small>現在なし</small>
                </div>
              </section>
              <article className={styles.connectionCard}>
                <span className={styles.toolMark}>服</span>
                <div>
                  <p>内蔵MCP · PC接続後</p>
                  <strong>Instagram運用・受注型ブランド管理</strong>
                  <small>危険操作は個別承認 · 初期状態はmock</small>
                </div>
                <span className={styles.previewState}>PREVIEW</span>
              </article>
              <button
                className={styles.addAnother}
                onClick={() => setView('connect')}
              >
                <Plus size={16} /> 新しいMCPを接続
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
