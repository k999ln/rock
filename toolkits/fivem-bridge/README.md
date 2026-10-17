# RockstarOS World Bridge — local developer preview

AI06 / ROCK。現実側のカード共有と、FiveM NUI側の確認・依頼下書きを接続する開発用sandbox。GTA VI対応ではありません。Macは同一NUIをHTTPで表示して契約を試験します。ゲームを実行するsimulationではありません。

## Macで試す

Repository rootでNode 22.13以上を使います。

```sh
npm run game:bridge
```

`http://127.0.0.1:5216/` を開く。左でカード保存→対象と内容を承認して共有→右で同じカードを確認→左で確認記録を検収。右からの依頼は左へ未承認の下書きとして届きます。ブラウザを再読込しても保存済みカードは戻ります。

保存先はGit管理外の `work/fivem-bridge/fixture.sqlite`（SQLite WAL）。Ctrl-Cで停止。同じコマンドで再開し、親画面を再読込すると新しいcookieを取得します。途中のカードは元の5分期限を維持し、期限切れを自動再送しません。応答不明は同じ操作IDの「再照会」を使います。入力・通信が失敗した場合は本文を保持します。停止は次の照会で相手の一覧から外れますが、相手が既に読んだ内容の回収を保証しません。

試験用DBはこのMacの単一開発者向け。OSログイン本人を前提にloopbackのみで待受け、cookieとOrigin/Host検査で他サイトからの操作を拒否します。公開認証・複数利用者の登録・本番Zema/D1同期は実装していません。仕事状態は既存 `lib/workflow.ts` とcompositionの本文検査を再利用。カード配送のreceiptがない場合はbridgeの検収endpointが完了を拒否します。本文の検査だけで実ゲーム反映済みにはしません。

## FiveMへの接続候補（未実機受入）

管理権限のある開発用FXServerとWindowsの正規GTA V/FiveM環境が必要。`resource/` を `resources/[local]/rockstar_bridge/` にコピーします。gatewayとFXServerは同じホストで動かす限定構成です。Mac gatewayをLANへ公開する実装にはしていません。

1. server側で本人の `license:...` を確認し、本人と管理者の合意した1人だけをlinkする。未指定のplayerを自動登録しない。
2. repo外で32文字以上の用途限定random tokenを用意。gateway環境変数 `ROCK_BRIDGE_MODE=fivem`、`ROCK_BRIDGE_PLAYER`、`ROCK_BRIDGE_TOKEN` に設定して上のコマンドを実行。試験DBは `work/fivem-bridge/fivem.sqlite` へ分離される。`ROCK_BRIDGE_DB` と `ROCK_BRIDGE_PORT` で保存先とportを指定可能。
3. FXServerのprivate設定に `set rock_bridge_player "license:..."`、`set rock_bridge_token "..."`、必要なら `set rock_bridge_port "5216"`、`ensure rockstar_bridge` を指定。**setr / setsは使わない。** credentialとplayer identifierをGitやNUIへ保存しない。
4. ゲーム内で `/rockos` を入力。NUIを開き、Escapeまたは閉じるでfocusを戻す。
5. gatewayの現実側画面でカード共有→ゲーム内で内容確認→現実側検収を行う。終了時はresourceとgatewayを停止しtokenを破棄。接続はgateway起動後1時間で失効する。再開時はtokenも変更する。

serverは実際のnetwork sourceからlicenseを取得し、非公開設定のplayerと照合してからgatewayへ接続します。NUI申告のplayer/ownerは採用しません。gatewayはserver tokenとplayer hashを検査します。game側は下書きと確認だけ許可し、現実側の承認・完了・任意実行は許可しません。resource変更時にbinding versionを更新し、異なる接続条件で旧DBを開くと起動後の照会を拒否します。旧DBを保持して新しい保存先で始めてください。

server/client JSはsource候補、MacのVM harnessでserverの本人照合と実gateway通信を試験しています。これはFiveM engineの実行合格ではありません。実機でresource読込み、NUI focus、2 player分離、切断、再接続、resource/gateway再起動、期限切れ、停止、同一hashを受入してください。

## 境界と制限

- UTF-8本文4096 bytes、カード100件、操作1000件／試験DB owner。任意HTML/JSはtextContent表示のみ。
- 有効な送信待ちは1枚、承認後5分。再送は同じID・同じ内容のみ。変更やrevision競合は拒否。
- NUIの確認はplayerの申告であり、改変clientに対する描画証明ではない。実機の画面証拠と本人検収を別に取る。
- 仕事・本文・確認履歴をローカルDBに保持し、自動削除はしない。削除はgateway停止後、試験用DBとそのWAL/SHMを本人が管理する。バックアップする場合も個人データとして扱う。
- Mac表示ではhost_fixture_confirmation、FiveM候補ではfivem_player_confirmation_unacceptedを保持。外部出力・Cloud Agent・課金・ゲーム通貨・3D・NPCには接続しない。
- 本番には既存本人認証/D1・Asset lineage・短命player link・配備審査・削除/監視・受入済みserver profileの追加統合が必要。sandboxを公開しない。

## 検証

```sh
node --experimental-strip-types --test tests/fivem-bridge.test.mjs
node --check toolkits/fivem-bridge/resource/client.js
node --check toolkits/fivem-bridge/resource/server.js
npm run typecheck
npm run design:check
npm run verify
```

設計正本: [GTA bridge](../../docs/gta-reality-bridge.md)。Cfx技術資料: [NUI](https://docs.fivem.net/docs/scripting-manual/nui-development/full-screen-nui/)、[callbacks](https://docs.fivem.net/docs/scripting-manual/nui-development/nui-callbacks/)、[resource manifest](https://docs.fivem.net/docs/scripting-reference/resource-manifest/)。用途の許諾・実環境受入は技術仕様とは別です。


### MacのAgent仕事（2026-10-15、AI06 / ROCK）

利用者の「繋げるやつ全部となければ作成」により、対象名の回答待ちを解除。既存compositionの利用可能5 ToolをローカルAgentとして一覧化し、本人が最大6手順のAgentを作成できる。LLM推論ではない。ゲームNUIで目的・素材を依頼し、現実側で内容を承認して実処理、同じ仕事IDの最大10版を継続、成果を明示共有、検収/停止する。既存workflow契約・revision・操作IDを維持しSQLiteへ保存。ゲーム側には現実側の原稿・設定・過去版を出さず、共有した成果だけ戻す。最大100仕事/20 custom Agent、素材UTF-8 8000バイト、停止/失敗を成功に昇格しない。失敗時は設定済みAgentまたは次の版で修正する。無料記事Toolは標準設定だけでは実行できず、詳細設定が必要。

Sky外部AgentはROCK_BRIDGE_SKY_ORIGIN（HTTPS origin）とROCK_BRIDGE_SKY_TOKEN（既存本人session）の明示設定で登録一覧を取得するread-only connector。資格情報はgateway内のみ。未設定・認証失敗は未接続表示、登録済みを実行可能にしない。外部実行は既存見積/予算/Broker/delegation/usage経路の接続と受入が未完了。GTA VI、実FiveM、本番Zema、通貨交換、skin販売の成功ではない。

合格証拠: tests/fivem-bridge.test.mjs 11/11＋旧launcher 2/2、Mac UIで仕事cd237d92-84cb-4c33-a334-875fcf2d3bcdの出典整理→同ID第2版→明示共有→completedとcustom Agent作成。次は外部接続の本人環境・許可済み予算を設定して別受入する。
