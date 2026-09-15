# RockstarOS フロント機能性監査 — 2026-09-15

## 対象

Home、共通workspace shell、Developer Preview紹介、Rock Studioを対象に、主要routeへの到達、状態表示、端末内設定、keyboard操作、処理中の移動防止、mobile表示を確認した。金融処理、CSV変換、Tool SDKの業務契約は変更対象にしていない。

## 確認した問題と改善

| 問題 | 影響 | 改善 |
| --- | --- | --- |
| Homeから仕事とCSVへ直接進めない | OSの主要機能が別画面のsidebarを経由しないと見つからない | Homeへ仕事・CSVアプリを追加し、主要7機能を直接開けるようにした |
| Web画面に通信・Wi-Fi・電池の固定iconを表示 | 実際には取得していない端末状態と誤認する | `WEB / LOCAL`へ置換し、Web版と端末内設定の境界を明示した |
| `localStorage`書込み失敗を処理していない | private browsingや保存制限時にHomeが壊れ得る | 書込みを安全に失敗させ、既定値のまま操作を継続する |
| Home編集dialogの終了方法が弱い | keyboard利用時に閉じにくい | 初期focus、Escape、外側click、閉じるbuttonを揃えた |
| `/settings/system`や`/csv/terms`でsidebarの現在地が外れる | nested routeで利用者が現在地を見失う | route family単位の現在地判定へ変更した |
| 処理中のリンクが無反応に見える | 誤操作防止なのか故障なのか判別しにくい | `aria-busy`、`aria-disabled`、視覚的disabled状態を同期した |
| 狭い画面でHome appと共通headerが詰まる | label縮小と横overflowの原因になる | 3列mobile grid、13px以上のlabel、headerの省スペース規則を追加した |
| OS本体、紹介、Studioのchromeが別ブランドに見える | 製品内を移動した感覚が弱い | 黒、acid green、丸い主操作、共通focus ringへ統一した |

## 検証境界

- source契約試験は主要7 route、偽の端末telemetry除去、dialog操作、nested route、処理中状態を固定する。
- TypeScript、product lint、production build、全体`npm run verify`で回帰を確認する。
- 本監査はQEMU／Android実機の画素・touch・hardware受入ではない。Web／PWAフロントの改善として記録する。
