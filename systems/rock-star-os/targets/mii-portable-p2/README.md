# mii-portable-p2 hardware profile（設計のみ）

**後継の条件付き設計は[mii-portable-p3](../mii-portable-p3/README.md)。** 本P2は履歴として保持する。
正本: [mii設計21章](../../../../docs/mii/design/21-portable-connectivity.md)。共通OSの既存runtimeを動かす可搬通信Coreのprofile。ドライバ/boot imageをこの変更で実装・受入したものではない。

| 項目 | 選定/上限 |
| --- | --- |
| Compute | Raspberry Pi 4 Model B 4GB、BCM2711/aarch64。制御/queue/cache対象。重いlocal LLM・4台raw fusionは能力に含めない |
| Storage | Samsung MB-MJ64KA/AM、microSDXC64GB。耐タンパーSE/TPM未搭載 |
| Power | PiSugar 3 Plus同梱5000mAh kit、5V最大3A、設計負荷2.68A。CORE USB-CはNC。外部入力はUPS Type-Cだけ |
| Thermal | 純正Pi4 Case Fan、J8 pin4/6/8（5V/GND/BCM14）。充電時電池区画開放、電池0〜40°Cのメーカー条件、初号20〜30°C |
| I2C | J8 pin3/5、power0x57/RTC0x68。純正背面contact経由 |
| LTE | Waveshare17693/SIM7080G、USB2黒上段→Micro-B、Cat-M1、USB入力0.5A枠。LTE1→TaoglasFXP14.07.0100A。1.8V IoT SIM、回線/APN/国内承認未決 |
| Wi-Fi | Pi4内蔵Cypress CYW43455/SDIO/基板antenna、brcmfmac。STAまたはAPの単独mode、AP+STA同時は対象外。Bluetooth初期OFF |
| Satellite | RockBLOCK9704-ANT、USB2黒下段→USB-C、0.5A枠/高速充電jumper変更なし、serial230400。IMT message、IP WANではない。16pin全NC |
| USB | 全port合計1.2A、P2割当1.0A。USB3×2未使用。per-port給電遮断は保証しない |
| Ethernet | 1GbE RJ45任意、PoE HATなし。固定worker結果は50Mbps以下設計枠。HW1の4 Tower raw集約は接続しない |
| Display/audio | P2通信BOMにmic/speaker/独立表示なし。HDMI/CSI/DSI未使用。既存表示4条件を達成した意味ではない |
| Mechanics | 180×160×90mm配置枠、最大200mm目標。機構保持/電池/全radioが可搬側。外部給電とLANは手動抜差し |

未受入: BSP、電池/detach adapter、PPP/実AP、9704 bridge、電源ピーク、機構、RF同居、地域適合、実回線。P2-A01〜08で別々に記録する。単体の部品認証・host fixture・Pi OS起動をRockstarOS実機受入に読み替えない。仕事・本人性・料金・承認の契約はこのprofileへ複製しない。
