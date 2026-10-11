# 最終メディア 3 点の private draft 取得確認

2026-09-10 13:13–13:14 UTC。RQ-RLS01 の取得経路確認として、既存の認証済み `gh api` を使用し、空の専用 directory へ GitHub draft release 386171909 の追加 assets 3 点を取得した。再利用した信頼入力は root の `private-final-media-assets.json` に記録された ID・size・SHA256。課題は保存済みの媒体と実取得 bytes の一致で、最小操作を 3 GET と全 readback に限定した。合格指標は取得 3/3 一致、archive member の不足・重複・未知・内容差分 0。

| Asset ID | 内容 | 実取得 bytes | SHA256 |
| --- | --- | ---: | --- |
| 555005163 | MP4 | 730404 | `58c832e84b2b952f6713cdc2abf9a417b8be338e4ccc13e6d6f7ad7a7406fd42` |
| 555005164 | VTT | 630 | `653fc274fce595d4a3e421dd06a3e8fb45298f004f0d3ffcb127921fc60910b1` |
| 555005165 | C raw evidence tar.gz | 52135719 | `19d9cae205b8fd44454d4202c6fcdf988d9640b17b652320a5ba720cab10693c` |

取得直前の API metadata でも draft=true、prerelease=true、target=最終 source `9abf78a80d27aa9f847c4051d20e4c552e407276`、3 assets の ID/name/size/digest を独立照合した。すべて exit 0 で取得し、全 bytes を読み直して期待 SHA と size に一致。一般公開 URL の匿名アクセスや公開開始を確認した証拠ではない。

C archive は **825 regular members（inventory 1 + evidence 824）**、展開後相当 58,761,946 bytes を extraction せず全て読んだ。inventory の 824 entry と実 member の size/SHA が完全一致し、unsafe path・duplicate・非 regular・未知 member は 0。source/freeze/Image/rootfs/stage0 の宣言値も既存 final pin と一致。`downloaded-inventory.json` は取得 archive 内の原本で、`FAIL_RETAINED` を含む元試験記録を変更していない。今回の readback は OS sequence の再実行や結果の再分類ではない。

MP4 は ffprobe の container 読取で H264 / 720×960 / 361 frames / 90.04 秒、video stream 1・audio stream 0。VTT は 4 cues。新しい browser 再生・全 frame decode・字幕表示の再検証は行わず、同じ SHA の媒体に対する元 ba900 browser QA と、その native caption-render NOT_CONFIRMED を保持する。

`acquisition.json` は時刻・API asset ID・取得先・期待/実 hash、`readback.json` は全 archive 読戻しの結果、`release-binding.json` は取得直前の最小 API metadata。原 3 downloads は projectless workspace の `work/private-final-media-download-01/` に保持した。既存 OS 配布 9 ファイルの再取得、source/runtime/image の変更、新 VM・native・金融試験、公開操作は行っていない。製品 license UNSET / legal NOT_CLEARED のまま。
