# 20 miiの通信 — 本体配線と既存の通信・Web・運用設計

**後続設計: [21章 可搬P2](21-portable-connectivity.md)。** 本章は固定HW1の設計時点を保持する。後続の本人指示でPi4/電池/LTE/Wi-Fi/9704-ANTを可搬Coreへ選定した。本章の「可搬core/radio未選定」はP2については更新済み。C-01はP2構成選定・実機受入待ち、RF同居/回線/adapter/光学は未受入。

2026-11-02 / HW1-COM1 / MAT15・MINI-08・NET01・SIM01 / 主担当 Material Invention・ROCK。

本人が指定した [RockstarOS｜通信・Web・運用](codex://threads/01a16c30-a468-7681-923d-3a8bd7871587) の直近16 turnと、現在の通信正本を照合した。チャットのWeb接続/UI/配備検証を、miiの無線モデム・回線開通・実機合格へ転用しない。本章は[19章の本体配線](19-body-hardware.md)に外部通信を接続する。共通OSと既存の通信制御を再利用する。

## 1. 通信の用途を本体へ対応付ける

| 通信 | 既存の決定・要求 | HW1への反映 |
| --- | --- | --- |
| Tower–Hub | camera・mic・IMU等の空間入力 | 19章の隔離sensor LAN。各Tower 1GbE、Hub集約10GbE。Internet回線ではない |
| 固定WAN | 設置中の外部通信経路 | **USB31000Sで専用WAN portを追加**。J17 sensor LANと物理的に分ける |
| 本体LTE | 日本国内、LTEのみ、data専用IoT SIM、試作nano SIM、回線付きはoption/model | 本体通信機能として保持。通信会社/APN/認証済SKUが未決定のためmodem/RFは未配線。スマホやProを必須にしない |
| SIM/eSIM | SIM profile、網登録、本人、利用権を分離。将来のIoT SIMはSGP.32対応を要求 | 一般向けconsumer eSIM商品とmii内蔵IoT SIMを混同しない。eSIMやSIMにOS binaryを格納しない |
| Wi-Fi | bulk download用の上流接続と、許可端末へのhotspot共有 | STAとAPは別能力。HW1ではradio/antenna未選定、AP OFF。J505等の存在だけでAP対応済みにしない |
| 衛星 | 日米のsi・メッセージ・小ファイルを先行。直接内蔵・携帯時の単独動作 | 2026-10-25の9704/NB-NTN候補比較を保持。実modem/Provider未採用。短文通信を一般Web/IP共有と表示しない |
| offline | 基本入力・停止・保存、同じ仕事の復旧 | 圏外でもローカル機能を維持。回復時は同じjob/operation IDを照会し、有料処理を自動再送しない |

根拠: [本体LTE](../../avocado-mini-cellular.md)、[着脱・携帯通信](../../avocado-mini-r5/embedded-portable-connectivity.md)、[衛星候補](../../avocado-mini-r5/satellite-hardware-trial-plan.md)、[通信と請求](../../service-design/08-mini-connectivity-and-billing.md)、[eSIM構造](../../structure/03-esim.md)。古い `data/avocado-mini-cellular.json` のconsumer eSIM保留表記は2026-10-13の記録であり、10-15以降のconsumer eSIM再開を上書きしない。今回その履歴値やcarrier未指定を勝手に更新していない。

## 2. HW1で今接続するWAN端子

[通信追加BOM/配線](body-hw1/communications.json)を正本とする。19章の31行に加えて2行。既存router・光回線等の契約は新規購入品に数えない。

| ID | 型番 / 数 | 端子と配線 |
| --- | --- | --- |
| WAN-NIC | **StarTech USB31000S** / 1 | USB 3.x Type-A male → HUB **J33**の空きUSB-A。選んだ口へ「COM1」のラベルを付ける。COM1は本設計の付番でNVIDIAの基板番号ではない |
| WAN-CABLE | **StarTech NLBL-2M-CAT6A-PATCH** / 1 | WAN-NIC RJ45 → 本人管理の既存router **LAN** port。2m、dataのみ |

```text
 センサー / mic / radar
   T1〜T4 → PoE switch → HUB J17 [sensor interface / 10.77.0.0/24]
                                  │
                      共通OS / Broker / mii adapters
                                  │
                     HUB J33 / COM1 [USB-A]
                                  │ USB31000S（5V USB bus power）
                                  │ RJ45 / Cat6A 2m
                                  ▼
                       既存router LAN → 許可済みWAN

 LTE modem + SIM + RF ── [未選定・未配線 / USB host接続を予約]
 Wi-Fi AP / antenna   ── [未選定・AP OFF / client networkを分離]
 衛星modem + RF       ── [未選定・未配線 / message bridgeの契約を再利用]
```

メーカー資料はUSB31000SをASIX AX88179A・USB-A・1GbE・USB bus powerとする。現物revisionとUSB ID、Jetson BSPのARM64 kernel driverを確認し、列挙・link・IP取得・連続通信を受入れる。メーカーのUbuntu対応表だけでJetson実機合格にはしない。USB powerは最大4.5Wのport枠をHub側で見込む。GPIOから給電しない。現物SKUのchipが異なる場合はdriverを再照合する。[StarTech datasheet](https://media.startech.com/cms/pdfs/usb31000s_datasheet.pdf)、[NVIDIA端子図](https://docs.nvidia.com/jetson/agx-orin-devkit/user-guide/latest/hardware_layout.html)。

既存routerへ接続するのはWAN-NICだけ。**PoE switchやTower LANを家庭routerへつながない。** `sensor0` / `wan0` は設計上の役割名で、OSが割り当てる実interface名ではない。USB ID/物理port/MACと実interfaceを照合してroleを束縛し、`eth0`等を推定しない。両networkのsubnet衝突、IPv4/IPv6、DNS/routeを確認する。sensor側にはdefault gatewayを設定せず、WAN側だけに外向きrouteを設ける。Hub自身の通信以外の転送はdefault denyで、IP forwardingはOFFから始める。

将来hotspotを追加するときもsensor LANをWi-Fiへbridgeしない。guest/AP側は別interface/namespaceとし、既存 `ManagedAP` と `LinuxPacketGate` の認証・quota確認後に許可された経路だけを開く。現HW1のUSB NICはRF moduleでもSIM slotでもなく、**有線WANの採用だけでLTE・衛星・hotspot完成とはしない**。

## 3. 共通OSの既存実装へつなぐ

| 責任 | 現在再利用するsource/契約 | hardware adapterに必要な観測 |
| --- | --- | --- |
| 端末のWeb接続 | [sky-network-session.ts](../../../lib/sky-network-session.ts)、[sky-network-device.ts](../../../lib/sky-network-device.ts) | offline/世代変更で遅着応答を破棄。browserのonlineや端末hintを回線・本人の証拠にしない |
| 共有許可/保存/停止 | [tethering/README](../../../systems/rock-star-os/targets/avocado-mini/tethering/README.md)、`controller.py` | owner/device/dock、permission revision、WAN能力、量/費用枠、再起動保存 |
| 実packetの門番 | [LINUX.md](../../../systems/rock-star-os/targets/avocado-mini/tethering/LINUX.md)、`linux_gate.py` | 正しいinterface/namespace、IPv4/IPv6・送受信の共有quota。旧grantで復帰しない |
| AP/網側の許可 | [ACCESS.md](../../../systems/rock-star-os/targets/avocado-mini/tethering/ACCESS.md)、`access_session.py` / `network_quota.py` | 実hostapd認証、端末別鍵、provider側hard cap。ローカルdropだけを請求上限保証にしない |
| 小容量衛星transport | [MESSAGES.md](../../../systems/rock-star-os/targets/avocado-mini/tethering/MESSAGES.md)、`message_adapter.py` / `message_service.py` | 有限chunk、request ID、TTL、再送回数、ACK/処理完了の分離、同一保存結果の読戻し |

既存host/fixture/隔離Linux試験を保持する。実modem、実Wi-Fi handshake、providerの請求上限、実Broker本人性、メッセージ消費側のJob接続はそれぞれ別gateである。新しい通信台帳を作り直さず、既存adapterの未接続部分を対象機材へ結ぶ。

stateは少なくとも `radio_off / no_modem / no_sim / pin_required / registering / no_service / registered_no_data / online / limited / error` を区別。modemが未搭載なら `no_modem`、USB NICで固定WANがonlineでも `cellular:online` は出さない。観測はdevice/boot/connection generation/時刻を持ち、再起動後は網・IP/DNS・service認証を取り直す。clockが不明な場合に期限付きgrantを復活させない。

## 4. 回線切替・保存・費用

LTEで含める用途は自社cloudの制御・Agent・音声。OS/model更新、映像/streaming、ゲーム取得等のbulkは既存のWi-Fi条件を保持する。HW1有線WANをbulk代替として自動許可せず、用途policyを確認する。Wi-Fi切断からLTE/衛星へ自動で有料通信を広げない。回線・SIM profile・本人/利用権・OS導入・cloud実行・料金確定を別に追跡する。

network断は仕事完了/取消を意味しない。保存してunknownを保持し、回復後は同じjob ID/operation keyで状態照会する。受信済みのmessageは同じrequest ID/digestで保存し、ACKを失っただけで新しい仕事を作らない。SIM/PIN/PUKを推測しない。APN/credential/加入者番号の全値は保護領域に置き、BOM・Git・一般ログへ出さない。

費目は通信費・端末代・OS料金・AI使用料・第三者実費を別明細にする。通信予約とcloud実行予約も別で、送達ACKをTool成功や料金確定に昇格しない。NTN小容量transportで任意HTTPS/一般Webが通るとは仮定しない。日米の通信profile、認証、提供範囲、共有許諾、通貨/請求、網側上限は国別に確認する。

Web入口は `avoado.si` が総合/Sky、`avocadomini.si` がmii、`avocadopro.si` がPro。指定チャットには2026-10-27のDNS/TLS/HTTP確認と旧`/install/`→`/connect`候補の記録があるが、今回のmii無線受入にも、本日の公開状態にも転用しない。本人用localhost Labや設定秘密をこれらの公開サイトへ移さない。

## 5. 携帯構成とHW1の差を閉じる

**C-01は未解決のまま。** 既存要求は「別演算Hubを必須にせず、取り外したcore単体で仕事と通信を持ち出す」。今回の1m Towerはセンサー側であり、外すと独立したRockstarOS端末にはならない。別体Jetson HubへLTEを足しても、携帯coreの合格証拠にはならない。

次の機構/回路版では、可搬coreの中に演算・保存・本人性・電池/保護・WAN modem・Wi-Fi・antennaを配置し、固定dockへ残す給電/保持/有線と分ける。使用時200mm以内との収納、送信peak、熱、稼働時間、RF、dock離脱時のscope失効を同一機で検証する。今回のHW1は室内空間I/Oと共通OS接続を検証する本体試作として進め、携帯の要件を削除しない。

## 6. 通信の組立・受入

1. 無通電でWAN-NICをJ33の選んだ空口へ挿しCOM1ラベル、RJ45を既存routerのLANへ接続。J17のsensor LANとの誤接続を確認する。
2. Hub起動後にNICの実USB ID、driver/firmware/Kernel版、実interface、link、IP/DNS/routeを記録。AP/転送はOFFを確認する。
3. 認証済みの許可先だけへ疎通し、sensor機器が外部から見えないことを確認。raw camera/micをWANへ転送しない。
4. WAN抜去・復帰・USB抜去・再起動でローカル停止/saveを維持し、旧世代online表示/旧grant/有料jobの自動再送を拒否する。
5. LTE/SIM、Wi-Fi AP、衛星は、部品・回線条件を固定した別attemptで試験。PC/スマホ経由の成功を本体内蔵・携帯単独へ転用しない。

| ID | 受入内容 | 状態 |
| --- | --- | --- |
| COM-A01 | J33 NIC列挙、1GbE link、IP/DNS/route、sensor/WAN分離 | NOT_RUN |
| COM-A02 | 切断/再起動、保存/停止、古い応答拒否、予算/未確定予約保持 | NOT_RUN |
| COM-A03 | 日本LTE / exact modem・SIM・APN・RF・単独実通信 | BLOCKED_MODEM_AND_CARRIER |
| COM-A04 | Wi-Fi AP端末別認証、guest分離、実packetと網側quota | BLOCKED_RADIO_AND_PROVIDER |
| COM-A05 | 日米別の衛星配送/ACK/失効/上限とJob保存引渡し | BLOCKED_MODEM_AND_PROVIDER |
| COM-A06 | 携帯coreの同一閉箱、電池、RF、dock離脱/再装着 | BLOCKED_C01 |

今回は本体設計の参照・配線を追加した。NIC/radio購入、回線契約、開通、ネット設定変更、無線送信、外部メッセージ送信はしていない。
