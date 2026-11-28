'use client';
/**
 * Agent の詳細（/noah/ready/agent?id=<系列の ID>）。説明・動く所・料金・送り先を見て、「接続」1 回でつなぐ。つないだ後は、道具を選んで頼む所・仕事の一覧・「切る」。
 * 送り先（入力が送られる host）は、つなぐ前に、必ず出す。説明は、提供者が書いた文のまま、文字として出す。
 * 未サインインの人が「接続」を押した後、サインインから戻った時は、この画面が、同じ操作 ID で続ける（押し直さない）。
 * 仕様: docs/noah/spec-74-one-click-connect.md の 11.4・11.5。
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useNoahLocale } from './noah-locale';
import NoahAgentVisual from './noah-agent-visual';
import NoahAppIcon from './noah-app-icon';
import NoahDetailTemplate from './noah-detail-template';
import { PhoneCall, ArrowUpRight, PhoneOutgoing } from 'lucide-react';
import { noahPinTopic } from '@/lib/noah-pins';
import { noahDetailGuide } from '@/lib/noah-detail-guide';
import { noahDetailStarter } from '@/lib/noah-detail-starter';
import pageStyles from './noah-detail-overview.module.css';
import NoahAgentShare from './noah-agent-share';
import NoahDetailPending from './noah-detail-pending';
import { useNoahBrowserReady } from './noah-browser-ready';
import type { NoahDetailPreview } from '@/lib/noah-detail-preview';
import Link from 'next/link';
import { NOAH_REPORT_CONTACT } from '@/lib/noah-bot-notice';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { NOAH_CONNECT_HANDOFF_MS, NOAH_READY_TEXT, noahBadgeText, noahCheckedText, noahConnectionStateText, noahPriceText, noahUsersText, type NoahReadyConnection, type NoahReadyItem } from '@/lib/noah-ready-view';
import NoahRegistrationSheet from './noah-registration-sheet';
import NoahAsk from './noah-ask';
import NoahWorkList from './noah-work-list';
import NoahConnectButton from './noah-connect-button';
import NoahTrialReport from './noah-trial-report';
import NoahPinExtras from './noah-pin-extras';
import NoahDetailPlain from './noah-detail-plain';
import { noahDetailActionNote } from '@/lib/noah-detail-plain';
import { NoahExplanationSection, NoahPackageExplanation } from './noah-agent-explanation';
import type { NoahExplanation } from '@/lib/noah-agent-explanation';
import base from './noah-service.module.css';
import styles from './noah-ready.module.css';

type Detail = NoahReadyItem & { listed: boolean; website: string | null; connection: NoahReadyConnection | null; ownerScope: string | null; accountSignedIn?: boolean; explanation?: NoahExplanation; summaryJa?: string | null; error?: string };
// A schematic waveform for the example, independent of calls or audio recordings.
const WAVEFORM = [8, 14, 20, 10, 29, 44, 24, 17, 36, 56, 70, 51, 32, 59, 85, 68, 47, 29, 39, 72, 100, 78, 55, 74, 47, 28, 41, 66, 49, 33, 23, 39, 51, 30, 18, 11, 23, 16, 9, 5];
type Loaded = { state: 'loading' } | { state: 'missing' } | { state: 'error' } | { state: 'ready'; detail: Detail };
const requestTarget = 'noah-agent-request';
const askIntentKey = (id: string) => `noah-agent-first-request:${id}`;

/** tool: 最初に選んでおく道具（棚のカードから来た時。/noah/ready/agent?tool=…）。from: そのカードの ID（試行の本人の報告を、下に出す）。 */
export default function NoahReadyDetail({ id, tool = null, from = null, internalOnly = false, sourceNotes, trailer, mediaId, feedbackId, preview: cardPreview }: { id: string; tool?: string | null; from?: string | null; internalOnly?: boolean; sourceNotes?: ReactNode; trailer?: ReactNode; mediaId?: string; feedbackId?: string; preview?: NoahDetailPreview }) {
  const {t, locale}=useNoahLocale();
  const browserReady = useNoahBrowserReady();
  // 読んだ詳細は、何回目の読み取りの物かと一緒に持つ（「読み直す」を押したら、届くまでは「読み込み中」）。
  const [result, setResult] = useState<{ attempt: number; loaded: Loaded } | null>(null), [connection, setConnection] = useState<NoahReadyConnection | null>(null);
  const [cutting, setCutting] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  // 頼むたびに進める数（下の「仕事」が、すぐ読み直す）。
  const [asked, setAsked] = useState(0);
  const connectForm = useId();
  const request = useRef<HTMLDivElement>(null);
  const askIntent = useRef<{ id: string; example: boolean } | null>(null);
  const [exampleConnection, setExampleConnection] = useState<string | null>(null);
  const epoch = useRef(0);
  // 形の違う ID は、問い合わせずに「見つかりません」。
  const valid = id.length >= 3 && id.length <= 400;
  const loaded: Loaded = !valid ? { state: 'missing' } : result?.attempt === attempt ? result.loaded : { state: 'loading' };
  const connectedId = connection?.state === 'connected' ? connection.id : null;
  const activeAgentId = loaded.state === 'ready' ? loaded.detail.id : null;

  function focusRequest() {
    request.current?.focus({ preventScroll: true });
    request.current?.scrollIntoView({ block: 'start' });
  }

  function rememberAsk(agentId: string, example: boolean) {
    askIntent.current = { id: agentId, example };
    try {
      // Only the choice of an editorial example crosses sign-in, never input values.
      window.sessionStorage.setItem(askIntentKey(agentId), JSON.stringify({ example, at: Date.now() }));
    } catch { /* The current view can still continue without browser storage. */ }
  }

  useEffect(() => {
    if (!connectedId || !activeAgentId) return;
    const agentId = activeAgentId;
    let example = askIntent.current?.id === agentId ? askIntent.current.example : null;
    if (askIntent.current?.id === agentId) askIntent.current = null;
    try {
      const key = askIntentKey(agentId);
      const saved = JSON.parse(window.sessionStorage.getItem(key) ?? 'null') as { example?: boolean; at?: number } | null;
      window.sessionStorage.removeItem(key);
      if (example === null && typeof saved?.example === 'boolean' && typeof saved.at === 'number' && Date.now() - saved.at < NOAH_CONNECT_HANDOFF_MS) example = saved.example;
    } catch { /* A request can still be opened from the header. */ }
    if (example === null) return;
    if (example) setExampleConnection(connectedId);
    focusRequest();
  }, [connectedId, activeAgentId]);

  useEffect(() => {
    if (!valid || !browserReady) return;
    const current = ++epoch.current;
    const done = (next: Loaded) => { if (current === epoch.current) setResult({ attempt, loaded: next }); };
    void fetch(`/api/noah/intake?${new URLSearchParams({ id }).toString()}`, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as Detail;
      if (current !== epoch.current) return;
      if (response.status === 404) { done({ state: 'missing' }); return; }
      if (response.status !== 200 || typeof body.id !== 'string') { done({ state: 'error' }); return; }
      done({ state: 'ready', detail: body });
      setConnection(body.connection ?? null);
    }).catch(() => done({ state: 'error' }));
  }, [id, attempt, valid, browserReady]);

  if (loaded.state === 'loading') return <NoahDetailPending href={`/noah/ready/agent?${new URLSearchParams({ id })}`} card={cardPreview} />;
  if (loaded.state !== 'ready') return <main className={`${base.page} ${styles.page} ${pageStyles.page}`}>
    {loaded.state === 'missing' && <p className={base.empty}>{t(NOAH_READY_TEXT.missing)}</p>}
    {loaded.state === 'error' && <div className={base.empty} role="alert"><p>{t(NOAH_READY_TEXT.unavailable)}</p><button type="button" onClick={() => setAttempt((n) => n + 1)}>{t("読み直す")}</button></div>}
  </main>;

  const { detail } = loaded, hasWorkspace = detail.ownerScope !== null;
  const signedIn = detail.accountSignedIn ?? hasWorkspace;
  const live = connection && connection.state !== 'disconnected' ? connection : null;
  const checked = noahCheckedText(detail.checkedAt);
  const guide = noahDetailGuide(detail.id, locale);
  const preview = guide?.examples[0];
  const starter = !from && !tool ? noahDetailStarter(detail.id, detail.host, locale) : null;
  const translated = locale === 'ja' ? detail.summaryJa : null;
  const lead = guide?.summary || starter?.summary || translated || detail.summary;
  const pitch = guide?.headline || starter?.headline;
  const connected = live?.state === 'connected';
  const facts = [noahBadgeText(detail.connect, !signedIn && !live), detail.connect.placeLabel, guide?.priceLabel || noahPriceText(detail.connect.price), noahUsersText(detail.users), detail.tools > 0 ? `道具 ${detail.tools} 個` : null].filter((text): text is string => !!text);

  async function cut(current: NoahReadyConnection) {
    if (cutting) return;
    setCutting(true); setError('');
    try {
      const response = await fetch(`/api/noah/connect/${current.id}`, {
        method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(detail.ownerScope ? { [OWNER_SCOPE_HEADER]: detail.ownerScope } : {}) },
        body: JSON.stringify({ action: 'disconnect', revision: current.revision }),
      });
      const body = await response.json() as { id?: string; state?: string; revision?: number; error?: string; connection?: NoahReadyConnection };
      if (response.status === 200 && typeof body.id === 'string' && typeof body.state === 'string' && typeof body.revision === 'number') {
        setConnection({ id: body.id, state: body.state, revision: body.revision, error: null });
        // 切ると、終わっていない依頼は止まる。仕事の一覧を、読み直す。
        setAsked((n) => n + 1);
        try { window.sessionStorage.removeItem(`noah-tools:${current.id}`); } catch { /* 控えが残っても、次に開く時は読み直す。 */ }
      } else {
        // 版が古かった時は、返ってきた今の接続に合わせる（もう 1 回押せば、切れる）。
        if (body.connection) setConnection(body.connection);
        setError(body.error ?? NOAH_READY_TEXT.offline);
      }
    } catch { setError(NOAH_READY_TEXT.offline); } finally { setCutting(false); }
  }
  /** 道具の一覧が「この接続は使えない」と返した時: 接続の今の状態を読み直す（取り下げなら、理由が出る）。 */
  function refresh(current: NoahReadyConnection) {
    void fetch(`/api/noah/connect/${current.id}`, { cache: 'no-store' }).then(async (response) => {
      const body = await response.json() as { id?: string; state?: string; revision?: number; error?: string };
      if (response.status === 200 && typeof body.id === 'string' && typeof body.state === 'string' && typeof body.revision === 'number') setConnection({ id: body.id, state: body.state, revision: body.revision, error: body.error ?? null });
    }).catch(() => undefined);
  }

  const starterExample = starter && <section className={pageStyles.starter}>
    <h2>{t('依頼例')}</h2>
    <p>{starter.input}</p>
    {connected ? <button type="button" className={pageStyles.starterAction} onClick={() => { setExampleConnection(connectedId); focusRequest(); }}>{t('この例を使う')}</button>
      : detail.listed && !live && <button type="submit" form={connectForm} value="example" className={pageStyles.starterAction}>{t('この例を使う')}</button>}
  </section>;

  return <NoahDetailTemplate id={detail.id} mediaId={mediaId} name={detail.pin?.title ?? guide?.name ?? detail.name} provider={detail.provider || undefined}
    pin={detail.pin}
    summary={lead || t('（説明はありません）')} artSummary={detail.summary || undefined} overviewTitle={pitch}
    original={translated && lead === translated ? detail.summary : undefined}
    feedbackId={detail.listed ? feedbackId ?? detail.id : undefined}
    actionNote={detail.listed ? t(noahDetailActionNote({ signedIn, connected, typed: detail.connect.typed, need: detail.connect.need ?? null })) : undefined}
    facts={<ul aria-label={t('つなぎ方')}>{facts.map((text) => <li key={text}>{t(text)}</li>)}</ul>}
    explain={<NoahDetailPlain steps={detail.explanation?.steps} host={detail.host} provider={detail.provider} signedIn={signedIn} connected={connected} uses={!guide} />}
    detailsLabel={detail.explanation ? t('操作の流れと道具') : undefined}
    icon={guide ? <span className={pageStyles.phoneMark} aria-hidden="true"><PhoneCall size={26} strokeWidth={1.8} /></span>
      : <NoahAppIcon name={detail.name} topic={noahPinTopic(detail.name, detail.summary)} className={pageStyles.appMark} />}
    meta={<>{guide ? <a href="#noah-guide-terms">{guide.priceLabel}</a> : <span>{t(noahPriceText(detail.connect.price))}</span>}{detail.host && <span>{t('送信先: {host}',{host:detail.host})}</span>}</>}
    action={<>
      {connected && <a className={styles.primary} href={`#${requestTarget}`} onClick={(event) => { event.preventDefault(); focusRequest(); }}>{t('依頼する')}</a>}
      <NoahConnectButton agentId={detail.id} listed={detail.listed} signedIn={signedIn} ownerScope={detail.ownerScope} connection={live} onChange={setConnection} resume askAs="none" packageId={from} initialTool={tool} onboarding={{ formId: starter ? connectForm : undefined, host: detail.host, beforeConnect: (example) => rememberAsk(detail.id, example) }} />
    </>}
    intro={starterExample}
    requestForm={connected && <div id={requestTarget} ref={request} tabIndex={-1} className={pageStyles.request}>
      <NoahAsk agentId={detail.id} agentName={detail.name} key={live.id} connectionId={live.id} initialTool={tool} starter={exampleConnection === live.id ? starter : null} ownerScope={detail.ownerScope} onUnusable={() => refresh(live)} onAsked={() => setAsked((n) => n + 1)} />
    </div>}>
    <article className={pageStyles.overview}>
      {preview && <figure className={pageStyles.memo} aria-label={t('通話メモの見本')}>
        <figcaption><PhoneOutgoing size={19} strokeWidth={1.8} aria-hidden="true" />{t('通話メモの見本')}</figcaption>
        <div className={pageStyles.wave} aria-hidden="true">{WAVEFORM.map((height, i) => <i key={i} style={{ height: height + '%' }} />)}</div>
        <h3>{preview.title}</h3>
        <dl className={pageStyles.sample}>
          <div><dt>{t('依頼例')}</dt><dd>{preview.input}</dd></div>
          <div><dt>{t('返答の例')}</dt><dd>{preview.output}</dd></div>
        </dl>
      </figure>}
      {trailer}
      {guide && <>
        {guide.examples.length > 1 && <section className={pageStyles.block} aria-labelledby="noah-guide-examples">
          <h2 id="noah-guide-examples">{t('ほかの使い方')}</h2>
          <div className={pageStyles.examples}>{guide.examples.slice(1).map(example => <div className={pageStyles.example} key={example.title}>
            <h3>{example.title}</h3>
            <dl><div><dt>{t('依頼例')}</dt><dd>{example.input}</dd></div><div><dt>{t('返答の例')}</dt><dd>{example.output}</dd></div></dl>
          </div>)}</div>
        </section>}
        <section className={pageStyles.block} id="noah-guide-terms" aria-labelledby="noah-guide-terms-title">
          <h2 id="noah-guide-terms-title">{t('準備と料金')}</h2>
          <dl className={pageStyles.requirements}>
            {guide.requirements.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.text}</dd></div>)}
            {detail.connect.badge === 'unverified' && detail.connect.level === 1 && <div><dt>{t('Noahでの確認')}</dt><dd>{t('接続先の応答を確認済みです。Noahでの実通話は未確認です。')}</dd></div>}
          </dl>
          {guide.sources.length > 0 && <div className={pageStyles.links}>{guide.sources.map(source => <a key={source.href} href={source.href} target="_blank" rel="noopener noreferrer nofollow">{source.label}<ArrowUpRight size={15} aria-hidden="true" /></a>)}</div>}
        </section>
      </>}
      {detail.explanation && <NoahExplanationSection explanation={detail.explanation} summary="" connected={connected} />}
      {from && <NoahPackageExplanation key={from} id={from} familyId={detail.id} tool={tool} />}
      {live?.state!=='connected' && <NoahRegistrationSheet agentId={detail.id}/>}
    </article>

    {/* 仕事（この Agent への依頼と成果）。ブラウザの保存先も含め、本人の成果を出す。 */}
    {hasWorkspace && <div id="noah-agent-work" tabIndex={-1}><NoahWorkList key={`work:${detail.id}`} agentId={detail.id} ownerScope={detail.ownerScope} refresh={asked} /></div>}
    <details className={styles.agentDetails}>
      <summary>{t('Agentの詳細')}</summary>
      {detail.summary && detail.summary !== lead && <p className={styles.description}>{detail.summary}</p>}
      {!guide && <NoahAgentVisual name={detail.name} summary={detail.summary}/>}
      {checked && <p className={styles.quiet}>{t(checked)}</p>}
      {detail.website && <p className={styles.quiet}>{internalOnly ? <span>提供元: {detail.website}</span> : <a href={detail.website} target="_blank" rel="noopener noreferrer nofollow">{t("提供者のページ（")}{new URL(detail.website).hostname}）</a>}</p>}
      {detail.listed && <NoahAgentShare id={detail.id} name={detail.name} summary={lead} />}
    </details>
    {detail.listed && <NoahPinExtras key={`pin:${detail.id}`} item={detail} ownerScope={detail.ownerScope} />}
    {/* 棚のカードから来た時: 試行の本人の報告と、5 人以上の報告の合計（切り替えが閉の間は、何も出ない）。頼んだ後に、入れられるかを読み直す。 */}
    {from && <NoahTrialReport key={`trial:${from}:${asked}`} packageId={from} />}

    {live && <section className={styles.section} aria-label={t("この接続")}>
      <div className={styles.cut}>
        <p>{t(noahConnectionStateText(live.state))}</p>
        <button type="button" className={styles.secondary} disabled={cutting} onClick={() => void cut(live)}>{cutting ? t("切っています…") : t("切る")}</button>
      </div>
      <p className={styles.quiet}>{t(NOAH_READY_TEXT.cutNote)}</p>
      {error && <p className={styles.reason} role="alert">{t(error)}</p>}
    </section>}

    {sourceNotes}
    <footer className={styles.source}><p>{t(guide ? '登録情報はOfficial MCP Registryの掲載内容です。' : NOAH_READY_TEXT.source)}{NOAH_REPORT_CONTACT && <> <Link href="/noah/help#bot">{t(NOAH_READY_TEXT.report)} →</Link></>}</p></footer>
  </NoahDetailTemplate>;
}
