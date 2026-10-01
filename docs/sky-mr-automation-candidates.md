# 旧Mr. Hub自動化のSky導入設計

版: 1.0 / 2026-09-20。対象は旧Mr. Automation Hub由来の独立した自動化11件。各行はSky catalogの`candidate`であり、既存コードや企画があることとSkyから実行できることを区別する。AvocadoPro等のApp全体、WalletやBot基盤自体はTool数へ数えない。

## 共通の利用体験と責任

利用者がSkyで目的、実行場所、作者、費用と権限を見て選び、本人PCのSDK Toolを起動する。Connectorが所有者専用のローカル接続定義を見つけ、MCPを初期化して機能一覧を確認する。Zemaからの依頼を閉じた入力schemaへ整え、送信・公開・決済などの外部作用は内容を固定して一回ずつ本人承認する。完了時は入力、出力、Tool版、承認、結果の参照をreceiptへ結ぶ。Skyは発見・接続・停止、Zemaは仕事の進行、Toolは宣言した処理だけを担当する。ToolにWallet記帳、権限付与、任意shell、無制限Web操作のauthorityを渡さない。

共通状態は`candidate → installed → connected → ready → running → review → completed`で、各段階から`failed`、`uncertain`、`disabled`へ遷移できる。SDK停止・PC再起動・descriptor失効で`connected`を解除し、承認も消す。再起動後はMCP初期化とschemaを再検査する。外部作用の応答が不明なら自動再送せず、Providerの照会または本人確認で確定する。二重実行防止にはTool ID、版、仕事ID、入力digest、外部operation IDを使う。互換性が変わる更新は旧版を残し、失敗時は旧版へrollbackする。

ローカル接続定義は本人PCの`~/.sky/mcp-tools`に所有者のみが読める権限で保存し、SDK終了時に削除する。入力本文、添付、tokenはSkyの公開Registryへ送らない。各Toolの業務データは本人別の保存先、保持期限、削除手順、backup対象をアダプター実装時に固定する。公開Siteの画面表示は実行成功の証拠にしない。受入は合成fixture、本人PC、外部Provider sandbox、本番を分ける。

## 候補別の入出力と境界

| Tool ID | 目的・利用者 | 入力 → 出力 | 保存・外部作用 | 失敗・合格条件 |
| --- | --- | --- | --- | --- |
| `coconala-proposal-draft` | 本人の案件応募を準備 | 案件条件・本人の経験 → 提案文・確認リスト | 下書きは本人PC。応募送信は別承認 | 根拠のない実績を作らず、案件条件の参照を保持 |
| `gig-workflow` | 受託案件を段階管理 | 案件ID・契約条件・成果物参照 → 進捗・納品前check | 仕事はowner別保存。応募・連絡・納品は別承認 | 段階遷移と成果物digestを照合。送信不明時は再送しない |
| `coconala-inbox` | 本人の依頼と添付を整理 | 本人が選んだ依頼・添付 → 分類・不足情報 | 本人PC。外部受信には本人接続が必要 | 権限外の会話を読まず、添付欠落を表示 |
| `youtube-script-writer` | 制作者の台本を下書き | 企画・対象・長さ・資料 → 台本・撮影cue | 原稿はowner別保存。外部AI送信は同意後 | 事実・引用は要review。公開は自動化しない |
| `seo-blueprint` | 記事制作者の構成を作る | テーマ・対象読者・許可資料 → 検索意図・構成案 | 下書き保存。外部検索には接続先明示 | 検索結果を事実保証せず、出典欠落を表示 |
| `landing-page-sprint` | 事業者の販売ページを準備 | 商品条件・素材・権利 → コピー・画面案・確認表 | draftはowner別。公開・ドメイン操作は別承認 | 価格・権利・表示条件のreview完了まで公開不可 |
| `sales-objection-reply-builder` | 本人の商談返信を支援 | 確定した商品条件・質問 → 返信案・確認事項 | 下書きのみ保存。送信は別承認 | 未確定価格や約束を補完せず本人reviewを要求 |
| `user-interview-synthesizer` | 研究者が発言を分析 | 同意済み発言・質問 → 主題・根拠・仮説 | 発言はowner別・削除可能。外部AIは同意後 | 発言と解釈を分離し、出典ID欠落を拒否 |
| `calendar-coordination` | 本人の予定を調整 | 時間帯・参加者・許可済みcalendar → 候補日時 | OAuth scopeを限定。予定作成・招待は別承認 | 二重予約を再照会し、結果不明なら自動再作成しない |
| `telegram-notifications` | 本人へ仕事を通知 | 確認済み宛先・通知内容 → 配信receipt | Bot tokenは秘密保管。第三者送信は別承認 | 宛先未確認なら送らず、API不明応答は照会する |
| `producthunt-discovery` | 公開ツール候補を調査 | 検索条件・期間 → 候補・公式URL・取得時刻 | API利用条件を確認。公開readのみ | 制限超過・取得失敗を空結果と区別し、商用利用条件を確認 |

各アダプターは入力・出力のschema版、最大サイズ、タイムアウト、同時実行数、費用上限、保存期限と削除・backup手順を定める。外部Providerへの接続は個別の本人権限と利用条件を満たしてから有効にする。これらが未確定の間はcatalogの`candidate`を維持する。

## 受入と未決定事項

各Toolで正常入力、未知field、上限超過、重複、取消、通信断、外部結果不明、再起動、版更新とrollbackを試す。本人PCのMCP接続後、Zemaの仕事から承認付きで一周し、成果物とreceiptを照合して初めて`ready`にできる。担当はSky／Zemaの各Tool開発者とProvider接続担当。採用順位は、外部権限なしで下書きだけ完結するToolから始め、本人接続、料金、法務・規約、結果照合の負担を試験で比較して決める。実接続、公開Site配備、第三者Providerの商用条件は未決定。
