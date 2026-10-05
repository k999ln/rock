# avokado専用モデル — ゼロ事前学習の試作

2026-10-05の利用者指定: **既存重みを使わずゼロから事前学習、端末内とクラウドの両方、初回は追加費用なし**。この実装は学習パイプラインのCPU試験であり、実用LLM・Mini実機・クラウド配備の完成ではありません。12万4800パラメーターの小型言語モデルをランダム初期化し、次のUTF-8 byteを予測して学習します。既存モデルへのプロンプト設定や追加学習ではありません。

主担当はAndroid / Device / Local AI、既存AI02の研究工程。Broker、既存Qwen profile、Sky provider、eSIM利用権・課金経路へ接続していません。全体設計と未完了条件は[専用モデル設計](../../docs/avokado-llm-pretraining.md)、実測値は[試験証拠](../../docs/evidence/avokado-llm-pretraining.json)を参照してください。

## ローカルで再現

Python 3.12とPyTorchを使用します。以下のインストールにはインターネットとディスク空き容量が必要ですが、学習・推論はネットワークを使いません。仮想環境・重み・レポートはGit除外の`work/`に置きます。

```sh
python3.12 -m venv work/avokado-llm/venv
work/avokado-llm/venv/bin/python -m pip install -r toolkits/avokado-llm/requirements.txt
work/avokado-llm/venv/bin/python -m unittest discover -s toolkits/avokado-llm -p 'test_*.py' -v
work/avokado-llm/venv/bin/python toolkits/avokado-llm/train.py --output work/avokado-llm/run-01 --steps 1000
work/avokado-llm/venv/bin/python toolkits/avokado-llm/infer.py --checkpoint work/avokado-llm/run-01/checkpoint.pt --prompt 'Mini'
```

出力先は新しいディレクトリだけを受け付けます。失敗時に過去の重みを上書きしません。1000は追加step数で、1stepは8×128 byte token。推論はgreedyで、promptは最大127 UTF-8 bytes、生成は最大256 byte tokens。日本語は1文字が複数bytesなので短い文しか入らず、生成末尾などで不正UTF-8が出る場合は置換文字になります。これは製品用tokenizerではありません。

## 学習を再開

```sh
work/avokado-llm/venv/bin/python toolkits/avokado-llm/train.py --resume work/avokado-llm/run-01/checkpoint.pt --output work/avokado-llm/run-02 --steps 100
```

config・コーパスのSHA-256・batchが一致する場合だけoptimizerと乱数状態を復元します。`--steps`は累積ではなく追加分です。各コマンド終了時にcheckpointを保存する方式で、学習途中に停止したrunの未保存stepは再実行します。既に完成したcheckpointから再開してください。checkpointは自分が生成した信頼できるファイルだけを使用し、配布元署名がない任意ファイルを読み込まないでください。

## 端末内とクラウドに共通の推論入口

```sh
work/avokado-llm/venv/bin/python toolkits/avokado-llm/infer.py --checkpoint work/avokado-llm/run-01/checkpoint.pt --serve
curl -s http://127.0.0.1:8769/health
curl -s http://127.0.0.1:8769/generate -H 'Content-Type: application/json' -d '{"prompt":"Mini","max_new":32}'
```

APIは`127.0.0.1`だけにbindし、ブラウザOrigin・CORS・任意Tool引数を受け付けません。外部へ公開せず、同じPCの開発用クライアントから使います。認証やTLSを備えた製品APIではありません。

クラウド側は、所有済み・費用確認済みのLinuxホストへ同じsourceと自作checkpointを置き、同じCLIで推論する構成です。必要ならSSH port forwardingでloopback APIを使います。今回クラウドの契約・起動・配備は行っていません。新規課金リソースを自動作成するスクリプトもありません。Mini/Android側はPyTorchをそのまま製品搭載する前提ではなく、tokenizer/量子化/export/runtime互換・メモリー・熱・応答時間を測ってから既存ModelProfileへ接続します。現在のGGUF/llama.rnでこの`.pt`を読めるとはしていません。

## データと評価

同梱80レコードはこの試験用に作った合成文章（train 64 / validation 16）。個人情報やWeb収集物は含めません。ID・正規化文章の重複、出所欠落、fixture以外の許可種別を拒否します。ただしtrain/validationのテンプレートは似ており、validation lossの低下も一般化・自然会話・専門知識の証拠にはなりません。

本学習へ進むには、権利と利用条件を確認した日本語/英語コーパス、独立した評価セット、学習用tokenizer、端末性能目標、学習費用上限が必要です。現行loaderは意図的にsynthetic fixtureしか受け付けません。予算やデータ権利を未確認のまま本学習へ広げないでください。
