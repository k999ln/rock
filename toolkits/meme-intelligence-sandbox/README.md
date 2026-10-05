# Meme Intelligence Sandbox

RockstarOSのMarket研究用に、ミームコイン候補を**PAPER限定**で評価するsandboxです。LIVE注文、swap、Wallet署名、秘密鍵、API secretは扱いません。

## 入れた判定レイヤー

- GMGN / on-chain hard filter: market cap, liquidity, holders, Top10, DEV, bundler, sniper, mint/freeze
- Social Sieve: duplicate / referral / bot比率を除いてorganic activityを評価
- Narrative Twin / Consensus: social velocity, unique authors, KOL cluster, narrative similarity/persistence
- Call Provenance / Caller Integrity: call前保有、wallet検証、過去hit率、post-pump call、削除call、affiliate偏重
- Wallet Cluster / Smart Money: 独立wallet cluster、smart-wallet inflow、buy/sell flow、holder/liquidity growth
- Jev boundary: `SKIP | WATCH | ARMED | ENTER`の固定選択。hard filter/guardrailを越えて昇格できない
- PAPER staged entry: `PROBE -> CONFIRM -> SCALE`、最大10% exposure
- Exit risk: rug/promotion/smart-money sell/liquidity decline/consensus崩れを合成

## 実行

```bash
npm --prefix toolkits/meme-intelligence-sandbox test

node toolkits/meme-intelligence-sandbox/run-paper.mjs \
  --input /absolute/path/to/snapshots.jsonl \
  --bankroll 100 \
  --output /tmp/meme-paper-report.json
```

JSONLの1行を1 snapshotとして、`token`, `social`, `capital`, `callers`, `risk`を渡します。`snapshot.jevDecision`を追加するとJevの判断を取り込めますが、deterministic guardrailとJevのうち**より保守的なaction**を採用します。

## 重要な境界

- `ENTER`はPAPER signalであって外部注文許可ではありません。
- SNSの利益スクリーンショットを教師ラベルにしません。caller実績はcall時刻とon-chain事実を分けます。
- 成功例だけでなく、同条件で失敗したtokenもoutcome datasetへ残す前提です。
- honeypot / sell-blocked / unsafe owner privileges / concentration閾値違反はJevが`ENTER`でも`SKIP`になります。
