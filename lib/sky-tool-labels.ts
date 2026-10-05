export type SkyToolLabel = {
  role: string;
  provider: string;
  handle: string;
  initial: string;
  helper: string;
  placeholder: string;
};

export const skyToolLabels: Record<string, SkyToolLabel> = {
  'rockstar-ip-studio': {
    role: 'IP・SNS運用役',
    provider: 'Sky IP・SNS運用アシスタント',
    handle: '@sky_ip',
    initial: 'IP',
    helper: 'IP・SNS運用とLiveKitの音声・電話連携の接続条件を整理します。公開・音声送信・発信は行いません。',
    placeholder: '対象IP・制作や音声会話の目的・接続したいサービスを入力',
  },
  'coconala-proposal-draft': {
    role: '提案文下書き役',
    provider: 'Sky 提案文アシスタント',
    handle: '@sky_proposal',
    initial: '提',
    helper:
      '案件条件を添えた定型の提案文を作ります。AI生成や応募・送信は行いません。',
    placeholder: '案件内容・納期・経験・確認したい条件を入力',
  },
  'gig-workflow': {
    role: '受託案件進行役',
    provider: 'Sky 案件ワークフロー',
    handle: '@sky_gig',
    initial: '進',
    helper:
      '入力を添えた案件進行の確認テンプレートを作ります。外部の進捗や入金は取得しません。',
    placeholder: '案件の状況と、整理したい作業の流れを入力',
  },
  'coconala-inbox': {
    role: '依頼整理役',
    provider: 'Sky 依頼整理アシスタント',
    handle: '@sky_inbox',
    initial: '整',
    helper:
      '依頼文を添えた納期・報酬・添付の確認欄を作ります。条件の自動抽出や添付取得は行いません。',
    placeholder: '依頼文や確認したい内容を貼り付け',
  },
  'youtube-script-writer': {
    role: 'YouTube台本役',
    provider: 'Sky YouTube台本アシスタント',
    handle: '@sky_youtube',
    initial: '動',
    helper:
      '入力を添えた台本構成のテンプレートを作ります。動画尺に合わせた生成や撮影は行いません。',
    placeholder: 'テーマ・動画尺・対象者・入れたい結論を入力',
  },
  'seo-blueprint': {
    role: 'SEO構成役',
    provider: 'Sky SEO構成アシスタント',
    handle: '@sky_seo',
    initial: 'S',
    helper:
      '記事テーマを添えた検索意図・記事構成の確認テンプレートを作ります。検索調査やAI分析は行いません。',
    placeholder: '記事テーマ・読者・狙いたい検索語を入力',
  },
  'landing-page-sprint': {
    role: 'LP制作役',
    provider: 'Sky LP制作アシスタント',
    handle: '@sky_lp',
    initial: 'L',
    helper:
      '商品条件を添えた販売ページ構成のテンプレートを作ります。サイト生成や公開は行いません。',
    placeholder: '商品・対象者・価格・伝えたい強みを入力',
  },
  'sales-objection-reply-builder': {
    role: '商談返信役',
    provider: 'Sky 商談返信アシスタント',
    handle: '@sky_sales',
    initial: '商',
    helper:
      '入力を添えた定型の返信と見積り確認欄を作ります。価格の自動算出や送信は行いません。',
    placeholder: '相手の発言・商品条件・返信の目的を入力',
  },
  'user-interview-synthesizer': {
    role: '顧客インタビュー役',
    provider: 'Sky 顧客理解アシスタント',
    handle: '@sky_interview',
    initial: '顧',
    helper:
      '発言を添えて、テーマ・根拠・仮説の記入欄を作ります。AIによる分析は未接続です。',
    placeholder: '顧客の発言・困りごと・利用状況を入力',
  },
  'calendar-coordination': {
    role: '予定調整役',
    provider: 'Sky 予定調整アシスタント',
    handle: '@sky_calendar',
    initial: '予',
    helper:
      '依頼文を残し、日時・所要時間・場所の記入欄を作ります。条件の自動抽出とカレンダー接続は未実装です。',
    placeholder: '候補日・時間帯・所要時間・参加者条件を入力',
  },
  'telegram-notifications': {
    role: 'Telegram通知役',
    provider: 'Sky 通知アシスタント',
    handle: '@sky_telegram',
    initial: '通',
    helper:
      '入力を添えた定型の通知文を作ります。TelegramのBot接続や送信は行いません。',
    placeholder: '完了した仕事・通知したい相手・確認事項を入力',
  },
  'producthunt-discovery': {
    role: 'ツール発見役',
    provider: 'Sky ツール発見アシスタント',
    handle: '@sky_discovery',
    initial: '発',
    helper:
      '入力を添えた公式URL・料金・権限の調査チェックリストを作ります。候補検索やAPI取得は行いません。',
    placeholder: '探したい分野・用途・避けたい条件を入力',
  },
  'faster-whisper': {
    role: '文字起こし役',
    provider: 'Sky ローカル文字起こし',
    handle: '@sky_transcribe',
    initial: '音',
    helper: '音声をローカル処理するための接続条件を確認します。',
    placeholder: '音声形式・言語・必要な確認内容を入力',
  },
  'transformers-js': {
    role: 'ブラウザAI役',
    provider: 'Sky ブラウザAIアシスタント',
    handle: '@sky_browser_ai',
    initial: 'AI',
    helper: 'ブラウザ内AIのモデル・ライセンス・負荷の確認項目を整理します。',
    placeholder: '使いたいモデル・処理内容・制約を入力',
  },
  playwright: {
    role: 'ブラウザ検証役',
    provider: 'Sky ブラウザ検証',
    handle: '@sky_playwright',
    initial: '検',
    helper:
      '所有・許可済みサイトの読み取りテスト条件を整理します。送信はしません。',
    placeholder: 'テスト対象・ログイン後に確認したい画面を入力',
  },
  'jev-ultrafast': {
    role: '高速操作検証役',
    provider: 'Sky 高速操作検証',
    handle: '@sky_jev_fast',
    initial: '速',
    helper: '許可済みページで、次に確認する一手だけを安全に整理します。',
    placeholder: '許可範囲・確認したいページ・一手の目的を入力',
  },
  'jev-trader': {
    role: 'PAPER市場研究役',
    provider: 'Sky PAPER市場研究',
    handle: '@sky_paper',
    initial: '市',
    helper: '固定リプレイで価格・仮想注文・手数料の確認条件を整理します。',
    placeholder: '対象市場・期間・仮想注文の確認条件を入力',
  },
  'typesafe-computer-use': {
    role: 'PC操作検証役',
    provider: 'Sky PC操作検証',
    handle: '@sky_pc_check',
    initial: 'PC',
    helper: '隔離環境で画面観測だけを行う確認条件を整理します。',
    placeholder: '許可アプリ・観測したい画面・禁止操作を入力',
  },
  'jev-review': {
    role: 'コードレビュー役',
    provider: 'Sky コードレビュー',
    handle: '@sky_review',
    initial: '査',
    helper: '変更内容のリスク・確認項目・テスト観点を整理します。',
    placeholder: '変更内容・気になるリスク・確認したい範囲を入力',
  },
  'jev-router': {
    role: 'モデル振分け役',
    provider: 'Sky モデル振分け',
    handle: '@sky_router',
    initial: '振',
    helper: '依頼の複雑さと制約から、使うモデルの条件を整理します。',
    placeholder: '依頼内容・速度・費用・精度の優先順位を入力',
  },
  'jev-browser': {
    role: 'サイト検証役',
    provider: 'Sky サイト検証',
    handle: '@sky_browser',
    initial: 'Web',
    helper: '所有サイトの読み取りだけを行うブラウザ接続条件を整理します。',
    placeholder: '対象サイト・読み取りたい情報・禁止操作を入力',
  },
  'mobile-jev': {
    role: 'Android検証役',
    provider: 'Sky Android検証',
    handle: '@sky_android',
    initial: '携',
    helper: '隔離した試験端末で、観測だけの操作ジョブ条件を整理します。',
    placeholder: '試験端末・確認画面・許可する操作範囲を入力',
  },
};

export function skyToolLabelFor(toolId: string) {
  return skyToolLabels[toolId];
}
