# task99 — Noahの成果データを本人と運営が使う

本人指示: Agentから得たデータの収集について「本人の保存・検索・出力」と「明示同意した運営への提供」の両方。

正本: `docs/services/noah-result-data.md`、`docs/structure/04-eve-noa-amc-sky.md`。既存Workの成果を再利用する。

## 合格条件

- 本人の成果一覧、検索、ページ送り、JSON/ファイル出力。
- 未選択・未同意では提供しない。サーバーが所有権・成果版・選択ファイルを確認。
- 専用権限の運営だけが有効な提供を閲覧・出力できる。
- 撤回は本文を削除し、再送で復活しない。別account・古い版・同じIDでの変更を拒否。
- 画面のaccount切替/認証失敗で前の内容と選択を破棄。
- SQLの両系統・schemaを揃え、試験・typecheck・lint・全体verifyを記録。

## やらないこと

本番migration・配備・切り替え、利用統計への本文追加、成果の自動提供、機械学習・販売・公開、Mac私有成果の自動アップロード。A2Aの既存出力機能の置換。

## 進捗

実装と焦点試験が完了。[PR #334](https://github.com/k999ln/rock/pull/334)。全体verifyの最終工程を実行中。

- `node --experimental-strip-types --test tests/noah-result-data*.test.mjs tests/database-status.test.mjs tests/migration-union.test.mjs tests/sites-owner-workspace-recovery.test.mjs`: 40/40成功（新機能18群、DB互換22群）。
- 最終差分の `node --experimental-strip-types --test tests/noah-result-data*.test.mjs`: 21/21成功。元Work削除後の撤回、通信断後の同じ操作IDでの再試行を追加検証。
- `npm run typecheck` / `npm run lint:product`: 成功。
- 全体検証: `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`。
- SQL `0045_noah_result_data.sql` は両系統に追加しただけ。本番適用なし。
- #332 をbaseにした積み上げPRとして更新する。
