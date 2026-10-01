# Native / QEMU / Release

## 目的

Buildroot/LinuxのRockstarOSをQEMU Developer Previewとして再現可能にbuildし、起動、保存、更新、rollback、backup、復旧、削除を同じ候補で受け入れる。

## 現在地

- Linux native OS、専用UID、Platform API、SQLite、launcher、Wallet／Game fixture、A/B更新とbackupの実装がある。
- QEMU rc2は候補同一性、安全基礎、更新・rollback、backup、診断、native部品表の6/10 gateを満たす。
- 製品license、production署名、署名後の同一候補受入、一般公開承認の4 gateが未完了。
- 過去候補の合格は最新sourceやスマホOSへ転用しない。

主なtask: `OS01`, `V01`, `N01`, `N02`, `RLS01`, `LCH01`〜`LCH03`, `LCH07`, `LCH08`。

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
