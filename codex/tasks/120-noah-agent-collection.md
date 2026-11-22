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

[PR #384](https://github.com/k999ln/rock/pull/384)。修正後の同じ操作試験11/11成功、掲載関連10試験・公開ソースの既存ホーム切替を含む14試験成功。typecheck/lint成功。実ブラウザの未検証範囲は上記のとおり。

## 実Chromeでのスマホ表示・タップ試験（2026-11-22、PR #388）

実際のGoogle Chrome 157.0.8103.79を独立した一時プロファイルで起動し、Playwrightのスマホ表示・touch入力で公開URLを操作。320/360/390/430×844とPC 1280×900を確認した。端末実機・Safari・スクリーンリーダーの試験とは区別する。

再現した問題と修正:
- ホームから「Semantic Shift」を検索すると「使えるAgent」だけを調べ、掲載済みのHugging FaceのAgentが見つからなかった。検索先を全出典のカタログに変更した。
- メニュー34px幅、保存30px高、その他の操作28px、外部評価32px、検索クリア約26×32px等の小さい操作範囲を44px以上に拡張。横スクロール・2列表示は保持した。

公開185（source `6f5e9f832a5b68dc23e9e84d559c8612b86f4e0e`、deployment `appgdep_6b0212a7f8b88191a7da30ccf12e17aa`）で再確認。並行更新の外部評価バッジと共有機能を保全して公開した。本番D1 migrationなし。

- 5画面幅で26項目成功。横はみ出し・カード重なりなし、メニューと保存先/コメントの開閉、横スワイプ・HF絞り込み、外部リンク、検索と空結果からのクリア、未捕捉JSエラーなしを確認。
- HF Semantic Shift Backendのいいね3件を確認。王冠やコメントの投稿は行わず、書き込みAPIをブラウザ試験で遮断した（匿名利用開始のsession APIのみ許可）。
- 390pxで503応答を一度返す試験を行い、再試行から復旧。追加読み込みを20件→40件で別途確認し、試験の件数待ちも明示した。
- 関連30試験、typecheck、変更ファイルのoxlint、Sites build成功。
- `npm run verify` は再実行しても `release-readiness: Web security policy: local production response実測またはinput hashが不一致` で停止。全体検証の成功とはしない。前提のPR #386 とこの不一致が未解決のため #388 はdraft、main未統合。

再実行: `scripts/test-noah-mobile-browser.mjs`。`playwright-core@1.65.1`は一時ディレクトリにインストールし、`NOAH_PLAYWRIGHT_PACKAGE`へそのindex.js、`NOAH_CHROME_PATH`へChrome実行ファイルを指定。既定は公開URL・上記5サイズ。`NOAH_TEST_WIDTH=390`で一つの幅を再試験できる。`NOAH_TEST_OUTPUT`へスクリーンショットとreport.jsonを保存する。今回の記録は `/tmp/noah-mobile-ux-20261122/published/`、追加読み込みの再確認は同ディレクトリの `pagination-final/`。

## verify不一致の修正と最新変更の統合（2026-11-22、PR #388）

本人指示「verifyの不一致も直して、テストを通してPRをマージして」に基づき、mainのPR #385と前提PR #386の最新変更を統合。追加収集元・新着/使いやすさの並び替え・動かし方・すべての外部評価指標を共通カードでも保持した。破損した一出所のスナップショットは他出所の一覧を止めず、掲載対象外の項目は除外する。最新の本人指示による王冠/コメント列の撤去を保持し、ブラウザ試験も現在の操作に合わせた。公開185で実施したコメント開閉試験は当時の結果として上に残す。

不一致は、検索修正で変わった `components/noah-shell.tsx` と保存済み実測のinput hashの差だった。独立checkoutにroot/Miniの依存を導入し、`npm run build` の生成物をlocal Wranglerで起動。`node scripts/check-web-security-response.mjs http://127.0.0.1:8796 --record-local-production` で8経路を実際に要求し、全8ヘッダー・転送・Service Worker・manifest・アイコン・JSの検査に成功して `data/web-security-response-current.json` を更新した。検査条件・過去のevidenceは変更していない。本番への配備やD1 migrationを行った記録ではない。

統合後の関連32試験、typecheck、lint、production buildは成功。全体 `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify` はexit 0。主要4,926試験のうち4,922成功・失敗0・既定4skip、仕事API1,918項目、CSV保存385項目、package/Mini/public preview/build/配信ファイル/AMC/作業部屋/Botまで成功した。ローカルの全体ログは `/tmp/noah-full-verify-20261122.log`。

この検証中にmainへPR #387が入ったため、それも取り込み、最終コミットのGitHub CIを確認してから #388をmainへマージする。CIとマージ結果はPR本文を参照。XのAPIキー待ちと実機iPhone/Safari未検証は今回のverify修正の対象外で、そのまま残る。

PRのCodeQL指摘に合わせ、ブラウザ試験の既定出力先を `mkdtemp` で実行ごとに作成する権限700の専用ディレクトリへ変更した（指定した `NOAH_TEST_OUTPUT` は従来どおり）。実際の収集順が変わって先頭20件に保存可能なAgentがない場合にも、画面の「接続できる」で対象を選んでから保存操作を検証する。変更後に公開URLを実Chrome・390pxで再試験し6/6成功。記録は `/var/folders/w0/370ws_yn0gl9m1b5816bqks00000gn/T/noah-mobile-browser-d1FEOs/report.json`。

別のSPIDER履歴検査は9候補を検出した（[実行44977185487](https://github.com/k999ln/rock/actions/runs/44977185487)）。6件は `lib/noah-haptics.ts` の公開localStorage設定名、3件は旧 `docs/design-validation/noah/noah-connect.test.mjs` の秘密文字列検出器の合成テスト。値の用途をソースと過去commitで確認した。検出規則・固定control・履歴を変更せず、全体verifyの結果とは分けてPRに記録する。
