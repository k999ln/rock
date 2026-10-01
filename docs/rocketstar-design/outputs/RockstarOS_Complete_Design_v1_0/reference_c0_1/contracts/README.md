# RockstarOS Colony / SIM_ONLY 接続契約

このフォルダーは `dev.rock.colony.supervisor` 参照実装の構造契約である。JSON Schemaの方言はDraft 2020-12。コマンド、応答、テレメトリーを別文書とし、全トップレベル項目を必須にし、未知項目を拒否する。命令payloadにも同じ制約を適用する。

## 適用範囲

- `mode` は `SIM_ONLY`、`sourceClass` は `SYNTHETIC` の固定値。実設備・有人設備・飛行用の通信契約ではない。
- 唯一の操作は `sim.noncritical_load.set`。対象は模擬の非重要負荷の希望値だけで、重要設備を任意操作する命令はない。
- kW値の0〜100と時間値の上限は模擬系の入力範囲。実機の定格、居住条件、運転制限を表していない。
- `signature` は公開された試験鍵によるHMAC-SHA256のfixture。鍵を知る誰でも作成できるため、操作者認証、機器認証、アクセス制御の実証には使わない。
- `APPLIED` とBrokerの `SUCCEEDED` は `appliedScope` の通り、模擬希望値が保存された状態。`step()` 後の `actualFlexibleKw` は別の観測結果であり、物理的な供給や安全維持を表さない。

## Schemaだけでは判定しないこと

JSON Schemaは項目・型・固定値・範囲を検査する。`commandId` と `idempotencyKey` の一致、payloadのダイジェスト、MACの計算、現地制御権epoch、有効期限と現在時刻の関係、期待状態版、要求の重複、機器の予算は実行側で再検査する。これらの相互関係を、標準にない `$data` 等でSchemaへ埋め込まない。

JSON Schemaの `number` / `integer` はbooleanを受理しない。`integer` は数学的に整数である数を表すので `1.0` を許可する検証器もあるが、このPython実装の世代番号・状態版はネイティブの `int` に限定する。実行側の検査も必要である。NaNとInfinityはJSON文法の外にあり、入口で拒否する。

テレメトリーの `sampledAt: null` はまだ `step()` のサンプルがないことを表す。構造としては許可するが、Brokerは操作準備に使わない。時刻異常時に最後の有効時刻を保持していても、`clockTrusted: false` を見落としてはならない。

receiptの `status=APPLIED` は `reason=null`、`status=REJECTED` は定義済みの拒否理由を要求する。`signature` が形式に合うだけで正しいMACとは判断しない。実装のMAC正規化は現行 `core.py` の `canonical()` に一致させる。これは独自fixture形式であり、RFC 8785適合を主張しない。

## ファイルと検証

- `command.schema.json` / `receipt.schema.json` / `telemetry.schema.json`: 3種類の構造契約。
- `examples/*.json`: 手作業で構成した静的例。時刻とIDはfixture。実行ログではない。
- `validate_contracts.py`: Python `jsonschema` の `Draft202012Validator` がある環境でスキーマ自体、静的例、代表的な拒否条件を検証する。
- `static_validation.json`: このフォルダー作成時の確認記録。同梱PythonとシステムPythonに `jsonschema` がなかったため標準検証は `NOT_RUN`。JSONとしての読込みと必須項目の一致のみ確認済み。

`validate_contracts.py` は、必要なライブラリが利用可能な環境でこのフォルダーから `python3 validate_contracts.py` と実行する。結果は標準出力へJSONで出す。後でCLIから得た実行例も同じSchemaで検証すること。静的例への合格を実機や実行時の成功へ数えない。
