# Codexへの依頼 — Columbia学生向け Sky NFCカードの入口を実装する

作成: 2026-10-12（ownerの指示「実装はcodexにやらせて」）。設計の正本は [docs/sky-nfc-columbia.md](../sky-nfc-columbia.md)。

## やること

`k999ln/rock` の最新 `main` から `codex/sky-nfc-columbia` を作り、設計書の §4 をすべて実装し、§7 の A1〜A7 と A9 を通して、PRを開く。mainへのmerge、本番への配備、カードの印刷・書き込みはしない。

最初に読むもの:

1. `AGENTS.md`（作業ルール。台帳の更新と検査の決まり）
2. `docs/sky-nfc-columbia.md`（この依頼の設計。ownerの決定は §1）
3. `docs/campus-layer.md` の「NFC / QR physical entry」と「Tag batch」、`app/t/[tagId]/route.ts`、`lib/campus.ts`、`lib/campus-store.ts`
4. `sites/avocado-mini/worker/index.js`（`avocadomini.si` のWorker）
5. 3つのTool: `lib/catalog.ts` の `mr-citations`・`rockstar-amc`・`rockstar-patent-assistant`、それぞれの画面（`components/mr-tool-runner.tsx` の citations、`components/amc-tool-runner.tsx`・`components/amc-workspace.tsx`、`components/patent-assistant-runner.tsx`）、`lib/patent-ai.ts`・`lib/research-ai.ts`・`private/prompts/patent-ai.json`

## 実装の範囲（設計書 §4）

1. **製品サイトの転送**: `avocadomini.si/t/<tagId>` → `${SKY_TAG_ORIGIN}/t/<tagId>`（302、クエリを保つ）。IDの形式外は404。`SKY_TAG_ORIGIN` 未設定なら「まだ使えません」の静的ページ。`sites/avocado-mini/tests/` に試験を足す。
2. **タグの行き先**: Campusタグの行き先の許可リストに `/sky/campus/<campusId>` を加える。任意URLは許さない。既存の `/campus` の動きは変えない。
3. **書き出し**: batchの tag ID・NFC用URL（`https://avocadomini.si/t/<id>`）・QR用URL（同じURL＋`?source=qr`）をCSVで出す。QR画像（SVG）も作れるようにする。外部サービスに送らない。
4. **英語の入口 `/sky/campus/columbia`**: 見出し「Sky for Columbia students」、3つのToolのカード（できること・費用・データの処理場所）、サインイン導線、プライバシー説明。`lang="en"`。各Toolへ `?lang=en&entry=columbia-card` で移る。大学名などの表示は設定1か所にまとめる（設計書 §8）。サインインしなくても入口と各Toolの説明が読めること。
5. **3つのToolの英語版**（`lang=en` のときだけ。日本語版は変えない）:
   - 出典整理: 画面・エラー・出力見出し（`## Sources`）を英語に。
   - AMC: 画面とテンプレートの文言を英語に。
   - 特許アシスタント: 画面と下書きのひな形を英語に。米国の案内（USPTO Patent Public Search、仮出願、要約150語以内など）を加える。Columbiaの知的財産の注意（設計書 §4.4 の要旨）を表示する。si調査の公式情報源に `uspto.gov` を加える。
6. **si調査を止める**: `entry=columbia-card` で開いた特許アシスタントでは、si調査を画面に出さず、APIも断る。APIは画面の表示に頼らずに判定する。他の入口からの利用は変えない。

## 守ること

- カードやURLに個人情報・利用権・鍵を入れない。匿名集計の項目（tag ID・source・時刻）を増やさない。
- 既存の料金の保留、承認、本人確認、Campusのowner境界を弱めない。
- 英語版に日本語の文字列を残さない（試験で確かめる）。
- 新しいtaskを `data/project-status.json` に足し（例: `CAMPUS02`。依存は `CAMPUS01`）、`project.md`・AMCの割当・必要なら `data/design-document-index.json` を更新して、`npm run project:update`・`npm run mission:update` を実行する。
- 統合で文書や台帳が競合したら、片側の内容で丸ごと解決しない（AGENTS.mdの規則）。

## 完了の条件（設計書 §7）

- A1〜A7 の試験が通る。
- `npm ci --prefix sites/avocado-mini` のあと `npm run verify` が通る。この作業と関係ない環境依存の失敗があれば、clean mainでも同じかを確かめて記録する。
- PRの説明に、実装した範囲、試験の結果、A8（実物のカードでの確認）が未実施であること、設計書 §8 の未決事項を書く。
