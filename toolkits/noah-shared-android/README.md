# Noah 端末参加（Android）

Android 11 以降のスマートフォンで、提供者が画面を開いている間、他の利用者の仕事を実行できます。英文の分類に加え、提供者が追加で同意すると、Eveで選んだ出典整形・無料記事作成・CSV整理のAgentが動きます。充電中、非従量かつ検証済みの Wi-Fi または Ethernet、省電力オフ、温度状態が正常で温度の余裕を測定できる端末が対象です。

## 使い方

1. 信頼する配布元の署名済み APK を端末へ転送し、パッケージと署名を確認してインストールします。パッケージ名は `si.avoado.noah.participant` です。
2. [Noah の端末参加画面](https://avoado.si/noah/shared-compute)にログインし、この端末の提供に同意して端末 ID とトークンを発行します。
3. アプリに端末 ID とトークンを入力し、参加時間（5・10・15分）を選びます。Eveの仕事を引き受ける場合は、登録画面とアプリの両方で、他の利用者の公開原稿やCSVを受け取ることに同意します。「端末参加を開始」を押すと仕事を受け取れます。トークンはこのセッションのメモリーに保持します。
4. 「今すぐ停止」、画面から離れる操作、または端末条件の変化で停止します。端末提供の許可を取り消すには、Noah の参加端末一覧でこの端末を停止します。

1セッションは最大30件・アプリ通信本文256 KiBまでです。端末は5秒間隔で仕事を問い合わせます。1仕事の計算待ちは750ミリ秒までです。SIMの通信料や端末電力がサービスの課金額に加算される仕組みはありません。端末側の電力・回線は提供者が負担します。

分類のときは、依頼者のブラウザーが公開英文から数えた4整数（各0～15）か合成サンプルのIDを受け取り、Androidの権限のない隔離プロセスで処理します。

Eveの仕事では、依頼者が提供に同意した公開原稿またはCSV（UTF-8で4 KiBまで）、選んだAgentの順番、無料記事を作る場合は要約・リンク・表示価格などの記事設定を受け取ります。結果は12 KiBまでです。複数工程には同じ端末で前の結果を順番に渡します。記事作成とCSV整理は入力形式が異なるため、それぞれ別の依頼で利用します。

アプリはAPK内のAgent処理のSHA-256を照合し、仕事ごとに専用のAndroid System WebViewレンダラーを用意します。分離レンダラーで動作確認に成功した時にEveの仕事を受け付けます。入力はデータとして受け取り、外部ネットワークやファイルへのアクセスを遮断して、結果を返すとレンダラーを閉じます。端末ID・トークンは参加画面のプロセスで扱います。

## APKをビルドする

JDK 17、Android SDK Platform 35、Build Tools 35.0.0、zip を用意して `JAVA_HOME` と `ANDROID_HOME` を設定します。リポジトリのルートで実行します。

```sh
bash toolkits/noah-shared-android/build.sh /tmp/Noah-Participant-unsigned.apk
```

ローカル検証用に既存の Android アプリ開発キーで署名する例です。パスワードはコマンドの入力待ちで指定します。

```sh
"$ANDROID_HOME/build-tools/35.0.0/apksigner" sign --ks /path/to/developer-test.jks --out /tmp/Noah-Participant-test.apk /tmp/Noah-Participant-unsigned.apk
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose --print-certs /tmp/Noah-Participant-test.apk
```

## 専用エミュレーターでの試験

同じテストキーで試験 APK を署名し、対象エミュレーターのシリアルを指定します。

```sh
bash toolkits/noah-shared-android/build.sh /tmp/Noah-Participant-smoke-unsigned.apk --instrumentation
"$ANDROID_HOME/build-tools/35.0.0/apksigner" sign --ks /path/to/developer-test.jks --out /tmp/Noah-Participant-smoke.apk /tmp/Noah-Participant-smoke-unsigned.apk
adb -s emulator-5650 install -r /tmp/Noah-Participant-test.apk
adb -s emulator-5650 install -r /tmp/Noah-Participant-smoke.apk
adb -s emulator-5650 shell dumpsys battery unplug
adb -s emulator-5650 shell am instrument -w si.avoado.noah.participant.test/.Smoke
adb -s emulator-5650 shell dumpsys battery reset
```

試験は初期状態の不参加、Eveの追加同意、給電がない場合の参加拒否、画面キャプチャの抑止、画面を離れたときのトークン消去を確認します。分類の隔離プロセスを検証し、専用WebViewではCSVの複数工程、出典を整えて無料記事を作る工程、未登録のAgentや範囲外の入力の拒否を試します。
