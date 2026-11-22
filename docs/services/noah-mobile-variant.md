# Noah — スマホ内版（圧縮）

- 本人が言う一言: 「モバイル用に使えるように圧縮したりできるようにしたい」（11-20）
- Goal（Eveが作る）: 目的＝載せた Agent から、Pixel の中で動く版を作る / 入力＝保存版、固定テスト、接続要件 / 期待成果＝`rock-sky-agent/1` か `/2` の定義、モデルの固定、テストの結果、実機で通った時は実機の証明 / 予算上限＝ビルドの枠内 / 要る権限＝作者自身の登録の読み書き
- Noaがつなぐもの: Pixel の動的追加（`rock-sky-agent/1`・`/2`、単一 GGUF。[llm-evaluation-architecture.md](../llm-evaluation-architecture.md)）、`NOAH_MODELS`、端末内の Tool adapter、Eve のビルドの隔離環境、検証用の Pixel
- AMCの工程:
  1. 適性（担当: Noa）— 合格条件: プロンプトと順序だけで表せる処理か、を理由付きで決める。
  2. 指示を縮める（担当: Work）— 合格条件: 指示と依頼の合計が予算内。
  3. モデルを選ぶ（担当: Work）— 合格条件: 固定版の小さい順に試し、テストが通る最小の物。
  4. Tool を合わせる（担当: Noa）— 合格条件: 端末内 adapter に対応する物だけを、順序付きで 1〜2 個。
  5. 検証（担当: Jev）— 合格条件: 同じ固定テストを選んだモデルで実行し、元と同じ合否。
  6. 実機（担当: Jev）— 合格条件: 検証用の Pixel で、追加 → 実行 → 成果の照合が通る。
- Jevの合格条件: 予算を超えた版の出力 0 件。固定テストが元と同じ合否でない版の採用 0 件。実機未確認での「スマホの中で動く」表示 0 件。元の保存版の変更 0 件。任意のコード・未知の Tool・追加権限を含む定義 0 件。作れなかった Agent を作れたと表示 0 件。
- 出力先: Noah の詳細（元との大きさ、選んだモデル、移せなかった所）。Pixel の Noah と Eve。
- Wallet: 端末内の実行は cloud 使用料 0。電力と端末の実費は未計測と表示する（既存）。
- hardware profile 依存: 作るのは Web。動くのは pixel-native と、対応する phone の client。mii・Pro は予算の表を足せば同じ工程を使える。
- 失敗時: どの予算で止まったかを作者へ見せる。スマホ内版なしで載せる（「スマホから使う」は残る）。
- 記録: 元の版 hash、派生の hash、`derivedFrom`、各段の処理器と版、選んだモデルの digest、テストの結果、実機の機種・build・時刻。

## 予算（今の Pixel の実装から）

| 予算 | 値 |
| --- | --- |
| 形式 | 宣言型だけ。`rock-sky-agent/1`（`local-text/1`）、`rock-sky-agent/2`（`local-tools/1`） |
| モデル | 単一 GGUF、4GiB 以下、Apache-2.0 / MIT / BSD-3-Clause。固定版は `qwen2.5:1.5b`（0.92GiB）、`qwen3:4b`（2.33GiB）、`qwen2.5-tools:1.5b-v1` |
| 指示 | 指示と依頼の合計で 2KB 以内 |
| Tool | `citations@1`、`free-article@1` のうち 1〜2 個、順序固定、追加権限なし |
| 出力 | 最大 512 トークン、計画 180 秒 |

予算は Pixel 側の実装が正本。値が変わったら、この表と判定を同じ変更で直す。

## 保存と API

- `noah_agent_variants`（新設）: id、upload_id、kind（`pixel-declarative/1`）、definition_json、definition_sha256、model_id、model_digest、processing_json、device_evidence_json、created_at、revoked_at。既存の表は変えない。
- `POST /api/noah/agents/[id]/variants`: `{ id, kind }`。本人だけ。Eve のビルドの段 4 からも呼ぶ。同じ `id` の再送は同じ結果。
- `GET /api/noah/agents/[id]/variants`。公開された版のスマホ内版は、利用権を持つ人の Pixel が、既存の追加・同意・失効の経路で取得する。
- 表示は 2 段。「スマホ内版あり（実機未確認）」→ 段 6 が通った後に「スマホの中で動く」。

## 次の段階

- 作者が持ち込んだモデルの GGUF 変換。Q4_K_M（1 重みあたり約 4.89 bit）なら、4GiB の上限に入るのは約 7B パラメータまで。8B は 4.57GiB で入らない。
- 参考資料の、端末内で引ける形への変換。
- 宣言型で表せない処理のための、サンドボックス付きのコード実行。Pixel の「任意のコードを動かさない」決まりを変えるので、別の決定が要る。
