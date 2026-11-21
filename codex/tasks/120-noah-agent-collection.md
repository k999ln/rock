# 120 Noah の Agent を継続して集める

本人指示（2026-11-22）と参照チャット「gitのrockを確認」に基づく。[サービス契約](../../docs/services/noah-agent-collection.md)。

## 範囲

- `scripts/noah-agent-collector.mjs` と専用の保存・通信モジュール。公式MCP台帳、既存GitHub/Hugging Face検索、X公式検索を継続して集める。
- 既存の取り込み・名寄せ・握手・掲載ファイルを再利用。頁位置、バックオフ、二重起動防止、停止と再開、状態確認を一つのCLIにまとめる。
- `tests/noah-agent-collector.test.mjs` で再開・失敗・安全な通信・既存取込との接続を検証。
- 掲載用ファイルを送る分割処理は画面とAPIで共通化し、件数と1MiBを守る。系列の候補を黙って切り捨てない。
- 紹介用スナップショットを署名付きでR2へ掲載し、`/noah` と `/noah/agents` に出所フィルタ・検索・重複出典付きで表示する。
- 本番DB migration・自動登録・道具実行は含めない。

## 合格条件

- 4出所の数を分け、接続確認を通るMCPだけを掲載用ファイルに出す。
- 再起動と一時失敗で保存済み候補・頁位置を失わず、同じDBで2つの収集器が走らない。
- 収集器の自動試験、`npm run verify`。実APIの有限巡回で状態と出力を確認する。

## 引継ぎ

[PR #380](https://github.com/k999ln/rock/pull/380)。Sites公開版171（source `566bc99d9776d83ca0fdde04b428b0f31ff941a8`）へ反映。https://avoado.si/noah/agents の実表示、Hugging Faceのいいね3件・1件の表示、検索、390px幅を確認。

運営Macの `si.avoado.noah-agent-collector` を常駐起動。保存先は `work/noah-agent-collection-20261122`、実行checkoutは `work/noah-agent-collector-runtime-20261122`。初回常駐巡回でMCP候補4,000件・握手成功22件、GitHub20件、Hugging Face11件。公開APIへの4出所の署名付き送信が成功し、公開APIからHF11件を再取得。Macの停止/スリープ中は収集停止。Xの実収集は `NOAH_X_BEARER_TOKEN` 未設定のため `needs_credentials`。鍵はチャットやGitに記載せず、運営の権限600のruntime.envへ設定後サービスを再起動する。

検証:
- `npm run typecheck` / `npm run lint:product`: 成功。
- 関連38試験、追加16試験、launch-ops17試験: 成功。公開ソースの収集/API/launch-ops33試験とSites本番build: 成功。
- `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`: 全体は未通過。4,786試験中4,774成功・4skip・8失敗。新しい共通importを画面試験へ渡す1件を修正し、17試験再実行で成功。Pixelの時間制限5件は単独再実行で成功。
- 残る2件は共有node_modulesのsymlinkでbracesの絶対パスが元checkoutになったことと、Miniの依存未導入でundici解決先がrootになったこと。既存のlock・製品・試験を変更していない。全体チェーン後半は未実行なのでPRはdraft。次担当は独立した依存導入環境で全体verifyを再実行する。

停止: `node scripts/noah-collector-service.mjs --stop`。再開/常駐設定/外部評価の意味はサービス契約の運用節を参照。

## クラウド移行（2026-11-22 追加指示）

Mac常駐からGitHub Actionsへ移す。保存先はNoah R2の署名付き非公開checkpoint。5分ごとの起動、復元→収集→ETag付き保存→掲載の順序を守る。Mac停止後のクラウド2回成功と公開更新を受入条件とし、結果を追記する。


## 公開トップの修正と移行作業（2026-11-22）

本人が指定した `/noah` に収集一覧を追加。既存の法人導線・ピン一覧・タイムラインを保持し、GitHub/Hugging Faceが台帳の新着に埋もれない順序で出す。表示中は60秒ごと・再フォーカス時に更新する。Sites版176（source `8c83f9cc5ec124bcc41a7dc8d846aee07d1d04c8`）を公開し、実URLの200・収集セクション・既存法人導線・出典混在の公開API141件を確認。画面のブラウザ検証はこの環境で未実施、実コンポーネントの表示と更新を自動試験した。

Macの常駐は停止し、launchdの永続disableも確認。55,058,432バイトの台帳をバックアップした。引継ぎ用の写しで正常なGitHub/Hugging Faceの次回期限だけを即時にし、レート制限の待機は変更していない。大きな台帳は3MiBごとの非公開断片とmanifestで保存し、16MiBを超える台帳の往復・断片欠落/改変・保存競合・古い断片の回収を追加試験した。

最新検証: typecheck/lint成功。収集関連26試験成功（既存24+大容量/回収2）。全体 `npm run verify` の最終結果はGitHub CIで確認中。SPIDER secretsは過去commitのテスト文字列5件を検出し失敗する（本PRの旧固定テストキー2件、main由来のsecret判定試験3件）。現行コードは実行時に乱数生成し、実運用キーはGitHub/Sites secretのみ。検出器の弱体化と履歴の書換えはしない。


## クラウド移行の受入結果（2026-11-22 05:41 JST）

- PR #380 を通常のsquash mergeでmain `07951df3534c1e627f58332528e6a79bee76efd9` へ統合。mainへの直接push・履歴の書換えはしていない。
- Sites公開版177: source `cff710fb27bd03de7efdcfd329dee7fcda705949`。公開トップの収集欄・非公開checkpointを配備。本番D1 migrationなし。
- `npm run verify` は実装head `28b2b9d1e` の [GitHub実行44946448412](https://github.com/k999ln/rock/actions/runs/44946448412) で成功。CodeQL・repair regressionsも成功。収集関連26試験、公開ソースのtypecheck/保存8試験/buildも成功。
- Mac launchdはbootoutと永続disableを実施。台帳の原本は変更せず、停止時バックアップを署名付きでR2へbootstrapし、読み戻しを確認した。
- [クラウド1回目44947390879](https://github.com/k999ln/rock/actions/runs/44947390879): GitHub-hosted Ubuntu 26.04。bootstrapから復元、MCP候補26,200、接続確認114、掲載候補113、GitHub30、HF13、出所エラー0。4出所の掲載成功。
- [クラウド2回目44947505057](https://github.com/k999ln/rock/actions/runs/44947505057): `previousRunId=44947390879`。候補27,200へ継続、出所エラー0、4出所の掲載成功。どちらも手動起動した本番workflowであり、定刻起動の実績とは区別する。
- 公開APIは名寄せ後154件。HFの確認日時は `1795288899459` から `1795293564239` へ進み、Semantic Shift Backendのいいね3、Agentic Forecastingのいいね1を確認。GitHubはboss-agent-cliのスター2,286などを確認。値をNoah内の王冠へ加算していない。
- Workflow `Noah cloud Agent collection` の状態はactive、cronは `3-58/5 * * * *`（5分ごと）。出所の制限を優先し、GitHub/HFの再確認は2時間ごと。GitHubの混雑時遅延・60日無活動の無効化条件はサービス契約を参照。

残件: Xの実収集は運営APIキー待ち。ブラウザ画面検証は今回未実施。SPIDER secretsは過去commitに残るテスト文字列を検出して失敗するため、実装の全体verify成功とは別に扱う。旧固定キーは現行コードから除去済み、検出規則や過去履歴は変更していない。


## 収集欄のUX試験（2026-11-22）

実際のTSX部品を既存screen試験台で動かし、本番の公開GET APIへつないで11項目を検証。初回8成功・3失敗。全件表示への条件引継ぎ、条件クリア、通信失敗時の手動再試行を追加した。URLの収集条件は既存調査カタログの条件と衝突しない名前にし、全件表示で収集欄へ移動する。再試行・クリアは画面を再読込せず操作できる。

実ブラウザのTinyFishはUSER_NOT_LOGGED_INで未実行。今回の試験台はReact部品の文言・イベント・API要求を確認するもので、CSS・実DOM・画面の描画は検証しない。390px/1280pxの実表示、キーボードフォーカス、スクリーンリーダー、ブラウザのhydration/consoleは未検証として残す。
