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
    | 'patent-assistant';
  origin?: 'mr' | 'rockstaros';
  environment: string;
  cost: string;
  steps: string[];
  note: string;
};
export const catalog: Automation[] = [
  {"id":"fashion-brand-ops","name":"Instagram運用・受注型ブランド管理","category":"ブランド運営","description":"売上・数量・粗利目標からInstagram施策、DM接客、受注、決済、制作・発送、改善までを進める承認付きブランド経営MCPです。","source":"https://github.com/k999ln/rock/tree/main/toolkits/fashion-brand-ops","integration":"fashion-brand-ops","environment":"PC / Node.js 22.13以上 / SkyへMCP接続後。外部Providerは任意接続","cost":"初期状態はmockで外部費用なし。Higgsfield、Meta、Stripe等の外部料金は各契約に従い、実行前に確認します。","steps":["ブランド方針と商品を登録し、数量・売上・粗利・期限・広告上限を目標にする","Campaign Autopilotが市場、広告仮説、投稿ペース、次の操作を組み立てる","Sales Conciergeが顧客履歴と購入意向から返信案・見積りへの次の一手を作る","入金確認後、Production Cockpitで資材・原価・能力・納期・工程を管理する","投稿・広告・DM・請求の外部作用はSkyで内容を確認して個別承認する","広告・DM・売上・制作結果を経営画面と次回creativeへ反映する"],"note":"計画と下書きは自動化しますが、価格変更、外部生成、投稿・広告出稿、DM送信、請求、返金は署名付きの個別承認が必要です。paid/refundedは検証済み決済event以外から変更できません。","color":"green","license":"repository","licenseUrl":"https://github.com/k999ln/rock","status":"ready","origin":"rockstaros"},
  {"id": "coconala", "name": "ココナラ案件チェック", "category": "案件・納品支援", "description": "依頼文と提案文から、面談の必要性や役割の食い違いを確認。応募前の判断を助けます。", "source": "https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/earn/gig/scripts/application_eligibility.py", "runner": "coconala", "environment": "ブラウザ内 / Rockへのサインインが必要", "cost": "外部APIは使いません。サイト読込以外の追加通信はありません。", "steps": ["依頼文と送信前の提案文を用意する", "契約形態と発注率を元ページで確認する", "案件チェックを実行し、理由を確認する", "元ページの条件・規約を本人が確認して判断する"], "note": "Mr.の単発・非同期案件向けルールを移植しました。ココナラの規約や受注可否を保証せず、自動応募・返信・入金確認は行いません。", "color": "green", "license": "MIT", "licenseUrl": "/toolkits/mr-LICENSE.txt", "status": "ready", "origin": "mr"},
  {"id": "mr-free-article", "name": "記事の無料版メーカー", "category": "記事制作", "description": "完全版の原稿から無料の紹介記事を作成。要点と出典を残し、noteへの案内を添えます。", "source": "https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/writer-agent/scripts/_shared/make-free-version.py", "runner": "free-article", "environment": "ブラウザ内 / Rockへのサインインが必要", "cost": "外部AIや有料APIを使わず、端末内で文章を処理します。", "steps": ["自分が利用できる原稿を用意する", "無料にする範囲・まとめ・完全版のリンクを入力する", "作成結果と残したい有料部分を確認する", "必要な形式で保存し、本人が公開する"], "note": "まとめは入力した文章を使用します。記事の自動執筆・noteへの投稿・販売は行いません。", "color": "blue", "license": "MIT", "licenseUrl": "/toolkits/mr-LICENSE.txt", "status": "ready", "origin": "mr"},
  {"id": "mr-citations", "name": "出典整理ツール", "category": "記事制作", "description": "本文中の出典リンクを一覧に整理。同じURLをまとめ、コードや非リンクの出典は保ちます。", "source": "https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/writer-agent/scripts/_shared/citation-strip.py", "runner": "citations", "environment": "ブラウザ内 / Rockへのサインインが必要", "cost": "端末内のテキスト処理のみ。外部APIや追加サービスは不要です。", "steps": ["出典リンクを含むMarkdownを貼り付ける", "出典整理を実行する", "本文と出典の対応を自分で確認する", "結果をコピーまたはMarkdownで保存する"], "note": "出典の事実確認は行いません。引用元との対応が必要な記事では、整理後の表記を確認してください。", "color": "orange", "license": "MIT", "licenseUrl": "/toolkits/mr-LICENSE.txt", "status": "ready", "origin": "mr"},
  {"id": "mr-delivery", "name": "納品記録の照合", "category": "案件・納品支援", "description": "契約条件・成果物・制作記録・レビューを照合。納品前の記録の不一致を見つけます。", "source": "https://github.com/k999ln/Mr./blob/26a39d2c31ea5246cb78dbe42d86e333922db60c/skills/earn/gig/scripts/deliverable_verifier.py", "runner": "delivery-local", "environment": "PC / Python 3.10以上", "cost": "PC内でファイルを読み照合します。追加の通信・API料金はありません。", "steps": ["無料パックを展開し、Python環境を用意する", "同梱サンプルで実行方法を確認する", "成果物・契約・制作記録・別レビューのデータを用意する", "照合結果を確認してから、本人が納品する"], "note": "内容の品質を自動判断するのではなく、別途作成したレビューとファイルを照合します。検出対象は限定的で、秘密情報の不在も保証しません。", "color": "pink", "license": "MIT", "licenseUrl": "/toolkits/mr-LICENSE.txt", "status": "ready", "origin": "mr"},
  {"id":"rockstar-ledger","name":"サブスク顧問","category":"経費・契約管理","description":"契約、更新日、支払い失敗を一元管理。カード明細から定期課金候補も見つけます。","source":"https://github.com/k999ln/rock/tree/codex/sky-rockstar-ledger-20260912/toolkits/rockstar-ledger","runner":"subscription-ledger","environment":"PC・MCP / ローカル台帳","cost":"追加API料金なし。契約データと明細はPC内のSQLiteに保存し、Skyは読み取り専用で接続します。","steps":["Rockstar LedgerをPCへ展開する","Python 3.10以上でローカル台帳を起動する","Skyでサブスク顧問を開き、接続状態を確認する","要対応と更新予定を確認し、変更は本人が各契約先で行う"],"note":"Skyは契約状況の確認を支援します。解約、支払い、税務申告を自動実行せず、通貨も勝手に合算しません。","color":"green","license":"MIT","licenseUrl":"/toolkits/rockstar-ledger-LICENSE.txt","status":"ready","origin":"rockstaros"},
  {id:'faster-whisper',name:'faster-whisper',category:'文字起こし',description:'音声から、編集できるテキストへ。PCで使える文字起こしエンジン。',source:'https://github.com/SYSTRAN/faster-whisper',license:'MIT',licenseUrl:'https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE',color:'orange',status:'candidate',environment:'PC / Python。CPUまたは対応GPU',cost:'モデルの初回ダウンロードで通信量が増えます。実行中はPCの電力を使用。',steps:['公式READMEでOS・Python・ハードウェア要件を確認する','音声を扱う権限とモデルの利用条件を確認する','CodexでREADMEに沿ってローカル環境を準備する','短い音声で試し、誤変換を確認してから納品する'],note:'OSSの導入候補です。Rock starからの自動実行や収益連携は未対応です。'},
  {id:'transformers-js',name:'Transformers.js',category:'ブラウザAI',description:'ブラウザでモデルを実行。分類・要約などのワークフローの土台に。',source:'https://github.com/huggingface/transformers.js',license:'Apache-2.0',licenseUrl:'https://github.com/huggingface/transformers.js/blob/main/LICENSE',color:'blue',status:'candidate',environment:'対応ブラウザ / JavaScript・WebGPU等',cost:'モデルをダウンロードします。対応状況とメモリ・通信量はモデルごとに異なります。',steps:['公式READMEで対象タスクとブラウザ対応を確認する','使用モデルのカードとライセンスを個別に確認する','CodexでREADMEに沿ってローカル環境を準備する','小さな入力で結果・処理時間・端末負荷を確認する'],note:'ライブラリのライセンスとモデルのライセンスは別です。モデルを自動配布・実行しません。'},
  {id:'playwright',name:'Playwright',category:'ブラウザ操作',description:'許可されたWeb操作を再現。確認作業や繰り返しのテストを効率化。',source:'https://github.com/microsoft/playwright',license:'Apache-2.0',licenseUrl:'https://github.com/microsoft/playwright/blob/main/LICENSE',color:'pink',status:'candidate',environment:'PC / Node.js・対応ブラウザ',cost:'ブラウザのダウンロードとページ読込で通信量が増えます。実行中はPCの電力を使用。',steps:['操作先の規約と自分の操作権限を確認する','公式READMEに沿ってCodexで環境を準備する','自分のテスト環境で操作を検証する','送信・購入等は本人が内容と実行を確認する'],note:'ココナラ等の第三者サイトの無人操作を許諾するものではありません。'}
];
