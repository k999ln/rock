# 120 Noah の Agent を継続して集める

本人指示（2026-11-22）と参照チャット「gitのrockを確認」に基づく。[サービス契約](../../docs/services/noah-agent-collection.md)。

## 範囲

- `scripts/noah-agent-collector.mjs` と専用の保存・通信モジュール。公式MCP台帳、既存GitHub/Hugging Face検索、X公式検索を継続して集める。
- 既存の取り込み・名寄せ・握手・掲載ファイルを再利用。頁位置、バックオフ、二重起動防止、停止と再開、状態確認を一つのCLIにまとめる。
- `tests/noah-agent-collector.test.mjs` で再開・失敗・安全な通信・既存取込との接続を検証。
- 掲載用ファイルを送る分割処理は画面とAPIで共通化し、件数と1MiBを守る。系列の候補を黙って切り捨てない。
- 紹介用スナップショットを署名付きでR2へ掲載し、`/noah/agents` に出所フィルタ・検索・重複出典付きで表示する。
- 本番DB migration・自動登録・道具実行は含めない。

## 合格条件

- 4出所の数を分け、接続確認を通るMCPだけを掲載用ファイルに出す。
- 再起動と一時失敗で保存済み候補・頁位置を失わず、同じDBで2つの収集器が走らない。
- 収集器の自動試験、`npm run verify`。実APIの有限巡回で状態と出力を確認する。

## 引継ぎ

[PR #380](https://github.com/k999ln/rock/pull/380)。Sites公開版171（source `566bc99d9776d83ca0fdde04b428b0f31ff941a8`）へ反映。https://avoado.si/noah/agents の実表示、Hugging Faceのいいね3件・1件の表示、検索、390px幅を確認。

運営Macの `si.avoado.noah-agent-collector` を常駐起動。保存先は `work/noah-agent-collection-20261122`、実行checkoutは `work/noah-agent-collector-runtime-20261122`。初回常駐巡回でMCP候補4,000件・握手成功22件、GitHub20件、Hugging Face11件。公開APIへの4出所の署名付き送信が成功し、公開APIからHF11件を再取得。Macの停止/スリープ中は収集停止。Xの実収集は `NOAH_X_BEARER_TOKEN` 未設定のため `needs_credentials`。鍵はチャットやGitに記載せず、運営の権限600のruntime.envへ設定後サービスを再起動する。

検証:
- `npm run typecheck` / `npm run lint:product`: 成功。
- 関連38試験、追加16試験、launch-ops17試験: 成功。公開ソースの収集/API/launch-ops33試験とSites本番build: 成功。
- `PATH=/opt/homebrew/opt/openssl@3/bin:$PATH npm run verify`: 全体は未通過。4,786試験中4,774成功・4skip・8失敗。新しい共通importを画面試験へ渡す1件を修正し、17試験再実行で成功。Pixelの時間制限5件は単独再実行で成功。
- 残る2件は共有node_modulesのsymlinkでbracesの絶対パスが元checkoutになったことと、Miniの依存未導入でundici解決先がrootになったこと。既存のlock・製品・試験を変更していない。全体チェーン後半は未実行なのでPRはdraft。次担当は独立した依存導入環境で全体verifyを再実行する。

停止: `node scripts/noah-collector-service.mjs --stop`。再開/常駐設定/外部評価の意味はサービス契約の運用節を参照。
