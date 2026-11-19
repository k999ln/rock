## 目的から部品確認と同じEve仕事へ（SKY21／OS10／DSP01）

ROCKは共通目的照合、private UIと既存Eve経路への接続。EXTERNALは部品とdriver、OWNERは目的と取り付け／実行の確認、JOINTは同じPixel＋基板の実受入。準備前の目的確認、部品不足と処理不足、旧確認の失効、同じjob／export／停止を検査し、部品到着・UI接続・実機の未完了を保持する。検証は集中smis-object-purpose／smis-module試験、portable build/test、typecheck、design:check、最終npm run verify。 [詳細正本](../sky-tools-complete-design.md#smis-object-purpose)。

## 交換式部品のPixel先行試作（SKY21／OS10／DSP01・2026-10-23）

主担当ROCK。本人の最新指示で再利用電子本体＋対象別の保持／接触部＋共通OSを[詳細正本](../sky-tools-complete-design.md#smis-removable-module)に採用。ROCKはbounded BLE reader・取り付け世代・同じEve仕事／保存／停止、EXTERNALは基板／browser／driver、OWNERは調達・固定・対象／目的／同意、JOINTは同じPixel＋基板＋2対象で実受入。初期はmicro:bit V2の加速度入力と文章出力、着脱自動検出・重量／温度／駆動は未対応。本人は部品未所持で調達予定。実Pixel UIはnative pipe closed、USB接続のみ確認。集中検査 `node --experimental-strip-types --test tests/smis-module.test.mjs tests/eve-os-interaction.test.mjs tests/eve-purpose-runtime-work-port.test.mjs tests/eve-runtime-work-port.test.mjs tests/eve-runtime-export.test.mjs`、`npm run typecheck`、`npm run design:check`、`npm run verify`。結果は[証拠](../evidence/smis-removable-module.json)へ記録。次はソフト検査を完了し、部品到着後に実接続・普通の目的・担当登録・実推論・Android保存先読戻し・停止／付け替えを実確認。一般公開なし。

## MiniのHey Eve/Thanks Eve（MAT15/OS10/DSP01/SKY21）

[11項目の正本](../rockstaros-avocado-mini-complete-design.md#mini-hey-eve)。ROCKはvoice sessionと既存仕事/停止の結合、EXTERNALはASR/言語model/マイク回路、JOINTは同じPixel実音声と後のMini AON/電力、OWNERは待機/依頼確認/保存。Pixelは前景2分だけの試験候補で、専用wake-word・常駐・基板完成と別。`node --experimental-strip-types --test tests/mini-voice.test.mjs`、typecheck/lint、Pixel package、全verify、実音声一周を別受入する。集中12/12・関連29pass/1skip・型/lint/package11hash・全verify exit0（1548/1547pass/1skip、API2113/CSV113/assets221欠損0）を限定受入。実機ASR/native入口/実音声一周は未完了。根拠は既存avocado-mini-native-development.json#pixelVoicePreview。公開保留、必要能力を未導入のまま合格にしない。

# Material Invention / avocadoMini

## Mini起動・MCU・試験PCBの実装（MAT15）

本人の「基板はなし、そこの設計から」を受け、[開発sourceと受入条件](../../systems/rock-star-os/targets/avocado-mini/README.md)を追加。CM5/CM5IO＋Pico 2は卓上参照構成で、Pico用C firmwareのcross-build、Linux USB CDC driver/systemd、既存Eveを同じowner/料金契約で開くclient起動部、76×62mmのKiCad接点/LEDキャリアを実装した。[通信契約](../../contracts/avocado-mini-supervisor.json)と[検査証拠](../evidence/avocado-mini-native-development.json)を参照。製品Miniのnative OS image、署名/復旧、衛星IP/AP、光学/生体/電池を含むmainboard、実機Eve、200mm同一閉箱の受入、量産releaseは未完了。GPIO flag代用接点やLEDの成功をその合格へ転用しない。


## 建築研究を一つの現場へ接続（2026-10-21 / MAT15・MAT18）

利用者が示した[建築構想論文1000本のチャット](codex://threads/01a14adf-d6eb-74e2-960b-e0c6b2fe26df)を受け、200構想×5視点の研究から**同意のある実在空間一件**へ進む時のMiniの役割を[空間設計§2.3](../avocado-mini-r5/phone-spatial-interface.md#23-建築構想を実際の場所へ結ぶ2026-10-21)へ定義した。ROCKはowner/place/project/job/revision、権限、出典、成果と復旧を担当。EXTERNALは敷地資料・権利・図面・専門家判断とsensor/光学、JOINTは同一現場の実測・表示・生活効果、OWNERは対象地と同意・共有・費用を決める。敷地未選定の構想は研究のままとし、現地導入、Miniの光学/通信、専門家検収、効果測定を完了扱いにしない。既存AS01〜06、MAT18の一室pilotに接続する。

## 既製機器の着脱体験をMiniへ移す（2026-10-21 / MAT15・MAT18）

本人が示した壁から外したNest Thermostatを起点に、追加指示「もっとあるからサーチして」「もっともっと参考になるものあんじゃね」に従って[31件の製品・技術の公式資料とMiniへの設計判断](../avocado-mini-r5/embedded-portable-connectivity.md#既製デバイスを参照する方法2026-10-21)を記録した。ROCKはdock/coreの権限・状態・保存と実寸dummyの受入台本、EXTERNALは建築施工、latch・電池・RF/光学/熱、JOINTは同一閉箱での着脱・通信・表示・仕事復旧、OWNERは最初の設置場所と施工者を担う。順番は実寸dummy→設置別の落下防止→給電/権限/job復旧→同一閉箱→施工検収。DP 0/5、OI 0/7、MP 0/6、AS 0/6を維持。今回の比較を部品採用や物理試験の完了とはしない。

追加11件の中では空中像と手入力を一体にしたHolo Industries、AirPush等の操作方式を分けるUltraleapをP1a/OI02の比較rigに優先する。Beosound Level/DJI Action 2は着脱・給電・連結後の封止、Starlink MiniはP1bの衛星IP→Wi-Fi APの寸法・電力・上空視界、Garmin fēnix 8 Pro/Echo Showは携帯なしの連絡能力、Humane Ai Pinはservice停止時のexport/復旧を検討する材料。[空間UIの研究順](../avocado-mini-r5/phone-spatial-interface.md#22-実在する空中操作立体像からの研究順2026-10-21)を参照。設計比較であり、発注・連携契約・物理受入を含まない。

<a id="material-creation-20261020"></a>
## 制作・Material Inventionの照合と実行順（2026-10-20）

本人の列挙はRQ49と既存`MAT02/03/05/06/15/18`を具体化する。主担当はMaterial Invention / avocadoMiniのROCK。建築・インテリア・サウンドの専門検収、CAD/BIM原本、sensor/光学/試験機器はEXTERNAL、同一作品・同一閉箱の測定はJOINT、対象空間・素材・共有相手・外部送信・物理試作はOWNERの判断とする。

1. **型付き成果と候補（`MAT02/03/18`）**: 既存の二物質・複数比率・工程条件のsandbox graphとfail-closed制約検査を再利用する。入力には原素材/計測の出典、単位、公差、権利、環境条件を持たせる。候補、拒否理由、比較指標、変更された入力だけを再計算した差分、版/hashを同一owner/job/artifactへ保存する。建築/インテリアは寸法・配置・材料表、サウンドは時間軸・音源権利・出力profileを型付き成果にする。モデル提案を安全試験合格にしない。次の合格はEve仕事への接続と、再計算・古い版/他owner拒否のfixture。
2. **Mini空間と共同表示（`MAT05/15`）**: sensor計測、四方向pose、座標系/校正、scene revision、招待範囲、表示の物理的漏れを別々に記録する。pose喪失・stale入力では編集を停止し、保存済み成果へ復帰する。共同観察は同一scene/hashを複数視点で確認し、室外からの読取りと眼/熱/光安全を独立に測る。既存AS01〜06は物理受入0/6で、認証だけを光学的秘匿としない。
3. **原本照合と物理試作（`MAT03/06/15/18`）**: CAD/BIM/音源原本のdigest・座標/単位/版・licenseと生成成果の差分を専門家が検収する。simulation receipt、加工用図面、試作品ID、計測器校正、安全試験、失敗/修正/再試験を同じ作品revisionへ結ぶ。机上計算や合成sceneを製造/施工/実機対応へ転用しない。対象原本、許容誤差、試験場所と安全基準は専門家・OWNERとの試験計画で確定する。

最初のROCK作業は`MAT03`のEve仕事/限定記憶への非物理fixture、続いて`MAT05`の決定的scene/pose、最後に`MAT06/15`のbench/同一閉箱受入。Game adapterへ出す場合も同一作品revisionを使い、外部gameへの書込みは権利・対象・本人承認を別に確認する。検証入口は`node --test tests/material-invention.test.mjs`、`npm run baseline:check`、`npm run design:check`、統合時`npm run verify`。今回は実行計画でありCAD/BIM実照合や物理試験を実施していない。

## MAT15 — 共同で見る空間建築表示

2026-10-19の利用者補足を[空間建築表示・限定共同観察域の設計](../avocado-mini-r5/phone-spatial-interface.md#21-何もない場所に建築を見せそこで設計する)へ反映。空の場所で建築モデルを本人たちが同じ位置に見て歩き、手・声で案を変え、図面に戻す。観察域の外へ設計内容を漏らさない目標は、ソフトウェア認証と光学的漏れを分けてAS01〜06で受け入れる。ROCKはscene、権限、版付き成果、失敗復旧、EXTERNALは光学・sensor・計測器、JOINTは同一閉箱・複数視点・通常照度・漏れの実測、OWNERは対象空間と共有相手を決める。実機AS受入0件。検証入口は`npm run baseline:check`、`npm run design:check`、`npm run project:check`、最終`npm run verify`。一枚の近距離着信像を建築空間の合格へ転用しない。

## MAT15 — 工場向け回路設計開発の入口

2026-10-19の利用者指示で、内部回路と計算を工場へ渡せる水準に進める。[設計開発R0一式](../avocado-mini-r5/factory-development/README.md)に電気domain/安全境界、再計算可能な寸法/電力/質量、工場RFQとE0〜E3成果物を保存した。`python3 docs/avocado-mini-r5/factory-development/engineering_model.py`で再計算する。現段階は`RFQ_READY_FOR_FEASIBILITY_ONLY`で、正式schematic/PCB/採用BOM・同一閉箱CAD・米国衛星契約は未取得。ROCKが設計入力と再計算を保持し、EXTERNALが実部品・RF/光学/電池設計、JOINTが同一個体のOI/MP受入、OWNERが発注・試験地域・要求変更を判断する。工場の設計開発へ渡せることを、製造部門の加工・量産承認へ置き換えない。

R0確認: 元R5原本26 hash/ZIP27件/図8対/参照36、モデル再計算、持参用ZIP15資料のSHA-256照合、相対file link2536件欠落0、`npm run baseline:check`、`npm run design:check`、`npm run project:check`を通過。`npm run verify`は既定OpenSSL 4でrepositoryが要求する3と合わず一度停止し、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH`で再実行してexit 0（Node1003/1003、Worker/D1 1330、CSV113、host/合成）。ログはGit外`/private/tmp/avocado-mini-factory-r0-verify-openssl3.log`。物理MiniのOI/MPは0件、工場連絡・試作発注・GitHub/main反映・公開は未実施。

## 5時間の発明結果と次の入口

2026-10-19 05:16:53 UTCに開始から実時間300分へ到達した。現在の選定は[Orbit L-Tの一ページ要約](../avocado-mini-r5/README.md)と[製品発明設計](../avocado-mini-r5/product-invention-r1.md)の**研究構成**であり、近距離空中カード、Mini本体の米国双方向衛星IP→Wi-Fi、通話・短文・PCなし制作、同一200mm閉箱は未受入。既製四枚光学と9523 OEM基板は現寸法の採用部品から外し、次は実部品P0 CAD、P1a光学・指入力、P1b米国Provider書面、P1c乾式模擬島、P2同一閉箱の順に進める。OI 0/7、MP 0/6のまま。

研究実行の終了は**05:19:03 UTC／実経過302分10秒**。最終の`npm run verify`はexit 0（Node1001/1001、Worker/D1 1330、CSV113、合成host試験）で、R5原本packageの26 hash・ZIP27件・図8対・出典36、既存計算14/14、baseline RQ01〜49、design 19領域／34 Tool／6 native family、対象資料の相対リンク169件欠落0・SVG20件parseを確認。長いverifyログはGit外`/private/tmp/avocado-mini-five-hour-verify-final-poststatus.log`。この確認はOI／MPの物理合格ではない。GitHubのmainと作業branchのSHAは05:19 UTC再読戻しでも変わらず、PR #130はopen／未統合。成果はローカル保存で、branch/main反映・公開は行っていない。次の担当はmain基盤と優先順位をbranch引継ぎに同期した上で、このdirty checkoutのMini差分を他作業から分ける。

利用者の明示依頼により、[avocadoMini 5時間発明プロンプト](../prompts/avocado-mini-five-hour-invention.md)を作成し、2026-10-19 00:16:53 UTCに実行を開始した。MAT15（JOINT）で、利用場面、三つ以上の物理方式、一次資料と寸法・電力・光学・衛星の反証、選定案、同一閉箱の試験計画へ実時間300分を使う。最短終了時刻は同日05:16:53 UTC。00:56:56 UTCに40分の利用場面段階を終え、[R5の製品発明案](../avocado-mini-r5/product-invention-r1.md)にF前面封止、L展開襟、S Certus背骨の三つを比較し、Lを条件付き優先試験構成とした。小型IoT-NTN radio本体の公称寸法は確認したが、採用可能なantenna・基板・一般衛星IP共有契約・空中像・閉箱熱は未成立。SatSleeveの小型衛星Wi-Fiはスマートフォン用appを要求する一方、旧X5-Touchは単体Android電話から衛星GmPRSをWi-Fi共有できる先例として見つかった。ただし米州網・現行OEM供給・Miniの光学/RF/OS同居は未証明。OI01〜07とMP01〜06の物理受入は未実施。既存のROCK／EXTERNAL／JOINT／OWNERの責任、R5原本、Game／住まい／制作／携行の範囲を維持する。

120分節目（2026-10-19 02:16:58 UTC）: F／L／Sの同一台本と[端面／RF／電池／機構の定量比較](../avocado-mini-r5/product-invention-r1.md)を記録した。LはD76×H186・展開襟D140の研究優先だけで販売仕様ではなく、Fの40mm前面光路が通れば再優先する。Sの既存9770＋二本cell＋薄いAl側壁は仮の450g携行目標を部品段階で超え、通信bench対照に限定。05の斜め視線・天板下収納、既製空中像ユニットと小型筐体の差、antenna groundと光学の競合、現行衛星料金・tethering契約未取得を停止条件へ反映した。次は一次資料・七軸の数字と未取得値を精査する。OI／MPの実機受入は0件、branch／main反映・公開は未実施。

第三段階の判断変更（02:31 UTC）: [厳格200mm寸法鎖](../avocado-mini-r5/assets/orbit-l-height-chain.svg)により、Lの186mm本体を全長収納する固定sleeveから35〜50mm持ち上げる運用Readyは、底厚・公差なしでも全体221〜236mmでR5 REQ01／ME01に抵触。L-Aと大stroke手動Readyを現寸法の採用候補から外し、面一cap H0、短い機械解除、取り外した後のcup＋本体を別々に再設計する。外形だけの研究優先は維持するが200mm達成、衛星IP共有、空中像、電話、pack給電はすべてHOLD。P0では三つの寸法原点と実部品を同一CADに置き、OI01の停止条件を満たすか判定する。

追加の条件付き対案（02:47 UTC）: [L-T伸縮収納筒](../avocado-mini-r5/assets/orbit-telescoping-sleeve.svg)は186mm coreを50mm持ち上げる時、長さ一定の下部cupも50mm持ち上げて固定喉との重なりを増やし、仮の下端余裕5mm（底壁込み、内部すき間未計上）・公差3mmなら全体194mmとする幾何案。必要な下端突出の減少≥44mm、光学襟の同時軸伸び≤6mm。固定sleeveの失格は残す。可動部の挟み込み・保持・接点・施工、黒帯の顔視野、H1光路、衛星RFを同じP0/P1cへ載せられなければL-Tを棄却する。Sは本体H200に底／公差を足すと仮Stow208mmとなる。実機・特許性・販売の合格はない。

地域の確定（03:00 UTC）: 利用者は直接衛星通信の初回検証地域を**米国**と指定。旧Thuraya X5／SatSleeveは米州での回線候補から外し、過去の比較先例だけにする。Iridiumの米国向けMini独自端末・契約、Skyloの機器適合とIP用途、T-Mobile T-Satelliteの対応phone／appの制約を分ける。双方向IP、契約上のWi-Fi共有、実料金、完成端末のFCC/RF、屋外の実接続は未確認でOI04/MP05はHOLD。販売・契約・実機送信の許可ではない。

第三段階の追加反証（03:15〜03:22 UTC）: 9770系の既製hotspot McQ CONNECTは最長辺203.2mm・1kg、DLS-100は221mm・742.8gで、いずれもR5の200mm内携行完成機を証明しない。L-Tの固定喉130mm・可動cup約111mmの模式配置なら重なりはStow約50mm／Ready約100mmとなるが、偏荷重・異物・空dock cover・接点は未設計。約100mm角のTCAP研究素子は対角約141.4mmでD140襟へそのまま入らず、ソニーの小型microdisplay公称輝度も空中像の輝度ではない。黒帯cameraの仮立位／座位には余白込み約61°鉛直FoVが要る。寸法感度と研究資料であり、P0/P1a/P1c・OIの合格にはしない。

03:30 UTCの追加反証: 9770既製moduleをLの理想内径72mmに単純傾斜させても、幅60mmの円断面制約で最大約9.89°、軸外接長約140.67mm。直立140mmと光学42mm＋保持20mmの直列202mm不足を削れない。新しいmodule・再配置・core寸法のP0 CADが必要。L-Tを選ぶ場合も、この数字を衛星IPの解決と混同しない。

205分節目（03:42:03 UTC）: 一次資料と七軸の定量反証を[製品発明案](../avocado-mini-r5/product-invention-r1.md)へ収録。固定sleeve、9770の単純傾斜、既製光学素子の縮小流用を採用根拠から外した。L-Tは仮194mmの機構幾何のみで、米国回線のMini独自端末・共有権・硬い料金上限、同一筐体光学／電池／RF、安全、物理gateは未成立。次の55分はF／L-T／Sを六指標で再比較し、一つの研究構成に限って三状態・費用・権限・復旧を閉じる。OI 0/7、MP 0/6、GitHub保存・公開なし。

収束中の選定（03:47 UTC）: [一ページ要約](../avocado-mini-r5/README.md)と[六指標の決定表](../avocado-mini-r5/product-invention-r1.md)でL-Tを**一つの研究構成**に絞った。Stow端面の匿名合図→安全な伸縮→Readyで本人確認と一択ずつの空中応答／拒否→Carryの本人鍵・仕事・衛星IP＋Wi-Fiという順。D76×H186本体と可動cupの仮194mm寸法、四分割光学の機構干渉は机上の図だけで、米国の契約、光学、RF、保護電池、第二保持爪、施工を解決していない。Fは同じH0光学benchの戻り先、SはIP通信対照とし、仮幾何をOI01合格にしない。

04:30 UTCの収束中反証: L-Tの可動cupは長さ一定でcoreと一緒に上がる。仮194mmはcore底からcup外底までの底壁込み5mm・内部すき間0mm・公差3mmの理想配置であり、内部すき間`g`、coreがcupより先行する遷移差`δ`、襟軸伸び`e`は`g+δ+e≤6mm`。cup停止中にcoreだけ50mm上がる故障姿勢なら仮244mmで失格。RF20mmの下に光学42mmを置く案ではReadyでも光学下端12mmが天板開口内、露出30mmに仮四枚板厚25.6mmを寄せても残4.4mm。D140襟に片側2mm壁を入れると内径136mmと四枚板対角135.8mmの差は約0.2mmで、hinge／seal余白がない。現行四枚構成を採用設計として止め、光学方式とRF配置の再選択をP0/P1aで要求する。小型Iridium 9523を使う既製IP基板も幅75mmで理想内径72mmへ平置き不可。これらはL-T機構の研究継続理由と光学／無線の製品不合格を分けた判定で、OI/MPは0件のまま。

260分節目（04:37:00 UTC）: 六指標比較からL-Tを選定研究構成とし、面一Stow→安全な連動50mm上昇→本人確認後の一択空中応答→同一coreの携行・米国衛星IP／Wi-Fi・同じSky/Zema仕事を設計した。200mmは遷移中も`194+g+δ+e≤200mm`の仮寸法で、光学四枚案は襟と天板の干渉により採用停止。9523 OEM基板も幅75mmで理想内径72mmへそのまま入らない。現時点の合格は文書・原本package整合・host回帰に限り、OI 0/7、MP 0/6。最後の40分に、Stow sensor、秘匿、屋内遮蔽、手／pocket、低速回線、誤tap、離脱権限ほかを独立に自己反証する。

自己反証中（04:44 UTC）: [製品発明案の十六反例](../avocado-mini-r5/product-invention-r1.md#260300分の独立自己反証2026-10-19)に、機構固着・光学/RF同居・一日電力・実番号/音声・請求hard cap・電話/PCなしの初期化と紛失復旧・遠距離の本人へ像/tapが届かない場面を加えた。近距離の一択カードと元R5の全空間裸眼3Dを別gateとし、後者へ前者の成功を転用しない。13秒の紙上応答では15秒呼出しにwake／校正等の余裕が2秒以下である。これらは実機結果でなく失格を探す試験条件。四枚光学と既製9523 IP基板は現寸法で採用停止、L-T自体の閉箱可能性は未判定のまま。次は米国回線の書面・別光路CAD・同一閉箱P2へ進めるかを決める。

一次資料の訂正（04:54 UTC）: [Iridium掲載の9523 OEM基板](https://www.iridium.com/products/planet-9523-oem-board)は現行ページで90g、Wi-Fiはオプション。中間稿98gとの差異を検出し、現行表示90gを使った仮450g携行比較では部分和398.5g、残り51.5gと暫定計算した。オプションWi-Fi込みの質量は未確認。基板幅75mm対L-T理想内径72mmのP0不適合と、Mini型式の米国IP共有権未取得は変わらない。[反証からの最小証拠束](../avocado-mini-r5/product-invention-r1.md#反証から戻す設計分岐)を次の担当への入口にする。

追加訂正（04:58 UTC）: [旧版のIridium掲載](https://uat.iridium.com/products/atmosphere-planet-9523-oem-board/)と同製品の過去の検索索引は98g／Wi-Fiありと示し、現行ページ90g／Wi-Fiオプションと食い違う。現行90gだけを確定値とする扱いを避け、構成差・改訂理由を供給元へ確認するまで**90〜98g**の感度範囲とする。仮部分和398.5〜406.5g、仮450g目標の残り51.5〜43.5g。75mm幅の機械干渉と契約未取得は不変。

Git引継ぎ（04:49 UTC読取り）: GitHub main `70c3e3ef3a05d6f0c9d068616a98f47a38b96d4a`と実在作業branch `codex/esim-cloud-access` `951d82d5a491a284aed4e0d4d280171d835d4b43`はmerge-base `9f64aee3de9cc74e6b6e7eae34052780e000c296`からmain側625／branch側3 commitに分岐。main同一SHAの`verify`はsuccess、branch同一SHAには`source-preparation`だけsuccess。PR #130はopen。Miniを次に実装する担当は、まずmainの基盤・優先順位をbranchの引継ぎ入口へ同期し、このdirty checkoutのMini設計差分を他作業から分離する。文書のローカル保存、branch反映、main統合、Site公開はそれぞれ別記録にする。

## Orbit製品発明候補（2026-10-18 / MAT15）

[R5 Orbit候補](../avocado-mini-r5/product-invention-r1.md)で、空中着信・本人確認・空間応答、直接衛星WAN→Wi-Fi、着脱、Game／Sky／Zemaの一周を同じ本体に統合して比較する。追加の製品目的は、本人がPCの前に立たず制作を始めて成果を検収し、携帯を手に持たず連絡できること。主担当MAT15（JOINT）のOI01〜07は、体積・光学・生体と通話・衛星IP共有・同一job継続・製品安全・PCなし制作／手ぶら連絡をそれぞれ既存MP／MG／DP／R5 gateへ対応させる。ROCKは状態・権限・保存・費用とDevice Profile、EXTERNALは光学・RF・音声回線・電池・施工、OWNERは地域・最初の作品／通話・通信/費用条件を担う。近距離AIRR系は試験候補で全空間裸眼3Dの代替合格ではない。現時点は文書・感度計算のみで、同一閉箱の物理gateは0件。設計整合は`npm run design:check`、`npm run baseline:check`、`npm run project:check`、最終`npm run verify`で確認する。

利用者がHiggsfieldの住宅利用映像と形状非指定の体験例を示した後の発明追補は、手の届く乾いたアイランドを最初のdockとし、同じ一本を`Stow→Ready→Carry`で使う[Aperture Lift・Place Passport・Scene Contract・Route Guardian](../avocado-mini-r5/product-invention-r1.md#発明追補--一台を空間携行へ切り替える-scene-core)にまとめた。ROCKはBrokerの場所scope・同一job・費用、EXTERNALは同軸latch・端面空中像・直接衛星IP部品、JOINTは同じ閉箱での通話／着脱／Wi-Fi／制作一周、OWNERは最初の利用者・設備・回線契約と費用条件を担当する。OI01〜07と製造gateは未合格で、映像視聴や文書追加を実機受入にしない。

## 携帯の新しい形・空間操作の最低機能（2026-10-18 / MAT15・MAT18）

利用者はセンサー、生体認識、RockstarOSの実利用、対応サービス連動、Mini内蔵の直接衛星WANとWi-Fi AP、dock外のポケットWi-Fi、空間に現れる着信と空間タップでの応答を最低機能に指定した。[R5携帯代替・空間UI設計](../avocado-mini-r5/phone-spatial-interface.md)を現行R5入口へ追加する。主担当MAT15（JOINT）が同一試作機の表示・入力・電力・熱・通信を受け入れ、MAT18は住宅内の共有空間・設備との接続を扱う。ROCKはOS／Sky／Zema・本人性・権限・保存を担当、EXTERNALは衛星・音声回線・光学・sensor・住設、OWNERは利用者・地域・料金・最初の利用場面を決める。MP01〜06は未実施。`npm run design:check`、`npm run baseline:check`、R5 package整合、`npm run project:check`を設計確認とし、物理受入には代用しない。


## 目的から使うMiniの製品体験（2026-10-18 / MAT15・MAT18）

利用者の明示補足に従い、R5は住まい・ゲーム・制作・携行を本人の目的から選ぶ製品とする。[R5の製品体験](../avocado-mini-r5/README.md#目的から使うmini住まいゲーム制作携行を一つの製品体験にする2026-10-18)を現行入口に追加した。MAT15（JOINT）は単体ゲーム・入力・表示・電力・熱・着脱を、MAT18（ROCKから実空間JOINT）は一室での可逆な生活用途を扱う。Game / AI06は正式なgame接続口と作者導線を別受入する。ROCKは共通UX、Device Profile、権限・保存・復旧、EXTERNALはgame／設備／通信の提供機能、OWNERは最初の用途、設備、費用、共有を決める。合格証拠は同一候補の初回成功・停止・復帰の実測と既存MG01〜07／DP01〜05であり、GTA VI調査を実ゲーム接続の合格へ転用しない。文書確認は`npm run baseline:check`、`npm run design:check`、`npm run project:check`、R5 package integrity、最終的に`npm run verify`を使う。


## 共通SI CoreをMiniとProへ接続する方針（2026-10-18 / MAT15・MAT18、OS10参照）

利用者の明示指示と訂正で、avocadoMiniと**AI専用PCのavocadoPro**をRockstarOS共通SI／Sky／Zemaの対象Device Profileにする。主担当はAndroid / Device / Local AI workstreamのOS10／DSP01（ROCK）で、本streamはMini R5の実際の入力・表示・音・電力・熱・復旧能力とMaterial Invention／建築・interior・soundの用途別受入を担当する。EXTERNALはSoC／表示／sensor等、JOINTは同一試作機の出力と安全、OWNERは対象出力と共有・費用を決める。[共通業務契約、入力／出力、状態、保存・失敗・復旧、合格条件](../device-support-architecture.md#shared-si-device-profiles)。ProはMiniの拡大型ではない。PC hardware仕様は未確認であり、Mini R5や旧E3をProへ転用しない。`npm run design:check`、`npm run device-support:check`、`npm run baseline:check`を文書契約の検証入口とし、実機試験と分ける。

## 建築・インテリア・サウンドの根城（2026-10-14）

利用者の明示方針により、avocadoは建築・インテリアの専門家・事業者と組み、architecture、interior、soundと自然なITで生活の質を豊かにする領域を最初の産業上の根城とする。主担当は本workstream、`MAT18`（ROCK、in progress）。Product / UX、Sky / MCP、Securityは横断参照とし、既存RQ01〜RQ49、SIM/eSIM主商品、R5、Material Invention、Pixel/QEMUを維持する。

- `ROCK`: Mini Device Profile候補、RockstarOSの権限・保存・復旧、Sky接続、Zema空間project契約、証拠区分を設計・実装する。
- `EXTERNAL`: 建築・内装・音響の固有業務、資格、法規、施工、製品保証、保守を提供する。
- `JOINT`: 実空間の測定、専門家review、設備adapter、設置、音響・privacy・安全、撤去・復旧を同じpilotで受け入れる。
- `OWNER`: 最初の空間・生活課題・地域・partner・予算・共有・発注・設置・公開を決める。

最初の完了条件は、一つの限定空間で現状→複数案→費用→専門家確認→本人承認→実施／検査→保存・復旧を通し、architecture／interior／soundの少なくとも二分野を別責任のまま接続すること。Miniなしのfallbackも保持する。最初の対象、partner、Device Profile、sound範囲、価格は未決定であり、提携・実機・施工・市場獲得を完了としない。検証は既存の`baseline:check`、`design:check`、`project:check`に加え、pilot確定後に対象schema、privacy、audio、device、専門家readbackを追加する。

## ランドセル防犯ベルサイズ端末（2026-10-14）

利用者の明示指示により、R5とは別に[avocado Companion（仮称）P0](../avocado-schoolbag-safety-device.md)を追加した。RQ48の限定Device Profileとして、ランドセル等へ短く吊り下げ、片手で外して手持ち会話を行う。二つの目・マイク・スピーカー・保護者スマホ／Wi-Fi中継の主案P0-Bとscreenless安全比較案P0-Aを同じ包絡で測る。SOSと独立local alarmは取り外す本体側。iPhone USB input bridgeは子供用alarm権限へ含めない。

- `MAT16`（ROCK、in progress）: 3機種以上の実物benchmark、吊り下げ・着脱・SOSの非通電mockup、独立alarm／MCU／電源2案bench、明示操作の会話bench、機械可読profileを作る。
- `MAT17`（JOINT、planned）: 同一engineering prototypeで音響、落下、圧縮、引張、雨、粉じん、温度、電池、無線、false trigger、firmware／通知／recovery、子供向けhuman factorsを受け入れる。
- `OWNER`: 正式名、対象年齢・販売国、学校での音声利用、通知・位置、Cloud Providerと料金上限、外観、価格、pilotを決める。

70 × 45 × 25 mm以下／80 g以下はP0比較目標であり確定仕様ではない。設計保存、開発基板、3D print、投稿参考、合成通知を、実機、安全規格、量産、販売の合格にしない。

2026-10-14に`MAT16`の早期操作試作として[Pixelブラウザ版](../../public/companion-preview/index.html)を追加した。学校／通学／家、固定会話、圏外再現、SOS試験音と停止をPixel 10で表示・操作した。[実機観察](../evidence/avocado-companion-pixel-preview-20261014.json)。これはAndroid APK／MCU firmware／独立alarmの受入ではなく、MAT16/17の物理gateを変更しない。次は実物benchmarkと非通電mockupに並行して、Pixelで見えた状態遷移をfirmware・保護者clientの契約へ落とす。

同日、利用者の追加指示でPixel版へ明示起動・停止できる[限定エージェント](../../public/companion-preview/agent.js)を接続した。複数ターンのしりとり、未送信伝言下書き、安全相談の優先と処理stepをsession内で実行する。Pixelで起動と入力応答、Nodeで状態試験4件を確認。LLM、Cloud Agent、保護者通知、独立警報の実装/受入ではない。次は既存Broker/usage/保護者gateに沿ってmodel実行先を決め、子供の実データを使わず評価する。

追加の手持ち小型screen参考に合わせて同試作をV0.2 Pocket Consoleへ改訂。状態と操作ログを読めるPixel表示は実装したが、子供が吊るす本体の全面screen採用は未決定。二つの目のみの案と小型情報screen案を、同じ電池・安全・視認性条件で比較する。細かなdeveloper診断を子供向け最終UIへ自動採用しない。

## R5の現行入口

内部回路の検討では[部品・機能採否表](../avocado-mini-r5/factory-development/component-verdicts.md)を先に読む。メーカー仕様がある部品と、同一Mini内で使用確認済みの部品を分ける。現時点で後者は0、MAT15の実機受入はOI 0/7・MP 0/6である。[工場向けR0](../avocado-mini-r5/factory-development/README.md)は設計開発見積の入力で、組立指示ではない。

2026-09-24の明示要求により、製品要求は[R5統合基本設計](../avocado-mini-r5/README.md)を優先する。使用時全高200mm以内、1本自律、同型miniの増設、別Edge Hubを必須にしない、全空間裸眼表示を目指す。外部給電は必要。表示方式・精密3D入力・収納・熱・電源・確定回路/加工図は未決を含み、実機0件・製造承認保留である。

- MAT14（ROCK）：PDF/Word、図面8組、計算、研究・参考資料を欠落なくGit保存し、入口と履歴を同期する。
- MAT15（JOINT）：単体の表示成立と安全、精密3D入力、実部品収納を先に検証し、確定CAD/回路と同一試作機の受入へ進む。
- OWNER：製品仕様、費用、販売・外部公開条件の確定。今回の保存はハード製造、課金、公開サイト配備の実施ではない。

MAT01〜MAT13の過去の証拠と実装状態は保持する。旧E3のMAT13をR5の製造指示として開始しない。以下のE3/E2/E1は履歴であり、現行の基本構成を上書きしない。

## 履歴 — Tower20 E3（2026-09-22）

2026-09-22の利用者提供資料により、現行製品は[avocadoMini Tower20 E3](../avocado-mini-tower20-e3/README.md)へ更新した。固定式200mm以下のTower20 4本と、低い別筐体Edge Hub 1台を一つの製品構成とする。P0.2の伸縮塔、E1/E2の単体筐体は設計履歴であり、現行外観ではない。

- `MAT12`: E3資料の境界、現行外観、予定価格、公開Site、Git正本を同期する。資料保存と公開説明の更新であり実機完成ではない。
- `MAT13`: E3の確定CAD、配線、4camera同期、光学、転倒・滑り、熱、電源、音響、OS image、復旧を同一試作機で受け入れる。未着手。
- 主担当`ROCK`は正本、公開説明、software境界を維持する。`JOINT`は実部品、機構、電気、光学、音響、熱、統合実測を担当し、`OWNER`は外観、費用、販売条件、外部用途を確定する。

## 履歴 — Mini200 E2と4本構成（2026-09-21）

2026-09-21の利用者確認により、完成製品の外観は4本の銀色Motion Towerと低い中央ユニットを囲む現在の公開画像を正本とする。[Mini200 E2 four-tower integration baseline](../avocado-mini-mini200-e2/README.md)で、E2のOS・ローカルゲーム・PTT音声・権限・保存・候補computeを中央Coreへ適用し、E2資料の20cm角単体筐体は完成外観へ採用しない。P0.2塔の機構とE2 Coreを一つにする配線、同期、電源、冷却、音響、signed imageと実機受入は未完了。

- `MAT10`: E2資料を精査し、外観の利用者訂正を正本・公開Site・予約説明へ反映。資料保存と公開説明の更新であり実機完成ではない。
- `MAT11`: 4塔＋中央E2 Coreの統合engineering package、prototype、実機受入。未着手。

## 履歴 — Mini200 E1（2026-09-21）

2026-09-21の利用者要求により、使用時20cmのゲーム機から創作・研究・生活へ進む[Mini200 E1](../avocado-mini-mini200-e1/README.md)を追加した。身体入力、本体内計算、日本語ローカルASR候補、PTT、独立MIC OFF、ゲームから保存までを設計する。下記の四方向研究profileとは別で、旧schemaを緩めない。

- `MAT08`: E1本文・図7枚・算術と許可モデル・README保存。設計資料の検証であり実装完成ではない。
- `MAT09`: E1入力profileと既存Core adapter、実ゲーム・実ASR、console OS、閉箱での光学・音響・熱・物理ミュートの独立受入。未着手。
- 最新の[生活・自律動作・衛星通信追補](../avocado-mini-mini200-e1/game-first-life-connectivity.md)は`MAT08`の設計保存に含む。`MAT09`では通信断のゲーム継続、模擬生活機器の同意・越境拒否・結果不明を別試験し、実回線・実家電は別承認と共同受入に進める。製品の入口はゲームだが、既存Pixel/QEMUのCore gateは維持する。
- 主担当`ROCK`は資料と参照モデル、`JOINT`は実部品と統合実測、`OWNER`は外観・費用・外部用途の確認。既存`MAT05`/`MAT06`をE1計算で完了にしない。

再計算: `python3 docs/avocado-mini-mini200-e1/engineering/verify_all.py`。140項目は算術・直列モデルの集計、実ASR・実機は0。Git保存、main統合、Site配備を区別する。

## 目的

物質digital twinを四方向sensorと手の動きで接続・分離し、安全検査、simulation再計算、発明履歴、Patent AI支援までを一つの再現可能な仕事にする既存研究profileを保持する。初めて参加する人は[R5製品要求](../avocado-mini-r5/README.md)を読み、必要に応じて[Material Invention研究設計](../rockstaros-avocado-mini-complete-design.md)へ進む。

## 普段の言葉での全体像

avocadoMiniはRockstarOSを搭載する空間発明端末である。利用者が目の前のデジタル物質を手で組み合わせると、Material Invention Coreが新しい仮説として保存し、安全条件を確認してから計算を更新する。人、AI、計算、文献、実験の根拠を分けたままPatent AIへ渡す。

cameraが実物を変化させるわけではない。gestureだけで物理実験、装置制御、外部共有、Wallet操作、特許出願を承認しない。

## 現在地

- `MAT01`: Core entity、発明loop、安全境界の設計完了。
- `MAT02`: 二物質・複数比率のsandbox Coreと9 testを実装済み。
- `MAT03`: Zema、限定記憶、simulation、外部lab接続は未着手。
- `MAT04`: avocadoMini、XR、四方向sensor、hand interaction、Patent AI統合設計に加え、Bench／ビリヤード台規模Full-scaleの寸法budget、concept画像、機構・光学・電気・演算・安全・校正・HVTのhardware詳細設計まで完了。
- `MAT05`: 決定的scene projectionと合成pose interactionは未着手。
- `MAT06`: 四方向Bench／Full-scale実機prototype、simulation／Patent AI bridgeは未着手。

## 作業範囲

### 含む

- MaterialRecord、候補graph、工程、安全、evidence
- XR scene projectionと2D fallback
- four-view calibration、hand tracking、gesture confidence
- connect、separate、branch、undo／redo
- simulation manifest、receipt、stale、cancel、unknown result
- invention event ledger
- Patent AI provenance bridge
- privacy、accessibility、security、合成fixture、受入

### 含まない

- 未承認の物理実験
- 危険な合成手順の自動生成・実行
- camera serviceからの装置直接制御
- Patent AIによる特許性・発明者・権利帰属の確定
- 自動出願、電子署名、料金支払
- 実材料性能や量産性の未検証合格

## 責任分界

| 主担当 | 責任 |
| --- | --- |
| ROCK | Core、contract、projection、Zema仕事、local interaction、安全gate、2D fallback |
| EXTERNAL | sensor／headset vendor、simulation Provider、材料DB、Patent検索、外部lab固有機能 |
| JOINT | calibration、Provider接続、専門家review、実機／lab受入 |
| OWNER | project作成、共有範囲、費用、物理実験、外部送信、専門家handoffの最終確認 |

## 次に進める順番

1. `MAT05`: 合成Material Core graphから決定的なXR sceneを作る。
2. 合成pose streamでconnect／separate／undoをeventへ変換する。
3. stale、別project、改変、low confidence、sensor欠落を拒否する。
4. view-only 2D／XRでMatter Space、Process Tunnel、安全overlayを表示する。
5. `MAT06`: 一台cameraで誤操作を測り、その後four-view Bench rig、最後にビリヤード台規模Full-scale rigへ進む。
6. 合成simulation receiptとPatent AI packet fixtureを接続する。
7. 実Provider、実headset、実labはそれぞれ独立して受け入れる。

## 担当を選ぶ

- 全担当: 完成設計書Aで、まず同じ製品像を持つ
- Product／UX・Visual: 完成設計書Bと19章
- XR／3D・Computer Vision／Sensor: 完成設計書6〜9章、14章、19章
- Core／Material／Simulation・AI／Agent: 完成設計書10〜16章、19章
- Patent／Legal・Security／Privacy・QA／Safety: 完成設計書15章、19章、21章、24章

## 完了条件

- 同じ入力と版から同じ候補／scene digestを作る。
- lot、工程版、model版、owner、projectを混同しない。
- unknown、stale、unbound、blockedを成功にしない。
- simulationと実験結果を分ける。
- raw cameraとbiometric streamを既定保存・送信しない。
- headsetなしの2D fallbackで同じ主要作業を完了できる。
- 人、AI、simulation、文献、実測のsourceをPatent AI packetで分ける。
- emulatorやfixtureの成功を、実材料・実機・特許・量産の成功と表示しない。

## 関連資料

- [Mini200 E1 — ゲーム機・身体入力・日本語音声](../avocado-mini-mini200-e1/README.md)

- [共有用完成設計書](../rockstaros-avocado-mini-complete-design.md)
- [Material Invention Core](../material-invention-core.md)
- [Spatial Invention Studio](../material-invention-xr.md)
- [avocadoMini端末設計](../avocado-mini-spatial-invention.md)
- [avocadoMiniハードウェア詳細設計](../avocado-mini-hardware-design.md)
- [Patent AI](../sky-patent-assistant-20260912.md)
- [製品ベース](../product-baseline.md)
- [全体構成](../system-composition.md)
- [`contracts/material-invention.json`](../../contracts/material-invention.json)
- [`contracts/material-invention-xr.json`](../../contracts/material-invention-xr.json)
- [`contracts/avocado-mini-spatial-interaction.json`](../../contracts/avocado-mini-spatial-interaction.json)

## 検証

- `npm run baseline:check`
- `npm run system:composition:check`
- `node --experimental-strip-types --test tests/material-invention.test.mjs tests/product-baseline.test.mjs tests/patent-assistant.test.mjs`
- `npm run typecheck`
- `npm run lint:product`


## Mini単体のWebゲーム設計（2026-10-15）

利用者の追加指示により、主担当MAT15/JOINT、Game AI06連携として[R5ゲーム実行設計](../avocado-mini-r5/game-runtime-design.md)を追加。1本自律・200mm以内・別Edge Hub不要を維持し、WASM/WebGPU、GPU driver、メモリ比較、電源/熱、OS/game focus、同一仕事IDの継続、原稿非公開、失敗/復旧、MG01〜07の合格条件を定義。Chrome拡張はMac参照adapterで、Mini本番はOS操作面/Brokerへ移植する。Mini実装・実機・FivePlay起動・裸眼表示・製造の合格ではない。原本packageは不変。


## 建築埋込・着脱・衛星経由の携帯Wi-Fi（2026-10-15）

利用者の画像と明示指示により、[R5着脱通信設計](../avocado-mini-r5/embedded-portable-connectivity.md)を追加。建築/家具側dockと可搬core、取り外し後の電源、衛星WANとWi-Fi LAN、job継続と場所権限失効、給電/熱/通信の失敗復旧、DP01〜05を定義。従来の外部給電のみの前提を変更するが、battery部品・衛星方式は未選定。1本自律/200mm以内/別演算Hub不要を維持。画像は機構参考であり、屋内衛星通信・実機・施工・製造合格ではない。MAT15/18の設計追補、原本packageは不変。

## GTA VIからの空間・音響体験の設計学習（2026-10-17 / MAT18、AI06参照）

[GTA VI公式映像・開発者インタビューのavocado適用調査](../gta-reality-bridge.md#15-gta-vi-launch-trailer--公式情報からのavocado適用調査2026-10-17--ai06mat1518連携)を参照。地域の生活音・光・音響を作品全体で整える考え方を、実際の建築・interior・sound pilotで「作業開始案内」「静音/集中profile」「控えめなjob状態表示」を比較する候補へ翻訳した。GTAの音源/素材/見た目を再利用する許諾、Mini実機機能、MAT18 pilot契約が成立した事実ではない。次にMAT18で代表する一室・生活課題と、Miniを使わないfallback、owner操作・停止・削除・comfort指標を選ぶ。

## 追加調査：現場起点でpilotを絞る（2026-10-17 / MAT18、AI06参照）

[AI06追加調査§16](../gta-reality-bridge.md#16-追加調査実地観察制作規模創発的な仕事導線2026-10-17--ai06mat1518参照)では、GTA VI取材が初期の広い範囲から地域特化へ絞ったという報道と、Rockstarが現地調査・対面デモを重ねた話を確認した。MAT18への仮説は、部屋/センサー/agentを先に選ぶのではなく、ownerと専門家が一室の生活課題・音・光・privacy・動線を記録し、機器を使わない可逆prototypeから始めること。利用者、場所、指標、停止条件、復旧方法が決まるまでは機能要件や実機受入へ昇格しない。これはGTA VIの開発手法をそのまま模倣する合意ではなく、Bloomberg由来の制作スコープ情報は二次報道として扱う。

## 追加調査：任意音声と移動先からの再開（2026-10-17 / MAT15/18、AI06参照）

[AI06追加調査§17](../gta-reality-bridge.md#17-追加調査役割引継ぎ車外でも続く音声任意の個人化2026-10-17--ai06mat151518参照)の公式radio案内と開発者取材を、Mini/phone/Mac間のjob継続に対する体験比較として記録した。候補は同一jobの任意audio summary、headphone/private route、speaker出力の明示、即時pause/stop、画面への同状態復帰。測定項目は内容理解、聞き直し、通知割込み、周囲への情報漏えい、失敗後resume。ownerの場所/機器scopeを越えて勝手に再生せず、音声を本人確認・intent・承認・支出・成果完了証拠にしない。実験を始めるには代表する一室/課題、参加者同意、Miniを使わないfallback、停止/削除、comfort/privacy基準を別途定める。GTA音源・台詞・音響素材の使用権、Miniの実機機能、MAT18実験許可があるとの記録ではない。

## 追加調査：映像上の役割/状態の見え方と現実感の費用（2026-10-17 / MAT15/18、AI06）

[GTA VI追加調査§21](../gta-reality-bridge.md#21-追加調査extended-lookと公式発売範囲を切り分ける2026-10-17--ai06mat1518参照)の公式Extended LookはPS5録画の編集済み映像で、二人の主人公の役割/電話context/状況目標を見せる。Avocado Miniでの比較は、画面を控えめにする場合にもjobの対象、現在の担当、承認待ち、停止と選べる次の行動が画面/音声で回収可能か、また生活空間の表示/音を足したとき操作時間・誤解・割込みがどう変わるかを検証すること。映像からGTA VIの機能仕様、AI、公開SDKやMini機能を導かない。Bloomberg取材の直接本文は取得できず、今回の関係記述はアクセスできた検索抜粋に限定する。MAT18 pilotの対象・owner・同意・fallbackは別途決める。

## 追加調査：空間pilotでの任意触覚/音響（2026-10-17 / MAT15/18、AI06）

[GTA VI調査§22](../gta-reality-bridge.md#22-追加調査ローンチ映像触覚音響の複数出力2026-10-17--mat1518-ai06)は公式PS5 pageのhaptic/3D audio/controller-speaker情報と、15人の限定到達課題研究を分けて記録する。MAT18でMini/phoneの表示が一部場面に不向きかを調べる際、音/触覚をoff可能な補助routeとして比較する候補にする。測定は同じjob状態の理解正確性、通知見落とし/誤解、反応時間、task time、comfort、off率。haptic/audioは承認・権限・支出・完了証拠を表さない。研究課題・参加者・deviceはMiniとは異なり、裸眼表示、医学的な支援性能、実機受入の証拠にしない。原画像・映像・台詞・音源は再利用しない。

[AI06追加調査§18](../gta-reality-bridge.md#18-追加調査発売導線地域コードラジオ局プレビュー2026-10-17--ai06sime商品設計参照)のRockstar公式FAQ/Store案内から、地域・platform account・code expiry・download/activation・edition upgrade・期間特典後のauto-renewを状態ごとに開示する考えを比較した。Avocadoで進める場合は既存SIM/eSIM product gateと、price/renewal・地域・本人・端末適合・client状態を使う。Mini単体への新要件・購買処理・音楽/映像権利は追加せず、無料期間を通常料金や利用権と混ぜない。

## 追加調査：自然なcontext hintと操作コスト（2026-10-17 / MAT18、AI06）

[GTA VI追加調査§24](../gta-reality-bridge.md#24-追加調査仕事候補の自発性と操作負担2026-10-17--ai06mat18)は、Bloomberg検索表示にある細かなrealismの便利さに対する負担、およびゲームのreview中に偶発的な出来事から別行動が連鎖したという記述を、限定的な設計参考として記録した。MAT18ではroom contextから次の生活taskを強制せず提案し、ownerが選ぶか閉じる候補を比較する仮説とする。静穏・共有空間の通知数、dismiss、開始時間、誤解/誤動作、作業状態の見落とし、owner停止後の再開を測る。review buildの逸話であり、GTA VIのNPC/systemを再現する仕様でもAI06の発火許可でもない。

## 中断後のjob復帰を測る仮説（2026-10-17 / MAT18、AI06）

[GTA VI追加調査§30](../gta-reality-bridge.md#30-追加調査task-interruption後の復帰-costと可視context2026-10-17--ai06mat18)では、Hirsch et al.の42人・人工6-step task研究で中断後の実行時間とsequence errorが増え、復帰地点により差があったことを記録。Miniはゲーム中の通知最適化を仮定せず、pause/中断後にjob・revision・完了/次step・approval/stoppedが見える状態から戻れるか、再開時間・重複/skip/誤job・再問合せ・負荷を測る比較案にする。これは研究文献の小規模/人工taskなのでゲーム/Miniへ直接一般化せず、MAT18条件・機材・gate・runtimeを変更しない。

## Private haptic cueと受領確認（2026-10-17 / MAT15/18、AI06）

[GTA VI追加調査§35](../gta-reality-bridge.md#35-追加調査private-haptic-cueを本人が受け取り確認する2026-10-17--mat1518ai06)は、CHI 2013 wearable haptic cue field studyとGTA VI/PS5のhardware紹介を区分。会議発表中のprivate cueでspeaker/chair連携とtime awarenessを支えた実地研究は、acknowledgeとinternal controlが別であることも報告する。Avocado Miniでは待機・期限近接・stopped等のstate cueをoptional/dismissibleにし、notice/ack/startle/errorを測る比較案。ackはpermission/approvalに昇格させず、通知pattern・機種能力を承認/実機受入済みとは扱わない。

## Sound-space discoveryとpreview権限を分ける（2026-10-17 / MAT18、RQ14）

[GTA VI追加調査§37・53](../gta-reality-bridge.md#37-追加調査公式音楽pageのpreviewと商品情報を別導線にする2026-10-17--ai06mat18rq14)は、Rockstar公式music pageのradio preview/album offerと、Robloxのsource-separated discovery/reward estimatesを隣接例として確認。MAT18 sound catalogではlicensed provider demoだけを対象にsource/provider, license scope/region/period, preview-vs-play entitlement, price, playback route, room/device capabilityを表示する案。preview click、featured exposure、estimateを実使用権・installed soundscape・支払保証とみなさない。GTA VI音源/brandは使わず、MAT18の要件・rights/contract・実装・pilot受入を変更しない。

## Soundscape profileは占有者と活動で分ける（2026-10-17 / MAT18、MAT15）

[GTA VI調査§61](../gta-reality-bridge.md#61-追加調査一種類の集中音profileを全員へ当てはめない2026-10-17--mat18mat15rq14)はhome-study acoustical preferenceの5 profile (451 survey, field subset 23), 61-home soundscape study, 120-participant smart-home VR soundscape model, and 24-person cooking-notification modality comparisonを照合。MAT18 candidateはdefault silence/no new output、music/masking/operation/status/urgent alarmを別にし、cue comfort/informativeness/recognisability/redundancyを分け、focus/call/shared room/rest contextに応じて人がpause/offできるreversible choiceを提示すること。Task cohort別にcomfort/control/task performance/speech interference/annoyance/startle/unwanted activationを測る。Ambient notificationが24-person cooking studyでleast disruptiveとなった結果を普遍的modality rankingにしない。User preferenceをcamera/micから推定しない。StudiesはGTA VI/Mini device evaluationでなく、feature/metric/threshold/acceptanceを変えない。

## Shared-room outputと個別user/job privacyを分離（2026-10-17 / MAT18、Security）

[GTA VI調査§62](../gta-reality-bridge.md#62-追加調査shared-roomのstatus-soundはowner権限と同居人privacyを分ける2026-10-17--mat18securityrq14)はUSENIX Securityの7-household/1-month smart-home field studyと、10 cohabitants + 9 visitors smart-speaker privacy interviewsを確認。MAT18 candidateはroom outputをgeneric statusに留め、個人のjob name/model/budget/approver/private inputをshared speaker/displayへ出さず、device admin authority, each occupant's task/privacy scope, visitor/bystander consentを分ける。Presence/voice/context inference alone cannot authorize action or disclosure. Studies are small/contextual, not Mini readiness/household policy proof; no sensor, permission or acceptance change.

## 追加調査：空間操作はtangible/free-hand/controllerの優劣を比較で確かめる（2026-10-17 / MAT04、MAT18）

[GTA VI調査§66](../gta-reality-bridge.md#66-追加調査spatial-inputの手ぶらが自然とtangibleなら良いを測定で分解する2026-10-17--mat18mat04参照)は、100人のcontrolled VR trainingでcontrollerがfree-handより良好、tangible surrogateがfree-handを改善したものの手法間の1週後knowledge test差は有意でないという比較と、30人製造協働navigation studyでportable mini-mapが多数のworkload/spatial metricsに影響する一方、tangibility単独では主効果なしという結果を確認。Mini候補実験はtangible hand interaction/controller-or-desktop fallback/visible tactile surrogate/moveable workspaceを同じ作業で比較し、tracking error, task correction/recovery, orientation accuracy, task performance, mental/physical demand, fatigue, focus, view obstruction, preferenceを測る。研究domain/短時間prototypeには限界があり、Mini hardware/spec/acceptance gateは変更しない。

[GTA VI調査§67](../gta-reality-bridge.md#67-追加調査gestureは一律に避けず支援対象userと一緒に負担の少ない語彙を作る2026-10-17--mat18accessibility)は、MS-Dex利用者を対象とする2025 INTERACT post-printと2026 peer-reviewed studyを照合。後者はtablet challengeとgesture elicitationで各10人を募集し、fine finger coordination/extensive hand movementを減らす選好を報告する。MAT18は対象accessibility userとのco-design、gesture amplitude/precision adjustment、non-gesture alternative、state-preserving mode switchをpilot案として測る。Small condition-specific samples cannot support clinical/overall accessibility claims; no camera/mic preference inference, identifiable recording retention, hardware, requirements or acceptance change.

[GTA VI調査§68](../gta-reality-bridge.md#68-追加調査空間interactionの累積腕疲労は手位置負荷休憩条件を含めて測る2026-10-17--mat18mat04)は38人のUIST 2025 shoulder-fatigue model validation (0.5–2 kg object at elbow/wrist, 90-degree lab posture, Borg CR10/endurance) を確認。MAT18 evaluation candidateはsession duration, arm elevation/reach zone, prototype weight/location, task/time/error/recovery, self-reported effort/fatigue/comfort and rest opportunity as separate variables. Optional offline biomechanical modelling may compare layout/weight only with disclosed assumptions. No camera fatigue inference, EMG/medical collection, break prescription, safety/clinical claims, hardware or acceptance change.

[GTA VI調査§113、§125](../gta-reality-bridge.md#125-追加調査rockstarの現地調査とmilestone評価は小さく学び記録して次の焦点を決める例2026-10-18--avocado-pilot-zema-ai06) joins PS5-specific optional haptics with Rockstar's self-reported small-to-large field research and milestone review as inspiration for reversible interaction and evidence-driven pilot expansion. No Mini device, research schedule, haptic feature or acceptance gate changed.

[GTA VI調査§134](../gta-reality-bridge.md#134-追加調査assist-inputは共同操作として扱い独立した本人承認へ昇格させない2026-10-18--mat18securityrq14) records Sony's same-account assist-controller mode and the assist device's unavailable haptic/mic/custom-button functions. For AvocadoMini, keep helper input visibly distinct from a second identity or approver; external/share/spend/publish actions still use the owner's authenticated approval, with alternative cues when controller haptics are unavailable. This is a PS5 system analogy, not a GTA VI feature or completed Mini design.

[GTA VI調査§165](../gta-reality-bridge.md#165-追加調査creator向けaiは役割期待が割れるので提案の主導権と編集権を計測-2026-10-18-ai06-rq14) connects to the LLM boundary: the AI co-creation study found creators differ in whether they want an AI as friend/collaborator/student/manager and delete many proposals. If exploring Mini or other author tools, let the human select a bounded assistance role, inspect and individually undo changes, and evaluate usefulness by mode; model output remains proposal-only under current Broker authority/approval gates. This research does not modify MAT15/18 acceptance or AI capability states.

[GTA VI調査§165](../gta-reality-bridge.md#165-追加調査creator向けaiは役割期待が割れるので提案の主導権と編集権を計測-2026-10-18-ai06-rq14) includes a 185-participant mixed-initiative creative writing study that found preference differences by experience and a desire for “scrutability.” For AI06/Mini prototypes, make model-generated proposals and available evidence inspectable, separate user-initiated actions from suggested next steps, and measure learnability/control by user cohort. This does not loosen planner or action authorization gates and does not require exposing internal chain-of-thought.

[GTA VI調査§167](../gta-reality-bridge.md#167-追加調査contextual-aiは送信元ごとの選択と状態表示を測る-2026-10-18-ai06-mat18-privacy-boundary) is relevant to multi-device context passing: if a Mini task already has an explicit job-relevant file or service, test a visible source chip/preview with per-source off and no-context fallback. Do not activate location/camera/mic/screen sensing from a contextual-computing analogy; Mini and AI06 permission/acceptance gates are unchanged.


[GTA VI調査§173](../gta-reality-bridge.md#173-generative-ai-source-material-and-rockstar-agreement-scope) adds a source-ingestion gate for creative AI: identify whether material is a game asset/capture/account/virtual-item/UGC, user-authored independently, separately licensed, or public factual metadata/commentary; record governing agreement/version and explicit permission. Avoid treating Rockstar ToS, Creator PLA and mod guidance as the same scope or assuming permission. No AvocadoMini data source or training pipeline changed.

[GTA VI調査](../gta-reality-bridge.md) §§163–187 and §191 cross-checks AvocadoMini's existing [intent #995](../avocado-mini-r5/mini-intent-1000-ideas.md): connect only through a publicly exposed interface with explicit permission; do not invent an unavailable API. Rockstar's June 2026 pre-order notice describes the announced GTA VI launch as single-player on PS5/Xbox Series X|S; this research did not locate official GTA VI creator/API or third-party integration permission. This states the current launch scope, not a guarantee about all future Rockstar announcements. FiveM/RedM, GTAV Mission Creator, other games' UGC, and research papers are comparisons only. This reinforces the existing stop gate without changing intent #995, RQ14, bridge code, rights or acceptance.


### Eveの記憶とMiniの管理SI（2026-10-20 / OS10・SKY21）

本人が会話の永続保存・端末変更後の引継ぎ・過去発言の再利用とMiniの管理SI方向を明示。Webのowner別AES-GCM保存とHMAC索引、出典付きrecallは[共通詳細](../rockstaros-complete-design.md#eveの永続記憶とskyコミュニティーos10--sky212026-10-20)へ接続する。fingerprint/face原本は収集せず、WebAuthn/OS認証のtemplateと会話/健康データを分離。心拍等のsensor種・同意・保持・保護者権限は未指定/未実装。Web実装をMiniのsensor実在能力、臨床判断、本番復旧や物理合格へ換算しない。Sky community加入は個人会話・健康データ・支払/実行権を自動共有しない。


## 空間全体のComputer Use（2026-10-22・MAT15／OS10／WEB04）

[11項目の正本](../rockstaros-complete-design.md#mini-spatial-computer-use)。ROCKはscene/focus/権限/job/adapter接続、EXTERNALはsensor/光学/対象app、JOINTは同一実空間の一周、OWNERは撮影/共有/実行/費用を担当。reel未視聴。今回設計だけ、実装/物理受入なし。次は映像の正規取得と一つの対応app/surfaceで校正→対象選択→許可操作→実結果→保存/移設復旧を開発。既存OI/MP/AS gateの合格数は維持。


## 空間OSの設計開発入力（MAT15／OS10・2026-10-22）

[詳細正本](../avocado-mini-r5/spatial-computer-use-design.md)と未実装contractを作成。ROCKはspace/focus/Broker/既存job、EXTERNALは光学/sensor/BSP/app、JOINTはSC01〜10、OWNERは場所/同意/予算。仮定を再計算するコマンドは `python3 docs/avocado-mini-r5/spatial-design-calculations.py`、設計台帳は `npm run design:check`。renderは本文横のrender-spatial-design.pyで再生成。既存E0〜E3とOI/MP/ASを維持し、次はD/観察者と一appを決め光学と入力を実benchで測る。今回unit/full test、実機試験なし。


## Mini空間操作・分散表示の開発更新（2026-10-23・MAT15／OS10／WEB04）

合成ray→候補固定→host承認→local draft移動→実app読戻しを実装。sourceは `systems/rock-star-os/targets/avocado-mini/spatial/`、詳細は `docs/avocado-mini-r5/spatial-computer-use-design.md` 21〜25章。Nodeはprivate journalへ保存し、browser/MCP transportを偽記録しない。browser Labはbuild済み、実browser受入は接続エラーにより未実施。実sensor・光学・Eveとの一周・native起動は未接続。

本人承認で複数表示部も比較。Miniが本人/job/権限を管理し表示部は校正済み領域を担当。4/8/16台の有限姿勢モデルに未達が残り、全範囲表示は未解決。光学必要条件・部品envelopeの再計算は `python3 docs/avocado-mini-r5/factory-development/optical-layout.py --output work/mini-spatial-engineering`。工場用RFQは未送信の設計開発依頼で、製造CAD/製造releaseではない。既存料金・OI/MP/AS gateは変更なし。次は配置最適化、光学/低眩しさの実測、実sensor/BSP、完全配線/熱/保護pack設計。build/typecheckのみ実行、unit/full suite未実行。


## Mini分散光学・実入力adapterの更新（2026-10-23・MAT15／OS10／WEB04）

[空間設計正本](../avocado-mini-r5/spatial-computer-use-design.md)26〜28章を追加。3×3mサービス範囲は固定し4×4m設置も比較。仮1.2m角開口52台で24,336有限姿勢の必要条件は未達0だが、巨大・未実測・干渉未評価なので製品採用なし。連続全範囲/任意位置の空中表示は未解決。sensor-camera.mjsは既存smis画素契約と実カメラAPIを接続、実機未受入。display-coordinator.mjsはhost登録/校正/測定済み輝度/快適上限/health/frame承認とblackout要求を実装し、実表示adapter/通信/独立遮断は未接続。回路分割JSONとKiCad面積図を追加したが新しい配線済みmainboardではない。既存料金・本人/job経路を維持。次は設置制約と連続余裕付き探索、実光学/カメラ、native driverとengine選定、完全回路/PCB。実機/公開/購入なし。unit/full suite未実行。


## Mini少数表示部・実入力source・出力の詳細（2026-10-23・MAT15／OS10／WEB04）

[空間設計正本](../avocado-mini-r5/spatial-computer-use-design.md)29〜34章を追加。52個は必要最小数ではない。研究の3基AIRRは大型光学/多数発光moduleを含む設置装置で、Miniや低眩しさの合格へ転用しない。4/8/16基の仮追従開口にも有限姿勢の未達が残り、像位置も移るため固定CADの解ではない。少数全範囲の最終方式は未選定。

Linux V4L2 stereo_marker_observer.pyとprivate子process/OS readerを追加。実カメラAPIのsourceだが実機なし。marker観測、露光/精度unknown、操作適格falseを維持。source-preview.mjsでlocal draftから元画像を描くLabをbuild。通知の平面像、2D透視図、真の立体/任意位置像を分けた。像源未選定なので新しい量産回路/配線済みmainboardは未完成。料金・まぶしさ・本人/job/保存は維持。次は一光学cellと同じ実sensorで光路/精度/露光/快適性を測り、連続配置/最終回路へ進む。


## Mini光学/像源の型番選定と5V配線source（2026-10-23・MAT15／OS10／WEB04）

E0はASKA3D-200NT＋Waveshare 5.5inch HDMI AMOLED/SKU16103＋D405を選定、CM5参照hostを再利用。少数全範囲の最終部品ではない。実部品寸法/45度仮光路の24,336姿勢で1/2/4cellの未達22,256/20,176/16,568、四枚案を全範囲として不採用。E1の立体像源候補はLooking Glass Go＋拡大LeAIRRで、中継適合・lens型番・視域・glare未受入。selected-cell.jsonとselected-cell-model.pyへ保存。

D405固有のSDK2.56.5取得sourceとprivate子process/OS readerを追加。実機なし、点観測だけ、位置誤差/時計対応不明、操作適格false。TPS22965DSGRの5V評価回路/28×23mm配線含むKiCad sourceを追加したが、ERC/DRC/DFM・実板未受入、dummy loadのみ。current limit/reverse isolation/watchdog/独立光学停止/HDMI回り込みは未対応。新しい最終Mini回路・配線済みmainboard完成ではない。料金維持、購入/公開なし。次は実光学/像源の光と停止、D405精度、E1光路を測り、全範囲と最終回路を閉じる。新共通ロゴをPDFへ参照。

### E1 Looking Glass Go + 拡大LeAIRR

章40〜43 / e1-leairr-prescription.json / e1-leairr-model.pyを参照。FRLN-300S-300PとFRLN-300S-150Pはcatalog候補、BSは400×300mm特注要求・stock品番未選定、RF-ACは切出し未確定。横倍率2・BSから像450mm。開口計算は限定水平断面で実eyebox/全範囲の証拠ではない。Goはメーカー5V3A経路を検討し2A couponへ無検証接続しない。leairr-prewarp.mjsは計画sourceのみ。Bridge/実sensor/独立停止と光学の受入後に最終回路とPCBを閉じる。料金維持、製造リリースなし。

### E1両眼の再追跡とGo/D405 host source

章44〜46、e1-binocular-layout.py、spatial/GO-D405.md参照。3×3m/507位置の小立体必要条件でも少数全範囲に未達。大開口/低倍率を完成方式として採用しない。Goのscalar観測とD405点を同じ校正/placeへ束ねる限定host sourceを追加。SDK/実機/画素出力/空間tap/低眩しさ未受入。Goの自律再生/逆給電を含む独立停止と光学が未確定のため、最終net/配線PCB/製造releaseへ進めた記録はしない。既存料金を維持。

### Mini参考2動画と板・膜なしの接続開発

本人は像の場所に板/膜を置かない条件を確定。動画再生から見え方と手→scene反応を採用し、光学/型番/低眩しさは未推定。hand_landmark_observer.pyとhand-preview/hostを追加、既存一時下書きにrevision/読戻しでつなぐsourceだが実行未受入。free-space-exit-bound.pyで4側面/理想操舵でも有限出口による未達を記録。hardware/reference-interface-map.jsonへPico2接点/LEDとGo active adapter参照を記録、routing変更/最終Mini基板/光学停止の合格なし。章47〜50とHAND-PREVIEW.md参照。既存料金維持。

### Mini上下6面とCM接続

章48/51参照。optical-exits.mjs/calculate-six-exits.mjsを追加。上下付き6面全体80㎡で有限組0未達、10mm guardで708未達という理想幾何であり、少数小型head/Go/低glareの採用解ではない。CMは受入体験へ対応づけ、40mm収納は未実証。光学/像源/独立停止/実hand/引継ぎと最終回路/配線PCBは未完成、料金維持。
