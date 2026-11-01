# 03 名前の統一（表示文字列・設計書）

正本: docs/structure/06-naming.md。この task は**表示文字列と Markdown だけ**を直す。コード識別子・API path・DB・enum・環境変数は触らない（それは task 04）。

## 置換規則

| 探す | 置き換え | 例外 |
| --- | --- | --- |
| `Smith` / `スミス` | `Noa` / `ノア` | 歴史的な節の見出しに「（旧Smith）」を1回だけ残す |
| `Jennifer` / `Jenniffer` / `ジェニファー`（ユーザー向け表示） | `Eve`（話しかける相手の意味）または `AMC`（統括・分解の意味） | docs/jennifer-coordination.md は task 04 で amc へ統合するまで残す |
| `Zema` / `ゼマ`（ユーザー向け表示） | `Eve`（会話）/ `仕事`（実行層） | lib/zema-* のコード名はそのまま |
| `avocadoMini` / `avocado mini` / `Mini`（製品名として） | `mii` | `Mini R5` のような設計世代表記は `mii R5` |
| `Rockstar OS` / `Rock star` | `RockstarOS` | package name `rock-star` はそのまま |
| `AI`（第一者の説明文） | `si` | 既存の 2026-10-13 表記契約を維持 |

## 対象

- app/**/*.tsx, components/**/*.tsx の JSX 文字列（`aria-label`, `title`, `<p>`, `alt`）
- sites/avocado-mini/src/** の表示文字列
- docs/**/*.md（ただし docs/evidence/ と archive/ は触らない）
- README.md, docs/structure/**

## 手順

1. `rg -n "Smith|Jennifer|Zema|avocadoMini|avocado mini|Rockstar OS" app components sites docs --glob '!docs/evidence/**' --glob '!archive/**'` で件数を出す。
2. 1ファイルずつ置換。文脈が「コードの識別子を説明している」行は変えない。
3. `npm run typecheck && npm run lint:product && npm test` を通す。
4. 変更ファイル数と残り（意図して残した箇所）を CHANGELOG.md に1行で書く。

## 合格条件

- `rg -n "Smith|Jennifer|avocadoMini" app components sites --glob '!**/*.test.*'` が、意図して残した行（コメント・互換説明）以外ゼロ。
- 画面の見た目・動作は変わらない（スナップショットテストがある場合は更新のみ）。

## やらないこと

- import名・関数名・ファイル名・URL・D1 table・JSON key の変更。
- 設計書の内容変更（名前の置換のみ）。
