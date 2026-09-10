# 既存引用整理 1.0.0 の診断用 update selector

対象 RQ12/16・C / 原則: 明確な楽観主義・べき乗則 / 不便: 既存 Tool の更新画面を新規 install と誤観測 / 再利用: 凍結 9ab の UI probe・停止下 DB export・公開 package 署名検証 / 最小変更: optional flag と唯一 setup selector / 指標: default AST 全一致・負例・実停止 DB read-only / 証拠: [proof.json](proof.json)。

`observe-pc-link-os.py --fixture citations --existing-local-citation` は、既存の `b.closed_device` fence 内で export した `baseline/hub.sqlite3` を確認してから、元の `remote-tool-install` selector だけを `v1.1.0へ更新` にする。元 package source の exact SHA、installed 1.0.0 / enabled=1、package hash、source の manifest/recipe 完全一致、既存公開署名と失効状態を検証する。flag は citations 専用で `--resume-from` との併用を拒否し、停止済み baseline を必須とする。

flag を省略した AST は元 9ab と完全一致。残りの入力、3 cycle、時間・資源制限、remote 結果と元 key 回収、authority/guest の保持、正常終了、料金・refund を変更していない。元 OCR FAIL は原結果として保持し、この host observer の修正を元 probe の成功へ読み替えない。

Mac 上で 9 tests / 0.409 秒 PASS。未導入・1.1.0 導入済み・無効・hash/recipe 相違・版または作者失効・flag の誤用を拒否する。元 C の停止済み export `c08d89d0...b5c59cc91` で実 guard を読取実行し、前後全 DB bytes SHA 一致を確認した。最初の unit run は unsigned recipe source を signed envelope と誤認して 9 setup ERROR となったため、source 自体は無変更のまま、DB 内の signed envelope を検証するよう修正した。VM・金融操作はしていない。

実 OS 追加試験は別 run。凍結 9ab source/image/配布 9 file を上書きせず、変更した host observer を別 path から実行し、その observer SHA と optional flag を新 plan に明記する。依存 source は元 `--source` を指定する。

```sh
cd systems/rock-star-os
PYTHONPATH=src:os python3 -B -m unittest discover -s tests -p test_pc_link_existing_citation.py -v
```
