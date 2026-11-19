# Noah — Agentの利用状況

2026-11-15: [統合仕様](../service-design/noah-agent-platform.md)の計測契約を最終形とする。本書の3scope集計とSDKは実装中。全Agentの利用者・実行・費用を計測できる状態とは扱わない。

- 本人が言う一言: 「誰がどのくらいagentを使ってるのか管理」「1,2,3全部」
- Goal: 自分の利用、自分が提供するAgentの利用、運営としての全体を同じ画面の別scopeで確認する。
- Noaがつなぐもの: `agent_delegations`、`a2a_usage_receipts`、`remote_ai_text_executions`、`sky_tool_events`、所有者付きのpackage/アップロード定義。
- AMCの工程: 認証→scope許可→期間・Agent指定→実績集計→利用元/実行履歴の確認。新しいJob DBや課金台帳を作らない。
- Jevの合格条件: 本人/提供者/運営の越権取得0件、イベント再送の二重計上0件、異なる通貨の合算0件、未計測を無料と表示0件、匿名導入IDを本人確認済みの人と表示0件。
- 出力先: `/noah/usage`。7/30/90日の期間、Agent別・利用者/利用元別・直近実行の表。スマホは横スクロール表。
- Wallet: 既存の署名確認済みA2A Receiptとremote LLM確定額のみ表示。利用報告を請求・収益・支払承認にしない。
- hardware profile依存: Web共通。外部Agentは利用報告SDKを実装しない限り測れない。Web画面を開いただけで実行回数を増やさない。
- 失敗時: scope403、保存先503、データなし、期間内の記録なし、費用未計測を別表示。前scopeのデータは残さない。
- 記録: 既存のイベント/実行ID、Agent・版、認証済みaccountまたは提供者申告のinstallation ID、結果、計測時間、確定額と通貨。入力・成果本文・秘密情報は集計APIに含めない。

## API / 権限

- `GET /api/noah/usage?scope=personal|publisher|operator&days=7|30|90&agent=<任意ref>`。
- personal: 本人が依頼したA2A、本人のLLM実行のみ。LLMにAgent IDが結び付かない記録はモデル利用として明示する。
- publisher: 所有するpackageの固定hash付きruntime bindingに結び付くA2Aと、自分の開発者認証で受けた利用報告。無関係の利用者/Agentは返さない。
- operator: サーバー設定`NOAH_USAGE_ADMIN_USER_IDS`（JSON配列）の認証済みIDだけ。空/不正設定では拒否。clientのrole/headerは権限にしない。
- 取得する実行記録と提供者申告は別sourceで集計する。同一実行が両方に含まれ得るため、sourceをまたいで合計しない。
- Agent別・利用元別は上位50、履歴は直近50。総数は全対象をSQL集計。期間はサーバー現在時刻から指定日数、UTC。
- 提供者には利用者の匿名化したaccount ID、運営には認証IDを表示。installation IDは提供者のシステム内の利用元識別で、Noah accountとの同一性は保証しない。

## 外部Agentの報告

- 既存`POST /api/sky/tool-events`と開発者認証を再利用。新しい登録は`packageKey=noah-upload:<登録UUID>`で所有権・ready・未削除を検査する。
- eventId UUIDを再送単位とし、同内容は既存の成功応答、内容変更は拒否。回数・成功/失敗・実行時間・installationIdを送る。入力/成果本文は送らない。
- `toolkits/noah-agent-client/usage.mjs`が外部Agent用送信関数。開発者キーはAgentのサーバー側だけに置き、Web画面・配布ZIPへ含めない。
- サンプルの利用報告は実業務の受入ではない。実顧客の表示名連携、利用上限による実行停止、任意Agentの計量保証、全既存ローカルToolへの自動計測は追加の接続作業が必要。
