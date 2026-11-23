/**
 * 稼ぎ方の設計図（task 122）。本人指示（2026-11-22）「アフィリエイトやるってなったら、アフィに登録して案件選んで動画作って SNS 運用させて LP つくって…
 * その一連の流れを自動化したい。アフィリエイトじゃなくてもすべての商売の手段として、その一連の流れを考えてマネタイズできるように環境整えてくれるやつ。
 * 何百通りもいろんな商売とマネタイズあるはずだから、それが全部できるものじゃないと意味ない」。
 *
 * 決め事（本人の回答、2026-11-22）: 回すのは会社（名義は当面ノエル個人）。人にしかできない工程も、できる限り自動。稼ぎ方は分類表で網羅し、実例で優先する。
 * 足りない工程は Eve が LLM で作ってよい（試験に通った物だけ使う）。予算は稼いだ分だけ。金融の表現はノエルが自分で確かめる。
 *
 * ここにあるのは、決まった式だけ（学習・乱数なし）。設計図を作る・並べる・工程にエージェントを当てる・足りない能力を数える・使ってよい額・続けるか止めるか。
 * 実行（投稿・出品・申請）は、ここでは行わない。工程の種類が「人」「押すだけ」の物は、必ず本人を通す。
 * 仕様: docs/noah/spec-122-business-blueprints.md
 */

import {
  NOAH_ACCOUNT_FACTS,
  NOAH_STEP_WAITS,
  noahBlueprintWithout,
  type NoahStep,
  type NoahStepDataLink,
  type NoahStepFlow,
  type NoahStepKind,
} from './noah-steps.ts';
export {
  NOAH_STEP_KINDS,
  NOAH_STEP_WAITS,
  noahBlueprintLevels,
  noahBlueprintReady,
  noahBlueprintWaitProblem,
  noahBlueprintWithout,
} from './noah-steps.ts';
export type { NoahStep, NoahStepKind } from './noah-steps.ts';

// ---------------------------------------------------------------------------
// 工程の種類と、要る能力
// ---------------------------------------------------------------------------

/**
 * auto: Noah が最後までやる。tap: Noah が全部用意し、本人が確かめて押す（規約が本人の同意・手動の公開を求める所）。
 * human: 本人にしかできない（本人確認・パスワード・確認コード・口座・電話番号・規約への同意）。review: 本人が中身を確かめる（金融の表現など）。
 *
 * 工程の共通型とグラフ操作は `lib/noah-steps.ts` にあり、ここでは
 * business の能力名だけを追加で狭くする。
 */

/** 能力。keywords は、Noah のエージェントの名前・説明に当てる語（小文字・決まった照合だけ）。 */
export const NOAH_CAPABILITIES = {
  'research.market': { label: '需要と競合を調べる', keywords: ['search', 'research', 'trend', 'keyword', 'serp', 'seo', '検索', '調査'] },
  'research.offer': { label: '案件・商品を比べる', keywords: ['affiliate', 'offer', 'product', 'price', 'compare', 'アフィリエイト', '比較'] },
  'content.script': { label: '台本・文章を書く', keywords: ['write', 'writing', 'copy', 'script', 'text', 'llm', '文章', '台本'] },
  'content.article': { label: '記事を書く', keywords: ['article', 'blog', 'seo', 'write', '記事'] },
  'content.image': { label: '画像を作る', keywords: ['image', 'thumbnail', 'design', 'illustration', 'flux', 'stable diffusion', '画像'] },
  'content.video': { label: '動画を作る', keywords: ['video', 'veo', 'kling', 'wan', 'sora', 'shorts', 'reel', '動画'] },
  'content.voice': { label: '声・音を作る', keywords: ['tts', 'voice', 'speech', 'audio', 'music', '音声'] },
  'product.digital': { label: 'デジタル商品を作る', keywords: ['pdf', 'template', 'ebook', 'course', 'notion', 'slides', 'テンプレ'] },
  'site.build': { label: 'LP・サイトを作る', keywords: ['landing', 'website', 'site', 'html', 'web page', 'lp', 'サイト'] },
  'site.host': { label: 'サイトを公開する', keywords: ['deploy', 'hosting', 'netlify', 'vercel', 'cloudflare', 'pages', 'domain'] },
  'compliance.check': { label: '広告の表示・表現を点検する', keywords: ['compliance', 'policy', 'moderation', 'legal', 'check', '表示'] },
  'publish.sns': { label: 'SNS に出す', keywords: ['twitter', 'x.com', 'tiktok', 'instagram', 'youtube', 'threads', 'pinterest', 'social', 'post', 'schedule'] },
  'publish.blog': { label: 'ブログ・記事の場に出す', keywords: ['wordpress', 'blog', 'note', 'ghost', 'publish', 'cms'] },
  'publish.listing': { label: '売り場に出品する', keywords: ['shopify', 'listing', 'store', 'marketplace', 'etsy', 'gumroad', '出品'] },
  'tracking.results': { label: '成果・売上を読む', keywords: ['analytics', 'report', 'stats', 'revenue', 'sales', 'conversion', '成果'] },
  'optimize.rules': { label: '続ける・止めるを決める', keywords: [] },
  'gig.apply': { label: '仕事に応募する', keywords: ['job', 'proposal', 'freelance', 'gig', '応募'] },
  'gig.deliver': { label: '納品物を作る', keywords: ['translate', 'translation', 'code', 'design', 'edit', '翻訳'] },
  'support.reply': { label: '問い合わせに答える', keywords: ['support', 'reply', 'email', 'inbox', 'chat', '返信'] },
  'ads.run': { label: '広告を出す', keywords: ['ads', 'advertising', 'campaign', 'meta ads', 'google ads', '広告'] },
  'order.fulfill': { label: '注文を届ける', keywords: ['order', 'fulfillment', 'shipping', 'print on demand', 'printful', '発送'] },
  'app.build': { label: 'アプリを作る・更新する', keywords: ['ios', 'swift', 'xcode', 'app store', 'build', 'testflight'] },
  // 推し活（2026-11-22 本人指示「推し活向けのイベント予約とかグッズかう代行自動ボットもいれて」）。
  'oshi.watch': { label: '公式の告知（申込・発売・再販）を見張る', keywords: ['rss', 'feed', 'monitor', 'watch', 'alert', 'notify', 'announcement', '告知'] },
  'calendar.schedule': { label: '申込の期間・締切・当落・入金を予定に入れる', keywords: ['calendar', 'schedule', 'reminder', 'ical', '予定'] },
  'notify.push': { label: '時間になったら知らせる', keywords: ['push', 'notification', 'notify', 'line', 'telegram', '通知'] },
  'travel.search': { label: '遠征の宿・交通を探す', keywords: ['hotel', 'travel', 'flight', 'train', 'booking', 'rail', 'bus', '宿', '旅行'] },
  'budget.ledger': { label: '推し活の家計簿をつける', keywords: ['budget', 'expense', 'ledger', 'finance tracker', '家計簿'] },
  'proxy.intake': { label: '代行の依頼・見積もり・前払いを受ける', keywords: ['order form', 'quote', 'invoice', 'checkout', 'stripe', '見積'] },
  'shipping.label': { label: '国際発送の送り状・税関の書類を作る', keywords: ['shipping', 'customs', 'label', 'ems', 'dhl', 'fedex', '発送'] },
  'travel.fare': { label: '交通の早割の締切と払い戻しの手数料を比べる', keywords: ['fare', 'flight', 'shinkansen', 'train', 'airline', 'bus', '運賃', '新幹線'] },
  'travel.hold': { label: '無料で取り消せる宿を押さえ、取消の期限を見張る', keywords: ['hotel', 'booking', 'reservation', 'cancel', 'availability', '宿', 'ホテル'] },
} as const;
export type NoahCapability = keyof typeof NOAH_CAPABILITIES;

// ---------------------------------------------------------------------------
// アカウント（作る順の手順書の元）
// ---------------------------------------------------------------------------

/** 登録に要る物。identity: 本人確認書類。bank: 受け取りの口座。phone: 電話番号の確認。site: 載せる場（サイト・SNS）の URL と審査。tax: 税の情報。 */
export type NoahAccountNeed = 'email' | 'phone' | 'identity' | 'bank' | 'address' | 'site' | 'tax';
export type NoahAccount = {
  id: string; label: string; kind: 'asp' | 'channel' | 'marketplace' | 'hosting' | 'payments' | 'ads' | 'developer';
  needs: readonly NoahAccountNeed[];
  /** 確かめた事実と出典（無い物は、作る時に「規約と要件を確かめる」工程で確かめる）。 */
  facts?: readonly { text: string; source: string }[];
  /** 公開の工程を、規約上 Noah が最後まで押せない（本人が押す）。 */
  publishByTap?: boolean;
};
const A = (id: string, label: string, kind: NoahAccount['kind'], needs: NoahAccountNeed[], extra: Partial<NoahAccount> = {}): NoahAccount => ({ id, label, kind, needs, ...extra });
export const NOAH_ACCOUNTS: readonly NoahAccount[] = [
  A('asp-a8', 'A8.net', 'asp', ['email', 'address', 'bank', 'site'], { facts: NOAH_ACCOUNT_FACTS['asp-a8'] }),
  A('asp-moshimo', 'もしもアフィリエイト', 'asp', ['email', 'address', 'bank', 'site']),
  A('asp-afb', 'afb', 'asp', ['email', 'address', 'bank', 'site']),
  A('asp-accesstrade', 'アクセストレード', 'asp', ['email', 'address', 'bank', 'site'], { facts: NOAH_ACCOUNT_FACTS['asp-accesstrade'] }),
  A('asp-valuecommerce', 'バリューコマース', 'asp', ['email', 'address', 'bank', 'site']),
  A('amazon-associates', 'Amazonアソシエイト', 'asp', ['email', 'address', 'bank', 'site'], { facts: NOAH_ACCOUNT_FACTS['amazon-associates'] }),
  A('rakuten-affiliate', '楽天アフィリエイト', 'asp', ['email', 'address']),
  A('x', 'X', 'channel', ['email', 'phone']),
  A('tiktok', 'TikTok', 'channel', ['email', 'phone'], { publishByTap: true, facts: NOAH_ACCOUNT_FACTS['tiktok'] }),
  A('instagram', 'Instagram（プロアカウント）', 'channel', ['email', 'phone']),
  A('youtube', 'YouTube', 'channel', ['email', 'phone']),
  A('threads', 'Threads', 'channel', ['email']),
  A('pinterest', 'Pinterest（ビジネス）', 'channel', ['email']),
  A('line-official', 'LINE公式アカウント', 'channel', ['email', 'phone']),
  A('note', 'note', 'marketplace', ['email', 'bank']),
  A('brain', 'Brain', 'marketplace', ['email', 'bank']),
  A('gumroad', 'Gumroad', 'marketplace', ['email', 'bank', 'tax']),
  A('booth', 'BOOTH', 'marketplace', ['email', 'bank']),
  A('coconala', 'ココナラ', 'marketplace', ['email', 'phone', 'identity', 'bank']),
  A('lancers', 'ランサーズ', 'marketplace', ['email', 'phone', 'identity', 'bank']),
  A('crowdworks', 'クラウドワークス', 'marketplace', ['email', 'phone', 'identity', 'bank']),
  A('fiverr', 'Fiverr', 'marketplace', ['email', 'phone', 'identity', 'bank', 'tax']),
  A('pixta', 'PIXTA', 'marketplace', ['email', 'identity', 'bank']),
  A('adobe-stock', 'Adobe Stock（コントリビューター）', 'marketplace', ['email', 'identity', 'bank', 'tax']),
  A('line-creators', 'LINE Creators Market', 'marketplace', ['email', 'bank']),
  A('udemy', 'Udemy（講師）', 'marketplace', ['email', 'identity', 'bank', 'tax']),
  A('amazon-kdp', 'Amazon KDP', 'marketplace', ['email', 'identity', 'bank', 'tax']),
  A('suzuri', 'SUZURI', 'marketplace', ['email', 'bank']),
  A('shopify', 'Shopify', 'marketplace', ['email', 'phone', 'identity', 'bank', 'address']),
  A('base-shop', 'BASE', 'marketplace', ['email', 'bank', 'address']),
  A('hosting', 'サイトの置き場所とドメイン', 'hosting', ['email', 'address']),
  A('adsense', 'Google AdSense', 'payments', ['email', 'address', 'bank', 'site', 'tax'], { facts: NOAH_ACCOUNT_FACTS['adsense'] }),
  A('youtube-partner', 'YouTube パートナープログラム', 'payments', ['email', 'bank', 'tax'], { facts: NOAH_ACCOUNT_FACTS['youtube-partner'] }),
  A('stripe', 'Stripe', 'payments', ['email', 'phone', 'identity', 'bank', 'address']),
  A('meta-ads', 'Meta 広告', 'ads', ['email', 'phone']),
  A('google-ads', 'Google 広告', 'ads', ['email', 'phone']),
  A('apple-developer', 'Apple Developer Program', 'developer', ['email', 'phone', 'identity', 'bank', 'tax']),
  A('official-shops', '公式通販のアカウント（作品・事務所ごと）', 'marketplace', ['email', 'phone', 'address'], { publishByTap: true, facts: NOAH_ACCOUNT_FACTS['official-shops'] }),
  A('japan-post', '日本郵便（国際郵便マイページ）', 'hosting', ['email', 'address', 'phone']),
];
const ACCOUNT = new Map(NOAH_ACCOUNTS.map(a => [a.id, a]));

// ---------------------------------------------------------------------------
// 分類表（稼ぎ方 × 場所 × 分野）
// ---------------------------------------------------------------------------

export type NoahChannel = { id: string; label: string; account: string; publish: NoahCapability; format: 'video' | 'image' | 'text' | 'site' };
export const NOAH_CHANNELS: readonly NoahChannel[] = [
  { id: 'blog', label: 'ブログ（自分のサイト）', account: 'hosting', publish: 'publish.blog', format: 'site' },
  { id: 'note', label: 'note', account: 'note', publish: 'publish.blog', format: 'text' },
  { id: 'x', label: 'X', account: 'x', publish: 'publish.sns', format: 'text' },
  { id: 'threads', label: 'Threads', account: 'threads', publish: 'publish.sns', format: 'text' },
  { id: 'instagram', label: 'Instagram', account: 'instagram', publish: 'publish.sns', format: 'image' },
  { id: 'tiktok', label: 'TikTok', account: 'tiktok', publish: 'publish.sns', format: 'video' },
  { id: 'youtube-shorts', label: 'YouTube ショート', account: 'youtube', publish: 'publish.sns', format: 'video' },
  { id: 'youtube', label: 'YouTube', account: 'youtube', publish: 'publish.sns', format: 'video' },
  { id: 'pinterest', label: 'Pinterest', account: 'pinterest', publish: 'publish.sns', format: 'image' },
  { id: 'line', label: 'LINE公式', account: 'line-official', publish: 'publish.sns', format: 'text' },
];
/** アフィリエイトの分野。finance は本人が表現を確かめる（review）。asp は、その分野の案件が多い ASP。 */
export type NoahVertical = { id: string; label: string; finance?: boolean; asp: readonly string[] };
export const NOAH_AFFILIATE_VERTICALS: readonly NoahVertical[] = [
  { id: 'fx', label: 'FX', finance: true, asp: ['asp-a8', 'asp-afb', 'asp-accesstrade'] },
  { id: 'securities', label: '証券口座', finance: true, asp: ['asp-a8', 'asp-afb', 'asp-accesstrade'] },
  { id: 'credit-card', label: 'クレジットカード', finance: true, asp: ['asp-a8', 'asp-afb', 'asp-accesstrade'] },
  { id: 'insurance', label: '保険の相談', finance: true, asp: ['asp-a8', 'asp-afb'] },
  { id: 'bank', label: 'ネット銀行', finance: true, asp: ['asp-a8', 'asp-accesstrade'] },
  { id: 'job-change', label: '転職', asp: ['asp-a8', 'asp-afb', 'asp-moshimo'] },
  { id: 'programming-school', label: 'プログラミングスクール', asp: ['asp-a8', 'asp-afb'] },
  { id: 'english', label: '英会話・語学', asp: ['asp-a8', 'asp-afb', 'asp-moshimo'] },
  { id: 'ai-tools', label: 'AIの道具', asp: ['asp-a8', 'asp-moshimo', 'asp-accesstrade'] },
  { id: 'saas', label: '仕事の道具（SaaS）', asp: ['asp-a8', 'asp-accesstrade'] },
  { id: 'hosting-domain', label: 'サーバー・ドメイン', asp: ['asp-a8', 'asp-moshimo'] },
  { id: 'vpn', label: 'VPN・セキュリティ', asp: ['asp-a8', 'asp-afb'] },
  { id: 'beauty', label: '美容', asp: ['asp-a8', 'asp-afb', 'asp-moshimo'] },
  { id: 'hair-removal', label: '脱毛', asp: ['asp-a8', 'asp-afb'] },
  { id: 'fitness', label: 'フィットネス', asp: ['asp-a8', 'asp-moshimo'] },
  { id: 'food', label: '食品・宅配', asp: ['asp-a8', 'asp-moshimo', 'rakuten-affiliate'] },
  { id: 'travel', label: '旅行・ホテル', asp: ['asp-a8', 'asp-valuecommerce', 'rakuten-affiliate'] },
  { id: 'gadgets', label: 'ガジェット', asp: ['amazon-associates', 'rakuten-affiliate', 'asp-moshimo'] },
  { id: 'books', label: '本・学び', asp: ['amazon-associates', 'rakuten-affiliate', 'asp-moshimo'] },
  { id: 'games', label: 'ゲーム', asp: ['asp-a8', 'amazon-associates'] },
  { id: 'kids-education', label: '子どもの学び', asp: ['asp-a8', 'asp-afb'] },
  { id: 'moving-home', label: '引越し・住まい', asp: ['asp-a8', 'asp-accesstrade'] },
  { id: 'fashion', label: 'ファッション', asp: ['asp-valuecommerce', 'rakuten-affiliate', 'asp-a8'] },
  { id: 'pets', label: 'ペット', asp: ['asp-a8', 'rakuten-affiliate'] },
  { id: 'fortune', label: '占い', asp: ['asp-a8', 'asp-afb'] },
];
/** 受注の場と、売る技能。 */
export const NOAH_GIG_MARKETS = ['coconala', 'lancers', 'crowdworks', 'fiverr'] as const;
export const NOAH_GIG_SKILLS = [
  ['writing', '記事・文章'], ['translation', '翻訳（日英）'], ['logo', 'ロゴ'], ['illustration', 'イラスト'], ['video-edit', '動画の編集'], ['thumbnail', 'サムネイル'],
  ['data-entry', 'データ入力・整理'], ['web', 'サイト制作'], ['app', 'アプリ制作'], ['ai-setup', 'AI の導入支援'], ['research', '調べ物・資料'], ['fortune-reading', '占い'],
] as const;
/** デジタル商品の売り場と、扱う物。 */
export const NOAH_DIGITAL_MARKETS = ['note', 'brain', 'gumroad', 'booth', 'pixta', 'adobe-stock', 'line-creators', 'udemy', 'amazon-kdp'] as const;
export const NOAH_DIGITAL_TOPICS = [
  ['ai-howto', 'AIの使い方'], ['templates', 'テンプレート'], ['prompts', 'プロンプト集'], ['study', '学習教材'], ['design-assets', '素材・画像'],
  ['stickers', 'スタンプ'], ['language', '語学'], ['science', '物理・理科'], ['fortune', '占い'], ['ebook', '電子書籍'],
] as const;
/** 動画・ブログの広告収益の場と、題材。 */
export const NOAH_ADS_CHANNELS = ['youtube', 'youtube-shorts', 'blog'] as const;
export const NOAH_ADS_THEMES = [['explainer', '解説'], ['news', '業界の話題'], ['history', '歴史'], ['study', '勉強'], ['fortune', '占い'], ['ai', 'AI'], ['travel', '旅'], ['science', '科学']] as const;
/** 物販の型と、扱う物。 */
export const NOAH_COMMERCE = [['shopify-dropship', 'Shopify（無在庫）', 'shopify'], ['base-dropship', 'BASE（無在庫）', 'base-shop'], ['suzuri-pod', 'SUZURI（受注生産）', 'suzuri'], ['kdp-books', 'Amazon KDP（本）', 'amazon-kdp']] as const;
export const NOAH_COMMERCE_NICHES = [['apparel', '服'], ['accessories', '小物'], ['pets', 'ペット'], ['kitchen', '台所'], ['stationery', '文具'], ['books', '本']] as const;
export const NOAH_APP_CATEGORIES = [['utility', '便利な道具'], ['education', '学び'], ['health-log', '記録'], ['fortune', '占い'], ['game', 'ゲーム']] as const;
/**
 * 推し活の分野。fan は、どの分野の推し活か（アイドル・アニメ・VTuber・声優・ゲーム・舞台）。
 * 作らない物（NOAH_OSHI_EXCLUDED）: 本人の代わりに抽選へ申し込む・先着の販売を自動で買う・複数のアカウント・転売・待機列や CAPTCHA を避ける・作品の絵柄を使った自作グッズ。
 */
export const NOAH_OSHI_FANDOMS = [['idol', 'アイドル'], ['anime', 'アニメ'], ['vtuber', 'VTuber'], ['voice-actor', '声優'], ['game', 'ゲーム'], ['stage', '舞台・2.5次元']] as const;
export const NOAH_OSHI_EXCLUDED = [
  { id: 'ticket-auto-apply', label: 'チケットの抽選・先着へ、本人の代わりに自動で申し込む', reason: 'チケット販売の規約が BOT・自動入力を禁じ、名義と本人確認の一致を求める（チケットぴあ 18 条 1 項 15 号・9 条 3 項）', source: 'https://t.pia.jp/info/terms-sp.jsp' },
  { id: 'ticket-resale', label: 'チケットを仕入れて売る', reason: 'チケット不正転売禁止法（2019-06-14 施行）と、販売の規約の転売の禁止', source: 'https://www.bunka.go.jp/seisaku/bunka_gyosei/ticket_resale_ban/' },
  { id: 'limited-sniping', label: '数量限定・先着のグッズを自動で買い占める', reason: '通販の規約の自動購入・数量制限に反し、ファンが買えなくなる。アカウント停止の恐れ', source: 'https://t.pia.jp/info/terms-sp.jsp' },
  { id: 'multi-account', label: '複数のアカウント・他人名義で申し込む', reason: '名義の一致と 1 人 1 申込の決まりに反する', source: 'https://t.pia.jp/info/terms-sp.jsp' },
  { id: 'queue-bypass', label: '待機列・CAPTCHA・購入数の上限を避ける', reason: '販売側の決まりを技術で外す行為（本人の会話の決まりでも行わない）', source: 'https://t.pia.jp/info/terms-sp.jsp' },
  { id: 'fan-made-goods', label: '作品の絵柄・ロゴを使ったグッズを作って売る', reason: '著作権・商標の権利者の許諾が要る', source: 'https://www.bunka.go.jp/seisaku/chosakuken/' },
] as const;
const step = (id: string, label: string, kind: NoahStepKind, extra: Omit<NoahBlueprintStep, 'id' | 'label' | 'kind'> = {}): NoahBlueprintStep => ({ id, label, kind, ...extra });
/**
 * 推し活のエージェント（Noah のエージェント 1 つ。本人の回答 2026-11-22「noah のエージェントの一個だよ」）。値段は Noah の料金のつなげる数に従う。
 * 分野は 6 つ全部（本人の回答）。言葉は日本語から始め、英語・中国語・韓国語を足す。各工程の能力は、Eve が確かめるか作る（足りない物は Eve の一覧に入る）。
 * 申込と、支払いを伴う予約は、必ず本人が押す（NOAH_OSHI_EXCLUDED）。会員番号などは本人の端末の中だけに置く。
 * 遠征の宿・交通の候補に紹介の案件（アフィリエイト）を使う時は、広告の表示（PR）を付ける（会社の稼ぎ方 oshi:expedition-affiliate）。
 */
/**
 * 推し活の困り事（2026-11-22 にネットで調べた物。本人の回答「ネットで調べて必要なことは」）。強さは、数のある調査か、報道の事例かで決めた。
 * 今あるアプリ（FanFun・おしきゅん・オシカツ・推し活支出管理・チケットカレンダー）は、予定を人が手で入れ、記録して知らせるまで。宿・交通を実際に取る・取り消す・比べる物は無い。
 */
export const NOAH_OSHI_PAINS = [
  { id: 'info-missing', label: '推しの情報を追う時間と見逃し', strength: 'high', evidence: '出演情報を調べるのに時間を使う 67.5%、見逃してストレス 64.4%（パナソニック、2024 年、800 人）。チケットの発売日のアプリには「プレイガイドの先行が抜ける・手で足せない」の声', sources: ['https://ascii.jp/elem/000/004/240/4240940/', 'https://apps.apple.com/jp/app/id1528279062'] },
  { id: 'money', label: 'お金が足りない（遠征 1 回 約 5.9 万円、いちばんは交通費）', strength: 'high', evidence: '悩みの 1 位「お金が足りない」28.4%（タニタ、2026 年、1,000 人）。遠征 1 回の平均 約 5.9 万円、使い道の 1 位は交通費 53.7%（Oshicoco、2026 年、664 人）', sources: ['https://api-img.tanita.co.jp/files/user/news/pdf/2026/fanactivities_research.pdf', 'https://www.commercepick.com/archives/90611'] },
  { id: 'hotel', label: '宿が取れない・高くなる・当落の前に押さえる必要', strength: 'high', evidence: '札幌の公演で市内がほぼ満室、1 泊 約 3 万円（普段の 3〜4 倍）、遠くの宿の予約と大量の取消。定番の対処は「無料キャンセルで当落の前に仮押さえ」、取消の期限は多くが 2 日前', sources: ['https://gendai.media/articles/-/160927', 'https://oshikatu-life.com/live-hotel-trouble-solutions/'] },
  { id: 'time', label: '時間が足りない', strength: 'medium', evidence: '悩みの 2 位 19.4%（タニタ、2026 年）', sources: ['https://api-img.tanita.co.jp/files/user/news/pdf/2026/fanactivities_research.pdf'] },
  { id: 'resale-fraud', label: 'SNS でのチケットの譲渡の詐欺', strength: 'medium', evidence: '国民生活センターが 2026-10-06 に注意喚起。公式のリセール（定価）を使うよう勧める', sources: ['https://www.kokusen.go.jp/news/data/n-20261006_1.html'] },
  { id: 'goods-soldout', label: 'グッズの売り切れと物販の長い列', strength: 'medium', evidence: '人気のグッズは昼前に売り切れ。事前の通販が会場の売上の半分以上、売り切れの品は事後通販で 2〜2.5 か月かかる物も', sources: ['https://www.businessinsider.jp/article/260929/'] },
] as const;
/**
 * 推し活のエージェント（Noah のエージェント 1 つ。本人の回答 2026-11-22「noah のエージェントの一個だよ」）。値段は Noah の料金のつなげる数に従う。
 * 今あるアプリとかぶる所（手で入れる予定・家計簿だけ）は、主役にしない。主役は、困り事の強い 3 つ:
 *   ① 抜けない情報: 推しの公式の告知・出演・発売の期間を、公開の出典から自動で集める（手で入れない。出典のリンク付き）。
 *   ② 安い遠征: 当落の日・宿の無料取消の期限・交通の早割の締切を突き合わせ、当落の前に押さえ、外れたら期限内に取り消し、当たったら安い・近い部屋を拾う。
 *   ③ 安全: チケットは公式のリセールへ。SNS の譲渡の詐欺を知らせる。
 * 申込・予約・取消・支払いは、必ず本人が押す（NOAH_OSHI_EXCLUDED）。会員番号などは本人の端末の中だけに置く。分野は 6 つ全部、言葉は日本語から。
 */
export const NOAH_OSHI_AGENT = {
  id: 'noah-oshi', label: '推し活', languages: ['ja', 'en', 'zh-Hant', 'zh-Hans', 'ko'] as const, startLanguage: 'ja' as const,
  steps: [
    step('register', '推しを登録する（名前・公式サイト・公式 X・FC の有無・住んでいる地域・月の上限）', 'human', { reason: '何を推すかは本人が決める' }),
    step('collect', '公式の告知・出演・発売の期間（FC 先行・プレイガイド先行・一般発売・公式リセール・事前通販・受注生産の締切・コラボカフェの予約）を公開の出典から集める', 'auto', { capability: 'oshi.watch' }),
    step('schedule', '当落の日・入金締切・発券を含めて予定に入れ、受付の前と締切の前に知らせる', 'auto', { capability: 'calendar.schedule' }),
    step('apply', '抽選・先着に申し込む', 'tap', { reason: '販売の規約が BOT・自動入力を禁じ、名義と本人確認の一致を求める。押すのは本人（Noah は申込の頁と要る物を用意する）' }),
    step('trip-plan', '申し込んだ公演ごとに、当落の日・宿の無料取消の期限・交通の早割の締切を突き合わせ、「今押さえる／当落を待つ」を、費用の差と一緒に出す', 'auto', { capability: 'travel.fare' }),
    step('hotel-hold', '当落の前に、無料で取り消せる宿を押さえる', 'tap', { reason: '予約は本人が金額と取消の条件を見て押す' }),
    step('hotel-release', '外れた公演の宿を、無料の期限の内に取り消す（期限の前に知らせ、1 タップで取り消す）', 'tap', { reason: '取消は戻せない操作なので、本人が押す' }),
    step('hotel-better', '当たった公演は、会場に近い・安い部屋の空きを見張って知らせる', 'auto', { capability: 'travel.hold' }),
    step('official-resale', 'チケットは公式のリセールの出品を知らせ、SNS の譲渡の詐欺を知らせる', 'auto', { capability: 'oshi.watch' }),
    step('goods-preorder', '事前通販・受注生産の締切と、再入荷を知らせる（会場の列と売り切れを避ける）', 'auto', { capability: 'oshi.watch' }),
    step('cap', '遠征とグッズの費用を、月の上限と比べて出す', 'auto', { capability: 'budget.ledger' }),
  ],
  /** 主役の困り事（NOAH_OSHI_PAINS の id）と、それに当たる工程。 */
  answers: { 'info-missing': ['collect', 'schedule'], money: ['trip-plan', 'hotel-release', 'cap'], hotel: ['hotel-hold', 'hotel-release', 'hotel-better'], time: ['collect', 'trip-plan'], 'resale-fraud': ['official-resale'], 'goods-soldout': ['goods-preorder'] } as Record<string, readonly string[]>,
  /** 見張りの間隔（公開の頁だけ。変わった時だけ読む）。 */
  polling: { officialMs: 15 * 60_000, restockMs: 5 * 60_000 },
  /** 知らせる時（受付開始・締切・入金締切・宿の無料取消の期限からの差、ミリ秒）。 */
  reminders: { applyOpens: [-30 * 60_000, 0], applyCloses: [-24 * 3_600_000, -3 * 3_600_000], paymentDue: [-24 * 3_600_000], freeCancel: [-24 * 3_600_000, -6 * 3_600_000] },
};

// ---------------------------------------------------------------------------
// 設計図
// ---------------------------------------------------------------------------

/**
 * 稼ぎ方の設計図が使う工程。共通工程の能力名だけ business の語彙へ
 * 狭め、consumes / produces など別の利用側の追加フィールドも拒まない。
 */
/**
 * Codez の graph contract を設計図の保存データにも持たせる。
 *
 * `after` は工程の待ち順（アカウントの準備など状態を待つ場合も含む）、
 * `dataFrom` は実際に前工程の成果物を読む場合だけを書く。従って、
 * `after` をそのままデータ線へ変換してはいけない。`branch` / `repeat` は
 * 実行器で根拠が確認できるまで省略する。
 */
export type NoahBlueprintFlow = NoahStepFlow;
export type NoahBlueprintStep = Omit<NoahStep, 'capability'> & { capability?: NoahCapability };

export type NoahBlueprint = {
  id: string; model: 'affiliate' | 'gig' | 'digital' | 'ads' | 'commerce' | 'app' | 'oshi'; label: string;
  accounts: string[]; steps: NoahBlueprintStep[]; finance: boolean;
  /** 後回しにした理由（本人の決め事）。並びでは、後回しでない物の後に置く。 */
  hold?: string;
  /** 実際に稼げている事例（出典付き。task 122 の 2 段目で集める。ここでは空から始める）。 */
  evidence: { url: string; claim: string; checkedAt: number }[];
};

const nodeFlow = (
  inputs: readonly string[],
  outputs: readonly string[],
  options: Omit<NoahStepFlow, 'inputs' | 'outputs'> = {},
): NoahBlueprintFlow => ({ inputs, outputs, ...options });

/** `after` のうち、実際に成果物を渡すと確認できる名前だけを線にする。 */
const knownDataMaterial = (id: string): string | null => {
  const materials: Record<string, string> = {
    apply: '提携承認または申請結果',
    article: '制作物',
    build: 'アプリのビルド',
    cover: '表紙・見本画像',
    copy: '制作物',
    disclose: '広告表示・表現の確認結果',
    deliver: '納品物',
    'deliver-check': '確認済み納品物',
    'finance-review': '金融表現の承認',
    image: '制作物',
    intake: '依頼・見積もり・前払い情報',
    label: '国際発送書類',
    'legal-notice': '適法表示の承認',
    listing: '販売ページ',
    'listing-image': '出品画像',
    lp: '紹介 LP',
    'lp-host': '公開 LP',
    make: '商品',
    offers: '案件・条件',
    page: '代行の頁',
    publish: '公開済みコンテンツ',
    promote: '紹介投稿',
    reply: '返信・納品完了通知',
    research: '調査結果',
    rights: '権利確認済みの商品企画',
    script: '台本',
    ship: '発送済み商品',
    'shop-rules': '公式通販の購入条件',
    'store-page': 'ストア説明・画像',
    submit: '審査提出',
    support: '依頼者への返信',
    video: '制作物',
    voice: '制作物',
    watch: '公式の告知・日付',
  };
  const material = materials[id];
  return material ?? (id.startsWith('publish:') ? '公開済みコンテンツ' : null);
};
const dataLinks = (ids: readonly string[]): NoahStepDataLink[] => ids.flatMap((from) => {
  const material = knownDataMaterial(from);
  return material ? [{ from, material }] : [];
});

/** アカウントを作る工程。本人確認・パスワード・確認コード・口座は本人。それ以外（入力内容・手順・規約の要点）は Noah が用意する。 */
const signUp = (account: string): NoahBlueprintStep[] => {
  const a = ACCOUNT.get(account);
  if (!a) throw Error(`unknown account ${account}`);
  return [
    step(`rules:${account}`, `${a.label}の規約と登録の要件を確かめる`, 'auto', { capability: 'research.market', account, after: [], flow: nodeFlow(['提供元の規約・登録要件'], ['登録要件の確認結果']) }),
    signUpStep(account, [`rules:${account}`]),
  ];
};
/** 規約の確認と登録。登録は、規約の確認と waits（ほかの登録など）を待つ。 */
const signUpAfter = (account: string, waits: readonly string[], waitNote: string): NoahBlueprintStep[] => [signUp(account)[0], signUpStep(account, [`rules:${account}`, ...waits], waitNote)];
/** 登録の工程だけ（規約の確認の工程を置かない所）。after は、その登録が待つ物。 */
const signUpStep = (account: string, after: readonly string[], waitNote?: string, flow?: NoahBlueprintFlow): NoahBlueprintStep => {
  const a = ACCOUNT.get(account);
  if (!a) throw Error(`unknown account ${account}`);
  const sensitive = a.needs.filter(n => ['identity', 'bank', 'phone', 'tax'].includes(n));
  const ruleLink = after.includes(`rules:${account}`) ? [{ from: `rules:${account}`, material: '登録要件の確認結果' }] : undefined;
  return step(`signup:${account}`, `${a.label}に登録する`, 'human', { account, reason: `パスワード・確認コード${sensitive.length ? `・${sensitive.map(n => ({ identity: '本人確認', bank: '口座', phone: '電話番号', tax: '税の情報' } as Record<string, string>)[n]).join('・')}` : ''}は本人が入れる（Noah は入力内容と手順を用意し、入力欄の手前まで進める）`, after, ...(waitNote ? { waitNote } : {}), flow: flow ?? nodeFlow(['登録要件・本人情報・認証情報', ...(ruleLink ? ['登録要件の確認結果'] : [])], ['利用可能なアカウント'], ruleLink ? { dataFrom: ruleLink } : {}) });
};
const publishStep = (channel: NoahChannel, after: readonly string[], waitNote?: string): NoahBlueprintStep => {
  const tap = ACCOUNT.get(channel.account)?.publishByTap;
  const links = dataLinks(after);
  return step(`publish:${channel.id}`, `${channel.label}に出す`, tap ? 'tap' : 'auto', { capability: channel.publish, account: channel.account, ...(tap ? { reason: `${channel.label}の規約上、公開は本人が押す（Noah は下書きまで）` } : {}), after, ...(waitNote ? { waitNote } : {}), flow: nodeFlow([...new Set(['公開用コンテンツ', `${channel.label}の公開先アカウント`, ...links.map(({ material }) => material)])], ['公開済みコンテンツ'], links.length ? { dataFrom: links } : {}) });
};
/** 出す物を作る工程。最初の工程が after を待つ。台本・文章が先で、動画と声（どちらも台本から）は同時に作る。 */
const produce = (format: NoahChannel['format'], after: readonly string[]): NoahBlueprintStep[] => {
  const inputs = after.map((id) => knownDataMaterial(id) ?? '前工程の資料（未確認）');
  const inputFlow = { dataFrom: dataLinks(after) };
  if (format === 'video') return [step('script', '台本を書く', 'auto', { capability: 'content.script', after, flow: nodeFlow(inputs, ['台本'], inputFlow) }), step('video', '動画を作る', 'auto', { capability: 'content.video', costYen: 3000, after: ['script'], flow: nodeFlow(['台本'], ['動画素材', '制作物'], { dataFrom: [{ from: 'script', material: '台本' }] }) }), step('voice', '声を付ける', 'auto', { capability: 'content.voice', after: ['script'], flow: nodeFlow(['台本'], ['音声素材', '制作物'], { dataFrom: [{ from: 'script', material: '台本' }] }) })];
  if (format === 'image') return [step('copy', '文章を書く', 'auto', { capability: 'content.script', after, flow: nodeFlow(inputs, ['文章・コピー', '制作物'], inputFlow) }), step('image', '画像を作る', 'auto', { capability: 'content.image', costYen: 1000, after: ['copy'], flow: nodeFlow(['文章・コピー'], ['画像素材', '制作物'], { dataFrom: [{ from: 'copy', material: '文章・コピー' }] }) })];
  if (format === 'site') return [step('article', '記事を書く', 'auto', { capability: 'content.article', after, flow: nodeFlow(inputs, ['記事', '制作物'], inputFlow) }), step('image', '図・画像を作る', 'auto', { capability: 'content.image', after: ['article'], flow: nodeFlow(['記事'], ['図・画像素材', '制作物'], { dataFrom: [{ from: 'article', material: '記事' }] }) })];
  return [step('copy', '文章を書く', 'auto', { capability: 'content.script', after, flow: nodeFlow(inputs, ['文章・コピー', '制作物'], inputFlow) })];
};
/** 工程の組の、最後の工程たち（組の中の、ほかの工程に待たれていない物）。作った物を全部使う次の工程が、これを待つ。 */
const finals = (steps: readonly NoahBlueprintStep[]) => steps.filter(s => !steps.some(o => o.after?.includes(s.id))).map(s => s.id);
const measure = (after: readonly string[], waitNote?: string): NoahBlueprintStep[] => {
  const links = dataLinks(after);
  const inputs = [...new Set(['公開・対応の結果', '外部の成果・売上データ', ...links.map(({ material }) => material)])];
  return [
  step('track', '成果・売上を読む', 'auto', { capability: 'tracking.results', after, ...(waitNote ? { waitNote } : {}), flow: nodeFlow(inputs, ['成果・売上の集計'], links.length ? { dataFrom: links } : {}) }),
  step('decide', '続ける・増やす・止めるを決める', 'auto', { capability: 'optimize.rules', after: ['track'], flow: nodeFlow(['成果・売上の集計'], ['継続・増加・停止の判断'], { dataFrom: [{ from: 'track', material: '成果・売上の集計' }] }) }),
  step('payout', '入金を確かめる', 'human', { reason: '銀行の明細は本人の口座（Noah は ASP・売り場の支払明細との照合を用意する）', after: ['track'], flow: nodeFlow(['成果・売上の集計', '支払明細・銀行明細'], ['入金確認'], { dataFrom: [{ from: 'track', material: '成果・売上の集計' }] }) }),
  ];
};

/** 分類表から、全部の設計図を作る（同じ入力なら、いつも同じ順・同じ中身）。 */
export function noahBlueprints(): NoahBlueprint[] {
  const out: NoahBlueprint[] = [];
  const push = (b: Omit<NoahBlueprint, 'evidence' | 'accounts'>) => out.push({ ...b, accounts: [...new Set(b.steps.flatMap(s => (s.kind === 'human' && s.account ? [s.account] : [])))], evidence: [] });
  for (const vertical of NOAH_AFFILIATE_VERTICALS) for (const channel of NOAH_CHANNELS) {
    const asp = vertical.asp[0];
    const made = produce(channel.format, ['offers', 'research']);
    const checked = vertical.finance ? 'finance-review' : 'disclose';
    push({ id: `affiliate:${vertical.id}:${channel.id}`, model: 'affiliate', label: `${vertical.label}の紹介 × ${channel.label}`, finance: !!vertical.finance, steps: [
      ...signUp(channel.account), ...signUpAfter(asp, [`signup:${channel.account}`], NOAH_STEP_WAITS.aspSignup),
      step(`media:${asp}`, 'ASP に載せる場（媒体）を登録する', 'tap', { account: asp, reason: '媒体の登録と提携の申請は ASP の画面で本人が押す（Noah は説明文と申請の中身を用意する）', after: [`signup:${asp}`], waitNote: NOAH_STEP_WAITS.media, flow: nodeFlow(['ASPアカウント', '掲載媒体情報'], ['登録済み掲載媒体']) }),
      step('offers', '案件を比べて選ぶ（単価・承認率・条件）', 'auto', { capability: 'research.offer', after: [`signup:${asp}`], waitNote: NOAH_STEP_WAITS.offers, flow: nodeFlow(['ASPアカウント'], ['案件・条件']) }),
      step('apply', '案件に提携を申し込む', 'tap', { account: asp, reason: '提携の申請は ASP の画面で本人が押す', after: ['offers', `media:${asp}`], flow: nodeFlow(['案件・条件', '登録済み掲載媒体'], ['提携承認または申請結果'], { dataFrom: [{ from: 'offers', material: '案件・条件' }, { from: `media:${asp}`, material: '登録済み掲載媒体' }] }) }),
      step('research', '需要と競合を調べる', 'auto', { capability: 'research.market', after: [], waitNote: NOAH_STEP_WAITS.research, flow: nodeFlow(['公開情報・検索条件'], ['調査結果']) }),
      ...made,
      step('lp', '紹介の LP を作る', 'auto', { capability: 'site.build', after: ['offers', 'research'], flow: nodeFlow(['案件・条件', '調査結果'], ['紹介 LP'], { dataFrom: [{ from: 'offers', material: '案件・条件' }, { from: 'research', material: '調査結果' }] }) }),
      step('lp-host', 'LP を公開する', 'auto', { capability: 'site.host', after: ['lp'], flow: nodeFlow(['紹介 LP'], ['公開 LP'], { dataFrom: [{ from: 'lp', material: '紹介 LP' }] }) }),
      step('disclose', '広告の表示（PR）と誇大な表現を点検する', 'auto', { capability: 'compliance.check', after: [...finals(made), 'lp-host'], flow: nodeFlow(['公開 LP', '制作物'], ['広告表示・表現の確認結果'], { dataFrom: [...dataLinks(finals(made)), { from: 'lp-host', material: '公開 LP' }], gate: true }) }),
      ...(vertical.finance ? [step('finance-review', '金融の表現を確かめる', 'review', { reason: '金融商品の広告の決まり（本人が自分で確かめる。2026-11-22 の本人の回答）', after: ['disclose'], flow: nodeFlow(['広告表示・表現の確認結果'], ['金融表現の承認'], { dataFrom: [{ from: 'disclose', material: '広告表示・表現の確認結果' }], gate: true }) })] : []),
      publishStep(channel, [checked, 'apply', `signup:${channel.account}`], NOAH_STEP_WAITS.publishAffiliate), ...measure([`publish:${channel.id}`]),
    ] });
  }
  for (const market of NOAH_GIG_MARKETS) for (const [skill, label] of NOAH_GIG_SKILLS) push({ id: `gig:${skill}:${market}`, model: 'gig', label: `${label}の受注 × ${ACCOUNT.get(market)!.label}`, finance: false, steps: [
    ...signUp(market),
    step('listing', '出品ページを作る', 'auto', { capability: 'content.script', after: [], waitNote: NOAH_STEP_WAITS.draft, flow: nodeFlow(['サービス内容・価格・納期'], ['出品ページ']) }), step('listing-image', '出品の画像を作る', 'auto', { capability: 'content.image', after: ['listing'], flow: nodeFlow(['出品ページ'], ['出品画像'], { dataFrom: [{ from: 'listing', material: '出品ページ' }] }) }),
    step('publish', '出品する', 'tap', { capability: 'publish.listing', account: market, reason: '出品の公開は売り場の画面で本人が押す', after: [`signup:${market}`, 'listing', 'listing-image'], flow: nodeFlow(['出品ページ', '出品画像', '販売先アカウント'], ['公開中の出品'], { dataFrom: [{ from: 'listing', material: '出品ページ' }, { from: 'listing-image', material: '出品画像' }] }) }),
    step('apply', '募集に応募する', 'auto', { capability: 'gig.apply', after: [`signup:${market}`], flow: nodeFlow(['公開募集・応募条件', '販売先アカウント'], ['応募・受注情報']) }), step('deliver', '納品物を作る', 'auto', { capability: 'gig.deliver', after: ['publish', 'apply'], waitNote: NOAH_STEP_WAITS.deliver, flow: nodeFlow(['応募・受注情報', '交付要件'], ['納品物'], { dataFrom: [{ from: 'apply', material: '応募・受注情報' }] }) }),
    step('deliver-check', '納品の前に確かめる', 'review', { reason: '依頼者へ出す前に、本人が中身を確かめる', after: ['deliver'], flow: nodeFlow(['納品物', '依頼条件'], ['確認済み納品物'], { dataFrom: [{ from: 'deliver', material: '納品物' }], gate: true }) }),
    step('reply', '依頼者に返信する', 'auto', { capability: 'support.reply', after: ['deliver-check'], flow: nodeFlow(['確認済み納品物', '依頼者への連絡'], ['返信・納品完了通知'], { dataFrom: [{ from: 'deliver-check', material: '確認済み納品物' }] }) }), ...measure(['reply']),
  ] });
  for (const market of NOAH_DIGITAL_MARKETS) for (const [topic, label] of NOAH_DIGITAL_TOPICS) push({ id: `digital:${topic}:${market}`, model: 'digital', label: `${label} × ${ACCOUNT.get(market)!.label}`, finance: false, steps: [
    ...signUp(market), step('research', '売れている物と足りない物を調べる', 'auto', { capability: 'research.market', after: [], waitNote: NOAH_STEP_WAITS.research, flow: nodeFlow(['公開情報・検索条件'], ['調査結果']) }),
    step('make', '商品を作る', 'auto', { capability: 'product.digital', after: ['research'], flow: nodeFlow(['調査結果'], ['デジタル商品'], { dataFrom: [{ from: 'research', material: '調査結果' }] }) }), step('cover', '表紙・見本の画像を作る', 'auto', { capability: 'content.image', after: ['make'], flow: nodeFlow(['デジタル商品'], ['表紙・見本画像'], { dataFrom: [{ from: 'make', material: 'デジタル商品' }] }) }),
    step('listing', '販売ページを書く', 'auto', { capability: 'content.script', after: ['make'], flow: nodeFlow(['デジタル商品'], ['販売ページ文'], { dataFrom: [{ from: 'make', material: 'デジタル商品' }] }) }),
    step('publish', '販売を始める', 'tap', { capability: 'publish.listing', account: market, reason: '販売の公開は売り場の画面で本人が押す', after: [`signup:${market}`, 'make', 'cover', 'listing'], flow: nodeFlow(['デジタル商品', '表紙・見本画像', '販売ページ文', '販売先アカウント'], ['公開中の販売商品'], { dataFrom: [{ from: 'make', material: 'デジタル商品' }, { from: 'cover', material: '表紙・見本画像' }, { from: 'listing', material: '販売ページ文' }] }) }),
    signUpStep('x', []), step('promote', 'X で紹介する', 'auto', { capability: 'publish.sns', account: 'x', after: ['publish', 'signup:x'], flow: nodeFlow(['公開中の販売商品', 'Xアカウント'], ['X紹介投稿', '紹介投稿'], { dataFrom: [{ from: 'publish', material: '公開中の販売商品' }] }) }), ...measure(['promote']),
  ] });
  for (const channelId of NOAH_ADS_CHANNELS) for (const [theme, label] of NOAH_ADS_THEMES) {
    const channel = NOAH_CHANNELS.find(c => c.id === channelId)!;
    const partner = channelId === 'blog' ? 'adsense' : 'youtube-partner';
    const made = produce(channel.format, ['research']);
    // 収益化の申し込み（AdSense・YouTube パートナー）は、出した物がある場で受けるので、出した後に置く（規約の確認は最初からできる）。
    push({ id: `ads:${theme}:${channelId}`, model: 'ads', label: `${label}の広告収益 × ${channel.label}`, finance: false, steps: [
      ...signUp(channel.account), signUp(partner)[0],
      step('research', '伸びている題材を調べる', 'auto', { capability: 'research.market', after: [], waitNote: NOAH_STEP_WAITS.research, flow: nodeFlow(['公開情報・検索条件'], ['調査結果']) }), ...made,
      publishStep(channel, [...finals(made), `signup:${channel.account}`]),
      signUpStep(partner, [`rules:${partner}`, `publish:${channel.id}`], NOAH_STEP_WAITS.monetize, nodeFlow(['収益化の登録要件', '登録要件の確認結果', '公開実績', '公開済みコンテンツ', '本人情報・認証情報'], ['収益化アカウント'], { dataFrom: [{ from: `rules:${partner}`, material: '登録要件の確認結果' }, { from: `publish:${channel.id}`, material: '公開済みコンテンツ' }] })),
      ...measure([`publish:${channel.id}`, `signup:${partner}`]),
    ] });
  }
  for (const [kind, label, account] of NOAH_COMMERCE) for (const [niche, nicheLabel] of NOAH_COMMERCE_NICHES) {
    if ((kind === 'kdp-books') !== (niche === 'books')) continue;
    push({ id: `commerce:${niche}:${kind}`, model: 'commerce', label: `${nicheLabel} × ${label}`, finance: false, steps: [
      ...signUp(account), step('research', '売れ筋と仕入れ先を調べる', 'auto', { capability: 'research.offer', after: [], waitNote: NOAH_STEP_WAITS.research, flow: nodeFlow(['公開情報・検索条件'], ['調査結果']) }),
      step('make', '商品の画像・説明を作る', 'auto', { capability: 'content.image', after: ['research'], flow: nodeFlow(['調査結果'], ['商品画像・説明'], { dataFrom: [{ from: 'research', material: '調査結果' }] }) }), step('listing', '商品を出す', 'auto', { capability: 'publish.listing', account, after: ['make', `signup:${account}`], flow: nodeFlow(['商品画像・説明', '販売先アカウント'], ['公開商品'], { dataFrom: [{ from: 'make', material: '商品画像・説明' }] }) }),
      step('fulfill', '注文を届ける（仕入れ先・受注生産）', 'auto', { capability: 'order.fulfill', after: ['listing'], waitNote: NOAH_STEP_WAITS.orders, flow: nodeFlow(['注文情報', '公開商品'], ['発送済み注文'], { dataFrom: [{ from: 'listing', material: '公開商品' }] }) }), step('support', '問い合わせに答える', 'auto', { capability: 'support.reply', after: ['listing'], waitNote: NOAH_STEP_WAITS.orders, flow: nodeFlow(['注文情報', '公開商品'], ['問い合わせ返信'], { dataFrom: [{ from: 'listing', material: '公開商品' }] }) }),
      signUpStep('instagram', []), step('promote', 'Instagram で紹介する', 'auto', { capability: 'publish.sns', account: 'instagram', after: ['listing', 'signup:instagram'], flow: nodeFlow(['公開商品', 'Instagramアカウント'], ['Instagram紹介投稿', '紹介投稿'], { dataFrom: [{ from: 'listing', material: '公開商品' }] }) }), ...measure(['promote']),
    ] });
  }
  for (const [category, label] of NOAH_APP_CATEGORIES) push({ id: `app:${category}:ios`, model: 'app', label: `${label}のアプリ × App Store`, finance: false, steps: [
    ...signUp('apple-developer'), step('research', '検索の多い悩みと競合を調べる', 'auto', { capability: 'research.market', after: [], waitNote: NOAH_STEP_WAITS.research, flow: nodeFlow(['公開情報・検索条件'], ['調査結果']) }),
    step('build', 'アプリを作る・更新する', 'auto', { capability: 'app.build', after: ['research'], flow: nodeFlow(['調査結果'], ['アプリのビルド'], { dataFrom: [{ from: 'research', material: '調査結果' }] }) }), step('store-page', 'ストアの説明と画像を作る', 'auto', { capability: 'content.image', after: ['build'], waitNote: NOAH_STEP_WAITS.storePage, flow: nodeFlow(['アプリのビルド'], ['ストア説明・画像'], { dataFrom: [{ from: 'build', material: 'アプリのビルド' }] }) }),
    step('submit', '審査に出す', 'tap', { account: 'apple-developer', reason: 'App Store の審査の提出は本人が押す', after: ['signup:apple-developer', 'build', 'store-page'], flow: nodeFlow(['アプリのビルド', 'ストア説明・画像', '開発者アカウント'], ['審査提出'], { dataFrom: [{ from: 'build', material: 'アプリのビルド' }, { from: 'store-page', material: 'ストア説明・画像' }] }) }), ...measure(['submit']),
  ] });
  for (const [fan, fanLabel] of NOAH_OSHI_FANDOMS) {
    // 推し活の手伝い（見張る・予定・知らせ・遠征・家計簿）は、稼ぎ方の設計図ではなく、Noah のエージェント 1 つ（NOAH_OSHI_AGENT）。
    // 値段は Noah の料金（無料でつなげる数、課金でもっと）に従う（本人の回答 2026-11-22「noah のエージェントの一個だよ」）。
    // 2. 海外のファン向けの購入代行（公式通販・事前通販）。数量制限と規約を守り、人の速さで買う。チケットは扱わない。
    for (const channelId of ['x', 'instagram', 'tiktok'] as const) {
      const channel = NOAH_CHANNELS.find(c => c.id === channelId)!;
      const made = produce(channel.format, ['page', 'legal-notice']);
      push({ id: `oshi:proxy-overseas:${fan}:${channelId}`, model: 'oshi', label: `${fanLabel}グッズの海外向け購入代行 × ${channel.label}`, finance: false, hold: '後回し（本人 2026-11-22「代行は後回し」）', steps: [
        ...signUp('stripe'), ...signUp('official-shops'), ...signUp('japan-post'), ...signUp(channel.account),
        step('license', '古物商の許可が要るかを確かめる', 'review', { reason: '代わりに買って渡す形でも、新品の買い取り・売り渡しは古物に当たる場合がある。所轄の警察署・行政書士に確かめる（本人）', after: [], flow: nodeFlow(['事業・取扱いの前提', '規約・法令の確認対象'], ['許可要否の判断'], { gate: true }) }),
        step('shop-rules', '公式通販の規約（代行・転売・海外転送・数量制限）を確かめる', 'auto', { capability: 'research.market', after: [], flow: nodeFlow(['公式通販規約・法令情報'], ['公式通販の購入条件'], { gate: true }) }),
        step('page', '代行の頁（手数料・送料・届く日数・扱わない物）を作る', 'auto', { capability: 'site.build', after: ['shop-rules', 'license'], waitNote: NOAH_STEP_WAITS.proxyPage, flow: nodeFlow(['公式通販の購入条件', '許可要否の判断'], ['代行の頁'], { dataFrom: [{ from: 'shop-rules', material: '公式通販の購入条件' }, { from: 'license', material: '許可要否の判断' }] }) }),
        step('legal-notice', '特定商取引法の表示（名義・連絡先）を確かめる', 'review', { reason: '名義はノエル個人。表示する住所・電話の出し方は本人が決める', after: ['page'], flow: nodeFlow(['代行の頁', '表示要件'], ['適法表示の承認'], { dataFrom: [{ from: 'page', material: '代行の頁' }], gate: true }) }),
        step('intake', '依頼・見積もり・前払いを受ける', 'auto', { capability: 'proxy.intake', after: ['page', 'legal-notice', 'signup:stripe'], flow: nodeFlow(['代行の頁', '適法表示の承認', '決済アカウント'], ['依頼・見積もり・前払い情報'], { dataFrom: [{ from: 'page', material: '代行の頁' }, { from: 'legal-notice', material: '適法表示の承認' }] }) }),
        step('buy', '公式通販で買う', 'tap', { account: 'official-shops', reason: '購入は運営が人の速さで押す（自動購入・数量の上限を超える買い方・先着の買い占めはしない）', after: ['intake', 'signup:official-shops'], flow: nodeFlow(['依頼・見積もり・前払い情報', '公式通販アカウント'], ['購入済み商品'], { dataFrom: [{ from: 'intake', material: '依頼・見積もり・前払い情報' }] }) }),
        step('receive', '届いた物を確かめる', 'human', { reason: '物を手に取って確かめる（傷・数・中身）', after: ['buy'], flow: nodeFlow(['購入済み商品'], ['受領確認済み商品'], { dataFrom: [{ from: 'buy', material: '購入済み商品' }] }) }),
        step('label', '国際発送の送り状と税関の書類を作る', 'auto', { capability: 'shipping.label', after: ['receive', 'signup:japan-post'], flow: nodeFlow(['受領確認済み商品', '日本郵便アカウント'], ['国際発送書類'], { dataFrom: [{ from: 'receive', material: '受領確認済み商品' }] }) }),
        step('ship', '梱包して出す', 'human', { reason: '梱包と持ち込み（集荷）は人の手', after: ['label'], flow: nodeFlow(['受領確認済み商品', '国際発送書類'], ['発送済み商品'], { dataFrom: [{ from: 'label', material: '国際発送書類' }] }) }),
        step('support', '依頼者に返信する', 'auto', { capability: 'support.reply', after: ['ship'], flow: nodeFlow(['発送済み商品', '依頼者の問い合わせ'], ['依頼者への返信'], { dataFrom: [{ from: 'ship', material: '発送済み商品' }] }) }),
        ...made, publishStep(channel, [...finals(made), `signup:${channel.account}`], NOAH_STEP_WAITS.proxyPromote), ...measure([`publish:${channel.id}`, 'support'], NOAH_STEP_WAITS.proxySales),
      ] });
    }
    // 3. 推し活の予定のまとめ（事実と日付だけ。画像・本文は転載しない）× ブログの広告収益。AdSense の申し込みは、記事を出した後。
    push({ id: `oshi:calendar-media:${fan}`, model: 'oshi', label: `${fanLabel}のイベントの予定まとめ × ブログ`, finance: false, steps: [
      ...signUp('hosting'), signUp('adsense')[0],
      step('watch', '公式の告知を見張る', 'auto', { capability: 'oshi.watch', after: [], flow: nodeFlow(['公式サイト・公式告知'], ['公式の告知・日付']) }),
      step('article', '日付・会場・申込の期間を記事にする（公式の画像・本文は転載しない）', 'auto', { capability: 'content.article', after: ['watch'], flow: nodeFlow(['公式の告知・日付'], ['イベント予定記事'], { dataFrom: [{ from: 'watch', material: '公式の告知・日付' }] }) }),
      step('publish', '記事を出す', 'auto', { capability: 'publish.blog', after: ['article', 'signup:hosting'], flow: nodeFlow(['イベント予定記事', 'ホスティングアカウント'], ['公開済み予定記事', '公開済みコンテンツ'], { dataFrom: [{ from: 'article', material: 'イベント予定記事' }] }) }),
      signUpStep('adsense', ['rules:adsense', 'publish'], NOAH_STEP_WAITS.monetize, nodeFlow(['収益化の登録要件', '登録要件の確認結果', '公開実績', '公開済みコンテンツ', '本人情報・認証情報'], ['AdSenseアカウント'], { dataFrom: [{ from: 'rules:adsense', material: '登録要件の確認結果' }, { from: 'publish', material: '公開済みコンテンツ' }] })), ...measure(['publish', 'signup:adsense']),
    ] });
  }
  // 4. 遠征（宿・交通）の紹介 × 場所。推し活の遠征の需要に、旅行の案件を当てる。
  for (const channel of NOAH_CHANNELS) {
    const made = produce(channel.format, ['offers', 'research']);
    push({ id: `oshi:expedition-affiliate:${channel.id}`, model: 'oshi', label: `推し活の遠征（宿・交通）の紹介 × ${channel.label}`, finance: false, steps: [
      ...signUp(channel.account), ...signUpAfter('asp-valuecommerce', [`signup:${channel.account}`], NOAH_STEP_WAITS.aspSignup),
      step('media:asp-valuecommerce', 'ASP に載せる場（媒体）を登録する', 'tap', { account: 'asp-valuecommerce', reason: '媒体の登録と提携の申請は ASP の画面で本人が押す', after: ['signup:asp-valuecommerce'], waitNote: NOAH_STEP_WAITS.media, flow: nodeFlow(['ASPアカウント', '掲載媒体情報'], ['登録済み掲載媒体']) }),
      step('offers', '宿・交通の案件を比べて選ぶ', 'auto', { capability: 'research.offer', after: ['signup:asp-valuecommerce'], waitNote: NOAH_STEP_WAITS.offers, flow: nodeFlow(['ASPアカウント'], ['宿・交通の案件・条件', '案件・条件']) }),
      step('research', '公演の会場と日程から、宿が足りない日を調べる', 'auto', { capability: 'travel.search', after: [], waitNote: NOAH_STEP_WAITS.research, flow: nodeFlow(['公演の会場・日程', '公開情報'], ['調査結果']) }),
      ...made, step('disclose', '広告の表示（PR）を点検する', 'auto', { capability: 'compliance.check', after: finals(made), flow: nodeFlow(['制作物'], ['広告表示・表現の確認結果'], { dataFrom: dataLinks(finals(made)), gate: true }) }),
      publishStep(channel, ['disclose', 'media:asp-valuecommerce', `signup:${channel.account}`], NOAH_STEP_WAITS.publishExpedition), ...measure([`publish:${channel.id}`]),
    ] });
  }
  // 5. 推し活の汎用の用品（トレカケース・缶バッジの入れ物など。作品の絵柄は使わない）の物販。
  for (const [kind, label, account] of NOAH_COMMERCE.filter(([k]) => k !== 'kdp-books')) push({ id: `oshi:supplies:${kind}`, model: 'oshi', label: `推し活の用品（絵柄なし） × ${label}`, finance: false, steps: [
    ...signUp(account), step('research', '売れ筋と仕入れ先を調べる', 'auto', { capability: 'research.offer', after: [], waitNote: NOAH_STEP_WAITS.research, flow: nodeFlow(['公開情報・検索条件'], ['調査結果']) }),
    step('rights', '作品の絵柄・ロゴ・名前を使っていない事を確かめる', 'auto', { capability: 'compliance.check', after: ['research'], flow: nodeFlow(['調査結果', '作品・権利情報'], ['権利確認済みの商品企画'], { dataFrom: [{ from: 'research', material: '調査結果' }], gate: true }) }),
    step('make', '商品の画像・説明を作る', 'auto', { capability: 'content.image', after: ['rights'], flow: nodeFlow(['権利確認済みの商品企画'], ['商品画像・説明'], { dataFrom: [{ from: 'rights', material: '権利確認済みの商品企画' }] }) }), step('listing', '商品を出す', 'auto', { capability: 'publish.listing', account, after: ['make', `signup:${account}`], flow: nodeFlow(['商品画像・説明', '販売先アカウント'], ['公開商品'], { dataFrom: [{ from: 'make', material: '商品画像・説明' }] }) }),
    step('fulfill', '注文を届ける', 'auto', { capability: 'order.fulfill', after: ['listing'], waitNote: NOAH_STEP_WAITS.orders, flow: nodeFlow(['注文情報', '公開商品'], ['発送済み注文'], { dataFrom: [{ from: 'listing', material: '公開商品' }] }) }), step('support', '問い合わせに答える', 'auto', { capability: 'support.reply', after: ['listing'], waitNote: NOAH_STEP_WAITS.orders, flow: nodeFlow(['注文情報', '公開商品'], ['問い合わせ返信'], { dataFrom: [{ from: 'listing', material: '公開商品' }] }) }),
    signUpStep('x', []), step('promote', 'X で紹介する', 'auto', { capability: 'publish.sns', account: 'x', after: ['listing', 'signup:x'], flow: nodeFlow(['公開商品', 'Xアカウント'], ['X紹介投稿', '紹介投稿'], { dataFrom: [{ from: 'listing', material: '公開商品' }] }) }), ...measure(['promote']),
  ] });
  return out;
}

// ---------------------------------------------------------------------------
// 当てはめ・並び・手順書・使ってよい額・続けるか
// ---------------------------------------------------------------------------

export type NoahAgentRef = { id: string; name: string; summary: string };
/**
 * 能力の「候補」（名前・説明に、能力の語のどれかがある物）。決まった語の照合だけなので、外れも多い（例: 「動画」を名前に持つだけの物）。
 * 候補は、確かめるまで工程に当てない。確かめる（実際にその工程の見本を頼み、成果の形を照合する）のは Eve の仕事（task 122 の 2 段目）。
 */
export function noahAgentsFor(capability: NoahCapability, agents: readonly NoahAgentRef[]) {
  const words = NOAH_CAPABILITIES[capability].keywords;
  if (!words.length) return [];
  return agents.filter(a => { const text = `${a.name} ${a.summary}`.toLowerCase(); return words.some(w => (/^[a-z0-9 .]+$/u.test(w) ? hasWord(text, w) : text.includes(w))); });
}
/** 英数字の語は、前後が英数字でない所だけで当てる（「app」が「happy」に当たらない）。 */
function hasWord(text: string, word: string) {
  const alnum = (c: string | undefined) => !!c && /[a-z0-9]/u.test(c);
  for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1)) if (!alnum(text[at - 1]) && !alnum(text[at + word.length])) return true;
  return false;
}
/** Noah の中で決まった式で動かす能力（エージェントが要らない）。 */
export const NOAH_BUILTIN_CAPABILITIES: readonly NoahCapability[] = ['optimize.rules'];
/** 確かめた当てはめ: 能力 → その工程を実際にこなすと確かめたエージェントの ID（data/noah-business-capabilities.json）。 */
export type NoahVerifiedCapabilities = Partial<Record<NoahCapability, readonly string[]>>;
export type NoahBlueprintPlan = NoahBlueprint & {
  covered: number; gaps: NoahCapability[]; humanSteps: number; tapSteps: number; reviewSteps: number; costYen: number; newAccounts: number; score: number;
};
/**
 * 並び（学習・乱数なし）。上ほど「お金と手間が少なく、すぐ回せる」物。
 * 点 = 100 × 自動で回せる工程の割合 − 5 × 本人の工程 − 2 × 押すだけの工程 − 1 × 確かめる工程 − 3 × 新しく作るアカウント − 月の費用 / 1,000 円 + 10 × 出典付きの稼げた事例。
 * 自動で回せる = 種類が auto で、能力に「確かめた」エージェントがある（か、Noah の中の式で動く）工程。語で当たっただけの候補は数えない。
 */
export function noahPlanBlueprints(verified: NoahVerifiedCapabilities = {}, owned: ReadonlySet<string> = new Set()): NoahBlueprintPlan[] {
  const has = (c: NoahCapability) => NOAH_BUILTIN_CAPABILITIES.includes(c) || (verified[c]?.length ?? 0) > 0;
  return noahBlueprints().map((b): NoahBlueprintPlan => {
    // 持っているアカウントの登録と規約の確認を外す。外した工程を待っていた工程は、つなぎ直す（noahBlueprintWithout）。
    const steps = noahBlueprintWithout(b.steps, s => (s.kind === 'human' || s.id.startsWith('rules:')) && !!s.account && owned.has(s.account));
    const auto = steps.filter(s => s.kind === 'auto');
    const gaps = [...new Set(auto.flatMap(s => (s.capability && !has(s.capability) ? [s.capability] : [])))];
    const covered = auto.filter(s => !s.capability || has(s.capability)).length;
    const humanSteps = steps.filter(s => s.kind === 'human').length, tapSteps = steps.filter(s => s.kind === 'tap').length, reviewSteps = steps.filter(s => s.kind === 'review').length;
    const costYen = steps.reduce((sum, s) => sum + (s.costYen ?? 0), 0), newAccounts = b.accounts.filter(a => !owned.has(a)).length;
    const score = Math.round((100 * covered / Math.max(1, steps.length) - 5 * humanSteps - 2 * tapSteps - reviewSteps - 3 * newAccounts - costYen / 1000 + 10 * b.evidence.length) * 100) / 100;
    return { ...b, steps, covered, gaps, humanSteps, tapSteps, reviewSteps, costYen, newAccounts, score };
  }).sort((a, b) => Number(!!a.hold) - Number(!!b.hold) || b.score - a.score || a.id.localeCompare(b.id));
}
/** アカウントを作る順: 作ると、上位 limit 件の設計図のうち、いくつで登録の工程が無くなるか（多い順）。要る物も出す。 */
export function noahAccountKit(plans: readonly NoahBlueprintPlan[], limit = 100) {
  const top = plans.slice(0, limit), count = new Map<string, number>();
  for (const p of top) for (const a of p.accounts) count.set(a, (count.get(a) ?? 0) + 1);
  return [...count].map(([id, unlocks]) => ({ ...ACCOUNT.get(id)!, unlocks })).sort((a, b) => b.unlocks - a.unlocks || a.id.localeCompare(b.id));
}
/** Eve が作る物の一覧: 足りない能力を、それで止まっている設計図の数の多い順に。 */
export function noahEveBacklog(plans: readonly NoahBlueprintPlan[]) {
  const count = new Map<NoahCapability, number>();
  for (const p of plans) for (const g of p.gaps) count.set(g, (count.get(g) ?? 0) + 1);
  return [...count].map(([capability, blocked]) => ({ capability, label: NOAH_CAPABILITIES[capability].label, blocked })).sort((a, b) => b.blocked - a.blocked || a.capability.localeCompare(b.capability));
}

/**
 * 使ってよい額（本人の回答「稼いだ分だけ使う」）。最初の少額 + 承認された収益 − 使った額 − 使う予定で押さえた額。
 * 数えるのは承認・確定した収益だけ（発生・未承認は数えない）。足りない支出は止める。
 */
export const NOAH_BUSINESS_SEED_YEN = 10_000;
export function noahBusinessAllowance(ledger: { seedYen?: number; approvedYen: number; spentYen: number; reservedYen?: number }) {
  for (const v of [ledger.approvedYen, ledger.spentYen, ledger.reservedYen ?? 0, ledger.seedYen ?? 0]) if (!Number.isSafeInteger(v) || v < 0) throw Error('ledger_invalid');
  return (ledger.seedYen ?? NOAH_BUSINESS_SEED_YEN) + ledger.approvedYen - ledger.spentYen - (ledger.reservedYen ?? 0);
}
export const noahBusinessCanSpend = (ledger: Parameters<typeof noahBusinessAllowance>[0], yen: number) => Number.isSafeInteger(yen) && yen >= 0 && noahBusinessAllowance(ledger) >= yen;

/**
 * 続ける・増やす・止める（決まった数の決まり）。試す期間は 14 日・出した物 10 件まで。
 * 承認された収益が費用の 2 倍以上 → 増やす。承認 1 件以上か、クリック 50 以上 → 続ける。期間と件数を過ぎて、クリック 20 未満で承認 0 → 止める。それ以外は待つ。
 */
export const NOAH_TRIAL = { days: 14, outputs: 10, keepClicks: 50, stopClicks: 20, scaleRatio: 2 };
export function noahTrialDecision(s: { startedAt: number; now: number; outputs: number; clicks: number; approved: number; approvedYen: number; costYen: number }) {
  if (s.approved > 0 && s.approvedYen >= NOAH_TRIAL.scaleRatio * Math.max(1, s.costYen)) return 'scale' as const;
  if (s.approved > 0 || s.clicks >= NOAH_TRIAL.keepClicks) return 'continue' as const;
  if (s.now - s.startedAt >= NOAH_TRIAL.days * 86_400_000 && s.outputs >= NOAH_TRIAL.outputs && s.clicks < NOAH_TRIAL.stopClicks) return 'stop' as const;
  return 'wait' as const;
}
