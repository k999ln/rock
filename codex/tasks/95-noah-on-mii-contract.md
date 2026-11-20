# 95 mii で使うための契約（Linux の host で同じ受入を通す）

設計: docs/noah-design.md §4.7・§5、docs/structure/01-mii.md、docs/services/noah-own-device.md、docs/services/noah-screenless.md。先に 71 の最小構成の受入と 83。mii の実機・Hub の基板・表示の方式はこの task で決めない。

## やること

1. runner の Mac 固有の処理（Colima の起動、LaunchAgent、モデルの管理の場所）を 1 か所に寄せ、host の種類を差し替えられる形にする。
2. Linux の host（ふつうの Linux。次に QEMU の RockstarOS）で、同じ runner が、端末の承認 → 接続 → 実行 → 成果 → 停止を通す。Mac と同じ試験をそのまま使う。
3. 置き場所 `home` の端末の行に platform を持ち、Mac と Linux を同じ一覧に出す。契約に機種の名前を書かない。
4. 声と空間の表示の模擬。依頼は文字で Eve へ入れ（声の代わり）、成果は「表示の依頼」として返す（表示層の代わりに、決まった形の記録へ出す）。Agent は表示・カメラ・マイクに触れない。
5. Mac でつないだ Agent が、Linux の host を承認した後、1 回の確認で移ること。
6. Hub に要る演算の見積もりを出す（同時 2 件の隔離環境、各 1.5 vCPU・1.5GiB、ローカルモデル）。01 の未決事項への入力にする。数字は候補。

## 変えないもの

- `noah-terminal/1`、`noah-isolation/1`、受け渡しの API、隔離の条件。
- mii の hardware profile に、仕事の意味・権限・課金を書かない。端末の購入・flash・署名鍵は本人の明示許可の後。

## 合格条件

- Linux の host で、今の対応 Agent の 1 件以上が、Mac と同じ成果を返す。停止の後に隔離環境が残らない。
- 84 の検査が Linux の host でも通る。Agent から表示・入力装置へ届く経路が無い。
- Mac と Linux の 2 台で、同じ要求 ID の実行が 1 回。
- tests/noah-runner-host.test.mjs、`npm run typecheck`。実機の受入は別に記録する。
