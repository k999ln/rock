# QEMU Developer Preview 配布完了監査 — 2026-09-12

正本は `data/qemu-release-audit.json`、自動検査は `npm run release:check`。対象は `1.0.0-preview.20260911-rc2`、source `b7d819cd291b653d165aa124f25a52b9898bfb2e`、archive SHA-256 `5ce072f65fc4e24212ff6acc6887cbb03f3e7f664b50d574756738892e4ed95e`。GitHub ReleaseはDraftであり、一般配布済みとは扱わない。

## 判定

**5/10要件合格、BLOCKED。** rc2そのものについて候補同一性、開発鍵と復旧guard、16操作の更新・rollback、保存と中断復旧、反復boot・原本照合まで証拠を結び直した。残る5件は、rc2固有native SBOM、製品license、production署名、署名後の同一候補受入、一般公開承認である。

| 要件 | 状態 | 今ある証拠と限界 |
| --- | --- | --- |
| 候補同一性 | PASS | 受入、434,523件inventory、Web表示のsource/version/archiveを照合 |
| security基礎 | PASS | 開発鍵検証、復旧中の3起動guard、復旧後の元端末拒否。production trust rootではない |
| update / rollback | PASS | 固定b7 imageで導入・更新・権限承認・rollback・無効化・削除・再導入を含む16操作。D2全体完了とはしない |
| recovery / backup | PASS | A/B/dataと外部authorityを保全し、16 MiB中断後に同じ要求で復旧。別host全損復旧は未検証 |
| diagnostics / acceptance | PASS | D1/D3、D4原本、D6の5boot・61反復・約60分・正常終了を範囲付きで照合。取消操作1回は未観測のまま保持 |
| rc2固有native SBOM | BLOCKED | current inventoryは434,523件を照合したがlicense declarationはNOASSERTION。旧9abの61 componentは方法検証だけで転用不可 |
| 製品license | BLOCKED | MITは提案であり所有者選択ではない。top-level LICENSEなし |
| production署名 | BLOCKED | Ed25519 OWNER_MANUAL案はあるが正式鍵の作成・保管・失効ceremonyは未実施 |
| 署名後の同一候補受入 | BLOCKED | license、SBOM、署名を加えると配布byteが変わるため、新SHA-256へfresh導入・更新・復旧を結び直す必要がある |
| 一般公開承認 | BLOCKED | rc2 ReleaseはDraft。全gate合格前に公開しない |

## native SBOMの扱い

`npm run release:sbom`はWeb/npm SBOMと、旧9ab legal-infoのCycloneDX 1.6を別fileへ生成する。旧native SBOMはtarget 24、host build 37の計61 componentで、scopeを各componentへ保持する。metadataには旧source commitと「historical evidence only; not current rc2 and not license clearance」を埋め込む。

これは変換方法とlicense metadataの欠落検査を先に完成させるための成果である。rc2の同梱 `legal/buildroot-legal-info.tar.gz` はarchive内でhash固定されているが、repositoryに `manifest.csv` / `host-manifest.csv` の内容がない。1GB配布archiveの存在や旧9abの同名packageを理由に、rc2固有SBOMを推定しない。

## 次の実行順

1. 所有者が自作部分のlicenseを選択し、適用範囲を固定する。
2. rc2と同じbuildからlegal-infoを再生成し、current native CycloneDXとlicense/notice/source対応をarchiveへ含める。
3. 所有者が秘密鍵の保管先と管理者を指定し、正式Ed25519鍵、公開鍵fingerprint、失効・rotation手順を固定する。
4. 同一最終archiveへ署名し、署名後はbyteを変更しない。
5. 新しいarchive SHA-256でfresh導入、update/rollback、backup/restore、取消・中断、正常終了、診断、削除を再受入する。
6. 全証拠をReleaseへ結合し、所有者の明示承認後にだけDraftを公開する。

Android実機、iPhone/iPad client、一般Web公開、マイナンバーはこの10要件へ混ぜず、それぞれの配布gateで判断する。
