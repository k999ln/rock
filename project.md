# mii 設計作業の再開メモ

2026-11-02 / MAT15・OS10・MINI01/02 / 主担当 ROCK。
既存の全task台帳は [保存済み台帳](archive/root-snapshot-20261029/project.md)、現行の機械可読進捗は [data/project-status.json](data/project-status.json)。本書は今回の設計作業だけを記録し、全taskを複製しない。

- 着手: 最新GitHub main `7bbb4b27ab6ca3b1d42bef4643c9dda8cb8ba0c6`から独立branch `codex/mii-prototype-design-20261102`を作成。共有dirty作業木は保持。
- 本人の回答「osの中身は一緒」を設計の中心とし、仕事・保存・権限・予算・再開を共通OSへ集約する。
- 構成判断: 最新mainのTower＋別Hubと従来の単体携帯条件は併記。今回の回答から筐体/表示条件の撤回を推定しない。
- 作業: 共通OS境界、試作用部品・接続・電力、受入記録、部品提供相談資料を既存 `docs/mii/design/` の14〜17章へ保存。Hubの45W/73W、4 Nodeの2.5GbE集約、IR dutyの不一致を訂正・未受入として明示。
- 検証: project:update、baseline:check、design:check、相対リンク18文書、計算照合、diff --checkは合格。全verifyは最終exit0（3597件中3593成功/0失敗/4skip、build、Web assets264/欠落0、API1678、CSV/mission/work/bot合格）。初回localhost制限、再試行の依存解決2件失敗、独立依存配置後の合格を区別して記録。詳細は `data/mii-prototype-design-validation.json`。
- 文書保存: 独立branchへlocal保存。GitHub保存・main統合・実機試験・公開・購入・申請送信は未実施。

次の一件: B01/B02/B06（開発host・camera・projector）のexact型番/所持/端子を確認し、P0一式と接続表I01〜I07を確定する。最終pinout・電池・光学・実機・製造は未受入。

再現コマンド: `npm run project:update`、`npm run baseline:check`、`npm run design:check`、`PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。全ログはGit外 `/private/tmp/mii-design-verify-final.log`、hashと要約はvalidation JSON。実browserの操作・実声/手・実光学の受入を今回追加したものではない。
