# Mini game client — remote-play handoff prototype

GTA VIをMiniから遊ぶための、公式クライアント起動・不足条件診断の最初の実装です。**ゲーム本体・配信client・Mini OSへの統合・GTA VIプレイの完成ではありません。** 現在はNode.js 22以降のdesktop host用です。

```sh
# 読取りのみ。既定ではブラウザもゲームも開かない
node toolkits/mini-game-client/cli.mjs check
node toolkits/mini-game-client/cli.mjs check ps5
# 選択した機器の公式セットアップページを開く
node toolkits/mini-game-client/cli.mjs setup ps5
# Macの /Applications に導入済みのPS Remote Playを開く
node toolkits/mini-game-client/cli.mjs open ps5
# 自分のXbox本体へ接続する公式ブラウザ入口を開く
node toolkits/mini-game-client/cli.mjs open xbox
```

`setup`/`open`は本人が実行したときだけ起動します。Macは`/usr/bin/open`、Linuxは`/usr/bin/xdg-open`を使用。LinuxのPS公式native client、Windowsの自動起動は未実装で拒否します。Windows/Androidでは診断の公式URLを対応ブラウザで開いて手動準備してください。LinuxでXboxのURLを開けても、そのブラウザ・GPU・controllerがXbox streamingに適合する証明にはなりません。

PS5またはXbox Series X|S、対応client、controller、利用可能な正規ゲーム、回線が必要です。公式clientで本人がサインインし、所有本体を選びます。Web入口からGTA VIを自動起動するAPIは実装していません。`client_handoff_requested`はOSへの起動要求成功だけで、接続・ゲーム実行・購入権は`unknown`のままです。PC版の対応/必要条件を確認できていないため、`open pro`は拒否します。

終了、接続の復旧、ゲーム側アカウント切替は公式client内で行います。このlauncherを閉じてもゲームは停止せず、通信切断でオンラインゲームが一時停止する保証もありません。launcherは入力を捕捉/注入せず、パスワード・pairing code・cookie・セーブを保存しません。失敗時も自動再試行せず、公式clientの状態を先に確認してください。

実機受入は[ゲーム接続設計](../../docs/mini-game-client.md)を使用。テストは`node --test tests/mini-game-client.test.mjs`（rootの`npm run verify`にも含む）。公開サイトには配備していません。
