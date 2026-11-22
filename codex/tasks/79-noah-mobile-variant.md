# 79 スマホ内版（圧縮）

設計: docs/noah-agent-market-design.md §4.7、docs/services/noah-mobile-variant.md。先に 77。

## やること

1. `noah_agent_variants` と `POST` / `GET /api/noah/agents/[id]/variants`。migration は drizzle/ に置き、本番へは適用しない。
2. 適性の判定、指示を縮める、モデルを選ぶ、Tool を合わせる、検証。出力は既存の `rock-sky-agent/1`・`/2` の定義で、既存の検査を通す。
3. 予算の表を 1 か所の定数にし、Pixel 側の実装の値と照合する試験を足す。
4. 表示の 2 段。「スマホ内版あり（実機未確認）」と「スマホの中で動く」。
5. 検証用の Pixel がつながっている時だけ、実機の段を自動で回す。無い時は未確認のまま出す。

## 変えないもの

- Pixel の「任意のコードを動かさない」決まり。対応する Tool adapter の一覧。
- 元の保存版。

## 合格条件

- Node のテンプレート（プロンプトと 1 回のモデル呼び出しだけ）から、予算内の `rock-sky-agent/1` が出て、同じ固定テストが `qwen2.5:1.5b` か `qwen3:4b` で通る。
- ファイルを書き換える処理を持つ例は「移せない」と理由付きで出て、スマホ内版が作られない。
- 予算を 1 つ超えた定義が拒否される。
- tests/noah-mobile-variant.test.mjs、`npm run typecheck`、`npm run lint:product`。
