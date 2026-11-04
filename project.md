### Goalから役割・実行・検収・再計画（2026-11-04・ローカル候補）

ROCK / Git・CI・Operations / G04、既存AMC02・AMC06を再利用。GitHub main `9393ed97fc0333ed3a26be49c86b87fd21254b50` 基点の専用branch `codex/goal-backward-cycle-20261104`、作業場所 `/Users/kaiya/Documents/ChatGPT/avokdo/work/goal-backward-cycle`。元の `codex/esim-cloud-access` と未保存の役割定義を保持し、営業18役・開発21役をsnapshotとして取り込んだ。

既存AMC Goal reducerへ逆算DAG・役割・Codex worker/別process read-only検収・同条件の有限再計画を接続。ローカルdemoは実物4ファイル・差し戻し1回・worker試行5回/10呼出しで全task合格、CEOの最終受入待ちまで確認。専用33試験、全体verify（3961件・3957成功・0失敗・4環境skip、API1918＋CSV385）成功。実Codexのworkerと別read-only reviewerによる成果作成・検収、自然文から営業/開発の3工程・4条件の未承認計画生成も確認。[最小検証要約](data/amc/goal-cycle-validation.json)。初回子Codexのsandbox起動拒否はintent/handoffとして保持し、成果なしを照合した別runで起動・検収に成功した。

次: 本人の具体的なGoalを `plan` へ渡し、合格条件・担当・上限・owner保留を確認して有限実行する。実装と文書はこのbranch候補、main統合・公開は未実施。外部営業・需要/収益・実Provider課金・実機・Web本人台帳との自動同期は別受入。[利用と復旧](docs/amc-goal-orchestrator.md#goalから逆算するローカル実行と再計画)。

### Eve / Noah公開ソースとGitHub mainの統合（2026-11-02・検証中）

G04 / WEB04。本人指示によりmainと既存avoadoサイトを同一sourceへ統合。公開v141の7導線修正、会話・本人性runtimeを移植し、mainのowner/approval/readback、Pro仕事作成、オフライン復旧を保つ。公開SQLはbytes保持、旧main系列はdrizzle-legacyに保全。型・設計・公式Sites build、Eve→担当編集→同じ仕事のブラウザ3件、移行履歴41件の関連検証は成功。全体3927試験の初回7失敗は6件の表示/経路/SW修正と、未commit差分数上限1件に分類。コミット後の全verify・同一SHA CIが必要。

次: npm run verify（macOSはPATH先頭に /opt/homebrew/opt/openssl@3/bin）、PR CI確認、通常merge、GitHub mainと同じSHAを既存Sites projectへ公開、metadata/UI照合。main統合・公開更新はまだ未完。本番DB移行・本人経路の全面受入・課金・実機受入は今回の合格に含まない。

更新: PR #312を作成。3927試験は3923 pass /0 fail /4環境skip。APIは1918+385項目成功。CSP共通付与が厳しいexport policyを保持するよう修正。CIの空DBは合成schemaから初期化し、本番SQLは変更しない。履歴検査の44候補は19種類の公開source digest/commit/固定UUIDとして個別分類し、実Gitleaksの差替え/別path検出12試験と全履歴0候補を確認。固定controlの更新後に同一HEAD CIを再確認する。
