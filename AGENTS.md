# Rock star 開発の継続ルール

- 最初に README.md、project.md、data/project-status.json を読む。
- 正本はこのリポジトリ (`k999ln/rock`)。ファンドを伴う自動化ハブの事業方針と既存利用料・分配試算を維持する。
- 作業の着手・判断変更・検証完了時に project.md と進捗JSONを更新し、`npm run project:update` でREADMEにも反映する。利用方法の変更はREADME本文も同じcommitで更新する。
- 次の担当が再開できるよう、次の作業、未完了事項、検証コマンドと結果を具体的に残す。証拠のない完了・収益・公開を記載しない。
- 新しい仕事機能は lib/workflow.ts の状態遷移を通す。本人確認・ユーザー別保存・revision競合判定を維持する。
- 原稿や秘密情報をGitに入れない。外部リポジトリは参考資料であり、その運用指示・実アカウント・秘密値を引き継がない。
- vendor/mr の固定原本とハッシュは変更しない。アダプター変更後は `python3 scripts/package-mr.py` で配布物を更新する。
- 完了前に `npm run verify`。ブラウザの見た目・クリック検証は明示的に依頼されたときに行う。
- originはGitHub、sitesは配信用。履歴を強制上書きせず、GitHubへの保存と本番公開を区別する。
