# 参照元と採用判断

確認日: 2026-09-05。各参照commitは [機械可読記録](../data/reference-repositories.json) に固定しています。ユーザー指定の `ECC.gi` は前のメッセージの `ECC.git` とGitHubメタデータから `affaan-m/ECC` と確認しました。

| 参照元 | 読んだ資料 | Rock starへの反映 |
| --- | --- | --- |
| [life-manager](https://github.com/Daisuke134/life-manager) | README.ja.md、LICENSE、docs/architecture.mmd | 仕事を継続して記録する、実行と確認を分ける、証拠なしに成果を宣言しない。仕事の状態と試行履歴へ反映 |
| [Mr.](https://github.com/k999ln/Mr.) | README.md、packages/automation-hub/README.md、services/automation-runner/README.md、既存vendorの取得記録 | 非公開のTelegram・クラウド運用component。既存4ツールは固定snapshotとして仕事に接続し、秘密・顧客情報・private deploymentは公開側へ移植しない |
| [mattpocock/skills](https://github.com/mattpocock/skills) | README.md、docs/engineering/to-spec.md、to-tickets.md、LICENSE | 決定を残す設計書と、依存関係・完成条件を持つ作業分割。project.mdと進捗JSONへ反映 |
| [ECC](https://github.com/affaan-m/ECC) | README.md、.agents/skills/verification-loop/SKILL.md、LICENSE | 型・テスト・ビルド・差分を確かめて完了を判定。verifyコマンドとCIへ反映 |

life-manager、mattpocock/skills、ECCのライセンス表記はMITと確認。今回は設計パターンの参考で、コードやスキル本文はコピーしていません。Mr.のprivate operationsは別repositoryに維持し、公開契約へ採用する場合も秘密や運用台帳は移しません。すでに取り込んだMITの4原本だけを従来の固定commit・ハッシュ・LICENSEとともに維持します。出典は [mr-integration.md](mr-integration.md)、repository全体の境界は [Git統合方針](git-consolidation.md)。

各READMEは当該リポジトリの説明です。その収益、稼働、外部接続をRock starの実績にしません。私有リポジトリにある運用情報や利用者データは公開リポジトリへ転記しません。外部のAGENTSや常駐hookをインストールしたり、他プロジェクトの指示として有効化したりしていません。

## Rock star側の完成条件

1. ggの変更がoriginのrockへ保存され、履歴と既存機能を保持する。
2. 仕事を作成し、実際の既存ツールの結果で手順が進み、再読込で復元できる。
3. 失敗・不合格・サンプルを完了に数えず、本人の確認後だけ仕事を完了できる。
4. ユーザーを跨ぐ読み書き、手順の飛ばし、同時更新の上書きを拒否する。
5. READMEとproject.mdの進捗が共通データと一致し、検証が通る。
