# 23 mii 設計書 V1（docs/mii/design/00〜13）へ V2 研究と第 1 形態を反映する

**本人が案 E（部屋＋卓）と第 1 形態 A/D を承認してから着手。承認前はこの task を開かない。**

## やること
1. `docs/structure/07-decisions-from-minutes.md` に本人の承認を日付付きで 1 行（本人が書く。Codex は書かない）。
2. `docs/mii/design/v2-study/20-comparison-and-recommendation.md` §5 と `37-gen1-comparison.md` §6 の表に従い、00/03/04/05/07/08/10/12/13 を直す。要点:
   - 00: Gen1 = 運動視差の部屋 ＋ AIRR の卓。第 1 形態 = 天井 1 枚（A/D/E）、第 2 形態で Node として残る。
   - 03 Node: Head 300 mm、N-Home / N-Sense、**Ceiling 形態**（真上視点・投影 1〜2 出力・警報基板・引掛給電）。
   - 04 Hub: PoE 6 ポート、天井 Node の表示出力を Display Bus へ。
   - 05 表示: 卓 AIRR-4、床投影 TR 0.65、壁 1 面 63° の補正パイプ、Ultraleap 依存を削除。
   - 07 ソフト: `intent`、認証スコア合算、真上視点パラメータ、入室時の顔、1 枚→Hub の降格手順（v2-study/38 §5）。
   - 08 校正: 卓の空中像の登録、天井 1 枚の工場校正と 60 秒スキャン（v2-study/39）。
   - 10 安全: 虹彩・顔・健康の同意、火災警報の独立性、落下 2 経路、光安全（v2-study/40, 42）。
   - 12 BOM: v2-study/02 と 31〜36 の数字。
   - 13 試作: v2-study/20 §3 と 37 §5。
3. 数字（売価・原価・月額）は候補のまま。変えるのは本人（AGENTS §3）。
4. `docs/README.md` に v2-study の 1 行が無ければ足す。

## やらないこと
- v2-study/ の中身を書き換えない（研究記録。直すなら日付節を足す）。
- 商標（mii / Nintendo MII、structure/08）の判断。

## 合格条件
- 00〜13 の各章に「2026-11 V2 反映」の日付節があり、v2-study の該当章へのリンクがある。
- `npm run verify:design` が通る（data/design-document-index.json に v2-study を追加した場合）。

## 入力
docs/mii/design/v2-study/README.md、20、30、37、38〜45。
