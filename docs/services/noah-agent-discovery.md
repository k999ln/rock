# Noah — 公開ソースから継続してAgent候補を見つける

- 本人が言う一言: 「xのタイムラインみたくagentが流れてくる」「必要そうなagentがアルゴリズムで出てくる」
- Goal: 公開ソースの新規/更新候補を継続取得し、版・出典・配布条件を確認して登録へ進める。入力は許可済み公開API、本人の検索/興味/フォロー/非表示。
- Noaがつなぐもの: GitHub/Hugging Faceの公開metadata、既存Noah feed設定、固定commitのコード取込、私有登録と審査/配布。
- AMCの工程: due sourceのlease→制限付き取得→provider IDで統合→内容hashが変わった版だけ保存→公開状態再確認→候補の表示→本人が固定版を登録画面へ渡す。
- Jevの合格条件: 同provider IDの重複0、同内容の新着生成0、leaseを失った取得の確定0、非公開/撤回確認後の表示0、未検証の実行可能表示0、cursor改変/別owner/別設定の継続0、本人操作前のスクロール移動0。
- 出力先: Noahタイムラインの「公開ソースの新着候補」、`/noah/candidates/[id]` の出典/固定版、既存登録画面。
- Wallet: 公開metadataの読取だけ。契約・購入・有料API・実行を開始しない。OSSの表示をモデル/インフラの無費用保証としない。
- hardware profile依存: 取得hostとaccount DBが稼働していれば画面閉鎖後も更新。Mac常駐とcloud cronを同じserviceへ接続するが、実cloud/Pixelは別受入。
- 失敗時: 取得失敗/制限は既存候補を保持し、次回取得可能時刻と未確認を表示。検索に出ないことだけで撤回しない。404/410/非公開を個別metadataで確認した場合だけ取り下げる。
- 記録: sourceのlease/期限/成功/失敗/次回/ETag、candidateのprovider ID/URL/現在状態/確認時刻、内容hash別のmetadataとcommit版。秘密・私有repo・重み・原本コードは収集しない。

## 取得と保存

GitHubは公開・非fork・非archiveの`topic:ai-agent`を更新順、HFは公開Spaceの`agent`検索を更新順に取得する。各回先頭10件と、保存済み候補の古い確認3件まで。既知であっても接続受入件数85の台帳へ自動加算しない。全世界の網羅を主張しない。
sourceごとに2時間間隔、5分lease、1回20秒の外部通信上限。`Retry-After`/rate-limit resetを尊重し、失敗は最大24時間のbackoff。再起動では期限が残ったleaseを奪わず、同じmetadata版を二重作成しない。
GitHubの[公式Search API](https://docs.github.com/en/rest/search/search)、[回数制限](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)、[条件付き取得](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api)、HFの[公式Hub API](https://huggingface.co/docs/hub/api)に従う。HTTP転送を自動追跡せず、固定host/検証済みrepository識別子からURLを組む。受信JSONと表示文字列を制限する。
`noah_discovery_sources`、`noah_discovery_candidates`、`noah_discovery_versions`を使用する。仕事のJob DBは作らない。候補上限10,000、各候補の直近20版を保持し、15分以内の版はcursor保護のため回収しない。上限を隠して成功扱いにしない。
metadataだけが変わった更新とcommit変更はともに記録する。検索時の更新日時は提供元の値、タイムラインの「確認した新着」はNoahの初回/内容変更観測時刻。再確認時刻だけの変化を新着にしない。ライセンス不明を許諾へ補完しない。
古い個別確認は順番に再検査する。最終個別確認から24時間を超えた候補は一覧から外し、詳細は再確認が必要と表示する。個別の公開撤回を常時即時検知する保証はない。

## APIと表示

`GET /api/noah/discovery` はquery/order/cursor付き候補、source状態、ownerScopeと既存feed設定。`POST`は現在owner/Origin/scopeを検査し、due sourceだけを処理する。利用者から取得URL/検索式/時刻/force指定を受け付けない。
`GET /api/noah/discovery/[id]` は現在公開確認済みの固定版・履歴・出典を返す。登録リンクはURL/commitを既存画面へ渡すだけで、自動取込・権利確認の自動チェック・実行はしない。
おすすめONでは興味一致40点、フォロー15点、同意後の成功Workの公開タグ一致5点。理由を表示し、OFFは新着順。非表示は常に除外。未確認の対応端末や外部能力を推薦根拠にしない。同意履歴の活用・消去は下記の契約を使う。候補の未知の能力は加点せず、現在稼働中の実行先の自動推薦は後続要件として維持する。
cursorは保存版の単調なwatermark（同時刻の追加も固定）、owner/検索/順序/設定のhash、asOf、最後の順位と15分期限にHMAC署名。鍵はserver専用DB値で保持し、公開APIへ返さない。各ページで現在の取り下げ・確認期限を再検査する。新着は通知し、本人が押すまでリストを差し替えない。

## 取得host

`scripts/noah-discovery-daemon.mjs`がloopbackの既存Noah APIを1分ごとに確認し、実際の取得はDBの2時間制限に従う。API認証と現行owner scopeを使う。端末画面/マウス/本人browserは操作しない。
cloud cron用のworkerは同じDB/serviceを使う配備用のひな形で、本番DB bindingと配備は別途確定が必要。ひな形やlocal Workers試験を実cloud稼働へ昇格しない。


## 同意した履歴と実行方法の推薦（2026-11-18）

`GET /api/noah/recommendations` は本人の `settings:{revision,historyEnabled,historySince,runtime}` とownerScope。`PUT` は同じOrigin・ownerScope・観測revisionと `{revision,historyEnabled,runtime,clearHistory}` を要求する。runtimeはany/headless/local-model/codex。未知の項目400、未認証401、別Origin403、scope/設定競合409、保存失敗503。CASの単一upsertで同時編集を扱う。テーブル `noah_recommendation_settings` は本人キー、revision、同意/消去の時刻、希望する実行方法だけを保存する。

既存おすすめONとは別に履歴利用へ同意する。直近30日・最大500成功WorkからAgent IDだけを取り、公開catalogのタグへ対応付ける。依頼・成果の本文・私有ソース・他人の履歴を選択しない。利用開始/履歴消去より前に始まった仕事、未完了・失敗・停止、catalog未登録のAgentは履歴推薦に使わない。clearHistoryは時刻とrevisionを進め、過去のWorkを推薦から除外する。元の仕事記録と成果を削除する機能ではない。消去・停止前の遅延完了を後から復活させない。

公開feedはフォロー40・興味20・履歴タグ10・対応実行方法5、調査catalogも同じ重み。実行方法は固定adapterまたは審査済み配布manifestのruntimeがある場合だけ加点し、現在接続中/オンラインとは表示しない。公開ソース候補は対応runtimeが未検証なので能力を加点しない。各feedのcursorを本人・設定revision・観測時刻へ結び、設定が変わった続きを拒否。新しい成功Workは先頭の再読込から反映し、追加読込の順位を変えない。推薦停止は全欄の個人加点を0とする。非表示は維持する。

受入条件: 同意前/消去前/別owner/失敗Workによる加点0、停止時の加点0、同設定/時刻で重複ページ0、競合更新による上書き0、未知runtimeの対応加点0。単体/DB統合に加え、Noahの実UIで設定→実Agentの成果→理由表示→履歴消去→理由消失を照合する。
