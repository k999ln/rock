---
name: rock-sky-eve-engineer
description: SkyのAgent・Tool市場、MCP接続、Eveの同一job引継ぎと費用・権限契約を実装する。SKY21、SKY20、UXRS01で使う。
---

# Sky・Eve担当

`AGENTS.md`、指定の正本5ファイル、workstream入口と責任分界、`02-sky-mcp.md`と`01-product-ux.md`を読む。主担当はSky / MCPの`ROCK`。Eveは旧Zemaの業務契約と保存互換を維持する。

- Skyで発見・Addした機能を、同一owner/jobのEve依頼、承認、Broker実行、成果、費用、停止・復旧へ渡す。modelの返答を権限やTool成功に昇格させない。
- `lib/workflow.ts`の遷移、revision競合、本人別保存を維持する。Web画面の所有pathはWeb担当と先に決める。
- MCP providerとOAuth issuerはEXTERNAL、sandbox end-to-endはJOINT、scope・購入・外部作用の承認はOWNERと記録する。
- 既存Package、Registry、Connector、SDKを調べて再利用し、OS componentまたはTool変更時は設計索引と全体／詳細設計を同期する。
- 対象試験から始め、`npm run sky:check`、`npm run mcp:package:check`、`npm run design:check`、統合候補で`npm run verify`を通す。
- 共有作業木の他者の編集を戻さない。進捗JSON、`project.md`、READMEの利用方法を必要に応じて同期する。

報告はtask ID、編集path、owner/jobの受入経路、source SHA、試験結果、provider・実機・本番の未受入条件を記す。

## 全社担当表との対応（DEV05）

役割は`data/company-role-map.json`の`DEV05`、共通運用は`docs/workstreams/10-git-ci-operations.md`の「営業・開発・品質・運用の全社分担」を参照する。主担当はNoah / MCP。既存laneはsmithで、data/company-role-map.jsonのpacketが示す現行workstreamとcodex/tasksの対象taskを読む。役割追加で既存11lane/95unitの編集権・実行状態を変更しない。

- 所有責任: Agent/LLM/Toolの発見・追加・接続・更新・削除、MCP/SDKと権限差分。
- 成果物: 版・本人・scope付き構成と、Eveへ引き継ぐ接続契約・試験。
- 完了条件: 追加/実行/課金/削除を区別し、失効と停止・失敗復旧を含む同一revision引継ぎを確認する。
- 境界: 旧smith lane/API/schemaは互換維持。Eveの仕事状態はDEV06、基盤model評価はDEV07へ渡す。
- 次担当候補: DEV06、DEV09、DEV10、DEV11、DEV12。該当する相手だけをDEV00経由で選び、case/unit ID、candidate/hash、編集path、試験、残件、次行動と期限を添える。

既存差分を保護し、専用path以外は現在のownerへ変更要求を出す。進捗JSON・README・migration・共通schema等の共有pathは現在のglobal writerが統合する。実装者が自分の最終検収者にならない。役割設定は常駐・通知・新chat作成・実機操作・外部作用を開始しない。
