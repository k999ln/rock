# Noah 巡回の合図

毎分、設定された `NOAH_ORIGIN` の `/api/noah/intake/tick` に署名付きの空の JSON を送る専用 Worker。HTTP の入口、利用者の情報、モデルの鍵は持たない。合図の鍵は `NOAH_PATROL_WAKE_KEY`（Web 本体と同じ、32 文字以上）。鍵をリポジトリに置かない。取り込み先や巡回の判断は Web 本体が持つ。

手元での検証:

```sh
WRANGLER_WRITE_LOGS=false npx wrangler deploy --dry-run --config services/noah-patrol-wake/wrangler.jsonc --outdir work/noah-patrol-wake-dry-run
```

この変更は配備しない。本番の migration、Worker の配備、秘密値の設定、`NOAH_PATROL_ENABLED` などの切り替えは別途本人の明示許可が必要。Web 側の切り替えを閉じた状態では、署名検証後に `disabled` を返して通信しない。合図の処理では Agent へ握手・実行しない。
