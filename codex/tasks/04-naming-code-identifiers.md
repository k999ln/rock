# 04 名前の統一（コード識別子）— Smith→Noa, Jennifer→AMC, avocado-mini→mii

前提: task 03 が main に入っていること。正本は docs/structure/06-naming.md。

## 範囲

| 旧 | 新 | 対象 |
| --- | --- | --- |
| `smith` / `Smith` を含む識別子 | `noa` / `Noa` | lib/eve-agent-proposal.ts, lib/os-navigation.ts 等（`rg -i smith lib app components` で列挙） |
| `jennifer-*.ts`（7ファイル）, `lib/jennifer-*`, `app/api/jennifer`, `data/jennifer-*.json`, `.codex/skills/jennifer-project-manager` | `lib/amc/` 配下へ移動し、`jennifer` を `amc` に改名。passkey はそのまま `lib/amc/passkey.ts` | API path `/api/jennifer/*` は**互換のため残し**、`/api/amc/*` へ 1世代の間 301 ではなく同一ハンドラを両方に張る |
| `avocado-mini` / `avocadoMini` ディレクトリ・識別子 | `mii` | systems/rock-star-os/targets/avocado-mini → targets/mii（シンボリックリンク不可。`git mv` ＋ import更新）。sites/avocado-mini は配信ドメインが avocadomini.si のため**今回は改名しない** |
| `zema-*.ts` | `eve-chat-*.ts`（zema-chat-session）, `work-*`（zema-private-storage, zema-local-agent → `work-private-storage`, `work-local-agent`） | sky-zema-handoff → sky-work-handoff |

## 手順（1つの旧名ごとに1PR）

1. `rg -l <旧名> --glob '!archive/**' --glob '!docs/evidence/**' --glob '!node_modules/**'` で全ファイルを出し、件数を PR 本文に書く。
2. `git mv` でファイルを移し、import を更新。旧名の export は `export { Noa as Smith }` のような型/値エイリアスで 1世代残し、`@deprecated` コメントを付ける。
3. tests/ の該当テストを同じPRで改名。
4. `npm run typecheck && npm run lint:product && npm test`。
5. data/design-document-index.json と data/repository-map.json の path を更新（`npm run repository:check`, `npm run design:check` が通ること）。

## 合格条件

- 3つのcheckが通る。
- `rg -i "smith|jennifer" lib app components tests --glob '!**/*deprecated*'` がエイリアス行とコメント以外ゼロ。
- 旧 API path へのリクエストが新ハンドラで同じ応答を返す（tests/ に1本追加）。

## やらないこと

- D1 の table/column 名の変更。
- `data/product-terminology.json` の変更（si 表記契約は別件）。
- sites/avocado-mini のディレクトリ改名（ドメインが決まるまで）。
