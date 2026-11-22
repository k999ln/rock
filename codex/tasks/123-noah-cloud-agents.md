# 123 NoahのCLI管理クラウドと提供元接続

本人指示（2026-11-22）: CLI型の実行環境をクラウドに用意し、利用者の設定なしでNoahから接続・利用する。指定元クラウドへの直接接続も扱う。

正本: [サービス契約](../../docs/services/noah-cloud-agents.md)。対象は `services/noah-cloud-agents/`、`lib/noah-cloud-*`、Agent詳細/接続UIとAPI、関連試験。

合格条件: 公式Agentの実クラウド処理、本人/Origin/再送/停止/上限/鍵非露出、スマホで接続→依頼→結果再表示。公開結果・CI・PRは受入後に記録する。

状態: 実装中。Cloudflare既存ログインはcontainers:write不足。本人は再認証を操作できると回答済み。

PR: [#402](https://github.com/k999ln/rock/pull/402)（Draft）。実クラウド受入・マージ・本番公開は未完了。公開198とGit mainの変更を両側保全して統合済み。

確認済み:
- `node --experimental-strip-types --test tests/noah-cloud-*.test.mjs`: 35件（今回のAPI/実行器17件を含む）。本人/Origin/委任停止、モデル上限、結果hash、停止と起動競合、再送、ブラウザなしのWork保存、結果再送を含む。
- `npm run check`（`services/noah-cloud-agents`）: Docker amd64イメージとWorkerのdry-run成功。
- 公式Hermes SDKのterminal/file操作で `total.txt` の内容 `2000`、公式boss CLIで面接質問5件を、外部通信なしのLinuxコンテナで確認。モデル応答は固定fixture。
- `scripts/test-noah-cloud-browser.mjs`: Chrome 320/390/1280px、接続・入力・タップ・停止・結果再表示・ファイル保存・読込障害からの復帰。API fixtureによるUI試験。
- 全体 `npm run verify` は最新main統合後に終了0で成功（2026-11-22）。その後の配布版照合はAPI/実行器17試験・typecheck・lintを再実行して成功。途中で見つけた依存フォルダの除外漏れはサービスの.gitignoreで修正。別toolkitの依存不足は `npm ci --prefix toolkits/noah-coconala --ignore-scripts` で解消し、その試験は合格。

再開:
1. Cloudflare OAuthで `containers:write` を追加。サービスに固定したWranglerを使い、`--config ./wrangler.jsonc` を明示する。認証情報をログに出さない。
2. READMEに従い実行器の配備・サーバー間secretを設定し、実モデルで公式Agentの実行・停止・結果保存を確認。
3. GitHubの検証を通してPRをマージ。本番Sitesを最新mainと同じGit treeへ同期し、treeを照合してから公開。Secretsはnative Sites環境設定へ登録する。
4. 本番の実Chromeスマホ幅で検索→接続→依頼→結果/外部評価を確認し、task・CHANGELOG・READMEへ実測の公開版を追記する。未確認の段階では✅を付けない。
