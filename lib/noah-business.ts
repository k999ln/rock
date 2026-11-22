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

// ---------------------------------------------------------------------------
// 工程の種類と、要る能力
// ---------------------------------------------------------------------------

/**
 * auto: Noah が最後までやる。tap: Noah が全部用意し、本人が確かめて押す（規約が本人の同意・手動の公開を求める所）。
 * human: 本人にしかできない（本人確認・パスワード・確認コード・口座・電話番号・規約への同意）。review: 本人が中身を確かめる（金融の表現など）。
 */
export const NOAH_STEP_KINDS = ['auto', 'tap', 'human', 'review'] as const;
export type NoahStepKind = typeof NOAH_STEP_KINDS[number];

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
  A('asp-a8', 'A8.net', 'asp', ['email', 'address', 'bank', 'site']),
  A('asp-moshimo', 'もしもアフィリエイト', 'asp', ['email', 'address', 'bank', 'site']),
  A('asp-afb', 'afb', 'asp', ['email', 'address', 'bank', 'site']),
  A('asp-accesstrade', 'アクセストレード', 'asp', ['email', 'address', 'bank', 'site']),
  A('asp-valuecommerce', 'バリューコマース', 'asp', ['email', 'address', 'bank', 'site']),
  A('amazon-associates', 'Amazonアソシエイト', 'asp', ['email', 'address', 'bank', 'site'], { facts: [
    { text: 'ブログが無くても、X・Instagram・YouTube などの SNS の URL で申し込める。', source: 'https://www.onamae.com/column/affiliate/43/' },
    { text: '審査があり、180 日以内にリンク経由の売上 3 件が目安。', source: 'https://www.onamae.com/column/affiliate/43/' },
  ] }),
  A('rakuten-affiliate', '楽天アフィリエイト', 'asp', ['email', 'address']),
  A('x', 'X', 'channel', ['email', 'phone']),
  A('tiktok', 'TikTok', 'channel', ['email', 'phone'], { publishByTap: true, facts: [
    { text: '審査前の API は、本人だけが見られる公開（SELF_ONLY）しかできず、自分が管理するアカウントへ投稿するための内部の道具は審査の対象外。', source: 'https://developers.tiktok.com/docs/en/content-sharing-guidelines' },
    { text: '広告・提携の投稿は、商用の表示（ブランドコンテンツ）を付け、非公開にできない。', source: 'https://developers.tiktok.com/docs/en/content-sharing-guidelines' },
  ] }),
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
  A('adsense', 'Google AdSense', 'payments', ['email', 'address', 'bank', 'site', 'tax']),
  A('youtube-partner', 'YouTube パートナープログラム', 'payments', ['email', 'bank', 'tax']),
  A('stripe', 'Stripe', 'payments', ['email', 'phone', 'identity', 'bank', 'address']),
  A('meta-ads', 'Meta 広告', 'ads', ['email', 'phone']),
  A('google-ads', 'Google 広告', 'ads', ['email', 'phone']),
  A('apple-developer', 'Apple Developer Program', 'developer', ['email', 'phone', 'identity', 'bank', 'tax']),
  A('official-shops', '公式通販のアカウント（作品・事務所ごと）', 'marketplace', ['email', 'phone', 'address'], { publishByTap: true, facts: [
    { text: 'チケットぴあの規約は、自動入力のソフトや BOT での利用、転売目的の取得、営利目的の転売を禁じ、購入者と入場者の名義の一致を求める（18 条 1 項 15 号・1 号・19 号、9 条 3 項）。公式通販も、作る時に規約の自動購入・代行・転送の扱いを確かめる。', source: 'https://t.pia.jp/info/terms-sp.jsp' },
  ] }),
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
export const NOAH_OSHI_AGENT = {
  id: 'noah-oshi', label: '推し活', languages: ['ja', 'en', 'zh-Hant', 'zh-Hans', 'ko'] as const, startLanguage: 'ja' as const,
  steps: [
    step('register', '推しを登録する（名前・公式サイト・公式 X・FC の有無・地域・月の予算）', 'human', { reason: '何を推すかは本人が決める' }),
    step('watch', '公式の告知（FC 先行・オフィシャル先行・プレイガイド先行・一般発売・公式リセール・事前通販・会場物販・コラボカフェの予約）を見張る', 'auto', { capability: 'oshi.watch' }),
    step('calendar', '受付開始・締切・当落・入金締切・発券・公演日を予定に入れる', 'auto', { capability: 'calendar.schedule' }),
    step('notify', '受付開始の 30 分前と開始時、締切の 24 時間前と 3 時間前、入金締切の 24 時間前に知らせる', 'auto', { capability: 'notify.push' }),
    step('prepare', '申込の頁を開き、要る物（会員番号・同行者・支払い方法）がそろっているか確かめる', 'auto', { capability: 'oshi.watch' }),
    step('apply', '抽選・先着に申し込む', 'tap', { reason: '販売の規約が BOT・自動入力を禁じ、名義と本人確認の一致を求める。押すのは本人' }),
    step('travel', '当選したら、公演地と日付から宿・交通の空き・値段・取消の決まりを出す', 'auto', { capability: 'travel.search' }),
    step('travel-book', '宿・交通を予約する', 'tap', { reason: '支払いを伴うので、本人が金額と条件を見て押す' }),
    step('resale', '公式リセール・再販・再入荷を知らせる（買うのは本人）', 'auto', { capability: 'oshi.watch' }),
    step('budget', '推し活の家計簿（月の上限・使った額・残り）', 'auto', { capability: 'budget.ledger' }),
  ],
  /** 見張りの間隔（公開の頁だけ。変わった時だけ読む）。 */
  polling: { officialMs: 15 * 60_000, restockMs: 5 * 60_000 },
  /** 知らせる時（受付開始・締切・入金締切からの差、ミリ秒）。 */
  reminders: { applyOpens: [-30 * 60_000, 0], applyCloses: [-24 * 3_600_000, -3 * 3_600_000], paymentDue: [-24 * 3_600_000] },
};

// ---------------------------------------------------------------------------
// 設計図
// ---------------------------------------------------------------------------

export type NoahBlueprintStep = {
  id: string; label: string; kind: NoahStepKind; capability?: NoahCapability;
  /** 人・押すだけ・確かめる工程の理由。 */
  reason?: string; account?: string;
  /** 1 か月あたりの費用の目安（円。0 は無料の範囲）。 */
  costYen?: number;
};
export type NoahBlueprint = {
  id: string; model: 'affiliate' | 'gig' | 'digital' | 'ads' | 'commerce' | 'app' | 'oshi'; label: string;
  accounts: string[]; steps: NoahBlueprintStep[]; finance: boolean;
  /** 後回しにした理由（本人の決め事）。並びでは、後回しでない物の後に置く。 */
  hold?: string;
  /** 実際に稼げている事例（出典付き。task 122 の 2 段目で集める。ここでは空から始める）。 */
  evidence: { url: string; claim: string; checkedAt: number }[];
};

/** アカウントを作る工程。本人確認・パスワード・確認コード・口座は本人。それ以外（入力内容・手順・規約の要点）は Noah が用意する。 */
const signUp = (account: string): NoahBlueprintStep[] => {
  const a = ACCOUNT.get(account);
  if (!a) throw Error(`unknown account ${account}`);
  const sensitive = a.needs.filter(n => ['identity', 'bank', 'phone', 'tax'].includes(n));
  return [
    step(`rules:${account}`, `${a.label}の規約と登録の要件を確かめる`, 'auto', { capability: 'research.market', account }),
    step(`signup:${account}`, `${a.label}に登録する`, 'human', { account, reason: `パスワード・確認コード${sensitive.length ? `・${sensitive.map(n => ({ identity: '本人確認', bank: '口座', phone: '電話番号', tax: '税の情報' } as Record<string, string>)[n]).join('・')}` : ''}は本人が入れる（Noah は入力内容と手順を用意し、入力欄の手前まで進める）` }),
  ];
};
const publishStep = (channel: NoahChannel): NoahBlueprintStep => {
  const tap = ACCOUNT.get(channel.account)?.publishByTap;
  return step(`publish:${channel.id}`, `${channel.label}に出す`, tap ? 'tap' : 'auto', { capability: channel.publish, account: channel.account, ...(tap ? { reason: `${channel.label}の規約上、公開は本人が押す（Noah は下書きまで）` } : {}) });
};
const produce = (format: NoahChannel['format']): NoahBlueprintStep[] => {
  if (format === 'video') return [step('script', '台本を書く', 'auto', { capability: 'content.script' }), step('video', '動画を作る', 'auto', { capability: 'content.video', costYen: 3000 }), step('voice', '声を付ける', 'auto', { capability: 'content.voice' })];
  if (format === 'image') return [step('copy', '文章を書く', 'auto', { capability: 'content.script' }), step('image', '画像を作る', 'auto', { capability: 'content.image', costYen: 1000 })];
  if (format === 'site') return [step('article', '記事を書く', 'auto', { capability: 'content.article' }), step('image', '図・画像を作る', 'auto', { capability: 'content.image' })];
  return [step('copy', '文章を書く', 'auto', { capability: 'content.script' })];
};
const measure = (): NoahBlueprintStep[] => [
  step('track', '成果・売上を読む', 'auto', { capability: 'tracking.results' }),
  step('decide', '続ける・増やす・止めるを決める', 'auto', { capability: 'optimize.rules' }),
  step('payout', '入金を確かめる', 'human', { reason: '銀行の明細は本人の口座（Noah は ASP・売り場の支払明細との照合を用意する）' }),
];

/** 分類表から、全部の設計図を作る（同じ入力なら、いつも同じ順・同じ中身）。 */
export function noahBlueprints(): NoahBlueprint[] {
  const out: NoahBlueprint[] = [];
  const push = (b: Omit<NoahBlueprint, 'evidence' | 'accounts'>) => out.push({ ...b, accounts: [...new Set(b.steps.flatMap(s => (s.kind === 'human' && s.account ? [s.account] : [])))], evidence: [] });
  for (const vertical of NOAH_AFFILIATE_VERTICALS) for (const channel of NOAH_CHANNELS) {
    const asp = vertical.asp[0];
    push({ id: `affiliate:${vertical.id}:${channel.id}`, model: 'affiliate', label: `${vertical.label}の紹介 × ${channel.label}`, finance: !!vertical.finance, steps: [
      ...signUp(asp), ...signUp(channel.account),
      step(`media:${asp}`, 'ASP に載せる場（媒体）を登録する', 'tap', { account: asp, reason: '媒体の登録と提携の申請は ASP の画面で本人が押す（Noah は説明文と申請の中身を用意する）' }),
      step('offers', '案件を比べて選ぶ（単価・承認率・条件）', 'auto', { capability: 'research.offer' }),
      step('apply', '案件に提携を申し込む', 'tap', { account: asp, reason: '提携の申請は ASP の画面で本人が押す' }),
      step('research', '需要と競合を調べる', 'auto', { capability: 'research.market' }),
      ...produce(channel.format),
      step('lp', '紹介の LP を作る', 'auto', { capability: 'site.build' }),
      step('lp-host', 'LP を公開する', 'auto', { capability: 'site.host' }),
      step('disclose', '広告の表示（PR）と誇大な表現を点検する', 'auto', { capability: 'compliance.check' }),
      ...(vertical.finance ? [step('finance-review', '金融の表現を確かめる', 'review', { reason: '金融商品の広告の決まり（本人が自分で確かめる。2026-11-22 の本人の回答）' })] : []),
      publishStep(channel), ...measure(),
    ] });
  }
  for (const market of NOAH_GIG_MARKETS) for (const [skill, label] of NOAH_GIG_SKILLS) push({ id: `gig:${skill}:${market}`, model: 'gig', label: `${label}の受注 × ${ACCOUNT.get(market)!.label}`, finance: false, steps: [
    ...signUp(market),
    step('listing', '出品ページを作る', 'auto', { capability: 'content.script' }), step('listing-image', '出品の画像を作る', 'auto', { capability: 'content.image' }),
    step('publish', '出品する', 'tap', { capability: 'publish.listing', account: market, reason: '出品の公開は売り場の画面で本人が押す' }),
    step('apply', '募集に応募する', 'auto', { capability: 'gig.apply' }), step('deliver', '納品物を作る', 'auto', { capability: 'gig.deliver' }),
    step('deliver-check', '納品の前に確かめる', 'review', { reason: '依頼者へ出す前に、本人が中身を確かめる' }),
    step('reply', '依頼者に返信する', 'auto', { capability: 'support.reply' }), ...measure(),
  ] });
  for (const market of NOAH_DIGITAL_MARKETS) for (const [topic, label] of NOAH_DIGITAL_TOPICS) push({ id: `digital:${topic}:${market}`, model: 'digital', label: `${label} × ${ACCOUNT.get(market)!.label}`, finance: false, steps: [
    ...signUp(market), step('research', '売れている物と足りない物を調べる', 'auto', { capability: 'research.market' }),
    step('make', '商品を作る', 'auto', { capability: 'product.digital' }), step('cover', '表紙・見本の画像を作る', 'auto', { capability: 'content.image' }),
    step('listing', '販売ページを書く', 'auto', { capability: 'content.script' }),
    step('publish', '販売を始める', 'tap', { capability: 'publish.listing', account: market, reason: '販売の公開は売り場の画面で本人が押す' }),
    ...signUp('x').slice(1), step('promote', 'X で紹介する', 'auto', { capability: 'publish.sns', account: 'x' }), ...measure(),
  ] });
  for (const channelId of NOAH_ADS_CHANNELS) for (const [theme, label] of NOAH_ADS_THEMES) {
    const channel = NOAH_CHANNELS.find(c => c.id === channelId)!;
    push({ id: `ads:${theme}:${channelId}`, model: 'ads', label: `${label}の広告収益 × ${channel.label}`, finance: false, steps: [
      ...signUp(channel.account), ...signUp(channelId === 'blog' ? 'adsense' : 'youtube-partner'),
      step('research', '伸びている題材を調べる', 'auto', { capability: 'research.market' }), ...produce(channel.format), publishStep(channel), ...measure(),
    ] });
  }
  for (const [kind, label, account] of NOAH_COMMERCE) for (const [niche, nicheLabel] of NOAH_COMMERCE_NICHES) {
    if ((kind === 'kdp-books') !== (niche === 'books')) continue;
    push({ id: `commerce:${niche}:${kind}`, model: 'commerce', label: `${nicheLabel} × ${label}`, finance: false, steps: [
      ...signUp(account), step('research', '売れ筋と仕入れ先を調べる', 'auto', { capability: 'research.offer' }),
      step('make', '商品の画像・説明を作る', 'auto', { capability: 'content.image' }), step('listing', '商品を出す', 'auto', { capability: 'publish.listing', account }),
      step('fulfill', '注文を届ける（仕入れ先・受注生産）', 'auto', { capability: 'order.fulfill' }), step('support', '問い合わせに答える', 'auto', { capability: 'support.reply' }),
      ...signUp('instagram').slice(1), step('promote', 'Instagram で紹介する', 'auto', { capability: 'publish.sns', account: 'instagram' }), ...measure(),
    ] });
  }
  for (const [category, label] of NOAH_APP_CATEGORIES) push({ id: `app:${category}:ios`, model: 'app', label: `${label}のアプリ × App Store`, finance: false, steps: [
    ...signUp('apple-developer'), step('research', '検索の多い悩みと競合を調べる', 'auto', { capability: 'research.market' }),
    step('build', 'アプリを作る・更新する', 'auto', { capability: 'app.build' }), step('store-page', 'ストアの説明と画像を作る', 'auto', { capability: 'content.image' }),
    step('submit', '審査に出す', 'tap', { account: 'apple-developer', reason: 'App Store の審査の提出は本人が押す' }), ...measure(),
  ] });
  for (const [fan, fanLabel] of NOAH_OSHI_FANDOMS) {
    // 推し活の手伝い（見張る・予定・知らせ・遠征・家計簿）は、稼ぎ方の設計図ではなく、Noah のエージェント 1 つ（NOAH_OSHI_AGENT）。
    // 値段は Noah の料金（無料でつなげる数、課金でもっと）に従う（本人の回答 2026-11-22「noah のエージェントの一個だよ」）。
    // 2. 海外のファン向けの購入代行（公式通販・事前通販）。数量制限と規約を守り、人の速さで買う。チケットは扱わない。
    for (const channelId of ['x', 'instagram', 'tiktok'] as const) {
      const channel = NOAH_CHANNELS.find(c => c.id === channelId)!;
      push({ id: `oshi:proxy-overseas:${fan}:${channelId}`, model: 'oshi', label: `${fanLabel}グッズの海外向け購入代行 × ${channel.label}`, finance: false, hold: '後回し（本人 2026-11-22「代行は後回し」）', steps: [
        ...signUp('stripe'), ...signUp('official-shops'), ...signUp('japan-post'), ...signUp(channel.account),
        step('license', '古物商の許可が要るかを確かめる', 'review', { reason: '代わりに買って渡す形でも、新品の買い取り・売り渡しは古物に当たる場合がある。所轄の警察署・行政書士に確かめる（本人）' }),
        step('shop-rules', '公式通販の規約（代行・転売・海外転送・数量制限）を確かめる', 'auto', { capability: 'research.market' }),
        step('page', '代行の頁（手数料・送料・届く日数・扱わない物）を作る', 'auto', { capability: 'site.build' }),
        step('legal-notice', '特定商取引法の表示（名義・連絡先）を確かめる', 'review', { reason: '名義はノエル個人。表示する住所・電話の出し方は本人が決める' }),
        step('intake', '依頼・見積もり・前払いを受ける', 'auto', { capability: 'proxy.intake' }),
        step('buy', '公式通販で買う', 'tap', { account: 'official-shops', reason: '購入は運営が人の速さで押す（自動購入・数量の上限を超える買い方・先着の買い占めはしない）' }),
        step('receive', '届いた物を確かめる', 'human', { reason: '物を手に取って確かめる（傷・数・中身）' }),
        step('label', '国際発送の送り状と税関の書類を作る', 'auto', { capability: 'shipping.label' }),
        step('ship', '梱包して出す', 'human', { reason: '梱包と持ち込み（集荷）は人の手' }),
        step('support', '依頼者に返信する', 'auto', { capability: 'support.reply' }),
        ...produce(channel.format), publishStep(channel), ...measure(),
      ] });
    }
    // 3. 推し活の予定のまとめ（事実と日付だけ。画像・本文は転載しない）× ブログの広告収益。
    push({ id: `oshi:calendar-media:${fan}`, model: 'oshi', label: `${fanLabel}のイベントの予定まとめ × ブログ`, finance: false, steps: [
      ...signUp('hosting'), ...signUp('adsense'),
      step('watch', '公式の告知を見張る', 'auto', { capability: 'oshi.watch' }),
      step('article', '日付・会場・申込の期間を記事にする（公式の画像・本文は転載しない）', 'auto', { capability: 'content.article' }),
      step('publish', '記事を出す', 'auto', { capability: 'publish.blog' }), ...measure(),
    ] });
  }
  // 4. 遠征（宿・交通）の紹介 × 場所。推し活の遠征の需要に、旅行の案件を当てる。
  for (const channel of NOAH_CHANNELS) push({ id: `oshi:expedition-affiliate:${channel.id}`, model: 'oshi', label: `推し活の遠征（宿・交通）の紹介 × ${channel.label}`, finance: false, steps: [
    ...signUp('asp-valuecommerce'), ...signUp(channel.account),
    step('media:asp-valuecommerce', 'ASP に載せる場（媒体）を登録する', 'tap', { account: 'asp-valuecommerce', reason: '媒体の登録と提携の申請は ASP の画面で本人が押す' }),
    step('offers', '宿・交通の案件を比べて選ぶ', 'auto', { capability: 'research.offer' }),
    step('research', '公演の会場と日程から、宿が足りない日を調べる', 'auto', { capability: 'travel.search' }),
    ...produce(channel.format), step('disclose', '広告の表示（PR）を点検する', 'auto', { capability: 'compliance.check' }), publishStep(channel), ...measure(),
  ] });
  // 5. 推し活の汎用の用品（トレカケース・缶バッジの入れ物など。作品の絵柄は使わない）の物販。
  for (const [kind, label, account] of NOAH_COMMERCE.filter(([k]) => k !== 'kdp-books')) push({ id: `oshi:supplies:${kind}`, model: 'oshi', label: `推し活の用品（絵柄なし） × ${label}`, finance: false, steps: [
    ...signUp(account), step('research', '売れ筋と仕入れ先を調べる', 'auto', { capability: 'research.offer' }),
    step('rights', '作品の絵柄・ロゴ・名前を使っていない事を確かめる', 'auto', { capability: 'compliance.check' }),
    step('make', '商品の画像・説明を作る', 'auto', { capability: 'content.image' }), step('listing', '商品を出す', 'auto', { capability: 'publish.listing', account }),
    step('fulfill', '注文を届ける', 'auto', { capability: 'order.fulfill' }), step('support', '問い合わせに答える', 'auto', { capability: 'support.reply' }),
    ...signUp('x').slice(1), step('promote', 'X で紹介する', 'auto', { capability: 'publish.sns', account: 'x' }), ...measure(),
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
    const steps = b.steps.filter(s => !(s.kind === 'human' && s.account && owned.has(s.account)) && !(s.id.startsWith('rules:') && s.account && owned.has(s.account)));
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
