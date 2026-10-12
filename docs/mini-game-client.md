# MiniからGTA VIを遊ぶための接続

2026-10-05。利用者はGTA VIについて「出来るようにして」と明示。主担当はGame / Market / Fund、既存AI06の非金融ゲーム接続サブ項目、Mini実機受入はMAT15とJOINT。既存のGTA / FiveM設定は制作物の導入用であり、GTA VIのプレイ、配信、内部状態APIには転用しない。

## 目的と利用体験

本人が実行機器を選び、必要条件を診断して、公式clientから自分の本体へ接続する。GTA VIが利用可能で正規に導入された機器から、映像・音声を受けて通常controllerで遊ぶことを目標にする。Proの購入をMiniの通信・基本ゲームの必須条件にしない。GTA VIの本体実行をMiniの未確定computeへ約束しない。

[公式GTA VI案内](https://www.rockstargames.com/VI)で確認したプラットフォームはPS5とXbox Series X|S。2026-10-05時点でPC版の対応・必要条件を確認できないため、Pro経路は保留。GPUスペックから対応を推定して起動可能にしない。対応資料が更新されたらexact title/version/OSを再確認してコードと試験を更新する。

[PS公式client](https://www.playstation.com/ja-jp/support/games/playstation-remote-play-on-pc-and-mac/)と[Xbox公式Remote Play](https://www.xbox.com/en-US/consoles/remote-play)を入口にする。[Xbox公式案内](https://news.xbox.com/en-us/2025/04/16/xbox-april-update-buy-games-xbx-app-stream-your-own-game-console/)が示す`xbox.com/remoteplay`は所有consoleへの接続であり、GTA VIがcloud catalogやGame Passに含まれることを意味しない。これらの一般機能をGTA VI固有のリモートプレイ合格へ換算しない。

## 今回の実装と責任

- ROCK: `toolkits/mini-game-client`の読取専用診断、固定した公式入口/アプリへの起動、エラー表示。Node.js desktop prototypeで、Mini OSのGame画面/Brokerには未統合。
- EXTERNAL: 正規ゲーム、console firmware、Remote Playの認証、映像codec、controller、切断/アカウント切替。
- JOINT: exact Mini hardware/OSで映像・音・入力・遅延・復旧を受け入れる。host上のアプリ起動成功はMini合格でない。
- OWNER: PS5/Xbox/将来PCの選択、所有本体、正規アカウントでのsign-in、必要なら正規ゲーム導入。今回の指示から購入・契約・本体初期化を代行しない。

初期実装はMacの`/Applications/PS Remote Play.app`を検出し、固定argvで起動する。XboxはMac/Linuxの既定browserへ公式URLを渡す。Windowsの自動起動とLinux上PS公式native clientは未実装。Miniの最終OS、表示decoder、GMS等が未確定のため、Android対応という一般説明だけでMiniの適合を確定しない。

## 入出力・状態・保存

入力はCLIの`check/setup/open`と`ps5/xbox/pro`のみ。自由URL、任意実行file、秘密値、shell文字列を受け付けない。`check`はアプリ/OS openerの有無を読み、外部通信やアプリ起動をしない。`setup/open`だけが本人の明示操作として外部clientへ渡す。

出力はJSON診断。`blocked`、`setup_requested`、`client_handoff_requested`、`handoff_failed`を区別し、常にconsoleConnection/gameRunning/購入権はunknown、Mini実機合格はfalse。アプリの存在やOS起動commandのexit 0を接続成功へ昇格しない。固定基準の確認日を付け、自動的な最新対応確認とは表示しない。

本人認証は公式client側。launcherは永続設定・subscriber情報・ゲームアカウント・pairing code・cookie・セーブを保存しない。既存Wallet/ゲーム交換adapter/商品schemaを新設・変更せず、ゲーム内購入、残高、課金には接続しない。新しいWeb仕事やSky catalog Toolも追加しない。

## 失敗・停止・復旧

アプリ未導入、未対応host、opener欠落、10秒timeout、非zero exitは失敗/不足として返す。child stderrを診断へ複製しない。起動途中の応答不明時に自動再試行しない。本人がclient側の状態を確認し、必要な場合だけ再実行する。launcher終了はclientやconsoleの停止ではない。

映像・入力の処理は公式clientに任せる。本実装は入力を保持/再送/注入しない。ゲームの停止、セーブ、ネットワーク断での休止、再接続後の復帰、ユーザー交代時の前アカウント解除はまだ観測できず、実機試験で確認する。未知の内部状態を独自に推測して成功表示しない。

## 合格条件と次の作業

1. 対象console、MiniのOS/機種、表示、controller、回線を固定する。現在は機器選択の質問中。PS Remote PlayはこのMacの標準Applicationsには未導入。
2. 対応clientを導入して本人が正規sign-in。本体ホームの映像・音・controller入力を確認する。PCでの代用試験とMini実機を別に記録する。
3. 利用可能な正規GTA VIのtitle/versionを固定し、起動、通常操作、音、画質/fps、end-to-end遅延、熱を測る。preorder、他タイトル、ホーム画面をGTA VI合格としない。
4. 回線切断、controller切断、休止、復帰、本人交代で誤入力/古い入力再送/アカウント残留がないか確認する。セーブの継続はゲーム内で照合する。
5. Wi-Fi合格後、Mini内SIM通信で同項目と通信量/遅延変動を受け入れる。Pro/PC/phoneなしのMini通信条件と外部consoleへのゲーム接続を区別する。
6. R5の裸眼空間表示/精密3D入力は別gate。通常の2D映像配信から完全な3D scene/任意視点/全身操作へ変換できるとは扱わない。

検証command: `node --test tests/mini-game-client.test.mjs`、`node toolkits/mini-game-client/cli.mjs check`、`npm run design:check`、`npm run verify`。fixture launcherと実際のCLI診断を区別する。実client起動/console接続/GTA VI/Mini表示は全て未受入。受入結果と環境が揃うまで製品ページへ「GTA VI対応」と表示しない。
