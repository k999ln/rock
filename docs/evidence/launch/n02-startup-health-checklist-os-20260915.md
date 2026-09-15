# N02 起動応答 / 自動再読込 — OS試験チェックリスト

- 記録担当: rockstar_bot｜OS
- 作業branch: `codex/rockstaros-launch-candidate-20260910`（PR #4）
- 記録時 HEAD: `0cc5415e4724199505e1f54942918b72eb88ccae`
- 性質: **実行手順と合格条件の固定**。この文書の保存自体を N02 done / QEMU合格にしない。
- 環境ラベル必須: host / 仮想OS(guest) / fixture。実機・本番・main と混ぜない。

関連:

- `systems/rock-star-os/experiments/startup-health/README.md`（WIP説明。一部記述は古い）
- `systems/rock-star-os/experiments/startup-health/changes.patch`
- `systems/rock-star-os/os/update/ui_health.py`（tree上に存在）
- `systems/rock-star-os/tests/test_ui_startup_health.py`（tree上に存在）
- `docs/native-os-validation.md` / `docs/templates/os-acceptance-report.md`（D4）
- cancel/RSS: `docs/evidence/launch/cancel-rss-gates-os-20260911.md`（別ゲート）

## 0. 現状スナップショット（記録時）

| 項目 | 状態 |
| --- | --- |
| N02 task | `in_progress` |
| experiment README | 「テスト未作成・OS boot未実行」と記載（**staleの可能性**） |
| `ui_health.py` / `test_ui_startup_health.py` | **tree上に存在**（host/Linux試験の入口あり） |
| `changes.patch` の本線適用 | README上は未適用。適用可否は分離作業木で再確認 |
| 新OS image build + 実QEMU D4（mark-good拒否 / A/B回復） | **未実施扱い**（過去rc2受入はN02 WIP採用判定の代替ではない） |
| headless成功 → GUI成功への読み替え | 禁止 |

## 1. 着手前ゲート（全部必須）

- [ ] 分離作業木のみ。基準版 / 受入済みdiskを壊さない
- [ ] 第9封印 source base hash を照合（IMPORT-MANIFEST / experiment manifest）
- [ ] `git apply --check` on `experiments/startup-health/changes.patch`（未適用差分が残る場合）
- [ ] shell wrapper 実行属性を manifest と一致
- [ ] 環境ラベルを記録: host OS / arch、QEMU版、guest profile、fixture署名種別

## 2. host / Linux 試験ゲート

作業ディレクトリは disposable。出力は存在しない専用フォルダへ。

```sh
# Rock root（Linux）
python3 -m unittest systems.rock-star-os.tests.test_ui_startup_health -v
# または systems/rock-star-os 配下の既存 native 入口に従う
python3 scripts/test-native.py --output work/native-tests-n02
```

合格条件:

- [ ] nonce / PID / UID / exe 不一致を拒否
- [ ] 停止loop・余分/切詰め/ancillary packet・timeout・FD漏れを実Linux socketで検出
- [ ] portable-only 実行を Linux full PASS に数えない
- [ ] C health / UI server（UID0/UID1000）が必要な対象なら compile + 試験 PASS
- [ ] 既存全回帰（C/Python）PASS。安全制限を弱めない

失敗時: 原本ログとhashを残し、N02を done にしない。

## 3. 仮想OS (guest) / QEMU D4 ゲート

```sh
cd systems/rock-star-os
ROCK_BUILD_DIR=/var/tmp/rock-native-build-n02 bash os/build-os.sh
python3 os/verify-boot.py
```

合格条件（受入テンプレ D4）:

- [ ] **新しい** OS image をこの変更セットから build（旧imageの使い回し禁止）
- [ ] UI準備前 / 無応答 / 異常終了で **mark-good しない**
- [ ] 検証済み slot へ A/B 回復できる
- [ ] headless 明示指定の成功を GUI 成功に数えない
- [ ] 画面メモリ書込み・イベントループ応答を物理パネル入力の証明にしない

## 4. 操作コスト測定（同条件）

- [ ] 正常起動で追加の手動更新が不要か
- [ ] 操作数・待ち時間を改善前（履歴）と同条件で記録
- [ ] pending画像と後のready画像だけで原因断定しない

## 5. 採用判断

いずれか1つを証拠付きで選ぶ:

| 判定 | 条件 |
| --- | --- |
| 採用 | §1–4 すべて PASS。本線適用commitと回帰証拠あり |
| 修正して再試験 | 失敗原因と最小修正、再試験計画を記録 |
| 撤回 | 不採用理由と、残す/捨てる差分を記録 |

`data/project-status.json` の N02 を `done` にするのは採用（または明示的撤回完了）の後だけ。

## 6. 読み替え禁止

- rc2 / D6 / cancel補助kit の成功を N02 WIP 採用に使う
- phone source prep CI を QEMU D4 に使う
- host unittest だけを guest boot 合格にする
- Android emulator / APK を native 起動合格にする

## 7. 未実施のまま残すもの

- 実機 flash / boot（N03・スマホ担当）
- 本番鍵・正式署名（Release）
- クラウド課金を伴うフルbuild（**ユーザー確認必須**）
- main merge
