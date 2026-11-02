### Eve / Noah公開ソースとGitHub mainの統合（2026-11-02・検証中）

G04 / WEB04。本人指示によりmainと既存avoadoサイトを同一sourceへ統合。公開v141の7導線修正、会話・本人性runtimeを移植し、mainのowner/approval/readback、Pro仕事作成、オフライン復旧を保つ。公開SQLはbytes保持、旧main系列はdrizzle-legacyに保全。型・設計・公式Sites build、Eve→担当編集→同じ仕事のブラウザ3件、移行履歴41件の関連検証は成功。全体3927試験の初回7失敗は6件の表示/経路/SW修正と、未commit差分数上限1件に分類。コミット後の全verify・同一SHA CIが必要。

次: npm run verify（macOSはPATH先頭に /opt/homebrew/opt/openssl@3/bin）、PR CI確認、通常merge、GitHub mainと同じSHAを既存Sites projectへ公開、metadata/UI照合。main統合・公開更新はまだ未完。本番DB移行・本人経路の全面受入・課金・実機受入は今回の合格に含まない。

更新: PR #312を作成。3927試験は3923 pass /0 fail /4環境skip。APIは1918+385項目成功。CSP共通付与が厳しいexport policyを保持するよう修正。CIの空DBは合成schemaから初期化し、本番SQLは変更しない。履歴検査の44候補は19種類の公開source digest/commit/固定UUIDとして個別分類し、実Gitleaksの差替え/別path検出12試験と全履歴0候補を確認。固定controlの更新後に同一HEAD CIを再確認する。
