# avocadoMini 空間コンピュータ OS 実現設計書

版 0.10 / 2026年10月26日 / RockstarOS 1.0 Developer Preview / 内部識別子 dev.rock

## 設計の結論

Miniで設定した範囲全体を、資料・アプリ・制作物を置いて操作できる作業空間にする。手と声で対象を選び、Eveと対応アプリを使い、実際の結果を確認して保存する。PCの前に固定されず、Miniを持ち出して同じ仕事を再開する。

実装は、空間の観測、座標管理、操作対象の決定、権限の検査、アプリへの実行、光学出力を分離する。RockstarOSの本人・仕事・予算・保存は共通化し、機種固有の入力と出力をadapterとして加える。

最大の未解決事項は、裸眼で像を見せる光学系である。センサーによる部屋の計測から、範囲全体で像が見えることは導けない。近距離の空中像、壁面投影、眼鏡内表示、任意位置の裸眼立体表示を別の受入対象にする。現在、最終要求を満たす光学方式と全部品の同一筐体収納は成立確認できていない。

この文書は、ソフト実装、光学・通信bench、機械・電気設計の開発入力を定める基本設計である。設計完成や既存UIの表示を、実機性能、製造リリース、販売開始の証拠にはしない。

対象読者はOS実装担当、sensor/光学担当、機構・回路担当、試作工場、および製品判断を行う本人。各担当は、この文書の入出力契約と合格証拠を使って詳細設計する。

<!-- page -->
## 1 製品要求と適用範囲

- R-SP01 範囲全体で対象を配置・選択・操作し、対応アプリへ実操作を渡す。通知を浮かべるだけで完了にしない。
- R-SP02 声・手を主入力にする。視線は対応sensorと本人の許可がある場合の追加候補。手の認識だけで本人を確定しない。
- R-SP03 必要な像だけを穏やかに表示する。光源の直接視認、突然の強発光、通知の強い点滅を避け、即時停止を設ける。
- R-SP04 Eve、Sky、Zema、既存workflow、本人別保存、既存の料金体系を再利用する。別の顧客・請求台帳を作らない。
- R-SP05 取り外した本体へ演算・保存・本人鍵・電池・通信を残す。場所権限と座標は移設時に照合し直す。
- R-SP06 地上通信、Mini自身の衛星双方向通信、Wi-Fi共有、電話を独立した能力として受け入れる。最初の検証対象は日本と米国の両方。初期用途はsi・メッセージ・小ファイルで、一般IP共有・電話の受入を兼ねない。
- R-SP07 制作・生活・建築・Gameへ共通の操作契約を提供する。特定の外部ゲームの動作を未実証で約束しない。
- R-SP08 生体認証、sensor、空間表示、衛星、native boot、実アプリ操作は、それぞれ実装・実機・本番の受入を分ける。

要求の根拠は本人の「範囲全体でコンピュータユーズできるOS」。Instagram reel Dc74JgZybZJは参照先として記録するが、取得に失敗しており未視聴。映像内の機種や光学方式をこの設計へ推定採用していない。

代表操作は「ここに設計案を出す」「手で対象を動かす」「Eveが対応アプリで変更する」「確認して保存する」。見た目の移動と、CAD等の原本変更を別操作にする。

<!-- page -->
## 1.1 現行実装と、この版の確認範囲

本版はmain f5ea398aを固定した文書同期候補である。以前のv0.9本文はローカル設計資料として保持されており、本文/PDF全体が既にmain採用済みという意味ではない。実装の採用と、本書の採用・PDF配布を区別する。

既存のmain採用記録prepared-device-mini-main-current.jsonを基準に、PR238の受入head aba899d1と通常merge 440f3cfbを確認した。head14CI、merge13CIが成功し、head全verifyは3074件中3072成功・失敗0・skip2。これは当該artifactの回帰結果で、Mini実機の受入数ではない。

- 通信：開発用Broker本人/端末binding、AP認証入口、有限scheduler、保存期限・再送・通信量/料金予約を接続。Linux共通103試験と隔離namespaceの実packet26試験が成功。実衛星回線・実契約の本人性・Job保存先への接続は未受入。
- 手入力：一眼の端末内手指追跡から、選択・移動・回転・取消のVIEW_ONLY候補を返す。合成canvasで実SDK推論・停止を確認。実際の手の認識精度・精密3D・全域・Eveの学習は未受入。
- モデル準備：固定モデルの検証、危険な保存先の拒否、既存対象を上書きしない採用を実装。原版のリンク経由の上書きを反例として残し、修正版の独立検収を別に保持する。

既存receiptの記録時pendingや旧source hashを上書きしない。PR231/234はPR238経由の採用として読む。CodeQLには限定評価したMedium指摘1件が残り、セキュリティ指摘ゼロとはしない。参照は第20章と本版のMini限定照合証拠。

Mini単体利用、像の位置に板・膜なし、少ない表示部、上下を含む全範囲、まぶしくしない条件は維持する。実用光学方式、最終回路・配線済みPCB、同一閉箱の電力/熱・性能は未確定である。

<!-- page -->

## 1.2 参照資料の可用性と今回の採用境界

この版でGitへ保存するのは本文、PDF生成script、画像3点と限定した照合証拠である。PDFはGit外で再生成する。第1.1章に列挙したPR238のmain実装と、本書に残した旧ローカル研究の実装説明を区別する。

第12・18・20〜48・49.2・50・51章およびEve付録にある「追加した」「実装した」「確認した」「今回」は、旧版作成時の記録を含む。現行mainに存在しないsource、試験・build結果、部品選定は本書を保存しただけで採用・再実行済みにならない。第1.1章と現行受入receiptだけが今回確認した実装の範囲である。

spatial-design-assumptions.json、spatial-design-calculations.py、factory-developmentの計算/回路資料、spatial/HAND-PREVIEW.md・GO-D405.mdやLinux研究sourceには、基準main未採用の参照先がある。したがって、この限定checkoutだけで旧計算や旧runtime全体を再現できるとはしない。名前と基準mainでの可用性はdocs/evidence/development-execution/mini-spatial-reference-availability.jsonへ固定する。参照の欠落を埋める目的で保留中の616件を一括採用しない。

本PDFの生成に必須なのは本書、render-spatial-design.py、同じassets directoryの画像3点、Python/reportlab、埋込み可能な日本語TrueType fontである。環境変数MINI_PDF_JAPANESE_FONTでfontを指定する。既存public/brandのlogoは存在するときだけ使う任意依存で、画像3点のほかに追加取得はない。フォント本体やSDK/model binaryはGitへ入れない。

表紙は既存の構想CG、光路図と両眼図は旧研究の説明画像である。実物、光学性能、製造適合、実装試験の新しい証拠ではない。画像は元ローカル資料から同byteで限定採用し、生成元の再検証や外部公開の権利確認を完了したとは主張しない。

<!-- page -->
## 2 範囲全体の定義とカバレッジ

設計対象の空間を D、観測可能な領域を S、入力を解決できる領域を I とする。表示は対象位置だけでなく観察者位置にも依存するため、V(objectPose, viewerPose, environment)として扱う。Aは対象アプリで許可された操作の集合、Pは本人・場所・共有範囲の権限条件である。

操作を許可する条件は、対象がD内、観測と入力が有効、指定の観察者から表示が読める、AとPが満たされることである。位置だけの共通集合で光学の視域を説明しない。

- 対象領域、利用者が立つ領域、許可された表示surface、障害物、照明条件を場所profileへ保存する。
- 各点の観測・入力・表示を別々に測定する。見えない点を正常色で塗りつぶさない。
- 未測定、遮蔽、校正喪失、視域外は操作不可として理由を表示する。これは範囲全体要求を満たした状態ではない。
- 範囲の変更は本人が確認する。失敗点を自動で範囲外へ除いて「全面対応」としない。
- 複数のsensor/表示装置で拡張する場合も、一つのowner・場所・仕事へ結ぶ。単体構成と拡張構成の能力を別に表示する。

P0の試験用仮領域は幅3m×奥行3m×高さ2.5m。製品公称でも本人が確定した寸法でもない。0.5m間隔の格子では7×7×6＝294点。観察者9位置、向き4条件なら10,584条件となる。近距離、境界、遮蔽、暗所は追加条件。有限の点検だけで連続空間全体を証明できないため、補間誤差のモデルと移動経路試験も必要。

家具や人の裏側を一つの光学sensorから常に測ることは保証しない。補助観測が必要なら、その構成と費用・設置条件を明示して判断する。

<!-- page -->
## 3 OSの構成と担当

### ローカルの短い処理経路

Sensor Adapter → Observation Bus → Space Runtime → Interaction Resolver → Scene Compositor → Output Adapter。

この経路が、手の動きと表示の追従を担当する。Cloudの応答待ちを毎frameの処理へ入れない。第49章の採用済み試作はローカル表示までで、この製品向け経路全体を実機で接続したものではない。

### アプリを操作する経路

Interaction Resolver → RockstarOS Broker → App Adapter または Sky Tool → 実結果の読戻し → 既存job/artifact保存 → Scene更新。

Eveは目的を整理して操作案を作る。操作対象・本人・権限・上限・期限を検査するのはBroker。model結果を実行権限や成功receiptへ昇格させない。

- Space Runtimeは場所の座標系、校正、アンカー、観測の有効期限を管理する。
- Scene Compositorは対象の配置、前後関係、閲覧者別の表示、出力装置の対応を管理する。
- Interaction Resolverは手/声から対象と候補操作を決め、曖昧な選択を解消する。
- App Adapterは対応appの限定操作と状態読戻しを担当する。
- Output Adapterは実装した光学・画面・音声だけを公開する。
- MCUは停止と監視を担当し、家電・Tool・支出を承認しない。

ROCKは共通runtimeと強制境界、EXTERNALは部品・BSP・光学・OS API、JOINTは同じ実機とbuildの受入、OWNERは対象場所・観測・実行・費用・公開を判断する。

<!-- page -->
## 4 本体と内部配置

外観基準は、銀色円筒、上部の黒いsensor帯、収納・せり上がり・携行の三状態。仮のD76×H186mmを維持して実現性を調べる。変更が必要なら、要求との衝突を示して本人が判断する。

現在の軸方向の仮枠は上から、RF20mm、sensor/光学42mm、演算28mm、電池76mm、保持/接点20mm。合計186mmである。

- RF上端にはアンテナの非導電窓と必要なground/離隔を確保する。銀色外観と全面金属を同義にしない。
- 黒帯にはsensor窓と光学出口を検討する。レンズ数・光路・放熱・封止は未確定。
- 演算区画にはSoC、RAM、保存、保護鍵経路、熱路を置く。CM5はbench参照で製品採用ではない。
- 電池区画にはpackと保護を置く。radioを並べる案は干渉と熱を実CADで確認する。
- 下端には保持・給電・早切れ接点を検討する。設置場所scopeを取り外し時に失効させる。

衛星modem、地上通信、Wi-Fi、音声、MCU、配線、放熱、光学機構を収めた最終CADはない。既製9523 IP基板の幅75mmは仮内径72mmを超す。既存の四分割光学板案は現寸法で採用できる状態にない。

外径76mm×高さ186mmの円筒体積は約0.844L。内径72mm、同じ高さを仮定した上限は約0.757Lだが、cap・接点・保持・熱路がこの体積を減らす。容積だけで部品の形状適合を判定しない。

使用時の約50mm露出では、現配置の光学区画下端12mmが天板下に残る。視野と光路が遮られる可能性を断面図で検証する。

<!-- page -->
## 5 空間と手を測るsensor設計

P0の機能候補は、周囲の追跡camera、近距離depth、IMU、周囲光、マイク、dock接点、温度。本人確認の指紋等は別系統として選定する。型番と採用台数は未確定。

水平全周の比較例として、水平FOV120度のsensorを90度ずつ向け、隣接30度を重ねる案を評価する。単純計算は ceil(360/(120-30))＝4方向。これは理想的な角度被覆だけで、天頂・足元・近距離・本体や手の遮蔽、指の認識精度を保証しない。

- 広角による歪み、端部の解像度、露出差を校正する。
- 手が見えることと、指先を操作に必要な精度で追えることを別評価する。
- 金属、反射物、黒色物体、逆光、暗所、複数人、手の重なりを測る。
- 深度sensor等の能動照射は発光条件・干渉・使用者位置を確認してから有効化する。
- camera露光時刻、IMU時刻、frame番号、校正版を付ける。受信時刻だけを使わない。

通常のraw画像は端末内で処理する。Cloudへ送るのは、目的と権限を確認した情報だけ。録画・録音は初期状態で保存しない。mapには私的な形状情報も含まれるため、本人別に保護しexportを明示操作にする。

採用条件は、必要領域における誤差・遅延・消費電力・熱・Linux driver・供給資料が揃うこと。小さいsensorでも、レンズと配線と放熱まで収まらなければ採用しない。

<!-- page -->
## 6 座標と校正

内部の基準は右手系、長さm、回転は正規化quaternion。場所座標Pはxが右、yが前、zが上。camera/OpenXR等の別規約はadapterで変換し、行列規約を黙って混ぜない。

frameは場所P、本体B、camera C_i、手H、対象O、表示surface S_j。T_ABはBの点をAへ変換する4×4行列と定義する。

T_PO(t) = T_PB(t) × T_BC × T_CH(t) × T_HO。

この式は組合せの例で、対象ごとに手から固定するか、場所へ固定するかを選ぶ。場所固定対象を手の誤差で毎回動かさない。CADの単位・縮尺は別metadataで保持する。

### 初期校正

1. 本人が利用範囲と観察の許可を指定する。
2. sensor内部/相互校正と、dock・本体の配置を確認する。
3. 床などの基準、複数の基準点、表示surfaceとの対応を測る。
4. calibrationId、residual、時刻、使用機器・版を保存する。
5. 手と表示点の差を実測し、合格後に操作を有効化する。

poseには取得時刻、期限、位置/角度誤差、tracking状態を付ける。異なる端末のmonotonic clockは直接比較せず、offsetと不確かさを測る。必要な同期精度を満たさないframe間では融合しない。

局所再配置やdock再装着は、同じ場所IDでも校正を再確認する。地図の一致確率だけで本人や場所権限を復元しない。

<!-- page -->
## 7 手と声から操作を決める

製品向け操作契約の設計状態は Idle → Pointing → Focused → Candidate → Committed → Released。追跡喪失、別対象への変更、期限切れはCancelledへ移す。

- 近距離は指先と操作面の交差、遠距離は指示rayと対象の交差を候補にする。
- rayの最初の見えている対象を基本にし、遮蔽の裏へclickを通さない。
- 選択は輪郭等で穏やかに示す。選択だけで送信や購入を行わない。
- pinch等の確定動作は押下・解放を一組で扱い、保持中の連続clickを防ぐ。
- 二手の移動/縮尺変更は、操作開始時の対象と基準点を保持する。
- 文字入力は声、対応する物理keyboard、既存Eveでの編集を用意する。

「これを大きく」は、指した対象と発話の時間窓を照合する。P0では前後500msを調整用仮値にし、二対象が候補なら選び直す。これは本人性の証拠ではない。

「ここへ移す」はscene配置変更。「この壁を30cm動かす」は原本編集候補。後者は寸法、単位、原本revision、変更Toolの能力と権限を確認し、previewから確定する。

手trackingの100ms超の古さはP0の設計候補で、実機遅延から調整する。第49章のブラウザ試作の200ms欠落判定・1.5秒I/O待ちとは別条件である。試作のENDはCoreのCommittedを意味しない。MCUの200ms health期限も手入力へ流用しない。

近距離の仮ボタン幅は40mm。校正・追跡誤差から必要幅を再計算する。精密CAD編集では、空間の手だけで数値を決めず、数値入力・snap・拘束条件・原本Toolを使う。

<!-- page -->
## 8 光学出力とまぶしさ

製品要求は、指定範囲で必要な像を自然に見て操作すること。表示方式は以下を区別して選ぶ。

- 近距離の空中結像：限定した位置・視域での通知/操作をbench評価する。部屋全体の任意点へ像を出せると扱わない。
- 壁・机への投影：表面がある範囲で成立を評価する。何もない空間の裸眼像とは別の能力。
- AR等の装着表示：空間OSの座標/操作検証用になり得るが、裸眼・持ち物不要要求の達成にはしない。
- 範囲全体の裸眼表示：対象と観察者の位置、遮蔽、奥行き、複数人、光漏れ、光源/電力を満たす方式を研究する。現時点の採用方式は未確定。

ASKA3Dの一次資料は、プレート単体には表示装置・PC・motion sensorを含まないと説明する。この部品の存在だけでMini一体の空間表示が成立するわけではない。[S1]

### まぶしくしないための受入

光源が直接見えない経路、遮光、拡散/反射面、穏やかな輝度変化、暗所調光、即時停止を要求する。0/10/100/500lxはP0の室内試験条件候補。照明条件を記録し、各観察位置で輝度、不要光、可読性、反射、本人の負担を測る。屋外直射は別profileで、明るさの増加だけで対応にしない。

光量/露光の正式上限は、採用光源と光路について専門担当が評価する。根拠のない安全なcd/m2やlaser値をここで固定しない。CSSの暗色や明るさsliderを光安全の証拠へ転用しない。

範囲全体を満たす方式が見つからない場合は光学gate未達のままにし、画面や近距離表示へ要求を自動変更しない。

<!-- page -->
## 9 コンポジターと範囲全体の表示

sceneは対象objectと、表示surfaceと、観察者を分けて持つ。plane UI、3D model、通知、app surface、操作候補を型で区別する。

各objectはobjectId、owner、placeEpoch、sceneRevision、jobId、artifactRevision、pose、実寸または表示縮尺、許可操作、閲覧scopeを持つ。対応rendererがない型は表示不可を返す。

- 操作対象、確定前の変更、実行結果を異なる状態で示す。
- 個人向け表示と共有表示を分ける。共有sceneへの参加者を本人が指定する。
- 光学上、周囲の人へ見えてしまう場合は私的内容を出さない。ソフトの閲覧権限を光学的な秘匿と同一視しない。
- 通知は現在の作業を覆わず、必要時だけ穏やかに出す。
- 出力装置の視域を超す位置へ対象を配置した場合は、表示不可の理由と移動候補を返す。

描画は実際に対応したVulkan/OpenGL等のbackendから選定する。OpenXRは対応する装置/OSとの座標・frame連携の比較基準とし、OpenXR導入だけで裸眼光学ができると扱わない。[S2]

ローカル60HzをP0の目標にし、scene更新とappの低速応答を分離する。手の追従はlocal、Eveの応答はjob状態で提示する。描画できないときに古い操作面を有効なまま残さない。

<!-- page -->
## 10 対応アプリのコンピュータユーズ

接続の優先順は、専用Tool/API、許可済みOS accessibility、許可済み画面captureとpointer/keyboard操作。対象appがAPIを持つ場合は、その契約と結果照合を使う。

Linux参照構成ではWayland上のXDG Desktop Portal RemoteDesktop/ScreenCastを調査対象にする。本人が選んだ機器・画面へのsessionを開始し、取得したstreamの論理座標へ入力を変換する。Portalが実装されていない組合せでは利用不可を返す。[S3]

### 操作の一件ごとの結合

owner、deviceId、app/window識別、stream、観測frame、入力座標、scene/object revision、scope、期限、job/actionIdを結ぶ。modelが返した座標だけで実行しない。

選択surfaceのUVを表示対象appの論理座標へ変換する。画面pixel、DPI倍率、crop、回転をadapterが処理する。monitor全体のcaptureしか取れず、対象windowの対応を安全に特定できない場合、そのapp限定操作を提供しない。

実行直前に対象とfocusを再確認する。window移動、modal、scale変化、別appへの切替で古い操作を無効化する。クリック後は対象appの状態を読み、押したという事実だけで保存・送信・購入成功を記録しない。

任意shell/rootの共通実行口、globalな無制限入力、無断のbackground captureを作らない。web UI単体は他のdesktop appを自由に操作できない。native adapterと本人の許可が必要。

送信・支払い・公開・削除・物理作用の扱いは既存Broker/Toolの承認を維持する。操作内容が変われば、既存の承認を流用しない。

<!-- page -->
## 11 実装用のメッセージ契約

以下は新しい設計契約で、現在のruntimeが実装済みという意味ではない。

Observation：schema、sensorId、bootId、sequence、frameId、calibrationId、placeEpoch、observedMonoNs、expiresMonoNs、pose、units、errorBound、trackingState。

SpatialIntent：intentId、ownerSessionRef、jobId、objectId、sceneRevision、inputObservationRefs、verb、arguments、targetAppRef、deadline、grantRef。

ActionReceipt：actionId、jobId、targetAppRef、beforeObservationRef、afterObservationRef、outcome、artifactRef、usageRef、reconciliationRequired。

Outcomeはprepared / awaiting_approval / running / succeeded / failed / cancelled / unknown。操作候補と実行receiptを別の型にする。model生成のreceiptを受け入れない。

local IPCはLinuxの本人/サービス別Unix socketを参照案とする。peer credentialと既存の本人sessionを照合し、JSON制御messageは4byte長さprefix＋UTF-8、上限64KiB、未知schema/余分な権限field/範囲外値を拒否する。raw映像や点群はこの経路へ詰めず、許可された共有buffer/streamを別にする。

生体stream、API鍵、tokenをscene objectへ含めない。遠隔接続は認証された暗号化transportを使い、異なるhostのclockを直接比較しない。

Pico試作の20byte USB frameとこのIPCは別契約。既存MCU frameへsceneや本人の情報を後付けしない。CRCは破損検出であり署名・本人認証ではない。

各状態変更は既存workflowのrevisionとactionIdを使って照合する。再送時は同じactionIdで結果を読み、実操作を自動反復しない。

<!-- page -->
## 12 起動と実行状態

### 起動順

1. 監視MCUを出力OFFで起動。停止・電源・装着の状態を確認する。
2. 対象SoCのboot/BSP/driverを起動し、保存の整合と鍵の利用状態を確認する。
3. 本人がログインし、既存の利用権と許可を確認する。
4. 実際のsensor、出力、app adapterの版と能力を検出する。
5. 場所と校正を確認し、観測・入力・表示の対応領域を作る。
6. 合格した能力だけを公開し、対象を選んで操作できる状態へ移す。

装置状態は Booting / OwnerRequired / Calibrating / Ready / Degraded / OutputStopped / RecoveryRequired。app仕事の状態とは別管理にする。

- Readyでも未対応のappや表示方式は利用できない。
- sensor断や校正喪失は該当範囲をDegradedにし、操作を止める。
- 表示停止は仕事の停止とは別。Cloud jobを止めるには対象jobを指定して既存停止経路を使う。
- Thanks Eve等の音声停止は、対象jobを解決して停止結果を照合する。完全電源断と音声待機は別。
- 再起動では未完了actionを照合する。UNKNOWNを完了や未実行に勝手に変えない。

既存のMCU healthは50ms通知、host freshness200ms、heartbeat100ms、MCU期限500ms等の設定を持つ。これは試験LED用のsoftware設定で、光学停止の保証時間ではない。現在のLinux driverはHEARTBEAT/STOPのみを送り、ARMは公開していない。

<!-- page -->
## 13 性能予算と計算

すべてP0の調整用目標で、製品保証値・実測結果ではない。最終値は同じ実機/光学/温度条件で測定して固定する。

### 入力から見た目が変わるまで

60Hzの1frameは16.67ms。取得待ち16.7ms＋認識8ms＋座標/対象解決2ms＋local判定2ms＋次frame16.7ms＝45.4msの予算例。観測から光学出力までの実測P95を50ms以下、P99を80ms以下とする仮目標を評価する。各工程のP95の和が全体P95になるとは扱わない。camera露光/表示scan/queueも実測に含める。

queueは最新frameを優先し上限を設ける。古い処理が溜まった場合はdropし、時刻を偽って新しく見せない。Cloud推論やapp responseはこの45.4msへ含めず、別の仕事として状態表示する。

### 位置誤差

距離2m、角度誤差0.15度の横ずれは約5.24mm。校正5mm、手tracking5mmを仮定すると保守的な加算上限は15.24mm。40mmボタンの半幅20mmでは残り4.76mmだけで、余裕が小さい。4mでは横ずれ約10.47mm、加算20.47mmで半幅を超える。遠方ではray選択と拡大確認等が必要。独立性を確認せず二乗和平方根で誤差を小さくしない。

### raw映像の予算

仮に4台の1280×720灰色8bit/60fps、640×480 depth16bit/60fps、1920×1080 RGB24bit/30fpsなら、221.184＋36.864＋186.624＝444.672MB/s。wire/USB overhead・IMU・copyは別。3回の同等メモリ転送だけで約1.334GB/s。無圧縮の計算例であり、採用台数や製品通信仕様ではない。

<!-- page -->
## 14 電源と熱と通信

既存の比較仮定は、公称46.8Wh、使用可能率0.8、変換効率0.9で負荷側33.696Wh。8Wを2時間使うと残り17.696Wh、残る22時間の全待受は平均0.804W以下となる。この計算は電池packや24時間待受の採用保証ではない。

空間trackingと描画を含む合計消費電力を仮に12W/20W/30Wと置くと、33.696Whからの算術上限は2.808h/1.685h/1.123h。温度、劣化、RF peak、保護余裕をさらに測る。常時空間操作と24時間待受を同じprofileとして宣伝しない。

### 電源の分担

常時監視はMCUと必要なwake回路。主SoC、camera、光学、radioは必要状態で有効化する。衛星待受の実際のpaging電力も測る。監視MCUの低電力だけで全待受を計算しない。

光学・駆動は主SoCのGPIO一本で有効化できない設計を要求する。電池保護、過熱、停止、装着状態を独立経路で扱い、初期値と断線時は停止側へ置く。

### 熱設計

許容表面温度、cell上限、SoC throttling、光学/RF上限を採用部品と接触条件から定める。20W・許容温度上昇15Kを仮置きした熱抵抗の目安は0.75K/W。これは達成済み値でも安全温度の指定でもない。閉箱での実測なしに銀色筒の放熱で足りるとしない。

日米の初期用途はsi・メッセージ・小ファイル。衛星登録、一般IP疎通、DNS/TLS、Wi-Fi共有、通常電話番号の通話は別段階で確認する。衛星送信は上空視界、姿勢、契約条件を満たすときだけ。屋内・ポケット内での通信成功を仮定しない。

<!-- page -->
## 14.1 日米の小容量通信と常駐制御

Mini自身の衛星回線とWi-Fi配布を目標とし、ドック・電話・Proを携行時の必須機器にしない。現段階では事業者・modem・アンテナ・電池・日米の契約/適合を確定していない。共通adapterの試験を先行し、架空のJP/JPY・US/USD profileを実契約の価格や提供地域の証拠にしない。

message_adapter.pyはsi/message/fileを有限分割し、認証付き再組立、重複排除、再送、保存期限を扱う。本文・queue更新と通信予約を既存Controllerの同じSQLiteで記録する。各attemptでenvelope実bytes、最大ACK、承認済みoverheadと費用を予約し、不明な送信結果の予約を自動で戻さない。HMACは機密性を与えず、実transportの暗号化・鍵供給は別受入である。

message_service.pyは既存ServiceAccessPrincipalAdapterの固定consumer owner/deviceをpolicyへ結ぶ。公開requestはstatus/enable/stop/enroll/revoke/enqueueに限定し、owner・価格・観測・接続先・shellを入力側から選べない。現行本人確認は公開fixture tokenを使う開発系列で、実契約の本人認証ではない。

AP認証を予約の前後で再確認し、送信直前にも本人・message・grantの期限を検査する。端末失効では旧PSKを除き、再登録で旧queueの許可世代を失効させる。有限schedulerは1周期1〜8件、再送可能時刻と回数を守り、停止中・回線断でもTTLを掃除する。再起動はAP/送信無効から始まり、本人の再開・再認証・新観測を必要とする。

常駐入口は所有者の0700 directory内の0600 Unix socket。requestは最大100000 bytes/全体1秒、返信1秒、最大86400周期で終端停止する。LocalModemTransportは固定Unix endpoint・Linux peer UID・最大3秒の応答を使う。これは実衛星modemのsupervisor実装やcarrier側hard capの証拠ではなく、local grant辞書もProvider署名ではない。

ROCKは予約/期限/認証/停止の制御、EXTERNALはmodem/網側上限と国別契約、JOINTは同一実機と請求の照合、OWNERは相手・期間・国・通信量/料金上限を担当する。任意外部callback全体の応答期限、瞬時RF停止、実systemd導入、Jobへの永続保存引渡し、実衛星/請求は未受入。料金・回線枠を自動増額しない。

<!-- page -->
## 15 Eveと料金と本人

本人はEveで目的、担当、使う情報、予算を確認する。Skyは対応するAgent/Toolへつなぎ、Zemaは同じ仕事の進捗・承認・停止・成果・使用額を管理する。用途ごとに別OSや別請求systemを作らない。

実行先はMini本体、本人が接続した対応PC、許可したCloud。能力の自己申告やsensor観測だけでは、実行先の本人性・対応・権限を証明しない。ローカルLLMは必須ではなく、対応した機種の能力である。

- Cloudは既存の単価/見積、上限承認、予約、usage、照合を使う。
- deviceを増やしただけで同じ契約の基本料金を重複させない。
- 商品代、通信料、AI使用料、外部実費、OSS/BYOKを区別する。
- 上限や権限が不足した場合は提案・保存へ戻し、別providerへ勝手にfallbackしない。
- 指差しや音声認識は操作の手がかり。生体照合も既存の本人sessionと失効条件に結ぶ。

範囲内の共同作業では招待者と役割を管理する。閲覧者には操作・外部送信権限を自動付与しない。別人の手と本人の声が同時に観測された場合は、認証済みの入力対応が取れるまで確定操作をしない。

既存のbrowser初版は、依頼文をメモリ内で準備し、明示copy後に既存Eveへ移る。これは本人仕事同期やMiniからのAI実行を実装した状態ではない。保存済みSite v44は公開承認レビューで停止した履歴があり、本設計書の依頼を公開承認として使わない。

<!-- page -->
## 16 保存と故障と復旧

保存対象は既存job/artifact、scene配置の版、場所profile、校正、承認/実行receipt。本人別に保護し、保存の世代と復旧方法を定める。認証秘密と生のcamera/生体データはsceneへ混ぜない。

- 電源断：原子的保存と未完了actionの照合。書込み途中のsceneを正常として採用しない。
- 通信断：localの能力だけ継続。遠隔操作の結果不明はUNKNOWN、再接続後に照合する。
- tracking喪失：操作を解除し、古い指先位置からのclickを止める。
- focus変更：app対象を再観測し、古い座標操作を破棄する。
- 光学出力断：見えない対象を操作可能にしない。必要なら音声で状態を知らせる。
- dock離脱：旧場所epochと旧入力座標を失効。同じjobは保持する。
- 再装着：機械状態、本人、場所、校正を確認して再開する。
- 過熱/低電池：安全に出力を停止し、保存・進捗照合を優先する。

結果不明の外部送信、購入、削除、物理作用は自動再実行しない。ユーザーの再依頼でも元actionIdと実結果を照合する。

native OSには対象機種別の署名boot、更新、rollback、復旧媒体/手順が必要。共通runtime packageやbrowser UIを入れただけでこれらを満たしたとしない。製品署名鍵の生成・保管、端末購入・flashは別途本人が条件を指定する。

現時点のMCU firmwareは署名済み製品firmwareではなく、bench用。最終の安全回路、電池保護、署名/復旧は正式な回路・同一実機で受け入れる。

<!-- page -->
## 17 検証計画と合格証拠

以下は主に実機受入の計画である。第1.1章のhost/合成browser/隔離Linux試験は既に確認済みだが、SC01〜10を同一Miniで完了した証拠へ転用しない。

- SC01 範囲：Dの格子、境界、経路、遮蔽、観察者位置を測定。未測定を合格にせず、有効範囲と不足点を提示する。
- SC02 校正：実測基準点と表示点/操作点の誤差、再装着・温度変化・時間経過を記録する。
- SC03 入力：手の左右、姿勢、遮蔽、複数人、声との対応、誤click、押下/解放、追跡喪失を測る。
- SC04 表示：読みやすさ、不要光、まぶしさ、暗所、視域、光漏れ、出力停止を同じ光学系で確認する。
- SC05 実app：一つの対応appで、選択→実操作→実結果→原本保存を行う。UI animationだけを成功にしない。
- SC06 権限：別owner、期限切れ、場所変更、focus変更、予算超過、取消を拒否する。
- SC07 再開：切断・再起動・結果不明・移設を起こし、重複実行せず同じ仕事へ戻る。
- SC08 性能：入力/光出力のtimestampを実測し、P50/P95/P99、drop、誤差、電力・熱を報告する。
- SC09 通信：地上/衛星/Wi-Fi/通話を個別に確認し、同時負荷を同一閉箱で測る。
- SC10 製品：手ぶらの依頼→制作/操作→承認→成果→持出し/再開を本人が一周する。

誤作動は分母を含めて報告する。例えば1000回で誤作動0でも、独立試行の仮定で片側95%上限は約0.299%となり、誤作動ゼロを証明しない。実使用の連続性や相関も別に評価する。

各証拠には個体、回路/PCB/光学/driver/OS/adapter版、場所profile、校正版、条件、計測器、raw trace hash、判定者、未達を付ける。host/fixture、browser、仮想OS、実機、本番を分ける。既存OI/MP/ASの合格数を文書作成で増やさない。

<!-- page -->
## 18 開発順と工場への引渡し

### E0 実現性と方式の決定

要求、D/観察者領域、光学候補、sensor視域、app一つ、SoC候補を決める。光学/指入力/通信を別benchで測り、部品STEP・配線・熱・アンテナ空間を同一CADへ積む。裸眼の全範囲が成立しなければ未達条件と代案を本人へ示す。

### E1 空間OSの一周

benchの実sensorと一つの表示surface、対応appをつなぐ。観測→校正→対象選択→Broker→app操作→読戻し→保存を作る。外部PC等の研究rigを使った場合は、Mini単体完成と分けて報告する。

### E2 回路と基板

E0/E1で採用した部品だけから、電源/保護、SoC/保存/鍵、MCU/停止、sensor/audio、生体、地上通信、衛星RF、Wi-Fi、光学driver、dockを回路化する。pin/net、電圧、電流、起動順、故障値、ESD、connector、stackup、RF keep-out、熱路、test pointを確定する。

### E3 同一閉箱と製造受入

回路図/ERC、PCB/DRC/netlist、BOM/代替、Gerber/Excellon、位置表、STEP/加工図、公差、pack図、光学図、組立/校正手順、firmware/OS hash、署名/復旧、検査fixture、SC/OI/MP/AS報告を一式にする。認証や回線条件も完成機として確認する。

現在ある76×62mmの接点/LED基板は監視系bench用で、上記の製品mainboardではない。ファームウェア、USB driver、Eve起動部、共通runtime、ブラウザOS画面は既存の開発資産として再利用する。

本書で工場の設計開発担当へ実現性・試作・回路/機構開発の見積を依頼できる。製造担当へそのまま量産を指示できる版ではない。必要な人員・費用・納期はE0の部品と受入範囲を確定して見積し、根拠なしに固定しない。

<!-- page -->
## 19 設計判断と未解決事項

### この版で決めること

空間の範囲と観察者を明示する。座標・対象・本人・app・仕事を共通契約で結ぶ。ローカルの追従経路とEve/Toolの実行経路を分ける。光学、sensor、app操作、本人、料金、物理停止を別責任にする。既存RockstarOSの仕事/保存/料金を再利用する。

### 実機・製品受入に必要な次の決定

- 最初の実在空間と、Dおよび観察者位置。
- 裸眼光学候補と、全範囲への不足条件。
- 最初に操作するappと実行先OS/版。
- camera/depth/IMUと時刻同期の候補。
- 位置精度、遅延、明暗、温度、電力の仮目標から正式受入値への更新。

### 未解決の最大リスク

一つの小型円筒内で、範囲全体の裸眼表示、手の追跡、一般衛星IP共有、地上通話、電池、放熱を同時に成立させること。いずれかの個別技術の存在だけでは、この組合せを証明できない。

不足が出た場合は、表示装置の分散、sensor拡張、外形、稼働profileなどの差分を数値で示す。本人の最低要求を開発側で黙って削らない。ソフトの操作を先行開発しても、光学の未達を解消したとは記録しない。

本版は基本設計と現行実装の対応を更新する。通信制御と手入力の一部はmain採用済みだが、製品全体の空間runtime、最終光学、製品基板、製品native OS、実機合格、製造リリースを完成させた版ではない。

<!-- page -->
## 20 参照資料と既存資産

### 一次資料

[S1] ASKA3D 製品一覧。plate単体と表示unitの構成の違いを確認。2026年10月22日閲覧。https://aska3d.com/ja/products.html

[S2] Khronos Group OpenXR Guide Frame Submission。対応XR runtimeにおけるframe待機/開始/提出の参照。裸眼光学方式の成立根拠ではない。2026年10月22日閲覧。https://github.com/KhronosGroup/OpenXR-Guide/blob/main/chapters/frame_submission.md

[S3] XDG Desktop Portal RemoteDesktop。本人が許可するdevice/stream、screen cast、入力、sessionの参照。対象環境での対応確認は別途必要。2026年10月22日閲覧。https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html

[S4] ROS 2 geometry2。複数座標frameと時間を扱う実装の参考。採用済み依存ではない。2026年10月22日閲覧。https://github.com/ros2/geometry2

### このrepositoryの設計原本

- docs/rockstaros-complete-design.md の mini-spatial-computer-use。
- docs/rockstaros-avocado-mini-complete-design.md。
- docs/avocado-mini-r5/phone-spatial-interface.md。
- docs/avocado-mini-r5/factory-development/electrical-architecture.md。
- docs/avocado-mini-r5/factory-development/component-verdicts.md。
- docs/avocado-mini-r5/product-invention-r1.md。
- contracts/rockstaros-portable-runtime.json。
- contracts/avocado-mini-supervisor.json。
- systems/rock-star-os/targets/avocado-mini/README.md。
- packages/rockstaros-runtime/README.md。

現行実装の基準はmain f5ea398a。PR238採用記録はdocs/evidence/development-execution/prepared-device-mini-main-current.json、通信契約はtethering/MESSAGES.md、手入力契約はgesture/README.md（両者ともsystems/rock-star-os/targets/avocado-mini/配下）。本版の照合・本文/生成物hashはdocs/evidence/development-execution/mini-spatial-design-sync.jsonへ記録する。外部資料の閲覧日は当時の記録を保持し、今回再調査したとは扱わない。

旧版の計算はローカル参照spatial-design-assumptions.jsonとspatial-design-calculations.pyに基づく記録である。両参照は基準mainと今回の限定保存に含まれず、本checkoutだけでの再計算を約束しない。入力値はすべて仮定であり、出力を部品採用や実測値へ昇格させない。


<!-- page -->
## 21 光学方式を絞るための計算

範囲全体の最終方式は未選定のまま維持し、P0は平面空中結像の近距離benchに絞って調べる。このbenchが成功しても、製品の範囲全体の裸眼表示の合格にはならない。

有効開口A、plateから像までs、plateから観察者までv、像の幅W、観察者の横位置x_eを仮定する。理想的な平面の実像では、像の点x_iへ届くrayをplateまで延長した交点は x_plate = (v*x_i - s*x_e)/(v-s)。全像のrayが開口内を通る必要条件から、全像が見える観察者領域の幅Bは B = [A*(v-s) - W*v]/s となる。負の場合はその条件で全像を見られる位置がない。

s=0.2m、v=2m、W=0.04mの比較では、A=72mmならB=248mm、A=200mmならB=1.4m、A=420mmならB=3.38m。幅3mの観察者領域を要求するとAは約377.8mm必要になる。これは一つの面/軸の必要条件で、立体の全方位表示の解ではない。

この式は無収差・理想光路の幾何に限る。回折、輝度、散乱、眼の瞳、plate効率、縦視域、遮蔽を含まず、ASKA3Dの性能保証や他の光学方式が不可能という証明には使わない。Wは試したい像の仮幅で、メーカーの面積約70%から線形換算した値ではない。

採用品からは、200NT既製plateのそのままの収納と、未保証の切断/折畳を除外する。表面投影は座標/入力の研究には使えても、空の場所の裸眼像にはならない。装着表示も最終要求の代替へ自動採用しない。全範囲の方式は大きい/分散した開口などの比較へ進み、外形や設置要求との衝突を本人判断へ戻す。

<!-- page -->
## 22 実寸部品を使った内部配置のふるい分け

optical-layout-input.jsonへ、出典付き部品と未採用の空間予約を分けて入力した。optical-layout.pyは円筒内の半径/高さ、axis-aligned部品同士の交差を計算し、JSON、OpenSCAD envelope、SVGを生成する。正式STEP、公差解析、光学設計、DFMにはならない。

CM5は55×40×4.7mmのmodule外形のみを使う。z=67〜71.7mmへ置く仮例では内径72mmに幾何上収まるが、socket、carrier、RF、配線、熱を含まない。直径70mmのcarrierと54×38×10mmの熱路は未製造の空間予約で、採用部品ではない。

M65A二本の最大直径21.7mm・長さ71mmを、中心x=±12.5mm、y=10mm、z=92〜163mmへ描く。裸cell同士の中心距離は25mmで、表面間は3.3mm。保護・絶縁・端子・固定・膨張を含むpackの適合は未証明。44×10×65mmのradio廊下は空の予約で、実modemが入ったという意味ではない。

ASKA3D-200NTは商品ページが200×200×6.3mm、図面が200±0.5mmと厚み6.4±0.5mmで異なる。寸法ふるい分けには200.5×200.5×6.9mmを使用し、正式採用前に現行図面を照合する。現配置では円筒外へ出るため除外。小さい値を選んで収納成功にしない。

全範囲の光学、像源、sensor窓、保護pack、衛星/地上/WiFi、音声、鍵/生体、製品MCU、保持/配線、校正と熱の12項目を未完了として残した。幾何上入った数点だけを根拠にmainboardや閉箱をreleaseしない。

<!-- page -->
## 23 動く空間操作処理とlocal app

systems/rock-star-os/targets/avocado-mini/spatialに、rayと表示面の交差、右手系のrigid変換、範囲、遮蔽AABB、誤差/端部、100ms入力期限、boot/calibration/場所epoch、sequenceを検査する処理を実装した。sourceはsynthetic-pointerだけを受け、未接続の実sensorから取得したとは扱わない。

候補の準備で、UV、対象app/object、版、場所、校正、期限を固定する。hostの明示承認を経て、local draftを一度変更し、同じappの読戻しを照合する。候補は10秒で失効。承認後の対象/focus相当の状態変化は再準備へ戻す。操作後の不明結果はUNKNOWNで、自動再実行しない。

Nodeの開発実行で下書きを(0.5,0.5)から約(0.68,0.42)、revision0から1へ変更し、private UID journalへ保存した。別processの読戻しも再実行しない経路を持つ。これは合成空間入力とlocal appに限る動作で、手tracking、外部desktop app、光学、実機は未接続。

browser版は既存lib/workflow.tsの遷移を使い、developer sessionのlocal previewをreviewへ進める。Node版はbrowserやMCPで動いたと偽ってtransportを記録せず、jobはactiveのままlocalStagesを記録する。正式な本人アカウントや請求systemを新設しない。

localhostだけのLabをbuildし、ray入力、移動候補、明示確定、場所変更、合成障害物、記録exportを操作できるsourceを作った。browser表示ツールが接続エラーとなったため、この版の実ブラウザ操作/見た目の受入は未実施。unit/自動回帰も未実施。buildとNodeでのlocal操作を実機やbrowserの合格へ転用しない。

<!-- page -->
## 24 次の物理試作と設計開発依頼

P0の参照構成はCM5開発kitまたは対応Linux host、既存Pico2接点/LED carrier、近距離光学bench、実sensor候補。hostや別表示装置を使ったrigは製品Miniと区別し、外部Hub必須の製品へ黙って変えない。

光学benchの目的は、低い表示負荷から始め、像幅、像位置、観察位置ごとの可読性、不要光、輝度、まぶしさ、入力位置の差を測ること。plateは受動部品だが像源、遮光筐体、保持、公差、反射光路、電源、計測器が必要。具体的なLCD/センサー型番とnative driverは未選定で、発注済みとはしない。新しい光学出力を既存LED回路へ接続しない。

工場へのE0依頼は、全範囲要求とD76/H186mm仮外形を前提に、成立する光学構成または不足量を提出すること。rayの必要条件、実表示像、全観察者位置、目への直接光、熱/電力、RF・電池との干渉を同じ構成で示す。まぶしさを強い発光で解消したことにしない。

E0成果に必要なのは、採用候補の現行図面/STEPと公差、組立光路、像源/センサー/driver、beam/遮光、姿勢別可視領域、電力/温度trace、未達、代案の差分。これが通るまで量産回路、製品電池pack、光学のenable回路、正式製造データを確定しない。

開発source、再計算入力、幾何図、local draft操作の記録は工場の設計開発担当へ渡せる。完成機の試作・全範囲受入・量産を承認した一式ではない。部品購入、外部への送信/契約、端末書込、公開はこの開発だけで実施しない。


<!-- page -->
## 25 複数表示部を同じOSへつなぐ比較

本人の指示により、Mini単体に加えて分散表示構成を比較する。Miniが本人・job・操作focus・権限・保存を管理し、表示部は校正済みの場所へ像を出す。既存アカウントと料金体系を共有する。表示部の追加だけでTool実行権限や課金権限は増えない。これは比較案で、採用・購入・製造確定ではない。

3×3mの部屋を仮定し、0.5m刻みの49地点、目の高さ0.8/1.2/1.6m、水平4方向の588姿勢を計算した。四隅4台、辺の中央も含む8台、同じ8台に高さ1.8mの8台を追加した16台を比較。基本高さは1.2m。開口200mm角、像の奥行0.2m、視線の半角60度とする理想幾何である。

40mm角の像では、少なくとも一つの像を見られる必要条件を満たした姿勢は4台332/588、8台336/588、16台336/588。130×80mmの像では196/588、236/588、248/588だった。16台でも未達が残る。実際の遮蔽、輝度、眼、安全性は未評価で、これらの比率は製品の可視率ではない。

評価を二つに分ける。第一は範囲内の人がいずれかの表示へアクセスできること。第二は希望する任意の空間位置の像を必要な人が見られること。この計算は第一の弱い必要条件だけを扱い、第二や入力範囲の成立を示さない。次は開口・像寸法・高さ・向きを変え、未達姿勢を減らす配置を求めて実benchと照合する。

表示部の登録情報はnode ID、所有者、場所epoch、座標変換、校正版/期限、出力可能領域、観察者条件、健康状態、対応frame ID。未校正・期限切れ・切断した領域は利用不能にする。移動時は表示先を切替えても同じaction IDを維持し、操作を二重送信しない。実行はMini側で承認してappの結果を読戻す。表示frameの受領だけでTool成功にはしない。

node間の認証通信、時計同期、実frame出力、handoff、実sensor接続は未実装。今回の実装済み範囲は合成rayとlocal draft操作まで。分散構成もまぶしさを低減する測定と出力制限が必要で、輝度を上げて視域不足を補わない。


<!-- page -->
## 26 位置と向きを増やした配置探索

サービス範囲3×3mを固定し、設置範囲3×3mと4×4mを区別して比較する。開口は200/420/800/1200mm角という仮定。四方の壁に候補を置き、高さ0.6/1.2/1.8/2.4m、法線を空間中央の高さ1.2mへ向ける。像は各開口の前方0.2mに130×80mmを置く。開口寸法は採用可能な製品の仕様ではない。

粗い探索は0.5m刻み、目の高さ0.8/1.2/1.6m、水平8方向、上下の視線-30/0/30度の3,528姿勢。greedy set coverで追加の姿勢を最も多く満たす候補を選ぶ。次に0.25m刻み・水平16方向の24,336姿勢へ細分化し、残る未達だけを追加候補で補う。最少台数の証明ではない。

設置3×3m・開口420mmの48台案は粗い探索で888姿勢、細分化で5,100姿勢が未達。設置4×4m・開口800mmでは55台で粗い未達0だが、細分化で30姿勢が未達となる。10台追加しても8姿勢が残る。少数の観察点だけで見えない場所をゼロと宣言してはいけない。

設置4×4m・開口1200mmは38台で粗い未達0、細分化で35姿勢が未達。追加14台の計52台で細分化した24,336姿勢の必要条件を満たした。これは理想光線の有限点での結果にすぎず、実表示・連続範囲・全方向の保証ではない。大型開口52個の保持・干渉・光学源・電力・価格・設置を成立確認しておらず、Mini製品へ採用しない。

次の探索では姿勢の間を含む余裕量、部品同士の干渉、開口面積合計、設置厚み、観察者間遮蔽、表示内容の大きさを目的関数と制約へ入れる。本人に見せる範囲を勝手に縮めず、不成立ならその不足と設置条件の差を残す。まぶしさはこの幾何計算には含まれず、光源を強くして解決したことにしない。

再計算はfactory-development/optimize-display-layout.py。入力条件と全採用候補の座標/法線は生成JSONへ保存する。任意の位置に建築模型を置けることと、近くの表示部を一つ見られることの違いを維持する。

<!-- page -->
## 27 実カメラ入力と表示部をOSへ接続する処理

sensor-camera.mjsは端末の実カメラAPIを呼び、既存lib/smis-camera.tsとsmis-visual-input.tsへ画像を渡すadapterである。開始はhostの明示許可とbrowserのカメラ許可が必要。音声を要求せず、raw画像の保存やuploadも行わない。観測は端末内の登録済み見た目の照合用で、意味理解、深度、3D手trackingや本人認証にはならない。

停止、画面離脱、track終了で撮像を止める。開始待ち中の取消もgenerationで照合し、遅れて取得したstreamを止める。毎回の観測でも許可を再確認する。OS標準driverが使えるUVCカメラ等を、対応browserから利用する経路であり、Mini固有の深度センサーnative driverを完成させたという意味ではない。実センサー機材が手元になく、実撮像は未受入。

display-coordinator.mjsは同じowner/placeの表示部をhost側で登録し、座標変換、出力surface/UV領域、校正版と期限、測定したピーク輝度、本人の快適上限、同じハード/表示modeのまぶしさ評価を要求する。測定値がない表示部は利用できない。数値を仮置きしてまぶしくないと判定しない。

hostの同じmonotonic時計で200msのhealth leaseを管理し、停止接点、温度、出力測定状態を照合する。frameは200ms以内の期限、scene/place/surface、内容のhash、action/frame ID、輝度上限を承認へ結び付ける。同時の出力変更は一つに制限する。場所変更・期限超過・不一致・出力失敗でblackout要求を出し、再登録を必要にする。

adapterのsoftware-presentedはソフトウェア描画受付だけを表し、実際に見えたことやTool実行成功ではない。healthの定期監視はhostのtick呼出しが必要で、host停止時の遮断は独立回路が必要。実表示adapter、node間認証通信、時計同期、物理frame計測、Eve仕事との一周は未実装。このmodule単体を安全認証済みの出力装置として使わない。

実カメラのLabと表示部状態をbuildした。実browser表示・カメラ取得・実光学は未実施。Linux native経路はV4L2 captureとDRM/KMSの機種別driverで受入する。公式仕様は https://www.kernel.org/doc/html/latest/userspace-api/media/v4l/dev-capture.html と https://docs.kernel.org/gpu/drm-uapi.html 。

<!-- page -->
## 28 回路とPCBの今回の到達点

hardware/spatial-mainboard-plan.jsonでCORE、AON、SENSOR、DISPLAY_NODE、PACK_RFを分け、信号と未決定条件を機械可読にした。COREは既存RockstarOS runtimeとCM5候補、SENSORはUVC等の参照経路、AONは既存Pico2監視基板、各表示部は現地電源/独立停止を持つ。分散表示を理由に持出しMiniの通信・電池要求を削除しない。

COREの候補面積を確認するため、直径70mmの基板外形と55×40mmのCM5本体予約をKiCadのF.Fabへ生成した。mini-core-area-study.kicad_pcbは編集可能な面積検討図で、socket/connector/熱/配線を含まない。pad、net、routeがなく、そのまま製造できるPCBではない。仮外形内にmodule本体が入ることを製造可能性へ昇格させない。

既存の接点/LED監視基板は実回路図と配線済みPCBがあるが、光学出力を駆動しない。LED GPIOやLEDのSTOP戻り経路へ未選定の表示engineをつながない。IF06の光学遮断は、engineの電圧/連続電流/peak/突入/残光/再起動を確定してから独立停止回路へ設計する。ソフト輝度値だけを光学の電源遮断へ読み替えない。

最終PCBへ進む条件は、像源/センサー/connectorの型番と正式図面、完全なnetlist、rail/peak/温度、pack保護、stackup/impedance、保持と光路、RF keepout。これを受けて回路図→配線→ERC/DRC/整合→DFM/DFA→実板測定を同じ版で残す。未選定pinや電源値を創作して完成Gerberを発行しない。

今回buildと構文確認を実施。実板、光学、安全/EMC/RF測定、連続全範囲の受入は未完。料金と既存account/usage契約は変更なし。source/計算/ECAD面積図を設計開発用handoffへ含め、量産releaseとは明確に区別する。


<!-- page -->
## 29 少数表示部で成立させる方式の再比較

52個は、前の仮定とgreedy配置が細分化した有限姿勢を満たした一例であり、必要最小数ではない。今回は固定開口を増やす案から、少数の大面積AIRR、観察者追従、空中接眼光学を比較する。表示部数だけを減らし、巨大な受動光学面や多数の発光moduleを隠す比較にはしない。

実証研究では3基のsee-through AIRRが利用者を囲む。装置全体は4m四方、各装置は高さ2050mm・幅2000mm・奥行1000mm。光源はLED配列二つとLCD一つで、各LED配列は20枚のmoduleからなる。3基は光学ユニットの数で、発光module総数が3個という意味ではない。携帯Miniへの収納や本製品の全範囲・快適性を示す証拠ではない。出典: https://doi.org/10.20965/jrm.2022.p1175 。

観察者追従は、光学assembly全体を動かして有効開口を目へ向ける仮説として計算した。サービス3×3m、設置4×4m、像130×80mm、像まで0.2m、両眼間64mm、位置と遅延の仮誤差40mm、restから80度までの操舵を置く。操舵自体の実現、散乱、効率、機構、停止は未証明である。

24,336姿勢の比較で、4基・開口300mm角は1,348姿勢、8基は508姿勢、16基は264姿勢が未達。開口420mm角へ広げてもそれぞれ1,348、496、260姿勢が残る。光路を向けるだけでは、見たい向きへ表示部が存在しない問題も解けない。

追従案では像が表示部の前方で動く。建築模型を部屋の任意位置へ固定する方式とは異なり、一つの操舵出力を複数人へ同時に最適化した結果でもない。空中接眼光学AMEも研究例はあるが、局所的な眼位置への光学機能であり、歩ける部屋全体の保証として採用しない。出典: https://arxiv.org/abs/1710.03889 。

現時点の判定は、少数表示部の最終方式未選定。次は発光源・受動光学の面積、厚み、場所、観察者、像の固定領域、遮蔽、輝度を同じ予算で比較する。裸眼・範囲全体・まぶしくしない要求を下げて成立扱いにしない。

<!-- page -->
## 30 出力が実際にどう見えるか

目標とする通知は、背景が発光する白い板ではなく、空間に文字と操作対象を置く体験である。ただし実際の透明感、黒の見え方、反射、像の輪郭、可読性は像源と光学系で決まり、CGだけでは保証できない。センサーは場所・手・観察者を測り、映像の光は別の像源と光学系が作る。

近距離の空中カードでは、対応する像源の画素を光学系で所定の像面へ結像させる。OSはその像面と操作面を同じplace座標へ校正する。カードの浮く距離、幅、高さ、見られる角度は光学の能力値である。前の130×80mm・0.2mは計算条件に限り、Miniの確定性能ではない。

着信時は通信adapterの真の着信eventから、期限付きの匿名通知を作る。本人確認後に相手と応答対象を表示し、許可した空間操作を通じて電話adapterへ応答要求を送る。通話成功はProviderと音声の実結果で決める。現在、空中の着信・実センサーのtap・実通話の一周は未実装である。

建築ではCAD/BIM原本を保持し、表示用meshへ変換する。通常の2D像源で描いた透視図を空中に出すだけなら、奥行きが描かれた平面画像になる。顔に合わせて視点を変える単眼の見え方と、両眼へ正しい光線を渡す立体再現、空間の任意の場所に実像を作ることを区別する。平面画像を裸眼立体完成と呼ばない。

範囲全体で模型が固定して見えるには、world anchor、観察者ごとの適切な光線、像の再構成領域、各光路の遮蔽と引継ぎが必要。OS上に座標を登録しただけではその場所へ光は届かない。現在、その光学出力能力は未成立である。

歩いた時は同じobject IDとanchorを保持し、担当表示部が変わっても仕事や操作IDを作り直さない設計とする。見えると確認できる出力領域がなければ、状態を利用不能として伝える。欠けた像を見えている扱いにせず、未承認の別方式へ切り替えない。

<!-- page -->
## 31 OSから画素と光へ至る経路

入力は、既存Eve/smisの同じ本人の仕事、成果artifact、sceneRevisionとplaceEpoch。modelが作る候補と本人承認、表示frame、Toolの実結果はそれぞれ別の状態として管理する。出力用の新しいaccountや料金台帳は作らない。

最初にsceneから表示対象を決め、対応光学modeの像面・観察者・校正版へ割り当てる。次にGPUまたは対応rendererが元画像を作り、採用光学の実測に基づく反転、warp、色と輝度の補正を適用する。補正済みframeを像源の実interfaceへ渡す。AIRRでは像源→beam splitter→retroreflector→beam splitter→実像という光路を使う。これをセンサーの信号だけで代用しない。

複数表示部を持つ案では、Miniが本人/job/focus/権限を管理し、各表示部が同じsceneの対応領域を描画する設計を比較する。1,920×1,080、RGBA4byte、60fpsの未圧縮転送は一台約3.98Gbps、三台約11.94Gbps。通信overheadは含まない。1Gbps linkへ無圧縮の三台分をそのまま送れる前提を置かない。

対応ノードでscene命令と許可したassetを描画するか、映像を圧縮して送るかを実負荷で選ぶ。前者は共通asset版とrenderer一致、後者はencode/decode時間・画質・回線・復旧を受け入れる。単に同じOSへログインしただけで複数画面が同期するとは扱わない。実通信とnode rendererは未実装である。

frame承認は内容hash、node/surface、scene/place、期限、輝度上限、action IDへ結び付ける。source表示受付、scanout、実光学のframe計測、利用者位置からの可視性、app作用の成功を分けて記録する。ネットワークのACKを空中像の表示成功へ昇格させない。

今回source-preview.mjsでlocal draftの元画像を描画し、Labの操作と同期させた。建築形状は2D線画の例で、実CAD処理や立体光学ではない。元画像のプレビューと実際の空中像の違いを画面にも明記した。

<!-- page -->
## 32 実センサー接続を進めた範囲

Linuxのstereo_marker_observer.pyは、実V4L2カメラ二台とOpenCV4.13系を使うcapture source。exactなby-id device、resolution、個々の内部校正と歪み、二台間のR/Tを要求する。開始には明示的なlocal capture指定が必要。calibration templateのnullは未測定で、生成済みの正しい校正値ではない。

実画像からArUco markerの四隅を検出し、同じIDの対応点を歪み補正して三角測量し、奥行き、再投影差、距離をふるい分ける。これは受動markerを付けた対象の観測試作で、裸の手の骨格認識・本人確認ではない。raw画像をCloudへ送信せず、画像ファイルも保存しない。

二台のread/grabが近い時刻で完了しても、同時に露光した証拠にはならない。そのためexposure時刻と位置誤差上限はunknown、spatialActionEligibleはfalseのまま。再投影差が小さくても、実空間の精度合格にはしない。active IR/laserの照明を追加せず、暗い時の動作は未保証とする。

stereo-observer-host.mjsがprivateな子processを起動し、固定sourceからのbounded JSON streamを読む。stereo-observation.mjsで校正hash、boot、連番、place、受信時刻を照合し、left camera座標をplaceへ変換する。露光時刻を受信時刻へ偽装せず、観測からgrantやTool操作を発行しない。時間は同じLinux hostのmonotonic値を使う。

実装はsourceと構文確認まで。手元にカメラがなく、Linux/V4L2/OpenCV依存関係での実撮像・同期・三角測量・OS操作一周は未実施。今回のソフト追加を実センサーの合格へ換算しない。browser camera adapterと同様、既存の本人/仕事/料金を維持する。

公式仕様: https://docs.opencv.org/4.13.0/d5/dae/tutorial_aruco_detection.html と https://docs.opencv.org/4.13.0/d9/d0c/group__calib3d.html 。合格には同じ実機の校正、露光同期、独立した位置誤差測定、遮蔽、移設、停止、期限失効の記録を必要とする。

<!-- page -->
## 33 最終回路・配線済みPCBに必要な確定事項

今回の新規成果は実センサーdriver/OS reader、元画像renderer、光路と基板間の信号設計である。新しい量産用回路図や配線済みMini mainboardはまだ作れていない。既存のPico2接点/LED carrierの実PCBと、今回の機能追加を合体した製品PCBの完成を混同しない。

現在の参照接続は、二台の対応カメラ→host USB→V4L2→観測reader、既存Pico2→USB CDC→監視driver。表示側はhostで元画像を作り、実engineを選定した後に、対応timing/controller/interfaceへ渡す。試験段階の直接USB接続を、そのまま最終MiniのUSB topologyや給電回路へ採用したとはしない。

CORE、AON、SENSOR、DISPLAY_NODE、PACK_RFの基板分割を維持する。電池保護/充電はOS停止中も動作し、光学電源と可動系は主SoCと独立した停止経路を持つ。LED用GPIOや低電流の戻り線を、表示engineの遮断回路へ流用しない。

量産回路を閉じられない直接の原因は、少数表示部の光学構成が未受入で、像源の型番・interface・電圧・連続/peak/突入電流・残光・遮断特性が未確定なこと。実sensorの型番、同期pin/clock、connector、protected pack、RF/熱/保持も不足している。ここを仮値で埋めて最終回路と呼ばない。

部品確定後はper-pinの電圧/方向/boot状態、netlist、電源sequence、独立interlock、stackup/制御impedance、routing/return path、optical/RF keepoutを設計する。同一版のERC/DRC/回路図整合・DFM/DFA・組立/光学/熱/RFの証拠へ進める。面積検討のKiCadファイルにはpadも配線もなく、製造データにはならない。

少数表示部の研究を継続するための回路入力とsourceはhandoffに含める。工場はこの版から設計開発を始められるが、そのまま完成Miniを製造できる状態ではない。購入・製造発注・送信・公開は実施していない。

<!-- page -->
## 34 まぶしさ・料金・残る受入条件

まぶしくしない条件を維持し、視域不足を強い像源で補う方式は採用しない。光学原理の参考実験に高輝度源があっても、その明るさを本製品へ転用しない。sourceの暗い配色やRGB上限は、目に届く実測輝度やまぶしさの保証ではない。

採用する表示modeごとに、直接見える像源、不要反射、視線移動、立つ/座る、眼鏡、実環境光、複数人を同じ光路で測る。快適上限と可読性の両方を満たさなければ利用可能にしない。active照明のない観測試作を、赤外線による眼安全の合格へ読み替えない。

料金は既存の同一account契約と使用量経路を保持する。表示部追加だけで基本料を複製しない。cloud Agent/LLMの実行は既存見積/上限/使用量の管理を通し、ローカルの描画previewから課金を開始しない。ハードウェア価格と設置費を新たに確定したという意味でもない。

次の物理開発は、一つの光学cellのsource→光路→像→観察者領域→実sensor操作を同じ版で成立させること。その値から少数cell配置の連続範囲と像の固定可能領域を再計算する。範囲を勝手に縮めず、未達があれば製品案の未達として残す。

今回の記録は、追従開口の有限姿勢計算、Linux stereo observer/reader/host source、local source previewのbuild、型/構文確認、本文とPDFの更新。unit/full suite、実カメラ、実光学、node通信、実板、最終PCB、製造受入は未完了である。

この段階で確定できるのは、何を計測し、どの条件でOSが描画/操作を許可し、どの光路でどこに像を作る必要があるかという開発契約である。少数表示部で範囲全体が見える完成方式を発明・実証済みとは宣言しない。


<!-- page -->
## 35 型番を決めたE0光学cell

光学plateはASKA3D-200NT、像源はWaveshare 5.5inch HDMI AMOLED（SKU16103）、近距離深度はRealSense D405、計算hostは既存のCM5/CM5IO参照構成を選ぶ。これはE0の設計開発用選定で、少数表示部による部屋全体の最終方式の採用ではない。台帳はfactory-development/selected-cell.json。

200NTは公表外形200×200×6.3mmの受動plateで、像源/PC/sensorを含まない。現行の仮内径72mmへ収まらず、既存図面との厚み差も継続照合が必要。切断や折畳を前提にしない。出典: https://aska3d.com/ja/aska3d-200nt.html 。

SKU16103はHDMI入力、native1080×1920のAMOLED module。外部5V/2A給電が案内されている。図面のglass外形140.40×74.76mm、CG VA121.76×68.70mmを面積検討に使う。CG VAは窓寸法で、正確な発光面や物理pixel pitchを校正した値ではない。出典: https://docs.waveshare.net/5.5inch_HDMI_AMOLED/ と https://files.waveshare.com/wiki/5.5inch%20HDMI%20AMOLED/5_5inch-hdmi-amoled.pdf 。

同moduleの明るさはbuttonの段階変更が案内され、OSからcd/m2を指定するAPIは確認できていない。旧FAQのLUX表記を像の輝度cd/m2へ変換しない。実物の版、設定保持、起動時の像、不要光を測り、hardwareとOSの上限へ結ぶまでは光学表示を利用可能にしない。

D405はUSB接続、42×42×23mm、公表範囲7〜50cmで、基準depth modeは1280×720/30fpsとする。近距離の操作領域を測る用途に限り、部屋全体の一台測量sensorにはしない。公表1.55Wもシステム全体や最大peakではない。出典: https://www.intel.com/content/www/us/en/products/sku/229218/intel-realsense-depth-camera-d405/specifications.html 。

全範囲要求を維持したまま、E0ではまず一つの像面の出力と観測を測る。選定した部品が現行Mini筐体へ一式収納できる、発注済み、量産採用品という意味ではない。

<!-- page -->
## 36 選定部品での光路と少数化の判定

E0の仮光路は、45度のplateに対し、像源面と像面を面対称に置く。目標像は120×67.5mm、plate中心から観察者側へ100mmの仮配置である。実像面の位置と鮮明さ、plateの角度依存性、遮光、保持は未測定。元画像はHDMIへ渡し、反転/回転は実測した校正に従う。

selected-cell-model.pyは、像の四隅と左右の目から延長した直線が、仮のplate開口へ届くかを3Dで計算する。部屋3×3m・設置4×4m・目の高さ3段・向き/視線を含む24,336姿勢では、1基22,256、2基20,176、4基16,568姿勢が必要条件を満たさなかった。plate全体を有効開口とした楽観条件でも未達であり、この部品を並べて全範囲成立とはしない。

立体の次候補にはLooking Glass Goを具体名で置く。公表仕様は1440×2560、視域58度、外形幅80.4mm、同梱電源5V/3A。これはそのdisplay自体の仕様で、空中中継後の視域ではない。CM5との実行環境・接続適合と光路は未受入で、E0のAMOLEDと差し替えるだけでは成立しない。出典: https://checkout.lookingglassfactory.com/products/looking-glass-go 。

方式候補はlight-field像源→拡大lens→beam splitter→Fresnel lens/retroreflector→空中の立体像。2026年のLeAIRR研究はこの方向のsize/depth拡張を報告するが、部屋全域の可視性や今回の低眩しさを示してはいない。研究は特定の5.5inch/4K light-field sourceを使い、Looking Glass Goの適合を実証したものではない。出典: https://doi.org/10.1002/jsid.70050 。

したがって、E0の型番は選定、E1の立体像源は具体候補、全範囲の最終光学は未選定という状態を維持する。拡大lens/Fresnel/beam splitter/retroreflectorの型番と全aperture、必要距離、効率、視域が揃わない段階で製品へ確定しない。

<!-- page -->
## 37 D405をRockstarOSへ接続する実装

linux/d405_depth_observer.pyとspatial/d405-observer-host.mjs、depth-observation.mjsを追加した。API基準はRealSense SDK2.56.5。実際に受領したD405のserial、host側の校正/place、期限をowner管理のprofileへ記録し、そのdeviceだけを開く。templateのnullを実deviceや校正済み値として扱わない。SDK参照: https://github.com/realsenseai/librealsense/releases/tag/v2.56.5 。

明示的な撮像指定後、device名とserialを照合し、depthを1280×720/30fpsで取得する。対応するemitter/laser設定が存在する場合はstream開始前後にOFFへ設定して読み返す。D405は内蔵projectorのない近距離stereoであり、新しい外部pattern projectorや照明を追加しない。暗所や無地の対象を無条件で測れるとはしない。

profileで指定した最大16pixelのdepthを読み、device intrinsicsで3D点へ変換する。7〜50cmの検討範囲以外やdepth欠損は点を出さない。これは指定pixelの深度観測で、手の検出、指先特定、tap認識、本人照合を実装したという意味ではない。

SDKのframe番号・timestamp domain・intrinsics hashと、hostの受信時刻を分けて記録する。子processからの観測をOS readerがprofile/serial hash、校正、場所、boot、連番、受信期限へ照合し、camera座標をplaceへ変換する。SDK時計をhost時計と同一視せず、位置誤差上限も未測定なのでspatialActionEligible=falseを維持する。

raw画像は保存/uploadせず、観測点だけを明示的な呼出し元へ返す。起動は自動service化しない。現在はsource・構文確認までで、SDK導入、D405実接続、実depth、Eveと空間操作の一周は未実施。これらを量産/実機の合格へ換算しない。

次に必要なのは、同じD405/firmware/OS/配置によるintrinsicsと外部校正、時刻対応、実位置誤差、手/対象処理、光学像面との差の受入。対応する観測が合格してから既存Brokerとjobの入力へ接続する。

<!-- page -->
## 38 像源5V電源の回路図と配線source

hardware/cell-powerにTPS22965DSGRを使う5V評価回路と、28×23mm・2層のKiCad基板sourceを追加した。pad、net、銅箔配線、ground zoneを含み、以前の面積予約図とは異なる。回路/配線のsourceを作った状態で、ERC/DRC/DFM・実板は未受入。Mini全体のmainboardではない。

U1はVIN1/2とVBIAS4を5Vへ、VOUT7/8を負荷へ、GND5/EP9をgroundへ、ON3を制御へ、CT6を1nFの候補へ接続する。入力10uF、出力1uF、ONのseries1kとpull-down10kを置く。部品値は評価用候補で、OLED内蔵容量、DC bias、peakを含めた採用値ではない。

3.3Vの制御が外部NC停止接点を通ってJ3へ入り、1k/10kの単純計算でONは約3.0Vとなる。停止/断線時はpull-downでOFFへ向かう。外部の電流制限付き5V電源を要求し、OS停止時やMOSFET故障を含む独立した製品用停止回路の完成とはしない。

2A検討条件、datasheetの5V biasでのRon上限25mΩから、switch損失0.10W、電圧降下0.05V。記載θJA72.3℃/Wをそのまま掛けた7.23℃は参考値で、今回の銅箔/ケースでの温度予測や2A連続定格には使わない。突入はI=C×dV/dtで、像源の実容量と立上り測定が必要。出典: https://www.ti.com/lit/ds/symlink/tps22965.pdf 。

同ICにcurrent limitやreverse isolationの機能を仮定しない。HDMIやtouch USBからの回り込み給電、残光、再起動時の発光、watchdog、物理停止、熱が未確認のため、検査前はdummy load用である。5Vだけ切れば確実に像が消えるという受入はしていない。

BOMはIC型番とpassive値/footprintを記録するが、exact passive・keyed connector・相手cableは未確定。Gerberや製造releaseは発行していない。このsourceを最終Miniの配線済み基板として渡さない。

<!-- page -->
## 39 今回の選定と残る製品設計

今回確定したのは、E0の光学plate/像源/近距離sensorの型番、各interfaceの接続方針、D405固有の取得source、5V評価回路と配線source。まぶしさと既存料金は維持し、部品選定を購入・請求開始・公開へ置き換えない。

E0はCM5参照hostのHDMI→SKU16103、USB→D405、USB CDC→既存Pico2監視の経路を使う。HDMI/touchとsensorの高速配線は既製host/adapterへ残し、5V couponへ無断で高速線を通さない。USB powerや全system供給能力は接続した実構成で別途確認する。

Mini本体に加えて固定表示部を使う案でも、本人/権限/job/保存/停止は既存RockstarOSへまとめる。nodeを追加しただけで基本料を複製しない。Cloudの使用量は既存の見積/上限/明細を通す。ハードウェア価格、設置費、運用費が確定したという意味ではない。

少数の表示部で範囲全体が見えることはまだ成立していない。E0のplateを4枚にしても未達が多いため、そのまま最終部品へ採用しない。E1は立体光線を中継する光学系を実測し、光学面積、体積、視域、像の固定可能領域、効率/まぶしさを同時に比較する。

最終回路/PCBを閉じるには、受入済みの光学engineと電源遮断、sensor処理/校正、protected pack、RFとantenna、音声、生体、BSP、放熱と全機構が必要。今回の部分回路の完成を、それらを含むMini完成へ昇格させない。

次の物理作業の条件と未達をhandoffへ残した。手元に部品がなく、発注もしていないため、光学/輝度、D405、実板の受入は未実施。sourceと計算のbuild/構文確認、文書整合の結果と区別する。本人指定の新しい共通ロゴを文書へ反映する。

<!-- page -->
## 40 E1の部品選択と折返し光路

像源は本人指定のLooking Glass Go。拡大lensの第一候補をOptoSigma FRLN-300S-300P（f300mm）、補正lensをFRLN-300S-150P（f150mm）とする。両方ともcatalogではpitch0.5mm、PMMA、厚さ2mm。300mm角と有効円径270mmを計算仮定に使う。現行図面、有限共役の像質、溝面の向き、在庫は未受入。集光用B系列を無断で同等品へ替えない。出典: https://static.optosigma.com/en/page_pdf/FRLN.pdf 。

source→150mm→拡大lens→150mm→45度BS。BSで90度曲げて150mm先に補正lens、その200mm先に再帰反射材RF-ACを置く。反射光は補正lensへ戻りBSを透過し、反対側の空中に像を結ぶ。Goのfront外装ではなく実際の光学面を距離基準にする。

BSはMINI-E1-BS-01という未送付の特注要求。物理400×300mm、有効360×270mmを仮定し、400mm方向を折返し面へ置く。45度で有効投影は約255×270mm。可視50R/50T、実際のGoの偏光、角度/波長範囲、裏面AR、ghost/平面度/厚さを供給者と決める。既製品の型番は未選定。50mm角のBSでは代用できない。

RF-ACは日本カーバイドの指定材を300×300mm切出しで検討する。切出し品番、厚さ、貼付支持体、平面度は未確定。反射性能のcatalog値を今回の空中像効率へ転用しない。出典: https://www.carbide.co.jp/cms/wp-content/uploads/2019/04/RF-A.pdf 。

local光学座標をmmで固定する。拡大lens=(0,0,0)、source=(0,0,-150)、BS=(0,0,150)、補正lens=(0,150,150)、RR=(0,350,150)、空中像中心=(0,-450,150)。xは右、yはRR方向、zはsourceの前方。place座標との変換は実測して登録する。

光学外形だけでも幅約300mm・高さ約300mm・奥行約490mmに達する。支持枠・光源・遮光・配線の余裕は別に必要。携帯筐体へ収納できる設計ではなく、固定nodeの候補。隣接面の余裕が小さいため、機構干渉確認前に寸法公差を製造指示へ使わない。

<!-- page -->
## 41 像の大きさと見える範囲の計算

薄lens式1/f=1/a+1/bへf=300mm、a=150mmを入れると虚像b=-300mm、横倍率2。光路を展開すると虚像→補正lensは600mm。f150mmの補正lensが200mm先のRRへ結像する共役条件を満たす。BSの反対側450mmに空中像の基準面が来る。

Goの6inch、9:16を発光面の仮定にすると約74.7×132.8mm、空中像は約149.4×265.7mm。発光有効寸法の実測ではない。横が2倍のとき基準面近傍の奥行倍率は約4倍となるため、模型を単純に2倍拡大したquiltで正しい形状にはできない。

今回の計算はe1-leairr-model.py。source点からの傾きを薄lensで伝搬し、拡大lens、BS投影楕円、補正lens、RRで遮られるか計算する。Goの58度を水平の入射範囲とし、開口なし中心光線の出射幅でも約31度へ縮まる。拡大しても元の58度を維持する前提を置かない。

中心/四隅/左右端の7点、入力垂直傾き0という限定断面では、各水平角区間の共通部分は約±5.73度。これは同じ瞳へ像全体が届く証明でも、実際の視域幅でもない。垂直視域、有限距離の両眼、RRの反射分布、色収差、溝散乱、ghostを含まない一次診断である。

部屋全体を数台で覆う配置は、この結果からは決定できない。1nodeは固定の像領域を持ち、OSで絵を移しても実像領域が部屋中へ移動するわけではない。4方向nodeも、背面や家具の遮蔽、上下方向、同じ場所の立体像共有を解決した製品案としては未採用。

研究の寸法と共役条件を参考にしたが、研究の像源はGoではない。今回選んだlens/BS/RRでのGo中継を実証していない。出典: https://doi.org/10.1002/jsid.70050 。source位置1mmの変化は基準面近傍で約4mmの像位置変化に相当する。BS回転1度の影響は単純な反射近似で約15.7mmとなり、現物合わせの公差設計が必要。

<!-- page -->
## 42 RockstarOSから光学出力まで

Eve/アプリのscene→place座標→nodeの光学座標→奥行補正→多視点render→quilt→Looking Glass Bridge→Go→lens/BS/RR→空中像、という順にする。Goは全視点を同時に同一解像度で出す一般monitorではない。1440×2560を空中像の1視点解像度として保証しない。

今回追加したleairr-prewarp.mjsは、光学座標のscene点を薄lensの逆写像へ変換する計画関数。目標虚像距離Bに対しa=fB/(f+B)、横倍率m=1+B/f、source側xy=目標xy/mを返す。試算範囲は基準面の前後20mmまで。実際のGoの深度再現範囲や画角の受入を意味しない。quilt画像全体のresizeでは実現できない。

Bridgeの公式Python SDKはOpenGL texture/quilt経路を示す。LinuxはX11が必要でWaylandは未対応と記載され、manylinux arm64も案内されている。ただしCM5の特定OS/GPU/Bridge版/Go配線で動作した証拠はない。まず対応hostでGoのserialと校正・表示modeを照合し、受入後にMiniの実行先へ登録する。出典: https://github.com/Looking-Glass/Bridge-Python-SDK 。

現在のdisplay-coordinatorは本人・place epoch・校正期限・輝度上限・frame leaseを検査するlocal source。新しい深度計画関数はBridge driverとして未接続であり、quilt renderer、実測warp、scanout確認も未実装。software-presentedを裸眼で見えたというreceiptへ替えない。

入力は既存D405取得source→depth-observation→cameraToPlace→interaction→既存Broker/workflowへ接続する。D405の近距離7〜50cmはroom sensorとして不足する。像がBSから45cm先の場合も、sensor設置位置と手の奥行で容易に範囲外となる。全範囲のhand追跡には複数の校正済みsensorまたは別の広域sensor選定が必要。

marker/sourceを空間tapの実証にしない。取得時刻同期・位置誤差・手/指判定・本人権限が揃わなければactionEligible=falseを維持する。料金、本人別job/保存、Cloudの上限・使用明細は既存契約を継続する。node増設で月額を複製しない。

<!-- page -->
## 43 電源・遮光・PCBの確定条件

Goにはメーカー指定の5V/3A電源を使う検討とし、15Wを電源容量枠に計上する。実消費電力ではない。前段の2A評価couponへ無検証で3AのGoをつながない。CM5のHDMIをUSB-Cへ線だけでつないでも映像接続にはならず、正確なport/変換器/給電経路を機種資料と実機で確定する。

E1の配線はhost→Goの公式映像接続、Go専用電源、host USB→D405、host USB CDC→Pico2監視の独立枝とする。Goの高速信号はメーカー経路に残す。既存cell-powerのJ1/J2は電流制限電源とdummy load、J3は外部停止後のARMであり、Goの完成driverではない。

まぶしさ対策はsourceの直接見えを黒色筐体/遮光板で抑え、不要なBS透過枝を光trapへ終端、観察側に迷光が漏れない構成とする。遮光板が必要な光線を遮らないかも計算/実測する。50/50 BSを1反射1透過する理想効率の積は0.25で、lens/RR損失も加わる。暗さを理由に無条件でsource輝度を上げない。

許容輝度を未測定の数値で設定しない。同じ表示mode/観察位置/周囲光で実測した輝度・ghost・直接視認の結果と本人のcomfort上限をnodeへ結びつける。未測定modeは出力不可。software blackoutだけで電源断/光学停止を保証せず、watchdog、電源の再投入、Goの内蔵表示継続、USB逆給電、停止素子故障を含め独立停止を確定する。

最終mainboardのpin/netは、Go映像/電源停止・広域sensor・BSP・protected pack・RF・音声/生体・放熱を確定してから閉じる。現在ある配線済みsourceは5V部分評価couponのみ。今回、Mini最終回路/最終配線PCB、ERC/DRC/DFM、Gerber、実板合格は追加していない。未確定pinへ架空のnetを引いて製造可能と記録しない。

次の設計停止点はBS現行図面/偏光、lens有限共役の像質と有効口径、Goの実光線校正/対応host/停止経路。単一nodeを実測してから有限距離の両眼と遮蔽を含む連続配置へ進む。全部品を発注したり他者へ送信したりしておらず、handoffは製造承認前のengineering資料である。

<!-- page -->
## 44 両眼の逆追跡と視域拡張の比較

e1-binocular-layout.pyで、眼→空中像→BSの交点を求め、反射変換でsource側へ戻す。拡大lensでの屈折前後、Goの光線角/有効面、BSの斜め開口、補正lens、RRを調べる。眼間64mm、各瞳半径2mmの5点を用いる。前回の水平傾き共通部分をeyeboxとしない。

サービス範囲は3×3mのまま、13×13位置×眼高1.2/1.6/1.9mの507位置。中央高さ1.5mの同じ20mm立方体の9点を全nodeで共有する。小さな像でも必要な光線が欠けるかの診断であり、建築物や部屋全体のsceneを20mmへ縮小して要求達成と扱わない。視線は対象方向で、背後の物を眼前に表示した成功とはしない。

同じ像の周囲へ8基配置した場合、倍率2/有効径270mmは435位置が未達。倍率1.2/270mmは283、倍率1.2/450mmは103位置が未達。900mmまで仮に広げても87位置が未達。開口450/900mmは比較用の仮光学部で、選定済み部品ではない。

方位16方向×傾斜-30/0/+30度の48候補から最大8基をgreedy選択しても、倍率2/270mmで431位置が未達、倍率1.2/450mmで103位置が未達。これは候補内の探索で、最適数の証明ではない。低倍率案は像も小さくなるため、拡大像の要件を保った解として採用しない。

Goの垂直視域、RR角度分布、収差/回折、遮蔽物、node同士の機構干渉を未評価。図の緑は仮定した薄lensモデルの幾何条件だけ。特に大開口/大角度では近軸近似の誤差が増え、実lensの厳密な必要条件や不可能性の証明へ使えない。有限位置/瞳点の通過も連続範囲や実機の可視性を保証しない。今回の候補に、少数全範囲を満たす採用解はない。

<!-- page -->
## 45 少数全範囲へ向けた設計判断

今回の拡大型Go/固定AIRRの候補群は、部屋全体の完成方式として採用しない。広いsensor範囲やquiltの書換えだけでは、必要な方向へ届かない光線を作れない。Goの58度は中継後の部屋全体の視域ではなく、像の拡大/開口clipと両眼の位置でさらに制約される。

受動的な瞳複製は追加の開口/光路/損失を要する。複製した光線が同じ世界の正しい視点を表すかを確認する必要がある。分岐数だけで可視性を増やし、像質/視差/光量の制約を無視した少数表示とは数えない。像源数と全光学出口数を両方数える。

能動的な視域追従は次の研究候補。眼位置を測り、光学的に瞳へ必要な光線を向ける方式で、固定像を保つには光学機構とsceneの補償を同時設計する。単にquiltを更新する方式とは区別する。追従1人、複数人同時、同じ世界像の共有を別の合格対象とする。

2026年のPBP回折格子を使うAIRRの研究は水平方向約8mmのeyebox移動を報告する。Go、m単位の移動、全方位、低glare、連続追従を実証した資料ではない。今回の部屋全域の完成光学部へ転用しない。出典: https://doi.org/10.1364/OE.586384 。

必要な次の光学仕様は、固定世界像を保つ操舵範囲、両瞳に届く角度/面積、眼位置誤差と遅延、停止時に光が向く場所、機構の可動範囲、色/偏光/ghost、同時人数。実装できる部品と実測の受入が揃わない限り、操舵driverや最終mainboardの接続先を確定したとは記録しない。

まぶしさの条件は緩めない。開口損失を高輝度で埋めず、本人の上限と実測modeの範囲内で動かす。像が見えない場所をsensorだけで操作可能としない。対応する入出力が揃わない場合は能力未受入として出力を止める。価格/本人/job/保存は既存共通契約を維持する。

<!-- page -->
## 46 GoとD405を同じOSへ接続するsource

go-bridge-observer.pyを追加。事前導入済みの公式Bridge Python SDKでexact serialのGoを列挙し、1440×2560、pitch/center/tilt/aspect/viewcone/invviewを読む。native libraryとSDK版をprofileへ固定する。calibrationの一部であり、完全なsubpixel校正、光学warp、scanout、空中像の受入ではない。

このobserverはGL windowもquilt描画も作らない。SDK constructorがtelemetry設定を変更するため、その許可flagを別途必須とし、disableTracking=Trueを明示する。自動download/インストールは行わない。Linux X11を対象とし、CM5/任意OSへの適合は未受入。API出典: https://github.com/Looking-Glass/Bridge-Python-SDK 。

go-d405-preview-host.mjsはGoの最初の有効receipt後に既存D405子processを起動する。両方を同じ校正ID/place epochへ拘束し、owner管理profileとD405のcameraToPlaceを使う。Goの列挙/校正状態は受信500ms以内、D405の受信は100ms以内。露光時刻同期と位置精度の証明ではない。

go-depth-session.mjsが入力を照合し、D405のplace座標点とGoの校正subset hashを同じpreviewへまとめる。再起動/sequence逆行/期限切れ/校正変更/切断で失効する。全体12秒、D405最大100frame、Go最大40receipt、process/pipe量も制限。失敗時は両子processを停止する。

出力はnot-submitted、spatialActionEligible=false、physicalAccepted=false。手の追跡、空間tap、EveへのTool実行権、課金は付与しない。元のBroker/workflow/料金は保持する。新コードは構文/型/配布確認までで、SDK/Go/D405実行と実画面表示は未実施。

最終回路/配線PCBは依然未完成。Goの映像/給電/独立停止と広域sensor/操舵部が未確定なので、今回追加した接続sourceを完成基板へ転用しない。5V couponはdummy load評価用の配線sourceのまま。製造用netlist/Gerberとして工場へ提出する状態ではない。詳細な再開手順はspatial/GO-D405.mdへ保存する。

<!-- page -->
## 47 参考2動画から反映した体験と条件

本人指定の2動画をInstagramのbrowser再生で確認。Da21x7iCtxJは透明な水槽状の囲いの中で光の形が動き、周囲が透けたまま像が存在する見え方。DLrVDOJtpW3のARRAYは、机上での手の動き、preview、大型の複数枠面で変わる光を確認した。作者は両方にTouchDesignerを記載している。

水槽作品の作者返信も確認したが、光学部品/媒体/光路の詳細は未確認。ARRAYもsensor型番や光学仕様を動画から確定しない。AIRR、Go、全方向裸眼立体、操作精度、低眩しさが実証された動画として扱わない。再生確認と光学性能の受入は別である。

参考元: https://www.instagram.com/reel/Da21x7iCtxJ/ と https://www.instagram.com/reel/DLrVDOJtpW3/ 。採用するのは、周囲の透けた像、枠を意識させない存在感、手と連続的に反応するscene。像源、光学出口、受動表示面、sensorの数を別々に記録する。

本人は追加確認に「表示したい場所に板や膜を置かない条件を維持」と回答した。したがって透明なlayer/網/膜を像の位置へ置くARRAY型の表示面を解決案にしない。水槽作品を理由に水槽や散乱媒体の導入が承認されたとも扱わない。光学部の内部素子と、像が見える位置に置く表示面を区別する。

要求は、裸眼、少数の表示部、3×3mの既存比較領域、空間の固定scene、手の操作、低眩しさ、持出しの継続を維持。比較領域や同時利用人数を縮小して完成にしない。必要なら本人の明示指示で理由付き変更する。Smithが最新の正式製品表記で、既存sky/smisのscope/schema/pathは互換維持。

reference-reels.jsonを今回の観測と未確認事項の入口にする。既存の料金、Eve/Smith/共通runtimeの本人・権限・job・保存を保持する。動画の見栄えを根拠に新しい課金や専用契約を作らない。

<!-- page -->
## 48 上下を含む6面配置と残る光学条件

4側面では、眼の真下/真上の対象へ必要な光線が届かない位置が残る。これを上下込みの6面へ拡張した。OS共通のoptical-exits.mjsが、眼→対象点を逆延長し、閉じた空間の境界で交わる面と位置、登録した出口の有効範囲へ入るかを返す。光学driverや権限を返すAPIではない。

calculate-six-exits.mjsは4×4×3mの包囲を仮定し、内側の3×3mサービス領域を維持。眼位置243、対象点147、35,721組、両瞳64mm間隔と幅4mmの18点、計642,978光線/構成を比較する。各光線が別の出口を使ってよい理想条件で、Goの角度/焦点や像源数は未割当である。

上下込み6出口でも、300mm角では35,443組が未達、1,200mm角では31,564組が未達。6面全体を出射面にすると有限組の未達は0になるが、4側面48㎡＋上下面32㎡、計80㎡を要する。これは6台の小型光学部ではなく、巨大な理想出射面の必要条件比較。部品や製品案として採用していない。

閉じた凸な箱の内部に眼と対象があれば、眼から対象へ進めて延長した直線は必ず境界へ達する。境界全体を理想的な光線生成面で覆えば、全ての非一致の眼/対象に出口位置が存在する。この条件付きの幾何学的な説明は連続位置にも成り立つが、光線を実際に生成できる部品、両眼像質、輝度や安全性の証明ではない。

同じ6面で各出口の縁に10mmの非出射帯を置くと、有限組でも708組が未達へ戻る。顔/家具/身体、境界の実frame、収差、Goの有限視域/奥行、光量、複数人同時は未合格。継ぎ目と出射可能な全位置/角度を含む実光学部の選定が必要で、面数だけを決めても解決しない。

像の位置に板・膜を置かず周辺の出口だけを使う条件は維持。optical-exitsはgeometricPathAvailableと候補IDを返すだけでphysicalVisible=false。未登録の出口や隙間を出力可能にせず、実光学・測定済みcomfort・停止が閉じるまで権限/通電/実タップへ昇格しない。少数全範囲の実方式と最終基板はまだ未確定。

<!-- page -->
## 49 端末内の手指ジェスチャー操作

PR238で採用したgesture/配下のブラウザ試作は、手をつまんで選択し、保持中に表示を移動/回転、離して表示操作を終え、手のひらを開いて取消する。像の方式を矩形画面へ変更するものではなく、入力を独立して検証する開発用表示である。

tracking-worker.jsは固定local assetのMediaPipeで手の21点と左右labelを推定する。GestureEngineは1handだけを使い、3frameの安定確認、pinch比率0.28/保持0.45のhysteresisで候補を作る。2handの混在、消失、急な位置/左右label変化、200ms超の欠落、時刻逆転、画面外を拒否する。値は初期fixture条件であり、実手の誤操作率からの調整は未実施。

出力mini-gesture-preview/1はsessionId/sceneRevision/sequenceへ束縛し、select/transform/stopとBEGIN/UPDATE/END/CANCELを返す。作用はVIEW_ONLY。calibrated、physicalExecutionAllowed、approvalGranted、preferenceInferredはfalse。ENDはローカル表示の終了で、CoreへのCOMMIT、CAD原本編集、Tool実行や承認ではない。

CameraSessionは明示開始し、モデル準備15秒・permission10秒・再生3秒を限度に待つ。既定15fps、同時1frame、1frame待ち1.5秒、既定4500frameまたは5分で止める。停止・tab非表示・離脱時にtrackを閉じworkerを破棄し、遅いcamera許可やbitmapも解放する。旧worker通知と期限後の結果を新しいsessionへ渡さない。

映像・手の履歴を保存/外部送信しない。独立試験は合成landmarkと合成canvasの実SDK推論で、実カメラによる手の認識精度ではない。画像xyを部屋の実測3Dへ変換した保証はなく、Eveの好み学習・明示feedback、Smithの操作権限へも未接続である。

<!-- page -->
## 49.1 モデルの準備・保存・復旧

SDKは@mediapipe/tasks-vision 1.1.1、モデルは既存HandLandmarker float16/version 1を固定する。URL、SHA-256、最大10000000 bytesはgesture/runtime/model.jsonを正本とし、新しいProviderやmodelへ切り替えない。SDK/model binaryはGitへ保存せず、本人が準備するlocal assetを使う。実行中に外部CDNへfallbackしない。

install-model.mjsはUID・O_NOFOLLOW・同一filesystem内のhardlinkを使える信頼したmacOS/Linux環境向け。保存先directoryと通常fileの所有者/権限/種類を調べ、symlink・hardlink・FIFO等の不正対象や旧.download残骸はfetch前に拒否する。既存targetのdigestが正しければ再fetchせず検証する。

取得は固定HTTPS URL・30秒の期限・redirect拒否・サイズとhashの検査を通す。privateな一時directoryと排他的な0600通常fileで準備し、flushと再hash後、既存targetを置き換えないatomicなlinkで採用する。失敗時は自分が作った一時fileとdirectoryを後片付けし、既存対象を自動削除しない。

原版では固定.downloadへの書込みがsymlinkをたどり、外側のmarkerを上書きした。directory linkからの保存先逸脱と合わせて反例を保存し、修正版を独立検収した。現行のinstaller/試験sourceはPR238の採用記録へ束縛する。旧16source一括検収を変更後installerの受入へ流用しない。

恒久試験は現行installerをprivate fixtureへコピーし、trustedな合成manifestとmock fetchを使用する。既存path、途中のtarget出現、hash/size/network/write/publish失敗、正常/再実行、cleanupを検査する。実DL・カメラ・model推論なしで行える。CIのshallow checkoutへ旧Git objectやmodel cacheを要求しない。

Windows・未検証ACL/filesystemは非対応。同UID/特権者がcodeや親directoryを並行交換する攻撃への完全防御は保証しない。不整合があれば停止し、本人が対象を確認して復旧する。配布条件、Mini実機性能、実データ・実回線の利用は別受入である。

<!-- page -->
## 49.2 既存Linux研究経路との区別

以下はv0.9から保持するLinux/V4L2研究経路の設計である。第49章のmain採用browser試作とはsource・期限・実行先・受入証拠が異なる。この経路の実撮像/精度を今回確認したものではない。

hand_landmark_observer.pyは、事前に用意したMediaPipe HandLandmarkerとexact Linux V4L2 cameraから手の21点を取得するsource。モデルhash、installed SDK/OpenCV版、camera by-id、本人管理profile、place epoch、期限へ拘束する。モデルやSDKを自動取得しない。実行・実camera・精度は未受入。

画像のxyだけを使い、モデルが返すworld landmarksを部屋の実測座標へ昇格させない。参考API: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/python 。生画像は記録/送信せず、手の点だけを限定した子process pipeへ渡す。手の分類scoreを本人性や位置精度としない。

hand-preview.mjsが、手を開く180ms→つまむ60ms→移動preview→離して移動提案、の状態を管理する。pinch比率0.25/0.45は調整候補で、受入済み閾値ではない。手の消失、2手の曖昧さ、急な位置変化、端/scaleの不確かさ、100ms超の欠落で取り消す。別の手への入替えを完全識別した保証はない。

hand-preview-host.mjsは明示flagでcameraと一時下書きだけを許可し、既存createLocalDraftAppへ移動提案をrevision付きで適用、結果を読戻すsource。新しい帳簿や仕事runnerを作らない。inputは画像座標の相対gestureで、既存synthetic-rayへ偽装して空間tapを通さない。

観測はモデル/校正/place/boot/sequenceを照合し、camera buffer受信から100ms以内を要求する。露光同期ではなく、遅いinferenceは拒否され得る。hostは12秒、100frame、停止後1.5秒のkill猶予。実行手順はspatial/HAND-PREVIEW.md。未実行のcodeを手で操作できた実機証拠にしない。

この経路は一時的なlocal draftだけで、Eve/Smithへの外部Tool実行、永続job、AI利用、課金、光学通電を行わない。Go/D405の観測sourceとRGB handの露光/座標融合は別に必要。実空間の精密操作には実測error、対象/遮蔽、光学可視性、本人の既存Broker承認と実appの保存/復旧を受け入れる。

<!-- page -->
## 50 内部接続・回路とPCBの現在地

hardware/reference-interface-map.jsonへ、既存回路/PCB/firmwareのpinを照合した接続表を追加。Pico2はGP2/3/4/5/6へSTOP/LATCH/TEMP/POWER/DOCKED、GP8へlocal button。moduleの物理pinとcarrier側harnessを別記し、取り違えを避ける。全て既存3V3 contact benchであり、光学の実安全入力として受け入れていない。

GP7はPico2物理pin10、既存LED出力のみ。STOPのDPST-NCはcontactとLED帰路を切る既存bench設計で、Goや光学engineの通電を切る実証ではない。新hand入力はMCUをarmしない。最終出力の停止には光源給電/USB逆給電/自律再生を含む独立した経路が必要。

Goの参照映像経路にはメーカーのLooking Glass Go HDMI to USB C Adapter Cableを候補として具体化。host HDMI→能動変換→Go USB-C、または対応DP Alt Mode host＋同梱USB-Cを使う。一般のUSB給電配線や受動変換では代用しない。exact host/解像度/向き/給電/Bridge/光学中継の実測は未受入。出典: https://checkout.lookingglassfactory.com/products/looking-glass-go-hdmi-cable 。

Go5V/3Aの15Wは電源容量枠で実消費ではない。既存2A評価couponへは接続しない。source内部のspring-closed遮光shutterと閉位置senseも候補にするが、actuator/driver/寸法/開閉時間/故障時位置は未確定。像の場所へ板や膜を置くものではないが、採用品や独立停止の合格とはしない。

今回のPCB作業は接続表と未確定netの整理まで。新しい完成回路/配線済みMini主基板は作っていない。既存の配線済みsourceはPico2 contact benchと5V部分couponで、光学driver、電池/RF、生体/音声、全機構を含む最終boardではない。ERC/DRC/実板受入も今回追加していない。

光学方式が未確定のため、最終pin/net/電源停止/高速interfaceを確定できない。reference-interface-map.jsonのsourceを最終PCBへ置き換えず、光学・実sensor・停止/熱/packと同一個体の設計を閉じてから製造releaseへ進む。既存料金は維持し、購入/契約/公開は行っていない。

<!-- page -->
## 51 参照CMの作業体験をOSへつなぐ

参照チャット01a16b71-c8f7-7590-918f-9f5cf1ea6073「avocado✖️architecture 🎬 (2)」を読んだ。最新の3本は、演奏から遅い練習コピー、紙のスケッチから動くサイト、図面から実寸の机を置いて歩く体験。映像企画の台本と操作の因果が中心で、部品/光学/実sensorの受入証拠ではない。

computer-use-scenarios.jsonに、各編のsensor入力、対象の確定、既存appの限定操作、成果の読戻し/保存、実機合格条件と現在の不足を記録。手を認識しただけで、紙のレイアウト理解、楽曲のtime-stretch、CADの実寸空中表示が実行できるとは扱わない。hand previewは画像xyの一時下書きまで。

紙→Webは紙と指先の特定、曖昧さの確認、レイアウト案、実editor/build/browser操作、指した実物の承認済みasset、sourceと実ページの読戻しが必要。生成した文章だけを動くWebやcomputer useへ置き換えない。公開は別gateとし、この参照だけで公開許可を追加しない。

複数Miniへ移るときは同じowner/job/sceneとasset revision/world anchorを保つ。旧入力leaseを失効し、新nodeの校正/出力mode/場所/権限と停止状態を照合する。別の仕事や月額契約を生成しない。実物の机や模型を移動したときの再校正と保存/復旧は同じ既存workflowへ接続する。実handoffは未受入。

参照CMには天井と面一、回転展開、40mm径の構想記述がある。現行の工学仮定は外径76mm/高さ186mm、Goの幅80.4mmであり、この構想へ収納できたCADはない。CMの40mmを確定製造寸法として流用せず、光学headと共通Coreの配置/大きさの相違を明示したまま判断する。

今回は光学出口の幾何sourceと仕事の受入対応を追加した。新しい全範囲光学engine、部品pin、最終netlist、配線mainboard、Gerber、実板受入は追加していない。6面の理想計算やCMを最終回路の根拠へしない。既存のまぶしさ/料金条件、Smith/Eve/OSの本人・予算・保存を維持する。

<!-- page -->
## Eveの掛け合わせ作業台への適用

本人が示した4本の制作体験（音・図面・写真・映像）と同じく、原本を残し、対象を選び、作業コピーの変化を比較し、明示的に保存する。Eveの`/os/eve/remix`は素材棚、A/Bの置き場所、目的、作業コピーを別の操作対象として表示する。Mini向けの広い作業配置と通常画面の配置は同じ選択状態を使い、入力方法で別の仕事を生成しない。

Pointerの押下/移動/解放は選択だけへ解決し、資料の配置では生成・外部送信・保存を開始しない。追跡側が入力を取り消す場合はPointer Cancelへ結び、古い解放を再配送しない。Mini sensorの実poseをDOMへ解決するadapterと校正は未接続であり、Webのdrag試験を実手trackingの証拠にしない。

コンピューターユーズは「資料名を素材A/Bに置く」「元の資料A/Bを読む」「Eveへの依頼」「掛け合わせて作る」「作業コピーを保存」の同じ名前付きUI操作を使う。`data-eve-action`は対象の識別で、実行grantではない。素材確認、既存owner境界、実行先/予算/外部送信確認を省略しない。

現在実行できる合成はテキスト資料と保存済みAgent役割である。映像の並べ替え、音声のtime-stretch、写真のinpaint、CADの寸法編集は各app adapterの限定操作と原本revision、preview、実読戻しを受け入れてから有効化する。文章でそれらを説明できることを実アプリ編集成功に換算しない。ローカル作業コピーの継続保存・別端末再開と、Mini実機の声/手/光学出力は引き続き未受入。


### Eve Media Studio — 端末内の編集アプリ（2026-10-23）

`/os/eve/remix` の素材棚は写真・動画・音楽の実ファイルを扱う。カード上部のPointer操作で素材同士を重ね、対応する限定コマンドを確認してから実行する。写真2枚の透過合成（PNG）、音楽2本の同時ミックス（WAV）、動画2本の順次結合（WebM/対応ブラウザではMP4）、動画＋音楽の音量合成を内蔵編集アプリが実行する。写真は最大辺2048、動画は最大辺1280・24fps・完成尺60秒まで。アスペクト比を保ち、原本ファイルを書き換えない。動画書き出しは実時間で行い、ページ非表示時は中止する。

成果は実Blobとしてプレビューでき、明示操作でIndexedDBの作品棚へ保存、またはファイルとしてダウンロードできる。作品棚は同じブラウザ・origin内の保存であり、アカウントのクラウド同期ではない。OS/ブラウザのデータ消去や容量制限の影響を受ける。中止時に部分動画を完成品として扱わない。

実行先はCanvas/Web Audio/MediaRecorderを使うEve内蔵Webアプリ。外部デスクトップアプリのComputer Use、自由文からの汎用編集、写真の生成的除去、Mini実機の手追跡・音声接続は未実装。選択はLLM推論ではなく素材種別に応じた明示的なコマンド解決である。
