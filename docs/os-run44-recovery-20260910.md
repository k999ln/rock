# 凍結 b8287bc の run44 最終結果回収

対象RQ07〜10・12・16・17 / 明確な楽観主義・べき乗則 / 長時間試験後の保存結果が未確定で導入判断が止まる不便 / 既存 business contract・停止済みdisk・署名profile / 原本の読取回収と独立照合だけ / 元の5boot・61job・60分・資源上限 / [機械証拠](evidence/os-base/run44/recovery.json)。

2026-09-10 05:50:58 UTC、元のLinux環境からrun44の最終reportと停止後データを回収した。**凍結runtime `b8287bc4060f4301be3a2e17e5ff7f09df4ff1f9` のD6は、当初宣言したQEMU開発条件でPASS。** [開始記録](evidence/os-base/44-start-b8287bc.json)を完了報告へ書き換えず、後続結果として保存する。run39/42/43の失敗は保持する。

この結果は2026-09-10の新しいGame/SDK搭載候補、fresh導入、実機、本番資金、guest各serviceの資源使用量を検証したものではない。D0〜D5は[同じ旧候補の限定受入](os-acceptance-b8287bc-20260909.md)に既存証拠があり、本回収はそのD6未確定を解消する。配布する新候補には、変更の影響を評価して必要な同一image受入を実行する。

## 実測と独立照合

| 項目 | 元の条件 | 実測・確認 |
| --- | --- | --- |
| 正常起動・終了 | 異なる5 boot、各boot180秒以内・終了60秒以内 | 5/5。boot22.47〜42.51秒、終了8.59〜11.16秒 |
| 継続業務 | 61 jobs、3600〜4200秒 | 61 jobs、3641.769秒 |
| job期限 | 90秒以内、開始間隔180秒以内 | 最大46.625秒、最大間隔60.005秒 |
| QEMU RSS | peak2097152 KiB、増加524288 KiB以内 | peak849004 KiB、増加42388 KiB |
| QEMU CPU | 平均3.5 cores以内 | 0.292316 cores |
| 資源観測 | 2秒sampling、最大gap10秒 | soak中1817 samples、最大gap2.150秒 |
| 台帳・成果 | 消失・二重job/receipt・無断副作用0 | 全67 jobs、76 requests、76 audit、5電源receiptsが一致 |
| 終了後保持 | clean filesystem・正常停止event・非対象DB保持 | e2fsck `-f -n` 終了0、6 DB/44 tables、A/B bytes・署名状態一致 |
| 実画面 | 元のOCR確信度45以上・固定期限 | 元reportの741 PNGのbytes/hash、UI状態から参照される画像を照合 |

788項目の独立読取照合に成功した。この数を新たなguest試験件数や製品完成率には換算しない。全bootの原本serial logにUI、authenticator、platform、wallet、system、coreの停止、dataのunmount、`reboot: Power down`がある。QMPは各boot1件の`guest: true`のSHUTDOWN。最終guest eventは02:04:22 UTC。最後のQEMU PID1021886は停止済みで、記録されたsessionも最終reportに一致した。

[最終の保存結果画面](evidence/os-base/run44/0621-result-after-delete.png)には実際に保存された`Brief C4J60`が表示されている。商品削除後も成果が残る。同画面のタイトルはcatalogの最新版名を使う既存挙動であり、保存結果の`format: standard`とは区別する。新機能の完成画面や動画の代用ではない。

## 一意な対応と原本保全

| 対象 | SHA-256 |
| --- | --- |
| [元計画bytes](evidence/os-base/run44/plan.json) | `87df318c07e968052563bbb35ef12af4af5d14b478d35bb8dee31b760827010e` |
| 計画のUTF-8 canonical JSON | `0a7ab097dbae3d7932f06d0c3141e55ab2b49a326a9d951d04e364ad40176ae3` |
| 元の最終report bytes | `03c43c490f187079e16c57e1111e44c3ceefaf0c453691b33c5a7efd207cbbb7` |
| 最終停止userdata | `5c325487812e3e530e03271b3e06b862471eb59bb0041d1763d43069a54f469d` |
| 停止時DB snapshot canonical JSON | `b17bbd1a67843def7287a6fa127aba553b9639770f737661e2b0c610f768b512` |

計画ファイルのraw hashとreport内のcanonical hashはJSONの空白とUnicodeの符号化規則が異なるため、別の値で正しい。元計画の値と全固定閾値を読み取り、既存`validate_soak`で再評価した。

Image/rootfs/stage0とfactoryのhash、各bootのdisk/event/log hash、各resource file hash、host tools各Pythonファイルhashは[機械証拠](evidence/os-base/run44/recovery.json)に保存した。元hostは`1a960756fbd5edc7f13a0578f3e7fc50025534c8`に記録済みの[OCR修正](evidence/os-base/host-result-ocr.json)を加えたrkh15。`guest.validate_config`が行う署名factoryと埋込host source照合を維持した。

元原本はLinuxの`/var/tmp/rk-business/business-acbb54714e014da4a63f`、保存diskは`/var/tmp/rock-star-desktop/business-acbb54714e014da4a63f`に保持する。report本体約1.5 MB、大量画面、OS image、cacheはGitに追加せず、要約とselected frameを保存した。今回QEMU開始、job再送、repair、台帳変更、データ初期化は行っていない。既存の停止確認lockを取得し、`e2fsck -n`と`debugfs`のread-only抽出で照合、終了時にも元diskのhash不変を確認した。

## 再開入口

元環境は専用Lima VM `rock-native`、Debian13 arm64、QEMU10.0.11。個人環境の接続設定は配布パッケージへ流用しない。元試験の再実行は不要であり、回収監査は停止状態を保持して行う。新しいcandidateをbuildした後はそのsource/image/host tools/configを固定し、必要なD0〜D6・台帳互換・復旧を別runとして受入する。

run44の成功は保存/復旧を説明できるQEMU雛形の根拠となる。誰が何分の手作業を減らせるか、初見導入や7日間継続、Game交換の完了は別の実測対象のまま。
