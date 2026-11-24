# 130 Eve（eve.si）— エージェントエンジニアリング

ストアの「Agentエンジニアリング」がEveの作者画面。相談から届く組み合わせ案は、各担当の入出力と最終成果を示す。外部への送信・掲載は別途本人が操作する。[PR #49](https://github.com/iceiceice999/rock/pull/49)

本人指示（2026-11-24）「エージェントをこれとこれを繋げたらお金になるみたいなのはエージェントエンジニアリングって造語にして、それを上手に組み合わせるための eve.si にする」と、同日の回答 8 つ。仕様: [docs/services/eve-si.md](../../docs/services/eve-si.md)。決定: [07](../../docs/structure/07-decisions-from-minutes.md) の 2026-11-24 の 2 行。

進み具合・試験の一覧・起動の手順: [codex/progress/130-eve-si/](../progress/130-eve-si/)（`progress.txt`・`tests.json`・`init.sh`）。再開する時は `progress.txt` と `git log` を読んでから続ける。

## 段

1. **形と検査**: `lib/eve-combination.ts`（型、検査の規則 1〜9、`defineCombination`、設計図からの変換、工程の合格条件 `eveCheckAccept`）、`lib/eve-glue.ts`（つなぎ目の変換。宣言型で、外へ通信できない作り）。
2. **手で 1 本通す**: `lib/eve-combination-paper.ts`（試運転）、`data/eve-combinations/` の 1 本（金融以外の紹介 × 登録済みブログ）。
3. **需要の台帳**: `lib/eve-demand.ts`（受注の募集・ASP の案件・売り場の公開価格から、出典付きの需要）。
4. **Eve の探索と発見**: `lib/eve-combination-search.ts`（型への当てはめ）、`lib/eve-discover.ts`（需要からの逆算と順の広げ方、見込みの利益）。
5. **採点と作り直し**: `lib/eve-combination-score.ts`、`lib/eve-combination-rebuild.ts`。
6. **人が作り、使ってもらう**: 作者の受け取りの計算（`lib/eve-combination-score.ts`）、画面と API。

## 合格条件

仕様の「作る順」の表。`bash codex/progress/130-eve-si/init.sh`（task 130 の試験・元の部品の試験・型の検査）、`npm run typecheck`。

## やらないこと

- 外部サービスへの登録・申込・公開・送金を、Claude・Codex が代わりに行わない（AGENTS.md 6 章）。本人が押す工程（tap・human・review）は、中身と手順を用意して止める。
- 試運転で、外へ出す工程を実行しない。
- Eve が作った組み合わせを、Eve が合格にしない（合格は Jev）。
- コード識別子（`smith`・`noa`）・API・保存識別子を変えない。
