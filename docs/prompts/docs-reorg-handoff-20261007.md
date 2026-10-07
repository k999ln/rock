# 文書整理の引き継ぎ（2026-10-07、次の担当向け）

種類: 実行プロンプト ／ 主担当: Git / CI / Operations、ROCK ／ 状態: **GitHubへ未push**

2026-10-07に行った文書の整理と、統合で失われた記録の復元を、次の担当（Codexなど）が引き継ぐための手順です。作業したセッションには `k999ln/rock` への書き込み権限がなく、pushが拒否されました。作業の成果はGit bundleとしてownerへ渡してあります。

先に読むもの: [AGENTS.md](../../AGENTS.md)、[project.md の2026-10-07の節](../../project.md)、[統合で失われた情報の監査](../merge-loss-audit-20261007.md)。

## 1. いまの状態

| 項目 | 値 |
| --- | --- |
| 作業branch | `docs/repo-information-architecture` |
| 基点 | main `0fbf688b`（2026-10-06、PR #91） |
| コミット | 3件。文書の入口の追加、統合で失われた記録の復元と監査、作業記録とこの引き継ぎ |
| 変更の範囲 | 文書だけ。既存19ファイルの変更と、新規ファイルの追加。コード、`data/*.json`、`vendor/`、証拠は変更なし。移動・改名・削除は0件 |
| 受け取るファイル | `rock-docs-reorg.bundle`（ownerが持っています） |
| GitHub上 | branchもPRもまだ無い |

## 2. 最初にやること：bundleを取り込んでpushし、PRを作る

作業中のcheckoutを汚さないよう、分離したworktreeで行います。`<bundle>` はownerから受け取った `rock-docs-reorg.bundle` の場所です。

```sh
git fetch origin
git rev-parse origin/main                       # 0fbf688b… なら基点は同じ
git bundle verify <bundle>
git fetch <bundle> docs/repo-information-architecture:docs/repo-information-architecture
git log --oneline -4 docs/repo-information-architecture
git diff --stat origin/main...docs/repo-information-architecture | tail -3
git diff --name-status origin/main...docs/repo-information-architecture | grep -v '\.md$'
```

最後のコマンドで出てよいのは `docs/merge-loss-audit-20261007/ledger-records.json`（追加）の1行だけです。それ以外にMarkdownでないファイルが出たら、pushせずに止めて原因を調べます。

問題がなければpushしてPRを作ります。

```sh
git push origin docs/repo-information-architecture
gh pr create --base main --head docs/repo-information-architecture \
  --title "docs: 文書の入口を整理し、統合で失われた記録を復元" \
  --body-file <下の「PR本文」を保存したファイル>
```

mainへの統合はownerの確認後に行います。自動でmergeしません。

### mainが `0fbf688b` から進んでいた場合

`README.md`、`project.md`、`PROJECTS.md`、`docs/product-baseline.md`、`docs/sky-tools-complete-design.md`、`docs/workstreams/` は変更が重なりやすいファイルです。競合したら、[AGENTS.md](../../AGENTS.md) の統合の決まりに従います。

- 片側の内容で丸ごと解決しない。2026-10-05の `ecb4b2af` はそれで記録を失いました。
- 追記型の文書（`project.md`、`docs/workstreams/`、製品ベース、設計書の日付付きの節）は両側の節を残す。
- `project.md` は、このbranchで日付付きの節を新しい順に並べ直しています。main側の新しい節は、同じ順で該当の位置へ入れます。
- `README.md` の `<!-- project-overview -->` の中と `project.md` の `<!-- project-status -->` の中は生成物です。手で直さず、最後に `npm run project:update` で作り直します。
- 取り込みのあと、下の検証をやり直します。

## 3. 検証

```sh
npm ci
npm ci --prefix sites/avocado-mini
npm run project:check
npm run baseline:check
npm run design:check
npm run sky:check
npm run mission:check
npm run repository:check
npm test
npm run verify
```

作業したセッションでの結果は次のとおりです。

| 検査 | 変更前（main `0fbf688b`） | 変更後 |
| --- | --- | --- |
| `project:check` ほか23種のcheck | `os:parity` だけ失敗、ほかは合格 | 同じ |
| `npm test` | 1,373件中、合格1,367・失敗5・skip 1 | 同じ |
| 失敗した5件 | 674、678、712、713、751（MCPとPC用CLIの実プロセス試験） | 同じ5件 |
| `npm run verify` 全体、同一SHAのCI | 未実行 | 未実行 |

`os:parity` と5件の失敗は、作業環境の制約によるもので、変更の前後で変わっていません。手元とCIで `npm run verify` を通し、結果をPRへ書いてください。失敗が上の一覧と違う場合は、この変更が原因かどうかを先に切り分けます。

文書の照合に使った確認は次の2つです。再現できます。

- 変更した既存19ファイルについて、main `0fbf688b` にあった行（空行を除く4,256行）がすべて作業ツリーのどこかに原文で残っている。同じファイルに4,207行、新しい版へ書き換えた49行は [保管庫](../merge-loss-audit-20261007/dropped-text.md) に原文。
- 変更したMarkdownの相対リンクと見出しへのリンクに切れが無い。

## 4. PR本文

```markdown
## 何をしたか

文書だけの変更です。コード、`data/*.json`、`vendor/`、証拠は変更していません。ファイルの移動・改名・削除はありません。

- 入口を追加: `docs/README.md`（文書の地図。`docs/` 直下の185文書を分野と種類で分類）、`docs/spec-history.md`（仕様変遷）、`docs/agents-and-tools.md`（エージェント・Tool総覧）、`data/`・`scripts/`・`services/`・`toolkits/` のフォルダ案内
- `README.md`: 冒頭に「これは何か」「方針の変遷」「探し方」を置き、末尾に追記されていた節を該当の章へ移動
- 統合（merge）で消えていた記録を復元: 2026-10-05の `ecb4b2af` ほかで落ちた2,043行のうち1,205行を元の文書へ戻し、485行は `docs/merge-loss-audit-20261007/dropped-text.md` に原文で保管
- `project.md`: 作業記録199節を復元し、日付付きの節を新しい順に整列
- `docs/merge-loss-audit-20261007.md`: 何が消え、何を戻し、何を戻していないかの監査
- `AGENTS.md`: 文書を足すときの決まりと、統合で競合したときの決まりを追加

## 検証

- main `0fbf688b` にあった行は、変更した19ファイルすべてについて作業ツリーに原文で残っています（4,256行中、同じファイルに4,207行、保管庫に49行）
- 変更した文書のリンク切れ0件
- 24種のcheckと `npm test` は変更前と同じ結果（`os:parity` と試験5件は変更前から失敗）
- `npm run verify` 全体とCI: （ここに結果を書く）

## このPRに含めていないもの（ownerの判断待ち）

1. task台帳から消えた `SIM01`・`SKY21`・`B06`・`G04` と、`AI02`〜`AI06` の状態を戻すか
2. `data/design-document-index.json` をmainにあった内容へ戻すか
3. PR側だけにあった `WEB20`・`AI09`・`WEB21`・`BIL04` を台帳へ入れるか
4. READMEの最初の見出し（「One SIM/eSIM. One Rockstar account.…」か「From playing to making.…」か）
5. 統合で古い側になったままのコードと試験9件の確認
6. avokadoProの価格（From ¥880,000 と 80万円）

詳細は `docs/merge-loss-audit-20261007.md` の4節と5節。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_012927bHt8NQZdHWDZH3UfUf
```

## 5. やらないこと

- 上の6件をownerの回答なしに決めない。台帳（`data/project-status.json`、`data/design-document-index.json`、`data/product-baseline.json`、`data/mission-control.json`）をこのPRで変更しない。
- 復元した節を「重複」「古い」として消さない。古くなった記述は消さず、日付と「いまは○○が優先」を足します。
- 文書を移動・改名しない。進捗台帳・設計台帳・証拠がpathとhashで参照しています。
- squashして履歴を潰さない。履歴を強制的に上書きしない。

## 6. 理念についての質問（owner回答待ち）

2026-10-07に、ownerの指示で「設計書ではなく理念から、あるべきサービスを描き、足りないものと分からない点を全部質問にする」作業を行いました。理念の読み取り12項目、サービスの地図43件、足りないもの23件、質問205問をownerへ渡してあり、回答待ちです。この内容はまだリポジトリに入れていません。保存するかどうかもownerに聞いています。

回答が出るまで、次の点を文書や実装で確定させないでください。今の文書の記述は、ownerの意図を狭めている可能性があります。

| 論点 | 今の文書の書き方 | 分かっていないこと |
| --- | --- | --- |
| 無料配布の範囲 | 9/19に「無料配布を理念、OSは従量課金」。対象は未確定 | OS、回線、標準Agent、Mini本体のどれが無料か |
| 会社の収益の形 | 記載なし | 手数料を取らず、配布も無料のとき、何で成り立つか |
| 「OSをSIMに入れる」 | 「OSのbinaryをSIMへ格納する前提にはしない」 | 挿すだけで使える、端末を替えても付いてくる、という意味かどうか |
| 開通の手間 | サインイン、購入コード、端末コードの3段階 | 設定ゼロ（SIM＝本人）が理想かどうか |
| Sky Marketの手数料 | 10% | 0%にする条件と時期 |
| 無料Agentと解約ロック | [仕様変遷 6節](../spec-history.md)に未確定の案として記録 | 決定か検討中か、期間、継ぎ足し、同意、法的な確認 |
| 最初の入口 | 10/2以降は「SIM/eSIMが主商品、ハードは別」 | SIMとゲーム機（Mini）のどちらが先か |
| 月50万円 | 製品北極星の到達指標 | ownerの数字か、誰の何を指すか |

回答が出たあとの仕事は、この順です。

1. 理念の正本を1つの文書にして `docs/` に置き、`AGENTS.md` と `docs/README.md` の最初に読む文書へ加える。
2. 理念と食い違っている文書の記述を、ownerの回答に合わせて直す（[製品ベース](../product-baseline.md)、[仕様変遷](../spec-history.md)、[SIM/eSIM-led architecture](../sim-led-product-architecture.md)）。
3. 上の6件の判断に従って、台帳とコードを直す。
4. 理念から見て足りない機能を、task台帳とMission Controlへ入れる。

## 7. 完了したら

- `project.md` に、pushしたSHA、PR番号、`npm run verify` とCIの結果を追記する。
- `npm run project:update` を実行する。
- この文書の冒頭の状態を「push済み（PR #番号）」に直す。
