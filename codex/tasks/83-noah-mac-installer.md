# 83 専用の端末（家）— 今ある Mac を、座らずに使える端末にする

設計: docs/noah-design.md §3.7・§6、docs/noah-agent-market-design.md §4.1・§4.2・§4.9、docs/services/noah-own-device.md、docs/services/noah-standalone-launch.md。先に 71 の最小構成の受入。署名と配布は本人の許可が要る。本線の 2 歩目。

## やること

1. runner に Node を同梱する。Git を要らなくする（配布物は固定 hash の tar で取る）。
2. コンテナは、macOS 26 では Apple container を使う。それ以前は今の Colima と Docker CLI のまま。
3. 承認を、スマホに出した QR を Mac で読む形（または Mac に出した QR をスマホで読む形）にする。URL の手打ちとコマンド 3 つを無くす。`noah doctor`・`pair`・`start` は残す。
4. 導入の後は窓を出さない。常駐（`scripts/noah-mac-service.mjs`）を既定にし、実行用 image は接続の前に裏で用意する。
5. 重さの上限。隔離環境を低い優先度で動かす。ローカルモデルの推論は、端末が空いている時か、本人が選んだ時だけ。それ以外は中継を使う。
6. 接続要件の place=`home` として扱い、端末の行に platform を持つ。mii の Hub と Pro が同じ契約で入れるように、Mac 固有の処理を 1 か所に寄せる。

## 変えないもの

- 端末の承認（device authorization）、外向き HTTPS だけの通信、隔離の条件。
- Intel の Mac を対応済みと表示しない。置き場所を黙って変えない。

## 合格条件

- 何も入っていない Apple Silicon の Mac（macOS 26）で、導入 1 つと承認 1 回の後、スマホのカードの「接続」から最初の成果まで進む。その間、Mac の前面アプリと入力に変化が無い（84 の検査）。
- 接続計画の place の段が、この端末で `typed` から `tap` 1 回に変わる。
- Mac が止まっている時、仕事は待ちになり、黙って雲へ回らない。本人が選んだ時だけ雲へ回る。
- tests/noah-mac-runner.test.mjs、`npm run typecheck`。別の実機での受入は別に記録する。
