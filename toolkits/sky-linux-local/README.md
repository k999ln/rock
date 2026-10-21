## SkyからEveへ依頼する（2026-10-21・Pixel本人用）

現在の本人用候補は、Skyで担当とLLMを選び、「Eveでこの担当に依頼する」からEveへ進みます。Eveで依頼と端末内保存に同意して一回実行し、同じ仕事IDで進捗・下書き・使用額・停止・文章保存を扱います。SkyとEveで仕事を複製しません。本人Pixelで実推論→Android標準pickerで保存→再表示まで受入済みです。旧19件を保持し、一件だけ追加しました。内容の本人検収は別です。

新native接続はAVF専用tap上の相互TLSです。Androidはtapの私有IPv4だけで5198を待ち受け、Linux側から接続します。tap/gatewayのアドレスは検出し、物理LANや0.0.0.0へ公開しません。Android Keystore内の専用鍵とLinux内のprivate鍵は持ち出さず、公開証明書のSHAを相互に固定します。旧Terminalの5199転送をOFFにして実機で確認しました。旧ブラウザ経路だけは従来の5199転送を使います。Terminal自体の転送不調の根本原因を修正したとは扱いません。

初回ペアリングは開発者の本人端末向け手順です。`npm run sky:linux:pixel:build`の配布manifestは11ファイル。既存ジョブを読めない場合や動作中は`update-pixel.py`が更新を拒否します。Android側の変更は`android-eve-bridge.patch`、Linux側は`android-bridge.py`と`install-android-bridge.py`。installerにはAndroidの公開証明書とその正確なSHAを渡し、返されたLinuxの公開証明書のSHAを本人アプリのprivate pairing設定へ登録します。再ペアリングには以前のserver SHAも必要です。秘密鍵をDownload、Git、チャットへコピーしません。一般利用者向けの登録・鍵交代・失効UIは未実装です。

切断時は最後の記録と入力を残し、同じrequest IDの結果を再照会します。通信失敗だけで別の仕事へ再送しません。既存Linuxの自動serviceとTLS再接続を使い、通常利用でTerminal入力は不要です。端末再起動・全損復元、Cloud/Webアカウント同期、全OS・全端末対応・本番請求は別の受入です。証拠は[実機記録](../../docs/evidence/sky-pixel-linux-entry.json#skyLinuxEveDevelopment20261021)。

### 開発者の検証

Androidは既存stageへpatchを適用し、同じ署名で`:shell:assembleDebug :shell:assembleDebugAndroidTest :shell:testDebugUnitTest :shell:lintDebug`を実行します。`owner-tests/dev/rock/shell/PixelSkyEveAcceptanceTest.java`は本人接続・解除済みPixelだけで明示実行するfixtureで、通常CIから推論を起動しません。`skyHandoffEveInferenceSaveAndReopen`には`request`（`[RockstarOS 接続試験]`で始まる合成依頼）と、事前照合済み`cacheShaVerified`を渡します。仕事IDが記録された後の失敗で全試験を再送せず、同じ仕事の残工程を確認してください。保存したUUID付き文章は本人の成果として残します。`recoverSameEveJobAfterVmRestart`は元job ID・成果SHA・boot ID・件数を引数にし、新しい仕事を作らず復旧を検証します。試験用USB転送と一時画面点灯は終了後に戻します。

## 別のAI・担当を追加する（Pixel本人用）

**本人のPixelで、別のAIの追加・準備・実依頼・成果保存・途中停止まで確認しました。** 起動時のTerminal入力は不要です。保存した文章はSkyとLinuxを終了しても読めます。一般公開は保留です。

「担当・実行の設定」で使うAIを選び、配布元・容量・利用条件を確認して追加します。「選んだAIを準備する」を押すと、必要な実行機能とAIを用意します。取得中は進んだ容量を表示し、「準備を停止する」で中断できます。既にあるAIは確認して再利用します。

別のAIは「配布ページのリンクからAIを追加」でHugging FaceのFilesにあるGGUFファイルのリンクを貼れます。文章形式を配布元の案内に合わせ、名前・容量・利用条件を確認して追加します。確認だけではAI本体を取得しません。設定ファイルを使う場合は「別のAIを設定ファイルから追加」、担当は「担当を設定ファイルから追加」で読み込み、表示内容を確認して追加できます。例は `examples/light-text-model.json` と `examples/planning-agent.json`。担当の使うAIを先に追加してください。「選んだ担当の設定を保存」で役割も持ち出せます。

Skyで担当を選ぶと、その担当が使うAIを準備する案内が出ます。準備してからEveへ進み、料金と保存にチェックし、依頼します。成果は下書きとして確認し、通常の文章で保存できます。仕事やAIを止めても担当と成果は残ります。

取得前の画面に、使うAIの名前・文章を作る目的・初回容量・配布元/条件・通信・内部保存と再利用を表示します。必要なAI本体と起動用ファイルはPixel内LinuxのSky専用領域に保管します。同じAIは確認して再利用します。「ダウンロード」には、自分で保存先を選んだ文章や担当設定を保存します。開発者の導入・確認用ファイルを日常利用で扱う必要はありません。

初回のAI取得には通信が必要です。依頼はPixel内で処理し、クラウドへ送りません。現在は対応する文章用GGUFと決められた実行機能を使います。すべてのAI形式、作者のプログラムやアプリ操作には未対応です。メモリ不足や使えない設定は理由を表示して止めます。一般公開や有料契約は始めません。

従来の固定モデルだけの実機記録と今回の受入は分け、今回の記録は `docs/evidence/sky-multi-model-pixel.json` に残します。以下は従来経路の履歴と復旧手順です。

# Skyを自分のLinuxで使う

本人用の文章作成機能です。今回の実行先はPixel本体の既存Terminal Linuxです。モデルと担当を追加し、端末内の実モデルで依頼を処理します。PC専用VMの先行経路も残します。一般公開・課金・任意コード実行は行いません。

## PixelのSkyアプリから使う

導入済みPixelでは、Skyタブの「このPixelで依頼する」を開きます。

1. Skyで担当を選びます。停止中ならAIを準備する操作を押します。初回は準備通知を許可します。Linuxの起動画面が開きますが入力は不要です。「Skyにつながりました」の通知を押すとSkyへ戻ります。Androidの画面切り替え制限を守るための操作です。依頼は次のEve画面へ書きます。
2. 起動後にSkyで担当を選び、Eveへ進んで今回の依頼を書きます。料金と端末内保存を確認して「この担当に依頼する」。「担当・実行の設定」→「自分の担当を追加する」から追加できます。
3. 成果は下書きです。読んで確認し、「成果を文章で保存」でAndroidの保存先を選びます。保存した文章はSkyなしで読めます。「内容を確認した」は別の操作です。
以前の仕事は短い一覧から開き、文章の全文と保存を確認できます。

4. 途中でやめるときは「この仕事を停止する」。計算を使わないときは「AIを停止する（成果は残す）」。画面を閉じるだけでは計算の停止になりません。

接続できない場合は「接続できないときの設定」からSkyのアプリ設定を開き、Network権限を確認します。端末内の接続にも必要です。依頼をクラウドへ送る機能ではありません。

旧5199接続の履歴: NetworkとTerminalの「設定 → ポートの管理」で5199が許可済みでも接続できない場合があります。2026-10-21の本人用Pixelでは、実行中の仕事がないことを確認してTerminal本体を再起動すると復帰しました。結果不明の依頼を新しい仕事として送り直さず、同じ仕事の状態を先に確認してください。アプリデータを消す必要はありません。この復旧は転送不調への当面の手順で、恒久修正は調査中です。[旧候補の実機再検証](../../docs/evidence/sky-pixel-linux-entry.json#connectedRecheck20261021)に対象APKと保存確認を記録しています。現行native候補は上記の相互TLS経路を使います。

開発者の初回導入だけ、既存Linuxに`install-startup.py`で固定サービスを登録し、固定runtime archiveをSHA照合して`~/sky-private/distribution`へ保存します。導入後はDownload内の転送用コピーを回収でき、日々の起動/準備はそのコピーに依存しません。以後の本人操作はSkyからです。設定4GB、端末内ポート5199、固定版配布物を使います。スリープ防止は試験時間だけ設定します。常時稼働や電池消費は未受入。元のAPKの保存、同じ署名での更新、元の文章と選択先の読戻しを別々に確認します。新入口の証拠は`docs/evidence/sky-pixel-linux-entry.json`、旧ブラウザ経路は既存証拠に保持します。

## PC専用VMの先行経路を使う場合の準備

- 現在の管理側はApple Silicon Mac、Lima 2.2以降、Node 22.13以降。
- 使うLinuxは専用Lima `sky-private`（Debian aarch64、2 CPU / RAM 4 GiB / disk 16 GiB、host mountなし）。既存colima/OS試験VMは変更しません。
- 最初の対応modelは、本人PCの既存Ollama cacheにあるQwen2.5 1.5B（約1 GB）の固定GGUF。`runtime-lock.json`のSHAとbytesが一致するものだけです。PC版ではこの従来経路を維持します。新しいモデルの取得・設定ファイルの追加はPixel内Linuxで行います。
- 初回はDebian、固定版llama.cpp、Debianのlibgomp1を取得します。無料配布物で、有料クラウドや後払い契約は作りません。

## 画面から使う

1. repositoryで `npm run dev -- --port 5198`。
2. `http://localhost:5198/sky/add/linux`を開く。Skyトップの開発用入口からも進めます。
3. 配布元・利用条件を確認して「このモデルを追加」。
4. 「Linuxの環境を準備する」。モデル本体/実行ファイルの照合と実起動が通ると「使えます」。
5. 担当名と役割を書いて「この担当を追加する」。外部アプリ操作の権限は付きません。
6. 依頼を書き、実行先・料金・保存を確認して実行。実推論後は「成果の確認待ち」。
7. 「成果を文章で保存」。詳しい記録から担当/仕事/元依頼/モデル版のJSONも保存できます。Skyなしで文章を読めます。内容が正しいかの確認は別操作です。
8. 実行中は「この仕事を停止する」。停止要求だけを停止済みとせず、Linux processを照合します。停止未確認なら次の依頼を止めます。
9. 「Linuxを停止する（成果は残す）」で専用VMを止められます。保存済み成果は残り、持ち出せます。再開は「Linuxの環境を準備する」。

## 料金と保存

Cloud token使用量/Cloud使用料/自作担当代は0。CPU/メモリ/保存は本人の機器を使い、電気代・機器代は未計測。基本月額・Cloud GPU待機/保存単価などは未確定です。モデルの利用条件と商用の管理サービス契約は別です。

管理側はGit外`work/sky-linux-private/`に、OS本人UIDで区切った仕事/役割/成果をprivate modeで保存。Linux側は`~/sky-private`にmodel/runtimeと仕事記録を保存します。推論の一時promptは終了後削除します。仕事100件/担当32件の上限があり、削除GUI・全損backupは未対応です。手動整理は先に成果と記録を回収し、Skyを終了して専用VMを止めてから、本人用のこのdirectoryだけを対象にしてください。

Skyを正常終了すると実行中の仕事を停止します。強制終了後は次の起動で同じ仕事を自動再実行せず、Linux側の停止を確認します。停止できない場合は専用VMの停止を先に行い、成果の再生成は新しい依頼として明示してください。

## 検証

`node --experimental-strip-types --test tests/sky-linux-local.test.mjs tests/sky-app-foundation.test.mjs`

`npm run typecheck` / `npm run lint:product` / `npm run design:check` / `npm run verify`

受入証拠は`docs/evidence/sky-private-linux-deployment.json`。hostの合成試験、Linuxの実推論、Web/Pixel/Cloud/full OSは別の段階です。固定modelの文章担当から、任意model/作者code/コンテナを一般実行できるとは扱いません。`avoado.si`は総合/Sky入口、`avocadomini.si`と`avocadopro.si`は製品案内。本人用のこの経路はlocalhost専用です。

## Pixelからの本人用試験

### Pixel本体のLinuxで動かす（今回の実行先）

本人の追加指定により、画面、仕事の管理、モデルの計算、保存をPixelの既存Terminal内Linuxへ置きます。モデル用にTerminalの詳細設定でLinuxメモリ4GBを使用します（実測約3.8GiB）。2GiB未満は準備を拒否します。PC内Linuxでの試験とは別に受け入れます。同一Pixelでモデル追加、3担当作成、実依頼、料金表示、実Download保存、実行中モデルの停止、Sky終了後の文章読戻しまで受入済みです。実行はQwen2.5 1.5Bの文章だけです。最初の下書きはSIを人間の採用と混同し、依頼を具体化した短い文章を保存しました。下書きを本人確認済みにはしていません。

1. PCで `npm run sky:linux:pixel:build` を実行します。Git外の `work/sky-linux-pixel-package/` に画面と管理機能を作ります。
2. 固定版の `node.tar.xz`、`runtime.tar.gz`、`model.gguf` と配布物を、PixelのDownload内 `sky-pixel-linux` へ一時配置します。Node/runtime/modelの版、サイズとSHAは各lockファイルに固定されています。初回導入と`install-startup.py`後に内部保存先・既存モデルのSHA・通常起動を確認して、開発側の転送用コピーを片付けます。
3. PixelのTerminalで `python3 /mnt/shared/Download/sky-pixel-linux/bootstrap.py` を実行します。共有先は実機のmountを確認してから使います。本人homeの `~/sky-private` へ配置し、NodeでSkyの画面を起動します。ブラウザを直接使う旧経路では再起動後も同じ操作で再開します。Skyアプリ用の初回サービス登録後は、Skyの起動ボタンを使います。Linuxのboot IDが変わった場合は環境準備をやり直すまで依頼を止めます。動いている画面を無断で更新しません。
4. ブラウザへ移っても動くよう、Terminalの詳細設定で「スリープモードにしない」を試す時間だけ選びます（今回30分、無期限ではありません）。Terminalのポート転送設定で5199を端末内だけに転送し、Pixelのブラウザで `http://127.0.0.1:5199/` を開きます。外部公開する設定は使いません。実PixelでAndroid側の待受が127.0.0.1と::1だけであることを確認しました。Terminal内の「今すぐ再起動」で接続が復帰しない場合は、仕事を終えて成果を保存し、Terminalアプリを終了してから通常の入口で開き直してください。アプリのデータ消去は行いません。
5. モデル追加→環境準備→担当追加→料金と保存の確認→依頼→成果保存→仕事の停止を画面から操作します。環境準備では署名済みOSを変更せず、Linux内に固定runtime/modelを配置します。libgomp1がなければLinux内のaptで導入します。
6. 「AIの実行を停止する（成果は残す）」で仕事の新規実行を止め、起動済みの自分のAIプロセスの停止を照合します。Linux自体や画面は終了しません。再開は「Linuxの環境を準備する」です。
7. 画面ごと終了する場合は、Terminalで `kill -TERM $(cat ~/sky-private/server.pid)` を使います。実行中の仕事も停止して終了します。保存した文章はSkyを止めた後も通常のファイルとして読めます。Terminalアプリの終了やAndroidの省電力でLinuxが止まる場合があり、常時稼働は保証しません。今回の終了確認ではTerminalごと終了し、同じ703byteの実Downloadを読戻しました。

Linux内の `~/sky-private/state` が仕事と担当の保存先です。共有Downloadには配布物だけを置き、依頼や成果を自動で書き出しません。文章の持出しは本人が画面で選びます。OSの本人UIDによる単一利用者向け試作で、Linuxの同一UIDで動く別プログラムからの隔離や、通信権限をOSで封じた汎用sandboxの受入ではありません。任意コード・作者コンテナ・他モデルの導入は未対応です。モデルの出力には端末操作や外部送信の権限を与えません。

### Pixelの画面からPCのLinuxを動かす（先行試験）

操作端末がPixelで、計算先がPCのLinuxの場合は、管理PCを`SKY_LINUX_PRIVATE_PREVIEW=1 npm run dev -- --port 5198`で127.0.0.1だけに待ち受けさせ、本人USB接続で`adb reverse tcp:5198 tcp:5198`を設定します。PixelのVanadiumで`http://127.0.0.1:5198/sky/add/linux`を開けます。端末内Linuxで計算した証拠とは別です。試験終了時に`adb reverse --remove tcp:5198`でこの転送だけを解除できます。端末を使っている本人と画面操作が競合する場合は操作を止めます。


実機確認の運用: 現行更新はmanifestの固定11ファイルと更新処理だけを転送し、AI本体やNode/runtime archiveを再転送しません。確認後に一時転送folderを回収します。fixtureの一時配置は呼出側のfinallyで回収してください。本人が保存した成果や担当設定を自動削除しません。
