# 36 Mr. の gig を上流（Daisuke134/life-manager）の最新へ同期する

対象 repo: k999ln/Mr.（この repo ではない）。設計: docs/earn-loop-parity.md §2.1。上流は MIT。

## やること

1. `docs/manifests/oss-merge-1-sources.json` の rockstar_ibot の commit（3aaf13ce、2026-07-29）から上流 main までの差分を、`skills/earn/gig/`、`config/loop-registry.json` の gig・coconala の項目、`apps/lancers-revenue`、`apps/crowdworks-revenue`、`runtime/agent-runner` に限って取り込む。
2. Mr. の改名（life-manager → rockstar_ibot、anicca-life-manager → anicca-rockstar_ibot）を、取り込んだファイルに同じ規則で当てる。
3. 上流にあって Mr. に無い gig scripts 24 本を足し、内容が違う 69 本は上流を土台に Mr. 側の変更（`verified_owner_profile.py` を呼ぶ箇所など）だけ戻す。
4. manifest の commit と inventory_sha256 を更新する。

## 変えないもの

- 資格情報・個人の設定・ブラウザの profile・実行時の状態は取り込まない（manifest の policy）。
- 実アカウントでの実行は本人が行う。

## 合格条件

- Mr. の `skills/earn/gig/tests` と `__tests__` が通る。
- `./bin/lm-loop doctor`（Mr. での名前に読み替え）が gig の 4 lane と reconcile・evidence-gc を列挙する。
- 取り込み前後で、Mr. だけにあったファイルが消えていない。
