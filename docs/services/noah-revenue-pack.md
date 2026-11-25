# Noah — 本人用の収益業務パック

- 本人の一言（2026-11-25）: 収益系AgentをGitHub/Hugging Face等から探し、まとめて動かす。本人分だけeSIMを経由せず無料クラウドへ直接接続する。
- Goal: 商用利用可能な公開Agent定義を固定し、商品設計・納品サンプル・提案書を一括生成して本人に返す。予算上限0、外部送信は本人が指定した依頼と前段の成果のみ。
- Eveがつなぐもの: agency-agentsのMIT定義3件、Pollinations匿名無料モデル、既存WorkのSQLite保存。任意コード/Tool/送信権限は取り込まない。
- AMCの工程: source/license照合→本人用保存領域と依頼を固定→商品設計→サンプル制作→提案書→成果保存。各段は前段の完了応答を必要とする。
- Jevの合格条件: 別owner送信0、同一仕事の生成1回以下、paid tier/使用量なし/途中終了の完了扱い0、日次12仕事超の新規保存0、有料fallback0。生成前FREE_LIMITとRetry-Afterが揃った時だけ5試行・10分以内で待機。停止後の新規段0。成果はreviewであり売上ではない。
- 出力: 3件のWork、Markdown成果、応答IDとtoken使用量。公開URL・売上を捏造しない。
- Wallet: モデルは匿名無料経路のみ、仕入/広告/契約/送金なし。既存の一般利用者向け権限と料金を変更しない。端末の電力・回線実費は未計測。
- hardware profile: 初回は本人Macが順序と保存を管理し、推論は外部クラウド。eSIM不要。Mac停止中のクラウド常駐・スマホからの起動・account同期は別の受入が必要。
- 携帯追補: 接続済みPixel 10からWi-Fi ADBで開始し、3担当の成果表示まで実受入。Mac停止中の常駐とaccount同期は未受入のまま。
- 失敗: 送信後の不明結果は再送せず停止。同じbatch IDで状態だけ照合。新しい依頼IDによる再実行は本人が指定する。
- 記録: source commit/blob/SHA-256、role、依頼digest、owner、batch ID、Work ID、provider応答ID、使用量、状態。資格情報を含めない。

## 候補の比較（2026-11-25）

- 採用: [agency-agents](https://github.com/msitarzewski/agency-agents)、commit `8ae6164602c95ca78828b148b9052460ee426885`。Offer & Lead Gen Strategist / Content Creator / Proposal Strategist。モデルに渡す定義であり、外部サービスを自動運転する実行コードではない。元ファイルとMIT表記を同梱し、Noah用に短縮した役割を使う。
- [GPT Researcher](https://github.com/assafelovic/gpt-researcher): 調査用の実行コード。検索・モデル接続とPython環境の受入が別途必要なため初回には含めない。
- [CrewAI examples](https://github.com/crewAIInc/crewAI-examples): 公式例はarchive状態。各例のlicenseとモデル/検索API費用を個別確認する必要がある。
- [Hugging Face Spaces](https://huggingface.co/docs/hub/spaces-overview): CPU Basicの時間料金は無料だが、compute Space新設は有料plan条件があるため、無契約・追加支出0の実行先として選ばない。

無料モデル一覧と短い応答は実接続済み。各Agentの実成果、常駐、収益は別々に記録する。

## 初回受入（2026-11-25）

本人追加指示による携帯接続: Macのloopback限定HTTP入口をADB reverse経由で本人Pixelへ渡す。一回限り・5分の接続キーをURL fragmentから交換し、24時間のHttpOnly/SameSite cookieで本人用の依頼・状態・成果・停止を操作する。Host/Origin不一致・無認証の情報取得/操作は拒否。キーはログに出さず、本人用ファイルへ0600で保存。登録・パスワード・カードは不要。Mac停止・ADB切断時は携帯から操作できない。クラウド常駐の受入とは区別する。

46秒の間隔を設けた実接続で3担当の応答ID・token使用量・匿名tierを受領し、生成使用額0として保存。同一batchの再読込で新たな生成は行わない。7試験はowner不一致、無同意、再起動、同時要求、日次上限、停止、未確認応答、生成前の無料枠待機を検証した。

品質は未合格。モデルが未指定の産地・焙煎方法・価格・納期を補ったため、元出力はreviewのまま残し、確認済み事実だけの修正版を別に保存した。外部公開・連絡・受注・入金は0。クラウド常駐、スマホからの起動、account同期は未受入。

## Mac停止中の実行（2026-11-25、受入待ち）

既存CloudflareのWorkers Free確認を配備条件とする。専用WorkerとSQLite Durable Objectが順序管理・Work保存・alarmを担い、携帯はHTTPSで直接操作する。実行器は固定3担当・匿名無料推論のみ。既存D1 migrationと一般利用者の課金経路は変更しない。本人限定一回接続コードから30日Secure/HttpOnly cookieへ交換し、Macは発行・復旧時だけ使う。パスワード・支払情報・外部サービスの登録情報は収集しない。

受入条件: 無認証/他Origin操作0、一回コード再利用0、alarm再実行時の生成重複0、停止後の次段0、日次12仕事・総保存1200仕事以内、有料切替0。クラウド再起動とMac側runner停止後に3担当の成果が保持され、携帯HTTPS画面から確認できること。モデルの事実補完は独立に確認し、成果をreviewのまま返す。公開Noahアカウントとの同期は別の未完了項目。

## 2026-11-25 最新Noahへの統合

最新の開発チャットで公開を確認した PR #67/#68 と `origin/main` 141fdb18792a2ab4d197896fd292aa653c8f9122 を基準にする。公開版241の端末接続・ロゴを保全し、mainの新しい道具カタログを維持する。登録画面の未公開PR #63は取り込まない。

入口は `/noah/revenue-pack`。携帯とPCで既存NoahShellと共通のスタイルを使い、接続済み本人のメニューだけに表示する。外部Workerの入口はこのURLへ転送する。本人の新規一回コードを同一originのproxyで交換する。NoahのアカウントcookieやBearerはWorkerに渡さない。成果の保存先は本人用Durable Objectであり、通常の「マイAgent」の既存収益明細との自動同期は未実装。保存metadataは `noahRevenuePack` とし、既存 `noahRevenue` の収益明細を変更しない。

CloudflareのFree・$0を本人ログイン画面で確認した。本人用Workerへ配備後、Mac runnerを停止しADB reverseを外した状態で、認証済み検証クライアントから開始した `cloud-independent-20261125` の3担当が保存完了した。携帯での開始操作・共通画面の本番受入はこの時点では未完了。下書き生成の成功を売上・入金とは扱わない。
