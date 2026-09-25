export type Automation = {
  id: string;
  name: string;
  category: string;
  description: string;
  source: string;
  license: string;
  licenseUrl: string;
  color: string;
  status: 'ready' | 'candidate' | 'pending';
  runner?:
    | 'coconala'
    | 'citations'
    | 'free-article'
    | 'delivery-local'
    | 'subscription-ledger'
    | 'legal-intake'
    | 'patent-assistant'
    | 'jev-evaluation'
    | 'candidate-local';
  launchPath?: string;
  origin?: 'mr' | 'rockstaros';
  integration?: 'fashion-brand-ops';
  environment: string;
  cost: string;
  steps: string[];
  note: string;
};

const mrHubCandidates: Automation[] = [
  ['coconala-proposal-draft', 'ココナラ提案文の下書き', '案件・納品支援', '案件条件から提案文と確認リストを作る既存の端末内処理。', '既存のローカル実行器をSky SDKへ接続する'],
  ['gig-workflow', '受託案件ワークフロー', '案件・納品支援', '応募・交渉・制作・納品・売上確認の既存処理を段階ごとに支援。', '所有者設定を移し、外部操作に個別承認を付ける'],
  ['coconala-inbox', 'ココナラの依頼・添付整理', '案件・納品支援', '本人の依頼文と添付を整理する既存処理。', '本人の接続と保存範囲を確認する'],
  ['youtube-script-writer', 'YouTube台本', '動画制作', 'タイトル案、冒頭、台本、撮影キューを作る既存Service Cell。', '台本生成と品質確認の実行器を接続する'],
  ['seo-blueprint', 'SEO・記事構成', '記事制作', '検索意図、キーワード、構成案を整理する既存Service Cell。', '調査元と生成実行器を接続する'],
  ['landing-page-sprint', 'LP・販売ページ制作', '販売・収益化', '情報設計、コピー、画面と公開前確認を扱う既存Service Cell。', '制作実行器を接続し、公開は本人確認を通す'],
  ['sales-objection-reply-builder', '商談返信・見積り支援', '販売・収益化', '正式な商品条件から返信文と確認事項を作る既存Service Cell。', '返信生成実行器を接続する'],
  ['user-interview-synthesizer', '顧客インタビュー分析', '市場・商品設計', '発言をテーマ、根拠、仮説と次の検証に整理する既存Service Cell。', '発言と分析結果を結ぶ実行器を接続する'],
  ['calendar-coordination', '予定・カレンダー連携', '生活・予定', '既存Coreの予定解釈とカレンダー連携処理。', '本人のアカウント接続と権限確認を行う'],
  ['telegram-notifications', 'Telegram通知・承認', '通知・連絡', '既存Botの依頼受付、通知、進捗確認をSkyの仕事につなぐ処理。', '本人確認済みBotと送信範囲を接続する'],
  ['producthunt-discovery', '外部ツール候補の発見', '市場・商品設計', 'Product Hunt公式API向けの候補検索処理。', 'API利用条件と商用許諾を確認する'],
].map(([id, name, category, description, next]) => ({
  id, name, category, description,
  source: 'https://github.com/k999ln/Mr.',
  license: 'MIT',
  licenseUrl: 'https://github.com/k999ln/Mr./blob/main/LICENSE',
  color: 'blue',
  status: 'candidate',
  origin: 'mr',
  environment: '既存コード・設計あり / Sky実行器は未接続',
  cost: '接続先、モデル、外部サービスの実費を接続時に確認します。',
  steps: [next, 'Sky SDKでPackageとMCPを登録する', '接続先、権限、副作用、結果を確認して使う'],
  note: 'Mr.の旧Automation Hubの在庫から移した導入候補です。Skyからの実行と外部サービスへの接続は、実装・検証後に有効になります。',
}));
export const catalog = ([
  {
    id: 'rockstar-csv-cleanup',
    name: 'CSV整形・検査・納品',
    category: '販売・収益化',
    description:
      '1ファイルのCSVを指定どおりに整形し、結果・変更報告・独立検査を一つの受付から納品します。',
    source: 'avocadoOS built-in',
    launchPath: '/csv',
    environment: 'Sky Cloud / サインイン必須 / 暗号化された非公開ストレージ',
    cost: '購入者向け試験価格は税込3,000円。販売者向けの8.88 USD料金案は収益動線が決まるまで保留中です。',
    steps: [
      'CSVと列名・列順・空白・重複・並び順・出力文字コードを指定する',
      '10MB・50,000行・100列の範囲と変換可能性を検査し、見積りを固定する',
      '外部市場または契約済み経路の入金を本人が確認して照合番号を記録する',
      '文字列を勝手に数値化せず、決定的な順番で変換する',
      '独立検査に合格した結果CSV・変更報告・検査JSONを納品する',
      '受付から7日後は取得を拒否し、または本人の削除操作で入力と成果物を消す',
    ],
    note: '値の推測・補完、複数ファイル結合、外部市場の代理操作はしません。手入力した入金番号だけではWalletの確認済み収益に計上しません。',
    color: 'green',
    license: 'avocadoOS code',
    licenseUrl: 'https://github.com/k999ln/rock',
    status: 'ready',
    origin: 'rockstaros',
  },
  {
    id: 'rockstar-markets-analysis',
    name: 'avocadoOS Market Scanner',
    category: '市場・商品設計',
    description:
      '型付きの価値対象をavocadoOS Marketへ登録し、価格・需要・PAPER取引履歴を検証します。',
    source: 'avocadoOS built-in',
    launchPath: '/market',
    environment: 'ブラウザ内 / avocadoOS PAPER市場',
    cost: '追加料金なし。PAPER残高は実資金ではなく、換金・送金・外部注文はできません。',
    steps: [
      '自動化、制作物、サービス、商品、稼働枠から対象の型を選ぶ',
      '価格、供給量、説明を登録する',
      '注文提案とrisk判定を確認する',
      '同一digestを本人承認してPAPER取引を実行する',
      'receipt、position、eventから結果を確認する',
      'PAPER損益を実収益や将来利回りとして扱わない',
    ],
    note: '取引はavocadoOS内のPAPER検証だけです。秘密鍵、LIVE切替、外部注文、実Wallet操作を受け付けず、simulation PnL、含み益、見積もり、取引量をファンド収益へ計上しません。',
    color: 'blue',
    license: 'avocadoOS code',
    licenseUrl: 'https://github.com/k999ln/rock',
    status: 'ready',
    origin: 'rockstaros',
  },
  {
    id: 'mercari-revenue',
    name: 'メルカリ収益スターター',
    category: '販売・収益化',
    description:
      '手元の在庫から、出品原稿・実費後の見込み利益・確認事項・取引完了までを一つの収益フローで管理します。',
    source: 'https://api.mercari-shops.com/docs/index.html',
    launchPath: '/income/mercari',
    environment:
      '個人メルカリはブラウザ内の出品支援 / Shops自動連携は日本国内の固定IPを持つConnectorが必要',
    cost: 'Skyの出品準備は追加料金なし。販売手数料・送料・仕入原価は利用者が実額を入力し、売上から先に差し引いて計算します。',
    steps: [
      '自分が保有する商品と、状態・価格・実費を入力する',
      'Skyが出品原稿と見込み手取りを作り、禁止物・誤表示・在庫を確認する',
      '個人メルカリは本人が公式画面で出品する。Shopsは公式API Connector接続後に個別承認する',
      '取引完了と入金をProviderで確認できた売上だけをWalletへ記録する。収益料金は保留中',
    ],
    note: '販売や利益は保証しません。個人アカウントの認証情報を預からず、無人出品・大量再出品・購入・メッセージ・発送・出金は行いません。自己申告の売上は検証済み収益として精算しません。',
    color: 'orange',
    license: 'service terms / avocadoOS code MIT',
    licenseUrl: 'https://static.jp.mercari.com/tos',
    status: 'ready',
    origin: 'rockstaros',
  },
  {
    id: 'fashion-brand-ops',
    name: 'Instagram運用・受注型ブランド管理',
    category: 'ブランド運営',
    description:
      '売上・数量・粗利目標からInstagram施策、DM接客、受注、決済、制作・発送、改善までを進める承認付きブランド経営MCPです。',
    source:
      'https://github.com/k999ln/rock/tree/main/toolkits/fashion-brand-ops',
    integration: 'fashion-brand-ops',
    environment:
      'PC / Node.js 22.13以上 / SkyへMCP接続後。外部Providerは任意接続',
    cost: '初期状態はmockで外部費用なし。Higgsfield、Meta、Stripe等の外部料金は各契約に従い、実行前に確認します。',
    steps: [
      'ブランド方針と商品を登録し、数量・売上・粗利・期限・広告上限を目標にする',
      'Campaign Autopilotが市場、広告仮説、投稿ペース、次の操作を組み立てる',
      'Sales Conciergeが顧客履歴と購入意向から返信案・見積りへの次の一手を作る',
      '入金確認後、Production Cockpitで資材・原価・能力・納期・工程を管理する',
      '投稿・広告・DM・請求の外部作用はSkyで内容を確認して個別承認する',
      '広告・DM・売上・制作結果を経営画面と次回creativeへ反映する',
    ],
    note: '計画と下書きは自動化しますが、価格変更、外部生成、投稿・広告出稿、DM送信、請求、返金は署名付きの個別承認が必要です。paid/refundedは検証済み決済event以外から変更できません。',
    color: 'green',
    license: 'repository',
    licenseUrl: 'https://github.com/k999ln/rock',
    status: 'ready',
    origin: 'rockstaros',
  },
  {
    id: 'rockstar-ip-studio',
    name: 'IP Studio — SNS・ゲーム運用',
    category: 'IP・コンテンツ運用',
    description:
      '参考画像と「何をしたいか」からキャラクター・スキンを制作し、Instagram・YouTube・Roblox・GTAなどへの導線を一つの運用フローで管理します。',
    source: 'avocadoOS built-in / Kaiya IP Studio',
    launchPath: 'http://127.0.0.1:18767/',
    environment:
      'このPCのIP Studio / Skyで接続状態と承認を管理',
    cost:
      'ローカル利用は追加料金なし。Higgsfield、Make、各ゲーム・SNSの料金と契約は実行前に確認します。',
    steps: [
      '参考画像と「何をしたいか」を入力してIPの制作依頼を作る',
      'Higgsfieldで画像・動画を生成するか、完成素材を登録する',
      '権利・利用条件・ゲーム導入先を確認してゲーム版を記録する',
      'Instagram・YouTubeの投稿案を確認し、本人承認後にMakeへ送る',
      '投稿結果とゲームへの導線を同じIPの履歴へ戻す',
    ],
    note:
      'Skyは本人・接続・承認・停止状態を管理します。IP Studioは素材と生成・投稿案を扱います。APIキー、Cookie、SNSログイン情報はSkyの入力欄や仕事本文へ保存しません。投稿、広告、DM、ゲームへの提出は1回ごとの本人承認が必要です。',
    color: 'purple',
    license: 'avocadoOS / Kaiya IP Studio',
    licenseUrl: 'http://127.0.0.1:18767/',
    status: 'candidate',
    origin: 'rockstaros',
  },
  {
    id: 'coconala',
    name: 'ココナラ案件チェック',
    category: '案件・納品支援',
    description:
      '依頼文と提案文から、面談の必要性や役割の食い違いを確認。応募前の判断を助けます。',
    source:
      'https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/earn/gig/scripts/application_eligibility.py',
    runner: 'coconala',
    environment: 'ブラウザ内 / Rockへのサインインが必要',
    cost: '外部APIは使いません。サイト読込以外の追加通信はありません。',
    steps: [
      '依頼文と送信前の提案文を用意する',
      '契約形態と発注率を元ページで確認する',
      '案件チェックを実行し、理由を確認する',
      '元ページの条件・規約を本人が確認して判断する',
    ],
    note: 'Mr.の単発・非同期案件向けルールを移植しました。ココナラの規約や受注可否を保証せず、自動応募・返信・入金確認は行いません。',
    color: 'green',
    license: 'MIT',
    licenseUrl: '/toolkits/mr-LICENSE.txt',
    status: 'ready',
    origin: 'mr',
  },
  {
    id: 'mr-free-article',
    name: '記事の無料版メーカー',
    category: '記事制作',
    description:
      '完全版の原稿から無料の紹介記事を作成。要点と出典を残し、noteへの案内を添えます。',
    source:
      'https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/writer-agent/scripts/_shared/make-free-version.py',
    runner: 'free-article',
    environment: 'ブラウザ内 / Rockへのサインインが必要',
    cost: '外部AIや有料APIを使わず、端末内で文章を処理します。',
    steps: [
      '自分が利用できる原稿を用意する',
      '無料にする範囲・まとめ・完全版のリンクを入力する',
      '作成結果と残したい有料部分を確認する',
      '必要な形式で保存し、本人が公開する',
    ],
    note: 'まとめは入力した文章を使用します。記事の自動執筆・noteへの投稿・販売は行いません。',
    color: 'blue',
    license: 'MIT',
    licenseUrl: '/toolkits/mr-LICENSE.txt',
    status: 'ready',
    origin: 'mr',
  },
  {
    id: 'mr-citations',
    name: '出典整理ツール',
    category: '記事制作',
    description:
      '本文中の出典リンクを一覧に整理。同じURLをまとめ、コードや非リンクの出典は保ちます。',
    source:
      'https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/writer-agent/scripts/_shared/citation-strip.py',
    runner: 'citations',
    environment: 'ブラウザ内 / Rockへのサインインが必要',
    cost: '端末内のテキスト処理のみ。外部APIや追加サービスは不要です。',
    steps: [
      '出典リンクを含むMarkdownを貼り付ける',
      '出典整理を実行する',
      '本文と出典の対応を自分で確認する',
      '結果をコピーまたはMarkdownで保存する',
    ],
    note: '出典の事実確認は行いません。引用元との対応が必要な記事では、整理後の表記を確認してください。',
    color: 'orange',
    license: 'MIT',
    licenseUrl: '/toolkits/mr-LICENSE.txt',
    status: 'ready',
    origin: 'mr',
  },
  {
    id: 'mr-delivery',
    name: '納品記録の照合',
    category: '案件・納品支援',
    description:
      '契約条件・成果物・制作記録・レビューを照合。納品前の記録の不一致を見つけます。',
    source:
      'https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/earn/gig/scripts/deliverable_verifier.py',
    runner: 'delivery-local',
    environment: 'PC / Python 3.10以上',
    cost: 'PC内でファイルを読み照合します。追加の通信・API料金はありません。',
    steps: [
      '無料パックを展開し、Python環境を用意する',
      '同梱サンプルで実行方法を確認する',
      '成果物・契約・制作記録・別レビューのデータを用意する',
      '照合結果を確認してから、本人が納品する',
    ],
    note: '内容の品質を自動判断するのではなく、別途作成したレビューとファイルを照合します。検出対象は限定的で、秘密情報の不在も保証しません。',
    color: 'pink',
    license: 'MIT',
    licenseUrl: '/toolkits/mr-LICENSE.txt',
    status: 'ready',
    origin: 'mr',
  },
  {
    id: 'rockstar-ledger',
    name: 'サブスク顧問',
    category: '経費・契約管理',
    description:
      '契約、更新日、支払い失敗を一元管理。カード明細から定期課金候補も見つけます。',
    source:
      'https://github.com/k999ln/rock/tree/codex/sky-rockstar-ledger-20260912/toolkits/rockstar-ledger',
    runner: 'subscription-ledger',
    environment: 'PC接続 / ローカル台帳',
    cost: '追加API料金なし。契約データと明細はPC内のSQLiteに保存し、Skyは読み取り専用で接続します。',
    steps: [
      'Rockstar LedgerをPCへ展開する',
      'Python 3.10以上でローカル台帳を起動する',
      'Skyでサブスク顧問を開き、接続状態を確認する',
      '要対応と更新予定を確認し、変更は本人が各契約先で行う',
    ],
    note: 'Skyは契約状況の確認を支援します。解約、支払い、税務申告を自動実行せず、通貨も勝手に合算しません。',
    color: 'green',
    license: 'MIT',
    licenseUrl: '/toolkits/rockstar-ledger-LICENSE.txt',
    status: 'ready',
    origin: 'rockstaros',
  },
  {
    id: 'jev-evaluation',
    name: 'Jev品質評価',
    category: '品質・レビュー',
    description:
      '確認済みの最小出力をJevで評価し、根拠性・安全性・次の人手レビューの目安を返します。',
    source: 'https://vercel.com/ai-gateway/models/jev',
    environment: 'Sky Cloud / Vercel AI Gateway / 明示同意が必要',
    cost: 'AI Gatewayのprovider料金・無料枠・保持条件に従います。送信前に表示を確認します。',
    steps: [
      '評価対象を最小化し、個人情報・法務相談・未公開発明・秘密情報を除く',
      '送信先、料金、保持条件を確認して本人が同意する',
      'Jevが根拠性・安全性・有用性をtyped resultで評価する',
      'Evaluation Receiptをreview signalとして確認し、最終判断は本人が行う',
    ],
    note: 'Jevは文章生成器ではありません。評価結果は助言であり、権限判定、本人承認、Tool成功、仕事完了を決めません。',
    color: 'green',
    license: 'TypeSafe AI / Vercel AI Gateway terms',
    licenseUrl: 'https://vercel.com/ai-gateway/models/jev',
    status: 'ready',
    runner: 'jev-evaluation',
    origin: 'rockstaros',
  },
  {
    id: 'rockstar-legal-intake',
    name: '法務受付',
    category: '法律・生活支援',
    description:
      '日本語で状況を話すと、公式情報と無料窓口を案内。必要な案件だけ弁護士への引継ぎを準備します。',
    source:
      'https://github.com/k999ln/rock/tree/codex/sky-legal-intake-20260912',
    runner: 'legal-intake',
    environment:
      'Skyは相談内容を保存しません / 標準は端末内処理、オンライン検索は本人が明示許可した場合だけ',
    cost: '利用者への料金は0円で提供できます。法令AI接続時のAPI利用料は運営側に発生し、連絡・依頼後の弁護士費用は別途確認が必要です。',
    steps: [
      '危険・逮捕・公的書類・期限の有無を確認する',
      '法務受付との会話で、分野・地域・状況と希望を整理する',
      '政府・裁判所の公式情報に限定した回答と無料窓口を確認する',
      '刑事弁護が必要な案件は藤原茜弁護士を第一連絡候補として、本人確認後に連絡する',
    ],
    note: '法令AIの回答は一般情報であり、法的助言、期限計算、勝敗予測、受任保証ではありません。自動送信は行わず、受任可否・利益相反・料金・対応地域は弁護士へ直接確認します。差し迫った危険がある場合は米国内では911へ連絡してください。',
    color: 'blue',
    license: 'MIT',
    licenseUrl: '/LICENSE',
    status: 'ready',
    origin: 'rockstaros',
  },
  {
    id: 'rockstar-patent-assistant',
    name: '特許アシスタント',
    category: '法律・生活支援',
    description:
      'システム発明を整理し、先行技術候補の調査、特許性の予備評価、明細書・請求項・要約のドラフトを一つにまとめます。',
    source:
      'https://github.com/k999ln/rock/tree/codex/sky-legal-intake-20260912',
    runner: 'patent-assistant',
    environment:
      'Skyは発明内容を保存しません / 標準は端末内で書類作成、オンライン調査は本人が明示許可した場合だけ',
    cost: '書類ドラフトはブラウザ内で作成します。AI調査を選んだ場合だけ運営側にAPI利用料が発生し、出願料・弁理士費用は別です。',
    steps: [
      '発明者・出願人候補と、公開済みかどうかを確認する',
      '技術課題、仕組み、構成、効果、既存技術との差を入力する',
      '公式特許情報の候補と原文を確認し、差分を記録する',
      '明細書・請求項・要約のドラフトを専門家と本人が確認し、本人が提出する',
    ],
    note: '特許性、登録、侵害回避、期限を保証しません。AI調査は漏れを含む可能性があり、電子署名、料金支払、特許庁への提出は自動実行しません。公開済みの場合は公開記録を保存し、弁理士へ早急に確認してください。',
    color: 'orange',
    license: 'MIT',
    licenseUrl: '/LICENSE',
    status: 'ready',
    origin: 'rockstaros',
  },
  {
    id: 'faster-whisper',
    name: 'faster-whisper',
    category: '文字起こし',
    description:
      '音声から、編集できるテキストへ。PCで使える文字起こしエンジン。',
    source: 'https://github.com/SYSTRAN/faster-whisper',
    license: 'MIT',
    licenseUrl: 'https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE',
    color: 'orange',
    status: 'candidate',
    environment: 'PC / Python。CPUまたは対応GPU',
    cost: 'モデルの初回ダウンロードで通信量が増えます。実行中はPCの電力を使用。',
    steps: [
      '公式READMEでOS・Python・ハードウェア要件を確認する',
      '音声を扱う権限とモデルの利用条件を確認する',
      'CodexでREADMEに沿ってローカル環境を準備する',
      '短い音声で試し、誤変換を確認してから納品する',
    ],
    note: 'OSSの導入候補です。avocadoOSからの自動実行や収益連携は未対応です。',
  },
  {
    id: 'transformers-js',
    name: 'Transformers.js',
    category: 'ブラウザAI',
    description:
      'ブラウザでモデルを実行。分類・要約などのワークフローの土台に。',
    source: 'https://github.com/huggingface/transformers.js',
    license: 'Apache-2.0',
    licenseUrl:
      'https://github.com/huggingface/transformers.js/blob/main/LICENSE',
    color: 'blue',
    status: 'candidate',
    environment: '対応ブラウザ / JavaScript・WebGPU等',
    cost: 'モデルをダウンロードします。対応状況とメモリ・通信量はモデルごとに異なります。',
    steps: [
      '公式READMEで対象タスクとブラウザ対応を確認する',
      '使用モデルのカードとライセンスを個別に確認する',
      'CodexでREADMEに沿ってローカル環境を準備する',
      '小さな入力で結果・処理時間・端末負荷を確認する',
    ],
    note: 'ライブラリのライセンスとモデルのライセンスは別です。モデルを自動配布・実行しません。',
  },
  {
    id: 'playwright',
    name: 'Playwright',
    category: 'ブラウザ操作',
    description:
      '許可されたWeb操作を再現。確認作業や繰り返しのテストを効率化。',
    source: 'https://github.com/microsoft/playwright',
    license: 'Apache-2.0',
    licenseUrl: 'https://github.com/microsoft/playwright/blob/main/LICENSE',
    color: 'pink',
    status: 'candidate',
    environment: 'PC / Node.js・対応ブラウザ',
    cost: 'ブラウザのダウンロードとページ読込で通信量が増えます。実行中はPCの電力を使用。',
    steps: [
      '操作先の規約と自分の操作権限を確認する',
      '公式READMEに沿ってCodexで環境を準備する',
      '自分のテスト環境で操作を検証する',
      '送信・購入等は本人が内容と実行を確認する',
    ],
    note: 'ココナラ等の第三者サイトの無人操作を許諾するものではありません。',
  },
  {
    id: 'jev-ultrafast',
    name: 'Jev Ultrafast',
    category: 'ブラウザ操作AI',
    description:
      'Web画面の操作候補を番号付きで整理し、AIが許可された一手を選ぶ高速ブラウザエージェント。',
    source: 'https://github.com/browser-use/jev-ultrafast',
    license: 'MIT',
    licenseUrl:
      'https://github.com/browser-use/jev-ultrafast/blob/main/LICENSE',
    color: 'green',
    status: 'candidate',
    environment:
      '本人PC / Python 3.12以上・uv・Chrome remote debugging・Browser Harness・TypeSafe API・text model API',
    cost: '本体はMIT。選択したTypeSafe APIとtext model APIの利用料、通信量、本人PCの電力が別に発生する場合があります。',
    steps: [
      'source版・依存関係・MIT表示を固定し、offline testを通す',
      '普段使いと分離した専用Chrome profileと、操作してよいsiteだけを設定する',
      '閲覧だけの試験から始め、click・入力・送信を別の権限として確認する',
      '送信・投稿・予約・購入等は実行直前に内容を表示し、本人が一回だけ許可する',
      'Jevの完了申告とは別に、RockstarOSが結果を読み直してreceiptを保存する',
    ],
    note: '導入候補であり、まだ自動導入・実行できません。既存Chrome profile、password・OTP・決済情報、任意site、任意JavaScript、無人の投稿・予約・購入は許可しません。',
  },
  {
    id: 'jev-trader',
    name: 'Jev Trader',
    category: '市場判断研究',
    description:
      'order bookから売買方向を選ぶJev実験を、RockstarOSのPAPER市場で検証する候補。',
    source: 'https://github.com/jarrodwatts/jev-trader',
    license: 'MIT',
    licenseUrl: 'https://github.com/jarrodwatts/jev-trader/blob/main/LICENSE',
    color: 'orange',
    status: 'candidate',
    environment: '隔離PC / Bun・TypeSafe API。RockstarOSではPAPER／replay限定',
    cost: '本体はMIT。market data、TypeSafe API、network、計算費用が別に発生する場合があります。',
    steps: [
      'PRIVATE_KEYなし、dry-run、固定market replayで起動する',
      '価格、判断、仮想注文、仮想約定、費用をPAPER台帳へ分離保存する',
      'look-ahead、再現性、slippage、手数料、損失上限を検査する',
      '実注文・実資金・Wallet接続は独立した金融release gateまで拒否する',
    ],
    note: 'LIVE取引、秘密鍵、実注文、実資金移動、自動収益化は許可しません。利益を保証せず、PAPER候補としてのみ登録します。',
  },
  {
    id: 'typesafe-computer-use',
    name: 'TypeSafe Computer Use',
    category: 'PC画面操作AI',
    description:
      'Mac画面を決定的に読み取り、Jevが次の操作を選ぶcomputer-use候補。',
    source: 'https://github.com/awlevin/typesafe-computer-use',
    license: 'MIT',
    licenseUrl:
      'https://github.com/awlevin/typesafe-computer-use/blob/main/LICENSE',
    color: 'pink',
    status: 'candidate',
    environment:
      '隔離したmacOS account / Python・uv・OCR・TypeSafe API・画面操作権限',
    cost: '本体はMIT。TypeSafe API、text model、OCR、通信、本人PCの電力が別に発生します。',
    steps: [
      '専用macOS accountと許可appだけでobserve modeを試す',
      '画面読取、click、入力、外部送信の権限を分離する',
      '座標と対象の再確認、confidence下限、緊急停止を検査する',
      '送信・購入・削除・設定変更は直前の本人承認なしに実行しない',
    ],
    note: '普段使いaccount、password manager、system設定、決済、任意appを操作させません。repositoryの費用・速度値はRockstarOSで再測定します。',
  },
  {
    id: 'jev-review',
    name: 'Jev Review',
    category: 'コードレビューAI',
    description:
      'Git差分または指定scopeのcodebaseを、段階的なJev判断でreviewする候補。',
    source: 'https://github.com/devagrawal09/jev-review',
    license: 'MIT',
    licenseUrl: 'https://github.com/devagrawal09/jev-review/blob/main/LICENSE',
    color: 'green',
    status: 'candidate',
    environment:
      '本人PC / Node.js 24以上・Git・TypeSafe API。dashboardはloopback限定',
    cost: '本体はMIT。review対象量に応じたTypeSafe API利用料が発生する場合があります。',
    steps: [
      'review対象repository、path、commit、diff範囲を固定する',
      '秘密file、生成物、vendor、鍵を送信対象から除外する',
      '指摘ごとにfile、位置、根拠、severity、confidenceを保存する',
      '修正、commit、push、mergeは自動実行せず、人が確認する',
    ],
    note: 'review結果は補助判断です。秘密情報の外部送信、全filesystem走査、自動修正・commit・push・mergeを許可しません。',
  },
  {
    id: 'jev-router',
    name: 'Jev Router',
    category: 'AIモデルルーティング',
    description:
      'Codex／Claude Codeの各turnを、速いmodelまたは強いmodelへ振り分ける候補。',
    source: 'https://github.com/gargpratyush/jev-router',
    license: 'MIT',
    licenseUrl: 'https://github.com/gargpratyush/jev-router/blob/main/LICENSE',
    color: 'orange',
    status: 'candidate',
    environment: '本人PC / Node.js 20.12以上・対応CLI・TypeSafe API',
    cost: '本体はMIT。TypeSafe APIと、選択されたCLI／modelの契約・利用枠が必要です。',
    steps: [
      '対応CLI、model ID、reasoning、費用、fallbackをallowlist化する',
      '既存session、permission、authenticationを変更しないことを確認する',
      'routing理由、confidence、選択model、実費をreceiptへ記録する',
      '品質・費用・latencyを固定taskで比較し、本人が無効化できるようにする',
    ],
    note: 'routerにshell権限や認証情報を渡しません。model選択は権限拡大ではなく、既存CLIの承認境界を必ず維持します。',
  },
  {
    id: 'jev-browser',
    name: 'Jev Browser',
    category: 'ブラウザ操作AI',
    description:
      '既存browser toolの観測・操作・検証loop内で、Jevが画面要素を選ぶruntime候補。',
    source: 'https://github.com/vlad-terin/jev-browser',
    license: 'MIT',
    licenseUrl: 'https://github.com/vlad-terin/jev-browser/blob/main/LICENSE',
    color: 'green',
    status: 'candidate',
    environment: '本人PC / Node.js 22以上・対応browser tool・TypeSafe API',
    cost: '本体はMIT。TypeSafe API、browser実行、接続先通信の費用が別に発生します。',
    steps: [
      'installerとskill内容を読取り、source版と権限差分を固定する',
      '専用browser profileとowned siteでread-only navigationを試す',
      '連続runnerの各操作をRockstarOS Browser Brokerへ通す',
      '外部作用は一手ごとの承認と独立結果検証がない限り止める',
    ],
    note: '既存agentへ無条件installせず、default browser agentにも自動設定しません。Jev Ultrafastと同じ外部作用境界を適用します。',
  },
  {
    id: 'mobile-jev',
    name: 'Mobile Jev',
    category: 'Android操作AI',
    description:
      'Mobilerun経由のAndroid端末で、Jevが次のmobile操作を選ぶagent候補。',
    source: 'https://github.com/droidrun/mobile-jev',
    license: 'MIT',
    licenseUrl: 'https://github.com/droidrun/mobile-jev/blob/main/LICENSE',
    color: 'pink',
    status: 'candidate',
    environment:
      '隔離Android試験端末 / Node.js 22.16以上・pnpm 10.30.1・Mobilerun API・TypeSafe API',
    cost: '本体はMIT。Mobilerun端末／service、TypeSafe API、通信、端末利用料が別に発生します。',
    steps: [
      'Rock所有のwipe可能な試験端末と許可appだけを接続する',
      'device ID、app、操作、goal、step上限を一仕事へ固定する',
      '観察から開始し、入力・送信・購入・予約・権限変更を分離する',
      '停止、通信断、端末再起動、重複操作、trace削除を試験する',
    ],
    note: '個人端末、SIM、連絡先、写真、password、決済情報へ接続しません。demoは支払選択画面までで、予約完了の証明ではありません。',
  },
  ...mrHubCandidates,
] as Automation[]).map(
  (tool): Automation =>
    tool.status === 'candidate'
      ? { ...tool, runner: 'candidate-local' as const }
      : tool,
);
