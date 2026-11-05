# Codex タスク一覧（2026-11-02）

1 タスク = 1 ファイル = 1 PR。番号順が推奨順。各ファイルの「やらないこと」は守る。
終わったら CHANGELOG.md 先頭に 1 行、ここに ✅ と PR 番号。

## 00 番台: リポの整理（先にやる）

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 01 | [01-archive-evidence-workspaces.md](01-archive-evidence-workspaces.md) | docs/evidence・workspaces を archive へ、check script のパス修正 | |
| 02 | [02-verify-slim.md](02-verify-slim.md) | `verify` を typecheck+lint+product tests に、旧チェーンは `verify:full` | |
| 03 | [03-naming-display-strings.md](03-naming-display-strings.md) | Smith→Noa 等、表示文字列と md | |
| 04 | [04-naming-code-identifiers.md](04-naming-code-identifiers.md) | 識別子・ファイル名の改名 | |
| 05 | [05-readme-agents-maintenance.md](05-readme-agents-maintenance.md) | README/AGENTS/CHANGELOG の維持規則、商標確認 | |
| 06 | [06-drizzle-unify.md](06-drizzle-unify.md) | drizzle 3 ディレクトリを 1 本に | |
| 07 | [07-codex-bots-slim.md](07-codex-bots-slim.md) | .codex/agents の bot を役割に合わせ整理 | |
| 08 | [08-sky-lib-foldering.md](08-sky-lib-foldering.md) | lib/sky-*.ts 104 本を lib/sky/ 配下へ | |

## 10 番台: eSIM（配布できるもの）

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 10 | [10-esim-provider-research.md](10-esim-provider-research.md) | ARF 対応 MVNE 候補比較と RFQ 質問票 | |
| 11 | [11-esim-first-live.md](11-esim-first-live.md) | esim-go sandbox → Eve 起動 → account 束縛 → Stripe 月額 | |
| 12 | [12-android-carrier-client.md](12-android-carrier-client.md) | carrier privileges を使う Android client と Play 自動導入 | |
| 13 | [13-ios-universal-link.md](13-ios-universal-link.md) | iOS universal link 導入と PWA 起動 | |

## 20 番台: mii

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 20 | [20-mii-architecture-research.md](20-mii-architecture-research.md) | Tower/Hub/表示層の部品候補・工場・BOM の調査（価格は決めない） | |
| 21 | [21-mii-motion-parallax-prototype.md](21-mii-motion-parallax-prototype.md) | Gen1 試作: 1 プロジェクター＋1 壁＋頭追跡 | |
| 22 | [22-mii-hardware-profile.md](22-mii-hardware-profile.md) | targets/avocado-mini → targets/mii、4 筐体（column/puck/slot/**ceiling**）の profile 記述 | |
| 23 | [23-mii-v2-into-design.md](23-mii-v2-into-design.md) | V2 研究と第 1 形態（v2-study 20・37〜45）を設計書 V1 に反映。**本人承認後** | |

## 30 番台: RockstarOS 共通層

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 30 | [30-account-continuity.md](30-account-continuity.md) | 別端末で同じ Job / 会話を続ける契約とテスト | |
| 31 | [31-hardware-profiles.md](31-hardware-profiles.md) | phone / pro / pixel-native profile と Buildroot・Android 系の対応表 | |
| 32 | [32-service-template-first-three.md](32-service-template-first-three.md) | サービス書式で最初の 3 枚（ヨガ・工場保守・請求書） | |

## 40 番台: 統合

| # | ファイル | 一言 | 状態 |
| --- | --- | --- | --- |
| 40 | [40-jennifer-into-amc.md](40-jennifer-into-amc.md) | Jennifer のコード・docs・data を AMC へ統合 | |
