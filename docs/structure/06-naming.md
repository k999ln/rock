# 06 名前の正本（2026-11-02）

リポ内の名前はこの表に揃える。表にない呼び方を見つけたら、本文を直すのではなく、まずこの表に「旧名」として追記してから直す。

## 外から見える名前（ユーザー・サイト・CM・PDF）

| 正式名 | 何か | ドメイン | 旧名・揺れ（本文からは消す） |
| --- | --- | --- | --- |
| **avokado** | 会社・ブランド | — | avocado, AVOKADO（大文字はロゴ表記のみ可） |
| **mii** | 建築・暮らしに埋め込む物理端末 | avocadomini.si（将来 mii.si を検討） | avocadoMini, avocado mini, Mini, R5（R5は設計世代の番号として内部で残す） |
| **Eve** | 話しかける相手。依頼→仕事→成果の窓口 | avoado.si/os/eve（eve.si は過去PDFの表記） | Zema（旧名。仕事の実行層の意味で内部名に残す）, イブ |
| **Noah** | 情報・Agent・Tool・コミュニティを見つけてEveへ渡す公開入口 | avoado.si/#timeline | Jennifer, Smith, Sky, smis（公開画面の旧名） |
| **RockstarOS** | どのハードでも同じ実行基盤。端末名として表示してよい | — | Rockstar OS, Rock, rock, rocketstar（別物: docs/rocketstar-design は旧設計資料）, dev.rock（内部識別子として残す） |
| **Pro** | AI専用PC（今は構造整理の対象外） | avocadopro.si | avocado Pro, avokadoPro |

## 内側の名前（コード・設計書・会話で使う。ユーザーには見せない）

| 名前 | 役割1行 | 主なコード | 旧名・統合先 |
| --- | --- | --- | --- |
| **Eve** | 会話を Goal（目的・入力・期待成果・予算）に変える | lib/eve-*.ts, components/sky-chat-workspace.tsx | Zema chat（lib/zema-chat-session.ts は Eve 配下へ） |
| **Noa** | Eveが決めた目的に対して、Tool・Agent・実行先をつないで「担当」を形にする（ノアの方舟） | lib/eve-agent-*.ts, components/eve-object-agent-creator.tsx, app/api/llm/local-agent | **Smith**（旧名。コード内 `smith` は段階的に `noa` へ） |
| **AMC** | avokado Mission Control。Goalを工程に分解し、担当・順序・合格条件を持つ | lib/amc-*.ts, lib/jennifer-amc-*.ts, data/amc/, app/amc | **Jennifer**（project chief of staff。役割がAMCと重複するためAMCへ統合。lib/jennifer-*.ts は amc/ 配下へ） |
| **Jev** | 成果を独立に評価する remote evaluator。権限は持たない | lib/jev-*.ts, app/api/jev-evaluation | — |
| **Spider** | コードと接続先を巡回して不具合・権限逸脱を探す検査役（雲が歩く軌跡のアニメーション） | lib/spider-*.ts, components/spider-workspace.tsx, toolkits/spider-guard, .github/workflows/spider-codeql.yml | — |
| **Sky** | Marketplace・Hub・MCP/A2A・SDK | lib/sky-*.ts, app/sky, services/sky-web | — |
| **Work / Job / Receipt** | 仕事の状態遷移・保存・署名済み領収 | lib/workflow.ts, lib/work-*.ts, lib/receipt-signature.ts | Zema（実行層の旧名） |
| **Broker** | 本人の承認・予算・端末の権限を実行に渡す門番 | lib/a2a-broker-*.ts, lib/agent-control-plane.ts | — |
| **Wallet** | 残高・予約・台帳・精算（天引きの実装場所） | lib/wallet*.ts, lib/settlement.ts, services/sky-billing | Fund（旧名の一部） |
| **Game** | mii・ブラウザ向けの遊びの実行枠と作者SDK | lib/game-*.ts, sites/avocado-mini/creator-kit | — |
| **Luna / Sol / Astra** | モデルの役割名（調査・実装 / 監視・実行 / 設計レビュー）。製品名ではない | lib/sky-model-routing.ts | — |
| **Mr / DORA OS** | 2026-09のTelegram bot時代の名前。歴史 | toolkits/mr, vendor/mr | archive扱い（削除はしない） |

## 使ってはいけない言い換え

- 「Smith」→ Noa。「Zema」→ 文脈で Eve（会話）か Work（実行）。「Jennifer」→ AMC。
- 「avocadoMini」→ mii。「Mini」単独は mii の意味でなら可、ただし新規本文では mii。
- 「si」= AI の表記（2026-10-13の決定）。本文の AI 表記は si のまま。API/enum/パスは変えない。
- 製品が何個あるかを数えるときは外側の表だけを数える（会社1、物理端末1、入口1、場所1、基盤1、PC1）。

## 名称変更の実施ルール

1. 表示文字列と設計書 → 先に直す（Codex task 03）。
2. コード識別子（`smith`, `jennifer`, `avocado-mini`）→ 別タスクで、import全置換＋テスト通過を条件に直す（Codex task 04）。旧名は型エイリアスで1世代残す。
3. 外部ID（API path、D1 table、enum、環境変数）→ 変えない。変える場合は互換レイヤーと移行手順を同じPRに入れる。

公開UIはEveとNoah。内部Noaと公開Noahを同一の識別子変更として扱わず、API・保存契約は維持する。
