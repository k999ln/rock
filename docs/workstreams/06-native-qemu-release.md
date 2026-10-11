# Native / QEMU / Release

## 目的

Buildroot/LinuxのRockstarOSをQEMU Developer Previewとして再現可能にbuildし、起動、保存、更新、rollback、backup、復旧、削除を同じ候補で受け入れる。

## 現在地

- Linux native OS、専用UID、Platform API、SQLite、launcher、Wallet／Game fixture、A/B更新とbackupの実装がある。
- QEMU rc2は候補同一性、安全基礎、更新・rollback、backup、診断、native部品表の6/10 gateを満たす。
- 製品license、production署名、署名後の同一候補受入、一般公開承認の4 gateが未完了。
- 過去候補の合格は最新sourceやスマホOSへ転用しない。
- 2026-10-11: 保管rc2 archiveと716 fileの読取整合を再確認した。新sourceのimageと専用Linux/QEMU環境は未用意で、旧VMは起動していない。QMP画面取得の総期限欠落をhostの実socketで再現して修正し、関連69件を検証した。[範囲と再開条件](../native-os-validation.md#qemu受入monitorの総期限2026-10-11)。

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

<a id="continuing-acceptance"></a>
## 継続する受入契約（旧実行プロンプトから統合、2026-10-11）

旧 `hub-wallet-next.md` / `os-operational-base-next.md` の必要条件をここへ収束した。旧起点SHA、BlackBerry-first、D6 run44待ち、未実装一覧は現在の指示ではない。現在の主商品はSIM/eSIMからのサービス利用開始、物理対象はPixel 10 GL066／frankel、QEMUは独立系列である。原文の復元元は[削除記録](../git-consolidation.md#obsolete-content-cleanup)。旧受入の成功を新しいsource/imageへ継承しない。

### QEMU D0〜D6

同一source・image・profileで[OS受入報告](../templates/os-acceptance-report.md)を作る。任意の既存VM・固定export・旧ディスクを上書きせず、空の専用領域を使う。OS、Android APK、Pixel全OSの受入は独立する。

| gate | 継続する必須条件 |
| --- | --- |
| D0 | source・依存lock・出所・設定・imageを固定し、回帰試験と試験入力の前後hash、秘密と公開fixtureの分離を確認。 |
| D1 | 新しいbuild領域でImage/rootfs/stage0を生成し、実guestのkernel/init、専用UID、read-only root/data分離、乱数、IPCを観測。 |
| D2 | native Skyから既存商品の導入/同意/実処理/結果保存・再表示/停止/更新・戻し/削除を確認。模擬Walletの利用可能・保留・費用・履歴を台帳と照合。hash出力だけで業務処理を代替しない。 |
| D3 | owner/UID越境、改竄・失効署名、許可外path/通信/操作を拒否。入力・CPU・RAM・時間・容量上限、worker crash/通信断/二重要求でも無断送信・二重実行なし。不明結果は照合待ちに保持。 |
| D4 | fresh nonce、PID/UID/executable/socket、実描画後loop応答からstartup healthを確認。未準備/freezeをmark-goodしない。A/B改竄、部分書込、中断、容量不足、data ABI不整合、起動失敗から検証済みslotへ復旧。 |
| D5 | 画面の通常reboot/poweroffをinit停止・unmount・guest power eventと照合し、同じdataで仕事/同意/receipt/模擬Walletを再読込。強制終了・sync・電源受付だけを通常終了の成功にしない。別の空の復元先を使い、元データ不変を確認。 |
| D6 | 初期基準は正常起動/終了5サイクルと60分の制限内反復job。回数・時間・資源閾値は実行前に固定し、失敗後に緩めない。消失・二重計上・無断副作用0、deadlockなしと再実行可能な手順を確認。 |

D0〜D6の必須項目にFAIL/NOT_RUN/SKIPや対象範囲の重大な未解決脆弱性があれば、その候補をQEMU開発OS合格にしない。公開試験鍵の隔離開発合格と、製品license・production署名・一般公開を区別する。手順の再実行可能性とbit-identical buildも別判定。

### 保存・台帳・ゲームの受入境界

- 旧/新backup形式、A/B/dataの全disk、profile別正本DB・追加表を照合する。desktop backupに含まれないbackend/runner/game authorityは保存範囲と整合時点を別記し、旧固定表だけで新台帳を受け入れない。
- 台帳変更後は旧台帳/旧client/直前OSの互換表、署名data ABI、移行中断、更新後rollback、未確定交換保持を確認してD4/D5を再実行する。table再作成・保留消去・同じABI名を安全なrollbackの根拠にしない。
- 元writerと復元writerを同時に支出可能にしない。世代/正本切替の排他を維持し、外部取引を巻戻し・再実行せず、正本との照合前は支出を有効にしない。外部通信を止めた合成fixtureと実運用の切替受入を分ける。
- OSの保存済み成果・復旧は契約切れやGame/Cloud停止でも利用できる。Gameの負荷・未導入・更新失敗でSky/Wallet/OS更新を止めない。未導入モデルをofflineで利用可能と表示しない。
- GX00→GX01→DX01と実ゲームGX02を分け、OS単一ownerのV01を複数ownerや実Providerの完成待ちにしない。Gameは2作者/2game/2owner（1ownerは2端末）の正当系・越境拒否・同ID/冪等キーの分離・失効非波及・再起動/worker再利用を[Game契約](../game-api-contract-draft.md)と[実装契約](../gx01-contract-implementation-plan.md)で確認する。
- ATMとゲーム交換は別adapter/quote/同意。共通台帳の利用可能額は直列化し、不明な付与/消費でholdを解除しない。逆方向は確定debit/burnと確認済み原資を要し、作者の自己申告・bonus・scoreを実資金へ変換しない。ATM自社手数料0、ゲーム料金未定、現行の料金実行保留を維持する。
- SDKはserver秘密をclientへ埋め込まず、権限/版/期限/失効/結果不明の照会を示す。fresh導入で設定数・初回成果・復旧時間を測り、内部fixtureを外部作者pilotや市場優位性の証明にしない。

### Sky/Wallet GAPと比較

GAP01は最新main/対象branch/承認基準の統合と入口同期、GAP02は商品条件から実adapter・receiptまでの接続、GAP03は認証済み収益照合、GAP04は利用体験の比較として追跡する。実装・fixture・sandbox・実取引・実機の証拠を別々に扱う。

既存の提案/引用整理/案件Toolはsource/ref/権利を確認して再利用する。無料端末・OSS PC・有料API併用・月額Cloud・従量・BYOK・self-host・複数工程を別軸で扱い、価格/資格/接続が不明なら実行前に理由を示す。有限adapterを任意shell/rootや無断fallbackへ広げない。契約切れ・キー失効・価格変更・cap超過・PC sleep/offline後は同じjobを復旧する。

B03の台帳/fixture基礎が通れば実Provider未受入でもB05比較を進められる。B02/B05は同じ業務入力・環境の改善前/改善後/既存PC手順を比べ、準備込み初回と反復を分ける。準備時間、操作数、画面切替、手動コピー、初回成果/復旧時間を記録し、不便→原因→修正→再試験と改善しなかった点を残す。[既存比較](../hub-wallet-pc-comparison-20260909.md)の少数CLI測定を人間の操作時間や携帯実機の価値へ換算しない。実収益と支払いの受入は[Wallet担当](03-wallet-billing-providers.md)、現行の画面導線は[Web担当](05-web-pwa-sites.md)で扱う。

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
