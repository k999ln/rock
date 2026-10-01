# OS稼働ベース・ゲーム交換の差分監査

確認: 2026-09-09 16:09 UTC。これは作成時snapshotであり実行開始時には再確認する。

追補: 16:51 UTCに再確認し、main/nativeは下記同SHA、設計review `codex/os-game-design-review-20260909` / `de5b102d3525daccf604efd5685bdf8c14ad5d50` を加えた3branch。review SHAのcheck-runは0でCI成功ではない。[設計と実装の再照合](design-implementation-alignment-20260909.md)で単一owner、復元試験入口、台帳移行、段階依存の不足を追加し、設計v1.1/プロンプトを訂正した。以下16:09時点の2branch記録は履歴。新しいruntime実装・VM試験は未実施、設計承認待ちを維持。

- main: `7cdbb5fedc86ee3978ed329d9312147d137c9199`、同SHAの[verify成功](https://github.com/k999ln/rock/actions/runs/34368901643/job/102524716373)。
- native: `codex/integrate-native-os-20260909` / `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`。[PR #1](https://github.com/k999ln/rock/pull/1)はOPEN、未マージ。
- nativeの同SHA: [source-tests](https://github.com/k999ln/rock/actions/runs/34318525801/job/102359820423)、[Android prototype](https://github.com/k999ln/rock/actions/runs/34318525747/job/102359820156)、[Web verify](https://github.com/k999ln/rock/actions/runs/34318525748/job/102359820133)成功。
- 全branchはmainと上記native、open PRは#1、取得したclosed PRは0。読み取りAPIの最初の実行は環境制限で失敗したが、許可された接続で再実行成功。両remote refをfetchして40桁SHAを照合した。
- 今回は文書・要望の構造検査の更新。native runtime、OS image、実ゲーム、実ATM、実資金は変更・再試験していない。
- 最後の利用者指示により、設計書v1.0を提示して明示承認を待つ。Game入口/達成演出は提案として設計書に記載し、実装未承認。実行プロンプト冒頭にも承認ゲートを追加した。

## 要望と現在地

RQ01〜RQ11を維持し、RQ12「現設計を稼働・検証できるOS雛形へ」、RQ13「ゲーム通貨交換、ATMと独立」、RQ14「自作ゲーム作者が組み込みやすいWallet基盤」、RQ15「ATM自社手数料0」を追加する。最後の補足は「atm手数料の話」であり、作成途中のゲーム手数料0という解釈は撤回。ゲーム料金は未定、既存OS月額は維持する。

OSが存在しない段階ではない。nativeにkernel/rootfs/init、専用UID、native Hub、Tool隔離、Wallet simulator、MCP、A/Bの試作がある。第9基準版にはQEMU起動やUI操作の過去実績がある。一方 `docs/native-os-validation.md` は、このRock配置からの新image build/bootをNOT RUNと明記する。source-testsの1,031件をimage安全性・BlackBerry・実資金の合格へ置き換えない。

以下のnative pathは `systems/rock-star-os/` 配下。

| 問題ID / 要望 | 根拠と不足 | 修正担当・受入 |
| --- | --- | --- |
| GAP01 / RQ09–10 | mainの製品ベースとnativeのAGENTS/CHECKPOINT・優先順位が未統合 | OS担当、B04。分離作業branchで両方を保持し全入口を同期 |
| GAP02 / RQ03–05 | `src/blackberryrock/packages.py` のUSD 0/run制限と限定fixture | Hub担当、B02。schemaだけでなく資格・adapter・receipt・費用まで拡張 |
| GAP03 / RQ06 | Wallet台帳はあるが認証済み実売上/金融provider未接続 | Wallet担当、B03。fixture、provider sandbox、実取引を別判定 |
| GAP04 / RQ11 | 既存商品の実利用・改善前後/PC比較・携帯価値は未完 | Hub担当、B02/B05。実商品UI操作と同条件測定。実機未検証は残す |
| OS-GAP01 / RQ12 | 最新統合source→新build→同一imageの起動/操作/復旧証拠がない | OS担当、V01。新しいLinux領域からbuildし受入D0–D6を一連で実行 |
| OS-GAP02 / RQ12 | `experiments/startup-health/` の21files WIP未適用、Python追加試験未作成、C未実行 | OS担当、N02/V01。試験を先に追加し、UI無応答を正常起動としない。WIP採否は実測 |
| OS-GAP03 / RQ08,12 | 通常gate外でATM observer 1error、power6/Wallet5skip、別UID C試験はroot条件 | OS/Wallet担当、V01。使い捨てLinux/guestで現認証契約にfixtureを合わせ検証。認証緩和禁止 |
| OS-GAP04 / RQ06,12 | `os/desktop/backup.py` はA/B/dataを保存するが `backend_included:false`, `encrypted:false`, `production_backup:NOT_VERIFIED` | OS/Wallet担当、V01。保存範囲別の整合と新規復元先の起動。外部取引は巻戻さず照合 |
| OS-GAP05 / RQ08,12 | `os/update/README.md` に公開試験鍵、hardware chain、dm-verity、hardware rollback、本番鍵登録等の不足 | OS担当。隔離開発用途に限定。実機/本番のH/Pゲートを別に残す |
| GAME-GAP01 / RQ13 | 対象main全体、nativeのsrc/os/tests/docsでゲーム本体・通貨交換は未発見 | 連携担当、GX01。ゲーム/公式APIを確認し、未指定なら合成game authorityで契約を実装 |
| GAME-GAP02 / RQ06,13 | `src/blackberryrock/wallet.py` はUSD cents単一通貨、固定勘定とwithdrawal hold。`os/wallet_auth/service.py` のquote/issueはATM専用 | Wallet/連携担当、GX01。資産・単位・操作・権限を分離した移行と専用quote。ATMへの偽装禁止 |
| GAME-GAP03 / RQ14 | Tool SDKはあるが、ゲーム作者向けWallet SDK/sandbox/導入体験は対象コードで未発見 | 連携担当、DX01。GX01契約を使うAPI/SDK・動くサンプル・2game分離・fresh導入測定 |
| ATM-POLICY / RQ15 | 現行ATM quoteは0手数料を固定検証。新しいユーザー方針はATMの自社手数料0 | Wallet担当。既存契約を保持しquote/receipt/台帳に上乗せなしを回帰。実provider外部実費は別確認 |

## ゲームとATMの境界

ATMは `os/atm/simulator.py`、`os/ui/atm-ui.inc`、`os/platform/service.py` に存在する。`os/atm/OS-INTEGRATION.md` には過去のQEMU 2boot/32checksがあるが、物理ATM・実現金払出しの証明ではない。利用者の「ATMは別で動く」は独立性の要求として保持し、Gitで確認できない外部運用を否定も保証もしない。

ゲーム交換はATM ID/コード/actorへ詰め込まない。同じWalletを使う場合に限り、AVAILABLEへの同時予約を共通台帳で制御する。ゲーム→Walletの方向や本番cash-outをユーザー承認済みと推測しない。外付けSSDや別repositoryの未追跡ゲームまで不存在と断定していない。

`os/wallet_backend/server.py`、`client.py`、`os/entitlement/device.py`、`os/wallet_auth/protocol.py` のowner/端末/authority・複数端末・再照合を再利用する。remote backend構成で表示cacheを支出可能な第二の残高にしない。台帳は資産単位ごとに保存則を検証し、USDとゲーム通貨を足して均衡とはしない。

## 到達点の分離

- V01: QEMU開発用OS雛形。合成データで再build/boot・Hub/Wallet・隔離・保存・通常終了・再起動・復元・A/B異常系を検証。
- GX01: 独立したゲーム交換契約と模擬game serverの両台帳/再照合を検証。実ゲーム接続や実資金の合格ではない。
- GX02: 指定された実ゲームの正式sandbox接続。ゲーム/API/権限/方向/条件が必要。
- DX01: 自作ゲーム作者向けの共通API/SDK、合成sandbox、動くサンプル、導入と回復の測定。初見作者pilotと市場優位性は内部検証と分離。
- H/P: BlackBerry実機・金融provider・実資金・一般公開。未確定のハード、鍵、暗号化、脆弱性/ライセンス審査、提供条件を先に確認。

V01はGX01/GX02や実ATM設置、実資金提供の完了を待たない。既存GAP01〜04は消さず、独立して進められる部分を継続する。

## 技術上の参考（採用決定・認証ではない）

- [NIST SP 800-193](https://csrc.nist.gov/pubs/sp/800/193/final)はplatform firmwareを不正変更から保護し、検知し、復旧する観点を示す。RockがNIST準拠/認証済みという意味ではなく、起動/更新/復旧の抜けを確認する参考。
- [PlayFabの冪等取引](https://learn.microsoft.com/en-us/gaming/playfab/economy-monetization/economy-v2/tutorials/idempotent-transactions-and-retries)では同じIDによる重複排除にも保持期間がある。外部の短期重複排除だけに依存せず、Rock側で交換IDと結果を永続化し、期限後の不明取引を無条件再送しない。
- [PlayFabのTransfer API](https://learn.microsoft.com/en-us/rest/api/playfab/economy/inventory/transfer-inventory-items?view=playfab-rest)は処理中の応答と後続照会を区別する。HTTP受付を交換完了としない設計の参考であり、PlayFab採用や現金交換許諾の根拠ではない。

詳細指示: [次の実行プロンプト](prompts/os-operational-base-next.md)。判定雛形: [OS受入報告](templates/os-acceptance-report.md)。
