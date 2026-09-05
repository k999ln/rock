# Mr.からの取り込み

対象: ユーザーが利用を許可した `k999ln/Mr.`。取り込み先は独立プロダクトRock star。Mr.自体のファイルや運用設定は変更していない。

固定commit: `26a39d2c31ea5246cb78dbe42d86e333922db60c`。
原本は4ファイルをGitHubから直接取得。`vendor/mr/provenance.json` に各Git blob SHAとSHA-256を記録した。ライセンスはMIT / Copyright (c) Anicca contributors。別の目的のAGENTS.md・運用指示・認証情報はRock starの指示として取り込んでいない。

| Rock starのツール | 原本 | 実行場所 |
|---|---|---|
| ココナラ案件チェック | skills/earn/gig/scripts/application_eligibility.py | ブラウザ / PC |
| 記事の無料版メーカー | skills/writer-agent/scripts/_shared/make-free-version.py | ブラウザ / PC |
| 出典整理 | skills/writer-agent/scripts/_shared/citation-strip.py | ブラウザ / PC |
| 納品記録照合 | skills/earn/gig/scripts/deliverable_verifier.py | PC |

## 原本を残し、アダプターで直した点

- 出典整理: コードブロック・インラインコードを保護。Markdownリンクがない出典は削除しない。
- 無料版: 元の出典欄は区切り計算から分離して丸ごと再掲。出典しか残っていない状態を「有料本文あり」と扱わない。出典内の見出しを含むコードを途中で切らない。
- 無料版: 正の価格・文字数・HTTPSのnote記事URLを検査。未閉鎖コードは拒否。原本の本文末尾を含む診断ログは転送しない。
- 案件チェック: 欠けた発注率と発注率0%を区別。数値は0〜100%に制限。発注率40%以下は順位付けの参考であり、一律の拒否理由にしない。判定は受注許可や規約適合の保証ではない。
- 納品照合: revisionとexecution IDを入力検査し、ワークスペース外の参照や大きすぎるファイル群を拒否。自分と同じ実行IDのレビューは元コードによりBLOCKEDになる。
- PC版: 指定入力だけを処理し、出力先が既存ファイルなら失敗。外部通信・OS常駐・アカウント登録・送信を行わない。

## 未採用の大きな実装

ココナラの返信生成はagent-runnerや所有者設定に依存し、外部モデル接続が必要。案件の収集/自動応募/正式納品のブラウザ操作は既存のログイン・運用状態と密結合しているため、今回の小さなパックには含めていない。これらを取り込む際はユーザーごとの接続、権限、ログ、本人が確認する流れを実装する。

RSS収集（marketing-engine/intel）や記事公開も追加候補として調査したが、今回は未導入。
