/**
 * Sky が最初から持つ「売れる型」と「工程の部品」。
 *
 * 出どころ:
 * - 先行例（Daisuke134/life-manager の gig）が実際に出品・応募している領域:
 *   業務の自動化、小さなWebアプリ、問い合わせボット、コラム、手順書、スライド、翻訳。
 * - rock の lib/catalog.ts にある道具: CSV整形、出典整理、記事編集、会話図解、文字起こし、市場調査、
 *   インタビュー分析、動画台本、LP、Instagram運用。
 * - 2026-11-18 本人指示: 絵・エッセイ・業界の情報収集・解析など、本人は好きなことだけをやり、
 *   掲載・導線・SNS・問い合わせ・納品は全部自動にする（CREATOR_LANES）。
 *
 * 最低額と日数は初期値。実績（採用率・検収の合格率）で planner と窓口が直していく。
 */

import type { GigOffer } from './sky-gig-desk.ts';
import type { RecipeCapability } from './sky-recipe-planner.ts';

const offer = (
  id: string, name: string, floorYen: number, deliveryDays: number, judgmentItems: number,
  deliverable: string, keywords: string[],
): GigOffer => ({ id, name, keywords, have: ['request'], want: 'delivery', floorYen, deliveryDays, judgmentItems, deliverable });

/** 受注して会社が作る型。募集への応募と、型ごとの出品の両方に使う。 */
export const SKY_GIG_OFFERS: readonly GigOffer[] = [
  offer('sheet-automation', '表計算の自動化', 5_000, 5, 4, 'ご指定の表で動くスクリプト一式、設定手順書、動作確認の記録。',
    ['GAS', 'スプレッドシート', 'Excel', 'エクセル', 'マクロ', 'VBA', '転記', '集計']),
  offer('workflow-automation', '連絡・通知・定型業務の自動化', 30_000, 7, 4, '連携フロー一式、設定手順書、止め方と復旧手順、動作確認の記録。',
    ['Slack', 'Zoom', 'LINE', 'Zapier', 'Make', 'n8n', 'API連携', '自動通知', '業務自動化', 'RPA']),
  offer('small-webapp', '小さなWebアプリ・LP', 50_000, 10, 8, '公開できる画面一式、ソース、更新手順、表示確認の記録（PC・スマホ）。',
    ['Webアプリ', 'LP', 'ランディングページ', 'Next.js', 'ホームページ', '予約システム', 'ダッシュボード', '管理画面']),
  offer('inquiry-bot', '問い合わせAIチャットボット', 30_000, 7, 8, '資料に基づいて答えるボット、答えない範囲の設定、想定質問20件の応答記録。',
    ['チャットボット', '問い合わせ対応', 'FAQ', 'AIボット', 'LINEボット']),
  offer('data-table', '公開データ・PDFを表にする', 8_000, 4, 6, '指定の項目で整えた表、取得元の一覧、抜き取り検査の記録。',
    ['PDF', 'データ抽出', 'リスト作成', 'データ収集', '一覧化', 'OCR', 'データ入力']),
  offer('csv-cleanup', 'CSVの整形・検査', 3_000, 2, 3, '整形後のCSV、変更内容の一覧、検査結果。',
    ['CSV', '重複', '文字コード', '名寄せ', 'データ整形', 'データクレンジング']),
  offer('column-writing', 'コラム・SEO記事', 3_000, 3, 6, '記事本文、構成案、出典の一覧、表記と事実の確認記録。',
    ['コラム', 'SEO記事', '記事作成', 'ライティング', 'ブログ記事', 'オウンドメディア']),
  offer('listing-copy', '商品説明・掲載文の更新', 3_000, 3, 6, '更新後の文面、変更前後の対照表、表記ゆれと誤字の確認記録。',
    ['商品説明', '掲載文', '紹介文', 'プロフィール文', 'メニュー', 'リライト', '校正']),
  offer('manual-doc', '手順書・マニュアル', 5_000, 3, 5, '手順書、確認リスト、引継ぎ時の注意点。',
    ['手順書', 'マニュアル', 'チェックリスト', '引継ぎ', '業務フロー']),
  offer('slides', '研修・営業スライド', 5_000, 3, 5, 'スライド一式（編集できる形式）、話す内容のメモ。',
    ['スライド', 'パワポ', 'PowerPoint', 'プレゼン資料', '研修資料', '営業資料']),
  offer('short-translation', '画面・短文の翻訳', 4_500, 3, 6, '訳文、用語の対照表、文字数が収まるかの確認記録。',
    ['翻訳', '英訳', '和訳', 'ローカライズ', 'UI翻訳']),
  offer('transcript-notes', '文字起こし・議事録・図解', 3_000, 2, 4, '文字起こし、決定事項と担当の一覧、会話の図解。',
    ['文字起こし', '議事録', 'テープ起こし', '要約', '図解']),
  offer('research-report', '業界・競合の調査レポート', 8_000, 5, 6, '調査レポート、比較表、出典の一覧、確認できなかった点の一覧。',
    ['市場調査', '競合調査', 'リサーチ', '業界調査', '情報収集', '調査レポート']),
  offer('survey-analysis', 'アンケート・インタビューの分析', 8_000, 4, 5, '集計表、テーマごとの発言の整理、読み取れることと読み取れないこと。',
    ['アンケート', 'インタビュー', '集計', '分析', 'データ分析', '可視化']),
  offer('video-script', '動画の台本・構成', 5_000, 3, 5, '題名案、冒頭の30秒、台本、撮影の順番。',
    ['台本', 'YouTube', 'ショート動画', '動画構成', 'シナリオ']),
  offer('sns-monthly', 'SNS投稿の月次企画・制作', 29_800, 7, 10, '1か月分の投稿案と文面、投稿日程、前月の数字の読み取り。',
    ['Instagram', 'インスタ', 'SNS運用', '投稿作成', 'X運用', 'SNS投稿']),
];

const step = (
  id: string, name: string, kind: RecipeCapability['kind'], consumes: string[], produces: string,
  costMinor: number, ownerMinutes: number, waitMinutes: number,
): RecipeCapability => ({
  id, name, kind, consumes, produces, available: true, costMinor, ownerMinutes, waitMinutes,
  setupMinor: 0, setupOwnerMinutes: 0, installed: true,
});

/** 受注型の共通工程。確認は「参加者」と「会社の担当」の2通りを持ち、秘密を含む受注は後者だけが選ばれる。 */
export const SKY_GIG_CAPABILITIES: readonly RecipeCapability[] = [
  step('build-with-ai', 'AIで制作', 'tool', ['request'], 'draft', 120, 0, 10),
  step('self-check', '依頼の条件との照合', 'tool', ['draft', 'request'], 'checked', 40, 0, 3),
  step('member-review', '参加者の確認', 'reviewer', ['checked'], 'reviewed', 0, 0, 240),
  step('company-review', '会社の担当の確認', 'owner', ['checked'], 'reviewed', 0, 20, 0),
  step('package-delivery', '納品物をまとめて送る', 'tool', ['reviewed'], 'delivery', 10, 0, 2),
];

/**
 * 本人が好きなことだけをやる型。本人が作るのは `made` の1つだけで、残りは全部工程が引き受ける。
 * 売り場は自社の場所ではなく、既に買い手がいる場所。
 */
export type CreatorLane = {
  id: string;
  name: string;
  /** 本人が作るもの（素材の型）。ここは自動化しない。 */
  made: string;
  /** 売り物の形。 */
  product: string;
  /** 売る場所（既にある市場）。 */
  markets: readonly string[];
  /** 買い手を連れてくる場所。 */
  funnel: readonly string[];
};

export const CREATOR_LANES: readonly CreatorLane[] = [
  { id: 'illustration', name: 'お絵描き', made: 'artwork', product: 'アイコン・挿絵の受注、素材・グッズの販売',
    markets: ['ココナラ', 'SKIMA', 'BOOTH', 'SUZURI', 'LINEスタンプ'], funnel: ['Instagram', 'X', 'pixiv'] },
  { id: 'essay', name: 'エッセイ・文章', made: 'manuscript', product: '有料記事・マガジン、電子書籍、連載',
    markets: ['note', 'Kindle', 'Substack'], funnel: ['X', 'Threads', 'Instagram'] },
  { id: 'industry-digest', name: '業界の情報収集', made: 'findings', product: '週次の業界ダイジェスト（月額）、調査レポートの受注',
    markets: ['note メンバーシップ', 'Substack', 'ココナラ'], funnel: ['X', 'LinkedIn'] },
  { id: 'analysis', name: '解析・分析', made: 'analysis', product: '分析レポートの受注、データの読み方の記事・テンプレート',
    markets: ['ココナラ', 'ランサーズ', 'note', 'BOOTH'], funnel: ['X', 'Qiita', 'Zenn'] },
];

/**
 * 好きなこと型の工程。本人の工程は「作る」だけ。
 * 売り場ごとの掲載・投稿は、その売り場の接続が入るまで available: false にして、planner が gap として返すようにする。
 */
export function creatorCapabilities(lane: CreatorLane, connected: readonly string[] = []): RecipeCapability[] {
  const live = (name: string) => connected.includes(name);
  return [
    { ...step(`${lane.id}:make`, `${lane.name}（本人）`, 'owner', ['idea'], lane.made, 0, 60, 0) },
    step(`${lane.id}:demand`, '売れている形と価格を調べる', 'tool', [lane.made], 'offer-plan', 60, 0, 10),
    step(`${lane.id}:package`, '売り物の形に整える（題名・説明・見本・価格）', 'tool', [lane.made, 'offer-plan'], 'listing-draft', 80, 0, 10),
    { ...step(`${lane.id}:publish`, `掲載する（${lane.markets[0]}）`, 'tool', ['listing-draft'], 'listing', 0, 0, 5), available: live(lane.markets[0]) },
    step(`${lane.id}:teasers`, '告知の投稿を作る', 'tool', [lane.made, 'listing-draft'], 'posts', 60, 0, 10),
    { ...step(`${lane.id}:post`, `投稿する（${lane.funnel[0]}）`, 'tool', ['posts', 'listing'], 'reach', 0, 0, 5), available: live(lane.funnel[0]) },
    step(`${lane.id}:inbox`, '問い合わせに答え、注文を受ける', 'tool', ['reach'], 'order', 40, 0, 60),
    step(`${lane.id}:deliver`, '納品と入金の記録', 'tool', ['order', lane.made], 'paid-sale', 10, 0, 5),
  ];
}
