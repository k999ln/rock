## 何をしたか

- Sheets「Noah 300人の利益試算」（revision 14）を `docs/noah/trial-300-profit.md` に写した。本人の依頼（2026-11-24）「これgitにあげて」「まず今の状態でgitあげて」。
- 数は、表の式を組み直した計算で出し、表の値 504 個と一致を確かめた（組み直しは k999ln/rock の `claude/ice2/handoff` の `tools/profit-model/model.py`）。
- `docs/noah/README.md` の 114 の行から辿れるようにした。CHANGELOG に 1 行。

## 中身の要点

- 今の実例の売上（月 39,500 円）では、1 人あたりの本人の分は月 14 円。600 円の天引きは始まらない。12 か月の会社の利益は −51,984 円（相談の 10 万円を含む）。
- 1 人 600 円には、月 約 44 万円の売上が要る。
- 天引きは外から入るお金を増やさない（いちばん多くても月 9,000 円）。定期便を始めると、会社の月の利益は 4〜6 分の 1 になる。

## 確かめ

- release・project・repository・design・version の check は、どれも 0 で終わる。
- 文書を読む試験 19 本のうち 17 本が通る。落ちる 2 本（`noah-page-consolidation`・`noah-trial`）は、main でも同じく落ちる（この checkout に `typescript` の package が無い）。

## 触っていない物

- コード・migration・公開は無し（docs だけ）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01JzDjJ2sHXBQS8oDJ7NBhAu
