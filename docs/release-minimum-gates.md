# RockstarOS 最低公開条件

2026-09-12時点。正本は `data/release-readiness.json`、自動検査は `npm run release:check`。この文書は一般的な法的助言ではなく、RockstarOSが未検証の状態を公開可能と誤表示しないための開発gateである。

## 現在の結論

| 配布方法 | 状態 | 完了 | 次に必要なこと |
| --- | --- | ---: | --- |
| Web / PWA 本人限定Preview | READY | 3/3 | 現在の本人限定運用を維持し、更新ごとに全検証を再実行する |
| Web / PWA 一般公開Preview | BLOCKED | 2/4 | 製品ライセンスの所有者選択、公開範囲の明示承認 |
| QEMU Developer Preview配布 | BLOCKED | 5/10 | rc2固有native SBOM、製品ライセンス、正式署名、署名後の同一候補受入、公開承認 |
| Android系物理端末Preview | BLOCKED | 0/5 | 正確な機種/SKU、BSP/driver/boot/recovery、CDD/CTS、署名、販売地域の確認 |
| iPhone / iPad | BLOCKED | 0/1 | 置換OSではなくPWAまたはiOS clientとして配布方式と審査を確定 |
| マイナンバー連携 | BLOCKED | 1/3 | 現在は無効を維持。目的・必要性・取扱主体と安全管理措置を別審査 |

「OSが一度起動した」「古い候補のQEMU受入に合格した」「Web画面が動く」は、別配布方法のgateを満たした証拠にはしない。各対象は必須gateがすべて `pass` の場合だけ `ready` になる。

## 自動検査すること

- 配布対象とgateの欠落、重複、宣言状態と算出状態の不一致を拒否する。
- 根拠fileがrepository内に実在することを確認する。
- 所有者が具体的なライセンスを選択し、top-level `LICENSE` が存在しない限り、一般Web版とQEMU版の製品ライセンスを合格にできない。
- 所有者記録に正式鍵の準備と署名運用の実施がない限り、QEMU版とAndroid物理端末版のproduction署名を合格にできない。
- `package-lock.json` の887 package entryにlicense metadataがあることを確認する。
- `npm run release:sbom` でCycloneDX 1.6のWeb/npm SBOMと旧9ab native SBOMをignored `work/release/`へ分離生成する。Webは854 unique component、旧nativeはtarget 24＋host build 37 component。旧nativeは方法検証でありrc2の合格証拠にしない。
- マイナンバー連携は法務・安全管理審査が終わるまで機能無効を必須とする。

QEMUは[候補単位の完了監査](qemu-release-completion-audit-20260912.md)で、rc2の版、source commit、archive SHA-256を受入とinventoryへ結合する。旧9abのlegal-infoをrc2固有SBOMとして転用した場合、または公開台帳とQEMU監査の状態がずれた場合は検査を失敗させる。

## 自動では完了できない条件

### 製品ライセンス

現在の記録は、自作部分の改変・再配布を許可したい意向とMIT提案までで、MITの明示選択ではない。agentは所有者に代わって採用を確定せず、第三者code・font・image・Buildroot packageへ自作部分のlicenseを上書きしない。

### 正式署名

OWNER_MANUALは提案中だが未実施。agentは明示権限なしにproduction鍵を生成・保管しない。選択後も秘密鍵をGit、Sites archive、診断JSON、Chatへ置かず、失効・rotation・rollback手順と公開trust情報を同じceremonyで固定する。

### 物理端末

対応機種名だけでは不足する。購入/所有する正確な型番・SKU、bootloaderの解除可能性、SoC/BSP/vendor driver、partition、secure boot、recovery、radio、地域を読み取ってから、一機種一variant単位でbuild、flash、復旧、更新、rollbackを実測する。iPhone/iPadはこの手順の一般対象にしない。

### マイナンバー

通常profileの便利な事前入力として番号を保存しない。必要性が確定するまで番号そのものを取得せず、identity連携と特定個人情報の保存を分ける。利用目的、取扱主体、委託先、アクセス制御、保存期間、削除、監査、事故対応を専門家と確認した後に別gateを作る。

## 更新時の手順

1. `data/release-readiness.json` の該当gateへ同一候補の根拠を追加する。
2. `npm run release:check` と `npm run verify` を実行する。
3. 配布物を作る場合は `npm run release:sbom` の結果とnative inventoryを候補へ結合する。
4. 署名後にbyteを変更せず、署名・hash・license/notice・fresh導入・更新・復旧の証拠を同じ候補へ固定する。
5. `ready` 表示は検査が通った配布方法だけに限定する。
