# Rock star OS — 次の作業用CHECKPOINT

更新日: 2026-09-09  
作業branch: `codex/integrate-native-os-20260909`  
統合本体commit: `45bb77bc6a89e79570fd2dc0da35dd100ed883d7`  
起点のRock: `5cec83478fe97bf272869298160a572ef7fcefee`

この文書だけでも次の担当が、完了済みの証拠を壊さず作業を再開できる状態にする。製品方針の正本は [native OS統合設計](docs/native-os-integration.md)、機械可読の進捗は [`data/project-status.json`](data/project-status.json)、今回の試験結果は [統合検証](docs/native-os-validation.md)。

## 製品として固定した判断

- 製品名は **Rock star OS**。自動化Toolを大量にOSへ直書きせず、標準Hubから独立packageを導入する。
- 初期製品端末は **BlackBerry優先**。機種・variantは未決定。実機適合を確認するまで対応機種を宣言しない。
- 現在動いているnative基盤は Linux / Buildroot / ARM64 QEMU virt。既存Android/AOSP P1は別の補助トラックとして保持する。
- 初期Walletは本人確認済み端末購入者に限定。引き渡し時確認を再利用して入力を減らすが、provider必須確認を省略できるとは仮定しない。
- 新OS契約は同じowner契約につき月 **888 cents固定**。複数端末で1回。既存Webの「共通収益から月最大8.88 USD相当」はファンド試算であり、同じ請求へ重ねない。
- MCPの接続状態、Tool実行結果、ToBへの精算状態は別に保存する。応答不明を無条件に再送しない。解除しても成立済みreceiptを消さない。
- cloud AIは選べる実行先の一つ。処理場所・送信データ・権限・費用を表示し、cloud停止時も許可済みlocal処理と保存済み結果を保つ。
- 運営用の診断・停止・版管理・失効・復旧機能を利用者Hubと分離し、任意root shellを共通APIにしない。
- 「特許を取れる」「世界初」「BlackBerryで完成」「現金を下ろせる」は未検証のため現時点で主張しない。

## 完了したもの

| ID | 完了範囲 | 証拠 |
| --- | --- | --- |
| N01 | Linux native基準ソースをRockへ統合し、既存Webとの回帰を確認 | `systems/rock-star-os/IMPORT-MANIFEST.json`, `docs/native-os-validation.md` |
| Hub / SDK | manifest、署名package、install/update/disable/rollback/uninstall、独立Tool fixture | `systems/rock-star-os/docs/TOOL-SDK.md`, native tests |
| native OS基盤 | kernel/rootfs構成、読取専用OSとdata分離、専用UID、native UI、A/B更新・復旧の試作 | `systems/rock-star-os/os/`, 第9封印済みQEMU証拠 |
| Wallet試作 | 購入者資格、認証・同意、月888 cents、複数端末、ledger/冪等性のsimulator | native tests、Wallet資料 |
| MCP試作 | owned fixtureの接続・実行・結果照会・解除、backend/OS再起動後の結果保持 | `docs/native-os-integration.md`, 第9封印済み証拠 |
| AI / 運営試作 | 実行先・予算policy、状態診断・停止・更新計画・復旧部品 | `systems/rock-star-os/os/ai_routes/`, `os/operations/` |
| 既存資産の維持 | Android P1、Web Work/Fund、D1、固定Mr. vendorのコードを変更せず保持 | `npm run verify`, `npm run os:check`, repository check |

## 今回の検証結果

| 検証 | 結果 |
| --- | --- |
| native Python 6suite | PASS: 1,003件 |
| C UI IPCと通常observer | PASS: 12件 + 16件 |
| C core/platform/UI compile・UI操作 | PASS |
| native入力の前後hash | PASS: 520ファイル不変 |
| 既存Web | PASS: 34 unit tests、API 143 assertions、type/lint/build |
| Android契約の静的整合 | PASS |
| GitHub Web / Android prototype | PASS。Androidはbuild・SDK・APK・emulator・parityを含む |
| GitHub native source-test | 再検証中。実隔離を維持してUbuntu 22.04へ固定済み |
| このcheckoutからの新規OS build/boot | NOT RUN。第9の封印済みQEMU結果と区別 |
| BlackBerry実機、実USB、実資金・ATM、本番公開 | NOT RUN |

通常gate外の全UI evidence探索は1 error・11 skip。古いATM fixtureが現行Walletの認証器登録・規約同意を満たさず、Wallet/powerの11件はroot所有の使い捨てfixtureを要求する。認証を弱めて成功扱いにしない。詳細は [統合検証](docs/native-os-validation.md#通常gate外で見つかった残課題)。

## まだ終わっていないもの

### N02 — 起動応答と自動再読込

`systems/rock-star-os/experiments/startup-health/changes.patch` に21ファイルの未適用WIPがある。fresh nonce、PID/UID/executable、socket、描画後のloop進行を確認してA/Bをmark-goodする案と、Hub snapshotの自動再読込を含む。

未完了:

- Pythonの `tests/test_ui_startup_health.py` は未作成。
- C healthとUI変更は未compile・未実行。
- 新OS image build、準備前・freeze・遅延・異常終了、A/B rollbackの実QEMU試験は未実行。
- framebufferへの書込みを実パネル表示や実入力の証明にしない。
- 既存画像は再起動後のpendingと後の手動更新後readyだけで、その間の自動更新が失敗したとは断定できない。

### N03/N04 — BlackBerry対応

- 正確な機種、variant、販売区分、codename、bootloader解除可否が未決定。
- kernel/device tree/vendor firmware/HAL、画面、touch/keyboard、Wi-Fi/cellular、音声、電源、充電、suspend、secure boot、partition/rollback index、復旧物の確認が未完了。
- 端末書込み、Rock star OS起動、再起動、省電力、update/rollback、brick recoveryを未実施。
- 端末だけでHubの検索・直接download・install・実行・update・rollback・uninstallを完結するE2Eは未実施。
- 「端末へタップすると使える」は、事前導入済み端末のactivation UXと、任意端末へのOS installを分けて検証する。

### N05 — 接続、金融、運営

- 外部MCPの一般Streamable HTTP/SSE・OAuth・providerごとの相互運用は未完了。
- 実AIモデルの品質・費用・遅延、端末/cloud/PCの自動選択とfallbackは未完了。
- 実USBの認証、接続・解除、再接続、通信断、PC側sandboxは未完了。
- 購入記録・引き渡し本人確認を本番providerへ引き継ぐ契約と実装は未完了。
- 実売上、ToB精算、Wallet送金、月額の実請求、出金、ATM/provider sandboxと本番照合は未完了。
- 本番署名鍵、審査・通報・失効運用、registry/OTA配信、監視、support、operator権限のpilotは未完了。
- Sites本番は既存配信branchに別のAPI/UI変更があり、統合方針を決めるまで停止中。今回のGitHub保存で公開しない。
- `vvvv`をarchiveする前の稼働参照監査も未完了。

## 次の作業順

1. **N02を閉じる。** patchを新しい分離作業木へ適用し、未作成テストを追加。C/Python全回帰→新OS build→失敗注入→A/B→操作数測定の順で、採用・修正・撤回を決める。
2. **N03の機種選定表を完成する。** 実際に入手可能なBlackBerry候補を型番・variant単位で調査し、公式/保守中ソース、解除、driver、復旧、更新の全条件を満たす1機種を選ぶ。満たさなければBlackBerry型筐体や別ハード案を、ブランド表示・商標・供給条件を含めて比較する。
3. **N04の実機E2Eを通す。** 合成ユーザー/データ、復旧物、電源・USBログ採取を先に準備し、端末のみのHub lifecycleを実証する。
4. **N05の非金融接続を先に通す。** device local→owned cloud→実USB PCを同じTool契約とreceiptで検証し、MCP接続/解除のUXとfailure recoveryを測る。
5. **金融provider sandboxを接続する。** identity/entitlement、月888 cents、売上・settlement・AVAILABLE・出金・ATM結果を均衡ledgerと冪等receiptで検証する。実資金は別の本番承認まで有効化しない。
6. **運営pilotを作る。** 署名・段階配信・停止・失効・rollback・監査を、利用者データを読まない最小権限で試験する。

## 再開コマンド

Rockリポジトリrootで実行する。

```sh
npm ci
npm run project:check
npm run repository:check
npm run verify
npm run os:check
```

nativeのsource回帰はLinuxで実行する。出力先は存在しない使い捨てフォルダーを指定する。

```sh
python3 scripts/test-native.py --output work/native-tests
```

OS build/bootは空白のないLinuxパスと新しい専用build領域で実行する。

```sh
cd systems/rock-star-os
ROCK_BUILD_DIR=/var/tmp/rock-native-build bash os/build-os.sh
python3 os/verify-boot.py
```

既存OSディスク、端末、Wallet/providerデータを自動で再利用・初期化しない。秘密値、端末serial/IMEI、顧客・運用receiptを公開Gitへ追加しない。

## 完了判定

`data/project-status.json` の21項目中、現在完了は11件。N01の完了は公開ソース統合の完了であり、Rock star OS全体の完成ではない。

少なくともN02〜N05、BlackBerry実機の端末内Hub E2E、実USB、第三者Tool E2E、購入者Walletと月次課金、provider sandboxの売上・ToB精算・ATM、運営復旧、関連品質ゲートが証拠付きで終わるまで、製品Goalをcompleteにしない。
