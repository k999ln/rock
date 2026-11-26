# Noah 端末参加（Android）

Android 11 以降のスマートフォンで、本人が画面を開いている間だけ他の利用者の公開英文や4種類の合成サンプルを分類します。公開英文の4種類の単語数は、依頼者のブラウザーが数えます。充電中、非従量かつ検証済みの Wi-Fi または Ethernet、省電力オフ、温度状態が正常で温度の余裕を測定できる端末が対象です。

## 使い方

1. 信頼する配布元の署名済み APK を端末へ転送し、パッケージと署名を確認してインストールします。パッケージ名は `si.avoado.noah.participant` です。
2. [Noah の端末参加画面](https://avoado.si/noah/shared-compute)にログインし、この端末の提供に同意して端末 ID とトークンを発行します。
3. アプリに端末 ID とトークンを入力し、参加時間（5・10・15分）を選び、同意欄を確認して「端末参加を開始」を押します。トークンはこのセッションのメモリーに保持します。
4. 「今すぐ停止」、画面から離れる操作、または端末条件の変化で停止します。端末提供の許可を取り消すには、Noah の参加端末一覧でこの端末を停止します。

1セッションは最大30件・アプリ通信本文256 KiBまでです。端末は5秒間隔で仕事を問い合わせます。1仕事の計算待ちは750ミリ秒までです。SIMの通信料や端末電力がサービスの課金額に加算される仕組みはありません。端末側の電力・回線は提供者が負担します。

アプリはモデルの版とハッシュを照合し、公開英文から数えた4整数（各0～15）または合成サンプルの ID を受け取ります。1件ごとに権限のない Android 隔離プロセスを割り当てます。そこに渡すのは検証済みの分類入力と結果返信用 Binder だけです。公開英文の原文は端末に届きません。モデルは APK 内の固定資産で、処理結果を返して終了します。端末トークンや会話履歴は保存しません。

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

試験は初期状態の不参加、同意の必要性、給電がない場合の参加拒否、画面キャプチャの抑止、画面を離れたときのトークン消去、実際の隔離プロセスでの全サンプルと公開英文の単語数の分類結果、および不正な形式や範囲外の値の拒否を確認します。公開署名とストア配信はこのビルド手順の対象外です。
