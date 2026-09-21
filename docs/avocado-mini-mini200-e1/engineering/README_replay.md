# Mini200 E1 同梱モデルの再検証

標準ライブラリだけで設計計算と抽象的な権限モデルを再実行する。マイク収音、ASR推論、カメラ、ゲーム起動、外部機器、ネットワーク、決済には接続しない。**実測は0のまま。再検証PASSは製造承認やHOLD解除ではない。**

## 実行

Python 3.10以降で配布フォルダの `engineering` を開き、次を実行する。追加パッケージの導入は不要。

```text
python3 verify_all.py
```

WindowsでPython起動コマンドが `py` の場合は `py -3 verify_all.py` とする。`-O` / `-OO` はモデル内の検査が無効になるため使用不可。スクリプトもその状態を検知し失敗する。

次の4組と検証スクリプトを同じ `engineering` 配下に置く。自身の所在を基準に参照するため、配布ディレクトリを移動しても絶対パスの書換えは不要。

```text
engineering/
  verify_all.py
  README_replay.md
  core/         calculate.py, results.json, README.md
  mechanical/   calculate.py, inputs.json, calculated_results.json, README.md
  voice/        calculate.py, design_inputs.json, calculated_results.json,
                README.md, sources.json
  interaction/  permission_model.py, tests.json, README.md
```

## 確認内容

1. 同梱JSONに失敗項目がなく、件数が9・14・18・99であることを先に確認する。「保存値と同じ失敗」を再現しただけでは合格にしない。
2. 必要ファイルをOSの一時フォルダへコピーする。coreの `OUT` とmechanicalの `P` はコピー先へ変更。voiceは `calculate(dict)`、interactionは `run_tests()` を呼ぶ。
3. 再計算側にも失敗がなく、結果の構造・キー・配列順序・値が同梱JSONと一致することを確認する。整数・真偽値・文字列は厳密比較。浮動小数点だけは環境間の丸め差に備えて相対・絶対許容差とも1e-12。これは測定許容差ではない。NaN・無限大は認めない。
4. 元のengineeringファイル群のSHA-256を実行前後で比較し、元データを変更していないことを確認する。bytecodeキャッシュも作らず、一時コピーは終了時に片付ける。結果は画面へ出すだけで、配布元のJSON／READMEを上書きしない。

成功時は `PASS_CALCULATION_AND_ABSTRACT_MODEL_REPLAY_ONLY` と各群の `MATCH`、終了コード0。ファイル不足、保存値FAIL、形式不正、再計算不一致、例外、元ファイル変更は `FAIL`、終了コード1。失敗したファイルを自動修正しない。

## 件数の正しい読み方

- core：9件。処理時間・RAM・SSDの配分、仮定した視差誤差、架空ゲーム式。
- mechanical：14件。予約直方体区画、寸法・熱収支などの算術条件。
- voice：18件。PCM、RAM一時バッファ、マイク幾何、clock感度、電力配分、未検証状態の確認。
- interaction：99件。直列・メモリ上の権限／文脈モデル。

合計 **140件は結果に記録された確認項目数**。重複する前提確認があるため、独立した140種類の試験とも、140件の現物合格とも呼ばない。

coreの架空粒子1,000ケースは、固定seedによる完全非弾性結合と運動量・エネルギー台帳の式の確認。core9件中の1項目に含まれ、140に足して「1,140試験合格」としない。化学反応、GPU速度、GTA 6、人体追跡、音声認識、物理マイク遮断を検証していない。

60fps、応答p95、発話認識、USB品質、熱・騒音、安全性、製造可能性は別の現物試験を要する。既存のRockstarOS本番リポジトリに対する統合テストでもない。

## 実行上の境界

これは信頼できる同梱Pythonモデルの再検証であり、任意の改ざんコードを隔離するサンドボックスではない。入手元と配布物のハッシュを確認し、信頼できない差替えファイルは実行しない。元フォルダへの書込み権限は不要だが、一時フォルダへの書込みと元データの読取りは必要。
