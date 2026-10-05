# AMCの有限fixture実行

更新日: 2026-10-05（America/New_York）。主担当はGit / CI / Operations、ROCK、既存G04。今回はmainへの統合候補として、Goalの固定と有限な実行・検査・保存をローカルで再現する。Sky/ZemaのWeb実行、本物のCodexやモデルへの割当、外部送信、課金、配備はこのCLIに含めない。Node.jsを利用できる既存OS上で動き、RockstarOSの導入は不要である。

## 目的と利用体験

固定のGoal「`(2 + 2) × 3`を計算し、各子Taskを検査して親Taskへ集める」を用いる。`ADD`、`MULTIPLY`、`REPORT`の順に、workerがJSONを書き、別reviewerがファイルを読み直して既知の正解と比較する。検査済みの子Taskだけを先へ進め、最後は`awaiting_owner_acceptance`で止まる。`overallAccepted`は`false`のままである。合成ownerの計画承認は試験データであり、実在する本人の認証や同意には使えない。

CLIは同梱Goalだけを受け付ける。任意のGoal、shell、URL、モデル、外部adapterを引数で読み込む入口は設けない。ライブラリ層の汎用Goal編成・工数・request plan・Sky authorityの契約を含むが、CLIからSkyへの実行や同期は行わない。

## 実行方法

リポジトリの依存関係を用意したNode.js環境から、次を実行する。保存先はリポジトリや共有ディレクトリと分け、毎回新しい空の私有ディレクトリを使う。既存ディレクトリの権限や中身を安全化する機能ではない。

```sh
AMC_FIXTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/amc-fixture.XXXXXX")"
npm run amc:autonomy:fixture -- init --state "$AMC_FIXTURE_DIR"
npm run amc:autonomy:fixture -- run --state "$AMC_FIXTURE_DIR"
npm run amc:autonomy:fixture -- status --state "$AMC_FIXTURE_DIR"
```

結果は`artifacts/ADD.json`（4）、`artifacts/MULTIPLY.json`（12）、`artifacts/REPORT.json`（12）。`state.json`にGoal、契約hash、policy、Task状態、試行数、実行intent、履歴を保存する。`status`の`serviceSync: not_connected`、`productionExecution: unsupported`は、この試験の境界を表す。完走後に同じ`run`を再実行しても完了Taskを再実行しない。新しい試験は新しいディレクトリで開始する。

| 操作 | コマンド末尾 | 意味 |
| --- | --- | --- |
| 状態確認 | `status --state "$AMC_FIXTURE_DIR"` | 保存状態を読む |
| 一時停止の要求 | `stop --state "$AMC_FIXTURE_DIR"` | 永続stopフラグを作る。実行中のsupervisorが検知して停止する |
| 安全な再開 | `resume --state "$AMC_FIXTURE_DIR"` | stopを解除し保存状態から進む。結果不明・handoff・cancelledは再開しない |
| 取消の要求 | `cancel --state "$AMC_FIXTURE_DIR"` | 永続cancelフラグを作る。cancelはstopより優先し、再開できない |
| 死んだprocessのlockを回収 | `recover-lock --state "$AMC_FIXTURE_DIR"` | 同一host・uidのPIDが存在しない場合だけlockを回収する |

表の操作は`npm run amc:autonomy:fixture --`に続ける。停止要求を保存した直後の表示は、supervisorが読む前なら旧phaseのままの場合がある。短い算術処理は停止操作より早く終わり得る。停止・再開の確認には別の新規runを`init`し、`stop`、`run`、`status`、`resume`の順に操作する。`SIGINT`/`SIGTERM`も協調停止として扱う。

## 状態・保存・重複防止

- 承認不足は`awaiting_approval`。承認済みfixtureだけを`ready → executing → result_ready → reviewing`へ進め、検査合格後に次の依存Taskを選ぶ。
- 計画の目的、対象Task、手順、成果物、合格条件を契約hashへ固定する。policyもhashへ固定し、保存後の変更を拒否する。CLIは同梱Goalの契約hashとも照合する。Goal逸脱を防ぐ整合性検査であり、書込権限を持つ攻撃者に対する認証や署名ではない。
- `state.json`は期待revision、排他的supervisor lock、temporary fileのfsyncとrenameで更新する。初期保存は一度だけ公開し、同じ保存先の二重初期化を拒否する。
- worker/reviewerを呼ぶ前にoperation intentを保存する。結果取得後にprocessが落ちるなどして未解決intentが残った場合、推測で再送せず`handoff`で人へ渡す。外部作用のexactly-onceを保証する仕組みではない。
- 停止と取消は独立した永続ファイルで保持する。再開後も試行数はリセットしない。lock回収はintentを消さない。残存`.lock-guard`や所有者を確認できないlockは自動削除しない。

## 上限・失敗・人への引継ぎ

CLIの固定policyは1Taskあたり2試行、合計6試行、worker/reviewer各呼出し5秒。ライブラリ側も正の整数だけを認め、上限はそれぞれ5試行、100試行、30秒である。無期限pollや常駐実行はない。

失敗はworkerが`retryable`と`safeToRetry`を両方明示し、残り回数がある場合だけ再試行する。例外、timeout、結果不明、検査不合格、上限到達は人へ引き継ぎ、自動的に新しいGoalや別adapterへ切り替えない。worker成功だけではTaskを検収せず、reviewerの全criterion結果と証拠が必要である。

このruntimeは信頼済みの同一process fixtureだけを対象にする。worker/reviewerの異なるIDと`kind: fixture`は経路の検査であり、別人の認証・隔離・独立監査を意味しない。timeout/AbortSignalは協調停止で、同期処理によるevent loopの占有や無視されたsignalを強制中断できない。期限後の戻り値は採用せず、不明なoperationを自動再実行しない。実workerには別process隔離、認証された権限・予算・作用範囲、確実な停止と結果照会の設計が必要である。

保存データは合成のTask状態と算術成果物のみ。新規ファイルは0600、新規ディレクトリは0700を指定するが、OSユーザー内のアクセス制御や暗号化を新設するものではない。私有保存先を使い、未信頼processと共有しない。自動保持期限・クラウド同期・本人別サーバー保存は未実装。runを処理中に削除せず、終了と必要な記録の確認後に、試験者が作成したディレクトリだけを管理する。

## 実装・受入・残る条件

実装は`scripts/amc-autonomy.mjs`、`scripts/amc-autonomy-store.mjs`、`scripts/amc-autonomy-fixture.mjs`。Goal編成は`scripts/amc-goal-engine.mjs`、`scripts/amc-effort.mjs`、`scripts/amc-request-plan.mjs`、`scripts/amc-sky-authority.mjs`にある。6つのAMC試験は契約固定、依存順、検査、保存競合、停止、再試行、結果不明時の引継ぎを対象にする。

今回の統合候補ではAMC 6 filesとCSV変換器の対象試験が82/82成功し、実fixture CLIで3Taskの検収、最終本人検収待ち、再run時の保存状態不変を確認した。これはローカル合成受入である。全体verify、同一SHAのGitHub CIとmain統合状態は[今回の証拠](evidence/amc-main-integration.json)を正本とする。過去の作業コピーでの試験数を今回の全体成功へ転記しない。

次の段階は、認証された本人のGoal承認と実workerを既存`lib/workflow.ts`、owner別保存、revision競合、Sky/Broker/料金gateへ接続し、具体的な成果物をWebから取り出せる一件を別途受け入れること。必要な外部送信・費用・配備・権限の承認をfixtureの合成承認で代用しない。G04全体とAMCのWeb/実業務接続は`in_progress`を維持する。
