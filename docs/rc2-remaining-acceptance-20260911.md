# rc2 の追加受入 — 2026-09-11

状態: **内部検証を継続中。一般公開は未完了。** 対象配布物は `1.0.0-preview.20260911-rc2`、native source は `b7d819cd291b653d165aa124f25a52b9898bfb2e`。前回の[導入・保存・再起動・中断復旧](os-acceptance-b7d819c-20260911.md)の3bootとデータは保持している。

## 今回の範囲

- 仕事のlifecycle: 固定b7 imageの別端末で、初回空状態と仕事操作後の2正常boot/終了。導入・更新・権限承認・rollback・無効化・削除・再導入を含む16操作、5jobがPASS_SCOPED。削除後も保存結果を開けることを確認した。これはD2全体や、この5job作成後の再起動試験の合格ではない。
- fresh SDK: 配布archiveから新しいclient/authorityへ702 native fileを展開し、全hash/size/modeを照合。固定sampleによる初回Game A交換、SDK側authorityの停止、元のGame B要求の通信不可診断、同じkeyでの再開、2件完了を4.119秒で確認。独立した停止台帳でも9794c、Game fee6c、hold0、A/B各10単位・grant各1、入金1、月額/引出0、5DB/71表のsnapshotが一致した。合成データ・機械時間の内部検証であり、人の導入時間や新VMの受入ではない。
- OS削除: 別の新規 `/private/tmp/rk11-rc2-remove` へ同じ配布物を導入。`--delete-data`なしの削除を拒否し、対象VMを保持した後、明示付きで製品のremoveを実行。対象VMだけが消え、REMOVED receiptとhost packageが残った。元の受入VM・build設定は不変。これは未起動の空の導入先での削除であり、保存データあり/復旧端末の削除は試していない。
- D6: 別端末で元の5boot・61反復・60分・資源上限・全authority完全不変条件を実行中。元observer・閾値は変更していない。D4に依存しないこの限定検証を先行したことを独立planへ明記した。
- D4: ローカルでは全41bootの原本保存容量を確保できない。GitHub容量試験 [34615891045](https://github.com/k999ln/rock/actions/runs/34615891045) は空き92,420,886,528 bytes/4CPU/16,766,414,848 bytes RAMでPASS。これは容量だけの結果で、D4はまだ未実行。別のprivate evidence Draft `387142563` を用意し、固定入力/全証跡保存の実行処理はLinuxで22fixture PASS、最終独立レビューも完了し、実行を開始する。配布用Draft `386933271` は8資産のまま。

## 署名とサイト

署名用controlの後続修正2点を、実装2file＋既存test1fileに限定して[Draft PR #6](https://github.com/k999ln/rock/pull/6)へ分離した。個人repositoryのREST欠落時に同じref/SHAのGraphQLゼロ件で保護を確認し、増大するassetの読み取りを開始時size＋1byteで止める。29tests PASS、独立コードレビューで修正必須の所見なし。実policy/trust/keyは含まず、controlのlockや固定SHA変数を変更していない。

[PR #5](https://github.com/k999ln/rock/pull/5)の限定main bootstrap、独立reviewer、管理鍵・Environment、製品license/権利者表記の決定が必要。実署名の承認待ちrunは0。元Sitesの取得は今回もNOT_FOUNDで、再接続が必要。一般公開・main merge・実資金・実機は実施していない。

## 証跡

原本はprivate作業領域 `work/remaining-20260911/` とbuild VMの別検証rootに保存する。大きなdiskや全raw logはGitへ入れず、完了分は[仕事のlifecycle](evidence/rls01/remaining-b7-rc2/lifecycle.json)・[fresh SDK](evidence/rls01/remaining-b7-rc2/sdk.json)・[空の導入先の削除](evidence/rls01/remaining-b7-rc2/empty-removal.json)に最小要約と固定hashを保存した。元の9ab受入はrc2の合格へ転用しない。
