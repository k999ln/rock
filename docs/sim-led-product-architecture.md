現行の製品名は **Eve（イヴ、旧称Zema）**。2026-10-20の本人指示による改名で、以下のZemaは同じ製品を指す。既存契約・保存・利用権/SDK識別子は互換性を保持する。

<a id="pixel-service-setup"></a>
## Pixelの利用開始モジュール：OS完成後に組み込む

2026-10-20本人訂正に従い、ここでのOS完成は最新版の共通RockstarOS Core/runtimeの受入を指す。旧Buildroot/QEMUの完成を前提に戻さない。独自Pixel OS imageは追加native系列として別受入し、既存OS clientによる標準サービス経路と混同しない。eSIM直接追加の権限がないShellはAndroid/発行元設定へ案内し、追加成功や本人利用権を推測しない。

2026-10-20の本人指示「その設計で実装」「まずPixelでeSIM追加からSkyとEve」「請求してからの契約そのあとの利用」「OSのシステムが出来上がったらつけて」に従う。開発は今行い、既存PixelのOSやインストール済みAPKへは今回適用しない。`ROCKSTAR_SERVICE_SETUP_ENABLED`とAndroid resourceの`rockstar_service_setup_enabled`は既定で無効。OSの本人/利用権/権限・予算/私有保存・復旧/Sky・Eve入口を同一候補で受け入れた後に、運営の`rockstar.os-service-acceptance/1`記録（Pixel 10 GL066/frankel、build ID、証拠hash）と両側の設定を組み込む。sampleのpendingをacceptedへ書き替えるだけでは実機受入にならない。

**目的・体験。** Pixelのforegroundで発行元のeSIM追加をAndroidへ依頼し、必要時はOSの確認を開く。成功callbackは端末追加の結果として保存し、`/connect/service`へ進む。本人のaccount認証→既存の真正なeSIM導入/端末利用権→16ドルの請求内容→契約と継続請求への別々の同意→月末請求用の支払い方法の確認→既存Linux workspaceの一回の準備→認証済みworkerの準備証拠→現在のissuer状態/未払いの確認→Sky/Eveの入口、を扱う。

**請求の意味。** 元の携帯代型の月末請求を維持する。契約前には金額・枠・単価・上限・停止/保存条件を提示する。初回Checkoutは`setup`で、登録時の引落額は0。SetupIntent成功は支払い方法の準備であり入金ではない。実請求は既存のLinux usage/Invoice/入金照合へ渡す。専用環境の準備待ちでは`serviceStartAt=null`として新規実行と基本料の起算を止め、準備証拠の保存後に開始時刻を記録する。旧契約の未指定fieldは従来挙動を保持する。枠の量・単価・保持/猶予等が未確定のため、この開発で実販売価格表を有効化しない。

**責任・権限。** 主担当BillingのROCK、SIM01/BIL02/OS10。ROCKは状態遷移・account/revision・scope・同意・料金版・冪等性・準備証拠・保存/復帰、EXTERNALは許可された実profile/issuerの証拠、AndroidのLPA/権限、Stripeとcompute、JOINTは同じ実profile/端末/契約/jobの一周、OWNERは既存承認に沿うOS受入と料金/地域/利用枠・端末操作を担う。アプレット配布、未知のeSIMprofile、未署名のreceipt、回線active表示を真正なサービス利用権へ置き換えない。eSIM用の限定cloud資格情報に契約/決済の管理権限を追加せず、本人accountで行う。

**入出力・保存。** 新規`rockstar_service_setups`はowner一件の導入状態とrevision、注文/端末、凍結した見積・契約digest、Stripe Session/SetupIntent/PaymentMethod参照、既存workspace ID、worker challenge/証拠digestを保存する。秘密鍵、カード番号、eSIM追加コード、原稿は保存しない。job/usage/invoice/作者分配は既存DBのままで、別台帳へ複製しない。追加migrationは0065。APIは`/api/rockstar/service-setup`、署名webhookはその`/webhook`。内部workerの`setup-ready`は既存のowner/workspaceに限定した署名を要し、public APIからは受けない。

**失敗・復旧。** OS未受入はdeferred、profile未確認、契約待ち、支払い方法待ち、環境準備/検証待ち、利用可能、制限を区別する。画面のredirectだけでは成立せず、Checkout→SetupIntent→本人PaymentMethod→月次Invoiceのdefault設定を提供元GETで照合する。要求を先に保存し、応答消失は同じidempotency key/Session/契約を回復する。古い結果不明は自動再作成しない。eSIM追加のPendingIntentを受けたreceiverは非公開で、request IDを照合し、backgroundから画面を強制起動しない。結果不明のdownloadを繰り返さない。未払い/失効は既存gateで新規実行を制限し、支払と利用権復旧後に同じworkspace/仕事へ戻る。OS更新はmodule無効へ戻せるが、契約・成果の記録を消さない。

**合格・未完了。** 新規9件のlocal fixtureはprofile/同意/支払い準備/一回の環境作成/worker証拠/失効と復帰/他owner/重複/結果不明/OS無効を検査し、既存Linuxの関連回帰と併せる。Android 35 SDKを使う新ActivityのJava 11 compileはAPK/実機受入とは別。新probeはmodel/runtimeのhash、namespace隔離と私有保存の書込み/読戻しを確認するが、推論の実品質合格とはしない。実eSIM、端末の追加結果と真正なissuer導入証拠の自動結合、Stripe sandbox、本番課金、管理Linuxの実配備、full OS/同一APK/Pixelの一周は未受入。設定/接続先/証拠が揃った後、破壊しない同一Pixelで別途受け入れる。

実装入口: `lib/rockstar-service-setup*.ts`、`components/rockstar-service-setup.tsx`、`android/shell/.../ServiceSetupActivity.java`、`toolkits/sky-linux-service/{worker.mjs,setup-probe.py}`。OS完成後の組込条件は[無効のままの設定記録](../data/service-setup-integration.json)。今回のsource/local検証は[証拠](evidence/pixel-service-setup.json)に記録し、以下の発明全体・全機種対応を分ける。

<a id="esim-service-attachment"></a>
## 最新の発明課題：eSIMから共通RockstarOS環境を接続し、端末ごとのOS開発を不要にする

**同日の本人による意味の確定。** 本商品の「eSIM」は通信容量を売る商品ではなく、**クラウド上の自分専用Linux・LLM・Agentが追加され、Skyを使うためのサービスprofile**である。既存Wi-Fi/別SIM等を通信経路として使い、本人の携帯の通信状態をAgent稼働のheartbeatにしない。LLMは実行先Linuxへ配置し、本人が承認した仕事を自律継続する。目標は「PCの前に立たずに制作」「携帯を持たずにやり取り」「Run to Earn」。この商品上のeSIMという呼称と、GSMA準拠eUICCへ実際に搭載できたことは別で、後者は発行元/端末との研究・実装対象である。

2026-10-20、本人は「希望が可能になるように発明して」「各端末の専用osを作らなくて済む」「何にでも対応」「このシステムは既存じゃないから発明して」と明示した。これにより、**標準の提供方式を、既存OSを保った端末へ共通RockstarOS環境を接続する方式へ変更する**。RockstarOSが大元で、その中にSky・Eve・Linux・OS Coreを置く階層は維持する。端末内にすべてを格納する条件を外し、共通管理と主なLinux実行をサービス側へ置く。既存Pixel内Linux、GrapheneOS統合、QEMU、Mini/Proのnative研究は追加能力として残し、標準サービス利用開始の前提にはしない。旧native優先文はその系列の履歴として読む。

この節と[機械可読のプロトコル案](../contracts/rockstar-service-attachment.json)は**今回設計する仕組み**であり、既製品の紹介、実装・eSIM開通・iPhone自動起動・全機種対応・特許性の証明ではない。

### 1. 目的と利用者

目標体験は、契約時に必要な本人同意を済ませ、eSIMを追加すると、自分のSky・Eve・Linux作業環境が準備され、その端末から使い始められること。利用者へLinux構築、provider API鍵、モデルごとの起動コマンド、機種別OS書込を要求しない。eSIM非対応PC・TV等も、本人が同じ契約へ端末を追加すれば同じ仕事と成果を利用する。完全自動の前面起動、必要な確認一回、別途URLを開く方式を測り分け、後者の成功で前者を達成したとはしない。

### 2. 発明する構成と利用体験

構成は、(a)対応eSIM内の小さな起動用アプレット、(b)開通と契約から専用環境を準備する制御部、(c)期限・権限・端末鍵を持つ接続証明、(d)端末の入出力に合わせる共通クライアント、(e)仕事・成果・費用を持つ共通RockstarOS基盤、とする。アプレットは発行元の許可したprofileへ組み込む研究対象で、ブラウザから市販eSIMへ任意追加できるとは仮定しない。

本人の流れは、料金・保存・停止条件への同意→サービスprofile追加→真正なサービス有効化証拠と本人契約の照合→同一workspaceとLinux上LLMの準備→端末/音声等のSky/Eveの入口→依頼・自律継続範囲/上限承認→Linux/対応providerで実行→同一jobの成果・使用額をEveへ返す。通信回線も提供する場合はその開通証拠を別管理する。profileの追加だけで有料Agentの実行を承認しない。

eSIMアプレットの候補処理は、初期化時の端末能力確認、Sky/EveのSIMメニュー登録、本人確認後の起動案内、対応端末への`LAUNCH BROWSER`要求。URLは`https://avoado.si/`配下の公開起動参照だけを運び、SIM秘密、Bearer token、本人データを入れない。ブラウザのURL到達をeSIM所有証明にせず、購入時の本人session/追加本人確認と信頼済みissuer証拠で接続を確定する。

### 3. 新しい接続契約とアルゴリズム

仮仕様`rockstar.service-attachment/1`は、既存のowner、contract、entitlementとworkspace、端末公開鍵、親利用権epoch、scope、能力profile hash、manifest hash、audience、期限、nonceを結ぶ。独自暗号は作らず、署名のcanonical bytesと検証規則は実装前に固定する。これは提案中のRockstar内部protocolで、Apple/GSMA公認の新規APIではない。

**サービス有効化処理。** 信頼済みサービスissuerの署名/真正性、対象契約、時刻、通知順序を検証する。本人同意と契約版を確認し、ownerと契約の組に対してworkspaceを一回だけ取得/作成する。準備要求を永続化してから計算資源を確保し、同じoperation IDで再照合する。準備完了の読戻し後に接続証明を発行する。「サービス準備済み」と「端末で画面を開いた」を別記録にする。telecomのactive状態をサービス利用権そのものへ置き換えない。既存のdevice-install/grantは弱めず、新しいservice-profile用の証拠kind・契約版・adapterを実装する。

**能力照合。** 利用できる能力は「adapterが実装したAPI ∩ hostが許可したAPI ∩ 本人承認 ∩ server policy」。依頼の必要能力を満たす候補だけから、データ送信先、予算、実測遅延、電池/熱を条件に実行先を選ぶ。modelの推測やUser-Agent文字列で権限を増やさない。対応local Linuxがなければ承認済みcloudを選べるが、未承認の外部送信/追加費用へ自動切替しない。

**成果の変換。** 仕事は端末名に依存せず、同じjob ID、revision、型付きartifact、receiptを返す。端末に応じて文章、書類、音声、画像、3D、ゲーム、空間出力を選ぶ。原本とhashを保持し、音声化や簡易表示を原本と混同しない。作者の任意HTML/JSを管理画面へ注入せず、検証済みrendererまたは隔離したゲームruntimeで扱う。カメラのない端末へカメラ機能を約束しない。

**端末追加。** eSIMを持たないPC等には、既存ownerが相手端末の鍵と対象scopeを確認して子接続を発行する。子は親契約と失効epochへ従い、別の月額契約・全権root・SIM秘密の複製を作らない。QRだけを撮れば他人の環境へ入れる方式にはしない。Mini/Pro・Game作者も同じ能力契約へ接続する。

**接続証明の純粋検証（2026-10-20 / SIM01・OS10）。** `lib/rockstar-service-attachment.ts`に、仮仕様の署名対象18項目を固定順序・domain付きUTF-8 JSONへ変換する処理と、Ed25519署名を検証する処理を追加した。ROCKが管理する信頼済み鍵resolverだけから公開鍵を得る。発行元profileの現在状態、本人認証、明示した端末追加、端末鍵による当該要求署名、契約版と状態、workspace、親entitlement/epoch、端末失効、scope、能力/manifest hash、audience、期限を、呼出側が独立の現行記録から渡し、発行・更新・新規dispatchのたびに照合する。短期証明は最長15分で、署名や状態の不一致は拒否する。子端末は同じcontract/workspaceを参照するが別端末鍵を持つ。証明そのものはissuer署名済み開通証拠、端末秘密鍵所持、本人同意、Linux準備完了を生み出さない。現在は純粋logicと合成鍵の試験のみで、API/DBへの接続、実issuer、実端末での子接続・失効の受入は未完了。

### 4. 端末の受け皿とiPhoneの開発境界

画面とHTTPS対応がある端末には共通Web UIを基本とし、カメラ/音声/共有/通知等は既存OSの許可APIへ接続する。ブラウザを持たない機器には既存firmware上の小さな入出力adapter、既存OSのclient/bridge、または対応gatewayを使う。最低限のネットワーク・実行口もない機器、未知のセンサー/出力には追加adapterまたはhardwareが必要で、全機器が無改造で同じ機能を持つとはしない。新しいOS kernel/driver一式を全機種に作る方式へ戻さない。

iPhoneは、まず発行元が組み込んだアプレットと対象端末のCAT対応を検証する。対応がなければ開通の案内URL、Web、App Clip、必要時の薄いiOS clientが候補。App ClipはURL等から本人が起動する仕組みであり、eSIM通知だけで自動実行するAPIの証拠ではない。Appleが案内する開通後のcarrierページへの遷移も条件付きの例で、全追加方法で任意callbackを設定できる保証ではない。**完全無操作の前面起動/アイコン追加は独立した最終目標**で、公開APIだけで達成する証拠がなければApple/carrier連携または新しいOS hookを必要条件として残す。確認一回の経路をその達成へ読み替えない。

### 5. Linux上のローカルLLM・自律継続・専用資源

「ローカルLLM」はどの計算機に配置したかを明記する。クラウドの本人用Linuxにmodelを保存して推論する場合は、そのLinuxに対してlocalであり、iPhone内へmodel/VMを導入した証拠ではない。Pixel/Pro等の受入済みLinuxへ置く場合はその実行機内localである。両者は同じ仕事/権限/成果契約で選べるが、速度・費用・offline性は別に測る。

本人が離れる前に、目的・入力revision、許可Toolと送信先、実行場所、最大額/予約、期限、step/resource上限、途中検収が必要な操作、停止/保存を`autonomyGrant`へ固定する。executorの永続的な受領証拠を得た仕事は、携帯の圏外/電源OFFや画面終了後もその範囲で進める。LLMは次の手順を提案し、Brokerが権限/予算を強制する。新しい宛先・権限・予算が必要なら待機し、本人が不在だから承認を省略しない。

通信断は二つに分ける。(a) 携帯だけofflineなら、到達可能なcloud Linuxの受入済み仕事は続ける。(b) 実行Linuxまで外部ネットワーク断なら、導入済みmodel/素材による自己完結処理だけを有効なlease/資源内で進め、外部API/送信/新規model取得/収納確認は待機する。実行機がどこにも利用できなければ仕事を保存/queueし、動作したとは表示しない。offline端末で押した停止はexecutorの受領まで未確認。結果・未通知event・checkpointを永続化し、再接続で同じ仕事を照合する。

専用は本人別の権限、仕事、保存、実行隔離、計量を意味し、月16ドルで物理server/GPU一台を常時専有する約束ではない。既存worker/隔離/leaseを再利用し、仕事時に資源を確保、idle時に計算を休止して契約範囲の保存を維持する。常時大容量GPUの代金を隠さない。remote desktopの全画面動画配信を通常画面の必須条件にせず、操作と文章は小さな状態差分を返し、重い3D/Game等だけ対応stream/local描画を選ぶ。速度改善は対象端末・回線の実測前には確定しない。

### 6. 状態・保存・失敗・復旧

SIM、月額契約、端末接続、client開閉、runtime稼働、仕事/予算/請求は独立状態にする。通知の欠落/遅延/重複/順序逆転は同一issuerの現在状態と照合し、古いactive通知で失効を戻さない。既存`lib/rockstar-entitlement-event.ts`はrefund/revoke中心であり、これだけで完全な開通状態adapterが完成しているとはしない。

未払い/確認済み失効では親epoch更新と短期leaseで各端末の新規管理実行/更新を制限する。進行中の仕事は承認した停止・精算規則に従う。圏外の端末を瞬時に失効できたとはしない。通信断/再起動後は同じjobとoperationを照合し、結果不明を再実行しない。支払いと利用権復旧後は同じworkspaceとartifactへ戻る。保持期間、猶予、lease長、終了時のexport条件は未確定なので、版付き契約へ固定するまで実販売しない。iPhone自体の電話・設定・本人の外部appを封鎖する権限は持たない。

### 7. セキュリティと既存実装の再利用

issuer開通証拠、端末導入証拠、本人承認、hostの完全性は別種類の証明。iOSブラウザへ偽のAndroid/eUICC gateway receiptを作らせて既存の強いdevice-install gateを通さない。必要なissuer証拠adapterを別に実装する。ブラウザがSIM秘密鍵を直接利用できるとは仮定しない。SIM swap/端末交換は元のowner確認と親利用権の再照合を要する。

GrapheneOSの強みのうち、隔離・最小権限・署名更新・保存/復旧・権限を持たないmodelという設計原則を共通サービスへ適用する。GrapheneOS binary、Verified Boot、kernel hardeningがiPhoneへ移ったとは表示しない。通信/保存の暗号化と、cloud実行者が処理する平文の範囲も区別する。

再利用先は`lib/rockstar-entitlement-claim.ts`、`lib/rockstar-entitlement-event.ts`、`lib/esim-cloud-grant.ts`、`lib/esim-cloud-proof.ts`、`lib/workflow.ts`、`lib/sky-linux-service.ts`と同store、既存owner別成果/料金台帳。既存`zema`scope/保存キー、作者審査、package hash、本人承認、source/runtimeごとの受入を維持する。この設計保存で既存APIの保証を弱めない。

### 8. 料金・マネタイズ

月額16 USD＋決定後の利用枠＋事前単価/本人上限を承認した超過usage。複数端末を接続しても同じ契約を二重請求しない。通信料金、cloud token、Linux資源、作者の有料Agent、決済実費を明細で分ける。基本料の起算は契約で定めたservice activationの真正な確認後とし、eSIM画面のスクリーンショットだけで起算しない。作者への配分は既存Marketplace/検証済み収納と照合する。電子契約とsalt付きchain証明は維持し、個人情報や成果をchainへ載せない。

**Run to Earn。** 本人がSkyへAgent/World/自作Game/対応作品を登録し、その稼働で有用な仕事や体験を提供し、実利用・納品検収・支払者同意・収納を照合した収益を作者へ分配する。Linuxの稼働時間や消費tokenは原価/usageであり、その値だけから収益・報酬token・実資金を作らない。仕事receiptと売上/Earning Receiptを分け、返金/異議/作者の権利・同一成果重複を既存台帳で照合する。収益候補、検証済み収納、分配保留、払出可能、支払済みを区別する。Agent作者配分のsourceと、World/Gameの未接続収益adapterを分け、常時稼働で利益が出る保証や固定利回りは設定しない。既存の別商品や月最大888 cents条件を新報酬制度へ勝手に変更しない。

**PCに向かわず、携帯を持たない体験。** Mini、受入済みマイク/ウェアラブル、近くの画面等からEveへ目的を伝える。Skyが対応能力を選び、承認済み仕事をLinuxで続け、途中版・完成物・費用を同じjobへ保存する。受入済み音声/画面/空間/ファイルの受け皿へ返し、本人が修正/検収/停止する。実通話・メッセージ送信・製造/施工等の外部作用は、対応hardware/APIと送信先/内容の別承認を要する。話せた/Agentが動いたことを、作品完成や相手への到達へ置き換えない。Mini実機の入出力/秘匿/電源/通信は別の物理gateを維持する。

### 9. 責任と実装順

主担当はWeb / PWA / SitesのROCK、既存SIM01・WEB06・SKY21・OS10・DSP01へ接続する。ROCKは共通protocol、起動制御、能力交渉、子端末接続、仕事/費用/停止/復帰、表示の正確性を担う。EXTERNALは許可したprofile/appletの発行と真正な状態、Apple等のhost API/配布、compute供給。JOINTは同一profile・実端末・契約・仕事の一周。OWNERは既存承認の範囲で、料金枠/上限、接続端末、原稿/権限、地域と相手先を決定する。現在carrier/Appleへ依頼を送信したり、新しい有料契約を締結した状態ではない。

順序は、最新main/現branchと引継ぎの同期→既存強い証拠を保った接続protocolの純粋logicとfixture→許可済みtest profile/appletとiPhone/Pixelの起動実験→同一workspaceの準備/停止/復帰→二つのOSで同一jobの成果/使用額→eSIM非対応端末の本人承認接続→限定実課金の別gate。機種別full OS buildを先行必須にしない。

### 10. 合格条件と未決定事項

合格は、OSを書き換えないiPhoneとPixelで、同じprofile/発行証拠から準備、実際の画面起動、本人の一件実行、同一artifactとusage、端末追加、失効、保存、復帰までを追跡できること。OS/機種/版、全タップ/permission数、開通→準備/画面までの時間、同じjob/revision/hashを記録する。携帯切断後の自律継続、実行Linuxの外部通信断による待機/照合、手ぶら入力→非公開成果→明示的送信、真正な利用/収納→作者receiptも別に受け入れる。Web経由の手動起動だけならその区分で受入する。SIM swap、他owner、盗まれたURL、重複/古い通知、圏外、再起動、未払い、資源枯渇、二重計算/請求の拒否も別証拠を要する。

applet搭載可否、iPhoneのCAT起動、完全無操作経路、issuer/地域、compute境界、同時端末数、利用枠/単価/保持/leaseは未決定。発行元の能力表と同一test profile実験、対象OSの公開API/実測、原価計測と本人の料金判断で決める。「何にでも」は能力契約を拡張する設計目標で、全機種で全機能受入済みという表示にはしない。新規性/特許性や他社権利は未調査で、既存規格の組合せを世界初と宣言しない。

### 11. 一次資料と今回の到達点

- [ETSI TS 102 223 v18.2.0](https://www.etsi.org/deliver/etsi_ts/102200_102299/102223/18.02.00_60/ts_102223v180200p.pdf)、6.4.8/6.4.26: UICCからのメニュー・URL起動要求の規定。端末能力、要求の拒否、条件に応じた本人確認がある。iPhone対応の証明ではない。
- [TCA eUICC Profile Package](https://trustedconnectivityalliance.org/technology_library/euicc-profile-package-technical-specifications/): profile作成/搭載の形式は発行側・eUICC側の技術領域。[既公開v3.0](https://trustedconnectivityalliance.org/wp-content/uploads/2021/05/Profile-interoperability-technical-specification_V3.0-Final.pdf)はApplicationの例にJava Card appletを含む。現行発行元での採用は別確認。
- [GSMA SGP.22 v3.1](https://www.gsma.com/solutions-and-impact/technologies/esim/wp-content/uploads/2023/12/SGP.22-v3.1.pdf)の通知手順: 対象設定と接続に依存するbest-effort通知であり、即時/必達の利用権証明としない。今回PDF全文取得は失敗し、該当一次資料の検索抽出だけを確認した。
- [Apple CTCellularPlanProvisioning](https://developer.apple.com/documentation/coretelephony/ctcellularplanprovisioning)と[entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.commcenter.fine-grained): carrier向け権限が必要。Skyに許可済みとはしない。
- [Apple App Clip起動](https://developer.apple.com/documentation/appclip/configuring-the-launch-experience-of-your-app-clip)と[eSIM設定](https://support.apple.com/en-us/118669): URL/案内からの開始候補。自動導入/常駐/無操作起動の証明としない。

今回完成した範囲は、発明対象、protocol/アルゴリズム案、責任/状態/失敗/受入と既存実装との差の設計である。eSIMアプレット、issuer adapter、自動起動、跨OS接続、実Linux/課金の新規実装と実機受入は未完了。設計検査の合格とこれらを分けて記録する。

## Sky Linux 16の共通実装（2026-10-20）

初期プランは月額16 USDで一定のAI・Linux利用枠を含め、対象枠の超過分だけを事前単価/本人承認上限で課金する。枠の量・対象・超過単価は未確定。既存Package審査・eSIM grant・Zema workflowを専用Linuxの使用量、月次Invoice、入金確認後の作者精算へつなぐ。未払いの新規実行制限とデータ保持/支払復帰、電子契約とsalt付きchain証明を採用。[11項目の正本](sky-tools-complete-design.md#sky-linux-marketplace)。主担当Sky/MCPのROCK、既存SKY14/15/21・SIM01・BIL02。source/local fixtureのみで、Provider sandbox・実Linux/Pixel・本番・chain公開は未受入。新しい従量単価/無料量/上限は未確定。既存の別商品/旧台帳を新プランへ自動変更しない。

# SIM/eSIM-led RockstarOS service architecture

<a id="esim-si-subscription"></a>
## 最新方針: native SI版のeSIM導入・継続利用権（2026-10-18）

**目的・範囲。** 利用者の最新指示で、Pixel 10 GL066／`frankel`を最初の候補とするRockstarOS native SI版は、対応eSIMの申込→端末導入→本人と端末への利用権結合→月額サービス有効化を標準導線にする。以下の履歴にある「eSIM任意」は単独Sky Web/PWA等には残るが、このnative SI版の入手・継続条件には適用しない。eSIMはOS imageではない。署名済みimage、boot、更新、純正復旧の同一機種受入前は既存OS上client/browserへ案内し、eSIM導入だけでnative OSを導入済みにしない。

**本人の流れ。** 料金表・利用期間・終了時の制限を見て支払責任者が明示契約する。発行元のeSIMをOSのLPAで本人が導入し、carrier/issuerの真正な開通証拠、既存の署名install receipt、Rockstar account、端末、版付きofferを一回だけ結ぶ。月額service activationを保存してSky/ZemaとRockstar管理のLinuxローカルモデルを開く。契約中は対象Cloud modelの月間token枠を表示し、追加有料LLM/Agentは価格・job見積・上限・承認後だけ使う。既存のメインSIMまたはWi-Fiで通信できる場合も、eSIM契約状態の証拠と通信経路は別に判定する。

**入力・状態・保存。** 既存owner、order、profile digest、device ref、install receipt、gateway鍵、entitlement ID、contract/rate-card版、service activation時刻を結ぶ。carrier契約状態 `pending/active/suspended/terminated/unknown`、Rockstar月額 `pending/active/grace/restricted/ended`、端末導入 `client/native_accepted`、job/usage/invoiceを独立記録する。EID/ICCID、電波、IP、profileの画面表示だけで本人・契約継続を証明しない。本人別の失効event、順序、effective time、処理時刻を保存し、遅延・重複・順序逆転を冪等に処理する。本人の成果、請求明細、契約証拠は失効後も既存保持規則で回収できる。SIM秘密・model weights・原稿を請求台帳へ入れない。

**失効・故障・復旧。** 提携issuerの認証済み終了eventまたは契約上の期限を確認した時点で新規Cloud/Agent dispatch、Rockstar管理のLinuxモデル起動、追加課金を停止する。既に承認済みのjobは契約に定めた停止/精算規則と本人の上限で処理し、完了を推測しない。圏外で即時失効は証明できないため、期限付き署名offline leaseの上限を商品条件に明示し、期限超過・時計巻戻し・状態不明は新規管理実行を安全に停止する。月額未払い時は通知・契約上の猶予・異議対応を経て同じ管理サービスを制限する。一般の電話/緊急機能、設定、既存browser、汎用Terminal shell、データexport、請求/再契約を端末の機能停止やデータ消去で塞がない。再開はissuer契約復活とRockstar入金・本人/端末再照合の両方を要し、重複請求と二重jobを拒否する。

**責任・合格。** 主担当Billing/BIL02のROCKは既存claim/Broker/予算/明細へstate gateを接続する。EXTERNALはeSIM発行・正規契約event、Cloud usage、収納を提供し、JOINTは同一端末・契約・jobで開始/終了/復活を検証する。OWNERはoffer、月額、枠、契約先・費用上限と端末操作を決める。まずfixtureで開通、未開通、失効、返金、端末交換、通知の重複/逆転、圏外lease期限、月境界と同一job復旧を再現する。次にprovider sandboxでeSIM状態と請求を照合し、Pixelの署名OS/復旧を別gateで受入する。発行元、対象地域、確定価格/枠、offline lease長、停止・日割り・再開条件は未決定で、実提携と端末試験の後に版付きofferへ固定する。現状は設計のみ。

<a id="sky-shared-entry"></a>
## Sky共通入口仕様 — NFC・通常Web・任意eSIM・iOS

更新: 2026-10-12。利用者が指定したチャット「大学別NFCでSkyに接続」（`01a13164-efb3-7253-a986-5517c3db5a71`）の最新明示方針「OSでも出すがSky単体でも高品質に使える」と、このチャットのeSIMからiOSへSkyを追加したい要望を同期する。RQ01〜RQ49を保持し、既存WEB06 / SKY21 / SIM01の詳細化とする。主担当はWeb / PWA / Sites、ROCK。以下は共通入口の仕様であり、今回の保存を新しいruntime実装・公開・実機受入と数えない。

### 目的・提供範囲

SkyはAgent・Tool・MCPを発見し、作者・機能・価格・権限・実行先を確認して購入・接続・利用する単独サービス。最新の追加指示により、Sky単体の成果は各対応アプリ内へプラグインして表示し、Skyの成果一覧からも確認できる。OS版ではZemaが依頼・進捗・承認・停止・成果・使用額を統合管理する。RockstarOSは共通runtimeと対応端末への統合を担う。SkyのWeb/PWA利用開始はOS完成やeSIM購入を待たない。

通常URL、大学NFC/QR、任意eSIMのサービス案内は同じSkyへ収束させる。大学専用の別アプリや新しい顧客・購入・仕事台帳は作らない。大学名・おすすめ・用途例を変えても、既存SkyのAgentフィード、役割選択、Market、購入履歴、接続管理、保存済み成果を共用する。Zemaへの導線はOS版の仕事管理として維持する。フォーム中心の旧大学Hub案は後続の明示修正により主画面として退役し、briefは補助Toolとして保持する。

### 利用体験とiOSの到達範囲

1. 通常URLは`/sky`。登録済みNFC/QRは`/t/{tagId}`から`/sky/campus/{id}/hub`へ進み、同じ`SkyWorkspace`を大学文脈で表示する。対象はNYU / FIT / Columbia / Fordham / John Jay。未知・停止タグは既存解決規則に従い、特典や利用権を付けない。
2. 説明と用途を閲覧し、使いたいAgentを選ぶ。保存・購入・個人の接続には既存の本人sessionを使う。購入が必要なPackageは条件確認→既存Checkout→支払照合→購入履歴へ進む。購入済みであっても未接続・失効・返金・利用不可を区別する。
3. 接続先・送信データ・権限・実行可能範囲を確認する。OS版ではZemaで依頼を作り、Sky単体を組み込むアプリでは受入済みのアプリ契約から依頼する。有料Cloud実行では単価・見積・上限・予約を承認してから実行する。依頼欄への下書き引継ぎは送信や課金ではない。
4. 実行中・承認待ち・停止要求・失敗・結果不明を表示し、成果とusageを保存する。受入済みCloud jobは許可済み範囲で継続でき、再接続時に同じjobを読み戻す。保存済み成果はSky一覧と対応アプリで読み、OS版はZemaでも管理する。接続/購入の成功表示をAgentの成果へ置き換えない。
5. iPhoneはSafariで使い始め、本人が希望すればホーム画面へWebアプリとして追加する。NFC読取りにはOS通知を開く操作、PWA追加には本人操作が必要。eSIM追加だけでSkyを自動導入・常駐・他アプリ操作できる仕様にはしない。
6. eSIM提供形態では対応する販売/導入案内から既存claim・導入証明・利用権へつなぎ、同じSkyへ戻す。通常のWeb利用者にeSIM購入を要求しない。通信は本人が選んだメインSIM/Wi-Fiを使い、eSIM存在だけで本人認証しない。

iOS native clientのApp Intents/Siri/ショートカット/ウィジェット連携、App Clipによる初回体験は後続候補。今回の初期ローンチ条件に加えず、実装済みとも扱わない。採用時は公開API、対象iOS、配布方法、必要権限、停止/復旧、実機操作を個別受入する。常駐の価値はまず「Cloudで継続した仕事を通知・Zemaで受け取れること」で満たし、PWAアイコンを端末内の無制限な常時実行と説明しない。

根拠: [AppleのeSIM provisioning](https://developer.apple.com/documentation/coretelephony/ctcellularplanprovisioning/)、[NFC背景読取り](https://developer.apple.com/documentation/corenfc/adding-support-for-background-tag-reading)、[iPhoneのWebアプリ追加](https://support.apple.com/ja-jp/guide/iphone/iphea86e5236/ios)、[App Intents](https://developer.apple.com/documentation/appintents)、[App Clip](https://developer.apple.com/documentation/appclip/configuring-the-launch-experience-of-your-app-clip)。

### 入出力・状態・保存

- 入力: 許可済み大学ID、登録タグID/経路、本人session、Package/版、接続先、依頼、費用承認。任意eSIMでは既存注文・claim・署名済み導入証拠・登録gateway鍵を追加する。タグ/URLに原稿・秘密・購入権tokenを置かない。
- 出力: 同じSkyの大学別表示、条件/価格、購入・接続の状態、Skyの保存済み成果、対応アプリ内の型付き表示、OS版Zema job、暫定/確定usageと明細。
- 状態は直交させる: 入口/大学表示、本人、大学特典、購入/サービス利用権、接続先、job、予算/usage、client追加、SIM導入。`campus=columbia`、PWA追加、eSIM導入を認証済み・学生確認済み・支払済み・実行済みへ昇格させない。
- 保存は既存owner別Campus profile、commerce、service entitlement、MCP枠、`lib/workflow.ts`の仕事/revisionと成果物を使う。大学別manifestは表示/起動情報のみ。下書きは既存のtab内・10分・一回限りの引継ぎ。eSIM API署名は既存scope・期限・失効を再利用する。
- 複数入口でも同じ本人の購入・仕事を再利用する。ただし別originのSites間でcookie、IdP session、D1、購入権が自動共有されるとは扱わず、配備先と認証callbackを同一候補で検証する。

### 承認・料金・責任

一般MCP無料枠5、対象5大学の大学メールdomain確認済みstudent profileは6を保持する。在学そのものの証明は未受入で、student属性は自己申告。7枠目等の拡張価格・期間・条件は未確定のため販売無効。接続枠、Agent/Tool購入、Cloud usage、外部SaaS実費、通信料を分ける。既存Tool売上10%や保留中の月額条件をこの仕様で変更しない。現在のPC Connector由来の枠identityをそのままスマホCloudの本番quota受入に数えない。

ROCKは共通UI・状態表示・既存認証/利用権・quota・予算・復旧を担当。EXTERNALはApple/Android、IdP、Stripe、carrier、Agent/MCP Providerの対応範囲を担当。JOINTは同じ公開artifactで本人A/B・iPhone/Android・購入/実行/停止/再接続を検収。OWNERは配布先、学生確認水準、販売条件と費用上限、必要な端末操作を決める。既存承認を保持し、LLM出力や公開フラグから新しい権限・課金を推定しない。

### 失敗・復旧

NFC非対応/読取り失敗は同じ管理URLのQRまたは直接URLへ戻す。PWA追加を拒否してもbrowser利用を続ける。ログイン失効は既存return先へ復帰し、購入やjobを新規作成し直さない。Checkout戻りだけで支払を確定せず、結果不明は既存注文を照合する。Provider未接続・料金未確定・超過・失効は理由と次の操作を示し、実行を停止する。通信断後は同じjob/receiptを読み戻し、再送や二重購入を避ける。MCP枠の削除と実行中jobの停止は別操作として扱う。

### 進捗との対応（2026-10-12の観測）

| 対象 | 確認できた範囲 | 残る条件 |
| --- | --- | --- |
| GitHub main `8c5891f` | Columbia向け`[campusId]`公開入口が存在。同一SHAのcheck-run 8/8 success | 5大学のlocal差分・DB履歴・引継ぎとの統合。main CIをdirty作業木へ転用しない |
| local `37c06cec` + 未commit差分 | 5大学のHubが共通`SkyWorkspace`を参照。Sky内Zema、manifest、MCP一般5/学生6のsourceと先行local試験がある | 共通Skyへ戻した最新差分のUI再検証、同一artifact公開、実機/本人A/B受入 |
| 指定公開`rockstaros-kaiya.../sky` | 今回browserでAgentフィード、役割、Market、サービス/MCP接続、コードtimelineを読取り確認 | source/version・DBとの同一性、5大学差分の配備、本人/購入/Provider実行は未確認。画面表示を成功実行へ換算しない |
| 別公開`sky-marketplace...` | 既存大学監査のv39/source `8cd0a4d7`はこの別Siteの履歴 | 指定公開Siteとversion/DB/受入を混同しない。今回この別Siteは再受入していない |
| Cloud Agent/MCP | executor等のsourceはあるが`remoteAiPricingGateAccepted()`はfalse。スマホ単独MCP/本番費用の縦断受入は未完了 | Provider・信頼単価・本人上限・予約・usage照合・取消/再接続を同じ実行経路で受入 |
| eSIM/iOS | 任意claim/署名アクセスのlocal契約は既存。iOSはbrowser/PWAから入る設計 | 実eSIM/carrier/端末引渡し、iPhone実機。native iOS/App Clip/App Intentsは後続候補 |

先行大学試験の証拠は[大学NFC記録](evidence/campus-sky-entry.json)。その旧専用HubのUI試験を共通Skyへの変更後のUI合格に流用しない。今回の仕様同期・source hash・検証は`data/project-status.json`の`skyEntrySpecificationSync`へ記録する。Pixel APK、QEMU、full OSのgateも独立して維持する。

### 修正順・合格条件・未決定事項

1. **差分と入口を同期**: mainと先行dirty変更を保全し、`[campusId]`/`[campus]`の競合、0059〜0063 migration/journal、最新引継ぎを整合。同じsource SHA/build/配備先/DBを特定できること。
2. **単独Skyを受入**: 通常URLと5大学タグから同じAgentフィードへ入り、大学名/おすすめ/役割、Market、本人の購入・接続、Zemaへ進める。大学を替えても別ownerデータを表示しない。guestの閲覧/briefと保存・購入・実行の本人条件を分ける。
3. **代表Agent一件を縦断受入**: 機能/価格/権限/実行先→必要な購入照合→接続→見積/上限承認→Provider実行→成果/usage保存→Zema読戻し。無権限・失効・超過・停止・通信断・再試行も同じ候補で確認。false gateを外すだけで合格にしない。
4. **対象を限定して公開検収**: 指定Siteで同一artifact、本人A/B、一般5/対象学生6/超過/競合、iPhone/Androidの実NFC・QR・PWA、購入失敗/復旧を記録。Apple Payは適格環境の実Checkoutで別検収。未受入Providerや未確定有料枠を販売可能と表示しない。
5. **任意eSIMとiOS拡張**: 上記と同じSkyを再利用してclaim/失効/再接続を受入。App Clip/native連携が必要になった場合は別scopeで実装・実機検証する。Sky単独公開をeSIM/OS完成待ちに戻さない。

検証入口: `npm run project:update`、`npm run baseline:check`、`npm run design:check`、`npm run verify`。UI変更時は共通Sky・大学別Sky・Zemaの実操作を追加する。代表Agent/Provider、追加枠料金、学生確認水準、配布大学の運営条件、実eSIM発行元、iOS native採用は未確定。既存無料/決定的Toolから試せるが、その成功で有料Cloudを合格にしない。

Status: product direction and implementation contract, 2026-10-02. This document supersedes plans that position eSIM checkout inside RockstarOS as the primary product, or imply that the OS binary is stored on a SIM.

<a id="main-sim-cloud-service"></a>
## メインSIMを通信に使う共通クラウドサービス設計

更新: 2026-10-07。利用者の「雛形は同じものを使い」「mainsimから基本は通信を享受しクラウドで動くシステムを設計したい」という明示指示による具体化。主担当はSky / MCPのROCK、既存taskはSKY19、BIZ01、BIL02。この提供形態では新しい通信回線の購入を共通必須条件にせず、既存メインSIMまたはWi-Fiのインターネット接続を使う。以下の旧SIM販売・開通フローは通信同梱offerに適用する。通常Web/app、native/local、既存の通信同梱経路も保持する。今回の成果は設計であり、実eSIM連携・本番課金の実装完了ではない。

### 1. 目的と実現範囲

商品は「eSIMを入口に利用開始できるRockstarOSクラウドサービス」。Skyを含む画面はスマホのclient/browser、仕事の実行はクラウドへ置く。端末OSの置換は不要で、eUICC内にRockstarOS、Sky UI、LLMを格納・実行する設計にはしない。eUICC自身の専用OSや限定的なアプレットと、RockstarOSの汎用runtimeは区別する。

メインSIMの通信でこのサービスへHTTPS接続する構成は可能。一方、独自の「通信契約なし・認証専用eSIM」が任意の市販端末へ標準手順だけで入ること、eSIM追加だけでSkyが起動すること、任意のeSIM内鍵をbrowserから使えることは未確認。実profileを配布するなら、発行元・SM-DP+・LPA・端末/OSの権限と対応条件を受け入れる。carrier/OEM協力なしの汎用eSIM製品を販売可能とは表示しない。

これはeSIM同士が直接通信を融通する方式ではない。スマホのclientが、OSの選んだ既存の通信経路でクラウドに接続する。回線料金は既存メインSIM契約に従い、RockのAgent料金とは分離する。

### 2. 利用体験と構成

```mermaid
flowchart TD
  Entry[対応するeSIM販売・導入連携] --> Claim[一回限りの署名済みサービス利用権]
  Direct[通常Web/appのサービス登録] --> Claim
  Claim --> Account[Rockstar本人アカウントへ結合]
  Account --> Client[端末のRockstarOS Home / Sky / Zema]
  Main[利用者が選ぶメインSIM・既存契約] --> Net[端末OSのインターネット経路]
  WiFi[Wi-Fi] --> Net
  Client --> Net
  Net --> API[本人認証・利用権・権限確認]
  API --> Quote[単価・見積・上限承認・予算予約]
  Quote --> Jobs[既存の永続仕事管理]
  Jobs --> Agent[隔離されたクラウドAgent / Tool]
  Agent --> Result[成果・利用量・請求照合]
  Result --> Client
```

1. 対応offerの導入案内またはサービス登録から、同じHomeへ進む。実eSIMの追加とサービス登録のQR/URLを明確に区別する。サービス用コードをeSIM activation codeと表示しない。
2. 一度だけ本人登録し、署名済みclaimをredeemする。eSIM経由なら受入済みの発行/導入adapterから引き渡す。profileの存在、EID/ICCID、IPアドレスだけで本人認証しない。
3. モバイルデータは本人が設定したメインSIMを基本とし、Wi-Fiも利用する。追加eSIMへのデータ切替、APN変更、ローミング有効化、VPN導入をサービス開始時に自動実行しない。browserはSIM指定/経路保証ができないため「現在の端末接続を使用」と表示する。メインSIM固定を商品条件にする場合はnative側の経路確認・切断時停止を別受入する。
4. SkyでAgentを選び、Zemaに依頼する。送信情報・権限・単価・見積範囲・最大額・圏外中の継続可否を確認して開始する。
5. 実行中は進捗と予約額/暫定利用額、完了後は成果と項目別利用明細を表示する。通信復帰時は同じjobを取得する。

### 3. 共通の雛形と変更点

共通化する対象は既存のHome/Sky/Zema UI、本人/端末session、署名claim、Package registry、`lib/workflow.ts`の業務状態、A2A/直接LLMの実行、予算予約、receipt、支払い照合。eSIMごとにOSやクラウド基盤を複製しない。共通サービス上でownerごとにデータ・権限・予算を隔離する。必要なAgentだけjob単位の隔離環境へ送る。

offer設定は既存の`issuerId + offerId`とPackage key/manifest hashを再利用する。追加候補の設定は`entryMode`（既存サービスclaim／提携eSIM連携）、`connectivityPolicy`（端末の既定経路）、`proofPolicy`（account claim／検証済みprofile連携）、`tariffVersion`、対応端末/地域。これらは設計上の候補で、現schemaや環境変数に実装済みという意味ではない。料金・提供期間・scope・鍵はversionと失効規則を持つ。

共有してはいけないものは利用者session、秘密鍵、claim code、実eSIMのprofile認証情報、予算と台帳。テンプレートが同じでも、これらの識別子・秘密・所有権は固有にする。自作テンプレートの複製は実eSIM発行手順の代替にならない。

### 4. 既存コードとの差と修正順

- `lib/rockstar-entitlement-claim.ts`は既に`physical_sim | esim | service_only`を受け入れる。まず`service_only`と既存本人sessionを使い、通信プラン購入なしのクラウド体験を検証する。これは実eSIM導入を検証したことにはしない。
- 現在の`lib/esim-cloud-grant.ts`と`lib/esim-cloud-access.ts`は、有料eSIM注文、profile binding、署名install receipt、trusted gateway、審査済みStarter Packを必須にする。通信同梱型として保持し、単にJOINや署名検査を外して新方式へ流用しない。汎用サービス利用権経路と、実eSIMを根拠にする追加認証adapterを分離する。
- `lib/rockstar-service-access.ts`の既存claim経路を再利用し、本番は利用権検査を有効にする。previewの検査省略を製品の認証設計にしない。eSIMアクセスcookieを支払い承認に用いない。
- `lib/sky-usage-payment.ts`の直接LLM回収はtest専用で、A2Aは既存Wallet精算である。今回の設計を全Agentの本番従量課金完成とは扱わない。

最初に最新main・作業branch・この引継ぎ優先順位を同期し、未commitの既存作業を保全する。その後、サービスclaimのみのfixture → cloud job/予算/usage → 提携eSIM adapter → 実端末 → Provider sandbox/請求照合の順で受け入れる。クラウド体験とeSIM連携を別々に検証してから同じartifactで一周させる。

### 5. 入出力・状態・保存

入力はowner、サービス利用権ID、端末session、Agent/Package版、入力digest、scope、価格版/通貨、見積、予算上限、同意、冪等キー。実eSIM連携時だけ発行元と検証済みprofile/導入証拠の参照を付ける。出力は利用可能scope、同じjob ID、進捗、成果参照、利用明細、請求/入金状態。

状態は独立した軸で保存する。既存の仕事状態名を新設しない。

- 通信: 接続／切断／不明。browserのonline表示だけでSIM種別を確定しない。サービスに第二回線は必須でない。
- profile: 対象外／未発行／発行済み／導入確認／無効・削除。メインSIMの通信成功をRock profileの導入確認へ転用しない。
- サービス利用権: 未結合／有効／期限切れ／失効。停止しても保存済み成果・明細の本人回収経路は残す。
- client: browser／受入済みapp／受入済みnative OS。eSIM対応をnative OS受入と混同しない。
- jobと費用: 保存された業務状態、予約額、暫定usage、確定usage、invoice照合、入金を別レコードで結ぶ。

既存D1/永続Workflow・暗号化成果物保存・Wallet台帳を使い、owner/revisionの競合判定を維持する。Provider鍵はサーバー側、端末sessionは既存安全保存、eSIM activation secretは既存専用配送に限定する。原稿、SIM秘密、実アカウント情報をGitへ保存しない。

### 6. 従量課金と収益

顧客料金の基本式は「検証した利用量 × 事前提示した販売単価」の合計。Agentに応じて入出力token、計算時間、保存量/期間、外部Tool/API実費などから必要な項目だけ定義する。すべてを必ず課金する要件ではない。Provider原価への上乗せ方式または原価とservice feeを分ける方式を選び、同じ費用を両方へ二重計上しない。既存Tool販売10%も別の取引として照合する。

Rockの貢献利益は顧客売上からProvider/計算原価、作者配分、決済費、返金等を引いた残額であり、純利益や利益保証ではない。単価・通貨・最低額・請求周期・税・返金はBIZ01で確定する。通信料金は既存キャリアの別請求とし、キャリア合算請求は別契約が成立するまで実装前提にしない。AWS案件の自己負担0条件と既存料金保留を変更しない。

上限は事後集計だけで守れない。子job/並行jobが共通予算へ原子的に予約し、次の処理単位・最大出力・停止反映待ちの原価を予約内に収められるときだけdispatchする。実行時間・出力・価格の最大値を制限できないProviderは、この上限保証モードでは有料実行を許可しない。予算予約と実資金確保は別gate。増額時は再見積・本人承認を要求する。

### 7. 失敗・停止・復旧と承認

回線切替/圏外でも、クラウド受付済みの仕事は事前の継続同意と上限内で進める。未送信の依頼を受付済みにしない。通信復帰後は同じowner/job/keyで照合し、応答不明を自動再実行しない。利用量通知はprovider event/sequenceで重複排除し、遅延・欠損は未照合として扱う。

eSIM削除をサーバーが即時検出できるとは限らない。サービス失効は認証済みpartner event/本人操作/有効期限で処理し、事前に定めたjob停止規則を適用する。切断と失効は別である。紛失端末sessionは失効し、本人再認証後に別端末で同じ成果を回収する。claim/回線購入/モデル出力からTool権限や支払同意を推論しない。送信情報、外部作用、費用上限を既存承認境界で確認する。

### 8. 責任と合格条件

ROCKは共通UI、利用権、owner分離、権限、仕事/予算/明細、adapter契約とfixtureを担当。EXTERNALは実eSIM発行/LPA/OEM能力、クラウド実行・usageと請求、決済を提供。JOINTは同じprofile/端末/job/価格版での一周の検証を担当。OWNERは端末通信設定、接続・外部作用・上限を承認し、事業者として販売料金/契約条件を確定する。

受入は次の順で記録し、どこまでを検証したかを分ける。

1. **共通サービスfixture**: 通信プランなしの正当な`service_only` claim→本人→Sky→見積→承認→job→usage。同時処理・改ざん・別owner・期限切れ・上限超過を拒否する。
2. **接続変更**: メインSIMからWi-Fi/圏外/復帰へ切替えて同じjobと費用を回収。勝手なデータSIM変更・二重実行・二重請求がない。browserでは「メインSIM固定を強制した」と記録しない。
3. **実eSIM入口**: 契約済み発行元とexact端末/OSで発行・導入・サービス引渡し・失効/削除・端末交換。追加profileがデータ回線でなくてもサービスへ到達することを実測。Pixel 10 GL066/frankelは最初の試験候補で、過去APK23/23はこの証拠に転用しない。iPhoneは別受入。
4. **クラウド/課金**: 実Provider sandboxで正常・失敗・取消・停止遅延・応答消失・meter重複を試し、同じjobのusage/価格/請求/入金を照合する。商用条件と資金確保を受け入れてから限定本番へ進む。

未決定は、実eSIMを提供できる提携先と端末範囲、profileを無効化した後の利用権規則、提供期間、料金/回収方式、Provider上限保証。提携先の回答と同一候補の実測で決める。実eSIM経路が成立しない場合はサービス専用版を提供可能かを別に評価し、「eSIM導入済み」とは表示しない。

### 9. 調査根拠と現時点の証拠

2026-10-07確認の一次資料: [Android eSIM architecture](https://source.android.com/docs/core/connect/esim-overview)はcarrier profile、LPA/SM-DP+と権限境界を説明する。[GSMA仕様一覧](https://www.gsma.com/solutions-and-impact/technologies/esim/esim-specification/)はprofile provisioningの仕様体系の入口。[Apple Dual SIM](https://support.apple.com/en-us/109317)はデータ回線選択と切替条件を、[Pixel Dual SIM](https://support.google.com/pixelphone/answer/9449293?hl=en)は既定のデータSIM選択を説明する。これらから既存データ接続上にクラウドclientを構成する設計判断を導いた。サービス専用eSIMの汎用配布が保証されるとの記載ではない。

GitHub mainは`0fbf688b4585b829f9e34d37799d446cb5a66b32`を観測し、同SHAのcheck-runs 6件（verifyとSPIDER 5件）はcompleted/success。local HEADは`37c06cecc0dad6ebd59aa64a2900413df0ba2d68`、branchは`codex/esim-cloud-access`で対応remote refなし。多数の既存未commit差分を保持したままの設計保存で、mainのCI結果はこの作業木の合格証拠ではない。GitHub保存・main統合・公開は未実施。

## 2026-10-05 Cloud OS business direction

Authority: explicit user instruction and same-day clarification on 2026-10-05, recorded in `data/product-baseline.json.cloudOsUsageBusinessIntent`. The user explicitly limited this direction to the eSIM pattern and said not everything needs to use it. This entire document describes one optional service offering, not a replacement for the whole RockstarOS product. Preserve native/local LLM/offline agents, ordinary app/Web entry without eSIM, and capability/consent-based hybrid operation. Offer the eSIM path only for accepted compatible devices/channels; do not require an eSIM from every user. This clarification takes precedence over telecom-first wording below and earlier sales-positioning text. This optional offering is an eSIM-accessible RockstarOS cloud OS service. Sky agents execute in the cloud; this offering earns a disclosed margin from metered agent usage. Carrier connectivity supports access and is not this offering's product category or primary revenue model. Physical-SIM channels remain optional prior design, not a new requirement for this clarification.

The eSIM is an onboarding/access entry, not a runtime for an OS binary or model and not independent permission to use a person's apps or funds. Entry integration (carrier/distributor handoff, client link or entitlement delivery) is a design dependency requiring a real accepted route. The runtime uses authenticated Rockstar identity and service entitlement; possession of a profile or connectivity alone does not authenticate the user. Browser/app access may use other available networks after that identity is established.

**Experience and responsibilities.** One account opens Home, chooses a Sky agent, supplies input, reviews the quote and maximum spend, approves, follows cloud progress and retrieves the result and itemized usage. ROCK owns entitlement binding, job/consent identity, shared budget reservation, metering deduplication, stop/recovery, UI and ledger. EXTERNAL supplies provider execution, signed/verified usage or authoritative usage lookup, invoices and payment settlement; entry partners supply the accepted eSIM-to-service handoff. JOINT acceptance spans the same job/order across those systems. OWNER chooses input, permissions and the spend limit, and supplies the business's pricing and commercial terms.

**Inputs, outputs and storage.** Bind owner, entitlement, agent/package version, provider/model, immutable input digest, quote/rate version, currency, metering unit, cap, consent and idempotency key before dispatch. Persist jobs, reservations, usage events and receipts in the existing owner-scoped durable cloud store; keep provider API keys server-side and eSIM activation secrets out of prompts, logs and this repository. Return durable job state, results/artifact references and itemized provisional/confirmed amounts. Entitlement, carrier state, job success, metered usage, invoice reconciliation and customer settlement stay distinct.

**Failure and recovery.** Duplicate events charge once; response loss reconciles the same operation and never triggers blind redispatch. Reconnection retrieves the same job. Unsent work is not cloud-accepted work. Consent fixes whether accepted work may continue while the client is offline. Cap exhaustion stops dispatch or requests fresh approval; revoked entitlement blocks new work without deleting durable receipts. Cancellation records any provider work already consumed; uncertain provider costs remain unresolved instead of being fabricated or silently charged. Save/restore and owner isolation apply to results and receipts separately.

**Revenue contract.** Customer usage charge minus provider/model/compute costs, any author share, payment costs and refunds yields the contribution margin; operating costs and tax are additional before net profit. No numerical margin or guaranteed profit is approved. Candidate meters such as tokens, compute time, or a bounded agent operation must be selected per agent/provider from measurable cost data. A completed task alone is not proof of usage or settlement. Define failure/retry/cancel billing and avoid charging twice for the existing Sky Market 10% sale commission and cloud usage service fee. Preserve the held USD 8.88 policy and free discovery/connection rules; running paid cloud work is separately quoted.

**Acceptance and undecided choices.** BIZ01 specifies units, rates, currency, minimums, margin/cost allocation, caps and refund terms from a contracted sandbox's measured usage; SKY19 integrates the one-account Sky/Zema experience; BIL02 accepts dispatch → usage → provider invoice → customer charge reconciliation. Require normal completion, failure, cancellation, duplicate/delayed events, lost response, offline reconnection, cap exhaustion, revocation and cross-owner denial on one candidate. Real seller/carrier entry, provider costs and actual invoices remain unaccepted. Pixel/QEMU native installation remains a separate supported-device gate and is not a prerequisite for validating the browser cloud service. This document change does not enable live billing, carrier contracts, public release or device flashing.

Implementation started from main `9f64aee3`, merged into work branch `codex/esim-cloud-access` at `37c06cec`. GitHub main observed later as `80a662cc`; this worktree is not that remote revision. Earlier audit snapshots describe their recorded revisions, not the current main.

## eSIMに結び付く端末鍵でのCloud APIアクセス（2026-10-07）

**目的と責任。** 利用者の即時実装指示に基づき、Security / Identity / Complianceを主担当（ROCK、既存SIM01）とし、eSIMに登録済みのgateway鍵をCloud APIへのアクセスキーとして使う経路を追加する。既存の購入・profile binding・署名導入receipt・gateway trust・Starter Pack・期限・scope・取消を再利用する。これはeUICC内秘密鍵や現在のSIM挿入/有効状態を毎回直接検証する機能ではない。署名者は既存のeSIM gateway鍵であり、実eSIMの鍵保管・carrier privilege・端末adapterはEXTERNAL/JOINTで別受入する。暗号鍵による個人データの秘匿やサーバー非保存も別の要件である。

**利用体験と承認。** 初回は本人accountでeSIMの購入・導入・利用権を確認し、購入画面の「クラウドアクセスを開始」で既存のキーを有効化する。対応clientはそこで得た公開`key.id`を使い、端末の登録済み秘密鍵で要求へ署名する。秘密鍵とブラウザBearerの送信は署名経路には不要。Home/Sky/Zemaの既存APIへ同じownerで接続する。Toolの外部作用、見積共有、課金の承認は既存の別gateを通す。従来のcookie経路は維持し、署名の不成立時にcookieや別owner sessionへ自動fallbackしない。

**入力と出力。** `Authorization: RockEsimProof <base64url JSON>`、schema `rock-esim-cloud-request/1`。署名対象はschema、accessKeyId、requestId、signatureAlgorithm、HTTP method、origin/path/queryを含む完全なURL、bodySha256、issuedAt、expiresAt。`rock-esim-cloud-request-signature/1`とNULのdomain prefixを含む固定順JSONへ署名する。ES256はP-256/SHA-256の64-byte P1363、Ed25519は64-byte署名。HTTPS必須（local loopback HTTPだけ試験例外）、有効期間最大60秒、未来時刻許容5秒、本文最大1MiB。API固有の小さい入力制限も維持する。private key、原文、eSIM activation情報をproofに含めない。出力は既存APIのowner-scoped結果で、署名自体は支払いやTool成功の証明ではない。

**状態と保存。** migration `0061_esim_cloud_proof_uses.sql`を既存0059/0060の後へ適用する。リプレイ拒否表はaccess_key_id、request_id、expires_atのみ。要求本文・署名・秘密鍵は保存しない。scope・元注文・導入証明・gateway公開鍵と現在の指紋を再照合し、署名検証後にD1のunique制約で一回だけ使用済みにする。同時に同じproofが来ても一件だけ通る。同一HTTP Request内の複数scope確認は内部メモリで共用するが、別のHTTP要求へは共用しない。期限切れ行は認証時に最大256件ずつ削除する。既存job/利用明細/任意成果の保存仕様は変わらない。

**失敗・復旧。** 署名・owner/注文の鍵結合・URL/本文・有効期限・scope・現trustが不一致なら401。migration/DB障害は安全に停止する。既存のrotate/revoke、返金、期限切れ、gateway失効で署名アクセスも停止する。通信結果不明時は同じ署名を再送せず、新しいrequestIdと署名で既存job ID/idempotency keyを照合する。署名を新しくしても業務操作の二重実行を認めない。紛失時は通常accountで失効し、鍵の再登録と利用権の確認を経て復旧する。HTTP redirectは署名clientで拒否する。

**client導入。** `lib/esim-cloud-proof.ts`の`signEsimCloudRequest(request, keyId, algorithm, signer)`を使う。signerは署名対象bytesを受け取り、端末の安全な鍵保管領域で署名したbytesを返すadapter。秘密鍵を引数として渡さず、ブラウザで新しい鍵を生成して登録済みeSIM鍵の代わりにしない。通常accountでのキー発行・管理と、端末署名によるCloud API利用は別経路。実Android/iOS/eUICC signerのUI接続は未受入で、関数だけで端末対応を表示しない。

**合格条件・未決定の決め方。** `node --experimental-strip-types --test tests/esim-cloud-proof.test.mjs tests/esim-cloud-access.test.mjs`で両署名方式、改変、TLS、期限、本文上限を確認する。`npm run build`後の`TMPDIR=/private/tmp node scripts/check-work-api.mjs`で署名アクセス、本文の業務保存、要求再利用/並行再利用拒否、scope、key rotation、返金、誤鍵、管理API拒否を同じWorker/D1 fixtureで検証する。全体は`TMPDIR=/private/tmp npm run verify`。端末adapter方式・eUICC保管可否・実profile削除の即時検出可否は契約先仕様とexact端末で決める。合成署名の合格を実eSIM・実端末・公開済みに置き換えない。

ローカル検証結果: focused 12/12、Worker/D1 API 1178 assertions、CSV113、`npm run verify` exit0。実eSIM・端末・公開未受入。[同一sourceの証拠](evidence/esim-signed-access-local.json)。

## Optional eSIM cloud access implementation

**Purpose and experience.** An eligible owner opens `/sky/purchases`, checks the eSIM order, completes supported device installation, then selects **クラウドアクセスを開始** after signed install and authenticated gateway/Starter Pack confirmation. `/connect` explains this optional route alongside ordinary Web/app access. The owner can inspect the expiry, rotate the browser key or revoke it on the same purchase. Installation itself does not open a browser or create a cloud login automatically; the carrier-to-client handoff still needs partner/device acceptance.

**Responsibility and input.** ROCK owns `GET/POST /api/esim/orders/{orderId}/cloud-access`, owner separation, authorization and storage. EXTERNAL supplies carrier installation proof; the accepted device gateway supplies the existing signed receipt. OWNER/JOINT configure contracted service terms and production trust. The server accepts only an existing live paid, unrefunded order, its profile binding and exact installed/enabled receipt, the corresponding trusted device key and reviewed Starter Pack hash. A boolean from a browser never substitutes for those proofs.

**Configuration.** Apply migration `0059_esim_cloud_access_keys.sql`. `ESIM_CLOUD_ACCESS_POLICIES_JSON` is a server-only JSON array of `{packageKey, manifestSha256, accessDurationDays, scopes}`. Each unique purchased package/hash must have an explicit duration of 1–366 days and unique scopes from `rockstaros_access`, `sky`, `zema`, `agents`, including `rockstaros_access`. Missing/invalid policy disables grants. Reuse `ESIMGO_PLAN_CATALOG_JSON`, the immutable order pricing snapshot, `ESIM_INSTALL_RECEIPT_KEYS`, and existing configured/attested device gateway keys. Do not put signing keys or real activation material in this document. Duration/scopes must be agreed for each real offer; test fixture values are not product pricing.

**Output and state.** GET returns eligibility, scopes, service expiry and public key metadata; states are `not_issued`, `active`, `suspended`, `expired`, `revoked`. POST accepts `issue`, or `rotate`/`revoke` with the current `expectedKeyId`; a stale identifier returns 409. Issue/rotate returns only metadata and an HttpOnly, SameSite=Strict `/api` cookie (Secure outside loopback HTTP). Raw secrets never appear in response JSON, page markup, Web storage or logs. One active key per order is enforced in D1. Browser possession is a bearer credential, not hardware proof of possession; it remains linked to the originally attested order/device and is revalidated against that evidence.

**Storage and authorization.** The separate cloud-key table stores SHA-256 token hashes, owner/order/device/receipt references, granted scopes, timestamps and rotation links. It preserves audit rows. Normal authenticated Rockstar identity manages keys; a cloud key cannot issue/rotate itself, administer accounts, or call payment endpoints. Only explicitly allowlisted cloud work APIs accept it. Service scopes are intersected with the key's own scopes even in preview mode; broader owner entitlements cannot widen a cloud credential. Existing trusted gateway authentication is retained. Valid eSIM Starter Pack references appear in the existing entitlement response for display/package handoff; that display is not Tool approval.

**Failure and recovery.** Every use rechecks current paid/refund status, profile/install receipt, gateway trust, Starter Pack review/hash and policy. Expiry or changed evidence stops access. Credentials last at most 30 days and never outlive the service term, measured from the original gateway activation; rotation does not renew the service. Concurrent rotations yield one winner; old keys stop working. Concurrent revocation is compared with the original revocation state. If eligibility changes during replacement, keep a revoked, discoverable predecessor for explicit retry. When an issue response is lost, refresh state and rotate the saved key; never recover a plaintext secret from storage. Configuration/database failures fail closed without exposing internal errors. Stopping this key preserves existing jobs/receipts and does not cancel separately held service claims.

**Fees and acceptance.** The key resolves to the same owner used by existing quote, budget, usage and receipt stores. It does not create a charge, approve a Tool invocation, override the remote AI pricing gate, or implement carrier billing. Account management, provider connections and payments still require normal account/session authentication. Cloud-key access covers the Workbench/cloud APIs; full `/chat` provider administration remains an account flow. Local synthetic tests cover proof prerequisites, foreign owner, Origin, credential secrecy, concurrent rotation, scope isolation, expiry/refund/key revocation and restoration. Real carrier activation, device acceptance, external provider execution, commercial duration/prices and monthly/carrier collection remain distinct open gates. Evidence: [eSIM cloud access](evidence/esim-cloud-access-local.json).

## Product definition

This optional offering is a physical SIM or eSIM offer, sold through Rockstar and partner channels, that includes access to RockstarOS services. The SIM identifies/activates a carrier subscription where applicable; a separate signed purchase entitlement links the purchase to a Rockstar account. The OS binary is delivered through a supported device installation/update channel, or services run in the existing OS app/browser client. A SIM purchase alone neither activates a carrier profile nor installs an OS image.

Users choose the offer for three reasons, in order: fast access to cloud LLMs and agents; transparent usage pricing; integrated access to Sky and Zema with little setup. Cloud LLMs and agents execute remotely and are metered by use. Their charges are itemized separately from carrier connectivity charges.

## System boundaries

```mermaid
flowchart LR
  Channel[Retailer / carrier / Rockstar channel] --> Purchase[SIM/eSIM offer + purchase reference]
  Purchase --> Carrier[Carrier activation and connectivity]
  Purchase --> Claim[Signed service entitlement claim]
  Claim --> Identity[One Rockstar account and device session]
  Identity --> Setup[Capability check and device route]
  Setup --> Native[Supported signed OS install]
  Setup --> Client[Existing OS app / browser]
  Native --> Home[RockstarOS Home]
  Client --> Home
  Home --> Sky[Sky marketplace]
  Home --> Zema[Zema task workspace]
  Home --> Agents[Integrated agents]
  Agents --> Quote[Rate, estimate, cap and approval]
  Quote --> Cloud[Durable cloud execution]
  Cloud --> Progress[Progress, result and itemized receipt]
  Progress --> Home
```

Carrier activation, purchase entitlement, Rockstar identity, device installation, cloud execution, and cloud billing are separate records and acceptance gates. Preserve channel-neutral signed claims, owner-scoped device authorization, device capability/attestation, durable A2A/Workflow jobs, recovery, quote and metering infrastructure, and shared budget reservations.

## Onboarding contract

1. At purchase or first launch, show the offer, included RockstarOS service scopes, supported regions/devices, carrier eligibility, and separate connectivity and AI pricing. Support physical SIM and eSIM purchases from more than one channel.
2. Activate eSIM only through an explicit supported carrier flow; for physical SIM, guide insertion and show carrier state when it can be read. Do not infer activation from a service claim.
3. Sign in once to a Rockstar account. Redeem the channel-neutral, one-time signed purchase entitlement and show which services it includes. Do not require separate registration for Sky, Zema, and integrated agents.
4. Read or request a device capability snapshot. Route eligible exact models to a signed, recoverable RockstarOS installation flow only after that model's install path is accepted. Route other devices to the supported existing-OS app/browser. SIM/eSIM support does not imply OS-install support.
5. Land on one Home with direct Sky, Zema, and Agent entry points. Present included/recommended agents as optional ready-to-use services; install or invoke them only under their own reviewed package, permission, and provider constraints. Additional agents remain discoverable through Sky.
6. For paid cloud work, show provider, model/agent, visible rates, estimate, currency, usage meters, user-set maximum spend, and any prompt-sharing disclosure before dispatch. Require explicit authorization. Hold execution at the cap and ask again before any higher spend.
7. Persist the accepted job and consent before dispatch. Cloud execution continues within that accepted scope while the device is offline. On reconnect, retrieve the same job's progress, result and itemized provider usage; never duplicate a task because a response was missed.

## Execution and cost contract

The device UI is a client and approval surface. Cloud workers and contracted providers perform cloud LLM/agent work. Each job binds the authenticated owner, task ID, provider/agent and version, request digest, quote/rate version, budget cap, consent, expiry, and offline-continuation choice. The cloud job ledger is authoritative for progress and recovery. Results and meter events sync to the device by the same job ID.

Before work, display rates and a bounded estimate. During work, display provider-reported usage and current reserved/estimated spend with its provisional status. After work, show itemized metered usage and receipt, and distinguish provider-reported usage from invoice-reconciled or settled amounts. A local fixture or usage row is not a bill. Enforce user caps in the shared reservation and dispatch layer; exceeding a cap requires a new quote and explicit approval.

The device can queue a new local task offline only when it is clearly labeled local. It cannot reach a cloud provider while the device has no route. Previously accepted cloud work can continue because the cloud already has the durable job, input and authorization.

## Device and service interface

- Shared Rockstar identity/session across the installed client and RockstarOS services; Sky, Zema and agents do not each create accounts.
- Home provides direct routes to Sky discovery, Zema work, agent task submission, active jobs, results and spending.
- Capability-based routing describes model, memory, storage, OS/bootloader, network and trust features. It recommends an install or client path based on exact accepted compatibility records; it never exploits or overrides a device.
- eSIM/SIM modules handle supported provisioning/activation integrations only. They do not contain the RockstarOS image or authorize arbitrary device control.
- Offline continuity UI distinguishes cloud jobs already accepted, unsent drafts, local-only work, and actions waiting for approval.

## Audit and backlog

| Priority | Work | Existing assets | Acceptance still needed |
|---|---|---|---|
| P0 | Finish one-time purchase claim and short onboarding across purchase channels | signed channel-neutral entitlement claim, issuer SDK, encrypted/idempotent seller-to-Rockstar delivery API, `/connect`, common identity/device session, Home routes | connect seller checkout to claim issuance and the seller's buyer-delivery channel; validate expiry/resend/refund/reissue in a contracted sandbox; carrier activation readback and end-to-end customer acceptance |
| P0 | Make cloud execution and pricing user-trustworthy | durable A2A jobs/recovery, signed quotes, budget holds, meter/receipt verifiers, itemized UI, explicit consent, [operator stop/recovery procedure](sky-cloud-operations-runbook.md), Android Shell source path for quote review → separate device-credential Wallet approval → exact quote-bound hold → Broker proof → explicit Cloud approval → same-ID recovery | compile and run Android Core/AIDL/APK/instrumentation on an equipped CI/device host; accept real Provider contract and sandbox, live rates/meters, invoice reconciliation, funded settlement |
| P0 | Route across device families | capability snapshot/attestation, Android client/core source, browser app | exact-SKU compatibility matrix; Android build/APK/Binder/device tests; supported iOS/PC clients; signed OS install and recovery acceptance per exact model |
| P1 | Integrate Sky, Zema and packaged agents | shared identity, direct Home entry, Package review/handoff, signed runtime binding, Provider-declared Package invocation extension, controlled local executor/result/receipt fixture, sequential Node-to-Python A2A handoff fixture, Zema UI to prepare a completed/retrieved result as an untrusted-data draft for a second separately quoted sibling Agent task, persisted owner/parent-scoped predecessor→successor edge after result capture, one successor per reviewed result, maximum redelegation depth 1 enforced in the store/API and D1, Cloudflare Worker/D1 fixture executing two separately approved sibling delegations on distinct Agent origins under one shared parent budget with encrypted handoff and restart/no-replay checks, read-only parent controller snapshot, cloud-agent Zema plan step records bound by delegation ID and server-checked against the saved signed quote or terminal captured result plus usage receipt, one-minute scheduled deadline sweep that expires pre-send work/releases its hold and requests cancellation of overdue remote tasks, versioned persisted Zema plan v1 with pre-work objective editing and immutable server-derived quote/Wallet/Cloud-approval/result-receipt gates | Extensible multi-step authoring and operator recovery runbooks; production Provider deadline/cancel semantics and interoperability; production output-schema/receipt semantics; reviewed default offer profiles |
| P1 | Add distribution and activation adapters | eSIM provider fixtures, channel-neutral signed-claim SDK and encrypted/idempotent seller delivery API, entitlement APIs | partner contracts and production keys, physical SIM fulfillment, carrier/eSIM activation, returns/refunds, operational support |

The eSIM bootstrap toolkit remains an eSIM integration fixture, not the product distribution restriction. Local tests verify only the behavior named in their evidence. They do not prove production billing, actual carrier activation, physical SIM fulfillment, successful OS installation, or supported-device acceptance.

2026-10-02 implementation audit follow-up: the native quote-to-Wallet-to-Cloud approval source path is now connected through Shell API v18 and the stable delegation ID. The earlier correction artifact listed that handoff as missing before the follow-up integration; current source-contract and shared Node/Cloud canonical-vector tests pass. Android Core Java/JUnit, AIDL generation, APK build, device-credential/reconnect instrumentation have not run on this host, so the native flow is implemented in source and locally contract-checked but not Android-runtime accepted. Real Provider execution, prices/invoices, funded settlement, SIM fulfillment/activation, and exact-SKU installation remain separate gates. See [follow-up evidence](evidence/sim-led-product-correction-followup-20261002.json).

## Evidence categories

- Implemented in source: the reusable infrastructure named above and Web/Android source paths as recorded in the workstream.
- Locally verified: automated tests with synthetic claims, keys, quotes, meters, D1 rows, and Worker jobs. These are local behavior evidence only.
- Production/device acceptance required: seller and carrier connections, real Provider contracts and invoices, production D1 deployment/readback, funded billing, Android/APK/device behavior, and exact-model OS installation and recovery.


### Agent利用料の月次後払い（2026-10-15）

利用者指示により、Agent利用を契約accountごとに毎月まとめて請求する方向へ更新。[請求・未払い対応設計](sky-billing.md)で単価/見積/上限、usage照合、支払方法、通知/猶予/有料実行制限/入金復旧/適法な回収を定義。通信・端末・OS・Agentの明細は分ける。銀行口座をOSが直接凍結する権限は持たせない。後払い与信・Provider sandbox・実請求は未受入。
