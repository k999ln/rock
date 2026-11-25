'use client';
import { useNoahLocale } from './noah-locale';
/**
 * 接続のボタン。「接続」を 1 回押すと、計画を読み、つなぎ、「頼む」に変わる。失敗の時は、理由と「もう一度」。
 * 未サインインの人が押した時は、続き（操作 ID と Agent の ID だけ）を置いて、サインインの画面へ移る。
 * 戻った詳細の画面が、同じ操作 ID で続ける（押し直さない）。押せるかどうかを決めるのは、いつも API の側。
 * 仕様: docs/noah/spec-74-one-click-connect.md の 5.2・6.1・6.3・11.4・11.5。
 */
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import {
  NOAH_READY_TEXT, noahConnectButtonView, noahConnectionPreparing, noahReadyAccountHref, noahReadyDetailHref,
  takeNoahConnectHandoff, writeNoahConnectHandoff, type NoahReadyConnection,
} from '@/lib/noah-ready-view';
import styles from './noah-ready.module.css';
import NoahLoading from './noah-loading';
import { noahHaptic } from '@/lib/noah-haptics';
import { prepareNoahConnectionSound, type NoahConnectionSound } from '@/lib/noah-connection-sound';
import overview from './noah-detail-overview.module.css';

type Reply = { id?: string; state?: string; revision?: number; error?: string; placeLabel?: string | null; planSha256?: string; connection?: NoahReadyConnection };
const asConnection = (body: Reply): NoahReadyConnection | null =>
  typeof body.id === 'string' && typeof body.state === 'string' && typeof body.revision === 'number' ? { id: body.id, state: body.state, revision: body.revision, error: body.error ?? null } : null;

export default function NoahConnectButton({ agentId, listed, signedIn, ownerScope, connection, onChange, resume = false, askAs = 'link', packageId = null, initialTool = null, onboarding }: {
  /** 系列の ID。 */
  agentId: string;
  /** 棚のカードから来た時、そのカードの ID（つなげる数を、カードで数えるため）。 */
  packageId?: string | null;
  /** サインイン後も、選んでいた仕事の入力へ戻す。入力値はURLへ入れない。 */
  initialTool?: string | null;
  /** 一覧に載せているか。載せていない物は、つなげない。 */
  listed: boolean;
  signedIn: boolean;
  ownerScope: string | null;
  /** その本人の、切っていない接続。無ければ null。 */
  connection: NoahReadyConnection | null;
  onChange: (connection: NoahReadyConnection) => void;
  /** 詳細の画面だけ: サインインから戻った時に、置いてあった続きを行う。 */
  resume?: boolean;
  /** つながった後の主ボタン。一覧では「頼む」（詳細へ移る）。詳細では出さない（すぐ下に、道具の一覧が出る）。 */
  askAs?: 'link' | 'none';
  onboarding?: { formId?: string; host: string | null; beforeConnect: (example: boolean) => void };
}) {
  const {t}=useNoahLocale();

  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<boolean | null>(null);
  const confirmationId = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => { if (confirmation !== null) cancel.current?.focus(); }, [confirmation]);
  // 応答が届かなかった「接続」は、押し直した時に、同じ操作 ID で送る（行と握手が増えない）。応答が届いたら、次は新しい ID。
  const operation = useRef<string | null>(null), started = useRef(false);
  const sound = useRef<NoahConnectionSound | null>(null), feedbackPending = useRef(false), inFlight = useRef(false);
  const detail = noahReadyDetailHref(agentId, { tool: initialTool, from: packageId });
  const view = noahConnectButtonView({ connection, busy, listed });
  function clearFeedback() { feedbackPending.current = false; sound.current?.dispose(); sound.current = null; }
  function connectedFeedback() {
    if (!feedbackPending.current) return;
    feedbackPending.current = false;
    noahHaptic('success'); sound.current?.play(); sound.current = null;
  }
  useEffect(() => () => clearFeedback(), []);

  async function call(path: string, body?: unknown): Promise<{ status: number; body: Reply }> {
    const response = await fetch(path, {
      cache: 'no-store', method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json', ...(ownerScope ? { [OWNER_SCOPE_HEADER]: ownerScope } : {}) } : {},
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json() as Reply };
  }
  function leaveToSignIn(id: string) {
    try { writeNoahConnectHandoff(window.sessionStorage, { agentId, id, at: Date.now() }); } catch { /* 保存できないブラウザでも、同じ詳細へログインして戻れる。 */ }
    window.location.assign(noahReadyAccountHref(detail));
  }
  /** 応答を、画面へ映す。つながった時は、動く所を 3 秒だけ出す。 */
  function settle(reply: { status: number; body: Reply }, id: string | null) {
    operation.current = null;
    const next = asConnection(reply.body) ?? reply.body.connection ?? null;
    if (next) onChange(next);
    if (reply.status === 401 && id) { clearFeedback(); leaveToSignIn(id); return; }
    if (reply.status !== 200) { clearFeedback(); setError(reply.body.error ?? NOAH_READY_TEXT.offline); return; }
    if (next?.state === 'connected') { setNotice(`${reply.body.placeLabel ?? '相手のサーバー'}につなぎました`); connectedFeedback(); }
    // つなぐ途中で止まって、後始末が切った接続: 理由を出す（ボタンは「接続」に戻る。押すと、新しい操作として、つなぎ直す）。
    else if (!next || !noahConnectionPreparing(next.state)) { clearFeedback(); if (next?.error) setError(next.error); }
  }
  async function run(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true; feedbackPending.current = true;
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch { clearFeedback(); setError(NOAH_READY_TEXT.offline); } finally { inFlight.current = false; setBusy(false); }
  }
  const connect = (id: string) => run(async () => {
    operation.current = id;
    const plan = await call(`/api/noah/connect-plan?${new URLSearchParams({ agent: agentId }).toString()}`);
    if (plan.status !== 200 || typeof plan.body.planSha256 !== 'string') { clearFeedback(); setError(plan.body.error ?? NOAH_READY_TEXT.offline); return; }
    settle(await call('/api/noah/connect', { id, agentId, planSha256: plan.body.planSha256, ...(packageId ? { packageId } : {}) }), id);
  });
  const retry = (current: NoahReadyConnection) => run(async () => {
    settle(await call(`/api/noah/connect/${current.id}`, { action: 'retry', revision: current.revision }), null);
  });
  function press(useExample = false, confirmed = false) {
    if (view.disabled || inFlight.current) return;
    if (view.action === 'connect' && onboarding?.formId && !confirmed) {
      setConfirmation(useExample);
      return;
    }
    if (signedIn && (view.action === 'connect' || view.action === 'retry')) {
      sound.current?.dispose(); sound.current = prepareNoahConnectionSound();
    }
    if (view.action === 'connect') {
      onboarding?.beforeConnect(useExample);
      const id = operation.current ?? crypto.randomUUID();
      if (!signedIn) leaveToSignIn(id); else void connect(id);
    } else if (view.action === 'retry' && connection) void retry(connection);
  }

  // サインインから戻った時: 10 分以内の続きがあれば、同じ操作 ID で、計画の読み直しから続ける。
  useEffect(() => {
    if (!resume || !signedIn || started.current) return;
    started.current = true;
    const handoff = takeNoahConnectHandoff(window.sessionStorage, agentId, Date.now());
    if (handoff && (!connection || connection.state === 'disconnected')) void connect(handoff.id);
    // 1 回だけ（サインインの状態が分かった時）。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [resume, signedIn]);
  // 「つなぎました」は 3 秒で消す。
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  // 別の要求が進めている途中の接続（同時に 2 回押した時など）は、少し待って読み直す。
  const pendingId = connection && noahConnectionPreparing(connection.state) && !busy ? connection.id : null;
  useEffect(() => {
    if (!pendingId) return;
    let stopped = false, tries = 0;
    const timer = setInterval(() => {
      if (++tries > 20) { clearInterval(timer); if (!stopped) { clearFeedback(); setError(NOAH_READY_TEXT.slow); } return; }
      void call(`/api/noah/connect/${pendingId}`).then((reply) => {
        const next = asConnection(reply.body);
        if (stopped || reply.status !== 200 || !next) return;
        onChange(next);
        if (next.state === 'connected') connectedFeedback();
        else if (!noahConnectionPreparing(next.state)) clearFeedback();
        // 待っている間に、後始末が切った: 理由を出す（ボタンは「接続」に戻る）。
        if (next.state === 'disconnected' && next.error) setError(next.error);
      }).catch(() => undefined);
    }, 1500);
    return () => { stopped = true; clearInterval(timer); };
    // 読み直すのは、その接続の ID が変わった時だけ。
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingId]);

  const note = error || view.note;
  const waiting = busy || (!!pendingId && !error);
  function dismissConfirmation() {
    setConfirmation(null);
    trigger.current?.focus();
  }
  const main = view.label === null ? null : view.action === 'ask'
    ? (askAs === 'link' ? <Link className={styles.primary} href={detail}>{t(view.label)}</Link> : null)
    : onboarding?.formId && view.action === 'connect' ? <form id={onboarding.formId} onSubmit={(event) => {
      event.preventDefault();
      trigger.current = (event.nativeEvent as SubmitEvent).submitter;
      press(trigger.current?.getAttribute('value') === 'example');
    }}>
      <button type="submit" className={styles.primary} disabled={view.disabled} aria-expanded={confirmation !== null} aria-controls={confirmation !== null ? confirmationId : undefined}>{t(view.label)}</button>
    </form> : <button type="button" className={styles.primary} disabled={view.disabled} aria-busy={busy || undefined} onClick={() => press()}>{busy ? <NoahLoading compact label={t(view.label)} /> : t(view.label)}</button>;
  // 出す物が無い時（詳細の画面で、つながった後）は、区切りの線も出さない。
  if (!main && !notice && !note) return null;
  return <div className={styles.connect}>
    {waiting && <div className={styles.connectionOverlay} data-noah-connection-loading="true"><NoahLoading variant="connection" label={t('接続しています…')} /></div>}
    {main}
    {onboarding && confirmation !== null && <fieldset id={confirmationId} className={overview.confirmation}>
      <legend>{t('接続を確認')}</legend>
      {onboarding.host && <p>{t('送信先: {host}', { host: onboarding.host })}</p>}
      <p>{t('依頼に入力した内容は、依頼を送るときに提供元へ送信されます。')}</p>
      {!signedIn && <p>{t('接続にはNoahへのログインが必要です。')}</p>}
      <div className={overview.confirmationActions}>
        <button ref={cancel} type="button" className={styles.secondary} onClick={dismissConfirmation} onKeyDown={(event) => { if (event.key === 'Escape') dismissConfirmation(); }}>{t('戻る')}</button>
        <button type="button" className={styles.primary} onClick={() => {
          setConfirmation(null);
          press(confirmation, true);
        }} onKeyDown={(event) => { if (event.key === 'Escape') dismissConfirmation(); }}>{t('接続')}</button>
      </div>
    </fieldset>}
    {notice && <output className={styles.notice}>{t(notice)}</output>}
    {note && <p className={styles.reason} role={error ? 'alert' : undefined}>{note}</p>}
  </div>;
}
