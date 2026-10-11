# RockstarOS Colony C0.1

コロニーをRockstarOSで運用するための全体設計と、限定したソフトウェア模型です。

最初に `RockstarOS_Colony_C0_1_Integrated_Design.pdf` を開いてください。編集用本文は同名のMarkdownです。36要求の根拠・残作業は requirements.json / csv、場所・人数等の未入力は mission_profile.json で管理します。

## 何が入っているか

- 統合設計書、3点の構成図、要求台帳、ミッション入力、C3参照
- 既存OS監査（14能力/9不足領域）、設備アーキテクチャ、一次資料9件
- 3つのJSON Schema、静的例、標準validator未実行の記録
- Python標準ライブラリのSIM_ONLYコード、障害試験、35件合格の記録、8場面のデモ記録
- 内容ハッシュのmanifest.json

## 到達していないもの

既存RockstarOSへの組込み、実機ドライバー、実無線、生命維持、構造・熱・推進設計の完成、ロケットの飛行、コロニーの建設・居住適合。実行対象は合成電力だけです。public fixture MACとactor文字列は本物の認証ではなく、同一プロセスからControllerを呼べる模型です。

## 動かす

Python 3.10以上を想定、今回の実行記録はPython 3.12.14です。標準ライブラリのみを使います。ターミナルでこのフォルダーのruntimeへ移動して実行します。

```bash
python3 run_checks.py ../new-test-evidence
python3 -m colony_core demo --output ../new-demo-evidence
```

デモの出力先は新しいディレクトリにしてください。既存SQLite履歴のある場所は上書きしません。テストは一時DBと子プロセスのみを作り、機器・無線・外部サービスを呼びません。Schemaの標準検証には別途jsonschemaパッケージが必要です。本版では未導入・未実行を記録しています。

`SUCCEEDED`は模擬の希望負荷設定を保存した意味です。物理機器が動いた意味ではありません。実際の模擬出力は次の局所stepから得るtelemetryで確認します。古いreceiptも現在の設定を保証しません。

## 実OSへの接続順

1. SIM専用仕事テンプレートと dev.rock.colony.supervisor を登録する。
2. 観測・提案・承認・送信・照合を既存Platform/仕事記録へつなぐ。
3. AI/端末と署名・設備Adapterを権限分離し、実本人確認・鍵・時刻基盤を実装する。
4. 合成結果を実作業合格に数えず、Core停止・分断・再起動を既存OS上で試す。
5. 地上無人の非危険設備を選び、物理ICDと試験を先に整える。

原repo、C3の外観・性能台帳はこのパッケージで変更していません。


2026-09-24 名称改訂：ロケット名を小文字のrocketstarへ更新。旧称RETURN-1。関連本文・図・台帳・C3参照を同期。runtimeと過去の試験結果は変更していません。
