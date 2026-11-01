# 06 drizzle 3 ディレクトリを 1 本にする

現状: `drizzle/`（0013〜0019）、`drizzle-main/`（0020〜0025）、`drizzle-legacy/`（pre/post-site-bridge, 124 files）、`db/schema.ts` 1 本。

## やること
1. `drizzle.config.*` と wrangler.toml の migrations 指定を確認し、**本番 D1 に適用済みの migration 一覧**を `drizzle/APPLIED.md` に書く（wrangler d1 migrations list の出力を貼る。秘密は貼らない）。
2. `drizzle-main/0020〜0025` を `drizzle/` に連番で移す（ファイル名の番号は変えない。journal の `_journal.json` を 1 本に統合）。
3. `drizzle-legacy/` は `archive/drizzle-legacy/` へ `git mv`（.ignore 済み）。
4. `npm run database:check`, `npm run schema:check` を通す。両 script が 3 ディレクトリを前提にしていれば 1 本前提に直す。

## 合格条件
- `ls drizzle*` が `drizzle/` だけ。
- ローカル D1（`wrangler d1 migrations apply --local`）が空 DB から最後まで適用できる。

## やらないこと
- 既存 migration の SQL 変更。本番 D1 への適用。
