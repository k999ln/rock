# mii 設計作業の再開メモ

2026-11-02 / MAT15・OS10・MINI01/02 / 主担当 ROCK。
既存の全task台帳は [保存済み台帳](archive/root-snapshot-20261029/project.md)、現行の機械可読進捗は [data/project-status.json](data/project-status.json)。本書は今回の設計作業だけを記録し、全taskを複製しない。

- 着手: 最新GitHub main `7bbb4b27ab6ca3b1d42bef4643c9dda8cb8ba0c6`から独立branch `codex/mii-prototype-design-20261102`を作成。共有dirty作業木は保持。
- 本人の回答「osの中身は一緒」を設計の中心とし、仕事・保存・権限・予算・再開を共通OSへ集約する。
- 構成判断: 最新mainのTower＋別Hubと従来の単体携帯条件は併記。今回の回答から筐体/表示条件の撤回を推定しない。
- 作業: 共通OS境界、試作用部品・接続・電力、受入記録、部品提供相談資料を既存 `docs/mii/design/` の14〜17章へ保存。Hubの45W/73W、4 Nodeの2.5GbE集約、IR dutyの不一致を訂正・未受入として明示。
- 検証: project:update、baseline:check、design:check、相対リンク18文書、計算照合、diff --checkは合格。全verifyは最終exit0（3597件中3593成功/0失敗/4skip、build、Web assets264/欠落0、API1678、CSV/mission/work/bot合格）。初回localhost制限、再試行の依存解決2件失敗、独立依存配置後の合格を区別して記録。詳細は `data/mii-prototype-design-validation.json`。
- 文書保存: 独立branchへlocal保存。GitHub保存・main統合・実機試験・公開・購入・申請送信は未実施。

次の一件（W1更新）: 18章の選定部品と現物/board版を照合→P0bの入力選択/停止/保存→P1aの単体capture。projector型番、端末内日本語ASRの可用性、Pi初期Wi-Fi/SSH、Node adapter、2台同期は未解決。製品pinout・電池・光学・実機・製造は未受入。

再現コマンド: `npm run project:update`、`npm run baseline:check`、`npm run design:check`、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。全ログはGit外 `/private/tmp/mii-design-verify-final.log`、hashと要約はvalidation JSON。実browserの操作・実声/手・実光学の受入を今回追加したものではない。

## 実機配線の具体化（2026-11-02）

本人依頼で共通OSを保持し、型番/端子と組立配線を具体化する。提示画像でMacBook Pro 14-inch（2024年11月）/M4/16GB/macOS Sequoia15.7.4を確認。個体シリアルと画像はGitへ保存しない。P0はこのMacをhost、P1は必要に応じて外付けsensor Nodeとして設計。最終筐体・表示4条件・実機未受入を維持する。公式資料で型番/connector/電源を確認し、BOM・配線図・通電前手順・未実装adapterを同期する。

- 設計判断: Mac＋BRIO 500 960-001493のP0b、Pi 5 4GB＋SC0715のP1aを選定。P1aは1台のfree-running capture用で、2台同期P1bや4 Tower完成ではない。公式製品名/variantを注文照合キーにし、未確認SKUは作らない。
- 作成: 18章、機械可読BOM（14点/9接続）、reportlab再生成source、A3横3ページのPDF。公式資料18系列を照合。最終3ページをrenderして文字/線/表の重なりがないことを確認。
- 残作業: 現物受領とW-A01〜04、Node capture adapter、A01等の実入力/保存/復旧、projector型番と光学条件。購入/OS書込/実通電/外部連絡/公開は行っていない。

- W1検証完了: `npm run project:update`、全`npm run verify`はexit0（3597件中3593成功/0失敗/4skip、Web assets264/欠落0、API1678、CSV385、mission/work/bot合格）。BOM14点/9接続の本文一致、19文書の相対リンク欠落0、PDF3ページの抽出/目視、帯域計算、diff checkを確認。要約/文書hashは `data/mii-prototype-wiring-validation.json`、全ログはGit外 `/private/tmp/mii-wiring-verify.log`。
- 保存区分: 本作業branchで文書・生成sourceをlocal保存。PDFはGit外の再生成artifact。GitHub保存・main統合は未実施。
