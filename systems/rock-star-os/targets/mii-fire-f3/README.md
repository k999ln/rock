# mii-fire-f3 hardware profile

2026-11-03。MAT15／JOINT。正本は[26章](../../../../docs/mii/design/26-fire-certification-power.md)。24部品行・20接続の[BOM/netlist](../../../../docs/mii/design/fire-f3/bom-netlist.json)。完成品／消防代替・天井取付・実機受入はHOLD。

- Compute/storage: Pi4B4GB SC0194 revision1.2以降、MB-MJ64KA/AM。共通OSの仕事・本人性・権限・費用・保存・再開を変更しない。
- Power: A1289のC1→USB2CC50CM→Pi、C2→USB2CC50CM→外部給電SC1636。設計上限Pi系2.50A、Hub系1.50A、計20W。旧P3のUPS・12.6V・I2Cを混在させない。停止・切離し後にA2663115でC1から充電、UPS無停止は未対応。
- I/O: Hub U1=Murata UART0、U2=BU-353N5、U3=3060_0→1018_3、U4未使用。U番号は貼付管理ラベル。H4接点はDI0/G、絶縁を維持。OPENを正常／解除と解釈せず、fault/zone/lowBatteryはunknown。
- Radio: Pi純正Wi-Fi、LTE/NTN共用EVK。LTEとNTN同時データ通信は不可、Wi-Fi同居・日本NTN・exact antenna・USB電力契約はR01〜04未受入。通常route変更でmodem電源断しない。Quectel別候補のYECN028AAは認証リスト外の回答により除外。
- Mechanical/environment: PB約632g、0〜35℃。開放した可搬評価用であり、消防head/baseに吊らない。完成製品の0〜40℃等・支持構造・専用電池・煙流・音響試験は別途必要。既設回線からmiiへ電力を取らない。
- Display: 既存C-02の表示4条件は不変・未受入。このprofileは投影や光学を実装しない。

`python3 docs/mii/design/fire-f3/check.py`。静的合格は実機給電・検定・物件受入ではない。BSP/adapterの実装と同一artifactの保存・停止・復旧試験は未実施。
