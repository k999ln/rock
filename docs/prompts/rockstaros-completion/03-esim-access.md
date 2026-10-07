# 完全版プロンプト：SIM／eSIM・Cloud利用権

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

範囲は購入チャネルからサービス利用開始・usage明細まで。docs/sim-led-product-architecture.md、docs/sim-service-entitlement-claims.md、docs/sky-billing.md、workstreams/02-sky-mcp.md・03-wallet-billing-providers.mdとPR #85を読む。既存schema/commerce/Walletを再利用し、migration番号の衝突を照合する。

1. Rockstar/キャリア/端末販売/onlineのoffer、購入、本人claim、回線activation、profile導入、端末証明、利用権、client導入を独立した状態として設計する。eSIMを全入口の必須条件にしない。
2. eSIM追加後に専用cloud利用権を得る操作と、owner/order/profile/device/packageを結ぶ信頼済みreceiptを対応付ける。SM-DP+/eUICC/carrier側の契約・実APIとRock adapterを分ける。
3. 発行/再発行/失効/期限、端末交換、返金、鍵失効、重複receipt、package変更。PR #85のscope、HttpOnly cookie、受信量制限、使用時の権限再検査を保持する。
4. SIM商品料金、通信料、既存OS月額、AI usage、外部実費を別明細にする。携帯代のような月次使用量・請求内訳・上限の体験と、キャリア合算請求の契約成立を分ける。料金や利益率を勝手に確定しない。
5. 見積送信の同意、有料実行の予算承認、予約/確定/取消/返金、署名usage receipt照合、異議/再送を設計する。BYOK/OSSと費用補助を区別する。

受入: 未払い/返金/owner不一致/失効証拠から権利を得られない。キーだけで支払い/管理/Tool承認を得られない。通信とサービス利用不可の理由を分ける。本物ではないQRをinstall可能として配布しない。fixture→provider sandbox→同一端末→本番は別証拠。

## 完成条件・実装への引き渡し

設計の合格は、正常/異常/復旧のフローが一貫し、担当境界・既存コード対応・共通契約版・未決条件・受入方法が具体化され、次担当が意味を推測せず実装できること。実現未確認のhardware/Provider能力は未決のまま明記する。設計合意を対象・版・受入条件として記録する。

引き渡しはtask/RQ、所有path、設計/契約版、branch/SHA、API/schema差分、移行/rollback、fixture、検証コマンド・環境・結果・証拠、artifact hash、未実施と理由、残条件、次担当を含める。設計段階ではコード/OS起動/本番を未実施と記す。

設計合意後の実装順は既存実装再利用→最小縦断→対象回帰→実UI/runtime操作→同一SHAの全体検証→個別受入→引き渡し。Webの仕事はlib/workflow.tsを通し、nativeの業務契約/fixtureと一致させる。本人・権限・失効・revision・idempotencyを維持し、modelのplanを承認やTool成功へ昇格させない。実行先・費用・状態を実serviceから表示し、架空の成功/残高/稼働を作らない。

利用者は各部分完成後の統合を指示済み。個別PASSを統合PASSへ転用せず、統合担当が契約・migration・組合せ・同一候補の縦断/復旧を検証して進める。全hardware完成を最初のpreviewの一律前提にしない。契約、支出上限、署名鍵、初期化/flash、公開の個別条件は保持する。

project.md、進捗JSON、READMEと該当workstreamを同期する。OS component/Tool設計変更時はdesign-document-indexと詳細設計も更新。project:check、baseline:check、design:check、mission:checkとnpm run verifyを実行し、実行不能なら失敗段階・環境・再現手順を残す。OS実装時はnative Linux/Android SDK/APK/実機の対象試験とdocs/templates/os-acceptance-report.mdで同一imageを受入する。host・fixture・仮想OS・Provider sandbox・実機・本番を区別する。

最終報告は設計で決めたこと、実装可能範囲、実際の検証、未決事項、引き渡し先。RQ01〜RQ49の漏れ・矛盾を自己点検し、文書保存・GitHub保存・main統合・配備・実機導入を別記する。設計/試験件数を製品完成率にしない。
