# avocadoMini R5 — 建築・インテリア埋込、着脱、携帯通信

2026-10-15 / MAT15・MAT18 / RQ48・RQ49。利用者が画像とともに「建築物やインテリアに埋め込み、取り外し可能で、衛星から通信を受け取り、持ち運び可能なWi-Fiにもなる」と明示したため追加する。画像の円筒と天井ドック、手で取り外す使い方を意図の根拠とする。画像内の寸法、材質、カメラ数、構造強度、通信性能は確定値にしない。

## 既製デバイスを参照する方法（2026-10-21）

利用者は壁から外したNest Thermostatの実物写真を示し、「こんなデバイスたくさんあるから参考にして」と明示した。既製品は**暮らしへの収まり方・取り外し・給電・手入れ・状態の伝え方**の比較対象にする。各製品の形や寸法、電池寿命、認証をavocadoMiniの成立証拠や確定部品にしない。Miniは同じ可搬coreへ空間出力、本人性、仕事の保存、通信を載せるため、参照点ごとに同一閉箱で再検証する。

| 公式資料で確認した製品 | 借りる設計の問い | Miniでは別に証明すること |
| --- | --- | --- |
| [Google Nest Thermostat](https://store.google.com/product/nest_thermostat_specs?hl=en-US) | 壁側baseと表示本体、化粧plateを分け、既存壁面との納まりを考える。2本のAAAはHVAC配線に対するbackup。 | Miniの可搬中の主電源、通信、空間表示はAAA backupから推定しない。壁に残るdockと持ち出すcoreの責任を分ける。 |
| [Google Nest Cam（battery）](https://support.google.com/googlehome/answer/10919314?hl=en-A) | 磁気mountと別の落下防止loop、壁・卓上の取付手順、充電のための取り外しを比較する。 | Miniの天井・軒裏では磁石だけを保持に使わず、二段階解除、二次保持、荷重・振動・挿抜寿命を実測する。 |
| [Netatmo Smart Thermostat](https://static.netatmo.com/therm/manual3_en-US.pdf) | 同一表示器の壁設置とmobile stand、遠隔のrelay、電池交換の保守導線を比較する。 | Miniを移した時は場所の校正・設備権限を持ち越さない。衛星・Wi-Fi・表示を外部relayに預けて単体合格にしない。 |
| [Sonos Move 2](https://www.sonos.com/en-us/guides/move2) | 充電baseに置く／持ち上げる動作、接点の着座表示、携行中の通信mode、hardwareのmicrophone switchを比較する。 | Miniはdockへの戻し方、給電切替、仕事の継続、センサーの物理停止と状態表示を一件で測る。大きなspeakerの電池・質量をMiniへ転用しない。 |
| [tado° Smart Radiator Thermostat X](https://help.tado.com/en/articles/8899433-how-can-i-charge-my-smart-radiator-thermostat-x) | 本体を外さずに電池packだけ取り出して充電できる保守単位を比較する。 | Miniのpack交換を候補にする場合、封止、誤挿入、充電接点、鍵とjobの保存、通話中の安全停止まで再設計する。 |

### 追加で調べた15件（計20件の製品・技術例、2026-10-21）

Nestと似た外観だけで絞らず、**建築への固定→持ち出し→別の場所で使う→戻す**という一周の各工程を持つ製品を追加した。以下は各メーカーの製品ページ、取扱説明書、サポート資料で確認できる事実から引いた比較であり、Miniの採用部品や達成性能ではない。

| 領域・公式資料 | 確認できる仕組みとMiniへの問い | Miniへ転用できない範囲 |
| --- | --- | --- |
| 取付: [Nest Doorbell（battery）](https://store.google.com/jp/product/nest_doorbell_battery_specs?hl=ja) | 壁側baseplate、専用の取り外しtool、充電池と既設配線の両給電経路。Miniも通常の着脱と無断取り外し対策を別に設計する。 | doorbellは外して通話・通信を持ち歩く製品ではない。 |
| 取付: [GoPro Magnetic Latch Mount](https://gopro.com/en/us/shop/mounts-accessories/latch-mount-magnetic-max2/AEMAG-003.html) | 磁石を位置合わせに使い、荷重保持は自動係合のdual latch、pinchで解除。Miniのdock装着時の手応え・誤解除を比較する。 | GoPro自身は高衝撃・高振動には別の固定方式を推奨。天井Miniの保持合格には直結しない。 |
| 分離core: [Insta360 GO 3S](https://res.insta360.com/static/57270093c02e2441e539cb20e3bff0d3/GO%203S_UserManual_EN.pdf) | 小型cameraをAction Podから抜いて単体撮影し、Podは操作・preview・充電を担う。Miniはdockを離れても同じjob/本人/通信能力を維持できるかを問う。 | [単体約38分・Pod内約140分](https://onlinemanual.insta360.com/go3s/en-us/faq/specs/battery)は限定した1080p撮影条件。MiniのGPU・衛星・空間出力の電力見積には使えない。 |
| 携行照明: [Philips Hue Go table lamp](https://www.philips-hue.com/ja-jp/p/hue-white-and-color-ambiance-hue-go-portable-table-lamp/8719514404656) | 充電baseから持ち出し、Bridgeから離れた場所でBluetooth制御へ切替。本体buttonと手で持つgripも参考。 | 光は空間を照らすためのもので、建築像を結像しない。Bluetoothへの切替はMiniのInternet WAN継続ではない。 |
| Game: [Nintendo Switchの3 mode](https://www.nintendo.com/au/support/articles/play-mode-overview/) | dockのTV mode、卓上mode、携帯modeを同じ本体で切替える。MiniのGame・制作も出力先を変えて同一作品revisionを保てるかを問う。 | consoleとMiniでは表示光学、通信、本人性、熱設計が異なる。dock撤去だけで同一game session継続を保証しない。 |
| 投影: [Samsung The Freestyle 2nd Gen](https://www.samsung.com/uk/projectors/the-freestyle/the-freestyle-2nd-gen-sp-lff3claxxxu/) | 向きを変える携帯projectorに別売battery baseを足す構成。場所を変えた後の投影面・姿勢・電源を扱う。 | 公称最大3時間はその構成と条件の値。壁や天井への表面投影であり、空中の立体建築表示ではない。 |
| 建築光学: [Epson LightScene EV-110](https://epson.com/faq/SPT_V11HA22020~faq-000042b-ev115?faq_cat=faq-topFaqs) | 照明trackとfloor standの別設置profile。Miniも同じcoreを建築側へ納める場合、位置・向き・施工と画面校正を分ける。 | track取付は携行動作やbattery内蔵の証拠ではない。 |
| 空間入力: [Sony Xperia Touch](https://www.sony.com/electronics/support/other-products-xperia-smart-devices/xperia-touch/specifications) | IRで投影面の10点touchとgestureを拾う、OS・projector・sensorの一体例。Miniの入力遅延/誤操作の比較台本に使う。 | 表面に投影した像を触る方式で、何もない空間への裸眼立体像や空中tapの証明ではない。 |
| 共同視覚: [Looking Glass Go](https://checkout.lookingglassfactory.com/products/looking-glass-go) | 約6インチのlight-field画面で複数視点を見せる。Miniの「数人が同じsceneを見る」比較に、視野角・位置・奥行の測定を入れる。 | 像は画面の光学系に依存し、部屋全体に浮く建築像ではない。本体batteryはなく、携行には外部packが必要。 |
| 非接触入力: [Nest Hub第2世代](https://support.google.com/googlehome/answer/10388741?hl=en-419) | Soli radarの手振りgestureをcameraなしで検出。Miniは通知dismiss等の軽い操作と本人承認を分離する。 | 手の動きの検出は生体認証でも空間tapの座標特定でもない。 |
| 手tracking: [Ultraleap Leap Motion Controller 2](https://www.ultraleap.com/datasheets/leap-motion-controller-2-datasheet_issue13.pdf) | 近赤外のhand/finger tracking専用module。Miniの入力範囲、遮蔽、二人の手の混同をbenchで問う。 | sensor単体は映像を表示せず、本人認証や他の空間参加者の位置合わせも成立させない。 |
| 本人認証: [Apple Face ID](https://support.apple.com/en-us/102381) | 深度・IR像を保護領域で照合し、appへは成功可否のみ渡す境界。Miniも生体のraw dataとEve/jobを分ける。 | 近距離のiPhone/iPad認証方式であり、部屋の遠方から誰でも認識する設計へそのまま拡張できない。 |
| 衛星Wi-Fi: [Iridium GO! exec](https://www.iridium.com/products/iridium-go-exec-portable-wireless-access-device) | 電池・衛星IP・Wi-Fi AP・画面・speaker/mic・利用量管理を一体化した実在例。Miniの携行modeで接続/課金/遮蔽を別表示する。 | 203×203×25mm・1.2kgでMiniの細径可搬coreにそのまま収まらない。Certus 100の公称最大88kbpsは一般的なcloud game通信と同等ではない。 |
| 携帯Wi-Fi: [NETGEAR Nighthawk M6 Pro](https://www.downloads.netgear.com/files/GDC/MR6500/ATT_MR6500_QSG_EN.pdf) | battery、SIM、touchscreen、外部antenna、Ethernet、USB-Cを携帯hotspotに組む。MiniのWAN/LAN/電源/利用量を独立状態にする参考。 | 上流は携帯網であり、直接衛星通信の部品や契約の証拠ではない。 |
| 衛星message: [Garmin inReach Messenger Plus](https://www.garmin.com/en-US/p/pn/010-02887-00/) | 圏外でのsatellite messageという限定能力を扱う。Miniも短文/SOS、voice/photo、一般IP共有を別機能名にする。 | Garminのphoto/voice messageには対応smartphoneのMessenger appが必要。Miniの携帯不要・一般Internet共有の成立例にはしない。 |

### Miniの核心に近い追加11件（計31件、2026-10-21）

二度目の「もっともっと参考になるもの」の指摘を受け、件数よりも**空中像と空中操作の結合、壁からの持ち出し、携帯なしの連絡、サービス終了時の復旧**に近い例を選んだ。既存のASKA3D単体plate調査は[部品判定](factory-development/component-verdicts.md)と[発明設計](product-invention-r1.md)に残し、ここでは重複計上しない。

| 優先・公式資料 | Miniへ移す設計の問い | 実際の限界／受入への使い方 |
| --- | --- | --- |
| A: [Holo Industries Holographic Touch](https://www.holoind.com/wp-content/uploads/2021/12/HOLO_IntergratedSolutions-dr-Online.pdf)／[7インチ評価機（2020）](https://www.holoind.com/wp-content/uploads/2020/06/Restaurant-Holographic-Demo-Data-Sheets.pdf) | 空中像、空中の2点入力、計算機、speaker、筐体を組み合わせた7インチ評価機。Miniの空中着信で表示座標と指の座標を合わせる比較台本に使う。 | メーカーの2020年評価資料では外形約9×8×4.5インチ、12/24V給電、独立した通信・生体・衛星はなく、空中像は平面の操作像で原寸建築の体積表示ではない。現行購入可否や計測値を確認せず採用部品にしない。 |
| A: [Ultraleap TouchFree](https://docs.ultraleap.com/TouchFree/touchless-interfaces/interactions.html) | AirPush、仮想Touch Plane、Hover & Holdの三方式を比較し、空間tapの誤発火・手の震え・取消・習得時間を測る。 | 手trackingを画面cursorと操作eventにするソフトで、空中像も本人認証も生成しない。 |
| A: [Voxel Photonics VX2](https://voxel3d.co/) | 複数方向から見える体積像で、縮尺建築模型を共同で確認する時の視点・遮蔽・解像度の比較対象。 | 現行案内の表示体積は直径25cm×高さ25cmでWindows 11 PCを要する。Miniの200mm単体や安全な手の侵入を証明しない。 |
| A: [Sony Spatial Reality Display](https://www.sony.com/electronics/support/articles/00253023) | 顔・視線位置が変わったとき像を更新する方式を、Miniの一人視点と複数人共有の差の説明に使う。 | メーカーのQ&Aでは顔が検出できないと画面が黒くなる。視点追従の一人用3Dを、全員が同じ場所の建築を裸眼で見られる根拠にしない。 |
| B: [Bang & Olufsen Beosound Level](https://support.bang-olufsen.com/hc/en-us/articles/360055534672-How-can-I-charge-my-Beosound-Level) | 持ち出せるWi-Fi speakerを壁側bracketに戻して充電し、USB-Cでも給電。Miniの壁・家具dockで挿抜と充電を一動作にする。 | 音声機器の質量・電池・無線をMiniの光学/衛星同居へ転用しない。壁bracketの施工・落下強度はMini用に測る。 |
| B: [DJI Action 2](https://www.dji.com/support/product/dji-action-2) | 小型cameraへ磁気lock式power module／前面画面を足すと機能と稼働時間が変わる。Miniもdock装着／携行ごとのcapabilityと電源状態を明示する。 | DJIの説明ではpower／screen moduleを付けた状態は単体cameraと同じ防水性ではない。Miniも連結後の封止・熱・安全を構成ごとに判定する。 |
| B: [Meta Portal Go（2021年発表）](https://about.fb.com/news/2021/09/introducing-two-new-portals-including-first-portable-version/) | batteryと持ち手を持つ10インチvideo call機を部屋間で運ぶ体験。Miniの「携帯を手に持たず通話」を住まい内でどう運ぶか比較する。 | 当時の発表資料であり、現在の販売・サービス継続を保証しない。携行は部屋間で、衛星Wi-Fiや空中表示ではない。 |
| B: [Amazon Echo Show 8の通話／camera設定](https://digprjsurvey.amazon.com/csad/help/node/TNbkumeinxKMvIRvJ0) | 本体からの音声/video通話、許可した相手のDrop In、cameraを切った時の機能差、Visual IDを通話権限と分けて整理する。 | 据置・家庭Wi-Fi型。相手の事前許可、camera状態、本人の応答が必要な場面をMini独自の通話契約に再設計する。 |
| A: [Garmin fēnix 8 Pro接続条件](https://www.garmin.com/en-US/connectivity/smartwatches/fenix-8-pro/feature-requirements/) | phoneを持たずLTEでMessenger音声通話、衛星で双方向message/SOS。Miniでも電話番号・相手app・契約・回線ごとの「できること」を分ける。 | GarminはLTE-Mで通常の電話番号/SMSを提供せず、衛星ではvoice call不可。初期のMessenger設定にはphoneが必要。衛星message成功を衛星一般IP/Wi-Fi APへ転用しない。 |
| A: [Starlink Mini仕様](https://starlink.com/public-files/specification_sheet_mini.pdf)／[設置手順](https://www.starlink.com/public-files/installation_guide_mini_kit.pdf) | 衛星antennaとWi-Fi routerを同一の持ち運べる筐体に組んだ実在例。Miniの「衛星を受けてWi-Fiを出す」をantenna・上空視界・給電・契約・Wi-Fi APの一つの通信経路として試験する。 | 約298.5×259×38.5mm、1.10kg、平均25–40Wで上空の見通しが必要。ポケットに入れたcoreや屋内の壁dockで直接衛星WANが使える根拠にはならず、Miniの200mm筐体・電池・熱・遮蔽・米国契約を別に成立させる必要がある。 |
| A: [Humane Ai Pinのサービス終了通知](https://support.humane.com/hc/en-us/articles/34374173951373-Important-Update-for-Consumer-Ai-Pin-Customers) | 携帯に代わるAI端末がcloud終了時に通話・message・AI・保存データを失う実例。Miniではjob export、別端末からの復旧、サービス停止時の機能表を販売前に決める。 | 歴史的な失敗例であり、Miniで同じ結果になる予測ではない。身に付けるlaser表示の[操作説明](https://support.humane.com/hc/en-us/articles/23461297087373-Learn-to-use-Laser-Ink)は手の表面投影で、何もない空間の表示ではない。 |

優先順位は、**P1a空中着信像と操作**にHolo Industries／TouchFreeを比較rig、**P0建築着脱と電源**にBeosound Level／DJI Action 2を形状・封止比較、**P1b直接衛星IP→Wi-Fi AP**にStarlink Miniを寸法・電力・上空視界の比較、**OI03/OI07携帯不要の連絡**にGarmin／Echo Showをサービス能力比較、**AS共同建築**にVoxel Photonics／Sonyを成立範囲の反証として使う。Humaneの事例はOS／Eveの保存・復旧・export gateを具体化する。これらは選定・提携・購入の決定ではなく、同一Mini試作機で何を測るかを明確にするための参照。

この追加比較で機構・体験の候補は増えたが、**31件の既存例の機能を足してMini一台が成立したとは言えない**。次の設計レビューでは①場所へ固定する方式（magnet、latch、工具、二次保持）、②離しても動く機能（owner/job、電池、通信）、③表示の種類（表面投影、light-field画面、空中像）、④入力と本人認証の別系統、⑤上流回線ごとの帯域/料金を一枚の能力表で照合する。どの方式も同じ寸法・熱・電力・安全の閉箱に入るかは未実測。

この参照から最初に採る設計判断は、**建築側dockは交換可能な機械・給電・場所情報の部品、Mini coreは本人の仕事と携行能力を保持する部品**という分界。着脱時は持ち手、指の逃げ、落下防止、空dockの接点保護、充電成功表示、再装着時の場所権限の再取得を一続きの操作として描く。壁・家具・天井は設置高さと失敗時の危険が違うため、同じlatchの合格を流用しない。参照元の制御対象であるHVACやcameraの権限を、Miniの家全体の制御権限へ自動拡張しない。

設計を進める順は、①Nest型の壁面一体感とSonos型の置くだけ再充電を含む実寸dummy、②Nest Cam型の二次保持を含む壁／卓上／頭上の独立mechanical test、③着脱中の給電・権限・job復旧、④光学・RF・電池と同一200mm閉箱、⑤建築専門家による施工・撤去・保守の検収。既存DP01〜05、OI01〜07、AS01〜06の合格条件は維持する。公式公開資料を読んだ段階で、Miniの部品選定・試作・製造・他社機器との連動が完了したとは扱わない。

## 製品定義とR5からの変更

**建築・家具に納まる着脱式のRockstarOS端末。設置中は空間のゲーム・Agent・通信node、取り外すと本人の仕事と接続を持ち出す携帯Wi-Fi端末になることを目標とする。** 円筒の可搬coreと、建築・家具側に残る固定dockに分ける。dockは給電・保持・任意の有線通信を担い、別演算Hubを必須にしない。Miniの1本自律と使用時200mm以内は維持する。dockの埋込深さ/穴径は施工寸法として別記し、外形制限から隠して除外しない。

従来R5の「外部給電必須・電池未採用」は、保存時点の仕様として原本packageに残す。最新要求では、ドック外で動作する電源を必須設計項目へ変更する。内蔵電池を第一比較案、着脱式電池を第二案として容量・重量・温度・保守を比較する。採用cell、充電回路、稼働時間、定格は未確定。まだ電池を採用/製造済みとは扱わない。

## 構成と利用体験

| 部分/場面 | 設計する機能と責任 |
| --- | --- |
| 建築・家具側dock | 機械保持、給電、挿抜検出、放熱経路、交換可能な接点。任意のEthernet等。構造材/防火区画への施工は建築側専門家が適合判断 |
| 持ち出すMini core | OS、本人鍵/利用権、job journal、Wi-Fi AP、選定済みWAN adapter、電源管理。ゲームGPUと通信処理の資源を分ける |
| 設置中 | 空間向け権限と本人向け権限を分離。部屋の設定、ゲーム、Agent、回線状態を表示し充電 |
| 取り外し | 正規の解除操作→保持解除→携帯mode。持ち出すownerを確認。設置場所の機器制御権限は失効/再評価 |
| 持ち出し中 | 本人がhotspotを有効化し、接続端末/回線/電池/使用量を確認。WANがなければlocal Wi-Fiのみと表示 |
| 再装着 | dock識別・保持・接点・温度確認→給電→場所の権限を再取得。差すだけで他人の家/アカウントへ自動移行しない |

天井dockには二段階解除と脱落防止を設計し、磁石だけで頭上保持を成立扱いにしない。未装着dockの接点は保護し、挿抜時に通電接点へ触れにくい構造とする。家具収納時も吸排気/熱拡散を塞がない。画像は具体的な固定方法・施工許可ではなく、機構詳細は荷重/振動/挿抜寿命の試験後に決める。

## 衛星WANとWi-Fi LANを分ける

Wi-Fi APは近くの端末への接続、衛星は上流WAN候補。インターネット共有には衛星の受信だけでなく上り通信、対応modem/antenna、回線契約、利用地域と共有可能なサービスが必要。衛星検出、回線登録、IP到達、Internet疎通、接続端末での通信成功を別状態にする。

| 通信経路 | 位置付け | 成立確認 |
| --- | --- | --- |
| 建築の固定WAN→dock→Mini→Wi-Fi | 設置中の比較経路。固定WANには屋外衛星terminalも含められる | 施工、給電、有線接続、WAN疎通。屋外terminalは通信設備であり演算Hubではない |
| 衛星→Mini内modem/antenna→Wi-Fi | 利用者が望む携帯時の直接衛星通信。製品研究目標 | 200mm筐体/電池/熱への収容、対応網、屋外の見通し、帯域/遅延、IP/テザリング可否を同一機で実測 |
| 衛星→可搬外部terminal→Mini→Wi-Fi | 直接内蔵が成立するまでの比較用fallback | 別装備・別電源が必要と表示。Mini単独衛星対応の合格にはしない |
| 携帯回線/許可したWi-Fi→Mini→Wi-Fi | 利用者が選べる代替WAN候補 | SIM/eSIMの利用権と端末modem対応、AP/client同時動作、回線切替の実測 |

小型NTNの短文送受信対応と、任意のWebゲーム/Cloud Agentを利用できるIP通信は同じではない。狭帯域しか成立しない場合は、その能力のみ表示し「衛星インターネットWi-Fi」としない。建物の屋根・金属・コンクリート等による遮蔽を考慮し、天井に埋め込んだ状態で直接衛星受信できるとは保証しない。内蔵antennaの非金属RF window、向き、手で覆った場合を比較し、遮蔽時は窓際/屋外案内または別WANへ明示切替する。

公式比較資料: [Starlink Mini仕様](https://www.starlink.com/public-files/specification_sheet_mini.pdf)は298.5×259×38.5mm、平均25〜40W。これは比較用の別製品であり、そのままR5の200mm円筒内に収まる根拠ではない。[公式設置案内](https://starlink.com/mz/support/article/2ac9f147-2938-d97b-5a39-bd1fc7f6fa10)は空の見通しを要求する。[GSMAのD2D能力分析](https://www.gsmaintelligence.com/research/the-limits-of-d2d)も基本的なmobile serviceの拡張と能力上限を扱う。2026-10-15確認。これらの参照はProvider採用や提携・契約を意味しない。

## OS・仕事・回線共有

接続契約はownerRef、deviceRef、dockRef、attachmentState、powerSource、WAN種別、capability、許可された共有端末、使用量上限、permission revisionを持つ設計とする。秘密値や回線資格情報をゲームへ渡さない。SSID/接続鍵は端末固有、初期共有はOFF。招待/解除、guest分離、管理面のアクセス制限を設ける。本人のSky/Zema領域と来客hotspotを分離する。

場所を離れても本人の同一job ID/版を維持する。施設の権限・回線・センサー閲覧は本人の仕事保存とは分け、取り外し後は場所scopeを失効する。衛星へ切り替わってもAgentの費用上限・通信予算を引き継ぎ、ゲームやmodelの大容量downloadを無断再開しない。回線切替でTCPやゲームsessionが維持できるとは保証せず、jobの再送一意性と結果照会で復旧する。

## 電源・縮退・復旧

稼働時間は `電池Wh × 利用可能率 × 変換効率 / 平均W` で見積り、衛星探索/送信peak、Wi-Fi AP、GPU、センサー、表示、温度と劣化を別に計測する。数値未確定のまま連続使用時間を表示しない。携帯hotspot modeでは不要な空間表示・高負荷GPU・生成処理を抑え、ゲーム同時実行modeを別測定する。

着脱時の電源切替はjournal書込を保護し、電池低下は新しい高負荷jobを止め、保存・通知・安全停止を優先する。熱異常、接点異常、battery faultは充電/出力を止め、クラウド応答待ちにしない。Wi-Fi LANのみ、WANなし、衛星探索中、上限到達、充電不可を別表示する。発熱や電源容量を補うために寸法を変える必要がある場合、R5要求変更として理由を記録して判断する。

## 受入と未確定事項

主担当MAT15（JOINT）、建築/空間pilot MAT18、通信adapterはROCKとProviderの共同受入。現状は設計のみ、全試験NOT_RUN。

- DP01: 壁/天井/家具の設置profileごとに保持、二段階解除、落下防止、接点保護、挿抜寿命、保守交換。試験荷重/回数は質量と施工条件の固定後に決める。
- DP02: 装着/携帯/再装着で電源切替、仕事保存、scope失効、通信切断/再接続、重複job防止。
- DP03: 衛星の登録→IP疎通→Wi-Fi client通信を同一profileで検証。短文通信だけの合格を転用しない。屋内遮蔽/屋外/携行姿勢/移動条件を区別。
- DP04: hotspot単独とgame+hotspot同時に稼働時間、熱、速度、遅延、packet lossを記録。目標稼働時間/共有台数/速度は用途と予算確定後に固定。
- DP05: guestと管理面分離、未許可client拒否、紛失時の失効、再接続照合、通信上限停止。鍵をresetで再利用しない。

未決定は内蔵衛星方式/Provider、地域、共有可否、アンテナ寸法、battery容量/方式、hotspot台数、携帯時間、施工dock、RF/熱/電池安全の適合。外観・寸法・必要性能が同時に成立しない場合、外部terminal案と能力限定案の差を提示して決める。GTA VI、通貨/skin、衛星打上げ・購入・契約、製造/施工/公開の承認や完了を意味しない。


### Agent利用料の月次後払い（2026-10-15）

利用者指示により、Agent利用を契約accountごとに毎月まとめて請求する方向へ更新。[請求・未払い対応設計](../sky-billing.md)で単価/見積/上限、usage照合、支払方法、通知/猶予/有料実行制限/入金復旧/適法な回収を定義。通信・端末・OS・Agentの明細は分ける。銀行口座をOSが直接凍結する権限は持たせない。後払い与信・Provider sandbox・実請求は未受入。
