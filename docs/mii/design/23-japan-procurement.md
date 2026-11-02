# 23 日本での単体通信 — 調達判定とメーカー確認文

2026-11-02 / MAT15・MINI-08・NET01・SIM01・OS10 / 主担当ROCK。対象は[22章の可搬mii P3](22-integrated-radio.md)。共通OS・本人性・仕事・予算・保存の契約を変更しない。

**結論: 全部品の一括購入はHOLD。日本で衛星通信できる機器一式としての調達releaseには達していない。** 公開資料でサービス提供と代替品の端子は確認できたが、日本NTNの機器認証範囲・指定アンテナ・ホスト給電・最終端末の接続承認には原本回答が必要。未確認を「非対応」とも「適合済み」とも記録しない。Quectelは会社メールからの配信済み、Soracomは公式フォームの受付完了を確認し、2社の技術回答待ち。購入・契約・開通・無線送信は未実施。

## 1. 公開資料で更新できた判断

| 項目 | 今回確認したこと | 設計への反映 |
| --- | --- | --- |
| 日本のサービス | Soracomは日本のplanNT1提供を公表。ただし利用申込みは問い合わせ窓口経由、日本適合のR17 NTN機器が必要 | 「SIMを買って追加すればすぐ送れる」という手順にはしない。採用品・契約主体・料金・開通を別々に確認 |
| 動作中のmodem電源 | Skylo conformance §2.4.4にはdetach指令と本体動作中のmodem電源断の制限がある | Wi-Fiへ戻るたびにCFUN/電源断する旧P3制御を撤回。アプリ送信停止と網維持動作を分離 |
| LTE/衛星の切替 | 同§2.4.2は地上網優先、共用antennaは少なくとも10分ごとの再確認、メッセージ周期が長い場合は次回送信前の確認を要求 | SIM subscription切替も含む正式な制御手順が必要。アプリの排他経路だけで物理的な同時送信ゼロとみなさない |
| 完成端末 | Skyloのmodule承認と、最終deviceの適合・接続承認は別 | PiのWi-Fiと同じ筐体に入れた状態をR01で照合。GCF/PTCRB等の継承範囲も問い合わせる |
| Murata現選定品 | 1SC-005公開datasheet v1.1のNTN日本欄は空欄。旧2020年EVK manualにはUSB/外部5V入力の保護があるが、選定NTN kitと同一revisionと確認できない | 旧manualのCN番号・逆流保護回路を現kitへ転用しない。U01は未通電releaseのまま |
| Wi-Fi | Raspberry Pi公式compliance portalにPi4の日本証明書が掲載。WLAN country設定が必要 | 初号日本profileはJP・2.4GHz・20MHz・ch1〜11・BT OFFへ限定。技適表示/基板revision/純正RF firmwareを受領照合し、完成host適合とは分離 |
| 代替modem | Quectel BG770A-SNはSoracom設定guideの対象。TE-B manualは端子番号と5V範囲を公開 | 下表まで具体化。国内NTN認証・最大電流が未照合のためBOM自動置換はしない |
| 代替antenna | YECN028AAはSMA male、225×54.5×13mm。NTN帯の特性表あり | 型番だけは確定できるが、日本の認証で認められた組合せかは別。225mmなので現行200mm外形目標へ無条件搭載不可 |

根拠: [Soracom日本提供の告知](https://changelog.soracom.io/ja/wei-xing-tong-xin-sabisu-ntn-dui-ying-no-plannt1-gari-ben-demoli-yong-dekiruyouninarimasita-314ddm)、[2026年7月公式更新まとめ](https://blog.soracom.com/ja-jp/2026/07/14/soracom-biweekly-85/)、[Skylo device conformance §2.4／§3／§4](https://www.skylo.tech/knowledge-base/device-conformance-document)、[Soracom Murata/Quectel設定](https://docs.soracom.io/en/devices/murata-1sc)、[Murata旧EVK manual](https://www.murata.com/-/media/webrenewal/campaign/events/asean/2024/may24_webinar_satelite-ntn/type1sc_evk_user-guide.ashx?cvid=20240601114504000000&la=en-sg)。告知の表示相対日付を新しい発表日として転記しない。旧Soracom国一覧の「日本未提供」より日本の明示告知を優先する。

Wi-Fi根拠: [メーカーPi4日本証明書の掲載先](https://pip.raspberrypi.com/categories/547)、[WLAN country設定](https://www.raspberrypi.com/documentation/computers/configuration.html)。2.4GHz/ch1〜11への限定は本設計の初期運用範囲であり、国設定だけで認証を取得できるという意味ではない。公開証明書は画像PDFで本文/番号の読戻しが未完了のため、番号を推定記載しない。

## 2. 代替品の端子照合表（発注・通電指示ではない）

**候補Q: Quectel BG770A-SN-TE-B-KIT＋YECN028AA**。現P3のMurataを残したまま2台追加する案ではなく、R01〜04を閉じられた場合だけmodem一式を交換する候補。

| 部分 | 確認できた端子・仕様 | 採用時の差分／未確認 |
| --- | --- | --- |
| AT data | TE-B **J0301 USB-to-UART**、Main UART 115200/8N1。kitのUSB-A–Micro-Bを使用 | P3のMini-B cable/CP210x識別を流用しない。UART channel Aを現物列挙で確認 |
| 主RF | **J0502 ANT_RF、SMA** → **YECN028AA SMA male** | 日本で許可されたantenna型式/最大利得と一致することが必要 |
| SIM | **J0606 Micro-SIM、1.8V USIM** | plan01s標準3FFの電圧対応、planX1/NT1の対象firmwareをproviderに照合 |
| 電源 | **J0301/J0405 USB、J0201 DC入力: 4.75〜5.25V、標準5V** | 電圧は確認済み。最大/突入/列挙前電流、J0201寸法/極性、USB併用時の逆流保護は未確認 |
| 除外端子 | **J0202はmodule測定用VBAT**。manualの測定手順では3.3Vを与える | **5V/12.6VをJ0202へ入れない**。初号では未接続、module単独給電試験を組立手順へ転用しない |
| GNSS | **J0501 GNSS SMA** | 初号の独立BU-353N5を保持する候補。内蔵GNSSと外部位置の対応はfirmwareで照合。受信antennaが不要かも回答待ち |
| 基板 | 70×74mm（厚さ1.6mmはPCBのみ） | コネクタ/部品高さは別。現在の180×160mm配置へ保持具を改版する場合の図面待ち |
| antenna | YECN028AA v3.0、50Ω、線偏波。NTN表のpeak gain上限はfree-space 2.5dBi／130mm EVB 3.7dBi | これらは試験配置依存の値。販売ページの5.8dBiをNTN全帯の値にしない。日本の許容利得とは未照合 |

根拠: [メーカー作成TE-B User Guide v1.0.0 Preliminary 2024-07-30（正規流通掲載）§2–4](https://mc-technologies.com/wp-content/uploads/2024/09/Quectel_BG770A-SN_TE-B_User_Guide_V1.0.0_Preliminary_20240730-1.pdf)、[Skylo BG770A-SN kit guide](https://www.skylo.tech/skylo-ecosystem-get-started-article/getting-started-quectel-bg770a-sn)、[メーカーantenna製品](https://www.quectel.com/product/yecn028aa-5g-ntn-terminal-mount-antenna/)、[antenna datasheet v3.0 2026-01-05 §1–2](https://www.quectel.com/content/uploads/2026/03/Quectel_5G_Antenna_YECN028AA_Datasheet_V3.0.pdf)。Preliminary版を最終製造仕様としない。

```text
候補Qの照合用接続（点線部は未確定・通電禁止）
Pi USB2-A ...... kit A–Micro-B ...... TE-B J0301 UART
                                             J0502 SMA ─ YECN028AA
                                             J0606 ─ 3FF SIM
独立5V案 ...... J0201（寸法/極性/逆流防止 未回答）
J0202 VBAT / J0405 USB / J0501 GNSS: 本案では未接続、FW要件照合待ち
```

**日本認証の扱い**: BG770A-SNについて認証番号候補003-250340を検索で検出したが、製造元証明書と周波数範囲は未取得。総務省原本は閲覧制限で照合できなかった。検索index/転載を適合証拠には採用しない。確認文に番号を含め、メーカー発行原本でLTE側とNTN側を分離して回答を求める。

## 3. 買い直しを避ける発注順序

1. **先に2社へ仕様確認**。2社の回答を同じ比較票へ転記。国内NTN証明・許可antenna・給電図・接続資格のそろう候補を選ぶ。両方不足ならmodem一式は発注しない。
2. Pi/SD/GNSS/UPS/P28Aの型番は22章のまま。ただし本体完成を目的とする一括発注はmodem回答後。充電器は日本向けplug/入力定格・表示・指定optionの納入型番も照合する。
3. USB2の500mAを超える消費が必要なら、Piの合計1.2Aを根拠に直結しない。メーカーが指定する外部5V給電と逆流防止を採用し、**電源branch・保護・cable・netlist・受入値を改版してから**発注する。既存R04の1A割当は許可電流ではない。
4. YECN028AA採用なら収納/使用時の外形を実寸で再設計。200mm以内を維持するなら認証内の短い指定antennaを取得する。ANTを勝手に短縮しない。
5. 現物の無送信電源試験→許可条件内の単独radio試験→同居試験→PC/phone/LANなしの電池往復試験。実機合格は[22章P3-A01〜07](22-integrated-radio.md#8-組立試験の順序)に別記録する。

## 4. 問い合わせの実行状況

本人は本チャットで2社への技術問い合わせを明示承認済み。購入・契約・有料開通は承認範囲外。送信本文はGit外の `output/inquiries/mii-vendor-inquiries.md` に保存し、原稿・個人連絡先をGitへ入れない。

| 宛先 | 確認する内容 | 状況 |
| --- | --- | --- |
| [Soracom公式窓口](https://soracom.jp/contact/) | Murata/Quectelの日本NTN証明・band/fw/SIM、指定antenna、UART0電流/外部給電、Skylo維持/停止、最終端末の接続資格、1台の見積/納期 | 本人提供の会社名・電話番号、会社返信先で送信済み。部署は指定がなく「未指定」と記載。公式フォームの受付完了表示を確認。技術回答は未受領 |
| Quectel support@quectel.com（メーカーguide記載） | BG770A-SNの003-250340原本/対象周波数、YECN028AA/短い指定代替、J0301電流/J0201給電、Linux UART/FW/GNSS、同居/接続維持、現行kit供給 | 最初の個人Gmail送信後、本人指定の会社Zohoから同じ照会を再送し、今後の返信先を会社へ指定。会社メールの送信済み本文と「配信済み」表示を確認済み。技術回答は未受領 |

最初の送信後に本人から会社アドレス使用の指示があった。本人がアドレスの綴りを訂正し、外部Chromeで開いた認証済みZohoを使用して会社送信を完了した。旧表記でのアカウント未検出は解消済み。個人Gmailからの追加送信はしていない。Soracomも会社返信先を訂正し、本人の会社名・電話番号回答後に送信した。受付完了先は `https://soracom.jp/contact/contactsales_sent/`。Quectel宛ては同じ技術照会の連絡先変更を含む再送であり、新規発注ではない。2社への照会、計3回の送信（最初の個人メール、会社からの訂正再送、公式フォーム）を区別する。メールID・送信元・電話等の詳細はGit外で扱う。

## 5. 回答票に必要な項目

- 認証: module名、certificate原本/版/認証機関、LTE/NTN別の周波数・出力、FW、筐体同居・人体距離。
- アンテナ: 正式MPN、connector、帯域別利得、認証annexとの対応、使用/収納寸法。
- 給電: exact EVK revision、USB列挙前/連続最大/突入電流、descriptor、外部電源connector/極性/定格、逆流防止回路。
- 回線: plan01s/planX1/planNT1の互換、APN/band/profile切替、最終hostのSkylo等の接続登録・継承範囲。
- 維持/停止: 地上網優先、Wi-Fi中のmodem動作、制御通信と費用上限、本人停止/電池low/故障時の正式手順。
- 調達: 正確なkit発注コード、現行released manual、国内流通、1台の納期・料金。見積受領を発注/契約としない。

## 6. 回答の受入・次の作業

| Gate | 回答で必要なもの | 合格後の作業 |
| --- | --- | --- |
| R01 | 完成hostへの適用条件、常時給電とWi-Fi同居、必要な試験/接続登録 | hardware profileの状態遷移を実装、実配置でRF試験 |
| R02 | 日本NTNとLTEそれぞれの証明書、band/fw/SIM、provider許可と料金、停止時の挙動 | 地域profileを固定。実契約/開通は別の本人許可後 |
| R03 | kit revisionと指定antenna型番/特性/認証条件、納期 | BOM・外形・antenna配置図を確定 |
| R04 | exact board給電図/最大電流/USB契約、charger納入仕様 | 必要な電源branchを改版、dummy load/実測。文書回答だけで過渡/熱試験を合格にしない |

回答の原本はアクセス制限付きの作業保管先へ保存し、Gitには秘密を除いた文書名・版・条件・判断だけを残す。どちらも必要証明がない場合、対応済み日本端末の提供可否を同じ窓口へ確認し、根拠のない別moduleへ次々置換しない。本人の問い合わせ送信許可は取得済み。現在の送信状況は§4。認証の適合判定とは分離する。
