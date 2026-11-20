/**
 * 「すぐ使える」の画面（一覧 /noah/ready・詳細 /noah/ready/agent）が使う、画面の文と、状態 → 見た目の決まり。
 *
 * 通信も保存もしない関数だけ（部品は components/noah-ready*.tsx・noah-card.tsx・noah-connect-button.tsx）。
 * ここの関数は、権限も利用権も与えない。押せるかどうかを決めるのは、いつも API の側（lib/noah-connect.ts）。
 * 仕様: docs/noah/spec-74-one-click-connect.md の 5.2・6.3・11.4・11.5、spec-96-connect-plan.md の 6 章。
 */

/** 一覧の 1 件（GET /api/noah/intake の items。lib/noah-intake-store.ts の item）。 */
export type NoahReadyItem = {
  id: string; name: string; provider: string; summary: string; host: string | null;
  section: 'ran' | 'new'; tools: number; oneTap: boolean; checkedAt: number | null;
  connect: {
    badge: 'one_click' | 'taps' | 'setup' | 'unverified' | 'blocked'; taps: number; typed: number;
    place: string | null; placeLabel: string | null; need: string | null; level: number;
    price: { model: 'free' | 'one_time'; amountMinor?: number; currency?: string }; note: string | null;
  };
};
/** その本人の接続（GET /api/noah/connect の 1 件・詳細の connection）。画面が使う項目だけ。 */
export type NoahReadyConnection = { id: string; state: string; revision: number; error?: string | null };

/** 画面の文（決まった文。提供者の文と、分けて出す）。説明の文は、短く・少なく（見出し・状態・操作を中心にする。07 の 2026-11-21）。送り先と出どころの文は、削らない。 */
export const NOAH_READY_TEXT = {
  title: 'すぐ使える Agent',
  lead: 'スマホだけで使えます。あなたの端末では何も動きません。',
  connected: 'つながっているもの',
  ran: '動いた',
  ranNote: '人が動かして、成果が返った物です。',
  fresh: 'まだ誰も動かしていない',
  freshNote: 'Noah が、応答する事だけを確かめた物です。',
  found: '探した結果',
  source: '出どころ: Official MCP Registry。Noah が作った物ではありません。説明は、提供者が書いた文のままです。',
  report: '報告・取り下げの申し出',
  mac: '自分の Mac で動かす Agent',
  empty: '今、並べられる物がありません。少し後で開いてください。',
  notFound: '見つかりませんでした。別の語で探してください。',
  closed: 'まだ公開していません。',
  unavailable: '一覧を読めませんでした。接続を確かめて、もう一度試してください。',
  missing: 'この Agent は、見つかりませんでした。',
  unlisted: 'この Agent は、今はつなげません。',
  offline: '通信できませんでした。もう一度試してください。',
  preparing: '準備しています…',
  slow: 'まだ進んでいます。少し後で、この画面を開き直してください。',
  cutNote: '切っても、受け取った成果は残ります。',
  tools: '道具',
  toolsEmpty: '入力欄で使える道具が、今はありません。',
} as const;

/** 送り先の 1 行。入力が送られる host は、つなぐ前に必ず出す。 */
export const noahSendsToText = (host: string) => `入力は ${host} へ送られます。Noah が送るのは、あなたが入力した内容だけです。`;

/** カードの印（色だけで分けない。必ず文字で出す）。 */
export function noahBadgeText(connect: Pick<NoahReadyItem['connect'], 'badge' | 'taps' | 'need'>): string {
  if (connect.badge === 'one_click') return '1 クリック';
  if (connect.badge === 'taps') return `あと ${connect.taps} タップ${connect.need ? `（${connect.need}）` : ''}`;
  if (connect.badge === 'setup') return `準備が必要${connect.need ? `（${connect.need}）` : ''}`;
  if (connect.badge === 'unverified') return 'まだ誰も動かしていない';
  return 'つなげません';
}
export const noahPriceText = (price: NoahReadyItem['connect']['price']) => (price.model === 'free' ? '無料' : `¥${(price.amountMinor ?? 0).toLocaleString('ja-JP')}`);
/** 最後に確かめた日（月/日。端末の時刻の帯で出す）。 */
export function noahCheckedText(checkedAt: number | null): string | null {
  if (checkedAt === null) return null;
  const date = new Date(checkedAt);
  return `最後に確かめた日 ${date.getMonth() + 1}/${date.getDate()}`;
}

/** 詳細の画面の場所。系列の ID は `/` を含むので、パスに入れずに query で渡す。 */
export const noahReadyDetailHref = (agentId: string) => `/noah/ready/agent?${new URLSearchParams({ id: agentId }).toString()}`;
/** サインインの画面の場所。戻る先に渡すのは、/noah/ready で始まるパスだけ（それ以外は、一覧へ戻す）。 */
export function noahReadyAccountHref(returnTo: string): string {
  const safe = /^\/noah\/ready(?:[/?#]|$)/.test(returnTo) && !/[\\\r\n]/.test(returnTo) && returnTo.length < 2000 ? returnTo : '/noah/ready';
  return `/account?${new URLSearchParams({ returnTo: safe }).toString()}`;
}

// ---------------------------------------------------------------------------
// その場のサインイン（未サインインの人が「接続」を押した時だけ通る）
// ---------------------------------------------------------------------------

export const NOAH_CONNECT_HANDOFF_KEY = 'noah-connect-handoff';
/** サインインから戻った時に、続きを行ってよい時間。 */
export const NOAH_CONNECT_HANDOFF_MS = 600_000;
/** 持つのは、接続の操作 ID と、Agent の ID と、押した時刻だけ。 */
export type NoahConnectHandoff = { agentId: string; id: string; at: number };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function writeNoahConnectHandoff(storage: Pick<Storage, 'setItem'>, handoff: NoahConnectHandoff): void {
  storage.setItem(NOAH_CONNECT_HANDOFF_KEY, JSON.stringify({ agentId: handoff.agentId, id: handoff.id, at: handoff.at }));
}
/**
 * 置いてあった続きを、読んで消す（1 回しか使わない）。その Agent の物で、形が合い、10 分以内の時だけ返す。
 * 別の Agent の続きは、消さずに残す（その Agent の詳細を開いた時に使う）。
 */
export function takeNoahConnectHandoff(storage: Pick<Storage, 'getItem' | 'removeItem'>, agentId: string, now: number): NoahConnectHandoff | null {
  let value: unknown;
  try { value = JSON.parse(storage.getItem(NOAH_CONNECT_HANDOFF_KEY) ?? 'null'); } catch { value = null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) { storage.removeItem(NOAH_CONNECT_HANDOFF_KEY); return null; }
  const handoff = value as Partial<NoahConnectHandoff>;
  const shaped = typeof handoff.agentId === 'string' && typeof handoff.id === 'string' && UUID.test(handoff.id) && typeof handoff.at === 'number' && Number.isFinite(handoff.at);
  const fresh = shaped && now - (handoff.at as number) <= NOAH_CONNECT_HANDOFF_MS && (handoff.at as number) <= now + 60_000;
  if (!shaped || !fresh) { storage.removeItem(NOAH_CONNECT_HANDOFF_KEY); return null; }
  if (handoff.agentId !== agentId) return null;
  storage.removeItem(NOAH_CONNECT_HANDOFF_KEY);
  return { agentId, id: handoff.id as string, at: handoff.at as number };
}

// ---------------------------------------------------------------------------
// 接続のボタン（状態 → 文と、押した時にする事）
// ---------------------------------------------------------------------------

export type NoahConnectButtonView = {
  /** ボタンの文。null なら、ボタンを出さない。 */
  label: string | null;
  disabled: boolean;
  /** 押した時にする事。connect: つなぐ。retry: やり直す。ask: 頼む画面（詳細）へ。 */
  action: 'connect' | 'retry' | 'ask' | null;
  /** ボタンの下の 1 行（あれば）。 */
  note: string | null;
};
const PREPARING: readonly string[] = ['planned', 'entitling', 'preparing', 'probing'];

/**
 * 接続のボタンの見た目（spec-74 の 5.2 の表の、ローンチの分）。
 * busy は、押してから応答が返るまで。connection は、その本人の、切っていない接続（無ければ null）。
 */
export function noahConnectButtonView(input: { connection: NoahReadyConnection | null; busy: boolean; listed: boolean }): NoahConnectButtonView {
  const { connection, busy } = input;
  if (busy) return { label: NOAH_READY_TEXT.preparing, disabled: true, action: null, note: null };
  if (!connection || connection.state === 'disconnected') {
    // 載せていない物は、つなげない（ボタンを出さない）。
    return input.listed ? { label: '接続', disabled: false, action: 'connect', note: null } : { label: null, disabled: true, action: null, note: NOAH_READY_TEXT.unlisted };
  }
  if (PREPARING.includes(connection.state)) return { label: NOAH_READY_TEXT.preparing, disabled: true, action: null, note: null };
  if (connection.state === 'connected') return { label: '頼む', disabled: false, action: 'ask', note: null };
  if (connection.state === 'failed') return { label: 'もう一度', disabled: false, action: 'retry', note: connection.error ?? null };
  // blocked（取り下げられた物）ほか: ボタンを出さず、理由だけを出す。切る事は、詳細の画面からできる。
  return { label: null, disabled: true, action: null, note: connection.error ?? NOAH_READY_TEXT.unlisted };
}
export const noahConnectionPreparing = (state: string) => PREPARING.includes(state);
/** 詳細の下の「この接続」の 1 行（今の状態を、文字で）。 */
export function noahConnectionStateText(state: string): string {
  if (state === 'connected') return 'つながっています。';
  if (PREPARING.includes(state)) return NOAH_READY_TEXT.preparing;
  if (state === 'failed') return 'つながっていません。';
  return '使えません。';
}
