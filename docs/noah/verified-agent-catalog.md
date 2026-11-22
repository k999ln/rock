# Agent本体の調査台帳とNoahへの反映

2026-11-22。[task101](../../codex/tasks/101-noah-verified-agent-catalog.md)。公開一次資料に基づく存在・同一性の静的調査を、接続済み一覧とは別に提供する。

755系列・20用途分類。従来449系列から306系列増加。直前までの保留候補2,603件（GitHub 866、Hugging Face 1,728、公式9）と、そこからたどった原典5件を追跡した。301候補を採用し、原典5件を加えた。個別資料精査は1,213件、自動一次選別は1,390件。1,250候補は未確定で、うち1,197件は一次選別から追加の個別ソース精査・原典追跡を要する。全件の個別精査完了、世界総数、全製品の利用可能性は主張しない。

## データと画面

- `data/noah-verified-agent-source.json.gz`: 出典・判定理由・取得時点・ファイルSHAを含む研究スナップショット。過去の保留判定は履歴として保存。
- `data/noah-agent-registry.json`: 本体と再調査候補をNoah表示用に射影した公開情報。個人認証情報や起動manifestを持たない。
- `/api/noah/agent-registry`: GETのみ、no-store、版をETagに使用。同じ版への要求は304。
- `/noah/agents/verified`: 本体/判定理由・出典・用途・未確定数を表示。検索、分類、ページ送り。60秒ごとと画面復帰時に配信済みの台帳を再取得し、失敗時は直前の表示を保持。

同一作者の版・クライアント・配布先・継続製品群を統合。独立した業務/実行フローを持つ派生を採用し、単なるSDK・MCP道具・モデル重み・教材・プロンプト・画面は数えない。非公開コードまで同一性を保証するものではない。研究試作を含み、SpaceのRUNNINGは当方の稼働合格ではない。

## 更新方法

リポジトリのルートで実行する。

```sh
python3 scripts/import-noah-verified-agents.py --source /absolute/path/reviewed-registry.json
python3 scripts/import-noah-verified-agents.py --check
node --experimental-strip-types --test tests/noah-verified-registry.test.mjs
```

ローカルの研究台帳を編集中は、同じコマンドに `--watch --interval 5` を付ける。重複ID・family・正規URL、不正URL、集計不整合、存在しない参照先を拒否し、全体検証後に生成物を置き換える。破損更新では直前の採用版を残す。元の公開資料の変更を自動発見・判定するクローラーではない。

**本番は最後に配備したJSONを読む。** ローカルwatchだけでは本番へ反映されない。通常の変更レビュー・ビルド・配備を経た台帳を表示側が取り込む。今回、本番配備・D1適用・外部接続は実施していない。

## 接続に進めるための残作業

各系列について実行入口・remote MCP/API/専用runtime、利用権・条件、認証・必要モデルを確認し、既存のNoah intake/connect-planへ適合する候補だけを登録する。提供元応答、入力、成果、停止、権限、料金の通し受入後に接続状態を更新する。独自adapterを1件ずつ増やす設計にはしない。研究台帳の `launchAllowed` は常にfalse、`connection` は常にnot_testedであり、外部研究JSONがconnectedを宣言しても昇格させない。既存の接続済み記録をこの台帳から上書きしない。

世界中の候補は増減するため、今回の数値は2026-11-22の調査範囲に限る。前回のX発見候補は追跡したが、この再判定ではXの新規全件取得はしていない。
