# Hub 認証後 QA — 最小手順（画面担当定義）

正本リポジトリ: `k999ln/rock`
対象 PR: #4 `codex/rockstaros-launch-candidate-20260910`
定義日: 2026-09-11（画面担当 rockstar_bot｜画面）
状態: **手順定義のみ。siteAuthenticatedQa = NOT_RUN**

## 禁止の言い換え
- `DEPLOYED_OWNER_ONLY` ≠ 使える
- ガイド/ローカル build QA PASS ≠ 本番認証後 Hub 操作 PASS
- 配信 sourceCommit と branch HEAD が異なれば、HEAD での合格を Sites 合格に流用しない

## 環境の分離（必須）
| envId | 意味 | 合格への使い方 |
| --- | --- | --- |
| `HOST_LOCAL` | ローカル dev / 本番相当 build の host | B02 改善測定や回帰の補助。ローンチ主張の代替にしない |
| `SITES_OWNER_ONLY` | 本人限定 Sites（現行証拠: `docs/evidence/launch/sites-owner-private-20260911.json`） | **siteAuthenticatedQa の唯一の合格環境** |

記録必須メタ: `url`, `projectId`, `deploymentId`/`versionId`, `deployedSourceCommit`, `branchHeadSha`, `testedAtUtc`, `tester`

現行 Sites URL（証拠上）: `https://rockstaros-kaiya.noellesugar1.chatgpt.site`
注意: その証拠の `sourceCommit` は `a750908…`。PR HEAD `fe81c05` と一致しない場合は QA 前に差分を記録し、必要なら再配信後に再試験。

## 合格証拠パス
| 用途 | パス |
| --- | --- |
| 手順（本定義のリポジトリ保存先案） | `docs/evidence/launch/hub-authenticated-qa-procedure.md` |
| 実行結果 JSON（1環境1ファイル） | `docs/evidence/launch/hub-authenticated-qa-<envId>-<YYYYMMDD>.json` |
| 画面証拠 | `docs/evidence/launch/hub-authenticated-qa-<envId>-<YYYYMMDD>/NN-<caseId>.png`（または webm） |
| Sites 配備メタ（既存） | `data/sites-transition-20260911.json` + `docs/evidence/launch/sites-owner-private-20260911.json` |

Release ゲート用フィールド（結果 JSON のトップ）:
- `siteAuthenticatedQa`: `NOT_RUN` | `PARTIAL` | `PASS` | `FAIL`
- `launchClaimAllowed`: 常に `false` until `siteAuthenticatedQa=PASS` **かつ** Release が別途許可
- `environment`: 上記 envId（Sites 合格時は必ず `SITES_OWNER_ONLY`）

## 最小ケース（必須）

### U — 未認証境界（Sites）
| id | 手順 | 合格 |
| --- | --- | --- |
| U1 | 未ログインで `/` | Hub カタログ表示。保存系データなし |
| U2 | 未ログインで `/work` `/activity` `/wallet` `/settings` | 各画面でサインイン導線（401/needsSignin）。本人記録は出ない |
| U3 | 未ログインのまま Wallet 文言 | 「実お金未接続／請求・送金しない」境界が見える（ログイン後も同旨） |

### E — 認証後・空 D1
| id | 手順 | 合格 |
| --- | --- | --- |
| E1 | ChatGPT サインイン → `/work` | 空状態（仕事なし）または同等。エラーで死なない |
| E2 | `/activity` | 「まだ実行はありません」系。legacy 空可 |
| E3 | `/settings` | ツール利用設定が読める。PC 接続記録は空でも可 |
| E4 | `/wallet` | 境界バナー + 手入力フォーム。売上連携を主張しない |

### H — Hub 実利用（最小1本）
| id | 手順 | 合格 |
| --- | --- | --- |
| H1 | Hub で ready ツール（推奨: 出典整理）を開きサンプル実行 | 結果が Dialog に出る。実行中は離脱抑制が働く |
| H2 | `/activity` に当該実行が残る | transport/状態が分かる。ホーム誘導と矛盾しない |
| H3 | （任意だが推奨）失敗/interrupted 相当、または検索0件空状態 | 空/失敗 UI が崩れない。未実施なら `SKIP` + 理由 |

### W — 仕事フロー（最小）
| id | 手順 | 合格 |
| --- | --- | --- |
| W1 | `/work` で仕事を1件作成 | 一覧に出る |
| W2 | 次手順を1回以上進める、またはサンプル非通過を確認 | `lib/workflow` 契約どおり。完了まで必須ではないが到達点を記録 |
| W3 | 再読込後も同じ仕事が見える | revision/ユーザー分離の破綻なし |

### S — 設定
| id | 手順 | 合格 |
| --- | --- | --- |
| S1 | ツール利用を一時停止→Hub/実行が拒否または案内 | 停止が効く |
| S2 | 利用を再開 | 再開できる |
| S3 | PC接続 Dialog を開く（実接続は任意） | Dialog 表示。実 MCP 接続成功は別項目 `PC_CONNECT`（未実施可） |

## siteAuthenticatedQa 判定
- `PASS`: 環境 `SITES_OWNER_ONLY` で U1–U3, E1–E4, H1–H2, W1–W3, S1–S2 がすべて PASS。スクリーンショットとメタ付き。
- `PARTIAL`: 一部 PASS、必須欠落あり。ローンチ主張不可。
- `FAIL`: 必須ケース失敗。
- `NOT_RUN`: 本定義どおり未実施（現状）。

## 画面担当の範囲
- 導線・空/未認証/失敗表示・操作手順・証拠パスを担当。
- 台帳意味変更・料金・署名・main merge・一般公開は触らない。
- UI バグ修正が必要なら画面側で対応し、Release はゲート判定のみ。