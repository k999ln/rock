# Chat MCP botコントロールルーム

日付: 2026-09-13

## 決定

SkyはMCP商品を探し、接続先・権限・料金を確認して接続する入口のまま維持する。接続後の操作面はChatへ統合し、ready商品と共通Connectorで接続済みのMCP serverをbotとして表示する。

Chatではbotを選択し、方向・修正指示、公開機能、引数、1回承認、実行結果、失敗、停止を同じスレッドで扱う。server名、版、機能数とtool schemaはConnection Passportから読み、MCPごとの固定実装を要求しない。

## 実装

- `/api/sky/connections`のready商品と、PC上の共通Connectorが返す`/servers`の接続済みserverをbot一覧へ統合する。
- SkyでMCP接続が完了すると`sky-mcp-servers` eventで開いているChatも更新する。PC接続変更とwindow focusでも再照合する。
- 任意MCPはPassportのtool一覧から機能を選び、tool schemaの必須項目をJSON入力へ展開する。`instruction`、`prompt`、`request`、`query`、`text`等を持つtoolではChatの方向指示を初期入力へ反映する。
- 実行は共通Connectorの`prepare → 内容確認 → execute`だけを使う。approval tokenは画面へ表示せず、変更された引数、再利用、直接`tools/call`を拒否する既存契約を維持する。
- bot停止は対象transportをresetし、Passportを破棄して`available`へ戻す。同時に未使用の一回承認をすべて失効させ、停止前の券を後から実行できないようにする。

## 方向修正と停止の境界

方向・修正指示は、選択した機能の次回入力へ反映する。MCPが実行中の方向変更や取消を明示的に公開していない場合、進行中の処理を変更・停止できたとは表示しない。実行中の同期callは結果を待ち、送信後timeoutを自動再送しない。

bot停止は新しいMCP操作を防ぎ、ローカルstdio processまたはHTTP sessionをresetする制御である。すでに第三者サービスへ到達した外部作用の取消を保証しない。投稿、広告、DM、請求、返金、支払い、送金等は各商品の既存approval gateを通す。

## 保存とプライバシー

Chat本文、方向指示、MCP引数、MCP結果は新たにD1へ保存しない。既存job対応商品は従来どおり実行メタデータとreceiptだけを本人別に保存する。秘密情報をJSON引数へ貼り付けず、MCPの認証情報はPC側の環境変数に残す。

## 検証

- 共通Connector試験で、接続後の停止、Passport破棄、状態の`available`復帰、停止前approvalの拒否を確認する。
- 製品ベース検査でRQ26とChatの管理契約を固定する。
- Sky検査で、動的MCP一覧、bot管理runner、方向修正、停止、コントロールルームCSSの欠落を検出する。
- 実ブラウザで共通ConnectorとSky基本自動化を接続し、4機能を持つbotがChatへ自動表示されることを確認した。合成Markdownの「出典を整理して」という方向から出典整理を選択し、引数反映、1回承認、実処理結果、Chatからのbot停止、一覧からの削除までを確認した。

外部Provider、実投稿、実課金、実送金、法的提出、Sites再配信はこの変更に含めない。
