# ローンチ準備の現在入口

## 2026-09-11 — 開発本体へスマホ準備と現状を統合

現在の入口は[統合した開発状態](docs/current-state-20260911.md)、次の指示は[再開手順](docs/prompts/rock-current-next-20260911.md)。スマホ準備3eeeeedをlaunch-candidateへ取り込み、旧QEMU受入、本人限定Site公開、CM制作途中、MIT/署名鍵/クラウド予算の未回答を同期した。main・配布image・Sites配信は今回変更していない。

## 以下は日付付きの作業履歴

過去の「次」「現在」「準備中」はその時点の記録。最新状態は上記と機械可読進捗を優先する。

## 2026-09-11 — スマホへ書き込むOS版の開発開始

利用者の明示指示で実機版の開発を開始。Pixel 10候補の公式安定版タグ署名を確認し、固定source・端末product組込み・Linux build入口・読取り専用端末診断を追加した。利用できるLinux環境はないとの回答を受領。対象機種/SKUの再確認、クラウド予算/アカウント、全OS build、Hub/Wallet/Game移植、Android署名と実機受入が必要。まだ書込み可能なimageは生成していない。[実装と再開手順](docs/phone-preview-20260911.md)。


## 2026-09-11 — kaiya の公開設定と新規Sites

権利者名kaiya、自作部分の改変・再配布許可、新規Sites作成、CM制作途中を最新指示として記録。MITの具体条文と本人だけで行う署名方式は準備段階。新サイトは本人限定で公開済み。空のD1で開始し、元サイトとDBの復旧を完了扱いにしない。MIT確認用全文、本人署名CLIと新7＋既存29署名試験、取消/メモリの追加診断を保存した。[今回の設定](docs/owner-setup-20260911.md)。


9月11日追加実装: TLSの1byte受信増幅を最大8KiBの先読みで修正し、期限・header/body上限・単一requestを維持した。修正前の18件中4FAIL→修正後18件＋関連57件＝75PASS/skip0、独立reviewも所見なし。同じ承認経路に4ms/recvを加えた制御実験は旧実装がheader受信中に1秒timeout、新実装は49〜52msで成功したが、原TLS原因の確定ではない。将来のowner許諾を変更しないcandidate bytesへ照合する別置き検証器を追加し、新11＋既存44＝55fixture PASS。所有者の実承認は未受領。旧VM/9ab配布物を保持して、新しい隔離VMで新sourceのbuildを準備中。配布hash検証は開始時のfile size＋1byteまでに制限し、検証中の増大/縮小を拒否する。新image/D0〜D6は未実施、Sitesは再度NOT_FOUND、license/CM/reviewer/PR #5限定mergeは回答待ち。

署名保護の実API照合: `codex/release-signing-control` と公開変数を `ca7356550b0042d05f60a389a90aebd5210510e6` へ固定し、locked/admin enforcement/force・delete禁止/独立PR承認をreadbackした。個人repoはRESTの空bypass設定を422拒否し、そのfieldを返さないため、PR #4の修正はexact repository/branch prefix/commit/ruleに結び付くGraphQL integer0を必須にする。27署名試験PASS。control branchは旧ca73565のまま保護し、修正・owner policy/trustの反映は独立レビュー付き更新待ち。Environment/管理鍵/初回登録は未設定。ca73565自体の全10checks・native1671/skip0成功はSHA別の原証拠に保存した。

追加実装: packagerの未署名exportとcontrol側の候補準備処理を実装し、37fixtureと既存desktop50を確認。共有clockを差し替えるテスト不具合は修正前FAIL→修正後13PASS。旧9ab配布物・runtime・imageは不変だが、新packagerの実生成には新sourceのbuild/freeze/受入が必要。独立レビューによる出力directory競合も修正した。限定bootstrapはDraft PR #5（a441162、CI成功）に分離し、mainは未merge。原TLS原因と所有者入力は未解決。新HEADの最終CIとcontrol ref/protectionはGitHubの実readbackを別証拠に記録する。

再開確認（2026-09-10 22:03 UTC）: GitHubの最終候補は `97d952937add42de04092a2e6c2fac8aba3d8bad`、Draft PR #4はMERGEABLE・全9check成功。mainと旧9ab配布物は不変。Hub改修をやり直す段階ではなく、TLS原因の追加調査と、新しい配布候補を管理署名へ渡す処理へ進む。Sitesは再度NOT_FOUND、署名Environment/control branch/workflow登録と独立承認者は未設定。以下の検証記録は各SHA時点の履歴として保持する。

検証完了記録: `85620ec8b0d5d9913cd2d50f8ead4fbe109ee9bb` はDraft PR #4でMERGEABLE、Web/native/Android/署名fixtureの全10check成功。native1,670件/17checks/skip0とroot UI、ローカルWeb93tests/API143assertions+実行API、audit0、公式Sites buildを確認。文書更新後のHEADはPR自身のCIで別途判定する。外部条件と原TLS原因の未達を理由にBLOCKED_FOR_LAUNCHを保持する。

[ローンチ準備記録](docs/launch-readiness-20260910.md)とLCH01〜07を先に読む。Hubフロント/既存Sites API・PWA・DB履歴の統合、D1両upgrade、実ブラウザ、PC17回帰、原TLS診断、配布全inventoryを実施。再開branch `codex/rockstaros-release-20260910` から最終 `codex/rockstaros-launch-candidate-20260910` をmain基点no-ffで用意済み。開始29e4、凍結配布9abは別のまま。**BLOCKED_FOR_LAUNCH**。詳細な原因・path・証拠・次の操作は上記を参照。以下は過去の履歴。

# 2026-09-10 native CIタイムアウト修正の入口

[CI修正記録](docs/native-ci-partition-fix-20260910.md)を先に読む。3d07df0の600秒FAILを保持し、進行中の主suiteを4独立jobへ分割。Linux1660件／17checksとWeb verify、修正f88b392のGitHub native全6job／root UIとWebが成功。原ログと699入力の独立照合も完了。先行TLS ERRORの原因・LICENSE・既存Sitesアクセスは別の残件。凍結9ab配布物とCM完成済みを維持する。以下は前回の記録。

# 2026-09-10 最終結果・CM完成後の再開入口

現在の入口は[進捗・CM完成後の残件](docs/release-followup-20260910.md)。配布native／同梱host toolsは `9abf78a80d27aa9f847c4051d20e4c552e407276`、後続統合版は `1a2f4d1afc68e8920b084302e8c9f1271c1478e2`、再開branchは `codex/rockstaros-release-20260910`。内部の限定D0〜D6／導入・復旧／Game・SDK・実動画と、統合1a2のWeb/native CIは完了。先行する間欠障害の原因、LICENSE、既存Sitesアクセスは未解決。PR #3はdraft／OPEN、main未統合。

CM制作は利用者申告で完成済み。既存CMの確認・導入案内への接続を次作業とし、追加1〜2日は外部条件の待ちを除くQEMU Preview仕上げの条件付き概算として扱う。05:43:35 UTC開始、13:45:19.822614 UTC最終判定で約8時間1分44秒（待ちを含む、実作業時間は未計測）。[同一候補受入](docs/os-acceptance-9abf78a-20260910.md)、[元FAILと追加全回帰](docs/os-native-repeat-20260910.md)、[実行履歴](docs/release-execution-20260910.md)を保持する。

以下は開始前の履歴。旧候補b828の未達や実行中processを現在へ転記しない。

# Rock star OS — 現在の実装CHECKPOINT

作業branch: `codex/operational-base-20260909`。保存時点: 2026-09-10 UTC。[実装・検証・未達の統合記録](docs/implementation-checkpoint-20260909.md)を現在の入口とする。

最新の設計入口は [RockstarOS 1.0製品・事業・開発設計](docs/rockstaros-1.0-strategy.md)。利用者の8原則を具体化し、現ベースを維持する。対象市場・引用整理の代表商品化・pilot指標は検証仮説。次はD6の最終結果取得とRLS01の導入準備を並行し、一つの商品体験の実用比較を準備する。Game交換/SDKは継続必須。`8e6d217`のWeb/Android/native CI成功を確認済みだが、D6/実機/実資金の合格ではない。本更新は設計のみ。

設計v1.1は実装承認済み。[承認範囲](docs/execution-approval-20260909.md)と[製品ベース](docs/product-baseline.md)を読む。main `7cdbb5fedc86ee3978ed329d9312147d137c9199`、native `fcedcfec4dd2a242a1ba8fd7ff5eebba97b8ecd5`、設計 `27b34adc02a9e06a4816aa18a5e38cf38b330953` の3入力を専用branchへ統合済み。main/既存native PRはまだ未変更。元IMPORT-MANIFESTと旧Nタスクは保持。

次の作業: 凍結b8287bcのD0〜D5は[限定受入](docs/os-acceptance-b8287bc-20260909.md)を照合済み。D6 run42の失敗に加え、run43は反復41件の後、ホスト低電池休止を伴ってOCR/観測の期限を超過した。失敗後の通常終了と47jobs/55actions保持は別に検証済み。AC接続下の新しい[run44](docs/evidence/os-base/44-start-b8287bc.json)は同じ5サイクル・60分・61件の開始記録があるが、本設計更新では最終結果を取得していない。再開時は元計画・報告・終了状態を取得する。全条件が通るまでV01全体は未合格。

Macの[専用launcher v2](systems/rock-star-os/os/desktop/LAUNCHER-V2.md)は既存の隔離VM/画像/保存端末を厳密に指定する。実Chrome画面で商品導入・同意・1件実行・通常終了・再度開いた結果を確認した。修正済みlauncherで3回目の起動・結果再表示・通常終了・停止後データ保持も[確認済み](docs/evidence/os-base/mac-trial-20260909/final-mac-trial.json)。ブラウザを閉じるだけではOSを終了しない。実機用の書込みイメージではない。

OS runtimeは`b8287bc4060f4301be3a2e17e5ff7f09df4ff1f9`。凍結OSのhost toolsは`1a960756fbd5edc7f13a0578f3e7fc50025534c8`と必要なhost OCR修正だけを使う。GX00を含む現在のsourceをそのまま混ぜると埋込source照合に失敗するので、guardを解除しない。新台帳をOSへ入れる際は別buildとD4/D5再受入が必要。

公開d16ba2dのWeb/Android/native CIは成功。native Python1357実行・14checks・skipなしの[同SHA記録](docs/evidence/os-base/ci-d16ba2d-summary.json)を保存した。後続のowner clientとcurrent-copy管理引継ぎを統合し、ゲーム72件が[成功](docs/evidence/gx00/current-game-integration-root.json)。同TLS分離の追加受入4点と別game同reconcile keyの衝突は未解決で、GX00-ISOLATIONは未合格。GX01の[実装計画](docs/gx01-contract-implementation-plan.md)は設計のみ。現在のhost実装を凍結OSへの新機能搭載と扱わない。

`npm run baseline:check`、`npm run project:update`、`npm run verify`、新しいsourceはLinuxの`python3 scripts/test-native.py --output <新規ディレクトリ>`で検証する。Pixel 10 / GrapheneOSにはP1 APKを用意し実機未試験。MetaMaskは既存Webのアドレス接続だけで、送受金・実資金の接続はない。

## 以下はnative統合時点の履歴

以下の旧「次の作業順」や完了件数は取得時の履歴。現在の順序は上記と `data/project-status.json` のphaseGatesを優先する。

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
| GitHub native source-test | PASS。実隔離事前診断＋Python 1,031件＋C/UI |
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
