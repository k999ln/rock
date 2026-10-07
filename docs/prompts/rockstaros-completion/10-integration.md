# 完全版プロンプト：統合・全体受入

## 対象・起点・読み方

対象は https://github.com/k999ln/rock.git。製品はRockstarOS 1.0 / dev.rock / Developer Preview。このファイル全文を担当へ渡す。他のプロンプト本文を貼り合わせなくても、この担当の段階・範囲・受入を判断できる。

2026-10-06（America/New_York）確認のmainは `e22b4a69ae9e600872f2e5ae60d9d0aab28bcfe9`。同一SHAのverify、秘密検査、CodeQL、Web測定、回帰は成功。開始時にmain・実在branch・open/merged PR・同一SHA CIを再取得し、更新があれば差分を読む。

OS側PR #86とSky接続dialog修正PR #87はmain統合済み。#86のsource固定・ビルド出力分離・artifact検査は再利用する。全OS compile・正式署名・flash・実機起動・復旧は未受入。eSIM PR #85は未統合で、branch `codex/progress-and-esim-integration` / SHA `a7caf43a360fa0b8583feda6d9a78e86d6412fdb` の全7チェック成功はcloud accessのsource検証。実eSIM導入やOS完成の証拠ではない。PR #84のcache修正と依存更新も最新状態を確認する。

AGENTS.mdに従い、docs/product-baseline.md、data/product-baseline.json、README.md、project.md、data/project-status.json、docs/mission-control.md、data/mission-control.jsonを読む。次にdocs/workstreams/README.md、docs/workstreams/00-responsibility-boundaries.md、docs/prompt-playbook.md、docs/rockstaros-design-portal.md、docs/rockstaros-complete-design.md、docs/sky-tools-complete-design.md、docs/rockstaros-1.0-architecture.mdを読む。

RQ01〜RQ49と最新明示方針を維持する。taskAssignmentsから主担当を一つ決め、taskPlans・phaseGates・executionHolds・受入条件を読む。既存設計・schema・Wallet・SDKを調べ、再利用/拡張/未接続/矛盾をpathと根拠で分類する。他担当の編集・元checkoutの未保存変更を保持する。過去snapshotや別SHAの成功を現在の合格と呼ばない。

RockstarOSは共通runtime、SkyはAgent/Tool marketplace・接続hub、Zemaは依頼・進捗・承認・停止・成果・費用管理。Web/client、QEMU実OS、Pixel full OSを別に扱う。Mini/Pro等は共通業務契約と機種別Shell/Device Adapterで接続し、同一imageの全端末対応を仮定しない。SIM/eSIMは利用権の入口で、OS binaryをSIMへ保存しない。Game・Wallet・Material Inventionを削除せず、非金融Gameを実資金の受入待ちにしない。

## 段階：個別完成後の統合・全体受入

利用者は「それぞれ完成したら統合する」と指示済み。全体設計/共通契約の合意と担当の引き渡し記録を確認し、完成した範囲を統合する。未完成のMini/Pro/computeを最初のpreviewの一律条件にしない。設計未合意や未受入の機能を有効化せず、独立して完成した部分を進める。

1. 対象task、branch/head、契約版、API/schema、移行、artifact、試験、残条件を一覧化。PR86/87はmain統合済みなので再適用しない。未統合PRと依存更新は最新状態を読む。
2. 最新main起点の隔離統合branchで、共通Core/契約→保存・認証adapter→Shell/Web→Sky/Zema・eSIM/usage→対象端末を依存順で統合する。各機種の適合は別に検査する。
3. 競合を片側丸ごと採用で消さない。migration番号、owner/revision、workflow、scope、署名policy、公開hashの完全一致例外、生成物を両側の意図に沿って解決する。CIのために検査/承認gateを弱めない。
4. 統合treeでnpm run verifyと対象native/Android試験、旧データ/旧client、schema移行/rollbackを実行。個別branchの成功を統合treeへ流用しない。
5. 同じ候補で起動→本人確認→Sky選択→Zema依頼→権限/見積/予算承認→実行/停止→実成果→保存→再起動→再開を実操作する。非金融Gameの保存/再開も独立確認。結果不明/重複/失効/切断/更新中断/復旧を故障注入する。
6. Web、QEMU実OS、Pixel実機、Provider sandbox、本番の証拠を分離。OS未起動ならWeb合格だけでOS利用可能と報告しない。source SHA/image hash/環境/結果をos-acceptance-reportへ記録する。
7. 契約・同一head CI・必要review・対象受入が揃ったPRを通常mergeし、main同一SHA CIを確認。force pushや履歴破壊をしない。GitHub保存と公開配備は別工程。
8. 配備は対象Site/版/権限/migration/rollbackを固定し、既存公開承認と条件を照合。実response・asset・認証付きreadbackをsourceへ対応付ける。実課金/契約/鍵生成/flashの条件を同時に解放しない。
9. 正本status/phaseGates/README/設計/workstreamを更新。統合PR/main SHA、同一候補の受入、互換/移行/復旧、実際に触れる入口、制限と再開手順を渡す。公開未達でも合格した範囲を具体的に報告する。

全体合格の単位は特定platform/版/用途。すべての機種や本番の完成を件数から宣言しない。利用者には今どこから何を使えるか、実際に起動したOS、残条件を先に示す。
