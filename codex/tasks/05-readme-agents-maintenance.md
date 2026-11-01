# 05 README / AGENTS / CHANGELOG の維持規則、商標確認

## 規則（AGENTS.md にも 3 行で入っている）
- README.md: 前半は構造図（mermaid）と「役割 → フォルダ」表、後半は製品ごとの説明（写真・設計・コードの場所・開発状況）。製品説明は消さない。日付ノートは CHANGELOG.md へ。
- AGENTS.md: 100 行以内。作業規則だけ。
- CHANGELOG.md: 先頭に追記。形式 `## YYYY-MM-DD` + 箇条書き（何を・どこを・PR #）。削除しない。
- docs/structure/: 設計の正本。変えるときは 07 に日付付きで決定を 1 行足してから本文を直す。

## やること（この task）
1. `scripts/check-readme-budget.mjs` を作り、README ≤600 行、AGENTS ≤100 行、CHANGELOG 先頭見出しが日付形式、を検査。`verify` ではなく `verify:design` に入れる。
2. README の mermaid 図が GitHub で描画されることを目視で確認（PR にスクリーンショット不要、確認した旨を本文に 1 行）。
3. **商標**: 「mii」は Nintendo of America の米国登録商標（Reg. 3451478, Class 9）。docs/structure/08-pdf-review.md §3 を読み、`docs/legal/trademark-mii.md` に (a) 類否の論点 (b) 日本・米国・EU での既存登録の一覧 (c) 代替表記案 3 つ、を調べて書く。**判断は本人**。公開物（サイト・PDF・CM）に mii を出す前に本人が弁理士確認を済ませる、を 07 に未決として残す。

## 合格条件
- check script が verify:design で通る。
- docs/legal/trademark-mii.md がある。
