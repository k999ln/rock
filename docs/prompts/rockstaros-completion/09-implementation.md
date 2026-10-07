# 完全版プロンプト：設計確定後の個別実装

## 対象・起点・読み方

対象は https://github.com/k999ln/rock.git。製品はRockstarOS 1.0 / dev.rock / Developer Preview。このファイル全文を担当へ渡す。他のプロンプト本文を貼り合わせなくても、この担当の段階・範囲・受入を判断できる。

2026-10-06（America/New_York）確認のmainは `e22b4a69ae9e600872f2e5ae60d9d0aab28bcfe9`。同一SHAのverify、秘密検査、CodeQL、Web測定、回帰は成功。開始時にmain・実在branch・open/merged PR・同一SHA CIを再取得し、更新があれば差分を読む。

OS側PR #86とSky接続dialog修正PR #87はmain統合済み。#86のsource固定・ビルド出力分離・artifact検査は再利用する。全OS compile・正式署名・flash・実機起動・復旧は未受入。eSIM PR #85は未統合で、branch `codex/progress-and-esim-integration` / SHA `a7caf43a360fa0b8583feda6d9a78e86d6412fdb` の全7チェック成功はcloud accessのsource検証。実eSIM導入やOS完成の証拠ではない。PR #84のcache修正と依存更新も最新状態を確認する。

AGENTS.mdに従い、docs/product-baseline.md、data/product-baseline.json、README.md、project.md、data/project-status.json、docs/mission-control.md、data/mission-control.jsonを読む。次にdocs/workstreams/README.md、docs/workstreams/00-responsibility-boundaries.md、docs/prompt-playbook.md、docs/rockstaros-design-portal.md、docs/rockstaros-complete-design.md、docs/sky-tools-complete-design.md、docs/rockstaros-1.0-architecture.mdを読む。

RQ01〜RQ49と最新明示方針を維持する。taskAssignmentsから主担当を一つ決め、taskPlans・phaseGates・executionHolds・受入条件を読む。既存設計・schema・Wallet・SDKを調べ、再利用/拡張/未接続/矛盾をpathと根拠で分類する。他担当の編集・元checkoutの未保存変更を保持する。過去snapshotや別SHAの成功を現在の合格と呼ばない。

RockstarOSは共通runtime、SkyはAgent/Tool marketplace・接続hub、Zemaは依頼・進捗・承認・停止・成果・費用管理。Web/client、QEMU実OS、Pixel full OSを別に扱う。Mini/Pro等は共通業務契約と機種別Shell/Device Adapterで接続し、同一imageの全端末対応を仮定しない。SIM/eSIMは利用権の入口で、OS binaryをSIMへ保存しない。Game・Wallet・Material Inventionを削除せず、非金融Gameを実資金の受入待ちにしない。

## 段階：設計確定後の個別実装

適用する設計版、共通契約版、合意範囲を最初に確認する。未提示/未確定の設計が必要ならその設計へ戻る。既存の合意と設計v1.1承認を繰り返し要求せず、新しい差分だけを確認する。
担当は一つのmoduleと既存taskで区切り、所有pathを宣言する。他担当の変更を戻さず、共有schema/APIは固定契約へ合わせる。

1. 最新mainと対象PRを照合し、dirty checkoutを保持した独立branchで開始。mainにあるPR86/87を二重実装せず、未統合PR85等の依存は必要性とheadを固定して別記する。
2. 要求/RQ→設計→code→試験→証拠を対応付け、既存schema/Wallet/SDK、lib/workflow.ts、Brokerの認証/権限を再利用する。
3. 最小の縦断正常系を動かし、失効/越境/二重操作/revision競合/timeout/取消/切断/crash/再起動/旧形式移行を実装する。結果不明の外部作用は照合し、無条件に再送しない。
4. UIは実service状態を表示し、仮ボタン、架空のAgent進捗/残高、偽eSIM QRを作らない。package追加とOS導入、回線とサービス利用権を区別する。
5. 対象回帰→型/lint/schema/design/project/mission→npm run verify→同一SHA CI。UIは実ブラウザー、nativeはLinuxと同一image、AndroidはSDK/APKと許可された端末で確認。環境不足は具体的な未実施として記録し、独立作業は続ける。
6. Pixelは現行build runner/artifact verifierを使いcompile/flashを分離。QEMUは実kernel/rootfsを起動。Mini/Proはhardware未成立をソフトで合格にせず、computeは本人所有の隔離hostで限定workloadから試験する。
7. 合意した範囲の正常/異常/保存/復旧が同じsourceで合格したらcommit/PRを作り、引き渡す。依存や実機待ちを残したtask全体をdoneにしない。

引き渡しはtask/RQ、所有path、設計/契約版、branch/SHA、API/schema、migration/rollback、fixture、試験コマンド/環境/結果/証拠、artifact hash、未決・次担当を含む。納品後の契約変更には新しい版と互換試験を付ける。

利用者は個別完成後の統合を指示済み。条件を満たす担当成果を統合へ進め、個別PASSをsystem PASSへ換算しない。契約/支出/署名鍵/flash/公開の個別条件は保持する。project.md、status、README、workstream、設計/indexを同期し、保存・main統合・配備・実機を分けて報告する。
