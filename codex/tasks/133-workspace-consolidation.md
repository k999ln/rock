# 133 最新mainとローカル作業を1フォルダへ統合

本人指示（2026-11-26）: avokado-mainとavokdoの分離状況を確認し、訂正「統合してほしい、最新状態の形」に従って一本化する。

## 作業と保全

- GitHub `iceiceice999/rock`のoriginを取得。基準mainは`141fdb1879`。
- `avokado-main`はmainのworktreeで275コミット遅れ、ローカル変更なし。早送り更新後、`work/workspace-refresh-20261126/main-reference`へGit worktreeとして移動。
- `avokdo`は`33e08dff28`の旧開発ブランチに未コミット35ファイルがあった。変更前の全35ファイルとSHA-256、差分、旧HEADを`work/workspace-refresh-20261126`に保全。stash `7c9e0326d724e5fd1da1848203dc22d44a9f563a`も残す。
- 新ブランチ`codex/workspace-latest-20261126`を最新mainから作り、未コミット変更を復元。文書6件の競合は最新mainの内容を土台に、ローカルの追記を残して解消。
- 旧開発ブランチにはmainと履歴上異なる8コミットがある。ブランチは保持し、旧実装の一括再マージは行わない。最新mainのdesktop等の実装を使用する。旧版との全機能同等性の再受入はこの整理では行わない。
- mainのtask102（SIM証明）・103（離脱率測定）と衝突したローカル番号を131（本人用収益パック）・132（eSIM専用クラウド設計）へ変更。関連参照も更新。
- VS Code用に`avokado.code-workspace`を追加し、統合フォルダだけを登録した。本人のロック解除後、旧ウインドウをこのworkspaceへ切り替えた。表示名は本人訂正に従い「avokado（統合版）」。復元用フォルダは日常作業に使わない。
- mainの`WorkJob.noahRevenue`とローカルパックの同名項目が衝突したため、パックの新規保存先を`noahRevenuePack`へ分離。旧`noahRevenue`のパック記録も日次上限に数え、再生成せず読み直せることを回帰試験で確認した。

## 合格条件と境界

- 作業ブランチの土台が取得済みorigin/mainと一致し、競合マーカー・未解決indexが0件。
- 変更前の全35ファイルがバックアップのSHA-256と一致し、収益パックの実装・試験ファイルを失っていない。
- eSIM設計の§8〜10とmain側の専用回線・実機受入の記述が共存する。
- 文書・型・lint・復元したパックの試験を確認し、結果を下に残す。
- 本番配備・migration・契約・個人情報送信・mainへの直接pushは行わない。

## 検証結果

- `npm ci --ignore-scripts --no-audit --no-fund`: 成功。最新mainのlockfile通りに依存を再現。package.json・package-lock.jsonに差分なし。
- `npm run typecheck`・`npm run lint:product`: 成功。
- `node --experimental-strip-types --test tests/noah-revenue-pack.test.mjs tests/noah-revenue-mobile.test.mjs tests/noah-revenue-cloud.test.mjs`: 17/17成功。ローカルloopbackの起動許可を付けて実施。
- `npm run design:check`・`npm run repository:check`・`npm run baseline:check`・`git diff --check`: 成功。
- 変更前35ファイルのバックアップSHA-256一致、HEADとorigin/main一致、未解決index 0、旧外部パス不在、workspaceの登録フォルダ1件を確認。
- VS Code実画面で`avokado (Workspace)`、単一の「avokado（統合版）」フォルダ、`codex/workspace-latest-20261126`ブランチ、統合先の`docs/structure/03-esim.md`最新本文を確認。Windowメニューのウインドウ一覧も統合版1件。旧ウインドウは切替済み、未保存内容の破棄なし（2026-11-26）。
- 全体の`npm run verify`は未実行。未コミット、PR未作成。本番配備と外部の未マージブランチの一括統合は対象外。


## 別チャットとの統合（2026-11-26）

追加照合と最新版の一覧は[task138](138-cross-chat-sync.md)。今回衝突した番号は、収益パック134、eSIM設計135、登録UX136、ピン動画137へ整理。既存の図解ピン131と携帯収益パック132は維持する。
