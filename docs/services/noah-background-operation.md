# Noah — Agentの背景継続運用

## 2026-11-17 停止中の実行環境更新

- `GET /__noah/operations/[id]/runtime`で保存済みbindingと接続済み同Agentの候補、revision、候補digestを比較する。権限失効/実行中/停止確認中/結果不明/整理済みは更新不可。
- `POST`同pathは`{revision,commandId:UUID,candidateDigest,confirmation:"noah-operation-runtime/1"}`のみ。hostが現在のbindingを再取得し、account APIの`rebind`でsource/招待/配布権限を再検査する。候補/親revision競合は409。本人の指定commandやbindingはhost APIで受け付けない。
- 旧記録は環境1として保全、最大20環境版。変更した操作ID/digest/観測revisionを保存し、応答不明時は同じ操作IDで照合する。新規保存はpaused・lease解除・予約なし。再送は現在の記録を返すだけで、再開済み状態を巻き戻さない。
- 運用ID/条件/累計/過去Workは保全、新規Work/各回履歴にbindingVersionを追加。旧記録は1として読む。別途明示した再開時にもbinding一致と期限/回数制限を保持する。
- 合格条件: 更新による自動実行0、同時更新で採用1版、同一操作再送で版追加0、旧Work変更0、古い環境版の実行要求拒否。既存モデルdigestなしの運用が同じIDで環境2へ更新され、明示再開で実VM/実モデルの結果を返す。

## 成果イベント・条件変更・整理（2026-11-17）

- 定期実行に加え、`trigger:{kind:"work.returned",agentId}`で本人の別Agentが返した正常なWorkを起点にする。新しい公開Webhookや任意の成功申告は受け付けない。起点は受入済みWorkでも業務検収済みを意味しない。
- 開始・明示再開より後の成果だけが対象。停止中の成果は取り込まない。最小間隔は1/5/15/60分、全運用共通の同時実行1、既存の累計回数/24時間上限を維持。待機中は実行数を増やさない。
- 起点のWork ID・revision・結果hash・完了時刻、条件版、運用IDの経路を各回へ固定する。カーソルは完了時刻とID。同時claimはCAS、作成/実行開始は親運用と起点WorkのrevisionをSQLで照合。重複処理・同じ運用への循環・8段を超える連鎖を拒否する。拒否した起点もカーソルを進め、後続を妨げない。
- 渡すデータは成果本文のみ（UTF-16 2,000単位以下、JSON 4,500 bytes以下）。ファイル・資格情報を転送せず、起点の文中の指示を権限にしない。本人Codexへの送信確認は選択したAgentの成果転送も含む。
- `POST /__noah/operations/[id]/revise`は`{revision,config}`。停止確認済み・結果既知の計画だけを変更し、Agent/固定版は変更不可。条件版は1〜20、過去条件と各Workを保全、累計受付数はリセットしない。期限は再確認時点から最大24時間。保存後はpausedで明示再開が必要。古い画面のrevisionを自動再試行しない。
- `POST .../[id]/archive`・`restore`は`{revision}`。停止済み/終了済みを履歴付きで整理し、復元はpaused。結果不明は整理/条件変更/再開を拒否。整理済みを除く計画上限20件を、作成と復元の両方でSQLにより検査する。
- `GET /__noah/operations?agentId=...&archived=1`で整理済みの直近20件。全Workの履歴は保持し、計画の表示は直近20回。起点候補のUIは本人の直近100件の実行履歴にあるAgentから選ぶ。イベントSQLはowner/成功/カーソルをlimitより前に適用する。
- 合格条件: 他owner/失敗/開始前のイベント実行0、同じ成果の重複0、循環実行0、停止中条件変更後の自動起動0、古いrevision更新成功0、整理で過去Work削除0。ローカル実VMでPythonの成果→Nodeの要約→Work保存を、運用タブ閉鎖中に検証する。証拠は`work/verification/noah-operation-events-20261117/`。

## 一般Agentの運用契約（2026-11-17）

- 本人が言う一言: 「接続ボタンを押すとターミナル下で始まり、他の画面をストレスなく触れるようにしたい」。接続は背景で準備・依頼待ち。定期実行は依頼と上限の確認後に開始する。
- Goal: 既存の対応済み隔離runtimeに同じ依頼を繰り返し渡し、画面を閉じてもこのMac/Noahが稼働する間は継続する。画面・入力・clipboard・本人browser sessionをAgentへ渡さない。
- Noaがつなぐもの: 接続したAgentの固定版、image、モデル、本人の登録/購入利用権、既存Work、本人Codexを使う場合の回数/期限付き送信確認。
- AMCの工程: 所有確認→固定bindingと運用計画をWorkに保存→実行枠確認→CASで今回の番号/Work IDを確定→所有/期限/版/利用権再確認→既存実行器→Work成果→運用計画へ参照。別のJob DBは作らない。
- Jevの合格条件: 異なる一般テンプレート2件が実VMで処理され、タブ閉鎖後の実行1件以上、片方の停止後にもう片方の成功1件以上、停止した運用の追加実行0件、同ID再送の重複0件、競合claim成功1件、owner違い拒否、失効/版変更後の実行0件、再構築hostの自動再送0件。画面操作の無遅延を保証する条件ではない。
- 出力先: Agent詳細の「裏側で続けて運用する」、運用状態・次回・期限・受付数/成功数・直近20回のWorkリンク。依頼本文と成果は本人だけが取得する。
- Wallet: 期間は最大24時間、受付総数1〜100回、間隔1/5/15/60分。外部送信/支払Toolは追加しない。本人Codexの料金は未計測で、回数制限を金額予算保証としない。金額予算/Wallet予約は未完了。
- hardware profile依存: 同時実行はhost全体で1件、各containerの既存CPU/メモリ上限を保持。Macのスリープ/電源OFFやNoah終了後は継続しない。混雑時は枠を待ち、予定のまとめ実行なし。
- 失敗時: 自動再試行なし。保存・所有・モデル・版が確認できなければ停止。結果不明はblockedで、同じ運用の再開不可。既知の失敗は履歴を確認し同条件で明示再開できる。期限/回数上限を再開でリセットしない。
- 記録: accountの既存`work_jobs`に`templateId=noah-operation`の計画を保存。固定config/binding、leaseのhash、状態、revision、次回、受付数、成功数、activeと直近20参照。各回は`noah-agent-local`のWorkに`operation:{id,sequence}`を追加。本文/成果/使用量は既存Workに一度だけ保存する。

### API・停止・再起動

`POST /__noah/operations`は`{id:UUID,agentId,prompt,intervalSeconds,maxRuns,expiresAt,timeZone,confirmation:"noah-operation/1",providerConsent?}`。本人Codexでは`providerConsent:"codex-account/1"`必須。URL・command・任意provider・任意runtimeは受け付けない。固定bindingは接続hostが取得し、`POST /api/noah/operations`でaccountのWorkへ保存する。

`GET /__noah/operations?agentId=...`、`POST /__noah/operations/[id]/stop`・`resume`（bodyは`{}`）。loopback/Origin/account/ownerScopeの既存ゲートを共用。一般スマホ・公開hostの認証relayは別工程。非公開GETはno-store。hostの認証contextとlease原文はメモリだけに保持する。

計画stateは`enabled / paused / stopping / blocked / exhausted / archived`。host非接続時は`interrupted`として重ねて表示する。停止要求はまず永続計画をstoppingにして新規受付を拒否し、実行器の終了/Workの保存を待ってpausedへ移す。終了を確認できない場合はblocked・結果不明。`resume`は同じbinding、残回数、期限、前回の確認済み状態を再検査してleaseを更新し、1間隔後から再開する。

予定のCAS後、Workの作成/実行開始も同じparent revision/state/active IDをSQL条件で照合する。停止が先行した場合は作成/開始0件。実行番号から決定したWork IDを使い、ネットワーク応答不明を別IDで再送しない。host再起動後は保存計画を自動で採用せず、停止状況を照合して本人の明示再開を待つ。取得/claim/保存失敗は保守的に停止する。

現在は整理済みを除く20運用計画までのローカル限定実装。金額予算、一般cloud常駐、一般account/phone pairing、無人再起動復旧は未完了。以下は先行する固定テスト専用実装の記録。

## 固定テストAgentの先行実装（2026-11-15）

- 本人が言う一言: 「Noahから運用開始・停止できて、画面を閉じても動き続けるところまで開発して」
- Goal: 固定テストAgentのテキスト処理をMac上で定期実行し、画面非表示中も継続。入力最大4000文字、間隔10/30/60秒、費用0円。
- Noaがつなぐもの: 既存の固定manifest hashと`text-check/1`。接続API/account所有確認と同じadapterを使う。
- AMCの工程: 所有確認→入力/間隔の保存→接続準備→予定ごとに所有確認→実処理→結果保存→次回予約。画面pollは表示の更新のみ。
- Jevの合格条件: 全Noah画面を閉じた期間に新規成功2件以上、再表示で同じ運用ID/履歴、停止応答後の新規処理0件、同一開始IDで運用1件、同時実行1件、他owner操作0件、認証/定義失効後の新規実行0件。
- 出力先: 既存Agent詳細の運用パネル、直近20件の時刻・結果、運用回数と次回予定。
- Wallet: 固定テスト処理のみ。外部通信/モデル/実資金を伴う業務Jobはこの経路では実行しない。
- hardware profile依存: このMacとNoah開発サーバーの稼働が必要。ブラウザ終了とは独立。スリープ中の予定はまとめ実行せず、ホスト再起動後は中断して本人の運用開始を待つ。
- 失敗時: owner確認不可/応答不明/保存不可で運用をblockedにし、自動再送しない。停止確認中は新規受付を止める。結果不明を成功へ変えない。
- 記録: 端末cacheの運用ID・入力snapshot・間隔・状態・連番・成功数・時刻、直近20回の定期結果。認証情報はcacheへ保存しない。既存account定義が正本。

## APIと状態

- `POST /__noah/connections/[id]/operation/start`: `{requestId:UUID,text,intervalSeconds:10|30|60}`。所有者・Origin・ownerScopeは既存bridgeと共通。接続準備後、初回を予約する。
- `POST .../operation/stop`: `{}`。運用の新規予約を解除し、処理中なら保存が終わるまで待つ。`disconnect`も同じ停止を行ってからprocessを終了。
- GETの`operation`に`id,state,text,intervalSeconds,sequence,succeededCount,startedAt,stoppedAt,nextRunAt,error`を返す。stateは`running/stopped/blocked/interrupted`、未作成はnull。
- 同じ開始ID/入力は再送結果を返す。内容変更や別IDで稼働中の開始は409。終了した古い開始IDで再開しない。開始IDは上限1000件保持し、超過は429。
- 1運用の定期処理は直列。毎回の連番とrunning記録を処理前に保存。結果20件を残して古い本文を捨てても連番/成功数は保持。手動処理の再送台帳とは別の保持枠。
- 同じhost内のtimerで動く。画面を閉じても実行を続け、処理終了後に次回時刻を予約する。遅延分の追いつき実行はしない。
- 毎回、開始時の認証context（メモリ内のみ）で既存APIへ所有確認し、ownerScope/id/manifest hash/readyを再照合。失効時は停止。host終了時はtimer解除・process停止。
- journal v1を読めるv2へ追加。再起動時はrunning運用をinterrupted、未照合処理をunknownとして復元。自動再開なし。

## 今回の境界

テスト用のローカル運用cacheであり、既存Work/Job/Receiptを置き換える業務台帳ではない。cloud常設、OS起動時自動起動、Macスリープ回避、Anicca/Codex業務接続、72時間の継続受入は別工程。

## 受入（2026-11-15）

関連37試験と型/lint/build/設計検証成功。Chromeで運用開始、Chrome/IABのNoah画面を両方閉じた約69秒間に7回の追加成功を記録。開き直して同じ運用・履歴を復元し、画面から15回で停止。停止後20秒以上で新規処理0件を確認。[試験・全体検証の残課題](../../codex/tasks/59-noah-background-operation.md)。
