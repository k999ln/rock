# docs/evidence — 実行証拠（歴史）

212 件・約 17MB の JSON。各 PR 時点の検証結果の生データ。**Codex は既定で読まない**（ルートの `.ignore` で rg/fd から外してある）。
参照している script / data（check-product-baseline, check-device-support, release-readiness, data/android-*.json 等）が約 220 箇所あるため、ファイルは動かしていない。履歴を調べるときは `rg --no-ignore` で読む。
整理の方針は codex/tasks/01-archive-evidence-workspaces.md。
