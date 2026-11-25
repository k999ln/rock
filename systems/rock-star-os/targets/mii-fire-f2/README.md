# mii-fire-f2 hardware profile

F2: [消防ハード設計25章](../../../../docs/mii/design/25-retrofit-fire-hardware.md)。評価設計のみ。共通runtimeは[14章](../../../../docs/mii/design/14-common-os.md)。新しいOS・制御APIは作らない。

- Compute/display: mii-portable-p3と共通。消防用の検知・音響・監視は固定部。Coreを外しても消防機器側は残る。
- Input: JP-HのFSKJ226-M/C→指定無線→FSOJ001B-Sの無電圧接点→1018_3 DI0/G→3060_0 Full Speed絶縁→Pi4青USB3下段。接点OPENは健康状態を示さず、fault/low-battery/zone IDはこの入力では取得できない。
- Output: 消防側への有線制御なし。I1の全出力未接続。無線停止・復旧の制御も追加しない。
- Power: 消防部は各純正電池。P3 5Vとは分離。I1実測50mA以下、I2込みhost100mA以下を受入枠とし実測は未実施。全通信搭載時はUSB合計1.2Aで余裕なし、電源受入HOLD。初回はmodem/GNSS未接続。
- Radio: 指定消防機器の無線familyとLTE/Wi-Fi/NTNを区別。同居EMC・電波到達は未受入。JP-SのFDKJ235系は住宅系と混在不可、FSOJ001B-K→miiは接続許可待ち。
- Mount: 新規建物配線・AC100V直結工事・天井内工事なしを要求。対応取付台・既存穴・荷重の確認が必要。JP-BのFDK246/FZBJ014-R-2は既設流用照合例で、mii完成headではない。

部品・実端子は [BOM/netlist](../../../../docs/mii/design/fire-f2/bom-netlist.json)。F-E01～05と24章F-G01～06/F-A01～07を閉じるまで製造・施工・代替使用は未受入。
