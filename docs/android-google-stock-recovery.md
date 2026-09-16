# avocadoOS Google純正復旧セット

決定日: 2026-09-16
状態: **選定規則決定済み／本人の利用条件同意・実ファイル取得・SHA-256固定は未完了**

正本は`data/android-stock-recovery-policy.json`。対象は所有済みGoogle Pixel 10 / `frankel` / GL066。

## 固定した設計

- avocadoOSのfirmware baselineをfreezeする時点で、Google公式の最新安定版を選ぶ。
- factory imageとfull OTAは必ず同一buildで揃える。
- preview／betaや古いAndroid 16 buildを復旧基準にしない。
- full OTAは、原則としてdataを消さない復旧と両slotのboot可能化に使う。
- factory imageは、full OTAで戻せない場合のwipeを伴う最終復旧に限定する。
- firmware baselineを変更するたびに、純正復旧セットも更新する。

Pixel 10はMay 2026更新でbootloader anti-rollbackが進んでいる。危険な初回flash前に、matching full OTAを使って両slotをboot可能な状態にする。復旧のために古いbootloaderへ下げない。

## 保管

実ファイルはGitへ入れず、オフライン媒体へ保管する。Gitにはbuild ID、正確なファイル名、byte数、実ファイルから計算したSHA-256だけを保存する。URL、ページ名、表示上のchecksumだけでは合格にしない。

Google公式配布物の利用条件は所有者本人が確認・同意する。ダウンロードしただけではflashやwipeを承認したことにはならない。factory image使用時は別途、対象端末、backup、wipeを明示確認する。

公式ページ:

- Factory Images: https://developers.google.com/android/images
- Full OTA Images: https://developers.google.com/android/ota

## 現在の読取り

2026-09-16にUSB接続した端末から、Pixel 10 / `frankel`、slot A、Android 17、2026-09-01 security patch、bootloader `deepspace-17.2-15372054`、Verified Boot `yellow`をread-onlyで確認した。これは復旧ファイルを取得した証拠ではない。

利用条件への同意後、同一buildの2ファイルを取得し、byte数とSHA-256を固定するまで`google-stock-recovery-artifacts`はblockedのままにする。
