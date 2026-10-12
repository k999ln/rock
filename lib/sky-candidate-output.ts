// Browser-local templates and connection plans only. No provider or device I/O.
const localDraftTools = new Set([
  'coconala-proposal-draft',
  'gig-workflow',
  'coconala-inbox',
  'youtube-script-writer',
  'seo-blueprint',
  'landing-page-sprint',
  'sales-objection-reply-builder',
  'user-interview-synthesizer',
  'calendar-coordination',
  'telegram-notifications',
  'producthunt-discovery',
]);

const connectionChecks: Record<
  string,
  { runtime: string; firstTest: string; stop: string }
> = {
  'faster-whisper': {
    runtime:
      '本人PCのPython、音声ファイルへのアクセス、選定したモデルとライセンス',
    firstTest: '短い許可済み音声を端末内で文字起こしし、原音と誤変換を照合',
    stop: '音声や文字起こし結果を外部へ送らない。モデル未導入なら実行しない',
  },
  'transformers-js': {
    runtime:
      '対応ブラウザ、選定したモデルのrevision・ライセンス・ダウンロード量',
    firstTest: '小さな公開入力で分類・要約の出力と端末負荷を確認',
    stop: 'モデル未選定・未取得なら推論済みと表示しない',
  },
  playwright: {
    runtime: '許可されたテストorigin、専用browser profile、操作schema',
    firstTest: '所有テストサイトの読み取りだけを再現し、URLと結果を照合',
    stop: '第三者サイトの無人操作、送信、購入、認証回避はしない',
  },
  'jev-ultrafast': {
    runtime: '隔離Chrome profile、Browser Harness、許可origin、TypeSafe API',
    firstTest: '所有ページを観測し、候補から一手を選ぶだけのdry-run',
    stop: 'click・入力・送信は権限と直前承認が揃うまで停止',
  },
  'jev-trader': {
    runtime: '固定market replay、PAPER台帳、秘密鍵なしのsandbox',
    firstTest: '仮想注文、手数料、slippage、損失上限を同じfixtureで再現',
    stop: 'LIVE取引、実資金、Wallet、秘密鍵には接続しない',
  },
  'typesafe-computer-use': {
    runtime: '隔離macOS account、許可app、画面観測権限、緊急停止',
    firstTest: '許可画面をobserve-onlyで読み、対象と座標を再確認',
    stop: '普段使いaccount、決済、設定変更、無承認入力はしない',
  },
  'jev-review': {
    runtime: '固定Git commit・diff範囲、秘密file除外、review provider',
    firstTest: '小さな差分でfile・行・根拠付き指摘を確認',
    stop: '秘密情報送信、自動修正、commit、push、mergeはしない',
  },
  'jev-router': {
    runtime: '許可model ID、対応CLI、費用上限、fallback',
    firstTest: '固定依頼でmodel選択理由と費用を比較',
    stop: '既存session・認証・権限を変更しない',
  },
  'jev-browser': {
    runtime: '所有サイト、専用browser profile、Browser Broker、TypeSafe API',
    firstTest: 'read-only navigationの各stepを観測・照合',
    stop: 'installer自動実行や無承認の外部作用をしない',
  },
  'mobile-jev': {
    runtime: '初期化可能な試験Android端末、許可app、Mobilerun API',
    firstTest: '試験端末で観測だけ行い、device IDと画面を照合',
    stop: '個人端末、連絡先、写真、決済、予約確定には触れない',
  },
};

export function outputFor(tool: string, input: string) {
  const value = input.trim();
  if (!value) throw new Error('入力を1行以上入れてください。');
  const header = (title: string) =>
    `# ${title}\n\n> 端末内で入力を添えた定型テンプレートです。AIによる分析・外部サービスの実行はしていません。\n\n入力:\n${value}\n`;
  switch (tool) {
    case 'coconala-proposal-draft':
      return `${header('ココナラ提案文の下書き')}\n## 提案文\nご依頼内容を確認しました。要件・納期・納品形式を確認したうえで、対応範囲と進め方を整理してご提案します。\n\n## 送信前確認\n- 納期と成果物の形式\n- 修正回数と追加作業の扱い\n- 面談・外部連絡の要否\n- 送信前に本人が元ページの条件を確認\n\n※応募・送信は行っていません。`;
    case 'gig-workflow':
      return `${header('受託案件ワークフロー')}\n1. 応募条件と権限を確認\n2. 不明点を質問として分離\n3. 合意した成果物・納期・報酬を固定\n4. 制作・レビュー・納品を記録\n5. 入金はProvider確認後に台帳へ反映\n\n外部送信・契約・入金操作は本人承認が必要です。`;
    case 'coconala-inbox':
      return `${header('ココナラの依頼・添付整理')}\n## 抽出項目\n- 依頼内容\n- 成果物\n- 納期\n- 報酬と追加費用\n- 添付ファイル\n- 返信が必要な確認事項\n\n元ページと添付の内容を本人が確認してから返信してください。`;
    case 'youtube-script-writer':
      return `${header('YouTube台本')}\n## タイトル案\n- 結論からわかる実践タイトル\n- 失敗と改善を含む比較タイトル\n\n## 冒頭\nこの動画では、${value}を短く実演します。\n\n## 本編\n1. 現状と困りごと\n2. Skyでの入力と接続\n3. 実行結果と確認\n4. できること・できないこと\n\n## 撮影キュー\n画面録画 → 入力 → 実行 → 結果確認 → 注意点。`;
    case 'seo-blueprint':
      return `${header('SEO・記事構成')}\n## 検索意図\n読者が知りたいこと、比較したいこと、実際に試したいことを分離する。\n\n## 構成\n1. 結論\n2. 前提と対象読者\n3. 手順\n4. 料金・安全性・制限\n5. FAQ\n6. 次の行動\n\n公開前に出典と事実を本人が確認してください。`;
    case 'landing-page-sprint':
      return `${header('LP・販売ページ制作')}\n## ファーストビュー\n誰の、どの作業を、どの範囲まで短くするかを一文で示す。\n\n## セクション\n- 悩みと対象者\n- 提供範囲\n- 手順と納期\n- 料金と含まれない作業\n- 実績・検証方法\n- FAQ\n- 本人確認付きCTA\n\n公開・決済・広告出稿は実行していません。`;
    case 'sales-objection-reply-builder':
      return `${header('商談返信・見積り支援')}\n## 返信案\nご懸念の点を確認しました。作業範囲、納期、含まれる確認回数を整理したうえで、条件別に見積りをご提示します。\n\n## 見積り項目\n- 成果物\n- 納期\n- 修正回数\n- 外部費用\n- 追加作業\n\n価格提示・送信は本人確認後に行ってください。`;
    case 'user-interview-synthesizer':
      return `${header('顧客インタビュー整理の記入用テンプレート')}\n## 根拠の確認\n入力された発言を読み、話者・状況・引用範囲を本人が確認してください。テーマや仮説は自動抽出していません。\n\n## 整理欄\n- テーマ: 未記入\n- 根拠となる発言: 未記入\n- その発言から考える仮説: 未記入\n- 反対の根拠・不明点: 未記入\n- 次に確認する質問: 未記入\n\nAI分析と顧客への連絡は実行していません。`;
    case 'calendar-coordination':
      return `${header('予定調整の記入用テンプレート')}\n## 候補条件の確認欄\n依頼文から日時・所要時間・形式を自動抽出していません。上の入力を確認して記入してください。\n- 候補日・時間帯: 未記入\n- 所要時間: 未記入\n- 場所・形式: 未記入\n- 参加者・避けたい条件: 未記入\n\n## 接続境界\nカレンダーアカウントは未接続です。空き時間の照合、予定作成・変更、招待は実行していません。`;
    case 'telegram-notifications':
      return `${header('Telegram通知・承認')}\n## 通知下書き\nSkyの仕事が完了しました。結果を確認し、必要なら次の操作を本人が承認してください。\n\n## 接続境界\nBot接続と送信先の確認が済むまで、Telegramへは送信しません。`;
    case 'producthunt-discovery':
      return `${header('外部ツール候補の発見')}\n## 調査条件\n- 分野: ローカルAI・業務自動化・クリエイター向け\n- 確認: 公式URL、ライセンス、更新日、料金、権限、導入条件\n- 判定: Sky接続候補 / 要確認 / 対象外\n\n公式API未接続のため、候補条件の作成までです。`;
    default: {
      const check = Object.hasOwn(connectionChecks, tool)
        ? connectionChecks[tool]
        : undefined;
      if (!check) throw new Error('この候補には確認手順がありません。');
      return `${header('実行器の接続条件')}\n## 必要な実行環境\n${check.runtime}\n\n## 最初の安全な試験\n${check.firstTest}\n\n## 停止条件\n${check.stop}\n\nこの結果は接続計画です。ツール本体・外部サービス・端末は実行していません。`;
    }
  }
}

export function candidateOutputKind(
  tool: string,
): 'template' | 'connection-plan' | undefined {
  if (localDraftTools.has(tool)) return 'template';
  if (Object.hasOwn(connectionChecks, tool)) return 'connection-plan';
  return undefined;
}
