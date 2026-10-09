## Skyタイムラインのエージェントコードと交換可能な保護

2026-10-09の明示指示「タイムラインでgitみたいにエージェントのコードを出す」「SPIDERがデフォで守り、取り外し・他のセキュリティーへ変更できる」による追加。主担当はSKY20／ROCK、検査はSYS15と連携。ブラウザ内だけの単体SPIDERとは別に、本人が一般公開すると確定したコードをSkyのサーバーへ送信・保存する。既存Package／SDKの登録・審査・料金・配布権限は再利用対象として残し、このコードフィードをverified Registryへ自動登録しない。

| 項目 | 実装契約 |
| --- | --- |
| 目的・体験 | `/sky`のおすすめ／コードタブ。コード全文・作者表示名・license・変更メッセージを一般公開。更新は親コミット付きの新しい版、各版の内容SHA-256・履歴・親との差分・JSON export・複製と`/sky/code/:id?revision=N`の共有URLを提供。Git wire protocol、git clone/push、branch mergeは本版に含まない。 |
| 入力 | 1〜8ファイル、合計64 KiB、各2,000行。JS/TS/Python/JSON/Markdown/txt。相対pathの重複・traversal・NULを拒否し、改行をLFへ正規化。コード・公開metadata・filenameを検査し、所有権／licenseと一般公開を本人が確認する。未投稿の入力は画面memoryのみ。 |
| SPIDER標準 | 新規・複製はSPIDERを既定にする。既存の`program-inspector.mjs`をserver側で実行。秘密／個人情報、JS/TS/Pythonの限定的な危険パターンを検出。JSON/Markdown/txtは秘密／個人情報検査だけ。指摘・不完全・検査失敗時は保存／公開せず、metadataだけ返す。入力を実行しない。 |
| 交換・取り外し | `secret-check`は同じ機密検出器を使う別の狭い保護設定（Secret Check）。コード動作を検査しないことを表示。`none`は検査なし。交換と取り外しには検査範囲の確認を要求し、各コミットへその時のprovider／version／scope／statusを保存する。認証・所有者・競合判定・容量制限は独立して維持。 |
| 追加検査器 | `lib/sky-code-security.ts`の`CodeSecurityAdapter`にid／label／version／scope／inspectを実装してサーバーに登録する。codeSecurityRegistryは予約ID上書き・重複・未登録選択を拒否し、結果のprovider／version／exact source hash／statusを検証する。ブラウザから任意URLや検査済み結果は登録できない。第三者製品は未接続。外部送信・credential・料金を伴うadapterは送信先・契約・同意と失敗時の期限を追加受入してから組み込む。 |
| 状態・保存 | `lib/workflow.ts`のsky-code-publicationを通して公開条件確認→review→completedのreceiptを生成。D1の`sky_code_repositories`と追記専用`sky_code_commits`へ本文・hash・検査receipt・WorkJobを同じbatchで保存。completedを返すのはbatch成功時だけ。1所有者20コード、各100コミット。 |
| 本人性・競合 | 既存requestUserの信頼gateway／device sessionを使用。本人IDを公開応答に含めない。公開履歴は匿名閲覧、更新／非公開は所有者のみ。repository revisionとownerをINSERT／UPDATE条件に含めて競合を拒否し、過去版を更新／削除しない。 |
| 失敗・復旧 | 同じコミットIDと同じ内容の再送は同じreceipt。異なる内容の同IDは拒否。通信不明時は画面入力を保持し、履歴との照合後に再試行。古いrevisionは最新を開き直す。全履歴の非公開は可逆で、所有者は履歴閲覧・新しいコミットで再公開できる。取得済みの他者の複製を回収したとは表示しない。DB backup／復元は両tableを同一snapshotで扱う。 |
| 移行・停止 | Sitesの追加migration `0016_sky_code_timeline.sql`（canonical GitHubは`0060_sky_code_timeline.sql`）をWebと同時配備し、未適用の503を成功扱いにしない。巻戻し時はUI/APIを旧版へ戻して追加tableを保存し、履歴を削除しない。既存単体SPIDERは入力非送信・非保存を維持。 |
| 境界 | コード公開／検査成功は、安全証明、作者の本人認定、Tool実行許可、インストール、課金、OS／Pixel受入ではない。server上でコードを評価・実行しない。第三者が公開した文字列はReact textとして表示する。 |
| 合格条件・検証 | 所有者分離、匿名閲覧、直接APIの検査迂回拒否、変更後再検査、保護交換／解除と履歴、競合、失敗／再送、非公開と再公開、差分・実画面を受入。`node --experimental-strip-types --test tests/sky-code-timeline.test.mjs`、`npm run verify`（Worker/D1 APIを含む）。production migration／公開gatewayは別readback。 |
| 未決定 | 大規模repo、Git transport、共同編集／PR、公開コード通報・モデレーション、追加の外部検査製品。実利用量・提供元条件を確認して次の版で決定。未実装を利用可能と表示しない。 |

