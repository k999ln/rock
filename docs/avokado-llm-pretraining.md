# avokado専用モデルの事前学習・配布設計

2026-10-05、RQ48 / AI02。利用者が「モデルをゼロから事前学習」「端末内とクラウドの両方」「まず追加費用なしで試作」を指定したため、自作の重みを生成する研究工程を追加する。既存の交換可能model・Broker・SIM/eSIMサービス契約は維持する。主担当はAndroid / Device / Local AI、現工程の責任はROCK。

## 目的と利用体験

長期目標はavokadoの端末内に小型モデルを置き、本人が許可した要求だけをcloud側モデルで補うこと。MiniはProなしで基本動作するR5要求を保持し、ProをLLMの必須親機にしない。ただしMiniのcompute/NPU/メモリー/熱設計も、専用モデルの実用能力も未確定。試作では開発者が明示された合成コーパスから学習し、損失とhashを確認し、同じcheckpointをCLIまたはloopback APIで読み込んで短い続きを生成する。

## 責任と権限

ROCKはデータ検査、学習・評価・再開、model artifactの契約を実装する。EXTERNALはPyTorch/runtime、将来のcompute供給。JOINTはMini/Pixel上の性能、export互換、cloud実環境の受入。OWNERは本学習データの利用条件、外部送信、将来の予算・契約を決定する。試作の追加有料compute上限は0。出力は非信頼の文章で、Tool実行、承認、記憶正本、Walletや仕事状態を変更する権限は一切ない。推論障害時にcloudや既存Qwenへ自動fallbackしない。

## 入出力・版・制限

実装は`toolkits/avokado-llm/`。decoder-only causal attention、2層、width 64、4 heads、context 128、語彙258（UTF-8 byte 256＋BOS/EOS）、embedding/output共有、124800 parameters。すべてランダム初期化し、外部pretrained checkpointを取得しない。これは実用LLMの規模選定ではなくパイプライン試験用。

入力JSONLは`id,text,split,source,permission`を持ち、train/validationを明示分離。NFKC・空白正規化後の完全重複とID重複を拒否し、synthetic_fixture_only以外は受け付けない。2 MBのコーパス、1回2000 step、batch 16までを上限とする。チェックポイント形式`avokado-byte-lm/1`はconfig、weights、optimizer、CPU乱数状態、累積step、corpus SHA-256を保存する。レポート`avokado-pretraining-report/1`は前後loss、token数、所要時間、hash、research-only状態を記録する。

## 状態・失敗・復旧

`requested → corpus_validated → training → checkpoint_saved → host_evaluated`。有限でないloss/gradient、入力違反、違うcorpus/configからのresumeを拒否する。出力ディレクトリの上書き禁止。完了時のcheckpointだけを再開点とし、中断したrunの未保存stepは失う。レポート保存前に失敗した不完全ディレクトリは配布対象にせず、新しいrunで再実行する。既存checkpointを保持して再開/rollbackする。

CPU、同じ環境・設定・入力では30step＋10stepの再開が40step連続とweightsまで一致する試験を行う。異なるdevice/PyTorch版でのbit一致は保証しない。推論は読み取り専用・greedyなので、同じmodelとpromptを再送しても課金やTool副作用はない。cloud移行はartifact hashを照合し、同じ生成fixtureの一致を受入条件とする。

## 保存・削除・配布

source、必要最小限の合成fixture、測定要約だけをGitへ保存。venv/checkpoint/全ログはGit除外の`work/avokado-llm/`へ置く。不要なrunはownerがディレクトリごと削除できる。APIはprompt/出力を保存・ログ記録しない。研究checkpointは署名済みModelProfileではなく、自分が生成した信頼できるファイルだけを読み込む。loadはCPUへの`weights_only=True`で、任意pickle classを有効化しない。既存の署名・失効・job pin・rollback契約を飛ばして製品へ導入しない。

## 端末内・cloud・安全境界

同じモデルのhost CLIとloopback HTTPを先に検証する。HTTPはbody 4096 bytes、prompt 127 bytes、生成256 tokensまで。single-process/single-requestの開発用で、外部公開、認証、TLS、並列production servingを提供しない。cloudは同じsourceとweightsを既存の許可済みホストで使う将来構成。今回の試験をcloud deployment扱いにしない。

端末用にはbyte tokenizer、位置埋込み、attention、量子化、runtimeが一致するexportと差分試験が必要。既存Qwen GGUF/llama.rnへ`.pt`を投入しない。将来の非信頼planner接続では、model artifact hash・版の仕事へのpin、Broker schema検証、本人承認、timeoutを既存AI02/OS07の契約で維持する。cloudの外部送信・利用量・費用上限も既存Sky経路に従う。

## 合格証拠と未決定事項

host合格は、乱数初期化から実際の勾配更新、train/validation loss有限・低下、causal maskによる未来token遮断、保存/再読込み、exact resume、CLI/HTTP生成一致、入力制限を同じsourceで確認した範囲。証拠は[測定記録](evidence/avokado-llm-pretraining.json)。CLIは[再現手順](../toolkits/avokado-llm/README.md)に記載する。合成fixtureのvalidationも同一テンプレート系統なので、言語能力・安全性・独自性を合格扱いにしない。

次はROCK/OWNERが対象用途と権利確認済みデータを固定し、独立した日本語評価セットとtokenizerを作る。JOINTがMiniの実メモリー/電力/遅延上限を測り、最小モデル規模とruntime/exportを選ぶ。OWNERが予算を更新するまで有料GPU学習・cloud契約を進めない。Mini実機、Android export、cloud deployment、本学習、一般会話能力、production trust/signingはすべて未受入。

技術根拠: [PyTorch attention API](https://docs.pytorch.org/docs/stable/generated/torch.nn.MultiheadAttention.html)、[state_dict保存/読込み](https://docs.pytorch.org/tutorials/beginner/basics/saveloadrun_tutorial.html)。実測環境はPython 3.12 / PyTorch 2.14.1 / host CPU。
