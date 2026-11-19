# Native / QEMU / Release

## 目的

Buildroot/LinuxのRockstarOSをQEMU Developer Previewとして再現可能にbuildし、起動、保存、更新、rollback、backup、復旧、削除を同じ候補で受け入れる。

## 現在地

- 共通通信契約 `NET01` は[通信・ネットワーク設計](../network-transport-design.md)に追加。端末と管理Linuxの通信断、再接続、通知照合、費用、VPN／DNS／TLSを分けて受け入れる。現在は設計のみで、実機・衛星・通話・公開監視は未受入。

- Linux native OS、専用UID、Platform API、SQLite、launcher、Wallet／Game fixture、A/B更新とbackupの実装がある。
- QEMU rc2は候補同一性、安全基礎、更新・rollback、backup、診断、native部品表の6/10 gateを満たす。
- 製品license、production署名、署名後の同一候補受入、一般公開承認の4 gateが未完了。
- 過去候補の合格は最新sourceやスマホOSへ転用しない。

主なtask: `OS01`, `V01`, `N01`, `N02`, `RLS01`, `NET01`, `LCH01`〜`LCH03`, `LCH07`, `LCH08`。

## 次に進める順番

1. TLS／timeoutと起動再読込WIPの採否を最新sourceで確定する。
2. licenseと正式署名方式を確定し、current native SBOMと同じ候補へ結合する。
3. fresh hostで導入、起動、保存、更新、rollback、backup、restore、削除を再実行する。
4. archive SHA-256、source SHA、host条件、既知制限を固定する。
5. 全gate合格後に公開範囲を本人が決定する。

## 完了条件

- source、image、host tools、設定、archive hashが一対一で追跡できる。
- 正常終了、強制中断、更新失敗、rollback、全損restoreを区別して確認する。
- public development keyをproduction keyとして扱わない。
- QEMU合格を物理端末合格として表示しない。

## 関連資料

- [共通通信・ネットワーク設計](../network-transport-design.md)
- [Native OS integration](../native-os-integration.md)
- [Native validation](../native-os-validation.md)
- [QEMU completion audit](../qemu-release-completion-audit-20260912.md)
- [Installation plan](../release-installation-plan-20260909.md)
- [QEMU audit data](../../data/qemu-release-audit.json)

## 検証

- `npm run os:check`
- `npm run os:backend:launch`
- `npm run release:check`
- 対象候補のD0〜D6受入


### 共通adapter実行kernel（OS09/OS10/SKY21・ROCK）

既存workflowを使った版付きHost/Executor/Output、private text実行、UID journal/UNKNOWN、Ollama loopbackを追加。共通本体とplatform driverを分け、MacをLinuxと偽らない。26 fixture・Mac1件・別process bundle再読とPixel既存receipt投影の証拠は[adapter runtime](../evidence/rockstar-adapter-runtime.json)、11項目の詳細は[共通設計](../rockstaros-complete-design.md#portable-adapter-execution)。これはQEMU/native OSや新Pixel protocolの受入ではない。次は既存Broker/device-linkと同一accountへ接続し、Pixel adapter同一候補を検査する。Web/PWA/Android/Securityと横断し、端末追加の本人確認はOWNER、実機はJOINT。
