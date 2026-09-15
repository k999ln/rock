# QEMU Developer Preview 配布完了監査 — 2026-09-12

正本は `data/qemu-release-audit.json`、自動検査は `npm run release:check`。対象は `1.0.0-preview.20260911-rc2`、source `b7d819cd291b653d165aa124f25a52b9898bfb2e`、archive SHA-256 `5ce072f65fc4e24212ff6acc6887cbb03f3e7f664b50d574756738892e4ed95e`。GitHub ReleaseはDraftであり、一般配布済みとは扱わない。

## 判定

**6/10要件合格、BLOCKED。** rc2そのものについて候補同一性、開発鍵と復旧guard、16操作の更新・rollback、保存と中断復旧、反復boot・原本照合、同梱legal-info由来のnative部品表まで証拠を結び直した。残る4件は、製品license、production署名、署名後の同一候補受入、一般公開承認である。

| 要件 | 状態 | 今ある証拠と限界 |
| --- | --- | --- |
| 候補同一性 | PASS | 受入、434,523件inventory、Web表示のsource/version/archiveを照合 |
| security基礎 | PASS | 開発鍵検証、復旧中の3起動guard、復旧後の元端末拒否。production trust rootではない |
| update / rollback | PASS | 固定b7 imageで導入・更新・権限承認・rollback・無効化・削除・再導入を含む16操作。D2全体完了とはしない |
| recovery / backup | PASS | A/B/dataと外部authorityを保全し、16 MiB中断後に同じ要求で復旧。別host全損復旧は未検証 |
| diagnostics / acceptance | PASS | D1/D3、D4原本、D6の5boot・61反復・約60分・正常終了を範囲付きで照合。取消操作1回は未観測のまま保持 |
| rc2固有native SBOM | PASS | SHA-256一致を確認したrc2 archiveから同梱legal bundleを抽出。target 24＋host build 37 componentを同じarchive SHA-256へ結合。製品licenseの許諾判断は別gate |
| 製品license | BLOCKED | MITは提案であり所有者選択ではない。top-level LICENSEなし |
| production署名 | BLOCKED | 候補準備・法務承認・保護署名・本人署名の公開fixture 64試験は全体verifyに統合。未暗号化／ExFAT保管先は鍵読取り前に拒否。Ed25519 OWNER_MANUAL案はあるが正式鍵の作成・暗号化保管・失効ceremonyは未実施 |
| 署名後の同一候補受入 | BLOCKED | license、SBOM、署名を加えると配布byteが変わるため、新SHA-256へfresh導入・更新・復旧を結び直す必要がある。署名後受入templateと機械検査を追加し、署名pin、license/NOTICE/SBOM、fresh環境、10操作の各原本hashが揃わないPASSを拒否する |
| 一般公開承認 | BLOCKED | rc2 ReleaseはDraft。全gate合格前に公開しない |

## native SBOMの扱い

`npm run release:sbom`はWeb/npm、現在のrc2 native、旧9ab nativeのCycloneDX 1.6を別fileへ生成する。現在のrc2 native SBOMはtarget 24、host build 37の計61 componentで、scopeを各componentへ保持する。metadataにはrc2 source commit、配布archive名とSHA-256、同梱legal bundle SHA-256、製品license未許諾の境界を埋め込む。

元データは `data/qemu-rc2-legal-info/manifest.csv`（SHA-256 `6097748bfdab6974bbe42d8bb1752866d8ad4394d425bd1775d83d28ad8e628d`）と `host-manifest.csv`（SHA-256 `c30fd6fb9177f8336154be1d007cd9b8dd79b5cceed2490655bb82839f413529`）。配布archive SHA-256 `5ce072f65fc4e24212ff6acc6887cbb03f3e7f664b50d574756738892e4ed95e`、同梱 `legal/buildroot-legal-info.tar.gz` SHA-256 `ad6453366b752e91d4ae1cf0b6384b1534e53e13643ed6b1f426e674d9ec3d94`との一致を検査する。

署名後受入は、単なるチェック欄ではなく、production署名の独立pin、製品license・NOTICE・SBOMのhash、署名前後で同じarchive SHA-256、fresh workspace、`virt-10.0`実行環境、認証・fresh導入・更新・rollback・backup・restore・中断復旧・診断・正常終了・削除の10項目を要求する。各項目はrepository内の原本pathと実byteから再計算したSHA-256が一致した場合だけ合格できる。現在のtemplateは全項目`NOT_RUN`であり、実施証拠には数えない。

旧9ab SBOMも方法比較用に別生成するが、metadataへ「historical evidence only; not current rc2 and not license clearance」を固定する。現在のmanifestのsource commit、archive SHA、legal bundle SHA、CSV hash、component数のどれかが変われば `npm run release:check` は失敗する。自作のrock component 3件にある `Proprietary (project license not yet selected)` は発見したまま保持し、部品一覧の完成を製品license許諾と混同しない。

## 次の実行順

1. 所有者が自作部分のlicenseを選択し、適用範囲を固定する。
2. 選択したlicense、notice/source対応と現在のnative CycloneDXを同一最終archiveへ含める。
3. 所有者が秘密鍵の保管先と管理者を指定し、正式Ed25519鍵、公開鍵fingerprint、失効・rotation手順を固定する。
4. 同一最終archiveへ署名し、署名後はbyteを変更しない。
5. 新しいarchive SHA-256でfresh導入、update/rollback、backup/restore、取消・中断、正常終了、診断、削除を再受入する。
6. 全証拠をReleaseへ結合し、所有者の明示承認後にだけDraftを公開する。

Android実機、iPhone/iPad client、一般Web公開、マイナンバーはこの10要件へ混ぜず、それぞれの配布gateで判断する。
