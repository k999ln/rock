# O7 — Release・運用

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** 同一候補を再現配布し、更新失敗や端末喪失から安全に復旧する。

**主担当:** ROCK / **評価対象:** 既存QEMU previewとrelease検査の接続

## 触る場所・読む資料

- [systems/rock-star-os/](../../systems/rock-star-os)
- [public-release/rockstaros/](../../public-release/rockstaros)
- [sites/avocado-mini/](../../sites/avocado-mini)
- [.github/workflows/](../../.github/workflows)
- [docs/release-minimum-gates.md](../../docs/release-minimum-gates.md)
- [data/release-readiness.json](../../data/release-readiness.json)
- [docs/workstreams/06-native-qemu-release.md](../../docs/workstreams/06-native-qemu-release.md)
- [docs/workstreams/05-web-pwa-sites.md](../../docs/workstreams/05-web-pwa-sites.md)

## 次の作業

- **LCH07**: 同一最終候補の再現配布・導入・復旧リハーサル — 詳細: `npm run work -- LCH07`

LCH07: 対象platformとsource SHA・archive hashを一つに固定する

## 守る条件・残課題

- 同一SHAのbuildと配布物を照合する
- 鍵なし候補をproductionと呼ばない
- fresh導入とrollbackを同じ候補で行う
- 未解決: 同一最終候補の正式署名・導入・復旧・本番readbackは未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| LCH07-01（子） | 再受入する配布platform・候補SHA・archive hashを固定する | 未着手 / 共通基盤 | — |
| LCH07-02（子） | 同一候補のlicense・NOTICE・SBOMとOWNER未決を照合する | 未着手 / 共通基盤 | LCH07-01 |
| LCH07-03（子） | 候補のproduction署名・公開trust・失効/rotation証拠を結合する | 未着手 / 共通基盤 | LCH07-01 / LCH07-02 |
| LCH07-04（子） | 署名済み同一候補をfresh環境へ導入し起動・保存を再受入する | 未着手 / 共通基盤 | LCH07-03 |
| LCH07-05（子） | 同一候補の更新・rollback・backup/restore・中断復旧を受入する | 未着手 / 共通基盤 | LCH07-04 |
| LCH07-06（子） | 配布物readbackと同一候補の全受入を監査し公開可否を分離する | 未着手 / 共通基盤 | LCH07-05 |
| WEB06 | GitHubと製品紹介から主要アプリへ進む入口を整え、既存Siteの一般公開と最新版同期を確認する | 進行中 / 共通基盤 | — |
| WEB13 | 旧URLをavocadoMini公開商品Siteへ転用し、OS操作画面を管理者限定の別Siteへ移す | 進行中 / 共通基盤 | — |
| WEB14 | RockstarOS導入入口を製品ページへ置き、Pixel 10向け実インストーラーを配布・安全ゲート合格後に接続する | 進行中 / 共通基盤 | WEB13 |
| WEB01 | 主要画面のstyle契約と配備asset closureを検査し、GitHubと既存Sitesを同一commitへ固定 | 停止中 / 共通基盤 | 一般公開の意思は確認済み。既存Sitesは現在の接続アカウントでAccess Denied／project_not_foundとなり、所有workspaceの接続なしでは公開設定変更、同一SHA配備とD1本番readbackを実行できない。 |
| RLS02 | 正確な1機種・variantへ限定したPhysical Device Previewを作成・復旧検証 | 進行中 / 共通基盤 | N03 |
| LCH01 | TLS／累積timeoutの原因と最終CIの照合 | 進行中 / 共通基盤 | — |
| LCH02 | 全同梱物inventory・対応source・製品LICENSEの明示決定 | 進行中 / 共通基盤 | — |
| LCH04 | Sites履歴のコード統合・新規本人限定サイト・Sky改善 | 進行中 / 共通基盤 | — |
| LCH06 | PR系列・正確なmain統合tree・版表示の整合 | 進行中 / 共通基盤 | — |
| LCH07（親） | 同一最終候補の再現配布・導入・復旧リハーサル | 進行中 / 共通基盤 | — |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| WEB02 | Developer Preview紹介をOSインストールとSky開発者コード中心の一画面へ再設計 | 完了記録あり / 公開説明 | — |
| SYS03 | 公開方法別の最低条件を機械判定し、Web/npm SBOMと設定画面へ統合 | 完了記録あり / 共通基盤 | — |
| SYS04 | QEMU rc2を同一候補10要件へ固定し、rc2固有native SBOMを生成して旧inventoryの誤転用を拒否 | 完了記録あり / 共通基盤 | — |
| SYS08 | PWA新版の自動即時切替を廃止し、本人確認後の適用・旧cache整理・再読込へ変更 | 完了記録あり / 共通基盤 | — |
| SYS09 | PWAの同一性・scope・iPhone/Android向けinstall iconを固定し、実HTTP manifestを検査 | 完了記録あり / 共通基盤 | — |
| SYS10 | Web第三者依存のlock hash・47要review componentのPURL一覧を公開gateへ固定 | 完了記録あり / 共通基盤 | — |
| SYS11 | Vite生成chunkのnpm componentをbuild時に記録しlicense監査へ照合 | 完了記録あり / 共通基盤 | — |
| R05 | 回帰検証・移行確認・GitHub保存 | 完了記録あり / 共通基盤 | — |
| R06 | ブラウザで仕事の一連の操作を確認 | 完了記録あり / 共通基盤 | — |
| R07 | 本人限定のSitesへ公開・本番確認 | 完了記録あり / 共通基盤 | — |
| R08 | 検証結果・公開停止理由と再開設計の文書化 | 完了記録あり / 共通基盤 | — |
| V01 | 旧9abf78a候補のQEMU開発OSをbuildしD0〜D6の稼働/復旧受入を通す（現rc2へ転用しない） | 完了記録あり / 旧版・参考 | — |
| RLS01 | fresh Mac/PCへ導入できるQEMU Developer Previewを作成・検証 | 完了記録あり / 共通基盤 | — |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run release:check
npm run release:signing:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: 同一SHAでbuild、署名、fresh install、update、rollback、readbackを完走する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
O7 Release・運用の <task ID> を進める。workspaces/O7/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
