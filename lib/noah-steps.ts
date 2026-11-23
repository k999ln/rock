/**
 * Noah の工程と待つ相手を扱う共通の小さなグラフ層。
 *
 * 設計図・棚のカード・Agent の説明画面は、工程の名前や能力の詳細は
 * それぞれ持つが、「何を待つか」の解釈は同じである。ここには business
 * の分類表や接続先の知識を入れず、工程に必要な最小の形と決まった
 * グラフ操作だけを置く。追加のフィールド（consumes / produces など）を
 * 持つ工程も構造的にそのまま扱える。
 */

/** Noah が扱う工程の種類。auto 以外は本人が関わる工程である。 */
export const NOAH_STEP_KINDS = ['auto', 'tap', 'human', 'review'] as const;
export type NoahStepKind = (typeof NOAH_STEP_KINDS)[number];

/**
 * 待つ相手を持つ工程の共通形。
 *
 * `capability` は business の能力名にも、Agent の道具名にも使えるよう
 * string としている。各利用側は必要なら、より狭い型へ上書きできる。
 */
export type NoahStep = {
  id: string;
  label: string;
  kind: NoahStepKind;
  capability?: string;
  reason?: string;
  account?: string;
  costYen?: number;
  /** この工程を始める前に終わっている工程の id。空なら最初から始められる。 */
  after?: readonly string[];
  /** 待つ相手が必要な理由。決まりきった待ちには付けなくてよい。 */
  waitNote?: string;
};

/**
 * 工程の待つ相手を検査する。
 *
 * after は同じ工程の、配列上で前に並ぶ工程だけを指す。これを境界に
 * することで、入力の並びを壊さず、輪にならない DAG として扱える。
 */
export function noahBlueprintWaitProblem<T extends NoahStep>(
  steps: readonly T[],
): string | null {
  const seen = new Set<string>();
  for (const step of steps) {
    if (seen.has(step.id)) return `工程の ID が重複しています（${step.id}）。`;
    if (!step.after)
      return `「${step.label}」に、何を待つかが書かれていません。`;
    if (new Set(step.after).size !== step.after.length)
      return `「${step.label}」が、同じ工程を 2 回待っています。`;
    const missing = step.after.find((id) => !seen.has(id));
    if (missing)
      return `「${step.label}」が、前に無い工程（${missing}）を待っています。`;
    seen.add(step.id);
  }
  return null;
}

/**
 * 工程を段に分ける。待つ相手がない工程が 1 段目で、同じ段の工程は
 * 同時に進められる。入力工程の追加フィールドと配列の型は保つ。
 */
export function noahBlueprintLevels<T extends NoahStep>(
  steps: readonly T[],
): T[][] {
  const problem = noahBlueprintWaitProblem(steps);
  if (problem) throw Error(problem);
  const level = new Map<string, number>();
  const out: T[][] = [];
  for (const step of steps) {
    const at =
      Math.max(-1, ...(step.after ?? []).map((id) => level.get(id)!)) + 1;
    level.set(step.id, at);
    (out[at] ??= []).push(step);
  }
  return out;
}

/**
 * まだ終わっていない工程のうち、待つ相手がすべて終わった工程を返す。
 * 入力順を保つので、同じ段の表示・実行順を安定させられる。
 */
export function noahBlueprintReady<T extends NoahStep>(
  steps: readonly T[],
  done: ReadonlySet<string>,
): T[] {
  const problem = noahBlueprintWaitProblem(steps);
  if (problem) throw Error(problem);
  return steps.filter(
    (step) =>
      !done.has(step.id) && (step.after ?? []).every((id) => done.has(id)),
  );
}

/**
 * 既に済ませた工程を外し、そこを待っていた工程を、外した工程が待って
 * いた物へつなぎ直す。複数段を外しても、元の順序と重複除去を保つ。
 */
export function noahBlueprintWithout<T extends NoahStep>(
  steps: readonly T[],
  drop: (step: T) => boolean,
): T[] {
  const dropped = new Map<string, readonly string[]>();
  const out: T[] = [];
  const expand = (ids: readonly string[]) => [
    ...new Set(ids.flatMap((id) => dropped.get(id) ?? [id])),
  ];
  for (const step of steps) {
    const after = expand(step.after ?? []);
    if (drop(step)) dropped.set(step.id, after);
    else out.push({ ...step, after });
  }
  return out;
}

/**
 * 待つ相手の前提（2026-11-22。本人の答えで直す所）。工程が何を待つかのうち、決まりきっていない物だけ、理由をここに置く。
 * 直す時は、この文と、設計図の工程の after を一緒に直す（試験 tests/noah-business.test.mjs が、待つ相手のつながりを確かめる）。
 */
export const NOAH_STEP_WAITS = {
  connectAccount: '設定を本人のアカウントに保存するため、サインインを待ちます。',
  connectSetup: '接続に必要な本人の設定を待ちます。',
  toolMaterial: '前の工程が返す物をこの道具に渡します。',
  packageMaterial: '前の工程が返す物をこの工程に渡します。',
  aspSignup: 'ASP の登録では、載せる場（サイト・SNS）の名前と URL を入れる（A8.net は無ければ A8 のブログを作る形、アクセストレードも登録の最後にサイトの情報を入れる、Amazon アソシエイトは SNS の URL で申し込める）。だから、載せる場を作った後に ASP に登録する',
  media: 'ASP の会員登録で入れた載せる場を、提携の申し込みに使う媒体として確かめる。だから、ASP の登録を待つ',
  offers: '案件の一覧と条件（単価・承認率）は、ASP に登録してから見られる',
  research: '需要と競合は公開の情報で調べられるので、何も待たない（登録の審査を待つ間に進める）',
  draft: '出品・販売の頁の文は、登録の前に下書きできる',
  publishAffiliate: '紹介のリンクを載せるのは、提携が通り、広告の表示と表現の点検が済んでから',
  publishExpedition: '紹介のリンクを載せるのは、媒体の登録と、広告の表示の点検が済んでから',
  monetize: '収益化の審査は、出した物がある場で受ける（AdSense は独自のコンテンツを見る。YouTube パートナーは公開した動画の登録者と再生時間で決まる）。だから、出した後に申し込む',
  deliver: '注文は、出品と応募のどちらからも来る。両方の口を開けてから、納品に入る',
  orders: '注文と問い合わせは、商品を出した後に来る',
  storePage: 'ストアの画像は、出来たアプリの画面から作る',
  proxyPage: '代行の頁（手数料・扱わない物）は、通販の規約と、古物商の許可が要るかが分かってから作る',
  proxyPromote: '代行の紹介は、代行の頁と特定商取引法の表示が出来てから。最初の注文を待たない',
  proxySales: '代行の売上は、届けて依頼者に知らせた後に確定する。だから、成果を読むのは、紹介を出した後と、最初の注文を届けた後',
} as const;

/** 外部の工程の順序を裏付ける確認記録。 */
export const NOAH_ACCOUNT_FACTS = {
  'asp-a8': [
    { text: '会員登録の途中で、載せる場（サイト）の情報を入れる。サイトが無ければ A8 のブログ（ファンブログ）を作る形。初回の登録にサイトの審査は無い。', source: 'https://www.onamae.com/column/affiliate/32/' },
    { text: '案件の報酬・成果の条件・否認の条件は、ログインした後の「プログラム検索」で見る。提携の申請は、案件によって審査があり、断られる事もある。', source: 'https://www.onamae.com/column/affiliate/32/' },
  ],
  'asp-accesstrade': [
    { text: '登録の最後に、アフィリエイトを始めるサイトの情報（サイト名・サイトの URL など）を入れる。', source: 'https://www.onamae.com/column/affiliate/47/' },
  ],
  'amazon-associates': [
    { text: 'ブログが無くても、X・Instagram・YouTube などの SNS の URL で申し込める。', source: 'https://www.onamae.com/column/affiliate/43/' },
    { text: '審査があり、180 日以内にリンク経由の売上 3 件が目安。', source: 'https://www.onamae.com/column/affiliate/43/' },
  ],
  'tiktok': [
    { text: '審査前の API は、本人だけが見られる公開（SELF_ONLY）しかできず、自分が管理するアカウントへ投稿するための内部の道具は審査の対象外。', source: 'https://developers.tiktok.com/docs/en/content-sharing-guidelines' },
    { text: '広告・提携の投稿は、商用の表示（ブランドコンテンツ）を付け、非公開にできない。', source: 'https://developers.tiktok.com/docs/en/content-sharing-guidelines' },
  ],
  'adsense': [
    { text: '関連性の高い独自のオリジナル コンテンツが要る。独自性のないコンテンツや著作権で保護されたコンテンツを載せたサイトには、広告を表示できない。', source: 'https://support.google.com/adsense/answer/7299563?hl=ja' },
  ],
  'youtube-partner': [
    { text: '今の条件は、登録者 1,000 人以上と、直近 12 か月の公開長尺動画の総再生時間 4,000 時間以上（または直近 90 日の有効なショートの視聴 1,000 万回以上）。数えるのは公開した動画だけ。審査は通常 1 か月ほど。', source: 'https://support.google.com/youtube/answer/82839?hl=ja' },
    { text: '2027-02-01 から新しく申し込む人は、直近 365 日の有効な公開動画の総再生時間 8,000 時間、または直近 90 日の有効な公開ショートの視聴 2,000 万回が要る（2026-08-11 の発表）。', source: 'https://blog.youtube/intl/ja-jp/news-and-events/youtube-partner-program-updates-2027-new-opportunities-earn/' },
  ],
  'official-shops': [
    { text: 'チケットぴあの規約は、自動入力のソフトや BOT での利用、転売目的の取得、営利目的の転売を禁じ、購入者と入場者の名義の一致を求める（18 条 1 項 15 号・1 号・19 号、9 条 3 項）。公式通販も、作る時に規約の自動購入・代行・転送の扱いを確かめる。', source: 'https://t.pia.jp/info/terms-sp.jsp' },
  ],
} as const;
