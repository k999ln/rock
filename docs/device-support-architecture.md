## OS内の統一を先に行う（2026-10-22本人訂正）

端末ごとの会話/担当/仕事/成果/料金/停止を増やさず、RockstarOS共通Coreと同じ既存store/workflowに統合する。[11項目の正本](rockstaros-complete-design.md#os-unified-interaction)。前段のMini音声は共通Core/画面と旧Pixel接続adapterへ分離し、native/account/runtimeの同じjobへの結合を次に行う。機種別には実入出力/電源/driverを実装し、一般ローンチ保留と既存データ保全を維持する。Core抽出だけで全経路/全実機の統合済みとはしない。

## Miniの声からEve・smisへ

本人の2026-10-22追加指示による[Hey Eve/Thanks Eveの正本](rockstaros-avocado-mini-complete-design.md#mini-hey-eve)を参照。Hey Eve→依頼の確認→Eveの担当作成→smisで同じ仕事の実行/出力→Thanks Eveで指定jobの停止照合→待機。完全電源断と音声待機を分け、Pixel前景ASR/本人用LinuxとMini AON/実機を別受入にする。一般ローンチは保留。

## smisの3方式とPixel→Miniの入力差し替え

ユーザー自身がEveで用途と担当を作り、開発側は実現環境を作る。内蔵・外付け・周辺観測を共存させ、最初はPixel cameraを周辺観測の入力とする。入力adapterはsensor固有の取得/切出し、共通層は時刻付き観測・対象/担当の対応・本人確認、既存OSは仕事/権限/予算/成果/停止を担う。[11項目の正本](sky-tools-complete-design.md#smis-three-connection-ways)。

`lib/smis-camera.ts`がbrowserの明示許可/中央の映像を担当し、`lib/smis-visual-input.ts`は64×64 RGBAからの観測と登録済み見た目候補の照合を担当する。Miniはこの共通入力へ実sensorの画素を渡すdriverを別途作る。source文字列をmini-cameraへ変えた合成試験は、Mini hardware/認証の受入ではない。現在の照合は料理/文字/生体状態等の意味理解ではなく、特定用途を固定する仕様でもない。

## smis：無機物・有機物に共通する接続の目標

2026-10-22の本人指示により製品名はsmis（旧Sky）。対象名は自由記述を維持し、物質区分のwhitelistを追加しない。最初の着脱式部品の案はお皿や椅子等で限定受入し、植物・生き物へは実センサー・装着方法・負担・観測範囲・本人の同意と撤回を確認したadapterから展開する。同じ部品が全対象に安全に付くことや、全生体の状態取得を証明するものではない。能力報告/設定と実測/認可は既存契約で分ける。設計の目標であり、物理製作や生体実験は行っていない。

## 物へ取り付ける共通部品（2026-10-22）

### 最初の能動部品を作る順序

最初の試作案は、物に着脱できる本体・給電・物/部品の識別・ボタン入力・光の返答・認可済み本人端末への通信を最小構成とする。重いLLMと保存は本人端末/既存runtimeへ分担する。マイク/写真/温度/重量等は同じ部品へ無条件に存在するとせず、対応する追加センサーと処理/実測が揃った用途から増やす。現時点で寸法・電池・通信chip・基板・firmware・製造原価は未確定で、購入/製作済みではない。

MCU上にESM runtimeを直接載せる前提は取らず、署名済み限定firmwareと本人hostの接続層を設計する。既存の端末コード承認でhostを同じownerへ結び、部品の短命能力観測とAgent参照を照合する。見えるURL/物のIDには認証鍵を入れず、Web sessionはhostの保護領域に保持する。`runtime.sky.inspectAgent(agentId)`で役割/設定の版を読み、能力候補を確認した後も、実仕事は既存Brokerの個別承認を通す。これは実firmwareの実装済み宣言ではない。

物理受入は、お皿等の対象物と部品の同一個体を決め、着脱・給電・ボタンの実押下→認可済みhost→同一Eve job→実際の光の返答、切断/取り外し/失効/停止/再起動を通す。カメラがない試作で料理の種類や量を知る用途を合格にしない。受動タグで画面を開く実験は、能動部品のこの受入とは別に記録する。


物に共通部品を付け、その物の担当をSkyで結ぶ[11項目の契約](sky-tools-complete-design.md#sky-object-attachment)を追加。重い処理は既存Host/Executor/Outputへ分担でき、物名からsensor/処理/出力を推測しない。`lib/sky-object-attachment.ts`とportable runtimeの同じ交渉を使う。機種のnative OS適合、SIM/eSIM利用権、物のIDと認可済み部品/hostの鍵は別である。物理部品/BOM/firmware/取付け方式は未確定で、scopeはSKY12/14/21・DSP01。次は対象物を選び、同じ能動部品の電源・実入力/出力・通信・失効・停止・再起動を受け入れる。

## 共通本体と端末別追加能力の開発入口

2026-10-21の本人再確認を[共通Coreの開発プロンプト](prompts/rockstaros-common-core-development.md)へ具体化。本人・Sky/Eve・仕事・保存・料金を共通化し、端末固有の能力とdriver/boot/更新復旧をadapterで追加する既存方針を維持する。独立会員登録とPixel/Web一周を先行し、host packageの合格をMini/Pro/MCUや全native imageへ転用しない。

<a id="portable-runtime-package"></a>
## Eveを共通パッケージで使う実装（2026-10-21 / OS10・DSP01・MAT15）

本人の「OSをパッケージとしてどのhardwareに入れても機能が使える、料金体系は一緒」という指示を、[共通runtime package](../packages/rockstaros-runtime/README.md)へ具体化した。正本契約は[portable-runtime/1](../contracts/rockstaros-portable-runtime.json)。ROCKは共通client・workflow・本人/利用権・費用経路、EXTERNALはBSP・driver・安全回路、JOINTは各実機の同一仕事と更新/復旧、OWNERはhardware・外部送信・費用を担当する。

**利用体験と実装。** hostの保護領域から既存device sessionを取得し、同じaccountのEve履歴、Sky/Eve仕事、利用権、見積済みAIの状態を使う。`eve.list/read/save/recall`は暗号化履歴API、`jobs.list/create/command`は既存workflow API、`text.quote/status/submitApproved`は既存見積/予約/usage経路へ接続する。入力は端末名、本人が認可したsession、thread/job ID、revision、承認済みquote。出力は既存server responseと機種能力の診断。client側のowner指定やsensorの自己申告を権限にしない。Tool実結果を端末から成功として記録するAPIは提供しない。

**移植と能力。** packageのES moduleを対応する既存OS clientから使い、native OSには機種別boot/BSP/driver/署名更新/復旧を加える。MCUは限定firmwareと許可済みhostのbridgeを別開発する。`diagnoseHardware`は30秒以内の観測とtrue/false/unknownを検査するだけで、実機証明や実行grantにはならない。Miniの空中表示・本人認証・衛星AP・MCU安全信号のdriverは未実装。既存Pixel専用のEve実行同期APIをMini/Pro対応に読み替えない。packageにLLM weightsやlocal推論engineは含まれず、EveのCloud実行も既存provider/料金/承認gateの通過が必要。

**料金・保存・復旧。** 基本料は既存accountの契約を共有し、端末数で重複させない。追加computeは同じ見積、本人上限、予約、usage、請求照合を使う。ここでは新価格・新顧客台帳を作らない。履歴のowner別暗号化、revision CAS、job IDとquote IDを保持する。401は再接続、409は再読戻し、mutationのtimeout/応答消失/5xxは結果不明で止め、自動再送・有料Cloud切替をしない。job取消は外部providerの取消成功とは別に表示する。

**合格条件。** packageのbuild/pack後、repositoryから離れたディレクトリでimportできること、既存workflowとの取消/競合/重複が一致すること、HTTP代替で本人tokenの付与/失効・redirect拒否・見積参照・応答不明を検査する。各hardwareでは別途、同じ本人・job/成果、実入力/出力、連続負荷、圏外、再起動、鍵失効、署名更新・復旧を検証する。host試験とbundle生成はMini native起動・実課金・全機種対応の証拠にならない。

<a id="current-device-adaptation"></a>
## 現行再設計・会社ロゴ・四端末の適応（2026-10-20）

**目的と正本。** 本人は旧Buildroot OSを作り直すための現設計であり、旧実装の良い部分だけを持ち込むと明示した。現在のRockstarOS→Sky/Eve/Linux/共通Coreを最新版とし、旧Buildroot/QEMUの完成を現商品の前提にしない。旧コードは責任、互換、権限、保存/復旧と同じ仕事のfixtureを検査して選択再利用する。旧image・testの合格を新設計や別端末へ転用しない。機械可読の正本は[data/rockstaros-device-adaptation.json](../data/rockstaros-device-adaptation.json)。

**体験と責任。** 表示名はRockstarOS、会社マークは既存avokadoの銀色ロゴを原画像のまま使う。Web/PWA、Androidのランチャー/ヘッダー、native OS候補の起動表示、Mini/Pro/相棒の表示または物理マークへ揃える。機種名、boot状態、patchやattestationを偽装しない。ROCKは共通契約/画面/権限/料金とadapter、EXTERNALは各hardware/issuer/compute、JOINTは各実機と同じjobの受入、OWNERは本人/保護者の承認と料金条件を担う。

**端末。** Pixelは電話画面と限定受入済みLinux文章実行。Mini R5は一台自律・別演算Hub不要を維持し、sensor/音声入力、空間表示/音声/CAD-BIM成果を扱う。Proは専用PCの画面、作者の制作/game、対応する重い実行先候補で、hardwareは未確定。吊り下げ相棒は音声・物理操作とspeaker/目/限定表示を担い、許可済みPixel/PC/cloudへ仕事を接続する。Pixel向けAVF binaryを他機種へ転用せず、screen非搭載機へ同じ画面を強制しない。

**入出力・状態・保存。** owner/保護者role、親利用権epochと子端末鍵、job/revision、model/tool版、scope、予算、成果/usageを共有する。既存compute-device-capabilitiesとdevice-linkを再利用し、observed/expiry/適合のある能力だけ選ぶ。認証前→pairing→能力確認→利用可→切断/制限→再照合で同じ仕事へ復帰する。本人の原稿・鍵・録音をcapability表示へ含めず、既存workflow/保存を正本にし、別の顧客台帳を作らない。

**請求・承認・失敗復旧。** 同一契約の複数端末追加だけで月額16ドルを重複させない。追加の実compute/有料Agentだけを事前単価/見積/上限と確定usageで計算する。契約/同意版、支払方法、請求確定、収納、督促/追加認証/再試行、失効/復帰/返金を独立して追跡し、結果不明を再請求や再実行で補わない。「携帯代並み」は技術上の追跡性と回収手順の目標であり、法的効力/回収保証やcarrier billing契約が成立したとの表示ではない。販売国・契約主体、枠/単価/猶予/税/督促/保持を決めるまでは実販売gateを閉じる。

相棒は保護者と子どもの権限を分け、学校mode・録音/位置の既定OFFを維持する。子どもの会話を支払/購入/外部送信の承認へ昇格させない。SOS/ローカル警報は通信・LLM・SI月額の失効から独立し、課金停止で封鎖しない。独立警報回路は実hardwareで別受入する。

**合格と未決定。** 各端末の名前/ロゴ、同一jobの依頼/承認/成果、二端末同時予算、親/子失効、通信断/再起動/復帰、相棒の保護者境界とoffline警報を同一候補で試す。現在は適応契約とPixel表示更新の開発で、Mini/Pro/相棒の実機adapter、eSIM/Stripe/管理Cloudの一周は未受入。未特定のhardwareや出力は実測・権限・安全・復旧のgateから決める。

<a id="device-specific-acceptance"></a>
### 端末別に追加する能力と受入条件（2026-10-20）

共通Coreはowner/job/revision、本人・保護者の権限、利用権、見積・上限、成果、停止・復旧を管理する。端末adapterは実在する入出力と実行能力を版付きで申告し、OS権限を得た範囲との積集合だけを使う。能力の宣言、設計、実装、同一機種の実測、一般提供を別状態にする。対応能力がない機器には代替表示か利用不可の理由を返し、架空のcamera・画面・sensorを提示しない。

| 端末 | 個別に追加するもの | 同一候補で残す合格証拠と停止条件 |
| --- | --- | --- |
| Pixel 10 GL066／`frankel` | Android権限、既存OS上のShell、端末内Linux、選択したlocal model、保存 | 権限付与・拒否・失効、Shell→Broker→限定Linux成果、model版/hashと実推論、再起動後の本人別保存・持出しを照合。連続稼働の温度・電池・性能低下を測り、熱保護・低電池では安全に停止/再開する。試験署名APK、Terminal実行、full OS imageを別証拠にする。 |
| avocadoMini | 音声、sensor、本人判定、空間表示、場所ごとの権限、着脱状態 | 同じ筐体・版で音声/測定/本人拒否・空間表示を実測。場所の変更・共有域外・取り外しでgrantを再評価し、表示/記録を停止または縮小する。光学漏えい・RF曝露/適合・電池/充電/熱の安全は個別bench後、統合実機で再確認する。 |
| avocadoPro | AI専用PCのCPU/GPU/NPU・RAM・保存、model配置、制作・game出力、周辺機器 | 実BOM/driver/OSとmodel hash/license・配置・資源計測を固定。同一jobから制作物/gameを出力し、display・音声・入力・外部機器ごとの接続/拒否/抜去、熱・電力、停止/再起動/復旧を確認する。画像や候補部品を適合証拠にしない。 |
| 吊り下げ相棒端末 | 低消費電力、保護者との接続、物理操作、独立警報・SOS | 子と保護者のpairing/失効、学校mode、物理操作と誤操作、待機/警報時の実消費電力を測る。通信断・AI停止・利用権停止・電池低下時にも、独立回路で定義した警報/SOSが働く範囲を実機で確認する。遠隔通報は利用可能な通信経路と相手への到達を別受入にする。 |
| iPhone・一般PC | 既存OSを保つWeb/client接続、OSが許可した端末機能 | 対象OS/ブラウザ/アプリ版でlogin・子接続・同一job/成果・停止/復帰を確認。camera・microphone・通知・file等は実際の権限許可と拒否後の挙動を一機能ずつ検証する。自動app導入やOS権限取得をeSIM導入だけから推定しない。 |
| 時計・TV・ロボット等 | 実機の対応能力を宣言する個別adapter | 機種/firmware、入出力、電源、通信、権限、可用期限を申告し、同一jobの許可された操作/成果表示、能力欠如、切断・再接続・失効を検証。cameraや画面がない機器にはその機能を公開しない。ロボットの物理動作は別の安全停止と現場受入を要する。 |

ROCKは能力schema・Broker強制・失効・保存/復旧と試験fixtureを担当する。EXTERNALはOS/vendor API、部品、RF/光学/電池仕様を供給する。JOINTは対象機種と同じbuild・adapter・仕事IDで物理/実利用の証拠を取る。OWNERは子ども/場所/外部送信/実費の許可条件と対象構成を決める。未確定の機種・閾値・場所の判定方式は、実機の能力調査と危険分析を記録して固定する。文書/fixtureの検査は`npm run device-support:check`、`npm run design:check`、`npm run baseline:check`、`npm run verify`。これらの成功を物理受入へ換算しない。

## 最新の標準提供：既存OSへ共通RockstarOS環境を接続する

商品の意味は、通信容量を売るeSIMではなく、自分用のcloud Linux・LLM・Agentが追加されるservice profile。携帯の圏外/電源OFF後も、executorが受領済みの仕事を本人承認済みの権限・予算・期限内で進める。LLMがlocalなのは配置先Linuxに対してで、全iPhone内へのmodel搭載を意味しない。PCの前に立たない制作、携帯を持たないやり取り、実利用/検収/収納に基づくRun to Earnを同じ仕事/成果へつなぐ。実行Linuxまで外部通信断なら、導入済みmodelの自己完結処理と、外部作用の待機/再照合を区別する。

2026-10-20の本人追加指示「各端末の専用osを作らなくて済む」「何にでも対応」「このシステムは既存じゃないから発明して」により、標準商品は、eSIM導入から本人専用の共通RockstarOS環境を準備し、既存OSの端末へ接続する方式とする。RockstarOSの中のSky・Eve・管理Linux・OS Coreを共用し、端末ごとの差は能力契約と薄い入出力adapterで扱う。eSIM非対応機器は本人承認した子接続で同じ契約へ追加する。GrapheneOS forkや機種別OS imageは追加のnative系列であり、標準利用開始の前提にはしない。

[発明する起動・接続protocol、アルゴリズム、状態、責任と受入条件](sim-led-product-architecture.md#esim-service-attachment)と[機械可読案](../contracts/rockstar-service-attachment.json)を現在の詳細とする。eSIM側アプレットは対応発行元と端末での研究対象。iPhoneの完全無操作起動、同意なしのapp導入、全hardwareの全機能は未実装・未受入であり、手動Web起動へ希望を縮小して完成扱いにしない。従来のnative優先説明はその追加系列に限って読む。RQ01〜RQ49、月16ドルの枠付き契約、本人権限/費用上限/持出しを保持する。

<a id="sky-foundation"></a>
## 履歴：2026-10-18のSky基盤説明（現行は冒頭のRockstarOS共通環境）

2026-10-18の利用者の明示訂正により、Skyを全体の共通基盤とする。SkyがAgent/Tool・接続・本人・仕事/成果・費用・保存/退出の共通契約を持ち、RockstarOSはその能力を端末の実行/権限/隔離/保存/復旧まで一体化する実行環境。Mini、Pro AI専用PC、Pixel等は機種別adapterで実装し、Zoom、Planner、Zema等は同じSky契約を利用する。Sky WebはOS導入なしでも使える。OSでシステムを完結させても、本人のデータ持出し・移行・退出を保持する。

既存Platform Core/Brokerと本人承認、利用権/予算、型付き成果、DB/復旧を再利用する。この階層訂正はOS権限をmodelへ委ねる変更でも、全hardwareへの搭載済み宣言でもない。SIM/eSIMの導入/利用権、RQ01〜RQ49、料金、Provider/Pixel/QEMU/Mini/Proの受入は維持する。[共通契約の11項目とZoom/Planner実装](sky-tools-complete-design.md#sky-foundation)。一般公開は保留。

# RockstarOS 多機種対応アーキテクチャ

<a id="shared-si-device-profiles"></a>

## Pixel・avocadoMini・avocadoProで共通のSIと異なる出力（2026-10-18 / OS10・DSP01・MAT15）

**2026-10-18の利用者訂正:** avocadoProは**AI専用PC**である。「用途未定の上位端末候補」という旧表現を訂正する。ProはRockstarOS共通SI Core／Sky／ZemaをPC上で使い、本人が選んだAI／Agentの仕事、local実行とcloud実行の選択、成果の保存・再開を主目的とする。具体的なPC本体、CPU／GPU／NPU、RAM、画面、OS基盤、販売構成は未指定であり、この用途確定をhardware仕様やlocal LLM性能の実機合格へ換算しない。

利用者の明示方針: RockstarOSをPixelだけでなくavocadoMiniとavocadoProにも載せる。三者はSI（スーパーインテリジェンス）を使う同一の製品システムを共有し、hardwareによって入力、表現できる成果、実行できる機能が変わる。Mini／Proにもnative RockstarOS実行面を作ることを製品目標にする。「同じbase」はowner／service entitlement、Sky catalog、Zemaのjob ID・revision、Brokerのscope／承認、予算・usage、成果artifact／receipt、保存・復旧の契約を指す。Pixel向けGrapheneOS image／Android Terminal／Debian VMのbinaryをMiniやProへそのまま書き込めるという意味ではない。各機種のboot、driver、署名更新、回復経路とruntimeはDevice Support Package（DSP）として個別に受け入れる。hardwareがfull Android／Linuxを満たさない場合は署名済み限定firmwareと本人端末／cloudの分担案を設計するが、その状態をfull native OS搭載とは表示しない。

上流の根拠: [GrapheneOSの公式device support](https://grapheneos.org/faq#supported-devices)はPixel 10／`frankel`を含む対象ごとの正式buildと更新を列挙し、別機種ではdevice support code・firmware・security要件が必要と説明する。[AOSPのLinux開発環境](https://source.android.com/docs/core/virtualization/usecases#linux-development-environment)はTerminalをAVF上の非protected VMとして定義する。したがってTerminal／Debianの可用性は各Mini／ProのSoC／OS／仮想化条件を調べるまで未確認である。

| 製品profile | 共通の仕事を受け取る入口 | hardwareから選ぶ出力候補 | 現在の受入境界 |
| --- | --- | --- | --- |
| Pixel 10 GL066／`frankel` | Home、Sky、Zema、Cloud LLM。任意Terminal／Linux | 画面の文章・図・ファイル、本人が許可した音声、端末内成果 | 試験署名APKの限定実機証拠はある。RockstarOS full image、VM成果adapterは未受入 |
| avocadoMini R5 | 同じowner／jobへ接続する専用SI surface。Miniなしでも同じ仕事へ戻れる | 単体game/2D、音、空間表示・3D入力は成立を確認できた能力だけ。建築／interior／soundやMaterial Inventionは個別Toolと安全gateを通す | R5は200mm以内・1本自律・別演算Hub不要を目指す設計。表示・入力・電源・SoC／OS実装、実機は未確定。GrapheneOS／AVF搭載済みではない |
| avocadoPro AI専用PC | 同じowner／Sky／Zema／成果契約をPCで使い、AI／Agentの仕事を作成・実行・再開する | 画面・キーボード等のPC入出力と、受入済みならlocal AI推論・Tool実行。空間表示や複数sensorはProの既定仕様にしない | AI専用PCという用途は確定。機種、筐体、CPU／GPU／NPU、RAM、入出力、電源、OS、復旧の正本仕様と実測は未確定。Pro固有機能・GrapheneOS対応は未判定 |

2026-10-18の追加Mini最低機能は[携帯代替・空間インターフェース](avocado-mini-r5/phone-spatial-interface.md)に定義する。MiniのDevice Profileは、センサー、生体認識、空間通知とタップ、通話、Mini自身の衛星WAN→Wi-Fi、dock外の電源・携行動作、RockstarOS／Sky／Zemaを別能力として申告し、MP01〜06の同一実機証拠がない能力を`accepted`へ上げない。Pocket Wi-Fiのみ、または屋外terminal経由の成功を、直接衛星を含む携帯代替の合格へ換算しない。Pixel／Proへ同じ光学・通信hardwareを推定しない。

**目的と体験。** 利用者は一つの依頼をHome／Skyから作り、Zemaの同じ仕事としてPixelの文章、Miniの限定した空間/音、Pro AI専用PCの作業画面と受入済みのlocal／cloud AI実行を選ぶ。仕事の意味と履歴は変えず、出力形式だけを対象機器の確認済みcapabilityへ変換する。例として「部屋の案を比較」は共通artifactに出典・版・承認を保存し、Pixelでは図と説明、Miniでは安全に成立した簡易空間表示、Proでは画面上の比較資料と、利用可能と検証されたAI処理の成果を扱う。Mini／Proの未成立hardwareや未接続Toolを画面上で成功扱いしない。

**Pro固有の設計境界。** PCでAIを使う入口は、本人の依頼→SkyのAgent／Tool選択→Zemaのjob・revision→Brokerの権限・実行先・費用判定→成果artifact／usage receipt→保存・再開とする。local modelはモデル名・hash・license、実測できるCPU／GPU／NPU、メモリ、熱、電力、性能、保存範囲が確定した構成だけを案内する。cloudへ送る場合は入力範囲と見積・上限を先に示し、本人承認を要する。PCの任意shellや管理者権限をAgent共通APIにしない。OS基盤、署名済み起動・更新、disk暗号化、backup／復旧、周辺機器とprivacyは対象hardwareを選んでから同一試作機で受け入れる。

**PCの前にいない制作と携帯を持たない連絡（2026-10-18）。** 利用者の追加目的は、本人がProの前へ戻らずに作品や資料を作り、スマートフォンを手に持たずに相手とやり取りできる状態である。Miniは対応する声・空間/物理入力と本人向けの短い確認を担い、Proは利用可能で本人が許可した場合にAI／Toolの計算と成果保存を担う。Miniから依頼の要約を読み返す→Skyで実行先と必要権限を選ぶ→Zemaの同じjob/revisionに見積・上限と承認を記録→Proまたは明示承認済みCloudで実行→Miniで途中修正、進捗・費用、成果の要約/出所、停止を扱う。精密編集が必要ならPro等の画面へ同じ成果を開けるが、最初の限定制作はPC画面の操作なしに最終artifactの確認・保存まで到達することを受入条件にする。Proが電源断・圏外・熱保護中なら待機/利用不可を示し、無断のCloud切替や再実行をしない。Proを電話回線の必須中継点にせず、Miniの通話/メッセージはMini自身の受入済み回線と通信Providerで成立を確認する。声の認識、Agent提案、送信下書きは本人の承認や相手への到達を証明しない。

ROCKはowner/job/revision、端末間grant、権限・費用・artifact・停止/復旧を既存Sky／Zema／Brokerで揃える。EXTERNALはProの部品/OS/モデル、Miniの光学・音声・通信Providerと制作Toolを供給する。JOINTは同じowner・同じ版のMini/Proで制作開始→修正→成果検収・再開、別人拒否、切断/停電、通話/送信の実到達を測る。OWNERは最初の作品・相手・共有範囲・費用上限・使用場所を決める。Miniなしの既存Web/Pixel入口は残し、Mini/Pro実機、音声、通話、遠隔起動、物理制作を受入済みとは記載しない。[MiniのOI07](avocado-mini-r5/product-invention-r1.md#試作と停止条件)と[携帯代替MP gate](avocado-mini-r5/phone-spatial-interface.md#5-同じ試作機で閉じる受入gate)で機器側を別検証する。

**Pro外観の優先方向（2026-10-18）。** 利用者はMac Studio風の低い角丸アルミ筐体を好むと明示した。[Studio系10案](avocado-pro-mocks/README.md#studio方向今回の好みに合わせた10案)を外観候補とし、12を単GPU、20を価格、18／19を増設の比較起点にする。独自の前面通気・状態灯・保守構造でavocadoProの外観に仕上げる。正確な外寸、NVIDIAカードとの適合、電源、風路、騒音、部品原価は実部品BOMと同一試作機で評価し、外観画像をhardware受入へ転用しない。

<a id="pro-internals"></a>
### avocadoPro内部構成の一次候補（2026-10-18 / OS10・DSP01）

**選定原則。** 机から離れても一件の仕事を作れるよう、GPU性能だけでなく、本人別のjob保存、権限、見積・停止、電源断後の復旧、Miniへの成果返却をPC内部の必須機能とする。販売SKUの確定ではない。GPUメモリ容量はモデルの収容範囲、GPU電力とカード実寸は筐体・PSU・騒音を左右するため、同じ低い角丸アルミの意匠でも内部容積を共通と決めない。

| 候補 | 演算・メモリ・保存 | 電源・筐体の境界 | 位置づけ |
| --- | --- | --- | --- |
| Value / Studio | AMD Ryzen 7 9700X（8 core・65W）候補、GeForce RTX 5060 Ti **16GB版**（180W）、DDR5 64GB、NVMe 2TB＋空きM.2、PCIe GPU交換可能 | NVIDIAの基準はシステム600W以上。650W級SFX電源を設計候補にし、実カード/ケーブル/吸排気が収まる低い筐体をCADで決める | NVIDIA GPUのローカル制作を価格重視で開始。16GBを超えるmodelは性能/分割/承認済みCloudを別評価 |
| Performance / 拡大Studio | 同じx86_64基盤のCPU候補、GeForce RTX 5090 32GB（575W）、DDR5 128GB候補、NVMe 4TB＋復旧用の別保存先 | NVIDIAの最低1000W電源、カード304×137×61mmに加えファン前の空間が必要。GPU製造元ごとの実寸と16-pin給電・曲げ空間を検証し、外観12より大きい筐体を許す | 単GPUで32GBを使う上位試作。Mac Studioと同等の小さい外寸にはしない |
| Compact AI研究 | NVIDIA GB10を使うOEM/提携候補。DGX Spark参照系はArm 20 core、統合メモリ128GB、NVMe最大4TB | 参照系は240W電源、150×150×50.5mm。本体/SoCの調達、ARM用RockstarOS・Tool互換、費用/保守を先に確認 | 大容量メモリを小型筐体で使う別方式。GeForceのVRAMや性能/価格と同一視しない |

上記の公開仕様は[RTX 5060 Ti](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5060-family/)、[RTX 5090](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/)と[取付ガイド](https://www.nvidia.com/content/geforce-gtx/geforce-rtx-5090-user-guide-r2.pdf)、[DGX Spark](https://www.nvidia.com/en-us/products/workstations/dgx-spark/)、[Ryzen 7 9700X](https://www.amd.com/en/products/processors/desktops/ryzen/9000-series/amd-ryzen-7-9700x.html)に基づく。各GPUのOEMカード、メモリ構成、対応基板、販売権/driver条件、地域別価格と供給は見積時に版付きで確定する。DGX SparkそのものをavocadoProへ改称したり、GB10のOEM供給権を取得済みとしたりしない。

2026-10-19のサイト上のValue参照部品は、[ASUS Dual RTX 5060 Ti OC 16GB](https://www.asus.com/ie/motherboards-components/graphics-cards/dual/dual-rtx5060ti-o16g/techspec/)（229×120×50mm、8-pin）、[ASUS ROG STRIX B850-I](https://rog.asus.com/us/motherboards/rog-strix/rog-strix-b850-i-gaming-wifi/spec/)（mini-ITX 170×170mm、AM5、2 DIMM/2 M.2）、[Kingston FURY Beast 2×32GB DDR5-6000](https://www.kingston.com/datasheets/KF560C36BBE2K2-64.pdf)、[Samsung 990 PRO 2TB M.2 2280](https://www.samsung.com/uk/business/memory-storage/nvme-ssd/990-pro-2tb-nvme-pcie-gen-4-mz-v9p2t0bw/)、[Corsair SF750 750W SFX](https://www.corsair.com/us/en/p/psu/cp-9020284-na/sf-series-sf750-fully-modular-80-plus-platinum-sfx-power-supply-cp-9020284-na)、[Noctua NF-A12x25 PWM](https://www.noctua.at/en/products/nf-a12x25-pwm/specifications)（120×120×25mm）を寸法感のある例として並べる。CPU候補9700XとB850-Iの個体firmware/driver、Kingston kitのQVL、SSD放熱、実カード・SFXケーブル・CPU冷却・fanの同一筐体内配置は未検証。生成した分解画像はこれらの正確なメーカー製品写真・CADや物理組立結果ではない。サイトの参考部品は購入SKU確定を意味しない。

**共通の内部契約。** 署名済み起動/更新候補、disk暗号化と本人別鍵、原本とは別の成果/backup復旧、model hash/licenseとdriver版、Sky/Zema/Brokerのowner/job/revision・能力snapshot・実行承認・予算上限・usage receipt、温度/電力と停止理由の表示、2.5GbE以上と承認された暗号化接続を設計対象にする。OSはx86_64 Linux上のRockstarOS runtimeを第一試作候補とし、Pixel imageの転用やNVIDIA driver/Model/署名の受入済みを意味しない。Proを公共Internetへ無認証の推論serverとして公開しない。Miniから実行した仕事はProの電源断/圏外/熱保護で同じIDの待機/結果不明へ戻し、未承認Cloudへ自動振替しない。

**採用順と合格証拠。** 最初はValueの一台で、同じMiniの一件の制作依頼→本人承認→ローカル実行→途中修正→成果hash/費用→停止・再起動後の再取得を測る。次にPerformanceで同じjob/同じmodel/入力を使い、品質、処理時間、消費電力、騒音、温度、VRAM不足、単位成果当たり原価を比較する。Compact AIはARM互換と供給契約が見えた時だけ別試作に進める。複数GPUは初期SKUに入れず、複数枚でVRAMが自動合算されると説明しない。販売価格や半導体の大量調達は、実BOM、歩留まり、保証/支援費、需要と実仕事の測定後にOWNERが決める。

**能力契約。** DSP／adapterは`deviceProfileId`、hardware SKU、OS／firmware・adapter版、署名者、観測時刻、入力／出力mode、compute（CPU／GPU／NPU／VM）、memory・電源・熱・network、校正状態、privacy／周囲への開示条件、実測済み機能と根拠を版付きsnapshotでBrokerへ渡す。現行`contracts/device-capability-snapshot.json`はAndroid中心のv3であり、Mini／Proの全項目や複数機器合成を実装した契約ではない。未知・期限切れ・版不一致・未校正は「利用不可／未確認」に戻す。LLMが機能を自己申告してもcapabilityには昇格させない。SkyのAgent manifestは必要入力／出力、実行先、権限、資源、料金を宣言し、Brokerが実capabilityと照合して候補を提示する。

**責任・入力／出力・承認。** ROCKは共通Core、dispatch、型付きartifact変換、本人別保存、費用と権限の強制を担当する。EXTERNALはGrapheneOS／AOSPまたは各SoC、表示／sensor／無線Providerと専門分野の制約を提供する。JOINTは各機種でboot、熱、privacy、出力品質、停止、OTA、復旧を受け入れる。OWNERは表示先、共有範囲、sensor利用、cloud送信、有料実行、物理作用を承認する。入力はowner・job ID/revision・要求artifact型・出力先・capability snapshot・許可scope・費用上限。出力は共通成果hash／参照と、機器別rendering ID・版・品質／失敗理由・usage receipt。音声通知や空間表示は本人承認、測定値、施工／安全判断の代わりにならない。

**状態・保存・失敗／復旧。** 一件のjobはZemaを正本に`requested → capability_checked → awaiting_approval → running → artifact_ready → rendered／review`として扱い、出力先ごとに`unsupported`、`unavailable`、`uncalibrated`、`offline`、`unknown`を区別する。これは設計上の表示案であり現行workflowへ新状態を実装済みとはしない。仕事・承認・成果・usageをowner別の共通保存へ置き、機器内cacheは期限／削除／backupを明示する。端末断・VM停止・render失敗では同じjobとartifact hashを照合し、表示だけを安全に再試行する。外部作用／課金／推論を無断で再実行しない。失効したservice accessはRockstar管理の新規実行を止めるが、回収可能な成果と端末の基礎・安全機能を失わせない。MiniにeSIMがない場合もPixelのnative eSIM条件を架空のMini回線として申告せず、購入offer・account entitlement・通信経路・端末導入を別々に扱う。

**合格と未決定。** (1) 同じ合成job／revision／artifactをPixelとMiniの成立済み二出力で表示し、停止・再起動・offline復帰・旧snapshot・別owner・予算超過を検証、(2) Mini R5の表示・入力・熱・電源・boot／更新／復旧を同一試作機で実測、(3) Pro AI専用PCの対象hardware／OS／model構成と受入計画を確定してから同じfixtureを追加し、local AI一件の実測、cloud送信の明示承認、停止・再起動・成果復旧を同一PCで検証する。機器間handoffは「同じ仕事を閲覧／承認できる」ことと「同じlocal model／生sensorを使える」ことを分ける。Proの構成・価格、MiniのSoC／OS方式、端末ごとのeSIM／通信・価格はOWNERとROCKが仕様・試作証拠を見て決める。現段階は設計方針であり、Mini／ProへのOS導入、表示・LLM性能、販売を合格としない。

決定日: 2026-09-12。利用者は、共通のRockstarOS体験を維持しながら、Pixel、対応可能なAndroid、BlackBerry、iPhone/iPad、PC・仮想端末へ提供形態を分ける方針を選択した。本書は設計決定であり、新しいOS image、実機対応、クラウド契約、端末書込み、production署名の完了記録ではない。

機械可読の正本は [`data/device-support-matrix.json`](../data/device-support-matrix.json)。`npm run device-support:check`は、未確認端末を対応済みまたはflash可能へ変更する誤りを拒否する。

<a id="graphene-si-minimal"></a>

## GrapheneOSベースの最小SI端末構成（2026-10-18 / OS10・RLS02）

最新のnative SI提供条件では、eSIM申込/導入から本人/端末利用権を有効化し、認証済みissuerの契約終了または契約期限でRockstar管理のCloud/Sky/ZemaとLinuxモデル新規起動を制限する。GrapheneOS/AOSPのboot、電話/緊急機能、設定、汎用Terminal、本人データ回収を契約失効で破壊しない。LinuxモデルはAVF guest内のRockstar管理launcherから利用権を検査する案とし、一般のshell全体を封鎖できるとは主張しない。圏外時の失効反映は期限付きoffline leaseで上限を持たせ、端末の時刻巻戻しと再起動を試験する。eSIM profile導入と署名済みfull OS image導入は別手順であり、後者はPixel同一imageのboot/OTA/復旧受入後だけ案内する。契約/請求/復活の正本は[共通導入](sim-led-product-architecture.md#esim-si-subscription)。この条件のPixel実機合格・AVF launcher実装はまだない。

**目的と対象**: Pixel 10 GL066／`frankel`の初期RockstarOSを、Cloud LLMへの依頼、Sky Marketplace／Agentの発見と接続、Zemaでの仕事・承認・成果、任意のTerminal/Linux、Web閲覧に集中させる。これは利用者が挙げた主要機能の搭載範囲であり、既存RQ01〜RQ49の契約や別トラックを消去する判断ではない。Cloud Providerの実接続、月末請求、端末OS導入はそれぞれのgateで受け入れる。

| 区分 | 初期端末image／画面の扱い | 理由と境界 |
| --- | --- | --- |
| 残す土台 | GrapheneOS／AOSPのPixel device support、Androidの電話・データ通信とSIM/eSIM、権限・UID・SELinux・sandbox、暗号化・Keystore、AVB、署名OTA／rollback、backup／純正復旧、通知・入力・accessibility・ファイル選択、Vanadium／WebView | 起動・通信・本人性・Cloud利用・安全な更新に必要。部品を画面から隠しても削除しない。Carrier／緊急通話の端末適合は別実測する |
| 最初に載せるRockstar画面 | 軽いHome（依頼／Sky／仕事）、Cloud LLMとSky Agentの実行入口、Sky Marketplace、Zema、仕事別の見積・承認・上限・usage、契約状態・設定 | 仕事IDとrevisionを共通にし、モデルの提案を実行承認へ昇格させない。Cloud実行はprovider受入まで閉じる |
| 任意で残す | 汎用Vanadium browser、対応端末のAndroid Terminal／AVF Linux、必要時のsandboxed Google Play、カメラ／PDF等の通常アプリ | Browserは外部Web・OAuth・決済・復旧に必要。Terminalのguest rootはhost権限ではない。Google Playは既定で組み込まず、利用者が必要時に選ぶ |
| 初期Home・初期imageから外す | Game／Fund／Wallet収益面、汎用Toolの一括プリロード、複数の重複ブラウザ、ローカルLLM weightsのプリロード、Android Auto等の用途別追加アプリ | Coreの契約・台帳・既存機能は維持し、必要時に後から有効化する。本人が選ぶ適合ローカルLLMの導入経路は別に用意する。Walletの費用予約・明細、Marketplaceの権限管理はCoreに残す |

**画面と実行**: 起動時はRockstar Homeで依頼を入力し、SkyのAgent/Toolを選び、Zemaの同一jobで見積→本人承認→進捗→停止／成果→使用額を確認する。画面はAndroid native Shellを薄く保ち、Skyの詳細・外部サイト・OAuth／決済だけにWebView／browserを使う候補とする。Cloud Agentは端末のbrowser画面を開き続けることを前提にせず、再接続時に本人別jobを読み戻す。アプリ購入、SIM/eSIM claim、仕事実行、月末請求は別状態。

**速度の決め方**: 現状の「ブラウザが遅い」は原因未測定。所有Pixelの同一回線・同一jobでHomeの初回表示、Skyの入力応答、一覧／成果表示、API待ち、WebView／Vanadium描画を別々に計る。原因が画面・通信・Provider・JavaScriptのどこかを判定し、Skyの初期転送量、不要な再描画、キャッシュとnative遷移を先に改善する。VanadiumのJIT・site isolation・WebViewの保護を無検証で変更しない。測定値、操作手順、before/afterを同じ候補へ残す。

**責任・保存・失敗・復旧**: ROCKはShell、Broker、Sky/Zema契約、scope／予算強制と更新可能なAPKを保守。EXTERNALはGrapheneOS／AOSP・firmware・Cloud Provider、JOINTは同一Pixel imageで起動／通信／OTA／backup／純正復旧と実Agent・ブラウザ性能を検証、OWNERは端末書込み・外部送信・有料利用を承認する。入力はowner/device、job ID/revision、agent/tool/model版、承認digest、上限、実行先。出力は状態、成果参照、receipt、itemized usage。保存は既存owner別workflowを正本とし、timeout、通信断、VM停止、再起動、重複応答は同じIDから照合し、結果不明の有料再送を禁止する。TerminalのguestへAndroid credentialや任意rootを渡さない。

**実装・合格順**: (1) dirty差分とmain／対象branchを保全同期、(2) 既存Shell／BrokerとSky/Zemaの共通job契約を固定し、代表Cloud依頼一件をProvider sandboxで見積から成果・usageまで受入、(3) PixelでWeb／nativeの同条件速度測定、(4) Terminal／AVFの能力を読取り確認して限定Tool一件を別受入、(5) full imageのbuild、署名、boot、権限、OTA、保存／復旧、純正復旧を同一候補で受入。具体的なHome実装方式、初期imageのpackage allowlist、Terminal transport、性能閾値は各測定と依存関係を確認してOS10で固定する。現時点は設計のみ。GrapheneOS [機能](https://grapheneos.org/features)、[Pixel対応](https://grapheneos.org/faq#supported-devices)、[商標・ライセンス](https://grapheneos.org/faq#trademark)、Android [AVF Linux環境](https://source.android.com/docs/core/virtualization/usecases)を参照。

<a id="graphene-reuse"></a>

## GrapheneOSの長所の再利用（2026-10-10 / OS10・RLS02）

**目的と判断。** 利用者の「グラフェンのいいとこどりをしよう」に基づき、Pixel版は既存のGrapheneOSベースとAndroid／Linux接続の仕組みを再利用し、Rockstarの依頼・承認・仕事・成果へつなぐ。以下はこの方向を具体化した実装案であり、Linux VMへの製品全体の移動や安全機能の無条件削除を要件にしない。主担当はAndroid / Device / Local AI、既存OS10とRLS02を使用する。QEMU受入、他機種client、SIM/eSIMによるservice accessを保持する。

### 再利用する範囲

| 範囲 | 再利用とRockstar側の変更 | 受入の境界 |
|---|---|---|
| Androidと機種対応 | GrapheneOS／AOSPの起動・driver・firmware・通常アプリ互換性を土台に、既存RockShell／Broker／Toolを組み込む | Pixel 10 GL066／frankelの同一imageで機能・更新・純正復旧を検証。Pixel用imageを他機種へ流用しない |
| 権限と隔離 | UID、SELinux、アプリsandbox、GrapheneOSの保護機能を一体の基盤として保持。既存Brokerで本人・scope・同意を判定する | ToolやLLM、VM rootをAndroidの管理権限にしない。上流同等の安全性を改変後の試験なしに宣言しない |
| 検証起動と更新 | AVB、署名確認、更新・復旧の仕組みを再利用し、Rockstar固有の鍵・配信・失効・復旧運用を構成する | 公式GrapheneOSの鍵／更新配信は流用しない。既存first-flash gateを通す |
| Terminal／Linux | 開発・検証の作業場、および限定したLinux Tool実行先の候補として使う。Terminalを利用者全員の必須操作にはしない | AVF／guest／port forwardingの実機能力を最初に確認。VM内の成功はAndroid本体の改変、full OS受入、常時稼働の証拠ではない |
| Rockstarの体験 | Home／Sky／Zema、共通本人、仕事、承認、停止、成果、usageを既存実装から使う | cloud送信と端末内実行を区別し、端末処理の失敗を無断で有料cloud実行へ切り替えない |

Terminalの標準Linux環境はAVFを用いるDebian系の非protected VMであり、protected VMの機密性保証を付与しない。guest rootとAndroid host権限は別。初回案ではhostの任意shell、root、ADBを共通Tool APIとして公開しない。ブラウザから開けるlocalhostだけを認証根拠にもせず、接続は明示pairingした本人・端末・sessionへ束縛する。実transportとportの到達範囲は実測してから決定する。

### 体験と責任

利用者はHomeからSkyのToolを選び、実行先、使う入力、必要権限、保存先、cloudの場合は見積と上限を確認する。Zemaが同じjobを追跡し、Brokerが承認した操作だけを実行先adapterへ渡す。通常の画面操作はAndroid側、許可されたLinux処理はguest側で実行する。Linuxがない端末では利用不可の理由を表示し、別実行先の選択を利用者へ戻す。

- ROCK: 共通API、能力表示、Android BrokerとLinux adapterの認証・制限・状態照合、UI、互換と復旧の試験。
- EXTERNAL: GrapheneOS／AOSP／AVF／Debian、機種固有firmwareとdriver、上流修正の提供。Rockstar改変版の保守責任を上流へ転嫁しない。
- JOINT: 同一機種・host／guest版の互換、実機の停止・再開・保存、更新後の接続を受け入れる。
- OWNER: 入力・端末機能・外部作用・費用を承認。鍵生成、OS書込み、有料環境は既存の個別条件で扱う。

### 契約・保存・失敗・復旧

**入出力。** 入力候補はowner、device session、job ID、revision、承認digest、実行先、Tool ID／版／hash、許可scope、入力hash、timeout、CPU／RAM／出力量上限、必要時の予算予約。出力は同じjob IDの実行状態、成果hash／参照、実測usage、失敗理由とする。既存`lib/workflow.ts`の業務状態へadapterで対応させ、Linuxの`succeeded`を本人検収後の`completed`へ直接置換しない。第三者Toolは作者署名と審査済みmanifestを照合し、任意コマンド文字列を受付けない。

**状態。** 設計上のadapter能力は`unsupported / not_configured / ready / unavailable`を区別する。`ready`は接続準備の表示で、Tool成功や本番受入ではない。jobは既存workflowを正本とし、VM終了・応答断では結果不明として同じjob IDを照合する。取消要求と停止確認を分け、結果不明時に再実行・cloud切替・二重課金をしない。これらの能力名は設計案で、現行Capability APIへ追加実装済みではない。

**保存。** Android／cloudの既存owner別job・revision・承認・予算記録を正本とする。guest内には選択された入力と作業ファイルだけを置き、完了または取消後の入力削除、成果の明示保存、VM削除前のexportを用意する。永続成果の場所と保持期限をUIへ示す。guest diskを唯一のbackupにせず、秘密鍵・API credential・原稿をGitや診断ログへ保存しない。AndroidKeyStoreの秘密をguestへ渡さない。

**更新と復旧。** host、guest image、adapter protocol、Tool、保存schemaの版を組で記録する。VM再起動と端末再起動、disk削除と端末全損、OTA slot復旧とデータ復元はそれぞれ別試験にする。更新で接続が切れた場合は書込みを停止し、互換確認後に同じjobを照合して復帰する。

### 実装順と合格条件

1. 最新mainと実在する対象branch、ローカル差分と引継ぎを同期する。既存`os/physical/rockstaros.mk`、Android Broker／Shell、`systems/rock-star-os/`のユーザー空間処理を再利用候補として読む。既存QEMU imageそのものをAVFへ入れれば動くとは仮定しない。
2. Pixel 10の現行host版、Terminal有無、AVF、guestのarchitecture／版、port転送、保存領域を確認する。起動時間、停止・再開、画面off時の動作、CPU／RAM／熱／電池を測る。未確認の常駐やGPU／NPU利用を保証しない。
3. 非金融の決定的Tool一件で合成入力→Linux処理→同じjobへの成果返却を実装・検証する案を第一候補にする。対象Toolとtransportは次の能力調査後に選ぶ。入力改ざん、別owner／session、古いrevision、期限切れ承認、上限超過を拒否する。
4. Android側の再接続、VM終了、再起動、重複要求、取消と結果不明、保存・再取得・削除を同じ候補で試験する。機能ごとの実測を基に最適化し、速度目的だけで保護機構を無検証で外さない。
5. VM連携の受入とは独立して、RockstarOS imageのbuild／正式署名／flash／OTA／純正復旧をRLS02のgateで進める。他Androidへの移植とiOS／PC clientも個別に受け入れる。

検証入口は`npm run baseline:check`、`npm run design:check`、`npm run device-support:check`、`npm run android:first-flash:check`、`npm run verify`。これらは文書・契約・既存回帰であり、AVF接続試験の代替にはならない。実機検証コマンドは能力調査後に対象版へ固定し、host／guest／adapter／Toolのhashと期待結果を既存Android workstreamへ記録する。

**未決定。** VMの実ライフサイクル、transport、guest配布・更新元、resource上限と保持期限、最初のToolはROCKが実測・互換・license確認で案を決め、データ利用・費用の選択をOWNERへ提示する。現時点は設計のみで、Linux adapter実装・AVF実機接続・性能改善・full OS受入は未完了。

根拠（2026-10-10確認）: [GrapheneOSの保護機能](https://grapheneos.org/features)、[独自署名と更新のbuild手順](https://grapheneos.org/build)、[Android AVF Linux開発環境](https://source.android.com/docs/core/virtualization/usecases)、[GrapheneOSのTerminal導入・port forwarding履歴](https://grapheneos.org/releases#2025031300)。履歴の機能追加を現在の所有端末の動作証拠にはしない。

## 一つの製品、四つの提供区分

| 区分               | 意味                                                                  | 現在の例                               |
| ------------------ | --------------------------------------------------------------------- | -------------------------------------- |
| `native_os`        | RockstarOSのOS imageを対象環境で起動する。物理端末は機種別受入が必要  | QEMUは内部限定受入、Pixelは候補のみ    |
| `gsi_experimental` | Trebleとunlock条件を満たすAndroidへ機種別に試験する                   | 汎用Androidは計画段階                  |
| `client_only`      | 既存OSを置換せず、最小権限clientからSky・Wallet・remote jobを利用する | iOS/iPadOS、現時点のBlackBerry Android |
| `unsupported`      | 安全な導入・更新・復旧経路がないため製品対応を表示しない              | BBOS／BlackBerry 10の旧端末            |

仮想環境の`native_os`合格を、物理スマホの合格へ移さない。`client_only`はRockstarOSのサービス体験を提供できるが、root、OS更新、端末全体の隔離やハードウェア制御を提供できるとは表示しない。

## 分離する構造

```text
RockstarOS Core
├── Sky / Wallet / Game / SDK
├── owner・同意・料金・台帳・取消・復旧契約
├── 安定したDevice Capability API
├── 版付きデータ移行とbackup/restore
└── OTA policy・監査・release metadata

Device Support Package（DSP、機種／SKUごと）
├── bootloader・partition・AVB・rollback設定
├── kernel／GKI・device tree・vendor module
├── VINTF・HAL・firmware・vendor blob
├── display／input／storage／USB／radio／camera／audio
├── power／thermal／suspend／charging
└── factory restore・実機受入・license記録

Client Adapter
└── iOS／既存Android／Webから許可されたremote実行へ接続
```

Coreは機種名を条件分岐に埋め込まず、版付きCapability APIから利用可能な機能を読む。DSPにない能力は閉じ、疑似成功や別端末の証拠で代替しない。商品、Wallet、Gameの業務契約はCoreに保持し、ドライバやvendor実装から資金操作権限を切り離す。

## 後から改善できるようにする仕組み

1. **GKI/KMIとvendor module**: 同じ対応KMI内では共通kernelと機種固有moduleを分離する。KMIを跨ぐ更新はmodule再buildと実機回帰を要求する。
2. **Treble/VINTF**: frameworkとvendor実装の対応版をmanifest/matrixで検査し、build、OTA、boot、VTSの各段階で不一致を拒否する。
3. **Virtual A/B OTA**: 使用中とは別のsnapshotへ署名済み更新を配置し、起動失敗時に以前の版へ戻す。rollbackをデータ移行の巻戻しと混同しない。
4. **Dynamic Partitions**: 対応端末では`super`内を更新可能にする。bootloaderが読む`boot`、`dtbo`、`vbmeta`等は物理partitionとして機種別に固定する。
5. **鍵の階層化**: オフラインroot、release、OTA、AVB、APK/APEX、開発鍵を用途別に分離する。鍵の交代は旧鍵と新鍵の信頼期間、失効、復旧を先に試験する。
6. **データ契約**: 保存schemaへ版を付け、`N → N+1` migration、旧版read、backup/restore、失敗時の再実行を用意する。OS slot rollbackだけで新schemaのデータが自動的に戻るとは仮定しない。
7. **再現buildと証拠**: source、toolchain、DSP、鍵ID、成果物hash、試験結果をrelease単位で固定する。秘密鍵と大きいimageはGitへ置かない。

参考となるAndroid公式構造: [GKI](https://source.android.com/docs/core/architecture/kernel/generic-kernel-image)、[VINTF](https://source.android.com/docs/core/architecture/vintf)、[Virtual A/B](https://source.android.com/docs/core/ota/virtual_ab)、[Dynamic Partitions](https://source.android.com/docs/core/ota/dynamic_partitions)、[Verified Boot device state](https://source.android.com/docs/security/features/verifiedboot/device-state)。

## 物理端末を対応済みにするゲート

物理端末は型番だけでなく地域SKUまで一つに固定し、次を同じ端末・同じrelease候補で完走した場合だけ`native_os`対応と表示する。

1. 読取り専用診断でmodel、SKU、現在OS、OEM unlock可否を確認。
2. メーカーが許可するunlock/relock、factory image、復旧手順を固定。
3. source・vendor・firmware・kernel・DSPの版と再配布条件を固定。
4. 開発署名imageをbuildし、hashとbuild logを保存。
5. boot、画面、入力、保存、USB、通信、radio、camera、audio、充電、suspend、thermalを実測。
6. Sky／Wallet／Gameのowner・同意・費用・台帳・停止・復旧を実測。
7. 署名OTA、更新失敗、旧slot rollback、データmigrationを実測。
8. 純正状態へ戻し、端末が起動できることを確認。
9. production鍵、license、配布、サポート期間を別途承認。

unlockやflashに伴うデータ消去は、対象端末と実行直前に利用者へ明示する。端末購入、初期化、書込み、鍵生成、クラウド課金は本方針の承認から自動実行しない。

## 現在の順序

1. QEMUの既存受入を保持し、Android共通CoreのCuttlefish入口を作る。
2. 所有済みPixel 10／`frankel`を最初の物理対象とし、読取り専用診断でproduct、現在OS、OEM unlocking可否を確認する。Pixel 7／`panther`はPixel 10受入後まで保留する。
3. 予算承認後に専用LinuxでPixel 10の全source buildを行う。
4. 選択端末の実機受入後、Treble端末を`gsi_experimental`として一機種ずつ追加する。
5. BlackBerry Androidは正確なモデルにsupported unlock・vendor・recovery経路がある場合だけ実験候補へ上げる。旧BlackBerryは非対応を維持する。
6. iPhone/iPadはOS置換ではなくclientとして共通Coreへ接続する。

この順序により、Coreの改善をすべての提供形態へ反映しながら、機種固有の失敗を他端末やWallet契約へ波及させない。


### 共通アダプターの実装段階

Host/Executor/Outputのprotocol1、既存workflowでのprivate text実行、UID別journal、UNKNOWN/同じID照合を追加した。[責任・状態・保存・失敗/復旧・承認・合格条件](rockstaros-complete-design.md#portable-adapter-execution)と[機械可読契約](../contracts/rockstaros-portable-runtime.json)を使う。導入済みMacモデル1件とstandalone再読、Pixel保存receipt2件の投影は[証拠](evidence/rockstar-adapter-runtime.json)。NodeはWeb ownerへ未接続、既存公開APIはPixel専用で、新Pixel共通protocol・Mini/Pro等の実機受入は未完了。MacをLinux/aarch64と申告しない。


Pixel Linux common executorの開発候補は[11項目の契約](rockstaros-complete-design.md#pixel-portable-executor)を参照。SDK dev.6から既存manager/workerへ同じjob・GGUF pin・出力cap/deadlineを渡すsoftware接続であり、Android/mTLSの共通ABI実配線や実Pixelでの受入とは区別する。dev.5の封印済みhost artifactは保持する。


共通実行private transportは[11項目の契約](rockstaros-complete-design.md#pixel-runtime-private-transport)を参照。owner-private guest socketと既存mTLS relay、scope/claim/digest保存、Native wire validatorを追加した開発候補。HTTPに新たな任意実行口やAndroid credentialを公開せず、既存account controllerの共通claim/reportと実機導入は別gate。
