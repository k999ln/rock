# Motion Prompt（図解パック）の書き写し

- **元** https://github.com/showheyohtaki/motion-prompt （作者: 大滝昇平 / Shohei Ohtaki, @showheyohtaki）。見本: https://showheyohtaki.github.io/motion-prompt/#217
- **使った物** `packs/diagram/pack.js`（「資料で使う図解・グラフの名前」24 種類。#217〜240）と、`packs/diagram/meta.json` の図の名前。部品の出方「ぽよん」には、同じリポジトリの動きの数（#001 ポップインのばね・#011 スクワッシュ＆ストレッチ・#121 アンティシペーションの着地の揺れ。`packs/motion`・`packs/motion2` の `meta.json` の spec とコード）を使った。commit `683ecca`（2026-11 時点の main）。
- **許諾** MIT License (c) 2026 Shohei Ohtaki。全文はこのフォルダの `LICENSE`（書き写した物にも、この許諾と著作権の表示を付ける決まり）。
- **書き写した先** `lib/noah-pin-diagram.ts`（Noah のピンの図解。バージョン TAKE。仕様は `docs/noah/spec-115-pin-grid.md` の 9 章）。
- **変えた所** 図の中の仮の字（A・B・?・テーマ・結果・TAM など）を、その Agent の札の言葉に。作り話の数（72%・30%・10人中3人・100/58/27/9・帯の %・月の名前）は描かない。札を置くために一部の形を少し動かした（`lib/noah-pin-diagram.ts` の先頭と、各図の `// Noah:` の行に全部書いた）。部品の出方を可愛い動き「ぽよん」にした。色を、配色の黄金比 70:25:5（ベース・メイン・アクセント）の 3 色（赤・黄・青・白を中心にしたポップな 8 組）にし、塗りの面積が 70:25:5 に近くなるように図の形の大きさ・太さ・塗る所を変えた。1 周で消えて繰り返す代わりに、画面に入った時に 1 回組み上げて止める。
- **このフォルダのファイルは、ビルドにも実行にも使わない**（許諾の全文と出所の記録だけ）。
