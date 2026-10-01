> 取得元の開発記録を移した資料です。方針・現在地はRock rootの `docs/native-os-integration.md`、今回の配置の検証は `docs/native-os-validation.md` を優先します。過去の実行結果・パス・Goal状態は当時の記録で、現在の実行や完成を意味しません。

# Cloud AI と Rock star os の役割

この文書は 2026-09-08 の継続開発で確認した実装と、独立した新 `os/ai_routes/` の範囲を区別する。クラウド側で AI 処理が完結しても、端末側には「どの入力を、誰の権限で、どこへ送り、どこまで使い、結果不明時にどう回復するか」を決定する役割が残る。モデル性能やクラウド機能との競争を OS の必須条件に追加しない。

**利用者の標準月額は USD 8.88 のまま。新しい compute budget は内部の計算予算・受付制御であり、利用者への追加請求ではない。Wallet debit、ToB 売上、料金率、実資金送金を追加していない。**

## 現在の経路と、まだ接続していない部分

| 経路 | 実装・試験のある範囲 | 未接続・未実証 |
| --- | --- | --- |
| local | 署名済み Tool の固定テキストレシピ、選択入力、隔離実行、履歴 | 汎用 LLM、モデル取得・量子化・メモリ計測、NPU、BlackBerry 実機 |
| cloud | 所有 Linux VM の固定 TLS Runner、個別入力同意、署名要求、購入・支払資格、実 Linux レシピ隔離 | 一般 AI provider API、実モデル推論、実トークン課金、商用 SLA |
| pc_usb | 所有 Unix socket と peer UID を確認する Runner fixture、購入者資格、個別同意 | 物理 USB、利用者 PC の自動検出、実モデル容量・性能 |
| MCP broker | 別モジュールの固定 Tool policy、接続 epoch、耐久 claim、実所有 HTTP fixture、結果不明時の status 照合 | OS の通常画面への統合、一般 provider OAuth、任意外部 MCP、モデル料金との接続 |
| ai_routes | 今回追加した pure plan、所有者共有 SQLite 予算予約、明示同意、一度だけの claim、公開 fixture accounting | Runner/MCP/native UI 接続、実 LLM・通信・provider 強制上限・一般 cancellation |

監査した主な正本は `os/platform/runner_control.py`、`os/runner/{client,transport,executor,store,protocol}.py`、`os/service_access/{controller,status}.py`、`src/blackberryrock/packages.py`、`os/ui/remote-ui.inc`、`docs/MCP-BROKER.md`。Runner の現行 cloud/PC は LLM ではなく recipe 実行である。schema4 の OS/runtime 最低版一致も、端末にモデルが収まるという証明にはならない。

既存 Runner は入力を限定して受け取り、Linux namespace と syscall 制限で通信や Wallet 参照を隔離する。AI provider 接続のためにこの worker のネットワークやキー参照を解放しない。今の基本 OS、導入済みローカル Tool、自分のデータへのアクセスは新 compute module によって有料化しない。

## 今回の独立実装

`os/ai_routes/policy.py` は、保護されたカタログと端末能力 adapter の観測を受けて、明示選択した一経路だけの plan を作る。入力は UTF-8 選択テキスト 1–65,536 bytes。永続化するのはその SHA-256 と byte 数で、本文は保存しない。

plan は authority UUID、owner、元 device、要求 key、選択入力、local/cloud/pc_usb、provider ID、model ID と revision、price version、出力 token 上限、メモリ・保存容量要件、retention/cancellation policy、能力観測 digest、外送選択、内部予算上限、発行・期限を含む。これらの exact digest に `approved:true` を付けた別の明示同意が必要である。provider ID は論理識別子であり、未接続の実 provider URL・region の証明ではない。

cloud は online と外送同意、PC は接続済み観測と外送同意、local は正確なモデル revision の存在と必要メモリ・保存容量を要求する。条件を満たさなければ拒否する。別 provider、別モデル、cloud への自動 fallback は行わない。現在の能力観測は公開ソフトウェア fixture であり、実ハードウェア計測を主張しない。

`ComputeBudgetStore` は次の限定 API を持つ。

| API | 永続化する意味 |
| --- | --- |
| `prepare(auth,key,route_id,selected_text,allow_external,max_cost_microusd)` | 正確な未送信 plan。費用予約・実行なし |
| `reserve(auth,key,consent)` | 現能力・元端末・同意・期限を再検査し、所有者の共有枠を原子的に予約 |
| `claim(auth,key,selected_text)` | 入力一致と現在 policy を再検査し、送信許可を一度だけ耐久記録 |
| `cancel(auth,key,cancel_key)` | 未 claim だけ予約解除。claim 済みは UNKNOWN 保留・照合待ち |
| `set_paused(auth,key,paused)` | 所有者の追加 reserve/claim を停止。既に外送された処理を停止したという意味ではない |
| `status(auth,key)` | 最新予算・状態。同じ所有者の別の有効端末からも照合可能 |
| `reconcile(envelope)` | 正確な実行識別へ結合した provider 最終 accounting のみで保留を確定 |

`claim` の戻り値は immutable receipt と、今回の呼出しだけの `send_permitted` を分ける。初回 commit 成功時のみ true。同 key の再呼出しは同 receipt と false を返す。ACK が失われた後に receipt の履歴値を読んで再送してはならない。再起動時 CLAIMED は UNKNOWN になり、provider の status/accounting 照合まで残る。実 provider に到達しなかった可能性があっても、時間切れや曖昧な not-found だけで枠を戻さない。

固定予算枠は authority 内の owner 単位で、A/B 二台が同じ SQLite 台帳へ予約する。単位は整数 micro-USD（1 USD = 1,000,000 units）。端数切捨てを伴う料金計算はしない。fixture の 600 units 等は試験用上限で、モデルの市場価格ではない。初期 limit は保護された構成で固定し、この版には周期リセット・上限増額・利用者課金 API がない。

最終 accounting が予約以下なら、確定消費と未使用枠を正確な整数で振り分ける。予約を超えた認証済み観測は額を clamp せず `observed_cost_microusd` として記録し、UNKNOWN 保留と所有者の追加受付停止を維持する。通常の resume や後から小さな額のイベントを送ることで隠せない。実際の超過請求に対する会計回復 adapter は未実装であり、別途明示的な調査・修復が必要である。

## 認証・耐久性の境界

- identity と provider accounting adapter は既定拒否。試験では既存の公開 fixture token と、別 domain の実 HMAC 検証を使用する。秘密鍵生成、本物の人・企業・決済 provider の認証を主張しない。
- identity guard は現在の owner/device 認証を対象とする。既存 `ServiceAccessController` の cloud 支払資格と PC 購入者資格の target 別 gate はこの新モジュールに未接続である。既存 Runner の gate は変更していない。
- 将来の admission 統合は同じ authoritative EntitlementStore の guard を保持したまま、compute mutex、SQLite の順で進める。独立した複製 DB、別プロセスの無保護 SQL 書込み、端末ごとの予算残高 copy は同一所有者の上限を保証しない。
- 新しい claim は plan を作った元端末だけ。同じ所有者の有効な B 端末は A の過去 receipt・状態を取得できるが、未送信の A plan を新規実行しない。失効 A は再送・読取りも拒否。別 owner の key はその owner の名前空間で照合する。
- 元 plan/receipt は immutable。provider/model/price/retention や能力観測の変更は未 claim の実行を拒否し、新 plan と明示同意を要求する。既に UNKNOWN の古い revision の会計照合は旧 plan と結合したまま残す。
- SQLite は `BEGIN IMMEDIATE`、FULL 同期、0700 directory/0600 files、単一 process lock。DB の欠損、authority/limit/binding の変更、部分 marker を新規初期化へ変換しない。時計 highwater は拒否した期限切れ判定でも残す。これはハードウェア時計やディスク antirollback の証明ではない。
- 固定件数上限に達すれば履歴を消して再受付せず unavailable。選択入力本文、Wallet DB、provider secret、raw model output を保存しない。外送済みの provider 保持データや別端末の既存ファイルを遠隔消去できるとはしない。

## 最小の次の統合

1. **一つの provider/model adapter を決める。** 保護された exact endpoint/region、model revision、price version、token/time/output の provider 実強制、status の確定条件を記録する。資格情報は専用 backend UID と保護ファイルに置き、UI/recipe/Tool manifest に渡さない。既存 Runner worker の networkless 境界は保持する。
2. **owner/device/支払 gate を共有 authority に接続する。** policy の caller が任意 owner/能力を自己申告しない。元経路の current guard の後に一つの compute reservation を作り、複数端末の上限を共通台帳で守る。snapshot の paid 表示は認可 grant として使わない。
3. **native UI に review/confirm/status を接続する。** OS が入力範囲、送信先と地域、モデル版、内部消費上限、保持と取消の実条件を一画面で示す。モデル・入力・経路の変更は同意失効。cancel/back は送信前の操作と送信後の取消意図を区別し、unknown で新 key を自動発行しない。今回の standalone module だけでこの画面が実 OS に接続済みとはしない。
4. **一つの実モデルで限界を測定する。** 固定小入力、費用・時間上限、cut ACK、provider unavailable、cancel race、モデル終了、端末交換を試す。クラウド不可なら明示的に停止し、利用者が別経路を選び直す。データ外送先を増やす自動再試行は導入しない。

ToC Wallet の月額認可・ATM 保留は既存 Wallet 正本のまま、ToB の売上・精算は `os/settlement/` の authoritative event 正本のままとする。AI/MCP/Tool 成功を売上や入金と見なさない。将来の売上連携は対応する provider event の correlation を照合する adapter であり、成功回数から残高を作る処理ではない。

## 外部一次資料から分かる制約

Android の Gemini Nano は AICore/ML Kit の対応端末・機能ごとの runtime を前提にする。ML Kit は機能ごとの対応差と、Nano モデル版が変わる場合の評価を説明している。Rock star os の ARM64 Linux や BlackBerry がその API を利用できるという推論はできない。BlackBerry/Nano は **NOT_RUN** とし、将来の端末能力 adapter で実検出する。[Android Gemini Nano](https://developer.android.com/ai/gemini-nano)、[ML Kit GenAI の対応とモデル情報](https://developers.google.com/ml-kit/genai)

Cloud Billing の alerts-only budget は支出を止める仕組みではない。Google の別機能である spend caps は対象 service/project などに制約があり、処理中の費用や適用遅延による超過があり得る。したがって本モジュールの受付枠も、未接続 provider の最終請求額が必ず上限以内になるという保証にはならない。[Budget alerts](https://docs.cloud.google.com/billing/docs/how-to/budgets)、[Spend caps の範囲と超過](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)

長い AI 処理の取消は provider ごとの API 契約である。OpenAI の background Responses は状態取得と cancel を持つが、それを全 provider の取消・返金・データ消去保証へ一般化しない。背景処理の保存条件も project 設定と API の処理方式を別に確認する。[OpenAI Background mode](https://developers.openai.com/api/docs/guides/background)

「学習に使わない」は「一切保持しない」と同義ではない。Google の説明でも abuse monitoring、grounding、API の保存設定等によって保持条件が分かれるため、同意する plan は使用 feature と保持 policy の版へ結合する。[Google のデータ保持条件](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention)

モデルの提供終了・移行があるため、将来の model swap は保護されたカタログ更新、旧/新モデルの能力・出力評価、未送信 plan の再同意を必要とする。古い unknown receipt の provider/model 識別を新しい版へ書き換えない。[Google のモデル lifecycle](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions)

## 検証範囲

新 `os/ai_routes/tests/test_policy_budget.py` は実 SQLite による 23 件の focused tests を持つ。明示経路・外送拒否、端末能力、strict 入力、同一 owner 二台の並列予約と一度だけの claim、ACK 喪失・再起動、取消・pause、provider HMAC/全識別項目、unknown/超過、期限と時計巻戻り、DB欠損・private権限・容量、claim receipt への実 SQLite trigger 故障を検査する。最後の故障は実 ENOSPC ではなく明示的な test trigger である。

実行方法は `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=src:os python3 -W error::ResourceWarning -m unittest discover -s os/ai_routes/tests -v`。本証拠は host module/SQLite の範囲。HTTP、実 LLM、provider 課金、native GUI、OS image への組込み、物理 BlackBerry、一般の provider cancellation はこの増分では **NOT_RUN / NOT_CONNECTED**。
