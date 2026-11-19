# 83 Mac の導入を 1 つにまとめる

設計: docs/noah-agent-market-design.md §4.3・§4.7、docs/services/noah-standalone-launch.md。署名と配布は本人の許可が要る。

## やること

1. runner に Node を同梱する。本人に Node.js を入れさせない。
2. コンテナは、macOS 26 では Apple container を使う。それ以前は今の Colima と Docker CLI のまま。
3. モデルは、接続の後に裏で取得する。進み具合を見せる。
4. Git を要らなくする（配布物は固定 hash の tar で取る）。
5. 承認を、ブラウザの「この Mac をつなぐ」から app が開く形にする。URL の手打ちとコマンド 3 つを無くす。`noah doctor`・`pair`・`start` は残す。

## 変えないもの

- 端末の承認（device authorization）、外向き HTTPS だけの通信、隔離の条件。
- Intel の Mac を対応済みと表示しない。

## 合格条件

- 何も入っていない Apple Silicon の Mac（macOS 26）で、インストーラー 1 つと承認 1 回の後、カードの「接続」から最初の成果まで進む。
- 接続計画の place の段が、この Mac で `typed` から `tap` 1 回に変わる。
- tests/noah-mac-runner.test.mjs、`npm run typecheck`。別の実機での受入は別に記録する。
