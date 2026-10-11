# O4 — Tool・MCP

[作業部屋一覧](../README.md) · [アイデア置き場](../IDEAS.md)

> 自動生成。編集元: data/mission-control.json、data/project-status.json、data/workspaces.json。

**目的:** Toolを審査、登録、接続、実行、停止、失効し、結果をReceiptで照合する。

**主担当:** ROCK / **評価対象:** 既存PC MCP・SDKの統合

## 触る場所・読む資料

- [lib/catalog.ts](../../lib/catalog.ts)
- [app/api/sky/](../../app/api/sky)
- [toolkits/](../../toolkits)
- [services/sky-agent-runtime/](../../services/sky-agent-runtime)
- [docs/sky-mcp-connector.md](../../docs/sky-mcp-connector.md)
- [docs/workstreams/02-sky-mcp.md](../../docs/workstreams/02-sky-mcp.md)
- [docs/sky-tools-complete-design.md](../../docs/sky-tools-complete-design.md)

## 次の作業

- **SKY07**: MCPごとにこのPC・Sky Cloud・提供者MCPの接続先を選び、対応先へワンタップ接続する — 詳細: `npm run work -- SKY07`

SKY07: PC・Sky Cloud・提供者MCPの対応先をmanifestで区別する

## 守る条件・残課題

- 作者署名を安全保証と呼ばない
- 実行先とscopeを表示する
- provider self-reportを成功証拠にしない
- 未解決: 全Provider sandbox/OAuth・失効の受入は未完了

## 未完了の作業

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| SKY07-01（子） | MCPごとのPC・Sky Cloud・提供者接続対応表をmanifestへ結ぶ | 未着手 / 共通基盤 | — |
| SKY07-02（子） | 接続先選択・未対応表示・ワンタップ初期化のUI契約を検証する | 未着手 / 共通基盤 | SKY07-01 |
| SKY07-03（子） | Passport・scope・一回承認と未信頼schemaの境界を検証する | 未着手 / 共通基盤 | SKY07-01 |
| SKY07-04（子） | 代表Provider sandboxで接続から実行receipt照合まで通す | 未着手 / 共通基盤 | SKY07-02 / SKY07-03 |
| SKY07-05（子） | sandboxでtimeout・失効・再接続・同一実行の再送を受入する | 未着手 / 共通基盤 | SKY07-04 |
| SKY07-06（子） | 対応先別の証拠・未対応範囲とSKY07全体受入を公開前に確定する | 未着手 / 共通基盤 | SKY07-05 |
| SKY20 | Sky公開・Telegram配布を証拠付きverified Packageへ限定し、失効と利用イベント再送を受け入れる | 進行中 / 共通基盤 | — |
| SKY07（親） | MCPごとにこのPC・Sky Cloud・提供者MCPの接続先を選び、対応先へワンタップ接続する | 進行中 / 共通基盤 | — |
| OS05 | 【Android/AOSP別トラック】第三者SDK・審査・インストール・失効の閉鎖テスト | 未着手 / 共通基盤 | OS04 |

<details>
<summary>完了記録のあるtask（当該範囲の記録。製品全体の完成ではありません）</summary>

| task | 作業 | 記録状態 / 分類 | 前提待ち・保留 |
| --- | --- | --- | --- |
| SKY02 | ToB向け簡易掲載フォーム・審査キューとToC向けSky Timelineを実装 | 完了記録あり / 共通基盤 | — |
| SKY03 | MCP接続・周辺先行技術を調査し、特許出願可能性を高める技術設計を保存 | 完了記録あり / 共通基盤 | — |
| SKY06 | Sky内MCPを実在するPC接続・既存4自動化・3ステップ導入画面へ統合 | 完了記録あり / 共通基盤 | — |
| SKY09 | Skyの商品カード1回でFashion Brand Ops MCPを初期化し、38操作と接続状態を同期 | 完了記録あり / 共通基盤 | — |
| SKY11 | MCP掲載前診断とPC接続の互換性・初回導線を改善 | 完了記録あり / 共通基盤 | — |
| SKY15 | Sky SDKコードを既存ツールへ追加し、起動時にPackage登録・MCP公開・利用記録まで行うStudioを実装 | 完了記録あり / 共通基盤 | — |

</details>

## 検証・引継ぎ

対象のtaskPlanにある合格条件と、関連workstreamの環境別試験を優先します。以下は入口となる確認コマンドです。

```sh
npm run sky:check
npm run mcp:package:check
npm run project:update
npm run mission:update
npm run verify
```

全体受入: 代表MCPをinitialize、権限差分、実行、結果照合、失効、再送までsandboxで完走する。

新しいチャットや担当へ渡すときは、次の一文へtask IDと今回の成果を入れます。

```text
O4 Tool・MCPの <task ID> を進める。workspaces/O4/README.mdと
npm run work -- <task ID> を読み、最新main・作業branch・未保存差分を確認する。
今回の成果は <一つの成果>。このtaskの範囲で作業し、前提・実行保留・本人承認を維持する。
終わりに変更path、検証結果、残課題、次の一手を残す。新しい思いつきは別に記録する。
```
