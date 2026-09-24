# avocadoMini / RockstarOS R5 — 統合基本設計

2026-09-24。使用時200mm以内・1本自律・同型mini増設・全空間裸眼表示を目指す、ハードウェアとOSの設計入口です。ゲームを主な入口に、制作・学習・限定した生活支援へ拡張します。

**製造承認は保留です。** 表示エンジン、精密3D入力、最終収納・熱・電源・専用NPU、確定回路・加工図は未決を含みます。本資料だけで加工・通電・光源実験・量産へ進めません。

## 一式を開く

- [閲覧用PDF — 51ページ](package/avocadoMini_RockstarOS_R5_Integrated_Design.pdf)
- [編集用Word](package/avocadoMini_RockstarOS_R5_Integrated_Design.docx)
- [全文Markdown](package/integrated_design.md)
- [設計書・図面・計算・参考資料のZIP](avocadoMini_R5_Integrated_Design_Package.zip)
- [設計検討図8点 — SVG/PNG](package/drawings/)
- [計算結果](package/calculation_results.json) / [再計算](package/verify_calculations.py)
- [参考資料索引](package/reference_index.json) / [資料別の根拠と限界](package/references/)
- [30分調査の報告](research/README.md) / [調査の監査記録](research/RESEARCH_AUDIT.md)
- [保存・検証記録](verification.json) / [原本のファイル照合表](package/package_manifest.json)

ZIPは前回渡した27ファイルの配布パッケージをそのまま保存しています。Gitで追加した調査報告・この入口・検証記録はZIPの外です。全体を取得する場合はこのディレクトリを取得してください。package内のREADMEにある「この作業ではGitHubを変更していない」は設計書作成時点の記録であり、その後の今回のGit保存とは別です。

## 収録範囲

| 分野 | 内容 |
| --- | --- |
| 製品要求 | 200mmの測り方、銀色円筒、1本自律、同型増設、ゲームから生活への展開 |
| ハードウェア | 候補型番、比較包絡、内蔵区画、カメラ視野・深度、電源・熱・通信・安定性の計算 |
| OSと操作 | 入力・ゲーム・表示の契約、日本語音声、起動・停止・復旧、複数台協調、権限と更新 |
| AIと作品 | Capability Adapter、本人承認、費用上限、結果不明照合、Asset Registry、権利と出所 |
| 試作と検証 | 組立・校正の段階、受入試験、未確定事項、製造リリースに必要な成果物 |

14件の自動チェックは算術・比較条件・判定フラグの検証です。実機試験は0件。全空間表示・ASR・ゲーム性能・光安全・製造可能性が合格した意味ではありません。

## 過去の資料と既存OSの扱い

- R5はこのタスクで利用者が指定した新しい製品要求です。E3の「4本＋別Edge Hub必須」を現行必須構成としません。
- 外部給電は必要で、電池は未採用。通信設備と外部演算Hubを混同しません。
- 以前の価格、実装候補、外形寸法、TV/ARへの表示をR5へ自動継承しません。P0.2・E1・E2・E3の資料と実験記録は削除しません。
- 既存の[Material Invention研究契約](../rockstaros-avocado-mini-complete-design.md)、[OS共通設計](../rockstaros-complete-design.md)、Pixel/QEMU/Walletの受入は独立です。R5のサービス名・API案を実装済みと扱いません。
- GitHub保存と公開商品サイトの配備は別です。サイト・OS image・外部AI・決済環境はこの保存作業で変更していません。

## 担当と次の作業

資料保存はMAT14（ROCK）。製品化はMAT15（JOINT）として、まず単体の表示方式・通常室内の成立範囲・安全条件と、精密3D入力・実部品収納の証拠を集めます。方式確定前に架空のpin表や加工図を完成扱いにしません。[担当分野](../workstreams/11-material-invention-avocado-mini.md)に判断境界を記録します。

確認コマンド（リポジトリ直下）：

```sh
python3 scripts/verify-avocado-r5-package.py
python3 docs/avocado-mini-r5/package/verify_calculations.py
npm run project:check
npm run baseline:check
npm run design:check
```
