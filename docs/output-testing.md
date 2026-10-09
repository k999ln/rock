# 登録不要の出力テスト


目的・体験: `/test` は既存catalogの全項目を列挙し、サンプル一括実行、編集入力の個別実行、結果のコピー・保存・リセットを提供する。実処理・模擬データ・接続待ちを同じ状態語で表示する。CSV、文章、企画、受付文、照合は既存の純粋関数を再利用し、Zema試験はlib/workflow.tsへsample=trueの記録を通す。本番完了へ昇格しない。

責任・入力出力: ROCKのstateless POST `/api/output-tests`。同一Origin/JSONのみ、本文64KB・欄12,000文字まで。固定allowlist以外の入力・Tool・owner指定を拒否。応答はid/mode/status/output/details/executedAt。Provider、DB、Broker、Wallet、本番保存API、任意shellは呼ばない。模擬Marketは入力検査のみ、Walletは表示計算のみ、実注文・実残高ではない。未接続Toolのanswerはnull/not_run。

状態・保存・失敗復旧: idle→running→output/not_run/error。失敗は当該項目だけに表示し、再実行可能。編集時に古い出力を破棄。一括はサンプルへ戻すと明示。結果と入力はReactの画面メモリのみ、再読込で消去。アプリDBへの記録なし、ログへ本文を書かず、Cache-Control:no-store。利用者操作でテキスト/CSV/全結果JSONを端末へ保存。アプリ自身の保持・削除と配信基盤のメタデータログは区別する。

承認・合格・未決定: 登録不要でも本番の本人性・予算・同意を緩和しない。サンプルは架空と明示し、法務/特許は受付整理に限定。外部公開・送金・AI API呼出なし。全catalog coverage、入力変化、境界拒否、workflow未完了、ブラウザ一括/個別/保存/リセット、verifyで検収する。Cloud鍵・利用枠、候補Toolの実行環境、Pixel端末内modelは別途OWNER/EXTERNALの準備と実受入が必要。撤去時はheader入口と/test・stateless endpointを除去、旧配備へrollbackできる。
