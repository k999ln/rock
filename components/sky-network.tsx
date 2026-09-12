'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CircleDollarSign,
  Cloud,
  Fingerprint,
  KeyRound,
  Laptop2,
  Link2,
  Network,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
  WalletCards,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import WorkspaceShell from '@/components/workspace-shell';
import styles from '@/components/sky-network.module.css';

type CheckState = 'idle' | 'checking' | 'ready';
type Audience = 'tob' | 'toc';

const checkSteps = [
  { label: 'Identify', detail: '作者・版・接続方式' },
  { label: 'Inspect', detail: '権限・送信先・料金' },
  { label: 'Covenant', detail: '今回だけの実行契約' },
  { label: 'Payout', detail: '受取人と証跡を固定' },
];

const trustStack = [
  {
    number: '01',
    Icon: Fingerprint,
    title: 'Connection Passport',
    body: 'ツール、作者、OAuth、価格、受取人を同じ接続証明へ固定。',
  },
  {
    number: '02',
    Icon: ShieldCheck,
    title: 'Execution Covenant',
    body: 'データ、送信先、予算、期限を呼び出しごとの短命契約に。',
  },
  {
    number: '03',
    Icon: ReceiptText,
    title: 'Contribution Receipt',
    body: '誰のツール・データ・確認が成果に使われたかを検証。',
  },
  {
    number: '04',
    Icon: RefreshCw,
    title: 'Reconciled Settlement',
    body: '取消や不明状態を残し、二重実行・二重分配を防止。',
  },
];

export default function SkyNetwork() {
  const [source, setSource] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [audience, setAudience] = useState<Audience>('tob');
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
    }, 900);
  }

  function useDemo() {
    setSource('https://demo.sky.local/mcp');
    setCheckState('idle');
  }

  return (
    <WorkspaceShell title="Sky Network" contentClassName={styles.shell}>
      <div className={styles.page}>
        <header className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <span /> SKY NETWORK · DEVELOPER PREVIEW
            </p>
            <h1>
              つなぐのは、一度。
              <br />
              <em>価値は、正しく届く。</em>
            </h1>
            <p className={styles.lede}>
              MCPの接続、安全確認、実行契約、ToB・ToCへの分配まで。
              <br />
              Skyが一つの証跡でつなぎます。
            </p>
            <div className={styles.heroBadges}>
              <span>
                <Building2 size={15} /> ToB利用料 0円
              </span>
              <span>
                <CircleDollarSign size={15} /> Sky売上手数料 0%
              </span>
              <span className={styles.previewBadge}>
                <Zap size={15} /> LIVE送金 OFF
              </span>
            </div>
          </div>
          <div className={styles.heroOrb} aria-hidden="true">
            <span className={styles.orbitOne} />
            <span className={styles.orbitTwo} />
            <span className={styles.orbitThree} />
            <span className={styles.orbCore}>S</span>
            <i className={styles.orbNodeOne} />
            <i className={styles.orbNodeTwo} />
            <i className={styles.orbNodeThree} />
          </div>
        </header>

        <section className={styles.connectGrid} aria-labelledby="connect-title">
          <div className={styles.connectPanel}>
            <div className={styles.sectionLabel}>
              <span>01</span>
              <p>CONNECT</p>
              <small>フロント検証デモ</small>
            </div>
            <div className={styles.connectHeading}>
              <div>
                <h2 id="connect-title">MCPを接続する</h2>
                <p>URL・Registry名・packageのいずれかを入力</p>
              </div>
              <Link href="/sky/publish">
                掲載フォーム <ArrowRight size={15} />
              </Link>
            </div>

            <form
              className={styles.connectForm}
              onSubmit={(event) => {
                event.preventDefault();
                inspect();
              }}
            >
              <div className={styles.sourceInput}>
                <Link2 size={19} aria-hidden="true" />
                <input
                  value={source}
                  onChange={(event) => {
                    setSource(event.target.value);
                    setCheckState('idle');
                  }}
                  aria-label="MCP URL、Registry名、またはpackage"
                  placeholder="https://example.com/mcp"
                />
              </div>
              <button disabled={!source.trim() || checkState === 'checking'}>
                {checkState === 'checking' ? (
                  <RefreshCw className={styles.spin} size={17} />
                ) : (
                  <Sparkles size={17} />
                )}
                {checkState === 'checking' ? '確認中' : '接続を確認'}
              </button>
            </form>
            <button type="button" className={styles.demoLink} onClick={useDemo}>
              デモ用アドレスを入れる
            </button>

            <div className={styles.checkRail} data-state={checkState}>
              {checkSteps.map((step, index) => (
                <div className={styles.checkStep} key={step.label}>
                  <span>
                    {checkState === 'ready' ? <Check size={14} /> : index + 1}
                  </span>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </div>
              ))}
            </div>

            <div className={styles.passport} data-state={checkState}>
              {checkState === 'idle' && (
                <div className={styles.emptyPassport}>
                  <Fingerprint size={26} />
                  <p>入力すると、Connection Passportの見え方を確認できます。</p>
                </div>
              )}
              {checkState === 'checking' && (
                <div className={styles.emptyPassport}>
                  <RefreshCw className={styles.spin} size={26} />
                  <p>接続方式と公開情報を確認しています…</p>
                </div>
              )}
              {checkState === 'ready' && (
                <>
                  <div className={styles.passportHeader}>
                    <div>
                      <BadgeCheck size={21} />
                      <span>
                        <small>CONNECTION PASSPORT</small>
                        <strong>接続条件を確認しました</strong>
                      </span>
                    </div>
                    <em>DEMO</em>
                  </div>
                  <div className={styles.passportFacts}>
                    <div>
                      <span>Transport</span>
                      <strong>Streamable HTTP</strong>
                    </div>
                    <div>
                      <span>Identity</span>
                      <strong>Demo publisher</strong>
                    </div>
                    <div>
                      <span>OAuth audience</span>
                      <strong>接続時に固定</strong>
                    </div>
                    <div>
                      <span>Sky fee for ToB</span>
                      <strong className={styles.zero}>0%</strong>
                    </div>
                  </div>
                  <p className={styles.demoNotice}>
                    これは合成表示です。外部MCPへの通信、資格情報の取得、公開、課金は行っていません。
                  </p>
                </>
              )}
            </div>
          </div>

          <aside className={styles.promiseCard}>
            <div className={styles.promiseTop}>
              <p>THE PROMISE</p>
              <span>FOR ToB</span>
            </div>
            <strong className={styles.zeroPrice}>¥0</strong>
            <h2>企業からは、取らない。</h2>
            <p>
              登録も、接続も、公開も、Skyの売上手数料も0円。良いツールが入るほど、Sky全体が強くなる設計です。
            </p>
            <ul>
              <li>
                <Check size={15} /> 登録・接続・基本検査
              </li>
              <li>
                <Check size={15} /> 公開・更新・利用分析
              </li>
              <li>
                <Check size={15} /> ToB商品売上のSky手数料
              </li>
            </ul>
            <div className={styles.costBoundary}>
              <KeyRound size={17} />
              <p>
                決済・API・モデル・クラウド等の外部実費は、Sky手数料と分けて事前表示します。
              </p>
            </div>
          </aside>
        </section>

        <section className={styles.stackSection} aria-labelledby="stack-title">
          <div className={styles.sectionIntro}>
            <p className={styles.eyebrow}>THE TRUST STACK</p>
            <h2 id="stack-title">簡単さの裏側を、強くする。</h2>
            <p>
              接続だけを簡単にするのではなく、接続後の権限とお金まで同じ仕組みで守ります。
            </p>
          </div>
          <div className={styles.stackGrid}>
            {trustStack.map(({ number, Icon, title, body }) => (
              <article key={number}>
                <div>
                  <span>{number}</span>
                  <Icon size={20} />
                </div>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.valueSection} aria-labelledby="value-title">
          <div className={styles.valueHeader}>
            <div>
              <p className={styles.eyebrow}>02 · VALUE FLOW</p>
              <h2 id="value-title">払う人と、受け取る人を透明に。</h2>
            </div>
            <div className={styles.audienceSwitch} aria-label="対象を切り替え">
              <button
                aria-pressed={audience === 'tob'}
                onClick={() => setAudience('tob')}
              >
                <Building2 size={15} /> ToB
              </button>
              <button
                aria-pressed={audience === 'toc'}
                onClick={() => setAudience('toc')}
              >
                <UserRound size={15} /> ToC
              </button>
            </div>
          </div>

          <div className={styles.flowGrid}>
            <div className={styles.flowDiagram}>
              <div className={styles.flowNode}>
                <Users size={21} />
                <span>
                  <small>VALUE SOURCE</small>
                  <strong>ToC · Sky Pass</strong>
                </span>
              </div>
              <ArrowRight className={styles.flowArrow} size={19} />
              <div className={`${styles.flowNode} ${styles.poolNode}`}>
                <WalletCards size={21} />
                <span>
                  <small>VERIFIED POOL</small>
                  <strong>Sky reward pool</strong>
                </span>
              </div>
              <ArrowRight className={styles.flowArrow} size={19} />
              <div className={styles.recipientStack}>
                <span>
                  <Building2 size={16} /> MCP提供者
                </span>
                <span>
                  <Laptop2 size={16} /> 計算資源
                </span>
                <span>
                  <UserRound size={16} /> データ・確認
                </span>
              </div>
            </div>

            <article className={styles.audienceCard}>
              {audience === 'tob' ? (
                <>
                  <div className={styles.audienceIcon}>
                    <Building2 size={22} />
                  </div>
                  <p className={styles.audienceKicker}>ToB · PROVIDER</p>
                  <h3>売上は、提供者のもの。</h3>
                  <div className={styles.receiptLine}>
                    <span>商品価格</span>
                    <strong>ToBが設定</strong>
                  </div>
                  <div className={styles.receiptLine}>
                    <span>Sky売上手数料</span>
                    <strong className={styles.zero}>0%</strong>
                  </div>
                  <div className={styles.receiptLine}>
                    <span>外部実費</span>
                    <strong>別表示</strong>
                  </div>
                  <p className={styles.audienceFootnote}>
                    受取人はConnection
                    Passportへ固定。実際の払出は本人確認済み決済providerを使う設計です。
                  </p>
                </>
              ) : (
                <>
                  <div className={styles.audienceIcon}>
                    <UserRound size={22} />
                  </div>
                  <p className={styles.audienceKicker}>ToC · PARTICIPANT</p>
                  <h3>使うだけでなく、貢献できる。</h3>
                  <div className={styles.receiptLine}>
                    <span>対象候補</span>
                    <strong>データ・評価・計算</strong>
                  </div>
                  <div className={styles.receiptLine}>
                    <span>報酬条件</span>
                    <strong>receiptで検証</strong>
                  </div>
                  <div className={styles.receiptLine}>
                    <span>取消・重複</span>
                    <strong>確定前に照合</strong>
                  </div>
                  <p className={styles.audienceFootnote}>
                    対象貢献、分配率、最低払出額、本人確認は未確定。現在は合成表示のみです。
                  </p>
                </>
              )}
            </article>
          </div>
        </section>

        <section className={styles.deviceStrip}>
          <div>
            <p className={styles.eyebrow}>ONE CONTRACT · EVERYWHERE</p>
            <h2>一つの許可を、必要な場所だけへ。</h2>
          </div>
          <div className={styles.deviceList}>
            <span>
              <Smartphone size={18} /> Device
            </span>
            <span>
              <Laptop2 size={18} /> PC
            </span>
            <span>
              <Cloud size={18} /> Cloud
            </span>
            <i aria-hidden="true" />
            <span className={styles.contractChip}>
              <Network size={18} /> 権限は増えない
            </span>
          </div>
        </section>

        <footer className={styles.pageFooter}>
          <p>
            Sky
            Networkは設計プレビューです。実MCP接続、現金保管、報酬分配、実送金は有効化していません。
          </p>
          <Link href="/sky/publish">
            無料でツールを掲載する <ArrowRight size={16} />
          </Link>
        </footer>
      </div>
    </WorkspaceShell>
  );
}
