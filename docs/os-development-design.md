# Rock star OS — 自動化OS 開発設計書

現行要望は [製品ベース](product-baseline.md)を優先。本書は2026-09-05のAndroid/AOSP設計履歴。nativeはLinux/QEMU・BlackBerry優先でHub/Wallet試作がある。[差分監査](progress-audit-20260909.md)を読み、PC/cloud補助扱い、Pixel優先、SDK/Wallet未実装を製品全体へ適用しない。

設計日: 2026-09-05。版: 0.1。状態: 開発着手用の設計案。OS本体・SDK・ストア・実機対応はいずれも未実装/未検証。

実装追記: 利用者の「考えて組んでみて」を受け、[P1実装・検証手順](os-prototype.md)に対応するコードを追加した。本書は到達先の基本設計案であり、すべてが詳細設計/実装済みではない。現時点の実装範囲はP1を優先する。Java共通コア、32 KiB文字列AIDL、固定自社2操作、標準JobSchedulerが最初の具体化で、第三者SDK/専用隔離/OS起動は引き続き未完成。

## 設計の基点

利用者の新しい優先方針は「OS開発を主軸に、Pixelなどで試作し、自社・第三者の自動化ツールを導入して自動で動かすこと」。既存Webサイトの再公開より、このOS設計を先に進める。

事業の核は、ツールを集めるだけでなく、利用者が仕事を任せ、継続実行の状況・成果物・費用を確認できること。ファンド・利用料・分配試算は保持し、OSの中核権限や実行許可から分離する。

本書ではAOSPベースのOSディストリビューションを提案し、既存Android上のAPK/PWAだけをOS完成とは扱わない。今回は設計書の作成であり、端末購入・初期化・bootloader解除・OS書込・公開・既存branch統合は行わない。

## 1. 製品の定義と優先順位

**Rock star OSは、「どのアプリを開くか」ではなく「何を任せるか」を中心にした、自動化ツールの実行・配布OSとする。**

利用者はストアから自社/第三者ツールを選び、対象データ・実行条件・費用上限・確認が必要な操作を一度設定する。以後、OSが条件成立を検知して実行し、成果物を保存し、確認待ちと異常だけを通知する。画面を開き続けたり、工程ごとにコピーしてボタンを押すことを通常運用の前提にしない。

優先順位は、①安全に自動で仕事が進むこと、②停止・復旧・結果確認、③第三者がツールを供給できること、④ファンド/費用/還元の拡張。外観だけのOS風ランチャーや、購入画面だけのストアを先に完成扱いしない。

| 用語 | 本書での意味 |
| --- | --- |
| Tool | 単一の機能。例: 出典整理。権限・入出力・実行上限を宣言する |
| Recipe | 固定版のToolと入出力の接続・順序・確認点を記述するワークフロー |
| Automation | Recipeに利用者の対象フォルダ・スケジュール・許可・予算を結び付けた常設設定 |
| Work | 「この記事の販売準備」等の業務単位。既存work_jobsに相当 |
| Run / Attempt | Work内の1工程の論理実行 / その再試行。配信側jobsの概念はこちらへ整理する |
| Fund | ツール/仕事群の支援・配分・費用・分配試算。実行権限を買う仕組みではない |

初期ユーザーは開発用端末を用意できる本人と少人数の協力者。第三者開発者はSDKとサンプルだけでToolを実装・提出できることを目指す。初期端末はWi-Fi接続の専用検証機で、日常の電話・銀行・認証アプリ端末の置換は完成条件に含めない。

## 2. 元の設計をどう読み解いたか

### 2.1 要求の追跡

| ID | 根拠 | 読み取った目的 | OSでの責務・変更 |
| --- | --- | --- | --- |
| Q01 | [初期仕様](product.md)「複数ジャンル」「登録負担を減らす」 | 導入・環境構築を利用者へ押し付けない | Store、互換判定、初回セットアップ、ローカル利用はアカウント不要 |
| Q02 | [仕事設計](../project.md)、lib/workflow.ts | 手順を守って結果を確認し、後から再開する | 永続キュー、Work/Run分離、成果物の自動引き渡し、確認Inbox |
| Q03 | [MCP設計](fund-and-mcp.md)、lib/device.ts | ツールを共通契約で実行し、端末内で処理する | Tool API、端末ランタイム、認証したPCブリッジ。MCPは接続方式であってOSではない |
| Q04 | [参照元の採用判断](reference-repositories.md) | 自社だけでなく外部の知見・ツールを取り込む | バージョン/ライセンス固定、作者署名、SDK、審査、失効。GitHub検索結果を自動実行しない |
| Q05 | [ファンド設計](fund-and-mcp.md) | 自動化を共同で支え、費用と還元を見えるようにする | 業務・資源・会計を別レイヤーで記録。既存試算式を維持する |
| Q06 | [実装境界](architecture.md)、既存vendor | 原稿・秘密情報を不用意に外部へ送らない | 利用者が指定した入力だけ、暗号化された端末成果物庫、送信先ごとの許可 |
| Q07 | 配信側 docs/backend-design.md | 単発実行の重複防止、端末確認、停止設定、手入力収支 | OS実行コーディネーター、実行lease、停止スイッチ、分離した照合前台帳 |
| Q08 | 今回の利用者指示 | 自動化をOSの主機能にする | 起動後・画面OFF・条件成立時の自律実行、OSイメージと更新系を開発する |
| Q09 | 今回の利用者指示「app storeみたく」 | 他の開発者が供給し、利用者が選んで導入できる | 掲載→入手→互換/署名検証→許可→導入→更新→停止→削除まで用意する |

配信側の根拠は `c6942d5ef72e9dd16345b9363e68e0e18ca25079` の設計/README。ローカルmainの実装と混同しない。[分岐記録](deployment-integration.md)の2系統は、この設計を作るために読み比べただけで統合していない。

### 2.2 維持するもの、変えるもの

- 維持: ツールを束ねる事業、ファンド参加・配分・ブーストの試算、月最大8.88 USD相当という既存利用料案、失敗/サンプルを実績へ混ぜないこと、本人の最終確認、履歴・権利・秘密情報の保護。
- 変更: 手動クリック中心から事前許可した条件実行へ、タブ内だけの原稿から選択した成果物の端末保存へ、固定4ツールから審査された第三者パッケージへ、Web中心からOS中心へ。
- 変更しない未決事項: 実売上の取得方法、徴収・分配の提供主体、ストア手数料、開発者への支払率。OS化を理由に新しい料率・投資受付・自動課金を決めない。
- 旧「会員登録不要」はローカル作業・閲覧に引き継ぐ。同期、外部アカウント、作者としての配布など、識別が必要な箇所だけ別途登録する。

現在のファンド試算は共通収益から共通運用費を回収した後、ファンドの月合計に上限利用料を1回適用するモデル。Tool数・端末数を増やすごとに8.88 USDを重ねて徴収する設計へ変更しない。旧個人費用試算は別モデルのまま保持する。Store上の有料Toolを将来扱う場合は、追加費用と既存利用料の関係を別途明示する。

これは方向性の変更ではなく、同じ自動化ハブを成立させる基盤の変更。ただし、自動実行・永続成果物・第三者コードは新しい安全設計を要するため、旧Web版の検証をそのままOSの証拠にはしない。

## 3. OSの方式

### 3.1 採用案: AOSPベースのディストリビューション

Androidのkernel/HAL/ドライバ・アプリ隔離・電源管理・パッケージ管理を土台に、Rock starのシェル、実行サービス、権限仲介、ストア、更新クライアントを組み込む。独自kernelや電話モデムをゼロから作る計画にはしない。AOSPのdevice対応とBSP（機種固有のkernel/vendor/HAL等）が成立する組み合わせを固定する。

| 方式 | 用途 | 判断 |
| --- | --- | --- |
| 純正AndroidにAPKを入れる | 入力UI、SDK、ツール処理の早期試験 | 補助トラック。root不要。これだけではOS完成ではない |
| 自前ビルドのAOSP + Cuttlefish | OSサービス、権限、復旧、スケジューラーの主開発 | 最初のOS縦断試作 |
| 対応BSPを持つAOSP派生 + Pixel | 実電池・画面OFF・再起動・OTA・デバイス権限の試験 | 実機Alpha。BSP入手/利用条件を通過後に着手 |
| Linuxを一からPixelへ移植 | 別kernel/HAL/電話機能の開発 | 初期不採用。自動化の価値検証を遅らせる |

OS実装として作る差分は、product構成/固定manifest、Rock Shellのホーム統合、専用UIDのAutomation/Brokerサービス、起動・unlock・電源状態との接続、署名permission/privapp allowlistとSELinux policy、プロセス資源制御、OTA生成/適用経路。APK画面だけでなく、これらを含むイメージをbuildして起動する。AOSPへのpatchは小さく分離し、対象tagへの再適用と上流更新への追従を試験する。

CuttlefishはAndroidプラットフォーム開発用の仮想デバイスであり、HAL等のハード固有差分がある。仮想環境での成功を実機の省電力や周辺機能の合格にはしない。[AOSP Cuttlefish](https://source.android.com/docs/devices/cuttlefish)

### 3.2 「自動で動く」の実現範囲

標準AndroidのWorkManagerは繰り返し最短間隔が15分で、制約やOS最適化により実時刻が変わる。Foreground Serviceにも種類・対象OS条件による起動/実行時間の制約がある。したがって、開発者モードや通知付きServiceだけで24時間無制限稼働を約束しない。[Work requests](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work)、[Foreground service timeouts](https://developer.android.com/develop/background-work/services/fgs/timeout)

OS版では、OSが管理する永続スケジューラーが起動を判断し、必要な期間だけツールを動かす。常時CPUを使うことは自動化の条件ではない。Dozeや熱制御を全体で無効化せず、充電中・許可時間帯などの実行枠を組み込む。特権サービス化しただけで制約が解消したとせず、PowerManager/JobScheduler/ActivityManagerとの接続と画面OFF試験を完成条件にする。

## 4. ハードウェアと開発環境

### 4.1 最初の対象

Pixel 8a / Pixel 9を候補とし、**OEM unlockingが実際に利用できる個体を1機種・1構成に絞る**。価格や入手先を調査して購入を決めたわけではない。既に使えるPixelがあれば、その適合性を先に確認する。Pixelというブランド名だけでは解除可否や独自OS対応を保証しない。

Pixel 8以降のGoogle標準ソフトウェアは発売時から7年の更新対象だが、その保証がRock starの改変OSへ自動的に引き継がれるわけではない。Rock star側で上流追従と端末固有の更新を検証する必要がある。[Pixel更新期間](https://support.google.com/pixelphone/answer/4457705?hl=en)

重要な区別:

1. 開発者向けオプション: 設定を表示する段階。
2. USB debugging/ADB: APKやログを扱う開発用接続。
3. OEM unlocking: bootloader解除を許可できるかという条件。
4. bootloader解除: 独自イメージを書ける状態への変更。初期化を伴う。
5. 適合する独自OSの署名・書込・起動・復旧: 別途成立させる開発作業。

Android Flash Toolは既成ビルドを扱う入口で、自前AOSP変更の書込はFastbootの公式手順を使う。販売元等によりOEM unlockingが使えない場合もある。[Android Flash Tool](https://source.android.com/docs/setup/test/flash)、[Fastboot](https://source.android.com/docs/setup/test/running)

### 4.2 実機着手ゲート G0

次の記録をそろえるまで、購入推奨の確定や書込手順の実行へ進まない。

| 確認 | 必要な記録/合格条件 |
| --- | --- |
| 所有/用途 | 利用者の検証機。実データなし、本人のバックアップ・初期化同意 |
| 型番/状態 | 正確な型番、販売区分、codename、現在のbuild/SPL、解除可否。serial/IMEIは公開Gitへ入れない |
| ソース | 選ぶAOSP/派生元のtag/commit、device tree、kernel、vendor、HAL、ビルド手順がそろう |
| 権利 | OS部品とvendor binaryの使用/再配布条件を確認。公式factory imageを自社配布物として流用しない |
| 適合 | firmwareとvendor interface、partition構成、AVB鍵対応、rollback indexが一致する |
| 復旧 | 対応する公式復旧物、取得元とハッシュ、戻せる経路、USB接続、担当者を確保 |
| 更新 | 対応する署名/OTA生成経路と新旧2版の互換設計を用意。実動作はA1で検証。古い脆弱版へのdowngradeを前提にしない |

調査したGoogleのDriver BinariesページにはPixel 8a/9のAndroid 15向け項目がある一方、今回のページ内検索ではAndroid 16向け項目を確認できなかった。**最新AndroidのAOSPを取得するだけでPixelへ載るとは判断できない。** 対応する派生OSのdevice構成を採る場合も、採用元・保守状況・ライセンスを追加調査し、単に古いAndroidへ戻して解決しない。[Driver Binaries](https://developers.google.com/android/drivers)

解除やfactory imageの適用はデータを失う操作で、anti-rollbackにも機種別の注意事項がある。再ロックは独自鍵の信頼チェーンと全パーティションの整合を確認してから扱い、「書込後はとりあえずlock」とはしない。[Bootloader locking/unlocking](https://source.android.com/docs/core/architecture/bootloader/locking_unlocking)、[Factory Images](https://developers.google.com/android/images)

### 4.3 ビルド環境

OSビルドの主環境はLinux x86-64。AOSP公式要件は空き400 GB以上・RAM64 GB以上で、現行OS開発のmacOSホストは非対応とされる。見積もりとしてはcache/複数build/OTAを考慮し、専用SSDにより多い余裕を持たせる。クラウドVMや機材の契約は今回行わない。[AOSP開発要件](https://source.android.com/docs/setup/start/requirements)

現在のMac/ggは設計・Web・PCツールの正本として維持し、AOSP全体をこのGitへ格納しない。Linux上の別checkoutで`repo` manifestから取得する。外付けSSDのAppleDouble誤読は既に発生しているため、OSの作業ツリーはLinux側の大文字小文字を区別するファイルシステムを提案する。Cuttlefish用の仮想化/KVM可否も環境受入時に確認する。

## 5. OSの構成と信頼境界

```text
利用者
  └─ Rock Shell（ホーム / 仕事 / ストア / 確認Inbox / 停止 / 費用）
       └─ Automation Manager（Work、Recipe、予定、結果。Toolコードを実行しない）
            └─ Policy Broker（権限・対象データ・予算・承認・実行lease）
                 ├─ Runner Controller ─ ツールAのUID / ツールBのUID
                 ├─ Artifact Broker ─ 利用者別の成果物庫
                 ├─ Connector Broker ─ 許可済みの外部API
                 └─ Device Broker ─ 明示的に接続したPC
    AOSP: PackageManager / Keystore / Power・Thermal / SELinux / OTA・AVB

外部のStore/更新サーバー → 署名済み配布物 → 端末で検証 → 導入
任意のクラウド同期     ↔ 所有者を認証した限定API（OSの起動には不要）
```

| コンポーネント | 主な実装案 | 禁止する責務/権限 |
| --- | --- | --- |
| Rock Shell | Kotlin/Composeのランチャーと設定UI | ストアの紹介文やWebViewへ特権APIを直接公開しない |
| Automation Manager | Kotlin、端末SQLite、バージョン付きイベント | LLM出力をそのまま実行指示にしない。支払処理を持たない |
| Policy/Runner Controller | OS組込サービス、専用UID/SELinux domain、狭いBinder API | 第三者コードをsystem_serverへloadしない。root shellを公開しない |
| Tool Runtime | 最初は署名APK内のToolService、1ツールパッケージ1UID | shared UID、platform署名、直接の権限継承を禁止 |
| Artifact Broker | 端末内の成果物/暗号化鍵管理、限定FD/URI | 任意pathや他の仕事の本文を渡さない |
| Store/Package Manager | カタログ検証・配布物検証とAndroid PackageInstaller連携 | ストア側がOS署名鍵や利用者の外部アカウント秘密を持たない |
| Connector Broker | 操作型のAPIアダプター、宛先制限、資格情報の代理使用 | 生トークンをToolやLLMへ返さない |
| Fund/Accounting UI | 既存試算と手入力記録を別表示 | 実行完了を入金や分配確定と見なさない |

AndroidのUID分離を基礎にし、SELinux enforcingを維持する。Storeに載ったことや署名があることだけで安全なコードと認定しない。OSの特権追加箇所を小さく保ち、Binderの呼出UID・パッケージ署名・利用者・runIdを毎回照合する。[Application Sandbox](https://source.android.com/docs/security/app-sandbox)、[SELinux](https://source.android.com/docs/security/features/selinux)

## 6. 自律実行の設計

### 6.1 利用者の標準フロー

1. StoreでTool/Recipeを選ぶ。対応端末、作者、バージョン、権限、通信先、料金、停止方法を見る。
2. 入力フォルダ・出力先と、例えば「充電中・Wi-Fi・毎晩」の条件を設定する。
3. OSが実行計画を表示する。何を読むか、何を作るか、何が外へ出るか、どこで止まるかを確認する。
4. 一度だけ試運転し、合格後に自動実行を有効化する。インストール直後に勝手に常設実行しない。
5. 条件成立時にWorkとRunを作り、結果を次工程へ型付きで渡す。サンプル/失敗/確認要は通過させない。
6. 最終成果物をInboxへ入れ、本人確認後にWorkを完了する。初期版の外部投稿・応募・送信はここから利用者が行う。

「自動化できない確認を毎回全部聞く」でも「何でも無確認で実行」でもなく、事前承認された内部処理は進め、対外的な確定操作や新しい権限だけを停止点にする。

### 6.2 トリガーと実行条件

- Alpha: 利用者が入力先へ置いたファイルの取り込み、時刻窓、充電/Wi-Fi成立、手動の「今実行」。ファイル取込は書込完了・重複・変更中を検出し、入力snapshotを固定する。
- 後続: 署名検証できるWebhook、公式APIの差分取得、明示登録した端末イベント。高頻度の無制限pollingは不可。
- ネット未接続時はローカルToolだけ動かせる。外部工程はwaiting_network、電池/熱/容量不足はwaiting_resourceで、理由を表示する。
- 電源OFF中は実行できない。再起動後、本人の初回unlock後に再評価する。unlock前に原稿や秘密を復号する設計にしない。
- 予定超過はmissedとして記録し、初期値は同じAutomationの取り逃しを1件に集約する。時刻/DST変更時も同じ発火IDを二重作成しない。

### 6.3 状態・冪等性・異常終了

Workの業務状態は既存の `active → review → completed` を維持し、中止はcancelled。実行待ちの事情はRun側へ分ける。

```text
Run: queued → waiting_{resource,network,approval} → leased → running
                                                  └──────→ succeeded / failed
running → cancelling → cancelled
running → interrupted → 照合 → 安全な再試行 または 確認待ち
```

- 発火ID、Work ID、step ID、固定Tool版、入力hashから論理実行を一意化する。再試行は同じrunIdの新attemptIdで記録する。
- leaseに所有端末・期限・単調増加のfencing tokenを持たせる。旧leaseの結果は採用せず、再起動後は実行有無を照合する。
- 端末SQLiteのtransactionで状態・イベント・次工程のoutboxを確定する。プロセス終了後にoutboxを再送しても二重進行しない。
- 副作用のない変換は入力snapshotから再試行可能。外部APIは同じ冪等キーと照会APIを用いる。応答不明で冪等/照会非対応なら自動再送せずreconciliation_requiredに止める。
- 「世界全体でexactly-once」を約束しない。ローカル状態更新を一意にし、外部副作用は重複排除・照合・確認で扱う。
- 取消はToolへ協調停止を通知し、猶予後にOSが対象UIDの処理を停止する。子プロセスと発行済みcapabilityも終了対象。外部で既に成立した操作の取消を保証しない。
- 未完了ツールの出力は仮領域へ置き、検証後だけ成果物として確定する。必要な出力がないのにexit 0だけで成功にしない。

### 6.4 資源・コスト管理の初期値案

初期値は測定結果ではなく、Alpha試験で調整する設定値。Tool申告だけを信用せず、OS側で強制し、実測/上限/推定を別フィールドにする。

| 項目 | Alphaの初期制約 |
| --- | --- |
| 並列数 | 端末全体で1実行。まず安定性と二重実行防止を優先 |
| テキストTool | 1回120秒、メモリ256 MiB、入力256 KiB、出力1 MiBを上限案とする |
| 自動実行時の電池 | 原則充電中。非充電の許可は別設定、残量30%未満では新規開始しない |
| 発熱 | Androidのthermal severityを参照し、重大な熱状態で停止/延期。独自の固定温度だけで判断しない |
| API課金 | 初期0円、課金先未設定。後続は実行前の最大費用予約と日/月上限を同時に判定 |
| 空き容量 | 成果物最大量とOTAに必要な余裕を確保できない場合は開始しない |

OS側のプロセス/cgroup等でのメモリ・CPU・終了制御は実装/実機検証が必要。設定ファイルに値を書いただけで強制できたとは扱わない。推論モデルや動画処理は同じ上限へ無理に入れず、別の審査済み実行クラスか許可済みPCへ分ける。

## 7. 第三者ツールのSDKと実行契約

### 7.1 最初に受け付けるもの

| 種類 | 初期扱い | 理由 |
| --- | --- | --- |
| Managed Tool APK | SDKを実装し、制限されたToolServiceとして動く | Androidの既存署名・UID隔離・更新機構を利用できる |
| Recipeパッケージ | データとして解釈し、参照するTool版と必要権限を固定 | 複数Toolを組み合わせても任意コードや権限追加にならない |
| 既存の一般APK | 将来の通常アプリ枠。自律実行対応とは表示しない | インストールできることと、外から安全に自動操作できることは別 |
| PC向けPython/Node/MCP | 既存4ツールから段階的に対応 | Pixelへデスクトップ依存をそのまま持ち込まない |
| WASM/WASI等 | 将来の実行アダプター候補 | Android上のランタイム・ABI・隔離・性能をPoC後に選定 |

Alphaのスマホ内処理はまず出典整理・無料版作成をKotlinへ移植する案とし、既存TS/Pythonと同じfixtureで出力を照合する。Python標準環境やCodexがPixelに標準搭載されるとは仮定しない。案件条件チェック・納品照合も順に同じ契約へ移す。原本のMIT表記と固定hashは保持し、移植版は別物として変更履歴を残す。

### 7.2 宣言する情報

次は未実装のTool Manifest v0.1の概念例。署名対象のmanifest、APK digest、作者証明書fingerprintを配布メタデータで結び付ける。実際のAPK pathや秘密値は入れない。

```json
{
  "schemaVersion": 1,
  "id": "dev.rock.tools.citations",
  "version": "0.1.0",
  "versionCode": 1,
  "toolApi": "1",
  "runtime": "android-service",
  "entrypoint": "dev.rock.tools.citations.ToolService",
  "targets": ["android-arm64", "android-x86_64-test"],
  "license": "MIT",
  "operations": ["format_citations"],
  "inputSchema": "schemas/input.json",
  "outputSchema": "schemas/output.json",
  "capabilities": ["artifact.read:input", "artifact.write:output"],
  "network": {"mode": "none"},
  "effects": "local-transform",
  "limits": {"wallTimeMs": 120000, "memoryMiB": 256},
  "cancel": "cooperative-then-terminate"
}
```

本番schemaには最小/最大OS・Tool API互換、入力/出力サイズ、課金有無/最大費用、データ保持、SBOM、ソース/再配布条件、サポート終了、試験結果、署名鍵識別子も必須にする。未対応manifest版、未知のcapability、schema外項目は拒否する。

### 7.3 Tool API v1案

- `describe()` → 対応契約とoperation一覧。Store宣言と照合する。
- `start(runContext, inputHandles)` → attempt受付。OSが発行したcontext以外は拒否する。
- `getStatus(attemptId)` → 稼働/終了状態とcheckpointの有無。
- `cancel(attemptId)` → 停止要求。停止不能ならOS側で終わらせる。
- `onResult(attemptId, outputHandles, result)` → 出力schema、hash、outcome、資源報告、エラーコード。サーバー認証情報や成果物本文はイベントへ混ぜない。

同一端末はバージョン付きAIDL/Binderと限定FD/URIを使い、汎用shellや任意URL実行APIを設けない。OSはBinderの実呼出UIDからToolを特定し、manifestの自己申告IDだけで認証しない。ToolServiceはBrokerだけが呼べる権限で保護する。

`outcome`はpassed/needs_review/failed。Toolがpassedを返しても、OS側のschema・成果物検証・Recipe側の通過条件を通らなければ次工程へ進まない。検証済み成果物のhandleを次工程へ渡すため、初期Web版の手動コピーをなくせる。

Recipeは型付きDAGとして検証し、循環・存在しないTool版・型の合わない接続・無制限の分岐/再帰を拒否する。初期は条件分岐の種類を限定し、任意JavaScriptやshellを式として評価しない。全体の最大工程数・試行数・予算を先に算出できるものだけ導入する。移植のfixtureは日本語、Unicode、改行、長さ上限、コード区切り、異常入力も含める。

## 8. 権限・自動化・AIの安全性

### 8.1 同意と仲介

| 操作 | 初期の扱い |
| --- | --- |
| 指定した入力を読み、指定出力へ変換 | インストールとは別に、Automationの作成時に範囲を許可すれば以後自動 |
| 許可済み外部APIから読み取る | 対象アカウント/情報/頻度/費用を明示して許可 |
| 新しい通信先、対象フォルダ、モデル、費用の追加 | 自動拡張しない。権限差分の再承認が必要 |
| 投稿・返信・応募・外部への納品確定 | Alphaは下書きまで。後続でも宛先/内容/操作hashを本人が確認するゲート |
| 送金・課金承認・取引・権限共有の変更 | 初期未実装。Toolが要求しても実行しない |
| 他アプリの画面操作/Accessibility | 初期未対応。OSだから自由に操作できるとは見なさない |

権限の実体は、Tool版・Android user・Automation・runId・対象resource・用途・期限・予算に紐付いたcapability。更新で権限が増える場合は旧同意を再利用しない。利用者の「全停止」は新規発行を即座に止め、進行中の処理へ取消を送る。

Managed Toolは直接INTERNETや広範なstorage権限を持たないプロファイルを基本とし、ネット接続はConnector Brokerへ集約する。AndroidのINTERNET権限だけではドメイン単位の制限にはならない。Store審査・PackageManagerのインストール検査・実行時のUID/SELinux/通信制御を組み合わせ、外部Intent等の迂回路も否定試験する。直接通信を必要とする既存APKは、この管理保証の外として別枠に置く。

Connector Brokerは許可した操作/宛先だけを実行し、redirect/DNS変更/内部IPへの誘導も再検査する。認証の秘密をToolへ渡す汎用HTTPプロキシにはしない。

### 8.2 LLMは実行権限を持たない

LLMの役割は「依頼をRecipe候補へ変換」「内容生成」「エラー説明」。スケジュール維持、権限判定、費用上限、Toolの導入、外部確定は決定的なOSコードが担当する。最初の2工程はLLMなしで成立させ、AI利用料を前提にしない。

Webページ、メール、原稿、Toolの説明文、README、モデル出力はすべて未信頼データとして扱う。「制限を解除」「別Toolを入れる」等の記述は利用者の許可ではない。モデルへの入力をデータと命令に分け、提案はallowlist/型/権限/予算で検証する。モデルが選んだ別ホストへ失敗時に勝手に切り替えない。

### 8.3 秘密・利用者分離

ローカルの仕事はAndroid user/profileへ所属させ、端末ロックとデータ暗号化を基礎にする。鍵はKeystoreを使い、ハードウェア保護の可否を実機で確認する。Keystoreがあっても侵害されたOS上で鍵の不正利用まで防げるとは断定しない。[Android Keystore](https://developer.android.com/privacy-and-security/keystore)

外部ログインは必要なコネクターだけ追加し、提供元が対応する正式な認証経路を利用する。ネイティブOAuthを使う場合は外部ブラウザとPKCE等を採用し、埋め込みWebViewで利用者のパスワードを集めない。[OAuth for Native Apps](https://www.rfc-editor.org/info/rfc8252/)

## 9. 成果物・同期・PC接続

### 9.1 端末のデータモデル案

| データ | 主キー/主な属性 | 正本 |
| --- | --- | --- |
| ToolVersion / Installation | toolId+digest、作者鍵、互換版、許可差分、失効状態 | 署名済み配布物 / 端末の導入記録 |
| RecipeVersion / Automation | 固定依存版、DAG、schedule、owner、resource binding、policy revision | 端末SQLite |
| Work / Run / Attempt | workId/runId/attemptId、step、入力hash、lease epoch、状態、error | 実行所有端末のSQLite |
| Grant / Approval | 対象・操作hash・期限・policy revision・消費済み状態 | Policy Broker |
| Artifact | owner、content hash、MIME、サイズ、暗号化先、保持期限、由来 | 端末成果物庫 |
| Event / Outbox | eventId、sequence、runId、本文を含まない検証記録 | 端末SQLite。同期は複製 |
| BudgetReservation / Usage | 同時予約、上限、消費、返却、実測/推定の区別 | Policy Broker。会計とは別 |
| BookRecord | 手入力/外部照合の別、原記録、取消、通貨 | 将来の独立会計モジュール |

成果物は原子的に確定し、入力snapshotを勝手に上書きしない。閲覧・明示export・保持期間・空き容量警告・削除前の確認を提供する。Workを削除しても法的保管が必要な会計記録まで連鎖削除する仕組みは作らない。標準ログに原稿、アクセストークン、個人アカウント識別子を出さない。

旧Web版のD1はWebアカウントの正本のまま残す。端末のSQLiteを最初から双方向でD1へmergeしない。OS Alphaは1所有端末・ローカル完結とし、後続の同期はeventIdによる重複排除と明示的な実行所有者を持つ。別端末での同時進行やlast-write-winsによる再実行を避ける。

### 9.2 PC/クラウドは補助実行先

Pixel上の`127.0.0.1`はPixel自身であり、既存PCサーバーの`127.0.0.1:38479`へは届かない。現在のsessionStorage Bearer/固定localhost接続をスマホ向けに流用しない。

後続のDevice Brokerでは、両端末で確認する短寿命のpairing、公開鍵fingerprintの照合、暗号化接続、端末別の失効可能資格情報、固定Tool allowlistを設計する。LANへ無認証のMCPやshellを公開しない。PC側からの接続/限定relay方式も比較し、どちらも明示登録した相手以外へ原稿を送らない。

MCP tools/listやtools/callはTool adapterの契約として利用できるが、それ自体は認可・隔離・課金上限の代わりではない。第三者MCPへ利用者の別サービス用tokenを転送せず、先方からの説明文でOS権限を変更しない。[MCP security guidance](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices)

長時間GPU処理やデスクトップ専用依存はPC側の分離ランナーへ送る。PCのsandbox/資源制御を検証するまでは第三者任意コードを受け付けず、既存固定Toolだけを対象にする。接続断で結果が不明になったときは照合待ちとし、Pixelで黙って重複実行しない。

## 10. Rock Storeの開発者・利用者フロー

### 10.1 配布と導入

1. 作者が名前/連絡窓口/署名公開鍵を登録し、SDKでToolまたはRecipeを作る。
2. ソース/配布権限、SBOM、Tool Manifest、試験fixture、署名APK、プライバシー説明を提出する。非公開ソースは将来の別審査枠とし、初期はレビュー可能なものに限定する。
3. 隔離CIでbuild・依存脆弱性・禁止権限・外部通信・サイズ・取消・再送・悪意入力を検査する。作者のbuild scriptを運営PCや署名サーバーで直接実行しない。
4. 人が機能・権利・権限の必要性を審査し、固定digestに対して掲載を承認する。「処理成功」は利益保証ではない。
5. 端末は署名したcatalog metadata、有効期限、通し番号、APK digest、作者鍵、OS互換を検証する。
6. 利用者が権限とAutomation条件を確認して導入する。PackageInstallerの結果を確認してから有効にし、単なるdownload成功を導入完了にしない。
7. 更新は新digestを再審査。実行中の版は完了まで固定し、新版は次のRunから使う。権限が増えれば自動実行を止めて再確認する。
8. 作者の撤回・脆弱性・侵害時に署名した失効情報を配信。該当版の新規実行を止め、必要なら隔離し、既存成果物は利用者に知らせず削除しない。

更新物のdownloadとパッケージ置換は別段階にする。Androidで同じpackageの複数版を並行実行できることを前提にせず、対象Toolの稼働を完了/停止してからPackageInstallerで置換する。外部からのアプリ更新/削除で処理が失われた場合もinterruptedとして復旧判定する。

APKはインストール/更新時に署名が必要。作者鍵、Store metadata鍵、OS/OTA鍵は用途を分け、第三者APKをOSのplatform鍵で署名しない。[Android app signing](https://developer.android.com/studio/publish/app-signing)

### 10.2 最小ストアの範囲

Alphaは自社2ツールと、別の作者がSDKだけで作った1ツールを配布する閉鎖カタログ。GitHubの全リポジトリを無審査で入れるストアにはしない。検索、対応状態、作者、権限、版、インストール、停止、更新、アンインストールを最小画面にする。評価/ランキング/有料販売/広告は後回し。

ストア手数料・販売代行・税務・返金・開発者分配は未決。最初は無料配布で契約と安全性を検証する。OS利用者の個別成果物はStoreへアップロードしない。

developer modeは、署名済み開発パッケージをローカル導入して試す別レーン。審査済み表示を付けず、運用用秘密を渡さず、一般利用者へ常時ADB/rootを要求しない。

署名済みcatalogが期限切れなら新規導入/更新を停止する。オフライン継続は既に承認されたローカル変換に限定し、外部送信の自動実行は失効確認が古い場合に止める。初期案はcatalog有効7日、外部操作の失効確認24時間以内。値は運用試験で確定し、時計巻戻しによる古いmetadataの受入も試験する。

### 10.3 Androidエコシステムとの関係

AndroidにはGoogle Play以外の配布経路があるが、独自Storeが署名・プラットフォーム制約・配布条件を免れるという意味ではない。Googleのdeveloper verificationは認証済み端末に関する地域/時期別の展開が案内されている。一般Android向けにもStoreを配る場合は、その時点の対象地域・認証/配布方式の条件を確認する。[Alternative distribution](https://developer.android.com/distribute/marketing-tools/alternative-distribution)、[Developer verification](https://developer.android.com/developer-verification)

GMS/Google PlayはAOSPと同一の自由配布物ではない。初期OSはGMSなしで中核機能が成立する設計にし、Google Play・FCM・Play Integrityを必須依存にしない。第三者アプリのGMS/DRM/金融アプリ等の互換を保証しない。CDD/CTS等による互換検証とGMSの提供条件は分けて確認する。[GMS](https://www.android.com/gms/)、[Android compatibility](https://source.android.com/docs/compatibility/overview)

## 11. OS更新・復旧・保守

- OS/OTAは検証されたrelease鍵で署名する。日常CI、Store、Tool作者が署名秘密鍵へ直接触れない構成にする。鍵のbackup/rotation/失効/担当者離脱時の手順を用意する。
- AVBの信頼チェーンとrollback protectionを維持する。開発用userdebugと配布用userビルドを区別し、root/ADB有効の検証機を商用の安全性証明にしない。[Verified Boot](https://source.android.com/docs/security/features/verifiedboot)
- 対象機種のVirtual A/B等を踏まえ、OSの標準更新エンジンに接続する。単に「2つのsystem partitionをコピー」とは設計しない。更新失敗・起動失敗からの復旧は対象機種で検証する。[Virtual A/B](https://source.android.com/docs/core/ota/virtual_ab)
- 更新前にRunを停止/完了待ちへ移し、未確定の外部操作を照合する。十分な電池・空き容量・対応firmwareを確認する。
- systemが戻っても共有userdataは自動的に戻るとは限らない。DB変更は少なくとも直前OSとの読取互換を維持し、破壊的migrationは復旧設計とbackupなしに行わない。
- アプリ更新失敗では、審査済みの修正版をより新しいversionCodeで出すforward fixを基本にする。安易なAPK downgradeやデータ消去を回復策にしない。
- 内部→開発者→小規模テスターの順で段階配信。致命的な起動/漏えい/実行暴走を検知したら配信停止し、公開事故窓口・影響版・回復手順を出す。
- 上流セキュリティ更新、BSP、kernel、OS差分、Tool SDKを別々に追跡する。端末の保守終了後は新規推奨を停止し、安全な移行/exportを用意する。担当者と更新SLAはAlpha後ではなく、配布前に確定する。

## 12. 既存rockと配信側の扱い

既存WebはOSの開発資料・管理画面・後続のStoreポータル候補として残す。OS本体、起動、ローカルの仕事、Tool導入済み状態はSitesの稼働やChatGPTログインへ依存させない。今回はWeb公開の衝突を無理に解消しなくてもOSの設計/独立PoCは進められる。

| 現在の資産 | 再利用の仕方 | そのまま持ち込まないもの |
| --- | --- | --- |
| lib/workflow.ts・tests | 状態契約とfixtureをOS版へ移植し、言語間の一致を試験 | React stateやHTTP routeをOS schedulerと呼ばない |
| lib/mr-tools.ts・vendor/mr | 処理仕様・ライセンス・固定入力/出力の照合 | 原本を無断変更、スマホにPythonがあるという前提 |
| 配信側operations | 単発実行・停止・期限・重複排除の要求 | /api/jobsの衝突、Web用120秒leaseの無検討移植 |
| D1の設定/仕事 | 明示export/importの設計材料 | Sites認証ヘッダーをAndroidクライアントから送ればログインになるという扱い |
| fund/settlement | 純粋計算の互換テスト、費用と収益の区別 | 完了件数からの売上生成、root権限と支援額の紐付け |
| PWA/market UI | 画面語彙と導線の参考、別途Web管理用 | 2つのホームを一括上書きして片側の機能を捨てること |

将来Web/クラウドと統合するときは、業務Workと単発Runを別namespaceにする案（`/api/work-items`と`/api/runs`等）を契約から確定し、既存クライアントへの移行期間を用意する。配信済みか不明な0002 SQL/journalは書き換えない。適用境界の確認を経て新しいmigrationを生成する。

### 12.1 想定するリポジトリ配置（まだ作成していない）

```text
rock/                      正本。現在のWebディレクトリは当面維持
  docs/                    要求、ADR、端末適合表、試験結果
  contracts/               Tool API/schema、Work/Run/Recipe、共通fixture
  os/manifests/            AOSP/派生元・device・kernel等の固定repo manifest
  os/device/               対象構成、必要最小限のpatch、SELinux方針
  android/shell/           OSのホーム/Inbox/Store UI
  android/automation/      実行・権限・資源・成果物のOSサービス
  android/tool-sdk/        SDK、テストハーネス、第三者向け例
  tools/android/           自社Toolの移植版
  services/registry/       署名catalog、審査結果、失効。実行サーバーではない
  companion/              後続のPC接続
```

AOSP全ソース・ビルド出力・vendorの無許諾binary・OS署名秘密・実端末識別子・原稿はrockへ入れない。既存`app/`等の移動やmonorepo基盤の導入は、OS実装を始める際に別commitで段階的に行う。

## 13. MVPの縦断シナリオと合格条件

### 13.1 最初の一連の動作

「利用者が選んだ原稿を入力先へ置く → 充電中の実行枠で出典整理 → 無料版作成 → 端末成果物庫へ保存 → 最終確認を通知 → 本人が読んで完了」。OSシェルを閉じても動き、ネット不要で完結する。元の仕事設計を、OSならではの実行・保存・復旧に最小範囲でつなげる。

Storeの縦断試験は別作者のToolを署名catalogから導入して同じ経路で使う。自社Toolをあらかじめsystemへ入れただけでは、第三者Storeの完成にはしない。

### 13.2 受入試験

以下は将来実施する試験と合格基準で、現在の実績ではない。

| Test | 要求 | 合格基準/残す証拠 |
| --- | --- | --- |
| AT01 OS起動 | Q08 | 固定manifestからbuildしたイメージがCuttlefish、次に対象Pixelで起動。build fingerprint、ログ、構成hash |
| AT02 自動処理 | Q02/Q08 | UIを終了/画面OFFにしても、承認済み入力から2工程・成果物・Inboxまで自動。入力ごとにWorkが1件 |
| AT03 再起動 | Q02/Q07 | queued/leased/running/result確定前後で計画終了・再起動を試験。再unlock後に復元し、次工程/副作用が二重にならない |
| AT04 通過条件 | Q02/Q06 | サンプル・失敗・needs_review・不足成果物・不正hashで進まない。最終確認なしではcompletedにしない |
| AT05 隔離 | Q06/Q09 | 別Tool/Android user/Workの入力・秘密・出力を読めず、BinderのID偽装・期限切れgrant・権限拡大を拒否 |
| AT06 資源/停止 | Q07/Q08 | 意図的な無限loop・過剰allocation・子プロセスで上限を強制。全停止から新規許可即時停止、ローカル処理終了5秒以内を目標 |
| AT07 永続成果物 | Q02/Q06 | クラッシュ・容量不足で半端な成果物を確定しない。再読込・明示export・削除/保持設定を確認 |
| AT08 実機耐久 | Q08 | Pixelで72時間、画面OFF/充電着脱/ネット断/再起動を含む合成仕事。消失と重複0、遅延理由が全件説明可能 |
| AT09 消費/発熱 | Q05/Q08 | 同条件の素のOS対照と比べ24時間測定。アイドル時の増分5 percentage points/日以内を仮目標、重大thermalなし。実測と機種を記録 |
| AT10 Store導入 | Q01/Q09 | 別作者がSDK資料だけでToolを作成し、署名検証→同意→導入→実行→停止→削除。OS本体の再build不要 |
| AT11 更新/失効 | Q04/Q09 | 改変APK、鍵不一致、期限切れcatalog、古いmetadata、権限増、失効版を拒否。稼働中版を勝手に差し替えない |
| AT12 OS復旧 | Q08 | テスト機で更新中断・起動失敗・DB前後互換・公式環境への復旧を手順通り検証。anti-rollbackを破らない |
| AT13 会計分離 | Q05/Q07 | 実行件数/支援額を売上にしない。既存分配の保存則・8.88上限・個人費用モデルの分離を維持。手入力収支は証憑照合前と表示する |
| AT14 外部接続 | Q03/Q06/Q07 | 後続工程。偽PC/再pairing/資格失効/接続断/不明応答に安全側で停止。許可外通信/重複外部送信0 |

テスト時間や電池目標はこの設計の工学的仮定で、Pixelの性能保証ではない。対象型番・OS版・入力件数・充電条件を固定して比較する。端末時計はスケジュール、単調時計はtimeoutに使う等、時間の役割も試験する。

## 14. 開発順序と成果物

実装期間は要員・機材・BSP成立性が未確定なので約束しない。最初にG0とLinux環境を確認し、以下の完成条件ごとに進捗を更新する。OS01以外は未着手。

| 段階 | 対応タスク | 実施内容と終了条件 |
| --- | --- | --- |
| D1 設計 | OS01 | 本書、既存要求の対応、リスク、受入条件。OS実装済みとはしない |
| G0 適合性 | OS02 | Linux/KVM・固定ソース・端末候補/BSP/復旧物の可否を記録。実機不可でも仮想OS開発の可否を別判定する |
| A0 仮想OS縦断 | OS03 | 自前OS起動、Policy Broker、端末DB、2ツール移植、トリガー→Inbox、停止/再起動。AT01〜07の仮想環境部分とAT13の既存試算回帰 |
| A1 Pixel Alpha | OS04 | G0の実機項目を全通過。書込/復旧、72時間稼働、電池/熱、署名OTA、全停止。AT01〜09/12 |
| A2 SDK/閉鎖Store | OS05 | 別作者のTool、署名catalog、審査CI、更新/権限差分/失効。AT10/11と隔離試験を再実施 |
| B0 拡張 | 後続で起票 | 残る2ツール、PC接続、外部API、AI計画提案、任意同期、会計表示。必要な接続だけAT14を通し、手入力台帳はAT13で照合前の表示を確認 |
| B1 配布判断 | 後続で起票 | セキュリティレビュー、OS保守担当/SLA、対象国/条件/ライセンス、互換方針、利用規約、費用構造を確定 |

設計だけでも切り出せる最初の実装チケット:

1. **OS-T01 再現ビルド**: Linuxで固定manifestから素のCuttlefishを起動し、入手物/ビルド環境/指紋を記録。
2. **OS-T02 契約**: Tool Manifest schema、Work/Run/Attempt、Recipeとgrantの型、共通fixtureを定義。依存: 本設計。
3. **OS-T03 Broker縦断**: 専用権限で起動/停止できるダミーToolと、他UIDから拒否されるテスト。依存: T01/T02。
4. **OS-T04 ツール移植**: 出典整理/無料版を独立APKへ。TS/Pythonとのfixture一致。依存: T02/T03。
5. **OS-T05 自律実行**: 永続キュー、lease/outbox、成果物庫、充電時実行、確認Inbox。依存: T03/T04。
6. **OS-T06 機種bring-up**: G0全項目を通した1機種へ移し、復旧と耐久を検証。依存: T05/G0。
7. **OS-T07 Store供給**: 別作者のサンプル、隔離CI、署名metadata、導入/更新/失効。依存: 契約安定化とA1の隔離合格。

G0で最新の安全なBSPが成立しない場合は、対応根拠を持つ別Pixel/開発ボードまたはCuttlefishへ戻して進める。脆弱な古いfirmwareやbootloaderの安全機構解除で納期を合わせない。

## 15. 判断記録・未決事項

### 現時点で提案する設計判断

- ADR-OS-001: AOSPベースの実OSを主軸、APKは補助検証。実機1機種に限定。
- ADR-OS-002: シェル、特権Broker、非特権Tool、Store、会計を分離。
- ADR-OS-003: ローカルファースト。クラウド/ChatGPT/ウォレットを起動やローカル変換の必須条件にしない。
- ADR-OS-004: WorkとRunを分け、冪等性/不明結果の照合を優先。再送を無条件の再実行にしない。
- ADR-OS-005: 第三者向けは署名されたManaged Tool契約から開始。一般APKと対応Toolを区別。
- ADR-OS-006: 原稿・成果物は利用者が指定して端末保存。外部送信はコネクター単位の許可。
- ADR-OS-007: 実行/ストアの権限と、既存ファンド/費用/将来の決済を分離する。

### 実装前に確定すること

| 未決事項 | なぜ必要か | 決める時点 |
| --- | --- | --- |
| 手元の端末/購入予算、Linux環境 | 機材を推測購入せず、実機とbuildの成立条件を決める | OS02 |
| AOSP/派生元の固定版とBSP | Pixelへ載るソース、更新継続、再配布権を確定する | OS02、実機前 |
| 最初に任せたい実案件 | 初期2工程が価値を出す入力/出力/確認点を選ぶ。現案は記事の販売準備 | OS03着手時 |
| 開発要員・保守担当・許容期間 | OS/Android、security/release、Tool SDKの担当とreview責任を置く | OS02〜03 |
| GMS/一般Androidとの互換目標 | 動く通常アプリと検証範囲、認証/ライセンスの境界を決める | 公開前。Alphaは不要 |
| 料金/Store手数料/実取引の主体 | 既存案を守りながら、Tool代や利用料を二重請求しない契約にする | 無料の閉鎖試験後、課金前 |
| 成果物保持・backup・サポート終了 | ローカル保存の新責任と利用者の持出し手段を決める | Alpha配布前 |

### 主な停止条件

未許可通信、他Tool/他利用者のデータ参照、署名/失効検証の抜け、停止不能、外部操作の重複、復旧不可のOS更新、継続できないBSP保守は配布停止条件とする。OS権限が必要だからといってSELinux/AVBの全面無効化、全Toolのroot化、無審査の自動更新を採用しない。

## 16. 本書の検証と更新

既存仕様の読解、公式一次資料による方式/制約の確認、要件から責務・受入条件への追跡、文書間の整合確認を今回の完成範囲とする。参照Web資料の確認日は本書先頭の日付であり、機種/OS/配布ポリシーは実装時に再確認する。

進捗は [project.md](../project.md) と `data/project-status.json`。判断変更時は本書のADR/根拠、実施時は [検証記録](validation.md) を更新する。既存の`npm run verify`はWeb/PC資産の回帰検証で、Android build・CTS・Pixel実機試験の代替ではない。
