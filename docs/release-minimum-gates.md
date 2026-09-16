# RockstarOS 最低公開条件

2026-09-13時点。正本は `data/release-readiness.json`、自動検査は `npm run release:check`。この文書は一般的な法的助言ではなく、RockstarOSが未検証の状態を公開可能と誤表示しないための開発gateである。

## 現在の結論

| 配布方法 | 状態 | 完了 | 次に必要なこと |
| --- | --- | ---: | --- |
| Web / PWA 本人限定Preview | BLOCKED | 4/5 | 本人1名限定とsource上のHTTP防御は確認済み。最新版を同じSiteへ同期し、version・deployment・source・archive・access・実response headerを再読取りする |
| Web / PWA 一般公開Preview | BLOCKED | 3/5 | 製品ライセンスの所有者選択、公開範囲の明示承認 |
| QEMU Developer Preview配布 | BLOCKED | 6/10 | 製品ライセンス、正式署名、署名後の同一候補受入、公開承認 |
| Android系物理端末Preview | BLOCKED | 1/5 | Pixel 10 GL066は確定。次はBSP/driver/boot/recovery、CDD/CTS、署名、販売地域の確認 |
| iPhone / iPad | BLOCKED | 0/1 | 置換OSではなくPWAまたはiOS clientとして配布方式と審査を確定 |
| マイナンバー連携 | BLOCKED | 1/7 | 現在は番号・カード画像を取得しない。目的、主体/provider、data flow、保存/削除、安全管理、事故/委託先、最終有効化を別審査 |

「OSが一度起動した」「古い候補のQEMU受入に合格した」「Web画面が動く」は、別配布方法のgateを満たした証拠にはしない。各対象は必須gateがすべて `pass` の場合だけ `ready` になる。

## 自動検査すること

- 配布対象とgateの欠落、重複、宣言状態と算出状態の不一致を拒否する。
- 6つの配布対象ごとに配布区分、gate ID集合、必須/適用外区分を固定する。未達gateの削除や必須から任意への変更でreadyに見せることを拒否する。
- 本人限定Sitesの安全な配信と最新版同期を分離する。本人1名、外部visitor 0、custom access、成功deploymentはsecure-deliveryの根拠になるが、稼働versionのsourceが監査HEADより古ければ対象全体をreadyにしない。
- Web/PWAは`data/web-security-policy.json`を正本として、全responseへframe埋込み拒否、MIME sniffing拒否、外部referrer抑止、不要なbrowser capability無効化、HSTSを設定する。Service Workerとmanifestは更新を再検証するcache policyにする。最新版同期gateは、本人認証済みの実配備responseから8 headerの完全一致を再読取りするまで合格にしない。
- 根拠fileがrepository内に実在することを確認する。
- 所有者が具体的なライセンスを選択し、top-level `LICENSE` が存在しない限り、一般Web版とQEMU版の製品ライセンスを合格にできない。
- 所有者記録に正式鍵の準備と署名運用の実施がない限り、QEMU版とAndroid物理端末版のproduction署名を合格にできない。
- 製品ライセンス合格にはSPDX license ID、`OWNER_SELECTED`、UTC承認時刻、自作コード・文書だけの適用範囲、第三者license維持を要求する。rootとnative配布の `LICENSE` / `LICENSE-SCOPE.md` / `NOTICE` は6つのrole別SHA-256で固定し、同名fileのbyte一致まで確認する。license名だけ、空file、任意pathへの置換では合格にしない。
- QEMU正式署名合格には `OWNER_MANUAL` または `PROTECTED_ENVIRONMENT` の確定方式、`EXECUTED_VERIFIED`、公開鍵pin、UTC完了時刻、repository外秘密鍵、FileVaultの本人専用0700保管、暗号化backup、key ceremony・public trust・backup・rotation/失効の4つのrole別SHA-256証拠を要求する。単なる `keyProvisioned: true` や任意の完了文字列では合格にしない。Androidのproduction署名は端末固有のAVB/OTA・rollback・rotation証拠で別判定し、QEMU鍵の状態を流用しない。
- `package-lock.json` の899 package entryにlicense metadataがあることを確認する。さらにlock全体のSHA-256、866 unique component、17 license expressionの件数を`data/web-third-party-license-audit.json`へ固定し、MPL/LGPL系41件、選択式5件、CC-BY表示1件の計47件をPURL（component名・version）単位の追加review対象として保持する。lock上は本番到達可能な必須7件・optional 11件、開発専用の必須4件・optional 25件に分離し、1件でも省略・差替え・本番範囲から隠せばrelease検査を失敗させる。このlock監査単独はpackage-lock inventoryであり、実browser bundleへの同梱判定、各義務の履行、法的clearanceの代用にはしない。
- `vite.config.ts` の専用pluginはclient・RSC・SSRの生成chunkが報告するmoduleをpackage-lockの正確なpathへ戻し、PURL・version・licenseをignored `work/release/web-bundle-components.json`へ0600で生成する。未解決node_modules、lock hash不一致、3環境欠落を失敗させ、`npm run release:web-bundle:check`が追加review一覧と照合する。2026-09-13のローカルbuildでは120 component、未解決0、上記47件の生成bundle内該当0だった。これは生成chunkのmodule同梱範囲を示すが、build toolの利用条件、license本文・NOTICE・source提供、製品license選択、法的clearanceを免除しない。
- `npm run release:signing:check` で候補準備15件、owner legal approval 11件、保護署名29件、本人署名9件の計64公開fixture試験を実行する。試験数の減少も失敗させるが、実鍵・実承認の代用にはしない。本人署名は未暗号化／ExFAT／別mountの保管先を鍵読取り前に拒否する。
- `npm run release:sbom` でCycloneDX 1.6のWeb/npm SBOM、現在のrc2 native SBOM、旧9ab native SBOMをignored `work/release/`へ分離生成する。Webは854 unique component、現在のrc2と旧9abはそれぞれtarget 24＋host build 37 component。rc2版は配布archiveと同梱legal bundleのSHA-256へ結合し、旧版は方法検証だけに限定する。
- QEMUの署名後受入を`docs/templates/qemu-post-signing-acceptance.json`へ固定し、同一archiveの署名前後hash、production署名pin、license/NOTICE/SBOM、fresh環境、認証・導入・更新・rollback・backup・restore・中断復旧・診断・正常終了・削除の10項目と各原本hashが揃わない合格宣言を拒否する。
- Android物理端末は[端末固有監査](android-and-personal-number-gates-20260913.md)で、正確な型番/SKU、BSP/boot/recovery、同一buildのCDD/CTS、production署名、販売地域の5必須gateを固定する。GMSなしAOSP Previewを既定とし、GMS許諾をAndroid互換から推定しない。
- マイナンバー連携は同じ監査で7必須gateへ分解し、最終有効化まで番号・カード画像・通常profile項目を無効にする。目的や安全対策だけでなく、取扱主体/provider、保存・削除、事故対応・委託先監督、最終承認の証拠を要求する。
- Androidとマイナンバーの合格証拠は、gateごとに定義した全roleの別ファイル、repository内path、実byteのSHA-256を要求する。型番/SKU→BSP/boot/recovery→CDD/CTS・production署名、および目的/主体→data flow・安全管理→事故/委託先→有効化の依存順序を飛ばしたPASSを拒否する。

QEMUは[候補単位の完了監査](qemu-release-completion-audit-20260912.md)で、rc2の版、source commit、archive SHA-256を受入とinventoryへ結合する。旧9abのlegal-infoをrc2固有SBOMとして転用した場合、または公開台帳とQEMU監査の状態がずれた場合は検査を失敗させる。

## 自動では完了できない条件

### 今必要な所有者入力

QEMU Developer Previewを次の工程へ進めるには、所有者本人から次の内容を一つの明示回答として受け取る。これより弱い「それで」「進めて」「いいよ」は、MIT条文、商用利用・販売・再許諾、OWNER_MANUAL、本番鍵生成またはSites再同期の個別承認へ読み替えない。

> MITで確定。自作コード・文書だけMIT、第三者部分は各ライセンスを維持。OWNER_MANUALを採用し、準備済みFileVault領域への本番鍵生成を許可する。最新版を本人限定Sitesへ同期してよい。一般公開はまだしない。

この回答が必要な理由は、製品ライセンスが第三者の権利範囲と商用・再許諾条件を変え、本番鍵生成が長期の失効・rotation責任を発生させ、Sites同期がrepository sourceを外部ホスティングへ送る操作だからである。回答後も一般公開、main merge、Android実機対応、マイナンバー有効化を自動承認しない。

Android実機版は上記とは別に、実物から読み取った `機種名 / 型番 / SKU / 販売地域 / 現在OS / OEM unlocking可否 / bootloader状態` が必要。このreadbackは2026-09-16にPixel 10／GL066／frankelで完了した。単体APKのoffline AI試験も合格したが、BSP／boot／recovery、CDD／CTS、production署名、販売地域の4必須gateとavocadoOSのflash／bootは未合格である。

### 製品ライセンス

現在の記録は、自作部分の改変・再配布を許可したい意向とMIT提案までで、MITの明示選択ではない。agentは所有者に代わって採用を確定せず、第三者code・font・image・Buildroot packageへ自作部分のlicenseを上書きしない。

### 正式署名

OWNER_MANUALは提案中だが未実施。agentは明示権限なしにproduction鍵を生成・保管しない。選択後も秘密鍵をGit、Sites archive、診断JSON、Chatへ置かず、失効・rotation・rollback手順と公開trust情報を同じceremonyで固定する。

### 物理端末

対応機種名だけでは不足する。購入/所有する正確な型番・SKU、bootloaderの解除可能性、SoC/BSP/vendor driver、partition、secure boot、recovery、radio、地域を読み取ってから、一機種一variant単位でbuild、flash、復旧、更新、rollbackを実測する。iPhone/iPadはこの手順の一般対象にしない。

### マイナンバー

通常profileの便利な事前入力として番号を保存しない。必要性が確定するまで番号そのものを取得せず、identity連携と特定個人情報の保存を分ける。利用目的、取扱主体/provider、委託先、アクセス制御、保存期間、削除、監査、事故対応、最終有効化を7gateで独立確認する。

## 更新時の手順

1. `data/release-readiness.json` の該当gateへ同一候補の根拠を追加する。
2. `npm run release:check` と `npm run verify` を実行する。
3. 配布物を作る場合は `npm run release:sbom` の結果、license、notice/source対応を同一候補へ結合する。
4. 署名後にbyteを変更せず、署名・hash・license/notice・fresh導入・更新・復旧の証拠を同じ候補へ固定する。
5. `ready` 表示は検査が通った配布方法だけに限定する。
