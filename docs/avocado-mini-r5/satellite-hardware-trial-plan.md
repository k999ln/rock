# avocadoMini — 内蔵衛星回線の候補比較と実機試験準備

2026-10-25 / MAT15・M1・ROCK。MINI-08の共通制御に続く設計・試験準備。候補採用、購入、契約、無線送信、実機合格の記録ではない。2026-10-25の本人回答により、最初の対象地域を日本と米国の両方、用途をsi・メッセージ・小さなファイルに確定した。国ごとの提供範囲・認証・契約・同一機試験を分け、軽量si通信と一般Web共有を別能力として比較する。

## 到達したい構成と選定順

`内蔵電池 → Mini Linux/Broker → Wi-Fi AP → 許可した端末` に `内蔵modem＋antenna → 衛星網` を接続する。ドック・携帯電話・外付け衛星terminalを必須にしない。使用時全高200mm以内を維持する。原本のD30軸・D96台座は比較寸法であり確定径ではない。固定原本packageは変更しない。板・膜なし、少ない表示部、上下を含む全範囲、低眩しさは別の光学受入として維持する。通信試験の合格で光学研究gateを開けない。

最初は **9704のIMTとBG95-S5等のNB-NTNを、小容量の非同期si通信向けに優先比較する**。これは本人の初期用途選択に基づく順序変更で、modem/Provider採用の決定ではない。9770は一般IPが必要な処理・将来のWeb共有の比較候補として保持する。軽量通信だけの合格を一般インターネット共有の完成とは呼ばない。高速動画までを200mm円筒に収める成立根拠は今回得られていない。

## 初期用途と日本・米国の受入

Wi-Fi端末からMiniへsi要求・短文・小ファイルを渡し、Miniが保存・予算予約・非同期送信を行い、返答または配送状態を同じrequest IDで端末へ返す体験を先に成立させる。衛星接続中も本人認証・端末許可・通信量/料金上限は共通契約を維持する。一般Webの任意TCP転送、動画、大容量model/OS downloadは初期用途の合格対象に含めず、元の共有目標は後段へ残す。

- JP: 日本の試験場所、対象modem/antenna/firmware、現地で必要な適合、利用可能な契約・用途許諾、網側上限、JPY等の請求条件を一つのprofileで確認する。
- US: 米国の試験場所と州、対象構成の適合、網側/契約・用途許諾、上限とUSD等の請求条件を別profileで確認する。
- 一方の実機結果やProviderの広域coverage説明で他方を合格にしない。両国の結果が揃うまで「日米対応」を受入済みと表示しない。国別profileと契約を替える場合も、元のgrantを閉じて未確定予約を照合し、移動先の条件で本人が再許可する。国またぎの自動課金継続を前提にしない。

最初の無線なしfixture案はapplication payload 256byte / 1KiB / 16KiB。これはユーザー指定の上限や実網への送信許可ではなく、試験前に契約と予算に合わせて固定する比較点である。実転送は選定transportのpayload上限から認証/envelope分を引いて分割し、欠落・重複・順序逆転・再起動をrequest IDとchunk番号/全体digestで検出する。再送を無制限にせず回数・有効期限・byte/cost予約で止める。受信側認証・完全性確認、送達確認と処理成功の区別、offline queueの容量/TTLと失効時の破棄は[共通message adapter](../../systems/rock-star-os/targets/avocado-mini/tethering/MESSAGES.md)で無線なし実装・試験へ進めた。実modem/Providerへの接続と常駐運転は未受入。

## Modem候補

数値は2026-10-25閲覧の公開メーカー資料。部品単体寸法はcarrier基板・connector・電源・antenna・放熱を含まない。供給/firmware/価格/認証revisionは見積時に固定する。

| 候補 | 公開能力・寸法 | Miniでの位置付けと未解決 |
| --- | --- | --- |
| [Iridium Certus 9770](https://www.iridium.com/products/iridium-certus-9770) | IPデータ最大上り22/下り88 kbps、140×60×16mm、185g、12V±2.5V、passive omni antenna | 一般IPが必要な処理の後段比較候補。D30軸には幅60mmが入らない。径/配置は未決定、200mm全体に電池・演算・光学を収めるCADが必要。消費電力・送信peak・Linux側interfaceのOEM仕様を取得。一般Web/複数端末の契約可否は別確認 |
| [Iridium Certus 9704](https://www.iridium.com/products/iridium-certus-9704-module) | IMT message最大100KB、JSPR、31.5×42×3.8mm、12g（Web表記） | 軽量siの非同期メッセージ候補。任意IP routerではない。host bridge・再送一意性・cloud側配送が必要。製造図面revisionと電源peakを取り寄せるまで収納/電源を確定しない |
| [Quectel BG95-S5](https://www.quectel.com/product/bg95-s5-satellite-communication-module/) | Rel-17 NB-NTN B255/B256/B23、LTE-M/NB2/EGPRS/GNSS、23.6×19.9×2.2mm | 小型低データ量候補。選んだSIM・網・firmwareの実装能力で判定。地上LTE能力を衛星能力へ転用しない。UDP主体サービスではTCP/HTTPS一般共有を未受入とする |
| [Starlink Mini](https://www.starlink.com/public-files/specification_sheet_mini.pdf) | 298.5×259×38.5mm、平均25–40W（比較用別製品） | 外部terminalを用いた性能比較のみ。現仕様のまま200mm円筒内蔵の根拠にはならず、Mini単体の合格対象外 |

9770の最大88kbpsから計算すると、1MB=1,000,000byteの下りは理想条件でも約91秒、上り22kbpsでは約364秒。protocol overhead・再送・他端末共有は含まない。動画の快適性や継続速度を保証しない。

## Antenna候補と配置

| 候補 | 公開仕様 | 試験前の条件 |
| --- | --- | --- |
| [Taoglas CGIP.25.4.A.02](https://cdn.taoglas.com/datasheets/CGIP.25.4.A.02.pdf) | 25×25×4mm、5g、Iridium/GNSS、RHCP。Rev Jは70×70mm ground plane、最大入力2W | 内蔵patch比較。patch寸法だけで収納判定しない。70mm角の対角は約99mmでD96台座の比較寸法にもそのまま入らない。選定modemの送信peak・承認antenna条件との適合をメーカー確認するまで送信不可 |
| [Maxtena M1621HCT-EXT](https://www.iridium.com/products/m1621hct-ext-antenna) | H50×D33mm、52g、RHCP、1616–1626MHz（Iridium掲載） | helical形状の比較治具。掲載品は外部antennaであり、内蔵採用済みとしない。内蔵版の供給・認証、radome/ケーブル損失を確認。9770/9704への適合を周波数一致だけで推定しない |
| BG95-S5用NTN antenna | B255/B256/B23の送受信帯域と実運用網に合わせる | Iridium専用antennaを流用しない。Quectel EVB推奨品で初期比較し、内蔵品のpart number、gain、偏波、許容送信電力、ground/keep-outを供給元の適合表で確定する |

RF windowを筐体内に設ける。Wi-Fi/GNSS/衛星の同時動作、金属外装、電池、光学駆動部、dock、手の遮蔽を含めてS11だけでなく実効通信/再送/消費電力を測る。屋内天井埋込で直接衛星通信できるとは扱わない。空の見通し、姿勢、遮蔽を記録する。光学出口や上下観測域を塞いで通信だけを成立させない。

## 電池候補と見積

完成battery packは未選定。保護付きpackとセル単体を分けて比較する。セル行は保護回路・充電器・温度監視・絶縁・筐体を含まず、裸セルをそのまま装着する手順ではない。pack供給元に定格、保護、輸送/製品適合と試験資料を要求する。

| pack/セル候補 | メーカー公表値 | 比較上の意味 |
| --- | --- | --- |
| [RRC1130完成pack](https://www.rrc-ps.com/en/power-management/battery-connectors/products/RRC1130) | 1S1P、3.8V/3.81Ah、83.95±0.25×61.23±0.20×6.73±0.10mm、65g、連続3A、I²C、保護機能あり | 初期benchのpack候補。幅61mmでD30軸には入らない。充電0–45℃、専用充電条件とburst対応を確認。packの認証をMini完成品の適合へ転用しない。新規pack開発より準備項目を減らせるが、寸法/電源適合は未確定 |
| [Molicel INR-18650-P30B](https://www.molicel.com/wp-content/uploads/Product-Data-Sheet-of-INR-18650-P30B-80111-1.pdf) | 3.6V、typ10.8Wh/min10.4Wh、最大D18.6×H65.2mm、47g | 小径比較。1本では使用時間が短くなりやすい。製品ページとPDFに電流値の差があるため、実packの採用revisionと許容電流は供給元確認まで未確定 |
| [Molicel INR-21700-P50B](https://www.molicel.com/wp-content/uploads/Product-Data-Sheet-of-INR-21700-P50B-80122.pdf) | 3.6V、typ18.0Wh/min17.5Wh、最大D21.55×H70.15mm、71g（v1.1） | 容量比較。9770向け12V系への変換を含めたpeak電流・損失・発熱・brownout試験が必要 |

初期計算例は`minimum Wh × 0.8（利用可能率の仮定）× 0.9（変換効率の仮定）÷ 全体平均W`。P30B一セル相当は7.488Wh、P50B一セル相当は12.6Wh。仮に全体5Wなら約1.50/2.52時間、10Wなら0.75/1.26時間。**5W/10Wは測定値でも性能目標でもない**。表示・GPU・AP・衛星探索を含む実測で置き換える。直列/並列数、電池容量と稼働時間は未承認。充放電保護・低温充電・劣化・筐体温度をpack条件で制限する。セル資料の高温cutoffを人が持つ筐体の許容温度へ転用しない。

## 回線契約の比較と料金上限

| 窓口/候補 | 確認できたこと | 契約前に解消すること |
| --- | --- | --- |
| [Ground Control Certus 100](https://www.groundcontrol.com/products/iridium/iridium-certus-100-range/iridium-certus-100-plans/) | 公開例は1MB/月$35・開通$15・超過$15/MB、税別。原則12か月、早期解約費あり。IoT契約はM2M等に用途限定。利用量通知/自動無効化の説明あり | 一般Web共有の許諾を未取得。OEM9770/9704契約適合、日本/米国での利用、最小課金単位、上下方向/再送課金、停止遅延を見積確認。通知/自動無効化を原子的hard capとみなさない |
| [キュービック・アイ](https://www.cubic-i.co.jp/iridium/price.html) | 国内窓口候補。2026-04改定の機器表にCertus100端末とantennaあり | 掲載完成端末は内蔵modem採用ではない。現行Certus契約書・OEM対応・共有許可・国内認証・課金上限APIを確認。旧告知の料金を現在の契約価格に転記しない |
| [SORACOM planNT1/Skylo](https://docs.soracom.io/en/services/satellite) | BG95-S5等が候補。UDP推奨、最大UDP payload1200byte。SIMに追加subscription。米国などの地域記載あり | 日本の実試験場所の利用可否を別確認。一般TCP/HTTP共有を成立扱いにしない。料金は[料金表](https://soracom.jp/files/fee_schedule.pdf)で対象profileを確認し、基本/追加subscription/通信/停止中費用を分離。網側hard capと管理通信免除は未確認 |

価格・契約例は比較情報で採用見積ではない。通貨は換算して混ぜず、MB/KiB/課金block/最低session料/税/為替/activation/月額/解約料/si料金を独立保持する。一般共有を禁止するIoT契約で試験を開始しない。提供元へ連絡・契約はまだ行っていない。

MINI-08の`mini-network-quota/1`は共通試験契約で、上記providerの実APIとは異なる。実provider adapterを有効にする前に、期間とaccount全体のbyte/cost hard cap、請求対象の全direction/control traffic、同時予約、idempotent reserve/read/close、未確定予約保持、署名/認証、残高照合を対応表にする。網側の強制上限がないproviderでは、ローカルdropや遅延usage webhookだけで請求上限を保証できないため、現行の一般通信許可gateを開けない。fixed/prepaidも超過・自動更新・基本料・解約料を含む契約上の最大責任額を確認する。

料金照合/停止の管理通信を本当に免除できるか未確認。現制御はこの保証を前提にする。免除不可なら有限な管理通信予算を含む別設計と独立検収が必要で、条件を書き換えただけで既存adapterを接続しない。

## 実機試験の準備と順序

[記録テンプレート](physical-trial-template.json)は全項目NOT_RUN、未確定値null。これは台帳用であり実行許可や自動合否判定ではない。試験機・image/firmware・契約・測定器・予算・基準を同じrunへ固定する。公開Gitには鍵/IMSI/ICCID/serial/本人情報を保存せず、匿名参照とhashだけを記録する。

| 段階 | 準備/試験 | 合格条件と証拠 |
| --- | --- | --- |
| P0・購入前 | 日米/軽量si用途は本人選択済み。国別の場所/構成/契約、必要台数/速度/稼働時間、BOM・納期・予算、modem/interface、antenna承認、電池pack、試験場所を固定 | owner判断と専門側の適合根拠が揃う。未決定値があればRF/有料通信へ進まない |
| P1・無線なし | 寸法CAD、電源治具、電子負荷、電流波形/温度計測、隔離Linux試験を再現 | 最大包絡200mm、保護とbrownout/復旧、host55・Linux26の同一source証拠。実Wi-Fi/衛星成功には換算しない |
| P2・実Wi-Fi | 対応Linux AP無線、許可端末2台＋拒否端末1台（暫定試験構成）、WPA鍵、DHCP/DNS/RA/NAT/route、guest/admin分離 | 実handshake、失効/なりすまし/切断再接続、IPv4/6・双方traffic、端末別/合計上限をpacket capture/hostapd/ledgerで対応付ける。現共通コード以外のネットワーク統合は未実装 |
| P3・衛星bench | RF適合/契約/共有許可/有限budgetが揃った同一装置で登録→IPまたはmessage→端末まで試験 | 実IP共有と非同期messageを別結果にする。固定の小payloadから開始し、予算付きrunだけ実行。uplink/downlink双方とprovider記録を照合 |
| P4・課金/障害 | 網側cap直前・同時端末・ACK消失・provider断・modem再起動・Mini crash・期間境界 | cap超過許可0、古いgrant再開0、未確定予約を返金扱いしない。provider最終請求とledger一致/差異を記録。異常時はlocal/AP停止を先行しremote unknownを残す |
| P5・閉箱携帯 | dockを外し内蔵電池/antennaだけでP2–4再現。向き/手/歩行/遮蔽/低電池、hotspot単独と表示併用 | 同一閉箱・source・契約の通信/温度/電池/速度/遅延/再送を記録。4表示条件は独立した光学証拠で確認。外部給電や外部antennaを使ったrunは単体合格にしない |

台帳は測定窓、試行/成功数、上下application goodput、RTT p95とsample数、携帯稼働時間を記録する。停止要求の同じ起点からlocal nft/AP/providerの停止を別々に計測する。provider不明は`null + unknown`で残し、ACK受領だけを網側停止時刻にしない。再送/timeoutを成功率から隠さず、測定定義と元の匿名証拠を結ぶ。

温度・電圧・電流・停止遅延・最低稼働時間・通信成功率の数値は、採用部品と用途を固定して**試験前**に記録する。値がないrunを合格にしない。試験後に合格基準を緩めない。危険なbattery異常を意図的に作る試験は専門設備側へ分離する。

停止時は新規grant停止→local fence/AP停止→provider閉鎖照合→journal保存。通信不明でも予約を解放しない。電池/熱異常はremote応答を待たず電源保護を作動させ、回復後は本人の再許可と新しい観測を要求する。PCは記録機器として使えても、単体合格runで給電/経路/認証を肩代わりしない。

## 次の実装

機種を買う前に、選定候補の公式host interfaceとLinuxdriver、AP無線driver、課金/停止APIの仕様を取得して対応表を埋める。既存Broker/CASとSQLite予約を再利用し、DHCP/DNS/RA/NAT/route・modem状態監視・lease更新・provider実adapterを独立した変更にする。共通fixtureの合格を実網の証明へ転用しない。表示4条件、単体携帯、端末/通信量/料金上限のいずれかを満たせない候補は、未解決条件を残して再比較する。
