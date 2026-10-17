# FivePlay → RockstarOS 開発adapter

FivePlay画面に独立した仕事端末を重ね、Macの既存workflowへ依頼、承認済み成果を戻すChrome Manifest V3拡張。FiveM resourceとは別物。ゲームengine、memory、save、通貨、skinを読んだり書き換えたりしない。GTA VI公式連携ではない。現在はソース/HTTP/mock試験済み、拡張の実インストール・実site overlayは未受入。

## Macでの準備

repo rootで `node --experimental-strip-types toolkits/fiveplay-adapter/start.mjs` を実行し、http://127.0.0.1:5217/ を開く。5216のFiveM fixtureとは別のSQLite。`work/fiveplay-bridge/connection-token.txt` はGitへ入れない。tokenは1時間有効、再起動で更新される。

Chromeの拡張機能画面で開発者モードを有効にし、このディレクトリを「パッケージ化されていない拡張機能を読み込む」で選ぶ。これはFivePlay上のUI追加とlocalhost:5217への接続権限を付与するため、利用者の確認後に行う。拡張アイコンからtokenを保存し、指定FivePlay URLを再読込する。

1. FivePlay右上の「RockstarOS · 仕事を続ける」を開き、「Macへ接続・成果を更新」。
2. Agent、目的、素材を入力して依頼。ゲーム読込が停止していても仕事端末は独立している。
3. Mac側で原稿を確認して実行、同じ仕事の次の版を作成、明示的に成果共有。
4. FivePlay側で成果更新。終了時は拡張設定で接続解除しgatewayを停止。失敗時の依頼再送は同じ操作ID・同じpayloadで照会する。

## 権限と保存

content scriptはhttps://fiveplay.lol/のtop frame限定。backgroundはsenderの拡張ID・frame・originを検査し、固定127.0.0.1:5217へstateまたはagent_requestのみ送る。tokenはstorage.sessionで保持し、ページへ渡さない。原稿は本人が入力・送信したものだけ。サイトの読込表示は参考表示で、成功receiptには使用しない。Mac側は本人のOS操作だけが実行/継続/共有/検収できる。試験用single-ownerで本番本人認証ではない。

素材やAgent設定をゲームstateへ公開しない。ゲーム由来の仕事要約と明示共有済み成果だけを返す。外部A2A/LLM、実資金、market、ゲームsaveを扱わない。共有した成果は当該ブラウザへ送信されるため、機密原稿はこのDeveloper Previewに入力しない。

## 解析結果（2026-10-15、build 8b0b5899ed）

公開HTML → loader worker → GPU/IO worker → Emscripten game.js / game.wasm。OffscreenCanvas、WebGPU、SharedArrayBufferのためのCOOP/COEP、IndexedDB userdataを使用。公開HTMLは`-nonetwork`、`-noSocialClub`を渡す。内部BroadcastChannelはgame-progress/game-fps/game-crash等。同一originの内部連絡であり、第三者向け公認APIではない。表示にGTA VI MapがあってもGTA VI公式接続の証拠ではない。

指定low=1は低メモリ用設定、resは解像度、fps=30はengine制限。ページは進捗報告がなくても最大6ポイントまで表示を進める。Mac IABではStarting→6%→No progress for 43 s、操作可能world未到達。メモリ不足という画面文言は推測であり原因断定ではない。公開HTML/workerのHTTP200、wasmのCDN redirectとOrigin付きHEADのCORS許可は確認したが、engine全体実行の正常性を保証しない。サイト運営側のworker/engine修正権限はない。

出典: https://fiveplay.lol/?low=1&res=1280x720&fps=30 と、そこから参照される `/b/8b0b5899ed/loader.js`、`wgpu_worker.js`、`io_worker.js`。第三者ソースとゲームassetはrepoへコピーしない。

検証: `node --experimental-strip-types --test tests/fivem-bridge.test.mjs tests/game-launch.test.mjs` (14/14)。拡張backgroundをmock Chrome環境から実HTTP gatewayへ接続し、依頼保存・再送一意性・不正sender/Origin/実行要求拒否を確認。Chrome実動作は別gate。
