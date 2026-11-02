# mii-portable-p3 hardware profile

状態: 条件付き設計。BSP/image/adapter/実機は未受入。正本は[22章](../../../../docs/mii/design/22-integrated-radio.md)。仕事の意味・本人性・権限・費用・保存は[共通OS14章](../../../../docs/mii/design/14-common-os.md)を参照する。

- Compute: Raspberry Pi4B 4GB、microSD MB-MJ64KA/AM。重いLLM/camera集約は電力枠に含まない。AGX等は任意の固定worker。
- I/O: 黒USB2上段→Murata LBAD0XX1SC-DMSB-EVK-B UART0 Mini-B（CP210x、115200/8N1）。下段→BU-353N5（NMEA、4800/8N1）。EVK USB給電契約はR04未確認。
- Network: Pi内蔵CYW43455 Wi-Fi、LTE-MとNB-IoT NTNの共用modem、3FF SIM plan01s+planNT1/国内LTE planX1。日本初号Wi-FiはJP/2.4GHz/20MHz/ch1〜11、純正RF firmware、技適表示は現物照合。P3.1はアプリrouteとmodem網維持を別管理、BT OFF。Wi-Fi＋modem制御面の同時送信を排他とみなさない。通常route切替のmodem電源断/detachは廃止し、Skylo/provider手順は未確認。LTE/NTNはmodem socket、PPP/一般WAN共有は未受入。RF同居・日本NTN機器適合・kit antennaはR01〜03未確認。
- Power: Waveshare UPS Module 3S + Molicel INR-18650-P28A×3。指定12.6V2A charger→付属DC5521/XH→INPUT、UPS 5V→付属XH/Type-C→Pi USB-C。dockを外すのは充電DC5521と任意RJ45。UPS基板5AでもPi給電枠3A、USB1.2A。設計2.78A/USB1.10A、実測最大ではない。初号は電池点検口を開けて監視充電、閉筐体/無人充電は未受入。
- GPIO: fan赤=J8物理4、黒6、青8/BCM14。UART console/TX兼用なし。UPS header2 SDA→J8-3、1 SCL→J8-5、5 GND→J8-9。I2C 3.3V、Adafruit266の3線。INA219 address/shuntは現物demoで照合。PiSugar用0x57/0x68 driverは廃止、PiへUPS 3V3出力を接続しない。
- Position: GNSSをCoreだけで取得。初号NTNは静止・屋外、位置期限切れで停止。20cm人体離隔は米国資料の出発条件で、同居適合の代替ではない。
- Mechanical/display: 180×160×90mm配置枠、antenna/plug込み200mmは未確認。新たなmic/speaker/空中表示は非搭載、光学C-02は継続。

検査: `python3 docs/mii/design/portable-p3/check.py`。印刷図: 同dir `render.py`。R01〜04とP3-A01〜07を同一hardware/firmware/OS imageで閉じるまで利用可能と表示しない。

PiSugar＋SC0218/DDR候補は公差/過渡不整合で除去済。R04には新UPSの指定charger銘板/セル/過渡/温度の受領・実機検査を含む。
