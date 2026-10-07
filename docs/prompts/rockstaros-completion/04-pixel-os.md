# 完全版プロンプト：Pixel 10・物理OS

## 対象・起点・読み方

対象は https://github.com/k999ln/rock.git。製品はRockstarOS 1.0 / dev.rock / Developer Preview。このファイル全文を担当へ渡す。他のプロンプト本文を貼り合わせなくても、この担当の段階・範囲・受入を判断できる。

2026-10-06（America/New_York）確認のmainは `e22b4a69ae9e600872f2e5ae60d9d0aab28bcfe9`。同一SHAのverify、秘密検査、CodeQL、Web測定、回帰は成功。開始時にmain・実在branch・open/merged PR・同一SHA CIを再取得し、更新があれば差分を読む。

OS側PR #86とSky接続dialog修正PR #87はmain統合済み。#86のsource固定・ビルド出力分離・artifact検査は再利用する。全OS compile・正式署名・flash・実機起動・復旧は未受入。eSIM PR #85は未統合で、branch `codex/progress-and-esim-integration` / SHA `a7caf43a360fa0b8583feda6d9a78e86d6412fdb` の全7チェック成功はcloud accessのsource検証。実eSIM導入やOS完成の証拠ではない。PR #84のcache修正と依存更新も最新状態を確認する。

AGENTS.mdに従い、docs/product-baseline.md、data/product-baseline.json、README.md、project.md、data/project-status.json、docs/mission-control.md、data/mission-control.jsonを読む。次にdocs/workstreams/README.md、docs/workstreams/00-responsibility-boundaries.md、docs/prompt-playbook.md、docs/rockstaros-design-portal.md、docs/rockstaros-complete-design.md、docs/sky-tools-complete-design.md、docs/rockstaros-1.0-architecture.mdを読む。

RQ01〜RQ49と最新明示方針を維持する。taskAssignmentsから主担当を一つ決め、taskPlans・phaseGates・executionHolds・受入条件を読む。既存設計・schema・Wallet・SDKを調べ、再利用/拡張/未接続/矛盾をpathと根拠で分類する。他担当の編集・元checkoutの未保存変更を保持する。過去snapshotや別SHAの成功を現在の合格と呼ばない。

RockstarOSは共通runtime、SkyはAgent/Tool marketplace・接続hub、Zemaは依頼・進捗・承認・停止・成果・費用管理。Web/client、QEMU実OS、Pixel full OSを別に扱う。Mini/Pro等は共通業務契約と機種別Shell/Device Adapterで接続し、同一imageの全端末対応を仮定しない。SIM/eSIMは利用権の入口で、OS binaryをSIMへ保存しない。Game・Wallet・Material Inventionを削除せず、非金融Gameを実資金の受入待ちにしない。

## 段階：設計を先に固める

今回の受領だけでは、既存実装の読み取り診断と設計を行う。製品コード変更・配備・端末書込み・契約は開始しない。既存設計v1.1の承認は保持し、利用者が今回求めた設計差分だけを提示する。適用範囲に合意記録が既にあれば再承認を要求しない。

共通API・schema・状態・権限・データ所有者・保存・互換・失敗・復旧・資源/費用上限を先に版付きで固定する。個別設計をこの契約へ合わせ、合意した範囲から実装する。各担当の完成・個別受入後に統合する。途中でも契約fixtureで接続可能性を確認し、独断で共通契約を変更しない。

設計成果物は既存正本へ追記/修正する。構成図、利用者の操作/画面遷移、API・データ仕様、状態遷移、異常系、復旧、実装順、受入試験を含める。ボタンごとの入力・実行先・権限・結果・保存・失敗時の次操作まで決める。設計書を増やすだけ、項目名やmock画面だけで完成としない。未決事項は選択肢・推奨案・影響・決定に必要な証拠を示す。

## 担当範囲と設計課題

対象はPixel 10 GL066／frankel。docs/phone-preview-20260911.md、docs/workstreams/07-android-device-local-ai.md、docs/os-prototype.md、device support/first-flash/signing/recoveryのpolicyを読む。BlackBerry-firstへ戻さない。

1. AOSP/GrapheneOSの署名済みsource lock、kernel/vendor/firmware、partition/AVB、boot/init、Rock service/Shell/Broker/Local AI/Toolをbuild moduleへ対応付ける。単体APKとfull imageを分ける。
2. main統合済みscripts/build-phone-bringup.sh、scripts/verify-phone-artifacts.pyを使う。build固有ID、target-files/otatools、必須APK/image、sourceとoutputのhashを固定し、旧成功artifactの流用を拒否する。
3. COMPILE_BRINGUPとRELEASE_FLASHを分離。専用x86_64 Linux、64 GiB RAM、空き400 GiB等の現行要件を実診断し、未確定予算で契約しない。正式署名/復旧のrelease gateをcompile-onlyへ戻さない。
4. touch、通知、background、battery/thermal、権限、camera/mic/networkとLocal AIのoffline/停止/再起動。現行v4 APK buildと過去v2実機合格を区別する。
5. 鍵custody、署名、backup、unlock/flash、初回boot、OTA/rollback、純正復旧、data/Keystore全損復元を別gateで設計する。serial/秘密鍵をGitやログに記録しない。

受入順はhost fixture→実compile/artifact verifier→許可済み同一SKUのflash/boot→権限/保存/更新/復旧。初回flash4 gate未合格で書き込まない。実行環境不足は具体的な条件として残し、架空のOS imageや起動結果を作らない。

## 完成条件・実装への引き渡し

設計の合格は、正常/異常/復旧のフローが一貫し、担当境界・既存コード対応・共通契約版・未決条件・受入方法が具体化され、次担当が意味を推測せず実装できること。実現未確認のhardware/Provider能力は未決のまま明記する。設計合意を対象・版・受入条件として記録する。

引き渡しはtask/RQ、所有path、設計/契約版、branch/SHA、API/schema差分、移行/rollback、fixture、検証コマンド・環境・結果・証拠、artifact hash、未実施と理由、残条件、次担当を含める。設計段階ではコード/OS起動/本番を未実施と記す。

設計合意後の実装順は既存実装再利用→最小縦断→対象回帰→実UI/runtime操作→同一SHAの全体検証→個別受入→引き渡し。Webの仕事はlib/workflow.tsを通し、nativeの業務契約/fixtureと一致させる。本人・権限・失効・revision・idempotencyを維持し、modelのplanを承認やTool成功へ昇格させない。実行先・費用・状態を実serviceから表示し、架空の成功/残高/稼働を作らない。

利用者は各部分完成後の統合を指示済み。個別PASSを統合PASSへ転用せず、統合担当が契約・migration・組合せ・同一候補の縦断/復旧を検証して進める。全hardware完成を最初のpreviewの一律前提にしない。契約、支出上限、署名鍵、初期化/flash、公開の個別条件は保持する。

project.md、進捗JSON、READMEと該当workstreamを同期する。OS component/Tool設計変更時はdesign-document-indexと詳細設計も更新。project:check、baseline:check、design:check、mission:checkとnpm run verifyを実行し、実行不能なら失敗段階・環境・再現手順を残す。OS実装時はnative Linux/Android SDK/APK/実機の対象試験とdocs/templates/os-acceptance-report.mdで同一imageを受入する。host・fixture・仮想OS・Provider sandbox・実機・本番を区別する。

最終報告は設計で決めたこと、実装可能範囲、実際の検証、未決事項、引き渡し先。RQ01〜RQ49の漏れ・矛盾を自己点検し、文書保存・GitHub保存・main統合・配備・実機導入を別記する。設計/試験件数を製品完成率にしない。
